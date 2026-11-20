// Scenery for the three standard maps. Pure visuals: the sim owns all geometry rules (src/sim/maps.ts).
import * as THREE from "three";
import { MAPS } from "../sim/maps";

export const PAL = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f, sea: 0x12384a,
  lampOn: 0xffb347, lampCore: 0xffe9b0, lampOff: 0x5b5f6e, moteCore: 0xfff6c2, moteHalo: 0xffe58a,
  shade: 0x120a1a, shadeRim: 0x7a3cff, shadeStun: 0x3a3450, may: 0xe8e2d0, scarf: 0xc8102e,
  gold: 0xf2c14e, drifter: 0x8fa3b8,
};

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, ...extra });
let seed = 4242;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

function disc(cx: number, r: number, group: THREE.Group): void {
  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.4, 64), mat(PAL.grass));
  top.position.set(cx, -0.2, 0);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.6, 0.55, 8, 64), mat(PAL.sand));
  rim.rotation.x = Math.PI / 2; rim.position.set(cx, 0.02, 0);
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.55, 14, 48, 1, true), mat(0x35364f, { side: THREE.DoubleSide }));
  rock.position.set(cx, -7.2, 0);
  group.add(top, rim, rock);
}

/** Trees as two InstancedMesh (trunks + tops): shared geometry and materials, 2 draw calls instead of ~100. */
function decor(group: THREE.Group, cx: number, r: number, count: number, avoid: [number, number][]): void {
  const spots: { x: number; z: number; s: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, d = 6 + Math.sqrt(rnd()) * (r - 9), x = cx + Math.cos(a) * d, z = Math.sin(a) * d;
    if (avoid.some(([ax, az]) => Math.hypot(ax - x, az - z) < 5)) continue;
    spots.push({ x, z, s: 0.8 + rnd() * 1.1 });
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6), mat(PAL.wood), Math.max(1, spots.length));
  const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 3, 7), mat(0x1f4a3d, { flatShading: true }), Math.max(1, spots.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  spots.forEach((t, i) => {
    sc.set(t.s, t.s, t.s);
    m.compose(p.set(t.x, 0.8 * t.s, t.z), q, sc); trunks.setMatrixAt(i, m);
    m.compose(p.set(t.x, 2.8 * t.s, t.z), q, sc); tops.setMatrixAt(i, m);
  });
  trunks.count = tops.count = spots.length;
  group.add(trunks, tops);
}

export function buildWorld(night: 1 | 2 | 3): THREE.Group {
  const g = new THREE.Group();
  seed = 4242 + night;
  const map = MAPS[night];
  const avoid = map.lanterns.map((l) => [l.pos[0], l.pos[2]] as [number, number]).concat([[map.start[0], map.start[2]]]);

  const sea = new THREE.Mesh(new THREE.CircleGeometry(700, 48), new THREE.MeshBasicMaterial({ color: PAL.sea }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -12;
  g.add(sea);
  const puffGeo = new THREE.SphereGeometry(1, 10, 8), puffMat = new THREE.MeshBasicMaterial({ color: 0x1d4a60 }); // shared by all clouds
  for (let i = 0; i < 36; i++) {
    const a = rnd() * Math.PI * 2, r = 60 + rnd() * 160, size = 8 + rnd() * 14;
    const puff = new THREE.Mesh(puffGeo, puffMat);
    puff.position.set(Math.cos(a) * r + (night === 2 ? 35 : 0), -10.5 + rnd() * 2, Math.sin(a) * r); puff.scale.set(size, size * 0.3, size);
    g.add(puff);
  }

  if (night === 1) { disc(0, 40, g); decor(g, 0, 40, 40, avoid); }
  if (night === 2) {
    disc(0, 28, g); disc(70, 28, g);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), mat(PAL.wood));
    bridge.position.set(35, -0.15, 0);
    g.add(bridge);
    for (let x = 27; x <= 43; x += 1.6) { const plank = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 4), mat(0x4a321f)); plank.position.set(x, 0.02, 0); g.add(plank); }
    decor(g, 0, 28, 14, avoid); decor(g, 70, 28, 14, avoid);
  }
  if (night === 3) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(45, 45, 0.4, 72), mat(PAL.grass));
    base.position.y = -0.2;
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(45, 25, 14, 48, 1, true), mat(0x35364f, { side: THREE.DoubleSide }));
    rock.position.y = -7.2;
    g.add(base, rock);
    // tier 1: half annulus 12..24 on the z>0 side. Shape (x, y) -> world (x, z) after rotateX(+90deg); extrusion goes downward.
    const shape = new THREE.Shape();
    shape.absarc(0, 0, 24, 0, Math.PI, false);
    shape.absarc(0, 0, 12, Math.PI, 0, true);
    const ringGeo = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 40 });
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, mat(PAL.sand));
    ring.position.y = 3;
    const top1 = new THREE.Mesh(new THREE.ShapeGeometry(shape, 40).rotateX(Math.PI / 2), mat(PAL.grass));
    top1.position.y = 3.01;
    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 6, 40), mat(PAL.sand));
    tier2.position.y = 3;
    const tier2Top = new THREE.Mesh(new THREE.CircleGeometry(8, 40), mat(PAL.grass));
    tier2Top.rotation.x = -Math.PI / 2; tier2Top.position.y = 6.01;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 8, 20), mat(PAL.wood));
    tower.position.y = 10;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3, 2.4, 20), mat(0x5a2f2f));
    roof.position.y = 15.2;
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 10), mat(PAL.gold, { emissive: PAL.gold, emissiveIntensity: 0.4 }));
    bell.position.y = 12.5;
    g.add(ring, top1, tier2, tier2Top, tower, roof, bell);
    for (const phi of [30, 150]) {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(6, 3), 0.3, 3), mat(PAL.wood));
      const r = 27, a = (phi * Math.PI) / 180;
      ramp.position.set(Math.cos(a) * r, 1.5 - 0.15, Math.sin(a) * r);
      ramp.rotation.set(0, Math.PI - a, Math.atan2(3, 6), "XYZ");
      g.add(ramp);
    }
    decor(g, 0, 45, 30, avoid.concat([[0, 0]]));
  }

  for (const p of map.pads) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.25, 24), mat(PAL.gold, { emissive: PAL.gold, emissiveIntensity: 0.7 }));
    pad.position.set(p.x, p.y + 0.12, p.z);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), new THREE.MeshBasicMaterial({ color: PAL.moteCore }));
    arrow.position.set(p.x, p.y + 0.7, p.z);
    g.add(pad, arrow);
  }
  return g;
}
