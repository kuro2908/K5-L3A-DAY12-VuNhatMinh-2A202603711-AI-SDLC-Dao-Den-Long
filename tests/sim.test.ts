import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHeadless } from "../src/sim/run";
import { Sim, TUNING } from "../src/sim/sim";

type Row = Record<string, any>;
const parse = (lines: string[]): Row[] => lines.map((l) => JSON.parse(l));
const events = (rows: Row[], name: string) => rows.filter((r) => r.type === "event" && r.name === name);
const snaps = (rows: Row[]) => rows.filter((r) => r.type === "snapshot");
const snapAt = (rows: Row[], tick: number) => snaps(rows).find((r) => r.tick === tick)!;
const last = (rows: Row[]) => snaps(rows)[snaps(rows).length - 1];
const quiet = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [] };
interface RunOpts { ticks: number; night?: 1 | 2 | 3; scenario?: object; inputs?: object[]; seed?: number; every?: number; raw?: boolean }
const run = (o: RunOpts) => parse(runHeadless({
  seed: o.seed ?? 1, ticks: o.ticks, night: o.night ?? 1, snapshotEvery: o.every ?? 1,
  scenario: o.raw ? o.scenario : { ...quiet, ...o.scenario }, inputs: o.inputs ? { frames: o.inputs } : undefined,
}).lines);
const press = (tick: number, key: string) => [{ tick, [key]: true }, { tick: tick + 1, [key]: false }];
const walk = (move: [number, number], extra = {}) => [{ tick: 0, move, ...extra }];
const L = (id: string, extra = {}) => ({ id, ...extra });

describe("tick model & movement", () => {
  it("snapshot 0 is pre-input; N ticks = N steps; night_start; end line is last", () => {
    const rows = run({ ticks: 60, inputs: walk([0, 1]) });
    expect(rows[0]).toMatchObject({ type: "snapshot", tick: 0, sim_tick: 0, night: 1, state: "playing", time_left_s: 240 }); // Ticket-03: Night 1 lasts 240 s (was 300)
    expect(rows[1]).toMatchObject({ type: "event", name: "night_start", data: { night: 1 } });
    expect(rows[0].player.pos).toEqual([0, 0, 0]);
    expect(rows[rows.length - 1]).toMatchObject({ type: "end", ticks: 60, state: "playing" });
    expect(snapAt(rows, 60).time_left_s).toBe(239);
  });
  it("accelerates to 6 m/s within 0.1 s (6 ticks) and stops within 0.1 s", () => {
    const rows = run({ ticks: 80, inputs: [{ tick: 0, move: [0, 1] }, { tick: 60, move: [0, 0] }] });
    expect(snapAt(rows, 5).player.vel[2]).toBeLessThan(6);
    expect(snapAt(rows, 6).player.vel[2]).toBeCloseTo(6, 3);
    expect(snapAt(rows, 60).player.pos[2]).toBeCloseTo((21 + 6 * 54) / 60, 2);
    expect(snapAt(rows, 66).player.vel[2]).toBeCloseTo(0, 3);
  });
  it("camera yaw rotates movement; diagonal input is normalized", () => {
    const yaw = run({ ticks: 60, inputs: walk([0, 1], { cam_yaw_deg: 90 }) });
    expect(last(yaw).player.pos[0]).toBeGreaterThan(5.5);
    expect(Math.abs(last(yaw).player.pos[2])).toBeLessThan(0.01);
    const d = last(run({ ticks: 60, inputs: walk([1, 1]) })).player;
    expect(Math.hypot(d.vel[0], d.vel[2])).toBeCloseTo(6, 2); // snapshot rounds to 3 decimals
  });
  it("jump: only from the ground, 7 m/s, gravity 20 -> apex ~1.2 m, lands again", () => {
    const rows = run({ ticks: 100, inputs: [...press(0, "jump"), ...press(10, "jump")] });
    const apex = Math.max(...snaps(rows).map((s) => s.player.pos[1]));
    expect(apex).toBeGreaterThan(1.1); expect(apex).toBeLessThan(1.3); // second press in the air is ignored
    expect(snapAt(rows, 5).player.grounded).toBe(false);
    expect(last(rows).player).toMatchObject({ grounded: true, pos: [0, 0, 0] });
  });
  it("dash: 14 m/s for 0.2 s, 1.5 s cooldown from its start, keeps altitude in the air, event", () => {
    const rows = run({ ticks: 40, inputs: [{ tick: 0, move: [0, 1] }, ...press(10, "dash")] });
    expect(events(rows, "dash")).toHaveLength(1);
    expect(snapAt(rows, 11).player.vel[2]).toBeCloseTo(14, 3);
    expect(snapAt(rows, 11).player.dash_cd_s).toBeCloseTo(1.5, 2); // cooldown counts from the dash start
    const dist = snapAt(rows, 23).player.pos[2] - snapAt(rows, 10).player.pos[2];
    expect(dist).toBeGreaterThan(2.8); expect(dist).toBeLessThan(4);
    const again = run({ ticks: 120, inputs: [...press(0, "dash"), ...press(30, "dash"), ...press(95, "dash")] });
    expect(events(again, "dash").map((e) => e.tick)).toEqual([1, 96]);
  });
  it("dash in the air keeps altitude", () => {
    const rows = run({ ticks: 20, inputs: [{ tick: 0, jump: true, move: [0, 1] }, { tick: 1, jump: false }, ...press(8, "dash")] });
    const ys = [9, 10, 11, 12, 13, 14].map((t) => snapAt(rows, t).player.pos[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6);
  });
  it("falling off the island: exactly one hit, loses all motes, 60 ticks wait, respawn at start with invuln", () => {
    const sc = { player: { pos: [0, 0, 39.5], carried: 7, flames: 3 } };
    const rows = run({ ticks: 200, scenario: sc, inputs: walk([0, 1]) });
    const hits = events(rows, "player_hit");
    expect(hits).toHaveLength(1);
    expect(hits[0].data).toEqual({ by: "fall", flames: 2, dropped: 0, lost: 7 });
    const t0 = hits[0].tick;
    expect(snapAt(rows, t0 + 59).player.pos[1]).toBeLessThan(-9);
    const back = snapAt(rows, t0 + 60).player;
    expect(back.pos[0]).toBe(0); expect(back.pos[2]).toBeLessThan(1); expect(back).toMatchObject({ carried: 0, invuln: true });
  });
  it("falling with the last flame ends the game immediately (no respawn)", () => {
    const rows = run({ ticks: 300, scenario: { player: { pos: [0, 0, 39.5], flames: 1 } }, inputs: walk([0, 1]) });
    expect(events(rows, "game_over")[0].data).toEqual({ result: "lost", reason: "no_flames" });
  });
});

describe("motes", () => {
  it("auto-pick within 1.0 m XZ and 1.5 m height; capacity 10", () => {
    const rows = run({ ticks: 3, scenario: { motes: [[0, 0, 1.0], [0, 0, 1.01], [0, 1.6, 0.5], [0, 1.4, 0.5]] } });
    expect(events(rows, "mote_picked").map((e) => e.data.carried)).toEqual([1, 2]);
    const full = run({ ticks: 3, scenario: { player: { carried: 10 }, motes: [[0, 0, 0.5]] } });
    expect(events(full, "mote_picked")).toHaveLength(0);
  });
  it("20 random motes at 20 distinct points; +1 at ticks 240, 480... up to 30", () => {
    const rows = run({ ticks: 500, scenario: { random_motes: true, motes: undefined }, seed: 5, every: 10 });
    const m0 = rows[0].motes;
    expect(m0).toHaveLength(20);
    expect(new Set(m0.map((m: Row) => m.pos.join())).size).toBe(20);
    expect(snapAt(rows, 230).motes_active).toBe(20);
    expect(snapAt(rows, 240).motes_active).toBe(21);
    expect(snapAt(rows, 480).motes_active).toBe(22);
  });
});

describe("lanterns", () => {
  const cost = TUNING.lantern_cost;
  it("cost 10, repeated deposits remembered, +5/mote +100/first light (Ticket-03 scoring), radius 2.0", () => {
    const sc = { player: { carried: 6 }, lanterns: [L("L1", { pos: [0, 0, 2] })] };
    const rows = run({ ticks: 10, scenario: sc, inputs: press(0, "interact") });
    expect(events(rows, "deposit")[0].data).toEqual({ lantern_id: "L1", amount: 6, deposited: 6 });
    const sc2 = { player: { carried: 6 }, lanterns: [L("L1", { pos: [0, 0, 2], deposited: 6 })] };
    const rows2 = run({ ticks: 10, scenario: sc2, inputs: press(0, "interact") });
    expect(events(rows2, "deposit")[0].data).toEqual({ lantern_id: "L1", amount: 4, deposited: 10 });
    expect(events(rows2, "lantern_lit")[0].data).toEqual({ lantern_id: "L1", relight: false });
    expect(last(rows2).score).toBe(4 * 5 + 100);
    expect(last(rows2).player.carried).toBe(2);
    const far = run({ ticks: 5, scenario: { player: { carried: 6 }, lanterns: [L("L1", { pos: [0, 0, 2.01] })] }, inputs: press(0, "interact") });
    expect(events(far, "deposit")).toHaveLength(0);
    expect(cost).toBe(10);
  });
  it("nearest lantern wins; tie -> smaller id (a farther, full lantern never wins)", () => {
    const sc = { player: { carried: 3 }, lanterns: [L("L2", { pos: [0, 0, 1] }), L("L1", { pos: [1, 0, 0] }), L("L3", { pos: [0, 0, 1.5], lit: true }), L("L4", { pos: [0, 0, 50] }), L("L5", { pos: [0, 0, 60] })] };
    const rows = run({ ticks: 5, scenario: sc, inputs: press(0, "interact") });
    expect(events(rows, "deposit")[0].data.lantern_id).toBe("L1");
  });
  it("interaction only on false->true edge", () => {
    const rows = run({ ticks: 30, scenario: { player: { carried: 9 }, lanterns: [L("L1", { pos: [0, 0, 1] })] }, inputs: [{ tick: 0, interact: true }] });
    expect(events(rows, "deposit")).toHaveLength(1);
  });
});

describe("shades", () => {
  it("detects at 12 m and gives up beyond 18 m; speed 4 m/s", () => {
    const rows = run({ ticks: 130, scenario: { shades: [{ id: "S1", pos: [12, 1, 0] }, { id: "S2", pos: [12.01, 1, 5] }] } });
    expect(snapAt(rows, 1).shades[0].state).toBe("chase");
    expect(snapAt(rows, 1).shades[1].state).toBe("wander");
    const d = (t: number) => Math.hypot(snapAt(rows, t).shades[0].pos[0], snapAt(rows, t).shades[0].pos[2]);
    expect(d(0) - d(30)).toBeCloseTo(2, 1);
    const far = run({ ticks: 3, scenario: { player: { pos: [0, 0, 0] }, shades: [{ id: "S1", pos: [18.5, 1, 0], state: "chase" }] } });
    expect(snapAt(far, 1).shades[0].state).toBe("wander");
  });
  it("hit: -1 flame, drops floor(carried/2) as dropped motes (ttl 480), 90 ticks invulnerable, shade recoils 2 m", () => {
    const rows = run({ ticks: 300, scenario: { player: { carried: 5 }, shades: [{ id: "S1", pos: [3, 1, 0] }] } });
    const hit = events(rows, "player_hit")[0];
    expect(hit.data).toEqual({ by: "shade", flames: 2, dropped: 2 });
    const s = snapAt(rows, hit.tick);
    expect(s.player.carried).toBe(3);
    const dropped = s.motes.filter((m: Row) => m.kind === "dropped");
    expect(dropped).toHaveLength(2);
    for (const m of dropped) { const r = Math.hypot(m.pos[0] - s.player.pos[0], m.pos[2] - s.player.pos[2]); expect(r).toBeGreaterThanOrEqual(1.5); expect(r).toBeLessThanOrEqual(2.5); }
    expect(dropped[0].ttl_s).toBeCloseTo(8, 1);
    expect(snapAt(rows, hit.tick + 1).shades[0].state).toBe("recoil");
    expect(snapAt(rows, hit.tick + 60).shades[0].state).toBe("wander");
    const second = events(rows, "player_hit")[1];
    expect(second.tick - hit.tick).toBeGreaterThanOrEqual(90);
  });
  it("invulnerable player is not hit and the shade does not recoil", () => {
    const rows = run({ ticks: 20, scenario: { player: { invuln_ticks: 90 }, shades: [{ id: "S1", pos: [0.5, 1, 0] }] } });
    expect(events(rows, "player_hit")).toHaveLength(0);
    expect(last(rows).shades[0].state).toBe("chase");
  });
  it("at most one flame lost per tick even with two shades on top of Mây", () => {
    const rows = run({ ticks: 3, scenario: { shades: [{ id: "S1", pos: [0.2, 1, 0] }, { id: "S2", pos: [0, 1, 0.2] }] } });
    expect(events(rows, "player_hit")).toHaveLength(1);
  });
  it("no flames -> lost (no_flames) and wins over everything else", () => {
    const rows = run({ ticks: 50, scenario: { player: { flames: 1 }, shades: [{ id: "S1", pos: [0.5, 1, 0] }] } });
    expect(events(rows, "game_over")[0].data).toEqual({ result: "lost", reason: "no_flames" });
  });
  it("schedule: 2 shades at tick 300, then 1 every 480 ticks, max 6, >=15 m from Mây, ids S1..", () => {
    const rows = run({ ticks: 1300, scenario: { random_shades: true, shades: undefined }, seed: 3, every: 10 });
    expect(events(rows, "shade_spawned").map((e) => [e.tick, e.data.id])).toEqual([[300, "S1"], [300, "S2"], [780, "S3"], [1260, "S4"]]);
    expect(snapAt(rows, 290).shades).toHaveLength(0);
    for (const s of snapAt(rows, 300).shades) { expect(s.state).toBe("spawning"); expect(Math.hypot(s.pos[0], s.pos[2])).toBeCloseTo(37, 1); }
    expect(snapAt(rows, 310).shades.every((s: Row) => s.state === "wander" || s.state === "chase")).toBe(true);
  });
});

describe("safe zone", () => {
  it("shades cannot enter a 6 m radius around a lit lantern", () => {
    const sc = { lanterns: [L("L1", { pos: [0, 0, 0], lit: true })], shades: [{ id: "S1", pos: [10, 1, 0] }] }; // within the 12 m detect range so it really charges the barrier
    const rows = run({ ticks: 900, scenario: sc });
    const dists = snaps(rows).map((r) => Math.hypot(r.shades[0].pos[0], r.shades[0].pos[2]));
    for (const d of dists) expect(d).toBeGreaterThanOrEqual(6 - 1e-3);
    expect(Math.min(...dists)).toBeLessThan(6.1); // proves the shade actually pressed against the rim
    expect(events(rows, "player_hit")).toHaveLength(0);
  });
  it("a shade inside a freshly lit zone is pushed to the rim within 30 ticks, harmless meanwhile", () => {
    const sc = { player: { pos: [0, 0, 0], carried: 10 }, lanterns: [L("L1", { pos: [0, 0, 1.5] })], shades: [{ id: "S1", pos: [0.5, 1, 1.5] }] };
    const rows = run({ ticks: 40, scenario: sc, inputs: press(0, "interact") });
    expect(events(rows, "lantern_lit")).toHaveLength(1);
    expect(events(rows, "player_hit")).toHaveLength(0);
    const s = snapAt(rows, 31).shades[0];
    expect(Math.hypot(s.pos[0], s.pos[2] - 1.5)).toBeGreaterThanOrEqual(6 - 1e-3);
  });
});

describe("pulse", () => {
  const sc = { player: { carried: 5 }, shades: [{ id: "S1", pos: [4, 1.8, 0] }, { id: "S2", pos: [20, 1, 0] }] };
  it("cost 3, 3D radius 5 from foot+0.8, stun 120 ticks, 4 m push in first 15 ticks, +5 each", () => {
    const rows = run({ ticks: 130, scenario: sc, inputs: press(0, "pulse") });
    expect(events(rows, "pulse")[0].data).toEqual({ stunned_ids: ["S1"] });
    const s1 = snapAt(rows, 1);
    expect(s1.player.carried).toBe(2); expect(s1.score).toBe(5); expect(s1.shades[0].state).toBe("stunned");
    expect(s1.shades[0].pos[0]).toBeCloseTo(4 + 4 / 15, 2);
    expect(snapAt(rows, 15).shades[0].pos[0]).toBeCloseTo(8, 2);
    expect(snapAt(rows, 100).shades[0].pos[0]).toBeCloseTo(8, 2);
    expect(snapAt(rows, 119).shades[0].state).toBe("stunned");
    expect(snapAt(rows, 121).shades[0].state).not.toBe("stunned");
  });
  it("3D distance counts: too high above Mây is out of range", () => {
    // Mây on tier 1 (y=3), the shade on the ground tier 4.5 m away horizontally: 3D distance ~5.3 > 5 although XZ distance < 5
    const hi = run({ night: 3, ticks: 2, scenario: { player: { pos: [0, 3, 14], carried: 3 }, shades: [{ id: "S1", pos: [0, 1, 9.5] }] }, inputs: press(0, "pulse") });
    expect(events(hi, "pulse")[0].data).toEqual({ stunned_ids: [] });
    const same = run({ ticks: 2, scenario: { player: { carried: 3 }, shades: [{ id: "S1", pos: [0, 1, 4.5] }] }, inputs: press(0, "pulse") });
    expect(events(same, "pulse")[0].data).toEqual({ stunned_ids: ["S1"] });
  });
  it("cooldown 3 s from activation; needs 3 motes; re-hit refreshes stun and scores again", () => {
    const rows = run({ ticks: 200, scenario: { player: { carried: 9 }, shades: [{ id: "S1", pos: [3, 1, 0] }] }, inputs: [...press(0, "pulse"), ...press(100, "pulse"), ...press(180, "pulse")] });
    expect(events(rows, "pulse").map((e) => e.tick)).toEqual([1, 181]);
    const few = run({ ticks: 5, scenario: { player: { carried: 2 } }, inputs: press(0, "pulse") });
    expect(events(few, "pulse")).toHaveLength(0);
    const again = run({ ticks: 200, scenario: { player: { carried: 9, pulse_cd_ticks: 0 }, shades: [{ id: "S1", pos: [3, 1, 0] }] }, inputs: [...press(0, "pulse"), ...press(180, "pulse")] });
    expect(last(again).score).toBe(10); // stunned both times
  });
  it("pulse overlapping safe zone push stops at the rim", () => {
    const rows = run({ ticks: 30, scenario: { player: { carried: 3 }, lanterns: [L("L1", { pos: [11, 0, 0], lit: true })], shades: [{ id: "S1", pos: [3, 1, 0] }] }, inputs: press(0, "pulse") });
    expect(last(rows).shades[0].pos[0]).toBeCloseTo(5, 2); // unpushed target 7 would be inside the zone; stops at the 6 m rim
  });
});

describe("win / lose (Ticket-03: survive to dawn, no early win)", () => {
  const lit = (ids: string[], fuel = 100) => ids.map((id) => L(id, { lit: true, fuel }));
  it("lighting every lantern no longer ends the Night", () => {
    const sc = { player: { carried: 10 }, lanterns: [L("L1", { pos: [0, 0, 1] }), ...lit(["L2", "L3", "L4", "L5"])] };
    const rows = run({ ticks: 600, scenario: sc, inputs: press(0, "interact") });
    expect(events(rows, "lantern_lit")).toHaveLength(1);
    expect(events(rows, "game_over")).toHaveLength(0);
    expect(last(rows).state).toBe("playing");
  });
  it("at dawn with >= ceil(0.6 n) lit lanterns: won / dawn_survived, bonus 50+floor(fuel) per lit lantern + 50 per flame, no time bonus", () => {
    const rows = run({ ticks: 500, scenario: { time_left_s: 2, lanterns: lit(["L1", "L2", "L3"]) } });
    expect(events(rows, "game_over")[0].data).toEqual({ result: "won", reason: "dawn_survived" });
    expect(rows[rows.length - 1]).toMatchObject({ type: "end", ticks: 120, state: "won", score: 3 * (50 + 98) + 3 * 50 });
  });
  it("fewer than ceil(0.6 n) lit at dawn: lost / dawn", () => {
    const rows = run({ ticks: 500, scenario: { time_left_s: 2, lanterns: lit(["L1", "L2"]) } });
    expect(events(rows, "game_over")[0].data).toEqual({ result: "lost", reason: "dawn" });
  });
  it("thresholds are 3/5, 4/6, 5/7", () => {
    const need = (night: 1 | 2 | 3, n: number) => run({ night, ticks: 500, scenario: { time_left_s: 1, lanterns: lit(["L1", "L2", "L3", "L4", "L5", "L6", "L7"].slice(0, n)) } });
    for (const [night, req] of [[1, 3], [2, 4], [3, 5]] as const) {
      expect(events(need(night, req), "game_over")[0].data.result).toBe("won");
      expect(events(need(night, req - 1), "game_over")[0].data.result).toBe("lost");
    }
  });
  it("no flames at the very last tick is still a no_flames loss (checked before dawn)", () => {
    const sc = { time_left_s: 1 / 60 * 3, player: { flames: 1 }, lanterns: lit(["L1", "L2", "L3"]), shades: [{ id: "S1", pos: [0.5, 1, 0] }] };
    const rows = run({ ticks: 20, scenario: sc });
    expect(events(rows, "game_over")[0].data).toEqual({ result: "lost", reason: "no_flames" });
  });
});

describe("lantern fuel (Ticket-03 section 1)", () => {
  const fuelAt = (rows: Row[], tick: number, id = "L1") => snapAt(rows, tick).lanterns.find((l: Row) => l.id === id).fuel;
  it("a lit lantern starts at 100 and burns 1 per second", () => {
    const rows = run({ ticks: 120, scenario: { lanterns: [L("L1", { lit: true })] } });
    expect(fuelAt(rows, 0)).toBe(100);
    expect(fuelAt(rows, 60)).toBe(99);
    expect(fuelAt(rows, 120)).toBe(98);
    expect(snapAt(rows, 0).lanterns[1]).toMatchObject({ lit: false, fuel: 0, ever_lit: false, relit_count: 0 });
    expect(snapAt(rows, 0).lanterns[0]).toMatchObject({ ever_lit: true });
  });
  it("refuel: used = min(carried, ceil((100 - fuel) / 10)), fuel + 10 per mote, +5 per mote, event", () => {
    const sc = { player: { carried: 9 }, lanterns: [L("L1", { pos: [0, 0, 1], lit: true, fuel: 55 })] };
    const rows = run({ ticks: 5, scenario: sc, inputs: press(0, "interact") });
    expect(events(rows, "refuel")[0].data).toEqual({ lantern_id: "L1", amount: 5, fuel: 100 });
    expect(snapAt(rows, 1).player.carried).toBe(4);
    expect(snapAt(rows, 1).score).toBe(25);
    const few = run({ ticks: 5, scenario: { player: { carried: 2 }, lanterns: [L("L1", { pos: [0, 0, 1], lit: true, fuel: 20 })] }, inputs: press(0, "interact") });
    expect(events(few, "refuel")[0].data).toMatchObject({ amount: 2 });
    expect(fuelAt(few, 1)).toBeCloseTo(20 + 20 - 1 / 60, 1);
  });
  it("a completely full lantern is not selected: no event, no cost, no score", () => {
    const sc = { player: { carried: 5 }, lanterns: [L("L1", { pos: [0, 0, 1], lit: true, fuel: 100 })] };
    const rows = run({ ticks: 3, scenario: sc, inputs: press(0, "interact") });
    expect(events(rows, "refuel")[0].data.amount).toBe(1); // decay happens first (step 2), so it is 99.98 by the time E is handled
    const sim = new Sim(1, { ...quiet, lanterns: [L("L1", { lit: true })] } as any, 1);
    expect(sim.lanterns[0].fuelU).toBe(100 * 60);
  });
  it("out of fuel: lantern goes out, deposited 0, remembers ever_lit; event lantern_out", () => {
    const rows = run({ ticks: 70, scenario: { lanterns: [L("L1", { lit: true, fuel: 0.5 })] } });
    const out = events(rows, "lantern_out")[0];
    expect(out.data).toEqual({ lantern_id: "L1" });
    expect(out.tick).toBe(30);
    expect(snapAt(rows, 31).lanterns[0]).toMatchObject({ lit: false, fuel: 0, deposited: 0, ever_lit: true });
  });
  it("relight costs 5 for a lantern that was lit before, 10 for a new one; +40 vs +100; relight flag", () => {
    const re = run({ ticks: 5, scenario: { player: { carried: 5 }, lanterns: [L("L1", { pos: [0, 0, 1], ever_lit: true })] }, inputs: press(0, "interact") });
    expect(events(re, "lantern_lit")[0].data).toEqual({ lantern_id: "L1", relight: true });
    expect(snapAt(re, 1).score).toBe(5 * 5 + 40);
    expect(snapAt(re, 1).lanterns[0]).toMatchObject({ lit: true, fuel: 100, relit_count: 1 });
    const fresh = run({ ticks: 5, scenario: { player: { carried: 5 }, lanterns: [L("L1", { pos: [0, 0, 1] })] }, inputs: press(0, "interact") });
    expect(events(fresh, "lantern_lit")).toHaveLength(0);
    expect(events(fresh, "deposit")[0].data.deposited).toBe(5);
  });
  it("the safe zone needs fuel >= 30: exactly 30 still counts, below does not", () => {
    const sim = new Sim(1, { ...quiet, lanterns: [L("L1", { lit: true, fuel: 30 }), L("L2", { lit: true, fuel: 29.98 })] } as any, 1);
    expect(sim.safeOn(sim.lanterns[0])).toBe(true);
    expect(sim.safeOn(sim.lanterns[1])).toBe(false);
  });
  it("a shade can walk in once the lantern drops below 30", () => {
    const sc = { lanterns: [L("L1", { pos: [0, 0, 0], lit: true, fuel: 31 })], shades: [{ id: "S1", pos: [10, 1, 0] }] };
    const rows = run({ ticks: 400, scenario: sc });
    const d = (t: number) => Math.hypot(snapAt(rows, t).shades[0].pos[0], snapAt(rows, t).shades[0].pos[2]);
    // fuel is 31 at tick 0 and burns 1/s: it is exactly 30 at tick 60 (zone still on) and below 30 from tick 61
    expect(Math.min(...[30, 59, 60].map(d))).toBeGreaterThanOrEqual(6 - 1e-3);
    expect(d(60)).toBeCloseTo(6, 2);
    const closest = Math.min(...snaps(rows).map((r) => Math.hypot(r.shades[0].pos[0], r.shades[0].pos[2])));
    expect(closest).toBeLessThan(5); // the game may end earlier (3 hits), so look at the closest approach
  });
});

describe("shades drain lanterns (Ticket-03 section 2)", () => {
  const weak = { lanterns: [L("L1", { pos: [30, 0, 0], lit: true, fuel: 20 })] };
  it("a wandering shade heads for the nearest weak lantern (over a nearer unlit one), then drains 5/s on top of the burn", () => {
    const sc = { ...weak, shades: [{ id: "S1", pos: [34, 1, 0] }] };
    const rows = run({ ticks: 200, scenario: sc });
    expect(snapAt(rows, 1).shades[0].state).toBe("wander");
    const dr = snaps(rows).find((r) => r.shades[0].state === "drain")!;
    expect(dr).toBeTruthy();
    expect(Math.hypot(dr.shades[0].pos[0] - 30, dr.shades[0].pos[2])).toBeLessThanOrEqual(2 + 1e-6);
    const t0 = dr.tick;
    // burn 1/s + drain 5/s = 6/s while draining
    expect(snapAt(rows, t0).lanterns[0].fuel - snapAt(rows, t0 + 60).lanterns[0].fuel).toBeCloseTo(6, 1);
    expect(events(rows, "fuel_drain")[0].data).toMatchObject({ lantern_id: "L1", shade_id: "S1" });
    expect(events(rows, "fuel_drain")[0].tick - (t0 + 1)).toBeLessThanOrEqual(60);
  });
  it("prefers a weak lit lantern even when an unlit one is nearer; ties go to the smaller id", () => {
    // the shade starts 2 m from the unlit L1 but 9.4 m from the weak L2/L3 (equidistant): it must still go for L2
    const sc = { lanterns: [L("L1", { pos: [20, 0, 0] }), L("L2", { pos: [30, 0, 5], lit: true, fuel: 10 }), L("L3", { pos: [30, 0, -5], lit: true, fuel: 10 })], shades: [{ id: "S1", pos: [22, 1, 0] }] };
    const rows = run({ ticks: 300, scenario: sc });
    const first = snaps(rows).find((r) => r.shades[0].state === "drain")!;
    expect(first).toBeTruthy();
    expect(Math.hypot(first.shades[0].pos[0] - 30, first.shades[0].pos[2] - 5)).toBeLessThanOrEqual(2 + 1e-6);
    expect(events(rows, "fuel_drain")[0].data).toMatchObject({ lantern_id: "L2", shade_id: "S1" });
    expect(events(rows, "fuel_drain").every((e) => e.data.lantern_id === "L2")).toBe(true);
  });
  it("several shades add up (10/s with two)", () => {
    const sc = { ...weak, shades: [{ id: "S1", pos: [29, 1, 0] }, { id: "S2", pos: [31, 1, 0], state: "wander" }] };
    const one = run({ ticks: 80, scenario: { ...weak, shades: [{ id: "S1", pos: [29, 1, 0] }] } });
    const two = run({ ticks: 80, scenario: sc });
    const loss = (rows: Row[]) => snapAt(rows, 20).lanterns[0].fuel - snapAt(rows, 80).lanterns[0].fuel;
    expect(loss(two)).toBeGreaterThan(loss(one) + 4);
  });
  it("drain -> chase when Mây comes within 6 m; drain -> stunned on pulse (+15 in total)", () => {
    const base = { ...weak, shades: [{ id: "S1", pos: [29, 1, 0], state: "drain", target_lantern_id: "L1" }] };
    const near = run({ ticks: 5, scenario: { ...base, player: { pos: [24.5, 0, 0] } } });
    expect(snapAt(near, 1).shades[0].state).toBe("chase");
    const far = run({ ticks: 5, scenario: { ...base, player: { pos: [20, 0, 0] } } });
    expect(snapAt(far, 1).shades[0].state).toBe("drain");
    const pulse = run({ ticks: 5, scenario: { ...base, player: { pos: [25, 0, 0], carried: 3 } }, inputs: press(0, "pulse") });
    expect(snapAt(pulse, 1).shades[0].state).toBe("stunned");
    expect(snapAt(pulse, 1).score).toBe(15);
  });
  it("drain -> wander when the lantern goes out, when refuelled to >= 30, or when pushed beyond 2 m", () => {
    const out = run({ ticks: 40, scenario: { lanterns: [L("L1", { pos: [30, 0, 0], lit: true, fuel: 0.2 })], shades: [{ id: "S1", pos: [29, 1, 0], state: "drain", target_lantern_id: "L1" }] } });
    expect(events(out, "lantern_out")).toHaveLength(1);
    expect(snapAt(out, 5).shades[0].state).toBe("wander");
    const far = run({ ticks: 3, scenario: { ...weak, shades: [{ id: "S1", pos: [33, 1, 0], state: "drain", target_lantern_id: "L1" }] } });
    expect(snapAt(far, 1).shades[0].state).toBe("wander");
  });
  it("refuelling a lantern to >= 30 pushes shades out of its zone harmlessly within 30 ticks", () => {
    const sc = { player: { pos: [30, 0, 0], carried: 4 }, lanterns: [L("L1", { pos: [30, 0, 0], lit: true, fuel: 20 })], shades: [{ id: "S1", pos: [31, 1, 0] }] };
    const rows = run({ ticks: 40, scenario: sc, inputs: press(0, "interact") });
    expect(events(rows, "refuel")).toHaveLength(1);
    expect(events(rows, "player_hit")).toHaveLength(0);
    expect(Math.hypot(snapAt(rows, 31).shades[0].pos[0] - 30, snapAt(rows, 31).shades[0].pos[2])).toBeGreaterThanOrEqual(6 - 1e-3);
  });
});

describe("capacity & scoring (Ticket-03 sections 4-5)", () => {
  it("capacity = 10 + 2 x successful lights, max 20; scenario-placed lit lanterns do not count; resets each Night", () => {
    expect(snapAt(run({ ticks: 0, scenario: { lanterns: [L("L1", { lit: true })] } }), 0).player.capacity).toBe(10);
    expect(snapAt(run({ ticks: 0, scenario: { player: { successful_lights: 3 } } }), 0).player.capacity).toBe(16);
    expect(snapAt(run({ ticks: 0, scenario: { player: { successful_lights: 9 } } }), 0).player.capacity).toBe(20);
    const rows = run({ ticks: 5, scenario: { player: { carried: 10 }, lanterns: [L("L1", { pos: [0, 0, 1] })] }, inputs: press(0, "interact") });
    expect(snapAt(rows, 1).player.capacity).toBe(12);
    const full = run({ ticks: 3, scenario: { player: { carried: 15, successful_lights: 3 }, motes: [[0, 0, 0.5]] } });
    expect(events(full, "mote_picked")).toHaveLength(1); // 16th slot available
  });
  it("a relight counts as a successful light", () => {
    const rows = run({ ticks: 5, scenario: { player: { carried: 5 }, lanterns: [L("L1", { pos: [0, 0, 1], ever_lit: true })] }, inputs: press(0, "interact") });
    expect(snapAt(rows, 1).player.capacity).toBe(12);
  });
  it("score: +5/mote (new light, relight or refuel), +100 first light, +40 relight, no time bonus", () => {
    const sc = { player: { carried: 10 }, lanterns: [L("L1", { pos: [0, 0, 1] })] };
    const rows = run({ ticks: 5, scenario: sc, inputs: press(0, "interact") });
    expect(snapAt(rows, 1).score).toBe(10 * 5 + 100);
  });
});

describe("pause", () => {
  it("logic freezes: tick counts, sim_tick/time/cooldowns do not; events paused/resumed", () => {
    const rows = run({ ticks: 40, inputs: [{ tick: 0, move: [0, 1] }, ...press(10, "pause"), { tick: 20, pause: true }, { tick: 21, pause: false }] });
    expect(events(rows, "paused")[0].tick).toBe(11);
    expect(snapAt(rows, 12)).toMatchObject({ state: "paused", sim_tick: 10 });
    expect(snapAt(rows, 15).player.pos[2]).toBe(snapAt(rows, 11).player.pos[2]);
    expect(snapAt(rows, 15).time_left_s).toBeCloseTo(240 - 10 / 60, 3);
    expect(events(rows, "resumed")[0].tick).toBe(21);
    expect(snapAt(rows, 21)).toMatchObject({ state: "playing", sim_tick: 11 });
  });
});

describe("Night 2 - Đảo Cau", () => {
  const n2 = (o: RunOpts) => run({ night: 2, ...o });
  it("two islands + bamboo bridge; walking across keeps Mây alive; leaving the bridge drops her", () => {
    const rows = n2({ ticks: 400, inputs: walk([1, 0], { cam_yaw_deg: 0 }) });
    expect(events(rows, "player_hit")).toHaveLength(0);
    expect(snapAt(rows, 340).player.pos[0]).toBeGreaterThan(30);
    const off = n2({ ticks: 300, scenario: { player: { pos: [30, 0, 0] } }, inputs: walk([0, 1]) });
    expect(events(off, "player_hit")[0].data.by).toBe("fall");
  });
  it("jump pad launches (vy 14, 24 m/s toward the other island) and ignores steering until landing", () => {
    const rows = n2({ ticks: 120, scenario: { player: { pos: [20, 0, 17.5] } }, inputs: [{ tick: 0, move: [0, 1] }, { tick: 5, move: [-1, 0] }] });
    const s = snaps(rows).find((r) => !r.player.grounded)!;
    expect(s.player.vel[1]).toBeGreaterThan(13);
    const land = snaps(rows).find((r) => r.tick > 5 && r.player.grounded && r.player.pos[0] > 40)!;
    expect(land).toBeTruthy();
    expect(Math.hypot(land.player.pos[0] - 70, land.player.pos[2])).toBeLessThan(28);
    expect(events(rows, "player_hit")).toHaveLength(0);
  });
  it("Gió Lạc: spawns at tick 1200, chases a carrier (>=5), steals 3 once and flees; pulse deflects", () => {
    const rows = n2({ ticks: 1300, scenario: { random_drifters: true, player: { carried: 8 } }, every: 10 });
    expect(snapAt(rows, 1200).drifters).toHaveLength(1);
    expect(snapAt(rows, 1200).drifters[0].id).toBe("D1");
    const sc = { player: { carried: 8 }, drifters: [{ id: "D1", pos: [6, 1.5, 0], state: "idle" }] };
    const st = n2({ ticks: 120, scenario: sc });
    const steal = events(st, "drifter_steal");
    expect(steal).toHaveLength(1);
    expect(steal[0].data).toEqual({ drifter_id: "D1", amount: 3, carried: 5 });
    const fled = snapAt(st, steal[0].tick + 1).drifters[0];
    expect(fled).toMatchObject({ state: "flee", stolen: 3 });
    expect(events(st, "player_hit")).toHaveLength(0);
    const calm = n2({ ticks: 60, scenario: { player: { carried: 4 }, drifters: [{ id: "D1", pos: [6, 1.5, 0] }] } });
    expect(snapAt(calm, 60).drifters[0].state).toBe("idle");
    const pulse = n2({ ticks: 60, scenario: { player: { carried: 8 }, drifters: [{ id: "D1", pos: [4.5, 1.5, 0], state: "chase" }] }, inputs: press(0, "pulse") });
    expect(events(pulse, "drifter_steal")).toHaveLength(0);
    expect(snapAt(pulse, 1).drifters[0]).toMatchObject({ state: "flee", stolen: 0 });
  });
  it("pulse on a fleeing drifter makes it drop what it stole", () => {
    const sc = { player: { carried: 3 }, drifters: [{ id: "D1", pos: [4, 1.5, 0], state: "flee", state_ticks_left: 200, stolen: 3 }] };
    const rows = n2({ ticks: 5, scenario: sc, inputs: press(0, "pulse") });
    expect(events(rows, "drifter_drop")[0].data).toEqual({ drifter_id: "D1", amount: 3 });
    expect(snapAt(rows, 2).motes.filter((m: Row) => m.kind === "dropped")).toHaveLength(3);
    expect(snapAt(rows, 2).drifters[0].stolen).toBe(0);
  });
  it("Bùa Gió: pick, speed 7.2, dash without cooldown, lasts 600 ticks, respawns after 2700", () => {
    const rows = n2({ ticks: 700, scenario: { player: { pos: [34.5, 0, 0] } }, inputs: [{ tick: 0, move: [1, 0] }] });
    const pick = events(rows, "charm_picked")[0];
    expect(pick.data).toEqual({ charm_id: "C1", charm_ticks: 600 });
    expect(snapAt(rows, pick.tick).charms[0]).toMatchObject({ available: false });
    expect(snapAt(rows, pick.tick).charms[0].respawn_s).toBeCloseTo(45, 0);
    const sp = (t: number) => snapAt(rows, t).player.vel[0];
    expect(sp(pick.tick + 20)).toBeCloseTo(7.2, 3);
    const d = n2({ ticks: 60, scenario: { player: { charm_ticks: 100 } }, inputs: [{ tick: 0, move: [0, 1] }, ...press(5, "dash"), ...press(25, "dash")] });
    expect(events(d, "dash")).toHaveLength(2);
    expect(snapAt(d, 40).player.charm_s).toBeCloseTo(100 / 60 - 40 / 60, 2);
  });
  it("Night 2 data: 6 lanterns, 270 s", () => {
    const rows = n2({ ticks: 0 });
    expect(rows[0].lanterns.map((l: Row) => l.id)).toEqual(["L1", "L2", "L3", "L4", "L5", "L6"]);
    expect(rows[0].time_left_s).toBe(270); // Ticket-03: 270 s (was 330)
  });
});

describe("Night 3 - Đảo Chuông", () => {
  const n3 = (o: RunOpts) => run({ night: 3, ...o });
  it("7 lanterns at the standard heights; 300 s", () => {
    const rows = n3({ ticks: 0 });
    expect(rows[0].lanterns.map((l: Row) => l.pos[1])).toEqual([6, 3, 3, 0, 0, 0, 0]);
    expect(rows[0].time_left_s).toBe(300); // Ticket-03: 300 s (was 360)
  });
  it("tier cliffs are walls from below; the ramp is climbable; stepping off a tier drops one level", () => {
    const wall = n3({ ticks: 120, scenario: { player: { pos: [0, 0, 9] } }, inputs: walk([0, -1]) });
    expect(last(wall).player.pos[2]).toBeGreaterThan(7.9); // the centre tier (r=8) is a wall from below
    expect(last(wall).player.pos[1]).toBe(0);
    const ramp = n3({ ticks: 240, scenario: { player: { pos: [Math.cos(0.5236) * 32, 0, Math.sin(0.5236) * 32] } }, inputs: walk([-Math.cos(0.5236), -Math.sin(0.5236)]) });
    expect(Math.max(...snaps(ramp).map((s) => s.player.pos[1]))).toBeGreaterThan(2.9);
    const off = n3({ ticks: 120, scenario: { player: { pos: [5, 3, 14] } }, inputs: walk([0, -1]) });
    expect(last(off).player.pos[1]).toBeCloseTo(0, 2);
    expect(events(off, "player_hit")).toHaveLength(0);
  });
  it("jump pad on the ring flings Mây onto the centre tier (y = 6)", () => {
    const rows = n3({ ticks: 120, scenario: { player: { pos: [0, 3, 13] } } });
    const end = last(rows).player;
    expect(end.pos[1]).toBeCloseTo(6, 2);
    expect(Math.hypot(end.pos[0], end.pos[2])).toBeLessThan(8);
  });
  it("wind: warning 2 s before, blows 5 s every 30 s, pushes 2 m/s", () => {
    const rows = n3({ ticks: 2200, scenario: { wind_enabled: true }, every: 10 });
    expect(snapAt(rows, 1670).wind).toMatchObject({ active: false, warning: false });
    expect(snapAt(rows, 1700).wind.warning).toBe(true);
    expect(snapAt(rows, 1810).wind.active).toBe(true);
    expect(snapAt(rows, 2090).wind.active).toBe(true);
    expect(snapAt(rows, 2110).wind.active).toBe(false);
    const dir = snapAt(rows, 1810).wind.dir_deg;
    const a = (dir * Math.PI) / 180;
    const p0 = snapAt(rows, 1800).player.pos, p1 = snapAt(rows, 1860).player.pos;
    expect(p1[0] - p0[0]).toBeCloseTo(Math.cos(a) * 2, 1);
    expect(p1[2] - p0[2]).toBeCloseTo(Math.sin(a) * 2, 1);
  });
});

describe("contract v1.1 shape, determinism, speed", () => {
  it("snapshots carry the mandatory v1.1 fields", () => {
    const s = run({ ticks: 0, night: 2, scenario: { random_motes: true, motes: undefined } })[0];
    for (const k of ["night", "wind", "motes", "drifters", "charms", "sim_tick"]) expect(s).toHaveProperty(k);
    for (const k of ["vel", "grounded", "invuln", "dash_cd_s", "pulse_cd_s", "charm_s"]) expect(s.player).toHaveProperty(k);
    expect(s.motes[0]).toHaveProperty("kind"); expect(s.motes[0]).toHaveProperty("ttl_s");
    expect(s.charms[0]).toHaveProperty("respawn_s");
  });
  it("same seed -> identical output on every night; different seed differs", () => {
    for (const night of [1, 2, 3] as const) {
      const o = { seed: 11, ticks: 3000, night, scenario: { wind_enabled: true } };
      const a = runHeadless(o).lines, b = runHeadless(o).lines;
      expect(a).toEqual(b);
    }
    expect(runHeadless({ seed: 1, ticks: 2000 }).lines).not.toEqual(runHeadless({ seed: 2, ticks: 2000 }).lines);
  });
  it("a full Night finishes in <= 30 s of wall time", () => {
    const t0 = Date.now();
    runHeadless({ seed: 1, ticks: 21600, night: 3, snapshotEvery: 10 });
    expect(Date.now() - t0).toBeLessThan(30000);
  });
});

describe("CLI contract", () => {
  const dir = mkdtempSync(join(tmpdir(), "ddl-"));
  const cli = (...a: string[]) => spawnSync("npx", ["tsx", "src/headless/cli.ts", ...a], { encoding: "utf8", shell: true });
  it("two runs produce byte-identical files; exit 0; nights 1-3 accepted", () => {
    const o1 = join(dir, "a.jsonl"), o2 = join(dir, "b.jsonl");
    const args = ["--seed", "7", "--night", "2", "--ticks", "1500"];
    expect(cli(...args, "--out", o1).status).toBe(0);
    expect(cli(...args, "--out", o2).status).toBe(0);
    expect(readFileSync(o1, "utf8")).toBe(readFileSync(o2, "utf8"));
    expect(readFileSync(o1, "utf8").trim().split("\n").pop()).toContain('"type":"end"');
    expect(cli("--seed", "1", "--night", "4", "--ticks", "5", "--out", o1).status).not.toBe(0);
  }, 40000);
  it("malformed inputs/scenario -> exit 2 with stderr", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ frames: [{ tick: 5 }, { tick: 5 }] }));
    const r = cli("--seed", "1", "--night", "1", "--ticks", "10", "--inputs", bad, "--out", join(dir, "x.jsonl"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("error");
    writeFileSync(bad, "{not json");
    expect(cli("--seed", "1", "--night", "1", "--ticks", "10", "--scenario", bad, "--out", join(dir, "x.jsonl")).status).toBe(2);
  }, 40000);
  it("bad arguments -> non-zero exit", () => {
    expect(cli("--night", "1", "--ticks", "10", "--out", join(dir, "x.jsonl")).status).not.toBe(0);
  }, 30000);
});
