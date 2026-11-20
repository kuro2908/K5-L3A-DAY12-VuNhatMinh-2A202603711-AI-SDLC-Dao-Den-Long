// Pure game logic: no DOM, no three.js, no Date/Math.random. Fixed 60 ticks/s.
// Tick order follows Ticket-02 "Thứ tự xử lý trong một tick" (numbers in comments refer to that list).
import contract from "../../game.contract.json";
import { MAPS, NightMap, Pad, Vec3, groundAt, solidAt } from "./maps";

export type { Vec3 };
export const TUNING = contract.tuning;
export const TPS = 60;
const T = (s: number) => Math.round(s * TPS);

const GRAVITY = 20;
const JUMP_V = 7;
const STEP_TOL = 0.5; // max step up/down that still counts as walking
const FALL_Y = -10;
const FALL_WAIT = 60;
const MOTE_CAP = 30, MOTE_INITIAL = 20, MOTE_EVERY = 240, DROP_TTL = 480;
const CHARM_TICKS = 600, CHARM_RESPAWN = 2700, CHARM_SPEED = 7.2;
const STUN_PUSH_TICKS = 15, SPAWN_DIST = 15, DETECT = 12, LOSE = 18;
const DRIFTER_MAX = 2, DRIFTER_EVERY = 1200, DRIFTER_SPEED = 7, DRIFTER_IDLE = 2, DRIFTER_FLEE = 240;
const SAFE_EXPEL_TICKS = 30;
const WIND_PERIOD = 1800, WIND_LEN = 300, WIND_WARN = 120, WIND_PUSH = 2;

export type SimState = "playing" | "won" | "lost";
export interface Input { move: [number, number]; camYawDeg: number; jump: boolean; dash: boolean; interact: boolean; pulse: boolean; pause: boolean }
export const IDLE_INPUT: Input = { move: [0, 0], camYawDeg: 0, jump: false, dash: false, interact: false, pulse: false, pause: false };

export type ShadeState = "spawning" | "wander" | "chase" | "recoil" | "stunned";
export interface ScenarioShade { id?: string; pos: Vec3; state?: ShadeState; state_ticks_left?: number }
export interface ScenarioDrifter { id?: string; pos: Vec3; state?: "idle" | "chase" | "flee"; state_ticks_left?: number; stolen?: number }
export interface ScenarioCharm { id?: string; pos: Vec3; available?: boolean; respawn_ticks?: number }
export interface ScenarioLantern { id: string; pos?: Vec3; deposited?: number; lit?: boolean }
export interface Scenario {
  player?: { pos?: Vec3; carried?: number; flames?: number; invuln_ticks?: number; dash_cd_ticks?: number; pulse_cd_ticks?: number; charm_ticks?: number };
  random_motes?: boolean; random_shades?: boolean; random_drifters?: boolean; wind_enabled?: boolean;
  motes?: Vec3[]; shades?: ScenarioShade[]; drifters?: ScenarioDrifter[]; charms?: ScenarioCharm[]; lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface SimEvent { type: "event"; tick: number; name: string; data: Record<string, unknown> }
export interface Mote { id: string; x: number; y: number; z: number; kind: "random" | "dropped"; ttl: number; pi: number }
export interface Shade { id: string; x: number; z: number; gy: number; state: ShadeState; left: number; pushLeft: number; dx: number; dz: number; expel: number }
export interface Drifter { id: string; x: number; y: number; z: number; state: "idle" | "chase" | "flee"; left: number; stolen: number; hx: number; hz: number; fx: number; fz: number }
export interface Charm { id: string; x: number; y: number; z: number; available: boolean; respawn: number }
export interface Lantern { id: string; x: number; y: number; z: number; lit: boolean; deposited: number }
export interface Player {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; fx: number; fz: number;
  flames: number; carried: number; grounded: boolean; launched: boolean;
  invuln: number; dashCd: number; dashLeft: number; dashX: number; dashZ: number; pulseCd: number; charm: number; fallWait: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const idNum = (id: string) => parseInt(id.replace(/\D/g, ""), 10) || 0;
const byId = <T extends { id: string }>(a: T, b: T) => idNum(a.id) - idNum(b.id);
const hxz = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export class Sim {
  tick = 0;       // steps taken (also while paused)
  simTick = 0;    // gameplay steps (frozen while paused)
  paused = false;
  state: SimState = "playing";
  score = 0;
  readonly night: 1 | 2 | 3;
  readonly map: NightMap;
  readonly endTick: number;
  player: Player;
  lanterns: Lantern[] = [];
  motes: Mote[] = [];
  shades: Shade[] = [];
  drifters: Drifter[] = [];
  charms: Charm[] = [];
  wind = { active: false, dir_deg: 0, warning: false };
  private rng: () => number;
  private rm: boolean; private rs: boolean; private rd: boolean; private windOn: boolean;
  private nextMote = 1; private nextShade = 1; private nextDrifter = 1; private nextCharm = 1;
  private prev = { jump: false, dash: false, interact: false, pulse: false, pause: false };
  private edges = { jump: false, dash: false, interact: false, pulse: false, pause: false };
  private invulnActive = false;

  constructor(seed: number, scenario: Scenario = {}, night: 1 | 2 | 3 = 1) {
    this.night = night;
    this.map = MAPS[night];
    this.rng = mulberry32(seed);
    this.rm = scenario.random_motes !== false;
    this.rs = scenario.random_shades !== false;
    this.rd = scenario.random_drifters ?? this.map.drifters;
    this.windOn = scenario.wind_enabled ?? this.map.wind;
    const dur = night === 1 ? TUNING.night1_duration_s : night === 2 ? TUNING.night2_duration_s : TUNING.night3_duration_s;
    this.endTick = T(scenario.time_left_s ?? dur);

    const s = this.map.start;
    this.player = { x: s[0], y: s[1], z: s[2], vx: 0, vy: 0, vz: 0, fx: 0, fz: 1, flames: TUNING.flames, carried: 0, grounded: true, launched: false,
      invuln: 0, dashCd: 0, dashLeft: 0, dashX: 0, dashZ: 0, pulseCd: 0, charm: 0, fallWait: 0 };
    const sp = scenario.player;
    if (sp?.pos) { this.player.x = sp.pos[0]; this.player.y = sp.pos[1]; this.player.z = sp.pos[2]; }
    if (sp?.carried !== undefined) this.player.carried = sp.carried;
    if (sp?.flames !== undefined) this.player.flames = sp.flames;
    this.player.invuln = sp?.invuln_ticks ?? 0;
    this.player.dashCd = sp?.dash_cd_ticks ?? 0;
    this.player.pulseCd = sp?.pulse_cd_ticks ?? 0;
    this.player.charm = sp?.charm_ticks ?? 0;
    this.player.grounded = groundAt(night, this.player.x, this.player.z, this.player.y, 0.05) !== null;

    for (const l of this.map.lanterns) this.lanterns.push({ id: l.id, x: l.pos[0], y: l.pos[1], z: l.pos[2], lit: false, deposited: 0 });
    if (night === 1) this.lanterns.length = TUNING.lantern_count_night1;
    for (const sl of scenario.lanterns ?? []) {
      const l = this.lanterns.find((x) => x.id === sl.id);
      if (!l) continue;
      if (sl.pos) { l.x = sl.pos[0]; l.y = sl.pos[1]; l.z = sl.pos[2]; }
      if (sl.deposited !== undefined) l.deposited = sl.deposited;
      if (sl.lit !== undefined) l.lit = sl.lit;
    }

    if (scenario.motes) for (const m of scenario.motes) this.addMote(m[0], m[1], m[2], "random", -1, -1);
    else if (this.rm) {
      const idx = this.map.motePoints.map((_, i) => i);
      for (let i = 0; i < MOTE_INITIAL && i < idx.length; i++) { const j = i + Math.floor(this.rng() * (idx.length - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      idx.slice(0, MOTE_INITIAL).sort((a, b) => a - b).forEach((pi) => { const p = this.map.motePoints[pi]; this.addMote(p[0], p[1], p[2], "random", -1, pi); });
    }
    for (const sh of scenario.shades ?? []) {
      const id = sh.id ?? this.freshShadeId();
      const gy = groundAt(night, sh.pos[0], sh.pos[2], sh.pos[1], STEP_TOL) ?? 0;
      this.shades.push({ id, x: sh.pos[0], z: sh.pos[2], gy, state: sh.state ?? "wander", left: sh.state_ticks_left ?? 0, pushLeft: 0, dx: 1, dz: 0, expel: 0 });
    }
    if (scenario.drifters) for (const d of scenario.drifters) this.addDrifter(d.id, d.pos, d.state ?? "idle", d.state_ticks_left ?? 0, d.stolen ?? 0);
    const charmDefs = scenario.charms ?? this.map.charms.map((p) => ({ pos: p } as ScenarioCharm));
    for (const c of charmDefs) this.charms.push({ id: c.id ?? `C${this.nextCharm++}`, x: c.pos[0], y: c.pos[1], z: c.pos[2], available: c.available ?? true, respawn: c.respawn_ticks ?? 0 });
  }

  get timeLeft(): number { return (this.endTick - this.simTick) / TPS; }
  get capacity(): number { return TUNING.carry_capacity; }
  private get speed(): number { return this.player.charm > 0 ? CHARM_SPEED : TUNING.player_speed; }
  private shadeSpeed(): number { return this.night === 3 ? TUNING.shade_speed_night3 : TUNING.shade_speed; }

  private emit(out: SimEvent[], name: string, data: Record<string, unknown>): void { out.push({ type: "event", tick: this.tick, name, data }); }
  private addMote(x: number, y: number, z: number, kind: "random" | "dropped", ttl: number, pi: number): void { this.motes.push({ id: `M${this.nextMote++}`, x, y, z, kind, ttl, pi }); }
  private freshShadeId(): string { let id: string; do id = `S${this.nextShade++}`; while (this.shades.some((s) => s.id === id)); return id; }
  private addDrifter(id: string | undefined, pos: Vec3, state: Drifter["state"], left: number, stolen: number): void {
    let did = id;
    if (!did) do did = `D${this.nextDrifter++}`; while (this.drifters.some((d) => d.id === did));
    const a = this.rng() * Math.PI * 2;
    this.drifters.push({ id: did as string, x: pos[0], y: pos[1], z: pos[2], state, left, stolen, hx: Math.cos(a), hz: Math.sin(a), fx: 1, fz: 0 });
  }
  private inSafeZone(x: number, z: number): Lantern | null {
    for (const l of this.lanterns) if (l.lit && hxz(x, z, l.x, l.z) < TUNING.safe_radius) return l;
    return null;
  }

  /** One tick. Returns the events produced by this step. */
  step(input: Input): SimEvent[] {
    const ev: SimEvent[] = [];
    if (this.state !== "playing") return ev;
    this.tick++;
    const P = this.player;

    // 1. input: edges (false -> true) are computed once per tick; pause is handled first
    const prev = this.prev;
    this.edges = { jump: input.jump && !prev.jump, dash: input.dash && !prev.dash, interact: input.interact && !prev.interact, pulse: input.pulse && !prev.pulse, pause: input.pause && !prev.pause };
    this.prev = { jump: input.jump, dash: input.dash, interact: input.interact, pulse: input.pulse, pause: input.pause };
    if (this.edges.pause) {
      this.paused = !this.paused;
      this.emit(ev, this.paused ? "paused" : "resumed", {});
    }
    if (this.paused) return ev;
    this.simTick++;

    // 2. counters
    this.invulnActive = P.invuln > 0;
    if (P.invuln > 0) P.invuln--;
    if (P.dashCd > 0) P.dashCd--;
    if (P.pulseCd > 0) P.pulseCd--;
    if (P.charm > 0) P.charm--;
    for (const m of this.motes) if (m.kind === "dropped") m.ttl--;
    this.motes = this.motes.filter((m) => m.kind !== "dropped" || m.ttl > 0);
    for (const c of this.charms) if (!c.available && c.respawn > 0 && --c.respawn === 0) c.available = true;
    this.updateWind();

    // 3. move Mây
    this.movePlayer(input, ev);
    if (this.state === "playing" && P.fallWait === 0) {
      this.pickups(ev);          // 4
      this.interact(ev);         // 5
    }
    this.updateSafeZones();      // 6
    if (this.state === "playing" && P.fallWait === 0) this.pulse(ev); // 7
    this.moveShades();           // 8
    this.moveDrifters();
    if (P.fallWait === 0) this.contacts(ev); // 9
    this.spawns(ev);             // 10
    this.judge(ev);              // 11
    return ev;
  }

  // ---------------------------------------------------------------- wind
  private updateWind(): void {
    this.wind.active = false; this.wind.warning = false;
    if (!this.windOn) return;
    const t = this.simTick - 1;                       // tick index of this step, 0-based
    const phase = t % WIND_PERIOD, cycle = Math.floor(t / WIND_PERIOD);
    if (phase === WIND_PERIOD - WIND_WARN - 1) this.wind.dir_deg = Math.floor(this.rng() * 360); // direction is fixed when the warning starts
    if (cycle >= 1 && phase < WIND_LEN) this.wind.active = true;
    if (phase >= WIND_PERIOD - WIND_WARN) this.wind.warning = true;
  }

  // ---------------------------------------------------------------- 3. Mây
  private movePlayer(input: Input, ev: SimEvent[]): void {
    const P = this.player;
    if (P.fallWait > 0) {
      if (--P.fallWait === 0) { // respawn
        const s = this.map.start;
        P.x = s[0]; P.z = s[2]; P.y = groundAt(this.night, s[0], s[2], s[1], STEP_TOL) ?? s[1];
        P.vx = P.vy = P.vz = 0; P.grounded = true; P.launched = false; P.invuln = T(TUNING.invuln_s); P.dashLeft = 0;
      }
      return;
    }
    const th = (input.camYawDeg * Math.PI) / 180;
    let mx = input.move[0], mz = input.move[1];
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const wx = mx * Math.cos(th) + mz * Math.sin(th);
    const wz = -mx * Math.sin(th) + mz * Math.cos(th);
    if (ml > 0) { const l = Math.hypot(wx, wz); P.fx = wx / l; P.fz = wz / l; }

    if (this.edges.jump && P.grounded) { P.vy = JUMP_V; P.grounded = false; }

    // dash (not while dashing; the pad launch velocity is kept afterwards)
    if (this.edges.dash && P.dashLeft === 0 && P.dashCd === 0) {
      P.dashLeft = T(TUNING.dash_duration_s);
      P.dashCd = P.charm > 0 ? 0 : T(TUNING.dash_cooldown_s);
      P.dashX = P.fx; P.dashZ = P.fz;
      this.emit(ev, "dash", {});
    }
    const keepVx = P.vx, keepVz = P.vz;
    if (P.dashLeft > 0) {
      P.vx = P.dashX * TUNING.dash_speed; P.vz = P.dashZ * TUNING.dash_speed;
      P.vy = 0;
    } else if (!P.launched) {
      const tx = wx * this.speed, tz = wz * this.speed;
      const dx = tx - P.vx, dz = tz - P.vz, d = Math.hypot(dx, dz), a = this.speed / 6; // reach full speed in 0.1 s
      if (d <= a) { P.vx = tx; P.vz = tz; } else { P.vx += (dx / d) * a; P.vz += (dz / d) * a; }
    }

    // horizontal move with wall collision (slide along axes)
    let dx = P.vx / TPS, dz = P.vz / TPS;
    if (this.wind.active) {
      const a = (this.wind.dir_deg * Math.PI) / 180;
      dx += (Math.cos(a) * WIND_PUSH) / TPS; dz += (Math.sin(a) * WIND_PUSH) / TPS;
    }
    if (!solidAt(this.night, P.x + dx, P.z + dz, P.y)) { P.x += dx; P.z += dz; }
    else if (!solidAt(this.night, P.x + dx, P.z, P.y)) { P.x += dx; P.vz = 0; }
    else if (!solidAt(this.night, P.x, P.z + dz, P.y)) { P.z += dz; P.vx = 0; }
    else { P.vx = P.vz = 0; }

    // vertical
    if (P.dashLeft > 0) {
      // a dash keeps its altitude
    } else if (P.grounded) {
      const g = groundAt(this.night, P.x, P.z, P.y, STEP_TOL);
      if (g !== null && g >= P.y - STEP_TOL) P.y = g;
      else { P.grounded = false; P.vy = 0; }
    }
    if (!P.grounded && P.dashLeft === 0) {
      P.vy -= GRAVITY / TPS;
      const yOld = P.y;
      P.y += P.vy / TPS;
      if (P.vy <= 0) {
        const g = groundAt(this.night, P.x, P.z, yOld, 1e-4);
        if (g !== null && P.y <= g) { P.y = g; P.vy = 0; P.grounded = true; P.launched = false; }
      }
    }
    if (P.dashLeft > 0) {
      P.dashLeft--;
      if (P.dashLeft === 0) { // leave the dash with the previous (or running) velocity
        if (P.launched) { P.vx = keepVx; P.vz = keepVz; } else { P.vx = P.dashX * this.speed; P.vz = P.dashZ * this.speed; }
        const g = groundAt(this.night, P.x, P.z, P.y, 1e-4);
        P.grounded = g !== null && Math.abs(g - P.y) < 1e-3;
      }
    }

    // jump pads
    if (!P.launched) {
      for (const pad of this.map.pads) {
        if (hxz(P.x, P.z, pad.x, pad.z) <= pad.r && P.y <= pad.y + 0.3 && P.y >= pad.y - 0.5) { this.launch(pad); break; }
      }
    }

    // falling off the island
    if (P.y < FALL_Y) {
      const lost = P.carried;
      P.flames--; P.carried = 0; P.fallWait = FALL_WAIT; P.vx = P.vy = P.vz = 0; P.launched = false; P.dashLeft = 0;
      this.emit(ev, "player_hit", { by: "fall", flames: P.flames, dropped: 0, lost });
    }
  }

  private launch(pad: Pad): void {
    const P = this.player;
    P.vy = pad.vy; P.vx = pad.dir[0] * pad.hv; P.vz = pad.dir[1] * pad.hv; P.grounded = false; P.launched = true;
  }

  // ---------------------------------------------------------------- 4. pickups
  private pickups(ev: SimEvent[]): void {
    const P = this.player;
    for (let i = 0; i < this.motes.length && P.carried < this.capacity; ) {
      const m = this.motes[i];
      if (hxz(m.x, m.z, P.x, P.z) <= TUNING.pickup_radius && Math.abs(P.y - m.y) <= 1.5) {
        this.motes.splice(i, 1);
        P.carried++;
        this.emit(ev, "mote_picked", { carried: P.carried });
      } else i++;
    }
    for (const c of this.charms) {
      if (c.available && hxz(c.x, c.z, P.x, P.z) <= TUNING.pickup_radius && Math.abs(P.y - c.y) <= 1.5) {
        c.available = false; c.respawn = CHARM_RESPAWN; P.charm = CHARM_TICKS;
        this.emit(ev, "charm_picked", { charm_id: c.id, charm_ticks: CHARM_TICKS });
      }
    }
  }

  // ---------------------------------------------------------------- 5. lanterns
  private interact(ev: SimEvent[]): void {
    const P = this.player;
    if (!this.edges.interact || P.carried <= 0) return;
    let best: Lantern | null = null, bd = Infinity;
    for (const l of [...this.lanterns].sort(byId)) {
      if (l.lit) continue;
      const d = hxz(l.x, l.z, P.x, P.z);
      if (d <= TUNING.interact_radius && d < bd) { best = l; bd = d; }
    }
    if (!best) return;
    const amount = Math.min(P.carried, TUNING.lantern_cost - best.deposited);
    if (amount <= 0) return;
    P.carried -= amount;
    best.deposited += amount;
    this.score += amount * TUNING.score.per_mote;
    this.emit(ev, "deposit", { lantern_id: best.id, amount, deposited: best.deposited });
    if (best.deposited >= TUNING.lantern_cost) {
      best.lit = true;
      this.score += TUNING.score.per_lantern;
      this.emit(ev, "lantern_lit", { lantern_id: best.id });
      for (const s of this.shades) if (hxz(s.x, s.z, best.x, best.z) < TUNING.safe_radius) s.expel = SAFE_EXPEL_TICKS;
    }
  }

  // ---------------------------------------------------------------- 6. safe zones
  /** Shades caught inside a freshly lit zone are pushed to its rim within 30 ticks. */
  private updateSafeZones(): void {
    for (const s of this.shades) {
      if (s.expel <= 0) continue;
      const l = this.inSafeZone(s.x, s.z);
      if (!l) { s.expel = 0; continue; }
      const dx = s.x - l.x, dz = s.z - l.z, d = Math.hypot(dx, dz);
      const ux = d > 0 ? dx / d : 1, uz = d > 0 ? dz / d : 0;
      const move = s.expel <= 1 ? TUNING.safe_radius - d : (TUNING.safe_radius - d) / s.expel;
      s.x += ux * move; s.z += uz * move;
      s.expel--;
    }
  }

  // ---------------------------------------------------------------- 7. pulse
  private pulse(ev: SimEvent[]): void {
    const P = this.player;
    if (!this.edges.pulse || P.pulseCd > 0 || P.carried < TUNING.pulse_cost) return;
    P.carried -= TUNING.pulse_cost;
    P.pulseCd = T(TUNING.pulse_cooldown_s);
    const cx = P.x, cy = P.y + 0.8, cz = P.z;
    const stunned: string[] = [];
    for (const s of [...this.shades].sort(byId)) {
      if (Math.hypot(s.x - cx, s.gy + 1 - cy, s.z - cz) > TUNING.pulse_radius) continue;
      const dx = s.x - P.x, dz = s.z - P.z, d = Math.hypot(dx, dz);
      s.state = "stunned"; s.left = T(TUNING.pulse_stun_s); s.pushLeft = STUN_PUSH_TICKS; s.expel = 0;
      s.dx = d > 0 ? dx / d : 1; s.dz = d > 0 ? dz / d : 0;
      this.score += TUNING.score.per_stun;
      stunned.push(s.id);
    }
    for (const d of [...this.drifters].sort(byId)) {
      if (Math.hypot(d.x - cx, d.y - cy, d.z - cz) > TUNING.pulse_radius) continue;
      if (d.state === "chase") this.flee(d, 0);
      else if (d.state === "flee" && d.stolen > 0) {
        const amount = d.stolen; d.stolen = 0; d.left = Math.min(d.left, 120);
        const g = groundAt(this.night, d.x, d.z, d.y, STEP_TOL) ?? 0;
        for (let k = 0; k < amount; k++) { const a = (k / amount) * Math.PI * 2; this.addMote(d.x + Math.cos(a) * 0.5, g, d.z + Math.sin(a) * 0.5, "dropped", DROP_TTL, -1); }
        this.emit(ev, "drifter_drop", { drifter_id: d.id, amount });
      }
    }
    this.emit(ev, "pulse", { stunned_ids: stunned });
  }

  private flee(d: Drifter, stolen: number): void {
    const dx = d.x - this.player.x, dz = d.z - this.player.z, l = Math.hypot(dx, dz);
    d.state = "flee"; d.left = DRIFTER_FLEE; d.stolen = stolen;
    d.fx = l > 0 ? dx / l : 1; d.fz = l > 0 ? dz / l : 0;
  }

  // ---------------------------------------------------------------- 8. shades & drifters
  /** Try to move a shade; blocked by cliffs/void, and it cannot enter a lit lantern's safe radius from outside. */
  private tryMoveShade(s: Shade, dx: number, dz: number): boolean {
    let nx = s.x + dx, nz = s.z + dz;
    const g = groundAt(this.night, nx, nz, s.gy, STEP_TOL);
    if (g === null || g < s.gy - STEP_TOL || solidAt(this.night, nx, nz, s.gy)) return false;
    for (const l of this.lanterns) {
      if (!l.lit) continue;
      const d = hxz(nx, nz, l.x, l.z);
      if (d < TUNING.safe_radius && hxz(s.x, s.z, l.x, l.z) >= TUNING.safe_radius - 1e-9) {
        const ux = d > 0 ? (nx - l.x) / d : 1, uz = d > 0 ? (nz - l.z) / d : 0;
        nx = l.x + ux * TUNING.safe_radius; nz = l.z + uz * TUNING.safe_radius;
      }
    }
    s.x = nx; s.z = nz; s.gy = g;
    return true;
  }

  private moveShades(): void {
    const P = this.player, sp = this.shadeSpeed() / TPS;
    for (const s of [...this.shades].sort(byId)) {
      if (s.state === "spawning") s.state = "wander";
      if (s.expel > 0) continue;
      if (s.state === "stunned") {
        if (s.pushLeft > 0) { this.tryMoveShade(s, (s.dx * TUNING.pulse_push_m) / STUN_PUSH_TICKS, (s.dz * TUNING.pulse_push_m) / STUN_PUSH_TICKS); s.pushLeft--; }
        if (--s.left <= 0) s.state = "wander";
        continue;
      }
      if (s.state === "recoil") {
        this.tryMoveShade(s, (s.dx * 2) / 60, (s.dz * 2) / 60);
        if (--s.left <= 0) s.state = "wander";
        continue;
      }
      const dp = hxz(s.x, s.z, P.x, P.z);
      if (s.state === "wander" && dp <= DETECT) s.state = "chase";
      else if (s.state === "chase" && dp > LOSE) s.state = "wander";
      if (s.state === "chase") {
        if (dp > 1e-9) this.tryMoveShade(s, ((P.x - s.x) / dp) * Math.min(sp, dp), ((P.z - s.z) / dp) * Math.min(sp, dp));
      } else {
        let tgt: Lantern | null = null, td = Infinity;
        for (const l of this.lanterns) if (!l.lit) { const d = hxz(s.x, s.z, l.x, l.z); if (d < td) { tgt = l; td = d; } }
        if (tgt && td > 0.5) this.tryMoveShade(s, ((tgt.x - s.x) / td) * sp, ((tgt.z - s.z) / td) * sp);
      }
    }
  }

  private moveDrifters(): void {
    const P = this.player;
    for (const d of [...this.drifters].sort(byId)) {
      const dp = hxz(d.x, d.z, P.x, P.z);
      if (d.state === "idle" && P.carried >= 5 && dp <= 15) d.state = "chase";
      else if (d.state === "chase" && !(P.carried >= 5 && dp <= 15)) d.state = "idle";
      if (d.state === "chase") {
        if (dp > 1e-9) { const s = Math.min(DRIFTER_SPEED / TPS, dp); d.x += ((P.x - d.x) / dp) * s; d.z += ((P.z - d.z) / dp) * s; }
        d.y += (P.y + 1.5 - d.y) * 0.1;
      } else if (d.state === "idle") {
        if (this.simTick % 120 === 0) { const a = this.rng() * Math.PI * 2; d.hx = Math.cos(a); d.hz = Math.sin(a); }
        const cx = this.map.driftCenters[0][0], cz = this.map.driftCenters[0][1];
        if (hxz(d.x, d.z, cx, cz) > this.map.driftRadius + 40) { const l = hxz(d.x, d.z, cx, cz); d.hx = (cx - d.x) / l; d.hz = (cz - d.z) / l; }
        d.x += (d.hx * DRIFTER_IDLE) / TPS; d.z += (d.hz * DRIFTER_IDLE) / TPS;
      } else {
        d.x += (d.fx * DRIFTER_SPEED) / TPS; d.z += (d.fz * DRIFTER_SPEED) / TPS;
        d.left--;
      }
    }
    this.drifters = this.drifters.filter((d) => !(d.state === "flee" && d.left <= 0)); // fled drifters vanish with what they carry
  }

  // ---------------------------------------------------------------- 9. contact
  private contacts(ev: SimEvent[]): void {
    const P = this.player;
    for (const d of [...this.drifters].sort(byId)) {
      if (d.state !== "chase" || P.carried <= 0 || hxz(d.x, d.z, P.x, P.z) > 1.2) continue;
      const amount = Math.min(3, P.carried);
      P.carried -= amount;
      this.flee(d, amount);
      this.emit(ev, "drifter_steal", { drifter_id: d.id, amount, carried: P.carried });
    }
    if (this.invulnActive) return;
    for (const s of [...this.shades].sort(byId)) {
      if ((s.state !== "wander" && s.state !== "chase") || s.expel > 0) continue;
      if (hxz(s.x, s.z, P.x, P.z) > TUNING.shade_hit_radius || Math.abs(P.y - s.gy) > 1.5) continue;
      P.flames--;
      const dropped = Math.floor(P.carried * TUNING.hit_drop_ratio);
      P.carried -= dropped;
      for (let k = 0; k < dropped; k++) {
        const a = (k / dropped) * Math.PI * 2, x = P.x + Math.cos(a) * 2, z = P.z + Math.sin(a) * 2;
        this.addMote(x, groundAt(this.night, x, z, P.y, STEP_TOL) ?? P.y, z, "dropped", DROP_TTL, -1);
      }
      P.invuln = T(TUNING.invuln_s);
      const dx = s.x - P.x, dz = s.z - P.z, d = Math.hypot(dx, dz);
      s.state = "recoil"; s.left = 60; s.dx = d > 0 ? dx / d : 1; s.dz = d > 0 ? dz / d : 0;
      this.emit(ev, "player_hit", { by: "shade", flames: P.flames, dropped });
      break; // at most one flame per tick
    }
  }

  // ---------------------------------------------------------------- 10. spawns
  private spawns(ev: SimEvent[]): void {
    const P = this.player, t = this.simTick;
    if (this.rm && t % MOTE_EVERY === 0 && this.motes.length < MOTE_CAP) {
      const free = this.map.motePoints.map((_, i) => i).filter((i) => !this.motes.some((m) => m.pi === i));
      if (free.length) { const pi = free[Math.floor(this.rng() * free.length)], p = this.map.motePoints[pi]; this.addMote(p[0], p[1], p[2], "random", -1, pi); }
    }
    if (this.rs && t >= 300 && (t - 300) % this.map.shadeEveryTicks === 0) {
      const n = t === 300 ? 2 : 1;
      for (let i = 0; i < n && this.shades.length < this.map.shadeMax; i++) {
        const valid = this.map.shadePoints.filter((p) => hxz(p[0], p[2], P.x, P.z) >= SPAWN_DIST && !this.inSafeZone(p[0], p[2]) && !this.shades.some((s) => hxz(s.x, s.z, p[0], p[2]) < 0.5));
        if (!valid.length) continue;
        const p = valid[Math.floor(this.rng() * valid.length)], id = this.freshShadeId();
        this.shades.push({ id, x: p[0], z: p[2], gy: p[1], state: "spawning", left: 0, pushLeft: 0, dx: 1, dz: 0, expel: 0 });
        this.emit(ev, "shade_spawned", { id });
      }
    }
    if (this.rd && t % DRIFTER_EVERY === 0 && this.drifters.length < DRIFTER_MAX) {
      const c = this.map.driftCenters[Math.floor(this.rng() * this.map.driftCenters.length)], a = this.rng() * Math.PI * 2, r = this.map.driftRadius + 8;
      this.addDrifter(undefined, [c[0] + Math.cos(a) * r, 1.5, c[1] + Math.sin(a) * r], "idle", 0, 0);
    }
  }

  // ---------------------------------------------------------------- 11. win / lose
  private judge(ev: SimEvent[]): void {
    const P = this.player;
    if (P.flames <= 0) return this.finish(ev, "lost", "no_flames");
    if (this.lanterns.every((l) => l.lit)) {
      this.score += Math.floor(this.timeLeft) * TUNING.score.per_second_left + P.flames * TUNING.score.per_flame_left;
      return this.finish(ev, "won", "all_lit");
    }
    if (this.simTick >= this.endTick) this.finish(ev, "lost", "dawn");
  }

  private finish(ev: SimEvent[], result: "won" | "lost", reason: string): void {
    this.state = result;
    this.emit(ev, "game_over", { result, reason });
  }
}

