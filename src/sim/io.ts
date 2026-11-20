// Parsing/validation of --inputs and --scenario files, and JSONL serialization (Test Contract v1.0).
import { Input, Scenario, Sim, IDLE_INPUT, Vec3 } from "./sim";

export class FormatError extends Error {}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (msg: string): never => { throw new FormatError(msg); };

interface Frame { tick: number; patch: Partial<Input> }

export function parseInputs(raw: unknown): Frame[] {
  if (!isObj(raw) || !Array.isArray(raw.frames)) return fail("inputs: expected {\"frames\": [...]}");
  const frames: Frame[] = [];
  let last = -1;
  for (const [i, f] of raw.frames.entries()) {
    if (!isObj(f)) return fail(`inputs.frames[${i}]: not an object`);
    if (!Number.isInteger(f.tick) || (f.tick as number) < 0) return fail(`inputs.frames[${i}].tick: expected non-negative integer`);
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
    for (const k of ["jump", "interact", "pulse"] as const) {
      if (f[k] !== undefined) {
        if (typeof f[k] !== "boolean") return fail(`inputs.frames[${i}].${k}: expected boolean`);
        patch[k] = f[k] as boolean;
      }
    }
    if (f.dash !== undefined && typeof f.dash !== "boolean") return fail(`inputs.frames[${i}].dash: expected boolean`);
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

export function parseScenario(raw: unknown): Scenario {
  if (!isObj(raw)) return fail("scenario: expected an object");
  const sc: Scenario = {};
  if (raw.player !== undefined) {
    const p = raw.player;
    if (!isObj(p)) return fail("scenario.player: expected object");
    if (p.pos !== undefined && !isVec3(p.pos)) return fail("scenario.player.pos: expected [x,y,z]");
    if (p.carried !== undefined && !(Number.isInteger(p.carried) && (p.carried as number) >= 0)) return fail("scenario.player.carried: expected integer >= 0");
    if (p.flames !== undefined && !Number.isInteger(p.flames)) return fail("scenario.player.flames: expected integer");
    sc.player = p as Scenario["player"];
  }
  for (const k of ["random_motes", "random_shades"] as const) {
    if (raw[k] !== undefined) {
      if (typeof raw[k] !== "boolean") return fail(`scenario.${k}: expected boolean`);
      sc[k] = raw[k] as boolean;
    }
  }
  if (raw.motes !== undefined) {
    if (!Array.isArray(raw.motes) || !raw.motes.every(isVec3)) return fail("scenario.motes: expected array of [x,y,z]");
    sc.motes = raw.motes as Vec3[];
  }
  if (raw.shades !== undefined) {
    if (!Array.isArray(raw.shades) || !raw.shades.every((s) => isObj(s) && isVec3(s.pos) && (s.id === undefined || typeof s.id === "string"))) return fail("scenario.shades: expected array of {pos:[x,y,z], id?}");
    sc.shades = raw.shades as Scenario["shades"];
  }
  if (raw.lanterns !== undefined) {
    if (!Array.isArray(raw.lanterns) || !raw.lanterns.every((l) => isObj(l) && typeof l.id === "string" && (l.pos === undefined || isVec3(l.pos)) && (l.lit === undefined || typeof l.lit === "boolean") && (l.deposited === undefined || isNum(l.deposited)))) return fail("scenario.lanterns: expected array of {id, pos?, deposited?, lit?}");
    sc.lanterns = raw.lanterns as Scenario["lanterns"];
  }
  if (raw.time_left_s !== undefined) {
    if (!isNum(raw.time_left_s) || raw.time_left_s <= 0) return fail("scenario.time_left_s: expected positive number");
    sc.time_left_s = raw.time_left_s;
  }
  return sc;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0; // +0 turns -0 into 0
const pos3 = (x: number, y: number, z: number) => [r3(x), r3(y), r3(z)];

export function snapshotLine(sim: Sim): string {
  const P = sim.player;
  return JSON.stringify({
    type: "snapshot", tick: sim.tick, sim_tick: sim.tick, state: sim.state,
    time_left_s: r3(sim.timeLeft), score: sim.score,
    player: { pos: pos3(P.x, P.y, P.z), flames: P.flames, carried: P.carried },
    lanterns: sim.lanterns.map((l) => ({ id: l.id, pos: pos3(l.x, 0, l.z), lit: l.lit, deposited: l.deposited })),
    shades: sim.shades.map((s) => ({ id: s.id, pos: pos3(s.x, 1, s.z), state: sim.shadeState(s) })),
    motes_active: sim.motes.length,
    motes: sim.motes.map((m) => ({ id: m.id, pos: pos3(m.x, 0, m.z) })),
  });
}

export const endLine = (sim: Sim) => JSON.stringify({ type: "end", ticks: sim.tick, state: sim.state, score: sim.score });
