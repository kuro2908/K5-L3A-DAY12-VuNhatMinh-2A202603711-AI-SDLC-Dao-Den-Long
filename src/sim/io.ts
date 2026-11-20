// Parsing/validation of --inputs and --scenario files, and JSONL serialization (Test Contract v1.1).
import { Input, Scenario, Sim, IDLE_INPUT, Vec3 } from "./sim";

export class FormatError extends Error {}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const fail = (msg: string): never => { throw new FormatError(msg); };

interface Frame { tick: number; patch: Partial<Input> }

export function parseInputs(raw: unknown): Frame[] {
  if (!isObj(raw) || !Array.isArray(raw.frames)) return fail("inputs: expected {\"frames\": [...]}");
  const frames: Frame[] = [];
  let last = -1;
  for (const [i, f] of raw.frames.entries()) {
    if (!isObj(f)) return fail(`inputs.frames[${i}]: not an object`);
    if (!isNat(f.tick)) return fail(`inputs.frames[${i}].tick: expected non-negative integer`);
    const tick = f.tick as number;
    if (tick <= last) return fail(`inputs.frames[${i}].tick: must strictly increase`);
    last = tick;
    const patch: Partial<Input> = {};
    if (f.move !== undefined) {
      const m = f.move;
      if (!Array.isArray(m) || m.length !== 2 || !m.every((c) => isNum(c) && c >= -1 && c <= 1)) return fail(`inputs.frames[${i}].move: expected [x,z] in [-1,1]`);
      patch.move = [m[0], m[1]];
    }
    if (f.cam_yaw_deg !== undefined) {
      if (!isNum(f.cam_yaw_deg)) return fail(`inputs.frames[${i}].cam_yaw_deg: expected number`);
      patch.camYawDeg = f.cam_yaw_deg;
    }
    for (const k of ["jump", "dash", "interact", "pulse", "pause"] as const) {
      if (f[k] !== undefined) {
        if (typeof f[k] !== "boolean") return fail(`inputs.frames[${i}].${k}: expected boolean`);
        patch[k] = f[k] as boolean;
      }
    }
    frames.push({ tick, patch });
  }
  return frames;
}

/** Returns the input in effect for each tick; fields absent from a frame keep their previous value. */
export function makeInputSource(frames: Frame[]): (tick: number) => Input {
  let idx = 0;
  let cur: Input = { ...IDLE_INPUT };
  return (tick: number) => {
    while (idx < frames.length && frames[idx].tick <= tick) { cur = { ...cur, ...frames[idx].patch }; idx++; }
    return cur;
  };
}

const arrOf = (v: unknown, name: string, ok: (x: unknown) => boolean, what: string): void => {
  if (!Array.isArray(v) || !v.every(ok)) fail(`scenario.${name}: expected ${what}`);
};

export function parseScenario(raw: unknown): Scenario {
  if (!isObj(raw)) return fail("scenario: expected an object");
  if (raw.player !== undefined) {
    const p = raw.player;
    if (!isObj(p)) return fail("scenario.player: expected object");
    if (p.pos !== undefined && !isVec3(p.pos)) fail("scenario.player.pos: expected [x,y,z]");
    for (const k of ["carried", "invuln_ticks", "dash_cd_ticks", "pulse_cd_ticks", "charm_ticks"]) if (p[k] !== undefined && !isNat(p[k])) fail(`scenario.player.${k}: expected integer >= 0`);
    if (p.flames !== undefined && !Number.isInteger(p.flames)) fail("scenario.player.flames: expected integer");
  }
  for (const k of ["random_motes", "random_shades", "random_drifters", "wind_enabled"]) if (raw[k] !== undefined && typeof raw[k] !== "boolean") fail(`scenario.${k}: expected boolean`);
  if (raw.motes !== undefined) arrOf(raw.motes, "motes", isVec3, "array of [x,y,z]");
  const withPos = (x: unknown) => isObj(x) && isVec3(x.pos) && (x.id === undefined || isStr(x.id));
  if (raw.shades !== undefined) arrOf(raw.shades, "shades", (s) => withPos(s) && (!(s as any).state || ["spawning", "wander", "chase", "recoil", "stunned"].includes((s as any).state)) && ((s as any).state_ticks_left === undefined || isNat((s as any).state_ticks_left)), "array of {pos:[x,y,z], id?, state?, state_ticks_left?}");
  if (raw.drifters !== undefined) arrOf(raw.drifters, "drifters", (d) => withPos(d) && (!(d as any).state || ["idle", "chase", "flee"].includes((d as any).state)), "array of {pos:[x,y,z], id?, state?, state_ticks_left?, stolen?}");
  if (raw.charms !== undefined) arrOf(raw.charms, "charms", (c) => withPos(c) && ((c as any).available === undefined || typeof (c as any).available === "boolean"), "array of {pos:[x,y,z], id?, available?}");
  if (raw.lanterns !== undefined) arrOf(raw.lanterns, "lanterns", (l) => isObj(l) && isStr(l.id) && (l.pos === undefined || isVec3(l.pos)) && (l.lit === undefined || typeof l.lit === "boolean") && (l.deposited === undefined || isNum(l.deposited)), "array of {id, pos?, deposited?, lit?}");
  if (raw.time_left_s !== undefined && !(isNum(raw.time_left_s) && raw.time_left_s > 0)) fail("scenario.time_left_s: expected positive number");
  return raw as Scenario;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0; // +0 turns -0 into 0
const pos3 = (x: number, y: number, z: number) => [r3(x), r3(y), r3(z)];
const sec = (ticks: number) => r3(ticks / 60);

export function snapshotLine(sim: Sim): string {
  const P = sim.player;
  return JSON.stringify({
    type: "snapshot", tick: sim.tick, sim_tick: sim.simTick, night: sim.night,
    state: sim.paused && sim.state === "playing" ? "paused" : sim.state,
    time_left_s: r3(sim.timeLeft), score: sim.score,
    wind: { active: sim.wind.active, dir_deg: r3(sim.wind.dir_deg), warning: sim.wind.warning },
    player: {
      pos: pos3(P.x, P.y, P.z), vel: pos3(P.vx, P.vy, P.vz), flames: P.flames, carried: P.carried, grounded: P.grounded,
      invuln: P.invuln > 0, invuln_s: sec(P.invuln), dash_cd_s: sec(P.dashCd), pulse_cd_s: sec(P.pulseCd), charm_s: sec(P.charm),
    },
    lanterns: sim.lanterns.map((l) => ({ id: l.id, pos: pos3(l.x, l.y, l.z), lit: l.lit, deposited: l.deposited })),
    shades: sim.shades.map((s) => ({ id: s.id, pos: pos3(s.x, s.gy + 1, s.z), state: s.state, state_ticks_left: s.left })),
    motes_active: sim.motes.length,
    motes: sim.motes.map((m) => ({ id: m.id, pos: pos3(m.x, m.y, m.z), kind: m.kind, ttl_s: m.kind === "dropped" ? sec(m.ttl) : null })),
    drifters: sim.drifters.map((d) => ({ id: d.id, pos: pos3(d.x, d.y, d.z), state: d.state, stolen: d.stolen })),
    charms: sim.charms.map((c) => ({ id: c.id, available: c.available, respawn_s: sec(c.respawn) })),
  });
}

export const endLine = (sim: Sim) => JSON.stringify({ type: "end", ticks: sim.tick, state: sim.state, score: sim.score });
export const eventLine = (tick: number, name: string, data: Record<string, unknown>) => JSON.stringify({ type: "event", tick, name, data });
