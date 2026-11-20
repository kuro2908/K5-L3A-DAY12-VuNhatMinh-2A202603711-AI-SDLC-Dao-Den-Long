import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { Entry, addEntry, isoWithOffset, parseEntries, sortEntries, validName } from "../src/leaderboard";
import { ACTIONS, DEFAULT_BINDINGS, conflictWith, keyLabel, loadSettings } from "../src/render/settings";
import { createGameServer } from "../scripts/server-lib";
import contract from "../game.contract.json";

const e = (name: string, score: number, at: string, nights = 1): Entry => ({ name, score, nights_won: nights, achieved_at: at, seed: 1 });

describe("leaderboard rules (Ticket-04 section 3)", () => {
  it("name: 3-12 chars of letters, digits, underscore (Vietnamese letters accepted as a bonus)", () => {
    for (const ok of ["abc", "Mây_01", "A_b_C_d_E_f_", "Nguyễn", "123"]) expect(validName(ok), ok).toBe(true);
    for (const bad of ["ab", "thirteen_char", "a b c", "a-b-c", "", "tên!", "тест", 5, null]) expect(validName(bad as any), String(bad)).toBe(false);
    expect(validName("a".repeat(12))).toBe(true);
    expect(validName("a".repeat(13))).toBe(false);
  });
  it("sorted by score descending; equal scores: the earlier achievement ranks higher; top 10 only", () => {
    const list = [e("late", 100, "2026-01-02T10:00:00+07:00"), e("early", 100, "2026-01-01T10:00:00+07:00"), e("high", 500, "2026-01-03T10:00:00+07:00")];
    expect(sortEntries(list).map((x) => x.name)).toEqual(["high", "early", "late"]);
    let all: Entry[] = [];
    for (let i = 0; i < 12; i++) all = addEntry(all, e(`p${String(i).padStart(2, "0")}`, i * 10, `2026-01-01T10:00:${String(i).padStart(2, "0")}+07:00`));
    expect(all).toHaveLength(10);
    expect(all[0].name).toBe("p11");
    expect(all.map((x) => x.name)).not.toContain("p00"); // the two lowest were pushed out
    expect(all.map((x) => x.name)).not.toContain("p01");
  });
  it("time zones are honoured when breaking ties", () => {
    const a = e("aaa", 50, "2026-01-01T12:00:00+00:00"), b = e("bbb", 50, "2026-01-01T12:30:00+07:00"); // b happened earlier in UTC
    expect(sortEntries([a, b]).map((x) => x.name)).toEqual(["bbb", "aaa"]);
  });
  it("achieved_at is ISO 8601 with an offset; parseEntries drops invalid records", () => {
    expect(isoWithOffset(new Date())).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    const parsed = parseEntries({ entries: [e("good", 5, "2026-01-01T00:00:00+07:00"), { name: "x", score: 1 }, e("bad name", 9, "2026-01-01T00:00:00+07:00"), e("four", 5, "not a date")] });
    expect(parsed.map((x) => x.name)).toEqual(["good"]);
    expect(parseEntries("garbage")).toEqual([]);
    expect(parseEntries({ entries: [e("neg", -1, "2026-01-01T00:00:00+07:00"), e("four", 5, "2026-01-01T00:00:00+07:00", 4)] })).toEqual([]); // score >= 0, nights_won 0..3
  });
});

describe("disk-backed leaderboard server + export command", () => {
  const dirs: string[] = [];
  const tmp = () => { const d = mkdtempSync(join(tmpdir(), "ddl-lb-")); dirs.push(d); return d; };
  afterEach(() => { process.env.LEADERBOARD_FILE = ""; for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

  async function withServer<T>(file: string, fn: (base: string) => Promise<T>): Promise<T> {
    process.env.LEADERBOARD_FILE = file;
    const server = createGameServer(join(file, ".."));
    await new Promise<void>((r) => server.listen(0, r));
    try { return await fn(`http://localhost:${(server.address() as AddressInfo).port}`); } finally { server.close(); }
  }
  const post = (base: string, body: unknown) => fetch(`${base}/api/leaderboard`, { method: "POST", body: JSON.stringify(body) });

  it("accepts valid scores, rejects bad names, keeps order, and survives a server restart", async () => {
    const file = join(tmp(), "lb.json");
    await withServer(file, async (base) => {
      expect((await post(base, { name: "Minh_VN", score: 300, nights_won: 2, seed: 7 })).status).toBe(200);
      expect((await post(base, { name: "An", score: 999, nights_won: 3, seed: 7 })).status).toBe(400);   // too short
      expect((await post(base, { name: "Binh", score: 500, nights_won: 3, seed: 8 })).status).toBe(200);
      const { entries } = await (await fetch(`${base}/api/leaderboard`)).json();
      expect(entries.map((x: Entry) => x.name)).toEqual(["Binh", "Minh_VN"]);
      expect(entries[0]).toMatchObject({ score: 500, nights_won: 3, seed: 8 });
      expect(entries[0].achieved_at).toMatch(/[+-]\d\d:\d\d$/);
    });
    expect(existsSync(file)).toBe(true);
    await withServer(file, async (base) => { // "close and reopen the game": a new server reads the same file
      const { entries } = await (await fetch(`${base}/api/leaderboard`)).json();
      expect(entries.map((x: Entry) => x.name)).toEqual(["Binh", "Minh_VN"]);
    });
  });

  it("<run_cmd> --export-leaderboard out.json writes {entries:[...]} in ranking order", async () => {
    const dir = tmp(), file = join(dir, "lb.json"), out = join(dir, "out.json");
    await withServer(file, async (base) => {
      await post(base, { name: "first", score: 10, nights_won: 0, seed: 1, achieved_at: "2026-01-01T10:00:00+07:00" });
      await post(base, { name: "second", score: 10, nights_won: 0, seed: 1, achieved_at: "2026-01-01T11:00:00+07:00" });
      await post(base, { name: "top", score: 40, nights_won: 1, seed: 1, achieved_at: "2026-01-01T12:00:00+07:00" });
    });
    const r = spawnSync(`${contract.run_cmd} --export-leaderboard "${out}"`, { shell: true, encoding: "utf8", env: { ...process.env, LEADERBOARD_FILE: file } });
    expect(r.status, r.stderr).toBe(0);
    const exported = JSON.parse(readFileSync(out, "utf8"));
    expect(Object.keys(exported)).toEqual(["entries"]);
    expect(exported.entries.map((x: Entry) => x.name)).toEqual(["top", "first", "second"]);
    expect(Object.keys(exported.entries[0]).sort()).toEqual(["achieved_at", "name", "nights_won", "score", "seed"]);
    const empty = spawnSync(`${contract.run_cmd} --export-leaderboard "${out}"`, { shell: true, encoding: "utf8", env: { ...process.env, LEADERBOARD_FILE: join(dir, "missing.json") } });
    expect(empty.status).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual({ entries: [] });
  }, 60000);
});

describe("key rebinding & settings (Ticket-04 section 4)", () => {
  it("covers every action: 4 directions, jump, dash, interact, pulse, pause; defaults are unique", () => {
    expect(ACTIONS.map((a) => a.id).sort()).toEqual(["dash", "down", "interact", "jump", "left", "pause", "pulse", "right", "up"]);
    expect(new Set(Object.values(DEFAULT_BINDINGS)).size).toBe(ACTIONS.length);
  });
  it("detects a key that is already used by another action (but not by the action itself)", () => {
    expect(conflictWith(DEFAULT_BINDINGS, "KeyE", "jump")).toBe("interact");
    expect(conflictWith(DEFAULT_BINDINGS, "KeyE", "interact")).toBeNull();
    expect(conflictWith(DEFAULT_BINDINGS, "KeyZ", "jump")).toBeNull();
  });
  it("key names are readable", () => {
    expect(keyLabel("KeyW")).toBe("W"); expect(keyLabel("Escape")).toBe("Esc"); expect(keyLabel("ArrowUp")).toBe("↑");
  });
  it("loadSettings: defaults without storage; saved values restored; duplicate saved bindings are rejected", () => {
    const g = globalThis as any;
    delete g.localStorage;
    expect(loadSettings().bindings).toEqual(DEFAULT_BINDINGS);
    const store = (v: unknown) => { g.localStorage = { getItem: () => JSON.stringify(v), setItem: () => {} }; };
    store({ volume: 0.2, colorblind: true, reducedMotion: true, largeText: true, bindings: { ...DEFAULT_BINDINGS, jump: "KeyJ" } });
    const s = loadSettings();
    expect(s).toMatchObject({ volume: 0.2, colorblind: true, reducedMotion: true, largeText: true });
    expect(s.bindings.jump).toBe("KeyJ");
    store({ bindings: { ...DEFAULT_BINDINGS, jump: "KeyE" } }); // two actions on E -> unreachable action, so fall back
    expect(loadSettings().bindings).toEqual(DEFAULT_BINDINGS);
    g.localStorage = { getItem: () => "{not json", setItem: () => {} };
    expect(loadSettings().bindings).toEqual(DEFAULT_BINDINGS);
    delete g.localStorage;
  });
});

describe("soak test (Ticket-04 section 2)", () => {
  const run = (out: string, nights = 4) => spawnSync(`${contract.soak_cmd} --seed 7 --nights ${nights} --out "${out}"`, { shell: true, encoding: "utf8" });
  it("runs N Nights in one process: no crashes, memory stable, same seed -> same results", () => {
    const dir = mkdtempSync(join(tmpdir(), "ddl-soak-")), a = join(dir, "a.json"), b = join(dir, "b.json");
    const r = run(a);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(readFileSync(a, "utf8"));
    expect(out).toMatchObject({ nights: 4, crashes: 0 });
    expect(out.results).toHaveLength(4);
    expect(out.results.every((x: string) => ["won", "lost"].includes(x))).toBe(true);
    expect(out.mem_end_mb).toBeLessThanOrEqual(1.2 * out.mem_start_mb);
    expect(Object.keys(out)).toEqual(expect.arrayContaining(["nights", "crashes", "results", "mem_start_mb", "mem_end_mb", "duration_s"]));
    expect(run(b).status).toBe(0);
    expect(JSON.parse(readFileSync(b, "utf8")).results).toEqual(out.results);
    rmSync(dir, { recursive: true, force: true });
  }, 90000);
  it("bad arguments -> non-zero exit", () => {
    expect(spawnSync(`${contract.soak_cmd} --seed x --nights 3 --out "${join(tmpdir(), "x.json")}"`, { shell: true }).status).not.toBe(0);
  }, 30000);
});

describe("contract v1.3", () => {
  it("declares the version, bench_cmd and soak_cmd", () => {
    expect(contract.contract_version).toBe("1.3");
    expect(contract).toHaveProperty("bench_cmd");
    expect(contract).toHaveProperty("soak_cmd");
    expect(existsSync(join(__dirname, "..", "scripts", "bench.ts"))).toBe(true);
  });
  it("the headless contract keys of v1.0-v1.2 are all still there", () => {
    for (const k of ["build_cmd", "run_cmd", "headless_cmd", "team", "tuning"]) expect(contract).toHaveProperty(k);
    for (const k of ["fuel_max", "fuel_decay_per_s", "fuel_per_mote", "relight_cost", "win_ratio", "drain_per_s", "low_fuel_threshold", "capacity_max", "dash_speed", "night3_duration_s"]) expect(contract.tuning).toHaveProperty(k);
  });
});

describe("benchmark scene flag (Ticket-04 section 1)", () => {
  it("bench mode: shades keep wandering by the normal rules; spawns, damage, pickups, fuel decay and the end of the Night are off", async () => {
    const { Sim, mulberry32 } = await import("../src/sim/sim");
    const rng = mulberry32(42);
    const at = (n: number, r: number): [number, number, number][] => Array.from({ length: n }, () => { const d = r * Math.sqrt(rng()), a = rng() * Math.PI * 2; return [Math.cos(a) * d, 0, Math.sin(a) * d]; });
    const shades = at(200, 36).map((pos, i) => ({ id: `S${i + 1}`, pos, state: "wander" as const }));
    const sim = new Sim(42, { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: at(100, 38), shades, lanterns: ["L1", "L2", "L3"].map((id) => ({ id, lit: true, fuel: 100 })) }, 1);
    sim.bench = true;
    const before = sim.shades.map((s) => [s.x, s.z]);
    const idle = { move: [0, 0] as [number, number], camYawDeg: 0, jump: false, dash: false, interact: false, pulse: false, pause: false };
    let events = 0;
    for (let k = 0; k < 1800; k++) events += sim.step(idle).length; // 30 s
    expect(events).toBe(0);
    expect(sim.state).toBe("playing");
    expect(sim.shades).toHaveLength(200);
    expect(sim.motes).toHaveLength(100);
    expect(sim.player).toMatchObject({ x: 0, z: 0, flames: 3, carried: 0 });
    expect(sim.lanterns.filter((l) => l.lit).map((l) => l.fuelU)).toEqual([6000, 6000, 6000]);
    expect(sim.shades.some((s, i) => Math.hypot(s.x - before[i][0], s.z - before[i][1]) > 1)).toBe(true); // they really move
  });
});
