// Browser front-end: screens, HUD, input, audio and three.js rendering. All gameplay rules live in src/sim.
import * as THREE from "three";
import { Input, Sim, SimEvent, TPS, TUNING } from "../sim/sim";
import { Audio3 } from "./audio";
import { loadSettings, saveSettings } from "./settings";
import { PAL, buildWorld } from "./world";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rimColor = (cb: boolean) => (cb ? 0x00b3ff : PAL.shadeRim); // Ticket-03 section 6: #7A3CFF -> #00B3FF
const on = (id: string, fn: () => void) => $(id).addEventListener("click", fn);

// ---------------------------------------------------------------- three.js scene
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
$("game").appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(PAL.sky);
scene.fog = new THREE.FogExp2(PAL.fog, 0.008);
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 900);
const ambient = new THREE.AmbientLight(0xffffff, 0.15);
const moonLight = new THREE.DirectionalLight(0xa9bcff, 0.9);
moonLight.position.set(-40, 80, -30);
scene.add(ambient, moonLight);
{
  const pts: number[] = [];
  for (let i = 0; i < 500; i++) { const th = Math.random() * 6.28, ph = Math.acos(0.05 + Math.random() * 0.95); pts.push(380 * Math.sin(ph) * Math.cos(th), 380 * Math.cos(ph), 380 * Math.sin(ph) * Math.sin(th)); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdbe4ff, size: 1.6, sizeAttenuation: false, fog: false })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(22, 20, 14), new THREE.MeshBasicMaterial({ color: 0xece6d2, fog: false }));
  moon.position.set(-220, 200, -260); scene.add(moon);
}
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

function glow(inner: string, outer: string): THREE.Texture {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const moteTex = glow("rgba(255,246,194,1)", "rgba(255,229,138,0)");
const haloTex = glow("rgba(255,200,110,0.9)", "rgba(255,150,40,0)");
const charmTex = (() => {
  const c = document.createElement("canvas"); c.width = 64; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#C8102E"; g.fillRect(0, 0, 64, 96); g.strokeStyle = "#F2C14E"; g.lineWidth = 6; g.strokeRect(3, 3, 58, 90);
  g.fillStyle = "#F2C14E"; g.font = "bold 42px serif"; g.textAlign = "center"; g.fillText("風", 32, 62);
  return new THREE.CanvasTexture(c);
})();

// ---------------------------------------------------------------- actors
const std = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
const player = new THREE.Group();
const hatGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow("rgba(255,233,176,1)", "rgba(255,179,71,0)"), blending: THREE.AdditiveBlending, depthWrite: false }));
{
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.7, 4, 10), std(PAL.may)); body.position.y = 0.8;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.1, 8, 16), std(PAL.scarf)); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), std(0xf2cfa0)); head.position.y = 1.6;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 20), std(0xd9c58a)); hat.position.y = 1.98;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: PAL.lampOn })); lamp.position.set(0.55, 1.6, 0);
  hatGlow.position.copy(lamp.position);
  player.add(body, scarf, head, hat, lamp, hatGlow);
  scene.add(player);
}

interface LanternView { group: THREE.Group; body: THREE.Mesh; halo: THREE.Sprite; pool: THREE.Mesh; ring: THREE.Mesh; bar: THREE.Group; barFill: THREE.Mesh; tear: THREE.Mesh }
const lanternViews = new Map<string, LanternView>();
const shadeViews = new Map<string, THREE.Group>();
const moteViews = new Map<string, THREE.Sprite>();
const drifterViews = new Map<string, THREE.Group>();
const charmViews = new Map<string, THREE.Mesh>();
let world: THREE.Group | null = null;
const fx: { mesh: THREE.Mesh; age: number }[] = [];
let leaves: THREE.Points | null = null;

function makeLantern(): LanternView {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 3.2, 8), std(PAL.wood)); post.position.y = 1.6;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), std(PAL.lampOff, { emissive: PAL.lampOn, emissiveIntensity: 0 })); body.position.y = 3.6;
  // no real point lights (they are costly and force shader recompiles): additive halo + a glow pool on the ground
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 })); halo.position.y = 3.6; halo.scale.setScalar(9);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(TUNING.safe_radius * 1.6, 40), new THREE.MeshBasicMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = 0.06;
  const ring = new THREE.Mesh(new THREE.RingGeometry(TUNING.safe_radius - 0.2, TUNING.safe_radius, 64), new THREE.MeshBasicMaterial({ color: PAL.lampOn, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false;
  // fuel bar above the lantern (only while lit) and a torn-paper patch that shows only when it is out
  const barBg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.28), new THREE.MeshBasicMaterial({ color: 0x14183a, side: THREE.DoubleSide }));
  const barFill = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.18), new THREE.MeshBasicMaterial({ color: PAL.lampOn, side: THREE.DoubleSide }));
  const bar = new THREE.Group(); // billboard: the whole group faces the camera so the fill stays in front of the background
  barFill.position.z = 0.02; bar.add(barBg, barFill); bar.position.y = 5.1;
  const tear = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.9), new THREE.MeshBasicMaterial({ color: 0x23242e, side: THREE.DoubleSide }));
  tear.position.set(0.5, 3.4, 0.55); tear.rotation.z = 0.5;
  group.add(post, body, halo, pool, ring, bar, tear); scene.add(group);
  return { group, body, halo, pool, ring, bar, barFill, tear };
}
function makeShade(): THREE.Group {
  const g = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), std(PAL.shade, { emissive: PAL.shadeRim, emissiveIntensity: 0.25 })); blob.scale.y = 1.15;
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), new THREE.MeshBasicMaterial({ color: PAL.shadeRim, side: THREE.BackSide })); rim.scale.y = 1.15;
  const eye = new THREE.MeshBasicMaterial({ color: 0xe6d9ff });
  for (const sx of [-0.3, 0.3]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), eye); e.position.set(sx, 0.25, 0.78); blob.add(e); }
  const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: PAL.shadeRim }));
  beam.frustumCulled = false; beam.visible = false;
  g.add(blob, rim); g.userData = { blob, rim, beam, eye }; scene.add(g); scene.add(beam);
  return g;
}
function makeDrifter(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.9 - i * 0.08), new THREE.MeshBasicMaterial({ color: PAL.drifter })); seg.position.x = -i * 0.5; g.add(seg); }
  scene.add(g);
  return g;
}

function loadNight(night: 1 | 2 | 3): void {
  if (world) scene.remove(world);
  world = buildWorld(night); scene.add(world);
  for (const m of [lanternViews, shadeViews, moteViews, drifterViews, charmViews] as Map<string, any>[]) {
    for (const v of m.values()) scene.remove(v.group ?? v);
    m.clear();
  }
  if (leaves) { scene.remove(leaves); leaves = null; }
  if (night === 3) {
    const pts = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) { pts[i * 3] = (Math.random() - 0.5) * 60; pts[i * 3 + 1] = Math.random() * 14; pts[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    leaves = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x8fb36b, size: 0.35 }));
    leaves.visible = false; scene.add(leaves);
  }
}

// ---------------------------------------------------------------- input & settings
const settings = loadSettings();
const audio = new Audio3();
audio.setVolume(settings.volume);
document.body.classList.toggle("cb", settings.colorblind);
const held = new Set<string>();
const latched = { jump: false, dash: false, interact: false, pulse: false };
let camYaw = 0, faceYaw = 0, dragging = false;
addEventListener("keydown", (e) => {
  if (e.repeat) return;
  held.add(e.code);
  if (screen === "play") {
    if (e.code === "Space") { latched.jump = true; if (sim.player.grounded) audio.play("jump"); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") latched.dash = true;
    if (e.code === "KeyE") latched.interact = true;
    if (e.code === "KeyQ" || e.code === "KeyF") latched.pulse = true;
    if (e.code === "Escape" || e.code === "KeyP") show("pause");
  } else if (screen === "pause" && (e.code === "Escape" || e.code === "KeyP")) show("play");
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
});
addEventListener("keyup", (e) => held.delete(e.code));
addEventListener("blur", () => held.clear());
addEventListener("mousedown", () => (dragging = true));
addEventListener("mouseup", () => (dragging = false));
addEventListener("mousemove", (e) => { if (dragging && screen === "play") camYaw -= e.movementX * 0.4 * settings.sensitivity; });

function readInput(): Input {
  const k = (...c: string[]) => c.some((x) => held.has(x));
  // at yaw 0 the screen-right direction is world -X, so D maps to x = -1
  const move: [number, number] = [(k("KeyA", "ArrowLeft") ? 1 : 0) - (k("KeyD", "ArrowRight") ? 1 : 0), (k("KeyW", "ArrowUp") ? 1 : 0) - (k("KeyS", "ArrowDown") ? 1 : 0)];
  if (k("KeyJ")) camYaw += 2 * settings.sensitivity;
  if (k("KeyL")) camYaw -= 2 * settings.sensitivity;
  if (move[0] || move[1]) {
    const t = (camYaw * Math.PI) / 180;
    faceYaw = Math.atan2(move[0] * Math.cos(t) + move[1] * Math.sin(t), -move[0] * Math.sin(t) + move[1] * Math.cos(t));
  }
  return { move, camYawDeg: camYaw, jump: held.has("Space") || latched.jump, dash: k("ShiftLeft", "ShiftRight") || latched.dash,
    interact: held.has("KeyE") || latched.interact, pulse: k("KeyQ", "KeyF") || latched.pulse, pause: false };
}

// ---------------------------------------------------------------- game flow
type Screen = "menu" | "intro" | "play" | "pause" | "settings" | "result" | "dawn";
let screen: Screen = "menu", settingsFrom: Screen = "menu";
let night: 1 | 2 | 3 = 1, totalScore = 0;
let sim = new Sim(1);
const need = (n: number) => Math.ceil(TUNING.win_ratio * n);
const INTRO = [
  ["Đêm 1 · Đảo Bến", "Đèn ở bến tắt hết rồi, con. Thắp lại các ngọn Đèn Lồng Lớn và giữ cho ít nhất 3 trong 5 ngọn còn sáng tới bình minh. Đèn cạn dầu thì châm thêm đom đóm nhé."],
  ["Đêm 2 · Đảo Cau", "Hai đảo nối nhau bằng một cây cầu tre, không có lan can. Bước lên bục vàng để bay sang đảo bên kia. Coi chừng Gió Lạc: nó hay cướp đom đóm của người mang nặng. Cần giữ sáng ít nhất 4 trong 6 ngọn tới bình minh. Bóng Mực sẽ lẻn tới hút dầu đèn yếu."],
  ["Đêm 3 · Đảo Chuông", "Đảo Chuông có ba tầng. Đi lên bằng dốc hoặc bục vàng. Gió mạnh sẽ nổi lên mỗi nửa phút, thấy lá bay thì bám chắc nhé. Cần giữ sáng ít nhất 5 trong 7 ngọn tới bình minh."],
];
const ALL: Screen[] = ["menu", "intro", "pause", "settings", "result", "dawn"];
const ID: Record<string, string> = { menu: "sMenu", intro: "sIntro", pause: "sPause", settings: "sSettings", result: "sResult", dawn: "sDawn" };

function show(s: Screen): void {
  screen = s;
  for (const k of ALL) $(ID[k]).classList.toggle("hidden", k !== s);
  $("hud").classList.toggle("hidden", s !== "play" && s !== "pause");
  audio.setMusic(s === "play");
  if (s === "settings") { $<HTMLInputElement>("setVol").value = String(Math.round(settings.volume * 100)); $<HTMLInputElement>("setSens").value = String(Math.round(settings.sensitivity * 100)); syncSettingsLabels(); $<HTMLInputElement>("setCb").checked = settings.colorblind; }
}
function syncSettingsLabels() { $("setVolV").textContent = `${Math.round(settings.volume * 100)}%`; $("setSensV").textContent = `${Math.round(settings.sensitivity * 100)}%`; }

function startNight(n: 1 | 2 | 3): void {
  night = n;
  sim = new Sim((Date.now() & 0x7fffffff) | 0, {}, n);
  (window as unknown as { __game: unknown }).__game = { get sim() { return sim; } };
  camYaw = 0; faceYaw = 0; lastSec = -1;
  loadNight(n);
  show("play");
}
function showIntro(n: 1 | 2 | 3): void {
  night = n;
  $("introName").textContent = INTRO[n - 1][0]; $("introQuote").textContent = `“${INTRO[n - 1][1]}”`;
  show("intro");
}

on("bPlay", () => { audio.resume(); totalScore = 0; showIntro(1); });
on("bSettings", () => { audio.resume(); settingsFrom = "menu"; show("settings"); });
on("bGo", () => { audio.resume(); startNight(night); });
on("bResume", () => show("play"));
on("bRestart", () => startNight(night));
on("bPauseSettings", () => { settingsFrom = "pause"; show("settings"); });
on("bMenu", () => show("menu"));
on("bBack", () => show(settingsFrom));
on("bResMenu", () => show("menu"));
on("bDawnMenu", () => show("menu"));
on("bNext", () => { if (sim.state === "won") showIntro((night + 1) as 2 | 3); else startNight(night); });
$<HTMLInputElement>("setVol").addEventListener("input", (e) => { settings.volume = Number((e.target as HTMLInputElement).value) / 100; audio.setVolume(settings.volume); syncSettingsLabels(); saveSettings(settings); });
$<HTMLInputElement>("setCb").addEventListener("change", (e) => { settings.colorblind = (e.target as HTMLInputElement).checked; document.body.classList.toggle("cb", settings.colorblind); saveSettings(settings); });
$<HTMLInputElement>("setSens").addEventListener("input", (e) => { settings.sensitivity = Number((e.target as HTMLInputElement).value) / 100; syncSettingsLabels(); saveSettings(settings); });

let lastSec = -1;
function onEvents(events: SimEvent[]): void {
  for (const e of events) {
    switch (e.name) {
      case "mote_picked": audio.play("pick"); break;
      case "lantern_lit": audio.play("light"); break;
      case "pulse": audio.play("pulse"); spawnPulse(); break;
      case "dash": audio.play("dash"); break;
      case "charm_picked": audio.play("charm"); break;
      case "drifter_steal": audio.play("steal"); break;
      case "shade_spawned": audio.play("spawn"); break;
      case "player_hit": audio.play("hit"); flash(); break;
      case "game_over": endNight(e.data.result === "won", String(e.data.reason)); break;
    }
  }
}
function flash() { const f = $("flash"); f.style.opacity = "0.45"; setTimeout(() => (f.style.opacity = "0"), 120); }
function spawnPulse() {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: PAL.lampCore, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(sim.player.x, sim.player.y + 0.2, sim.player.z); scene.add(mesh); fx.push({ mesh, age: 0 });
}
function endNight(won: boolean, reason: string): void {
  audio.play(won ? "win" : "lose");
  if (won) totalScore += sim.score;
  setTimeout(() => {
    if (won && night === 3) { $("dawnScore").textContent = String(totalScore); show("dawn"); return; }
    $("resTitle").textContent = won ? `Đảo vẫn sáng tới bình minh!` : reason === "dawn" ? "Trời sáng mà đảo chưa đủ sáng…" : "Ngọn lửa của Mây đã tắt";
    $("resText").textContent = `Điểm đêm này: ${sim.score}${won ? ` · Tổng: ${totalScore}` : ""}`;
    $("bNext").textContent = won ? "Đêm kế tiếp" : "Chơi lại Đêm này";
    show("result");
  }, 900);
}

// ---------------------------------------------------------------- per-frame sync
const set = (id: string, v: string) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
function updateHud(): void {
  const P = sim.player, lit = sim.lanterns.filter((l) => l.lit).length;
  set("hudFlames", "❤".repeat(Math.max(0, P.flames)) + "♡".repeat(Math.max(0, TUNING.flames - P.flames)));
  const sec = Math.max(0, Math.ceil(sim.timeLeft));
  set("hudTime", `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`);
  $("hudTime").classList.toggle("low", sec <= 30);
  if (sec <= 10 && sec !== lastSec && sec > 0 && screen === "play") audio.play("tick");
  lastSec = sec;
  set("hudLit", `${lit}/${sim.lanterns.length} (cần ${need(sim.lanterns.length)})`); set("hudScore", String(sim.score));
  const bar = $("hudMotes");
  while (bar.children.length < sim.capacity) { const d = document.createElement("div"); d.className = "slot"; bar.appendChild(d); }
  while (bar.children.length > sim.capacity) bar.removeChild(bar.lastChild as Node);
  set("hudCap", `${P.carried}/${sim.capacity}`);
  Array.from(bar.children).forEach((c, i) => c.classList.toggle("on", i < P.carried));
  $("cdDash").classList.toggle("ready", P.dashCd === 0);
  $("cdPulse").classList.toggle("ready", P.pulseCd === 0 && P.carried >= TUNING.pulse_cost);
  // prompt near an unlit lantern
  const near = sim.lanterns.filter((l) => (!l.lit || l.fuelU < TUNING.fuel_max * 60) && Math.hypot(l.x - P.x, l.z - P.z) <= TUNING.interact_radius + 1.5)[0];
  const pr = $("hudPrompt");
  pr.classList.toggle("hidden", !near);
  if (near) pr.textContent = near.lit ? `E — Châm dầu (${Math.round(near.fuelU / 60)}/${TUNING.fuel_max})` : `E — Nạp ánh sáng (${near.deposited}/${near.everLit ? TUNING.relight_cost : TUNING.lantern_cost})`;
  const warn = $("hudWarn");
  const lowFuel = sim.lanterns.some((l) => l.lit && l.fuelU < TUNING.low_fuel_threshold * 60);
  const draining = sim.shades.some((s) => s.state === "drain");
  warn.classList.toggle("hidden", !sim.wind.warning && !sim.wind.active && !lowFuel && !draining);
  warn.textContent = draining ? "Bóng Mực đang hút dầu đèn!" : lowFuel ? "Đèn sắp hết dầu!" : sim.wind.active ? "Gió mạnh!" : "Gió sắp thổi!";
  // arrow to the nearest unlit lantern when it is off-screen
  let target: { x: number; y: number; z: number } | null = null, td = Infinity;
  for (const l of sim.lanterns) if (!l.lit) { const d = Math.hypot(l.x - P.x, l.z - P.z); if (d < td) { td = d; target = l; } }
  const arrow = $("arrow");
  if (target) {
    const v = new THREE.Vector3(target.x, target.y + 3.6, target.z).project(camera);
    const behind = v.z > 1, off = behind || Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.9;
    arrow.classList.toggle("hidden", !off);
    if (off) {
      let x = behind ? -v.x : v.x, y = behind ? -v.y : v.y;
      const m = Math.max(Math.abs(x), Math.abs(y)) || 1; x = (x / m) * 0.88; y = (y / m) * 0.82;
      arrow.style.left = `${((x + 1) / 2) * innerWidth - 14}px`; arrow.style.top = `${((1 - y) / 2) * innerHeight - 13}px`;
      arrow.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
    }
  } else arrow.classList.add("hidden");
}

function syncViews(dt: number, clock: number): void {
  const P = sim.player, lit = sim.lanterns.filter((l) => l.lit).length;
  ambient.intensity = 0.15 + 0.55 * (lit / Math.max(1, sim.lanterns.length)); // palette spec: ambient grows with progress
  for (const l of sim.lanterns) {
    let v = lanternViews.get(l.id);
    if (!v) { v = makeLantern(); lanternViews.set(l.id, v); }
    v.group.position.set(l.x, l.y, l.z);
    const mt = v.body.material as THREE.MeshStandardMaterial;
    const fuel = l.fuelU / 60, low = l.lit && fuel < TUNING.low_fuel_threshold, blinkOff = low && Math.floor(clock * 2) % 2 === 1; // 1 Hz: 0.5 s on, 0.5 s off
    mt.color.setHex(l.lit ? PAL.lampCore : PAL.lampOff);
    mt.emissiveIntensity = l.lit ? (blinkOff ? 0.4 : 2 + Math.sin(clock * 3 + l.x) * 0.2) : (l.deposited / (l.everLit ? TUNING.relight_cost : TUNING.lantern_cost)) * 1.2;
    v.body.scale.y = l.lit ? 1 : 0.8; v.body.position.y = l.lit ? 3.6 : 3.4; // an unlit lantern is squashed by 20% (readable without colour)
    v.tear.visible = !l.lit;
    v.bar.visible = l.lit && !blinkOff;
    v.barFill.scale.x = Math.max(0.001, fuel / TUNING.fuel_max); v.barFill.position.x = -1.05 * (1 - v.barFill.scale.x);
    (v.barFill.material as THREE.MeshBasicMaterial).color.setHex(low ? 0xffffff : PAL.lampOn);
    v.bar.lookAt(camera.position);
    (v.halo.material as THREE.SpriteMaterial).opacity = l.lit ? (blinkOff ? 0.3 : 0.9) : (l.deposited / TUNING.lantern_cost) * 0.4;
    (v.pool.material as THREE.MeshBasicMaterial).opacity = l.lit ? 0.45 : 0; v.ring.visible = sim.safeOn(l);
  }
  player.position.set(P.x, P.y, P.z);
  player.rotation.y = faceYaw;
  player.visible = !(P.invuln > 0 && Math.floor(clock * 14) % 2 === 0) && P.fallWait === 0;
  hatGlow.scale.setScalar(1.2 + P.carried * 0.25);

  const seen = new Set<string>();
  for (const s of sim.shades) {
    seen.add(s.id);
    let g = shadeViews.get(s.id); if (!g) { g = makeShade(); shadeViews.set(s.id, g); }
    const st = s.state === "stunned";
    g.position.set(s.x, s.gy + (st ? 0.6 : 1 + Math.sin(clock * 3 + s.x) * 0.12), s.z);
    g.rotation.y = Math.atan2(P.x - s.x, P.z - s.z);
    (g.userData.blob as THREE.Mesh).scale.y = st ? 0.6 : 1.15;
    ((g.userData.blob as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setHex(st ? PAL.shadeStun : PAL.shade);
    g.scale.setScalar(s.state === "spawning" ? 0.4 : 1);
    ((g.userData.rim as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(rimColor(settings.colorblind));
    (g.userData.eye as THREE.MeshBasicMaterial).color.setHex(settings.colorblind ? 0x00b3ff : 0xe6d9ff);
    const beam = g.userData.beam as THREE.Line, tl = sim.lanterns.find((x) => x.id === s.target);
    beam.visible = s.state === "drain" && !!tl;
    if (beam.visible && tl) {
      (beam.material as THREE.LineBasicMaterial).color.setHex(rimColor(settings.colorblind));
      beam.geometry.setFromPoints([new THREE.Vector3(s.x, s.gy + 1, s.z), new THREE.Vector3(tl.x, tl.y + 3.6, tl.z)]);
    }
  }
  for (const [id, g] of shadeViews) if (!seen.has(id)) { scene.remove(g); scene.remove(g.userData.beam); shadeViews.delete(id); }

  seen.clear();
  for (const m of sim.motes) {
    seen.add(m.id);
    let sp = moteViews.get(m.id);
    if (!sp) { sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: moteTex, color: PAL.moteHalo, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(1.1); scene.add(sp); moteViews.set(m.id, sp); }
    sp.position.set(m.x, m.y + 0.9 + Math.sin(clock * 2 + m.x * 3) * 0.2, m.z);
    sp.material.opacity = m.kind === "dropped" && m.ttl < 120 ? 0.4 + 0.6 * Math.abs(Math.sin(clock * 12)) : 1;
  }
  for (const [id, sp] of moteViews) if (!seen.has(id)) { scene.remove(sp); moteViews.delete(id); }

  seen.clear();
  for (const d of sim.drifters) {
    seen.add(d.id);
    let g = drifterViews.get(d.id); if (!g) { g = makeDrifter(); drifterViews.set(d.id, g); }
    g.position.set(d.x, d.y + Math.sin(clock * 4) * 0.2, d.z);
    const hx = d.state === "flee" ? d.fx : d.state === "idle" ? d.hx : P.x - d.x, hz = d.state === "flee" ? d.fz : d.state === "idle" ? d.hz : P.z - d.z;
    g.rotation.y = Math.atan2(-hz, -hx) + Math.PI; // ribbon trails behind its heading
    g.children.forEach((c, i) => (c.position.z = Math.sin(clock * 8 - i) * 0.25));
  }
  for (const [id, g] of drifterViews) if (!seen.has(id)) { scene.remove(g); drifterViews.delete(id); }

  for (const c of sim.charms) {
    let m = charmViews.get(c.id);
    if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.35), new THREE.MeshBasicMaterial({ map: charmTex, side: THREE.DoubleSide })); scene.add(m); charmViews.set(c.id, m); }
    m.visible = c.available; m.position.set(c.x, c.y + 1.3 + Math.sin(clock * 2) * 0.15, c.z); m.rotation.y = clock * 1.5;
  }

  if (leaves) {
    leaves.visible = sim.wind.warning || sim.wind.active;
    if (leaves.visible) {
      const a = (sim.wind.dir_deg * Math.PI) / 180, pos = leaves.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setX(i, pos.getX(i) + Math.cos(a) * (sim.wind.active ? 9 : 3) * dt); pos.setZ(i, pos.getZ(i) + Math.sin(a) * (sim.wind.active ? 9 : 3) * dt);
        pos.setY(i, pos.getY(i) + Math.sin(clock * 3 + i) * dt);
        if (Math.abs(pos.getX(i)) > 30) pos.setX(i, -Math.sign(pos.getX(i)) * 29);
        if (Math.abs(pos.getZ(i)) > 30) pos.setZ(i, -Math.sign(pos.getZ(i)) * 29);
      }
      pos.needsUpdate = true; leaves.position.set(P.x, 0, P.z);
    }
  }

  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.age += dt;
    f.mesh.scale.setScalar(1 + (TUNING.pulse_radius - 1) * Math.min(1, f.age / 0.45));
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - f.age * 1.8);
    if (f.age > 0.5) { scene.remove(f.mesh); fx.splice(i, 1); }
  }

  const th = (camYaw * Math.PI) / 180;
  const target = new THREE.Vector3(P.x - Math.sin(th) * 11, Math.max(P.y, P.fallWait > 0 ? -2 : P.y) + 7.5, P.z - Math.cos(th) * 11);
  camera.position.lerp(target, Math.min(1, dt * 6));
  camera.lookAt(P.x, Math.max(P.y, -4) + 1.6, P.z);
}

let acc = 0, last = performance.now(), clock = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
  if (screen === "play") {
    acc += dt;
    while (acc >= 1 / TPS && sim.state === "playing") {
      onEvents(sim.step(readInput()));
      latched.jump = latched.dash = latched.interact = latched.pulse = false;
      acc -= 1 / TPS;
    }
    if (sim.state !== "playing") acc = 0;
  } else acc = 0;
  if (screen !== "menu" && screen !== "dawn") { syncViews(dt, clock); if (screen === "play" || screen === "pause") updateHud(); }
  else { camera.position.set(Math.sin(clock * 0.1) * 40, 22, Math.cos(clock * 0.1) * 40); camera.lookAt(0, 0, 0); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
loadNight(1);
show("menu");
camera.position.set(0, 22, 40);
requestAnimationFrame(frame);
// debug hook used by manual/browser verification (jump straight to a night)
// renderBench renders synchronously (independent of requestAnimationFrame throttling) and waits for the GPU each frame
function renderBench(n: number): { avg_ms: number; draw_calls: number; triangles: number } {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    syncViews(1 / 60, i / 60);
    renderer.render(scene, camera);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  const info = renderer.info.render;
  return { avg_ms: (performance.now() - t0) / n, draw_calls: info.calls, triangles: info.triangles };
}
(window as unknown as { __ddl: unknown }).__ddl = { startNight, show, renderBench };
