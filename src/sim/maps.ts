// Standard maps (Ticket-02 Part 2). Angles are measured from +X; a point at angle a, radius r is (r cos a, r sin a) in (x, z)
// (this is the convention the canonical Night-1 lantern coordinates follow: L1 = 90deg -> (0, 25)).
export type Vec3 = [number, number, number];
export interface Pad { x: number; y: number; z: number; r: number; vy: number; hv: number; dir: [number, number] }
export interface NightMap {
  night: 1 | 2 | 3;
  start: Vec3;
  lanterns: { id: string; pos: Vec3 }[];
  motePoints: Vec3[];
  shadePoints: Vec3[];
  shadeEveryTicks: number;
  shadeMax: number;
  pads: Pad[];
  charms: Vec3[];
  drifters: boolean;
  wind: boolean;
  driftCenters: [number, number][];
  driftRadius: number;
}

const d2r = (d: number) => (d * Math.PI) / 180;
const pol = (r: number, deg: number, y = 0, cx = 0): Vec3 => [cx + r * Math.cos(d2r(deg)), y, r * Math.sin(d2r(deg))];
const ring = (r: number, step: number, from = 0, y = 0, cx = 0, count?: number): Vec3[] => {
  const n = count ?? Math.round(360 / step);
  return Array.from({ length: n }, (_, i) => pol(r, from + i * step, y, cx));
};
const unit = (dx: number, dz: number): [number, number] => { const l = Math.hypot(dx, dz); return [dx / l, dz / l]; };

const night1: NightMap = {
  night: 1,
  start: [0, 0, 0],
  lanterns: [
    { id: "L1", pos: [0, 0, 25] }, { id: "L2", pos: [23.8, 0, 7.7] }, { id: "L3", pos: [14.7, 0, -20.2] },
    { id: "L4", pos: [-14.7, 0, -20.2] }, { id: "L5", pos: [-23.8, 0, 7.7] },
  ],
  motePoints: [...ring(12, 45), ...ring(33, 22.5)],
  shadePoints: ring(37, 30, 15),
  shadeEveryTicks: 480, shadeMax: 6,
  pads: [], charms: [], drifters: false, wind: false, driftCenters: [[0, 0]], driftRadius: 50,
};

const night2: NightMap = {
  night: 2,
  start: [0, 0, 0],
  lanterns: [
    { id: "L1", pos: [0, 0, 20] }, { id: "L2", pos: [17, 0, -10] }, { id: "L3", pos: [-17, 0, -10] },
    { id: "L4", pos: [70, 0, 20] }, { id: "L5", pos: [87, 0, -10] }, { id: "L6", pos: [53, 0, -10] },
  ],
  motePoints: [...ring(10, 90, 0), ...ring(22, 45, 0), ...ring(10, 90, 0, 0, 70), ...ring(22, 45, 0, 0, 70)],
  shadePoints: [...ring(26, 45, 22.5), ...ring(26, 45, 22.5, 0, 70)],
  shadeEveryTicks: 420, shadeMax: 8,
  pads: [
    { x: 20, y: 0, z: 18, r: 1, vy: 14, hv: 24, dir: unit(70 - 20, 0 - 18) },
    { x: 50, y: 0, z: -18, r: 1, vy: 14, hv: 24, dir: unit(0 - 50, 0 + 18) },
  ],
  charms: [[35, 0, 0]],
  drifters: true, wind: false, driftCenters: [[0, 0], [70, 0]], driftRadius: 36,
};

const night3: NightMap = {
  night: 3,
  start: [0, 0, -15], // the centre is inside the bell tower's tier; start on the ground tier (assumption, see docs)
  lanterns: [
    { id: "L1", pos: [0, 6, 6] }, { id: "L2", pos: [18, 3, 10] }, { id: "L3", pos: [-18, 3, 10] },
    { id: "L4", pos: [35, 0, -10] }, { id: "L5", pos: [-35, 0, -10] }, { id: "L6", pos: [20, 0, -35] }, { id: "L7", pos: [-20, 0, -35] },
  ],
  motePoints: [...ring(34, 20, 0, 0, 0, 18), ...ring(18, 20, 20, 3, 0, 8), ...ring(5, 90, 45, 6)],
  shadePoints: ring(43, 22.5, 0),
  shadeEveryTicks: 360, shadeMax: 10,
  pads: [{ x: 0, y: 3, z: 13, r: 1, vy: 12, hv: 8, dir: [0, -1] }],
  charms: [[30, 0, 25], [-30, 0, 25]],
  drifters: true, wind: true, driftCenters: [[0, 0]], driftRadius: 55,
};

export const MAPS: Record<number, NightMap> = { 1: night1, 2: night2, 3: night3 };

/** Heights of every walkable surface covering (x, z). Empty array = cloud sea (fall). */
export function surfacesAt(night: number, x: number, z: number): number[] {
  const r = Math.hypot(x, z);
  if (night === 1) return r <= 40 ? [0] : [];
  if (night === 2) {
    if (Math.hypot(x, z) <= 28 || Math.hypot(x - 70, z) <= 28) return [0];
    return x >= 26 && x <= 44 && Math.abs(z) <= 2 ? [0] : [];
  }
  const out: number[] = [];
  if (r <= 45) out.push(0);
  if (r >= 12 && r <= 24 && z > 0) out.push(3);
  if (r <= 8) out.push(6);
  for (const deg of [30, 150]) {
    const c = Math.cos(d2r(deg)), s = Math.sin(d2r(deg));
    const t = x * c + z * s, lat = -x * s + z * c;
    if (t >= 24 && t <= 30 && Math.abs(lat) <= 1.5) out.push((3 * (30 - t)) / 6);
  }
  return out;
}

/** Highest surface at (x, z) that is not above `y + tol`; null when there is none. */
export function groundAt(night: number, x: number, z: number, y: number, tol: number): number | null {
  let best: number | null = null;
  for (const h of surfacesAt(night, x, z)) if (h <= y + tol && (best === null || h > best)) best = h;
  return best;
}

/** True when moving a body with feet at height `y` into (x, z) would run into a wall or the bell tower. */
export function solidAt(night: number, x: number, z: number, y: number): boolean {
  for (const h of surfacesAt(night, x, z)) if (h > y + 0.5) return true;
  if (night === 3 && Math.hypot(x, z) < 2 && y < 14) return true;
  return false;
}
