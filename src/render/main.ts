// Browser front-end: renders the pure Sim with three.js. All gameplay rules live in src/sim.
import * as THREE from "three";
import { DEFAULT_LANTERNS, Input, ISLAND_R, Sim, SimEvent, TPS, TUNING } from "../sim/sim";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- scene ----------
const host = $("game");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1030);
scene.fog = new THREE.FogExp2(0x1b2350, 0.011);
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 900);
const hemi = new THREE.HemisphereLight(0x6a8cc4, 0x16262c, 0.45);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0xa9bcff, 0.7);
moonLight.position.set(-40, 80, -30);
scene.add(moonLight);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

function glowTexture(inner: string, outer: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const moteTex = glowTexture("rgba(255,250,215,1)", "rgba(255,210,100,0)");

// deterministic decor (render-only; never touches the sim RNG)
let decorSeed = 12345;
const drand = () => ((decorSeed = (decorSeed * 1664525 + 1013904223) >>> 0) / 4294967296);

function buildWorld() {
  const ground = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R, 72), new THREE.MeshStandardMaterial({ color: 0x2c5a3a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.7, 16, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3a52, roughness: 1, side: THREE.DoubleSide }));
  cliff.position.y = -8;
  scene.add(cliff);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(600, 48), new THREE.MeshBasicMaterial({ color: 0x24336e }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -12;
  scene.add(sea);
  for (let i = 0; i < 40; i++) {
    const a = drand() * Math.PI * 2, r = ISLAND_R + 10 + drand() * 120;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(8 + drand() * 14, 12, 8), new THREE.MeshBasicMaterial({ color: 0x4a5a9c, fog: true }));
    puff.position.set(Math.cos(a) * r, -10 + drand() * 3, Math.sin(a) * r);
    puff.scale.y = 0.35;
    scene.add(puff);
  }
  const starGeo = new THREE.BufferGeometry();
  const sp: number[] = [];
  for (let i = 0; i < 500; i++) {
    const th = drand() * Math.PI * 2, ph = Math.acos(0.05 + drand() * 0.95);
    sp.push(380 * Math.sin(ph) * Math.cos(th), 380 * Math.cos(ph), 380 * Math.sin(ph) * Math.sin(th));
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdbe4ff, size: 1.6, sizeAttenuation: false, fog: false })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 16), new THREE.MeshBasicMaterial({ color: 0xece6d2, fog: false }));
  moon.position.set(-220, 200, -260);
  scene.add(moon);

  // trees and rocks, kept away from the spawn point and the lanterns
  const spots = DEFAULT_LANTERNS.map((l) => l.pos).concat([[0, 0, 0]]);
  for (let i = 0; i < 90; i++) {
    const a = drand() * Math.PI * 2, r = 12 + Math.sqrt(drand()) * (ISLAND_R - 14);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (spots.some((p) => Math.hypot(p[0] - x, p[2] - z) < 9)) continue;
    const s = 0.8 + drand() * 1.2;
    if (drand() < 0.7) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.3 * s, 1.6 * s, 6), new THREE.MeshStandardMaterial({ color: 0x4a3626 }));
      trunk.position.y = 0.8 * s;
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.2 * s, 3 * s, 7), new THREE.MeshStandardMaterial({ color: 0x1f4a34, flatShading: true }));
      top.position.y = 2.8 * s;
      tree.add(trunk, top);
      tree.position.set(x, 0, z);
      scene.add(tree);
    } else {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 * s, 0), new THREE.MeshStandardMaterial({ color: 0x55536a, flatShading: true }));
      rock.position.set(x, 0.4 * s, z);
      scene.add(rock);
    }
  }
}
buildWorld();

// ---------- actors ----------
interface LanternView { body: THREE.Mesh; light: THREE.PointLight; ring: THREE.Mesh }
const lanternViews = new Map<string, LanternView>();
function ensureLantern(id: string): LanternView {
  let v = lanternViews.get(id);
  if (v) return v;
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0x4a3626 }));
  post.position.y = 1.6;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), new THREE.MeshStandardMaterial({ color: 0x2a2440, emissive: 0xffb347, emissiveIntensity: 0 }));
  body.position.y = 3.6;
  const light = new THREE.PointLight(0xffb347, 0, 48, 2);
  light.position.y = 3.6;
  const ring = new THREE.Mesh(new THREE.RingGeometry(TUNING.safe_radius - 0.2, TUNING.safe_radius, 64), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.visible = false;
  g.add(post, body, light, ring);
  scene.add(g);
  g.userData.id = id;
  v = { body, light, ring };
  (v as LanternView & { group: THREE.Group }).group = g;
  lanternViews.set(id, v);
  return v;
}

const player = new THREE.Group();
const hatLight = new THREE.PointLight(0xffb347, 20, 22, 2);
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.7, 4, 10), new THREE.MeshStandardMaterial({ color: 0xd9a05b }));
  body.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf2cfa0 }));
  head.position.y = 1.55;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0xe8d9a8 }));
  hat.position.y = 1.95;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  lamp.position.set(0.5, 1.6, 0);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0x8a6a40 }));
  string.position.set(0.5, 1.78, 0);
  hatLight.position.set(0.5, 1.6, 0);
  player.add(body, head, hat, lamp, string, hatLight);
  scene.add(player);
}

const shadeViews = new Map<string, THREE.Group>();
function ensureShade(id: string): THREE.Group {
  let g = shadeViews.get(id);
  if (g) return g;
  g = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1a0b33, emissive: 0x4a1fa0, emissiveIntensity: 0.5, roughness: 0.6 }));
  blob.scale.y = 1.15;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe6d9ff });
  for (const sx of [-0.3, 0.3]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), eyeMat);
    e.position.set(sx, 0.25, 0.78);
    blob.add(e);
  }
  g.add(blob);
  g.userData.blob = blob;
  scene.add(g);
  shadeViews.set(id, g);
  return g;
}

const moteViews = new Map<string, THREE.Sprite>();
function ensureMote(id: string): THREE.Sprite {
  let s = moteViews.get(id);
  if (s) return s;
  s = new THREE.Sprite(new THREE.SpriteMaterial({ map: moteTex, color: 0xffe58a, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(1.1);
  scene.add(s);
  moteViews.set(id, s);
  return s;
}

const pulseFx: { mesh: THREE.Mesh; age: number }[] = [];
function spawnPulse(x: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe9b0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.15, z);
  scene.add(mesh);
  pulseFx.push({ mesh, age: 0 });
}

// ---------- input ----------
const held = new Set<string>();
const latched = { jump: false, interact: false, pulse: false };
let faceYaw = 0; // radians, direction Mây is walking
let camYaw = 0; // degrees; at 0 the camera looks along +Z (matches the contract's move convention)
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  held.add(e.code);
  if (e.code === "Space") latched.jump = true;
  if (e.code === "KeyE") latched.interact = true;
  if (e.code === "KeyQ" || e.code === "KeyF") latched.pulse = true;
  if (e.code === "KeyR") startGame();
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => held.delete(e.code));
let dragging = false;
addEventListener("mousedown", () => (dragging = true));
addEventListener("mouseup", () => (dragging = false));
addEventListener("mousemove", (e) => { if (dragging) camYaw -= e.movementX * 0.4; });

function readInput(): Input {
  const k = (...c: string[]) => c.some((x) => held.has(x));
  // at yaw 0 the screen-right direction is world -X, so D maps to x = -1
  const move: [number, number] = [(k("KeyA", "ArrowLeft") ? 1 : 0) - (k("KeyD", "ArrowRight") ? 1 : 0), (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0)];
  if (k("KeyJ")) camYaw += 2;
  if (k("KeyL")) camYaw -= 2;
  if (move[0] !== 0 || move[1] !== 0) {
    const t = (camYaw * Math.PI) / 180;
    faceYaw = Math.atan2(move[0] * Math.cos(t) + move[1] * Math.sin(t), -move[0] * Math.sin(t) + move[1] * Math.cos(t));
  }
  return { move, camYawDeg: camYaw, jump: held.has("Space") || latched.jump, interact: held.has("KeyE") || latched.interact, pulse: held.has("KeyQ") || held.has("KeyF") || latched.pulse };
}

// ---------- game loop ----------
type Mode = "title" | "playing" | "ended";
let mode: Mode = "title";
let sim = new Sim(1);
let acc = 0, last = performance.now(), clock = 0;
const card = $("card"), cardTitle = $("cardTitle"), cardText = $("cardText"), cardBtn = $<HTMLButtonElement>("cardBtn");

function startGame() {
  for (const m of [lanternViews, shadeViews, moteViews] as Map<string, any>[]) {
    for (const v of m.values()) scene.remove(v.group ?? v);
    m.clear();
  }
  sim = new Sim((Date.now() & 0x7fffffff) | 0);
  (window as unknown as { __game: unknown }).__game = { sim };
  mode = "playing";
  card.hidden = true;
}
cardBtn.addEventListener("click", startGame);

function onEvents(events: SimEvent[]) {
  for (const e of events) {
    if (e.name === "pulse") spawnPulse(sim.player.x, sim.player.z);
    if (e.name === "game_over") {
      mode = "ended";
      const won = e.data.result === "won";
      cardTitle.textContent = won ? "Đảo đã sáng lại!" : e.data.reason === "dawn" ? "Trời sáng mất rồi…" : "Ngọn lửa của Mây đã tắt";
      cardText.textContent = `Điểm: ${sim.score} · Đèn đã thắp: ${sim.lanterns.filter((l) => l.lit).length}/${sim.lanterns.length} · Lửa còn: ${sim.player.flames}`;
      cardBtn.textContent = "Chơi lại (R)";
      card.hidden = false;
    }
  }
}

function syncViews(dt: number) {
  const P = sim.player;
  const lit = sim.lanterns.filter((l) => l.lit).length;
  hemi.intensity = 0.9 + 0.12 * lit;
  for (const l of sim.lanterns) {
    const v = ensureLantern(l.id) as LanternView & { group: THREE.Group };
    v.group.position.set(l.x, 0, l.z);
    const frac = l.lit ? 1 : l.deposited / TUNING.lantern_cost;
    (v.body.material as THREE.MeshStandardMaterial).emissiveIntensity = frac * (l.lit ? 2.2 + Math.sin(clock * 3 + l.x) * 0.2 : 1.2);
    v.light.intensity = l.lit ? 260 : 0;
    v.ring.visible = l.lit;
  }
  player.position.set(P.x, P.y, P.z);
  const th = (camYaw * Math.PI) / 180;
  player.rotation.y = faceYaw;
  player.visible = P.invuln === 0 || Math.floor(clock * 14) % 2 === 0;
  hatLight.intensity = 14 + P.carried * 14;

  const seen = new Set<string>();
  for (const s of sim.shades) {
    seen.add(s.id);
    const g = ensureShade(s.id);
    const stunned = s.stunTicks > 0;
    g.position.set(s.x, stunned ? 0.6 : 1 + Math.sin(clock * 3 + s.x) * 0.12, s.z);
    g.rotation.y = Math.atan2(P.x - s.x, P.z - s.z);
    const blob = g.userData.blob as THREE.Mesh;
    blob.scale.y = stunned ? 0.6 : 1.15;
    (blob.material as THREE.MeshStandardMaterial).color.setHex(stunned ? 0x4a5a9c : 0x1a0b33);
  }
  for (const [id, g] of shadeViews) if (!seen.has(id)) { scene.remove(g); shadeViews.delete(id); }

  seen.clear();
  for (const m of sim.motes) {
    seen.add(m.id);
    ensureMote(m.id).position.set(m.x, 0.9 + Math.sin(clock * 2 + m.x * 3) * 0.2, m.z);
  }
  for (const [id, s] of moteViews) if (!seen.has(id)) { scene.remove(s); moteViews.delete(id); }

  for (let i = pulseFx.length - 1; i >= 0; i--) {
    const f = pulseFx[i];
    f.age += dt;
    f.mesh.scale.setScalar(1 + (TUNING.pulse_radius - 1) * Math.min(1, f.age / 0.45));
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - f.age * 1.8);
    if (f.age > 0.5) { scene.remove(f.mesh); pulseFx.splice(i, 1); }
  }

  // third-person camera behind the player along -forward
  const fx = Math.sin(th), fz = Math.cos(th);
  const target = new THREE.Vector3(P.x - fx * 11, 7.5 + P.y * 0.5, P.z - fz * 11);
  camera.position.lerp(target, Math.min(1, dt * 6));
  camera.lookAt(P.x, 1.6 + P.y * 0.5, P.z);
}

const set = (id: string, v: string | number) => { $(id).textContent = String(v); };
function updateHud() {
  const P = sim.player;
  set("flames", P.flames); set("carried", P.carried); set("cap", TUNING.carry_capacity);
  set("lit", sim.lanterns.filter((l) => l.lit).length); set("total", sim.lanterns.length);
  set("time", Math.ceil(sim.timeLeft)); set("score", sim.score);
  set("pulse", P.pulseCd > 0 ? `${(P.pulseCd / TPS).toFixed(1)}s` : P.carried >= TUNING.pulse_cost ? "sẵn sàng" : `cần ${TUNING.pulse_cost} sáng`);
}

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;
  if (mode === "playing") {
    acc += dt;
    while (acc >= 1 / TPS && sim.state === "playing") {
      onEvents(sim.step(readInput()));
      latched.jump = latched.interact = latched.pulse = false;
      acc -= 1 / TPS;
    }
  } else acc = 0;
  syncViews(dt);
  updateHud();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
camera.position.set(0, 8, -11);
requestAnimationFrame(frame);
