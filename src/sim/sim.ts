// Pure game logic: no DOM, no three.js, no Date/Math.random. Runs at a fixed 60 ticks/s.
import contract from "../../game.contract.json";

export const TUNING = contract.tuning;
export const TPS = 60;
export const ISLAND_R = 80; // playable radius (fall_enabled=false: the edge is a wall)
export const SHADE_Y = 1.0;

const MOTE_INITIAL = 20;
const MOTE_MAX = 30;
const MOTE_EVERY_TICKS = 120;
const SHADE_FIRST_TICKS = 1200;
const SHADE_EVERY_TICKS = 900;
const SHADE_MAX = 4;
const SHADE_MIN_SPAWN_DIST = 25;
const JUMP_V = 7;
const GRAVITY = 20;

export const DEFAULT_LANTERNS: { id: string; pos: [number, number, number] }[] = [
  { id: "L1", pos: [0, 0, 25] },
  { id: "L2", pos: [32, 0, 8] },
  { id: "L3", pos: [18, 0, -30] },
  { id: "L4", pos: [-26, 0, -22] },
  { id: "L5", pos: [-34, 0, 14] },
];

export type SimState = "playing" | "won" | "lost";
export type Vec3 = [number, number, number];

export interface Input {
  move: [number, number];
  camYawDeg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
}
export const IDLE_INPUT: Input = { move: [0, 0], camYawDeg: 0, jump: false, interact: false, pulse: false };

export interface ScenarioShade { id?: string; pos: Vec3 }
export interface ScenarioLantern { id: string; pos?: Vec3; deposited?: number; lit?: boolean }
export interface Scenario {
  player?: { pos?: Vec3; carried?: number; flames?: number };
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: [number, number, number][];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface SimEvent { type: "event"; tick: number; name: string; data: Record<string, unknown> }
interface Mote { id: string; x: number; z: number }
interface Shade { id: string; x: number; z: number; stunTicks: number }
interface Lantern { id: string; x: number; z: number; lit: boolean; deposited: number }

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const secToTicks = (s: number) => Math.round(s * TPS);

export class Sim {
  tick = 0;
  state: SimState = "playing";
  score = 0;
  player = { x: 0, y: 0, z: 0, vy: 0, flames: TUNING.flames, carried: 0, invuln: 0, pulseCd: 0 };
  lanterns: Lantern[] = [];
  motes: Mote[] = [];
  shades: Shade[] = [];
  readonly endTick: number;
  private rng: () => number;
  private randomMotes: boolean;
  private randomShades: boolean;
  private moteTimer = MOTE_EVERY_TICKS;
  private shadeTimer = SHADE_FIRST_TICKS;
  private nextMote = 1;
  private nextShade = 1;
  private prev = { jump: false, interact: false, pulse: false };

  constructor(seed: number, scenario: Scenario = {}) {
    this.rng = mulberry32(seed);
    this.randomMotes = scenario.random_motes !== false;
    this.randomShades = scenario.random_shades !== false;
    this.endTick = secToTicks(scenario.time_left_s ?? TUNING.night1_duration_s);

    for (const d of DEFAULT_LANTERNS.slice(0, TUNING.lantern_count_night1)) {
      this.lanterns.push({ id: d.id, x: d.pos[0], z: d.pos[2], lit: false, deposited: 0 });
    }
    const p = scenario.player;
    if (p?.pos) { this.player.x = p.pos[0]; this.player.y = p.pos[1]; this.player.z = p.pos[2]; }
    if (p?.carried !== undefined) this.player.carried = p.carried;
    if (p?.flames !== undefined) this.player.flames = p.flames;

    for (const sl of scenario.lanterns ?? []) {
      const l = this.lanterns.find((x) => x.id === sl.id);
      if (!l) continue;
      if (sl.pos) { l.x = sl.pos[0]; l.z = sl.pos[2]; }
      if (sl.deposited !== undefined) l.deposited = sl.deposited;
      if (sl.lit !== undefined) l.lit = sl.lit;
    }

    if (scenario.motes) for (const m of scenario.motes) this.addMote(m[0], m[2]);
    else if (this.randomMotes) for (let i = 0; i < MOTE_INITIAL; i++) this.spawnRandomMote();

    for (const s of scenario.shades ?? []) {
      const id = s.id ?? this.freshShadeId();
      this.shades.push({ id, x: s.pos[0], z: s.pos[2], stunTicks: 0 });
    }
  }

  get timeLeft(): number { return (this.endTick - this.tick) / TPS; }

  private addMote(x: number, z: number): void { this.motes.push({ id: `M${this.nextMote++}`, x, z }); }

  private spawnRandomMote(): void {
    const r = Math.sqrt(this.rng()) * (ISLAND_R - 6);
    const a = this.rng() * Math.PI * 2;
    this.addMote(Math.cos(a) * r, Math.sin(a) * r);
  }

  private freshShadeId(): string {
    let id: string;
    do id = `S${this.nextShade++}`; while (this.shades.some((s) => s.id === id));
    return id;
  }

  private emit(out: SimEvent[], name: string, data: Record<string, unknown>): void {
    out.push({ type: "event", tick: this.tick, name, data });
  }

  /** Advance exactly one tick using this tick's input. Returns events that happened in the step. */
  step(input: Input): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.state !== "playing") return ev;
    this.tick++; // events of this step carry tick = k+1
    const P = this.player;

    // movement (camera-relative, normalized, island edge is a wall)
    const th = (input.camYawDeg * Math.PI) / 180;
    let mx = input.move[0], mz = input.move[1];
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    P.x += (wx * TUNING.player_speed) / TPS;
    P.z += (wz * TUNING.player_speed) / TPS;
    const pr = Math.hypot(P.x, P.z);
    if (pr > ISLAND_R) { P.x *= ISLAND_R / pr; P.z *= ISLAND_R / pr; }

    // jump (visual only; gameplay distances are horizontal)
    if (input.jump && !this.prev.jump && P.y === 0) P.vy = JUMP_V;
    if (P.y > 0 || P.vy > 0) {
      P.vy -= GRAVITY / TPS;
      P.y += P.vy / TPS;
      if (P.y <= 0) { P.y = 0; P.vy = 0; }
    }

    // pickups
    for (let i = 0; i < this.motes.length && P.carried < TUNING.carry_capacity; ) {
      const m = this.motes[i];
      if (Math.hypot(m.x - P.x, m.z - P.z) <= TUNING.pickup_radius) {
        this.motes.splice(i, 1);
        P.carried++;
        this.score += TUNING.score.per_mote;
        this.emit(ev, "mote_picked", { carried: P.carried });
      } else i++;
    }

    // interact: deposit into nearest unlit lantern in range
    if (input.interact && !this.prev.interact && P.carried > 0) {
      let best: Lantern | null = null, bd = Infinity;
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = Math.hypot(l.x - P.x, l.z - P.z);
        if (d <= TUNING.interact_radius && d < bd) { best = l; bd = d; }
      }
      if (best) {
        const amount = Math.min(P.carried, TUNING.lantern_cost - best.deposited);
        if (amount > 0) {
          P.carried -= amount;
          best.deposited += amount;
          this.emit(ev, "deposit", { lantern_id: best.id, amount, deposited: best.deposited });
          if (best.deposited >= TUNING.lantern_cost) {
            best.lit = true;
            this.score += TUNING.score.per_lantern;
            this.emit(ev, "lantern_lit", { lantern_id: best.id });
            if (this.lanterns.every((l) => l.lit)) {
              this.score += Math.floor(this.timeLeft) * TUNING.score.per_second_left + P.flames * TUNING.score.per_flame_left;
              this.finish(ev, "won", "all_lit");
            }
          }
        }
      }
    }

    // pulse
    if (this.state === "playing" && input.pulse && !this.prev.pulse && P.pulseCd === 0 && P.carried >= TUNING.pulse_cost) {
      P.carried -= TUNING.pulse_cost;
      P.pulseCd = secToTicks(TUNING.pulse_cooldown_s);
      const stunned: string[] = [];
      for (const s of this.shades) {
        const dx = s.x - P.x, dz = s.z - P.z, d = Math.hypot(dx, dz);
        if (d > TUNING.pulse_radius) continue;
        if (s.stunTicks === 0) this.score += TUNING.score.per_stun;
        s.stunTicks = secToTicks(TUNING.pulse_stun_s) + 1; // +1: this very step already decrements it
        const ux = d > 0 ? dx / d : 1, uz = d > 0 ? dz / d : 0;
        s.x += ux * TUNING.pulse_push_m;
        s.z += uz * TUNING.pulse_push_m;
        this.constrainShade(s);
        stunned.push(s.id);
      }
      this.emit(ev, "pulse", { stunned_ids: stunned });
    }

    if (this.state === "playing") {
      // shades chase; they cannot enter the safe radius of a lit lantern
      for (const s of this.shades) {
        if (s.stunTicks > 0) { s.stunTicks--; continue; }
        const dx = P.x - s.x, dz = P.z - s.z, d = Math.hypot(dx, dz), step = TUNING.shade_speed / TPS;
        if (d > step) { s.x += (dx / d) * step; s.z += (dz / d) * step; } else { s.x = P.x; s.z = P.z; }
        this.constrainShade(s);
      }

      // hits
      if (P.invuln > 0) P.invuln--;
      else {
        for (const s of this.shades) {
          if (s.stunTicks > 0 || Math.hypot(s.x - P.x, s.z - P.z) > TUNING.shade_hit_radius) continue;
          P.flames--;
          const dropped = Math.floor(P.carried * TUNING.hit_drop_ratio);
          P.carried -= dropped;
          for (let k = 0; k < dropped; k++) {
            const a = (k / dropped) * Math.PI * 2;
            this.addMote(P.x + Math.cos(a) * 2.2, P.z + Math.sin(a) * 2.2);
          }
          P.invuln = secToTicks(TUNING.invuln_s);
          this.emit(ev, "player_hit", { by: "shade", flames: P.flames, dropped });
          if (P.flames <= 0) this.finish(ev, "lost", "no_flames");
          break;
        }
      }
    }

    if (P.pulseCd > 0) P.pulseCd--;

    // spawns
    if (this.state === "playing") {
      if (this.randomMotes && --this.moteTimer <= 0) {
        this.moteTimer = MOTE_EVERY_TICKS;
        if (this.motes.length < MOTE_MAX) this.spawnRandomMote();
      }
      if (this.randomShades && --this.shadeTimer <= 0) {
        this.shadeTimer = SHADE_EVERY_TICKS;
        if (this.shades.length < SHADE_MAX) this.spawnShade(ev);
      }
    }

    if (this.state === "playing" && this.tick >= this.endTick) this.finish(ev, "lost", "dawn");
    this.prev.jump = input.jump; this.prev.interact = input.interact; this.prev.pulse = input.pulse;
    return ev;
  }

  private spawnShade(ev: SimEvent[]): void {
    for (let tries = 0; tries < 30; tries++) {
      const r = Math.sqrt(this.rng()) * (ISLAND_R - 4);
      const a = this.rng() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - this.player.x, z - this.player.z) < SHADE_MIN_SPAWN_DIST) continue;
      if (this.lanterns.some((l) => l.lit && Math.hypot(x - l.x, z - l.z) < TUNING.safe_radius)) continue;
      const id = this.freshShadeId();
      this.shades.push({ id, x, z, stunTicks: 0 });
      this.emit(ev, "shade_spawned", { id });
      return;
    }
  }

  /** Keep a shade on the island and outside the safe radius of every lit lantern. */
  private constrainShade(s: Shade): void {
    for (let pass = 0; pass < 3; pass++) {
      for (const l of this.lanterns) {
        if (!l.lit) continue;
        const dx = s.x - l.x, dz = s.z - l.z, d = Math.hypot(dx, dz);
        if (d >= TUNING.safe_radius) continue;
        const ux = d > 0 ? dx / d : 1, uz = d > 0 ? dz / d : 0;
        s.x = l.x + ux * TUNING.safe_radius;
        s.z = l.z + uz * TUNING.safe_radius;
      }
    }
    const r = Math.hypot(s.x, s.z);
    if (r > ISLAND_R) { s.x *= ISLAND_R / r; s.z *= ISLAND_R / r; }
  }

  private finish(ev: SimEvent[], result: "won" | "lost", reason: string): void {
    this.state = result;
    this.emit(ev, "game_over", { result, reason });
  }

  shadeState(s: Shade): string { return s.stunTicks > 0 ? "stunned" : "chase"; }
}
