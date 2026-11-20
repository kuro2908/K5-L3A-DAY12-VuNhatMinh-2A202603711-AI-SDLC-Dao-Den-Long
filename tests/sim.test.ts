import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHeadless } from "../src/sim/run";
import { TUNING } from "../src/sim/sim";

type Row = Record<string, any>;
const parse = (lines: string[]): Row[] => lines.map((l) => JSON.parse(l));
const events = (rows: Row[], name: string) => rows.filter((r) => r.type === "event" && r.name === name);
const quiet = { random_motes: false, random_shades: false };
const run = (o: { ticks: number; scenario?: object; inputs?: object; seed?: number; every?: number }) =>
  parse(runHeadless({ seed: o.seed ?? 1, ticks: o.ticks, snapshotEvery: o.every ?? 10, scenario: { ...quiet, ...o.scenario }, inputs: o.inputs }).lines);
const lastSnap = (rows: Row[]) => [...rows].reverse().find((r) => r.type === "snapshot")!;

describe("tick model & movement", () => {
  it("snapshot tick 0 is pre-input; N ticks = N steps; end line is last", () => {
    const rows = run({ ticks: 60, inputs: { frames: [{ tick: 0, move: [0, 1] }] } });
    expect(rows[0]).toMatchObject({ type: "snapshot", tick: 0, time_left_s: 300 });
    expect(rows[0].player.pos).toEqual([0, 0, 0]);
    const end = rows[rows.length - 1];
    expect(end).toMatchObject({ type: "end", ticks: 60, state: "playing" });
    const s60 = rows.find((r) => r.type === "snapshot" && r.tick === 60)!;
    expect(s60.player.pos[2]).toBeCloseTo(TUNING.player_speed, 2); // 60 steps = 1 s
    expect(s60.time_left_s).toBe(299);
  });
  it("camera yaw rotates movement; diagonal is normalized", () => {
    const yaw = run({ ticks: 60, inputs: { frames: [{ tick: 0, move: [0, 1], cam_yaw_deg: 90 }] } });
    const p = lastSnap(yaw).player.pos;
    expect(p[0]).toBeCloseTo(TUNING.player_speed, 2);
    expect(p[2]).toBeCloseTo(0, 2);
    const diag = run({ ticks: 60, inputs: { frames: [{ tick: 0, move: [1, 1] }] } });
    const d = lastSnap(diag).player.pos;
    expect(Math.hypot(d[0], d[2])).toBeCloseTo(TUNING.player_speed, 2);
  });
  it("omitted frame fields keep previous value", () => {
    const rows = run({ ticks: 120, inputs: { frames: [{ tick: 0, move: [0, 1] }, { tick: 60, cam_yaw_deg: 90 }] } });
    const p = lastSnap(rows).player.pos;
    expect(p[0]).toBeCloseTo(TUNING.player_speed, 1); // second second heads +X, still moving
    expect(p[2]).toBeCloseTo(TUNING.player_speed, 1);
  });
});

describe("motes and lanterns", () => {
  it("picks up a mote within radius, emits event, scores, respects capacity", () => {
    const rows = run({ ticks: 5, every: 1, scenario: { motes: [[0, 0, 1.5], [0, 0, 1.51]] } });
    expect(events(rows, "mote_picked").map((e) => e.data.carried)).toEqual([1]);
    expect(lastSnap(rows).score).toBe(TUNING.score.per_mote);
    const full = run({ ticks: 5, scenario: { player: { carried: TUNING.carry_capacity }, motes: [[0, 0, 1]] } });
    expect(events(full, "mote_picked")).toHaveLength(0);
  });
  it("deposit then light a lantern; winning when all lit", () => {
    const sc = { player: { pos: [0, 0, 0], carried: TUNING.lantern_cost }, lanterns: [{ id: "L1", pos: [0, 0, 3] }, ...["L2", "L3", "L4", "L5"].map((id) => ({ id, lit: true }))] };
    const inputs = { frames: [{ tick: 0, interact: true }] };
    const rows = run({ ticks: 10, scenario: sc, inputs });
    expect(events(rows, "deposit")[0].data).toEqual({ lantern_id: "L1", amount: 6, deposited: 6 });
    expect(events(rows, "lantern_lit")[0].data).toEqual({ lantern_id: "L1" });
    expect(events(rows, "game_over")[0].data).toEqual({ result: "won", reason: "all_lit" });
    const end = rows[rows.length - 1];
    expect(end.state).toBe("won");
    // scenario-lit lanterns give no points; only L1 (200) + time + flames bonus
    const t = TUNING.score;
    expect(end.score).toBe(t.per_lantern + Math.floor((300 * 60 - 1) / 60) * t.per_second_left + TUNING.flames * t.per_flame_left);
  });
  it("out of interact radius does nothing; partial deposits accumulate", () => {
    const far = run({ ticks: 5, scenario: { player: { carried: 3 }, lanterns: [{ id: "L1", pos: [0, 0, 3.01] }] }, inputs: { frames: [{ tick: 0, interact: true }] } });
    expect(events(far, "deposit")).toHaveLength(0);
    const part = run({ ticks: 5, scenario: { player: { carried: 3 }, lanterns: [{ id: "L1", pos: [0, 0, 3] }] }, inputs: { frames: [{ tick: 0, interact: true }] } });
    expect(events(part, "deposit")[0].data).toMatchObject({ amount: 3, deposited: 3 });
    expect(events(part, "lantern_lit")).toHaveLength(0);
  });
  it("interact triggers only on false->true edge", () => {
    const sc = { player: { carried: 6 }, lanterns: [{ id: "L1", pos: [0, 0, 3], deposited: 0 }] };
    const rows = run({ ticks: 30, scenario: sc, inputs: { frames: [{ tick: 0, interact: true }] } });
    expect(events(rows, "deposit")).toHaveLength(1);
  });
});

describe("shades", () => {
  it("chases the player and hits: flame lost, half the carried motes dropped, i-frames", () => {
    const sc = { player: { carried: 4, flames: 3 }, shades: [{ id: "S1", pos: [3, 1, 0] }] };
    const rows = run({ ticks: 120, scenario: sc });
    const hits = events(rows, "player_hit");
    expect(hits).toHaveLength(1); // 1.5 s of invulnerability covers the rest of the 2 s? second hit at 90 ticks
    expect(hits[0].data).toEqual({ by: "shade", flames: 2, dropped: 2 });
    expect(lastSnap(rows).player.carried).toBeLessThanOrEqual(2);
  });
  it("second hit only after invulnerability ends", () => {
    const sc = { player: { flames: 3 }, shades: [{ pos: [1, 1, 0] }] };
    const rows = run({ ticks: 200, scenario: sc });
    const hits = events(rows, "player_hit");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[1].tick - hits[0].tick).toBeGreaterThanOrEqual(Math.round(TUNING.invuln_s * 60));
  });
  it("lose when flames reach 0", () => {
    const rows = run({ ticks: 600, scenario: { player: { flames: 1 }, shades: [{ pos: [1, 1, 0] }] } });
    expect(events(rows, "game_over")[0].data).toEqual({ result: "lost", reason: "no_flames" });
    expect(rows[rows.length - 1].state).toBe("lost");
  });
  it("cannot enter the safe radius of a lit lantern", () => {
    const sc = { player: { pos: [0, 0, 0] }, lanterns: [{ id: "L1", pos: [0, 0, 0], lit: true }], shades: [{ pos: [20, 1, 0] }] };
    const rows = run({ ticks: 600, scenario: sc, every: 1 });
    for (const r of rows.filter((x) => x.type === "snapshot")) {
      const [x, , z] = r.shades[0].pos;
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(TUNING.safe_radius - 1e-3);
    }
    expect(events(rows, "player_hit")).toHaveLength(0);
  });
  it("time runs out -> lost by dawn", () => {
    const rows = run({ ticks: 1000, scenario: { time_left_s: 2 } });
    expect(events(rows, "game_over")[0].data).toEqual({ result: "lost", reason: "dawn" });
    expect(rows[rows.length - 1]).toMatchObject({ type: "end", ticks: 120, state: "lost" });
  });
});

describe("pulse", () => {
  const pulse = { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }] };
  it("stuns shades in radius, pushes them, costs light, scores, applies cooldown", () => {
    const sc = { player: { carried: 3 }, shades: [{ id: "S1", pos: [5, 1, 0] }, { id: "S2", pos: [20, 1, 0] }] };
    const rows = run({ ticks: 2, scenario: sc, inputs: pulse, every: 1 });
    expect(events(rows, "pulse")[0].data).toEqual({ stunned_ids: ["S1"] });
    const s = rows.find((r) => r.type === "snapshot" && r.tick === 1)!;
    expect(s.shades[0]).toMatchObject({ id: "S1", state: "stunned" });
    expect(s.shades[0].pos[0]).toBeCloseTo(5 + TUNING.pulse_push_m, 2);
    expect(s.player.carried).toBe(3 - TUNING.pulse_cost);
    expect(s.score).toBe(TUNING.score.per_stun);
    const again = run({ ticks: 20, scenario: { player: { carried: 6 } }, inputs: { frames: [{ tick: 0, pulse: true }, { tick: 1, pulse: false }, { tick: 2, pulse: true }] } });
    expect(events(again, "pulse")).toHaveLength(1); // second press is inside the cooldown
  });
  it("needs enough carried light", () => {
    const rows = run({ ticks: 5, scenario: { player: { carried: TUNING.pulse_cost - 1 } }, inputs: pulse });
    expect(events(rows, "pulse")).toHaveLength(0);
  });
  it("stun wears off after pulse_stun_s", () => {
    const sc = { player: { carried: 3 }, shades: [{ id: "S1", pos: [6, 1, 0] }] };
    const rows = run({ ticks: 200, scenario: sc, inputs: pulse, every: 1 });
    const stunnedTicks = rows.filter((r) => r.type === "snapshot" && r.shades?.[0]?.state === "stunned").length;
    expect(stunnedTicks).toBe(Math.round(TUNING.pulse_stun_s * 60));
  });
});

describe("random spawns & determinism", () => {
  const base = { seed: 42, ticks: 3000, scenario: {} };
  it("random motes/shades appear with events, same seed -> identical output", () => {
    const a = runHeadless(base).lines, b = runHeadless(base).lines;
    expect(a).toEqual(b);
    expect(events(parse(a), "shade_spawned").length).toBeGreaterThan(0);
    expect(parse(a)[0].motes_active).toBeGreaterThan(0);
  });
  it("different seed -> different world", () => {
    expect(runHeadless({ ...base, seed: 43 }).lines).not.toEqual(runHeadless(base).lines);
  });
  it("random_* false => nothing spawns", () => {
    const rows = run({ ticks: 3000 });
    expect(rows[0].motes_active).toBe(0);
    expect(events(rows, "shade_spawned")).toHaveLength(0);
  });
});

describe("CLI contract", () => {
  const dir = mkdtempSync(join(tmpdir(), "ddl-"));
  const cli = (...a: string[]) => spawnSync("npx", ["tsx", "src/headless/cli.ts", ...a], { encoding: "utf8", shell: true });
  it("two runs produce byte-identical files; exit 0", () => {
    const o1 = join(dir, "a.jsonl"), o2 = join(dir, "b.jsonl");
    const args = ["--seed", "7", "--night", "1", "--ticks", "1500"];
    expect(cli(...args, "--out", o1).status).toBe(0);
    expect(cli(...args, "--out", o2).status).toBe(0);
    expect(readFileSync(o1, "utf8")).toBe(readFileSync(o2, "utf8"));
    expect(readFileSync(o1, "utf8").trim().split("\n").pop()).toContain('"type":"end"');
  }, 30000);
  it("malformed inputs/scenario -> exit 2 with stderr", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ frames: [{ tick: 5 }, { tick: 5 }] }));
    const r = cli("--seed", "1", "--night", "1", "--ticks", "10", "--inputs", bad, "--out", join(dir, "x.jsonl"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("error");
    writeFileSync(bad, "{not json");
    expect(cli("--seed", "1", "--night", "1", "--ticks", "10", "--scenario", bad, "--out", join(dir, "x.jsonl")).status).toBe(2);
  }, 30000);
  it("bad arguments -> non-zero exit", () => {
    expect(cli("--night", "1", "--ticks", "10", "--out", join(dir, "x.jsonl")).status).not.toBe(0);
  }, 30000);
});
