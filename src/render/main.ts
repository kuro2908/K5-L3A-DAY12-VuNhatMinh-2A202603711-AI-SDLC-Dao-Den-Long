// Browser front-end: screens, HUD, input, audio and three.js rendering. All gameplay rules live in src/sim.
import * as THREE from "three";
import { Input, Sim, SimEvent, TPS, TUNING, mulberry32 } from "../sim/sim";
import { normalizeName, validName } from "../leaderboard";
import { Audio3 } from "./audio";
import { loadBoard, submitScore } from "./board";
import { ACTIONS, Action, DEFAULT_BINDINGS, conflictWith, keyLabel, loadSettings, saveSettings } from "./settings";
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
// Shades are drawn with InstancedMesh (body, rim, eyes) and one LineSegments for all drain beams: 200 shades cost ~5 draw calls.
const SHADE_MAX = 256, dummy = new THREE.Object3D(), tmpM = new THREE.Matrix4(), eyeT = new THREE.Matrix4();
const shadeBody = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), SHADE_MAX);
const shadeRim = new THREE.InstancedMesh(new THREE.SphereGeometry(1.0, 14, 10), new THREE.MeshBasicMaterial({ color: PAL.shadeRim, side: THREE.BackSide }), SHADE_MAX);
const shadeEyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe6d9ff }), SHADE_MAX * 2);
const beamGeo = new THREE.BufferGeometry(); beamGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SHADE_MAX * 2 * 3), 3));
const beams = new THREE.LineSegments(beamGeo, new THREE.LineBasicMaterial({ color: PAL.shadeRim }));
for (const o of [shadeBody, shadeRim, shadeEyes, beams]) { o.frustumCulled = false; scene.add(o); }
shadeBody.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shadeRim.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shadeEyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const bodyColor = new THREE.Color(PAL.shade), stunColor = new THREE.Color(PAL.shadeStun);
shadeBody.count = shadeRim.count = shadeEyes.count = 0; beamGeo.setDrawRange(0, 0);

// Motes are THREE.Points (one draw call each for normal and dropped ones).
const MOTE_MAX = 512;
function makeCloud(): { pts: THREE.Points; mat: THREE.PointsMaterial } {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MOTE_MAX * 3), 3)); g.setDrawRange(0, 0);
  const mat = new THREE.PointsMaterial({ map: moteTex, color: PAL.moteHalo, size: 1.1, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
  return { pts, mat };
}
const moteCloud = makeCloud(), dropCloud = makeCloud();
function makeDrifter(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.9 - i * 0.08), new THREE.MeshBasicMaterial({ color: PAL.drifter })); seg.position.x = -i * 0.5; g.add(seg); }
  scene.add(g);
  return g;
}

function loadNight(night: 1 | 2 | 3): void {
  if (world) scene.remove(world);
  world = buildWorld(night); scene.add(world);
  for (const m of [lanternViews, drifterViews, charmViews] as Map<string, any>[]) {
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

// ---------------------------------------------------------------- settings, input, accessibility
const settings = loadSettings();
const audio = new Audio3();
audio.setVolume(settings.volume);
const query = new URLSearchParams(location.search);
const benchMode = query.has("bench");

function applyUi(): void {
  document.body.classList.toggle("cb", settings.colorblind);
  document.body.classList.toggle("rm", settings.reducedMotion);
  document.body.classList.toggle("large", settings.largeText);
  const b = settings.bindings, k = keyLabel;
  $("help").textContent = `${k(b.up)}${k(b.left)}${k(b.down)}${k(b.right)} di chuyển · ${k(b.jump)} nhảy · ${k(b.dash)} lướt · ${k(b.interact)} nạp/châm dầu · ${k(b.pulse)} tỏa sáng · kéo chuột xoay · ${k(b.pause)} tạm dừng`;
}
applyUi();

const held = new Set<string>();
const latched = { jump: false, dash: false, interact: false, pulse: false };
let camYaw = 0, faceYaw = 0, dragging = false, shake = 0;
let capturing: Action | null = null;

addEventListener("keydown", (e) => {
  if (capturing) { captureKey(e); return; }
  if (e.repeat) return;
  held.add(e.code);
  const b = settings.bindings;
  if (screen === "play") {
    if (e.code === b.jump) { latched.jump = true; if (sim.player.grounded) audio.play("jump"); }
    if (e.code === b.dash) latched.dash = true;
    if (e.code === b.interact) latched.interact = true;
    if (e.code === b.pulse) latched.pulse = true;
    if (e.code === b.pause) show("pause");
    if (e.code === "Space" || e.code.startsWith("Arrow") || e.code === "Tab") e.preventDefault();
  } else if (screen === "pause" && e.code === b.pause) show("play");
});
addEventListener("keyup", (e) => held.delete(e.code));
addEventListener("blur", () => held.clear());
addEventListener("mousedown", () => (dragging = true));
addEventListener("mouseup", () => (dragging = false));
addEventListener("mousemove", (e) => { if (dragging && screen === "play") camYaw -= e.movementX * 0.4 * settings.sensitivity; });

function readInput(): Input {
  const b = settings.bindings, h = (a: Action) => held.has(b[a]);
  // at yaw 0 the screen-right direction is world -X, so "right" maps to x = -1
  const move: [number, number] = [(h("left") ? 1 : 0) - (h("right") ? 1 : 0), (h("up") ? 1 : 0) - (h("down") ? 1 : 0)];
  if (held.has("KeyJ")) camYaw += 2 * settings.sensitivity;
  if (held.has("KeyL")) camYaw -= 2 * settings.sensitivity;
  if (move[0] || move[1]) {
    const t = (camYaw * Math.PI) / 180;
    faceYaw = Math.atan2(move[0] * Math.cos(t) + move[1] * Math.sin(t), -move[0] * Math.sin(t) + move[1] * Math.cos(t));
  }
  return { move, camYawDeg: camYaw, jump: h("jump") || latched.jump, dash: h("dash") || latched.dash, interact: h("interact") || latched.interact, pulse: h("pulse") || latched.pulse, pause: false };
}

// ---- key rebinding screen
function renderKeys(): void {
  const list = $("keyList");
  list.textContent = "";
  for (const a of ACTIONS) {
    const row = document.createElement("div"); row.className = "keyrow";
    const name = document.createElement("span"); name.textContent = a.label;
    const btn = document.createElement("button"); btn.type = "button";
    btn.textContent = capturing === a.id ? "Nhấn phím…" : keyLabel(settings.bindings[a.id]);
    btn.classList.toggle("listening", capturing === a.id);
    btn.addEventListener("click", () => { capturing = capturing === a.id ? null : a.id; $("keyMsg").textContent = ""; renderKeys(); });
    row.append(name, btn); list.appendChild(row);
  }
}
function captureKey(e: KeyboardEvent): void {
  e.preventDefault();
  const a = capturing as Action;
  const clash = conflictWith(settings.bindings, e.code, a);
  capturing = null;
  if (clash) {
    const other = ACTIONS.find((x) => x.id === clash)!.label;
    $("keyMsg").textContent = `⚠ Phím ${keyLabel(e.code)} đã dùng cho "${other}". Chọn phím khác.`;
  } else {
    settings.bindings[a] = e.code; saveSettings(settings); applyUi();
    $("keyMsg").textContent = `Đã đặt ${keyLabel(e.code)} cho "${ACTIONS.find((x) => x.id === a)!.label}".`;
  }
  renderKeys();
}

// ---------------------------------------------------------------- game flow
type Screen = "menu" | "intro" | "play" | "pause" | "settings" | "keys" | "result" | "dawn" | "name" | "board";
let screen: Screen = "menu", settingsFrom: Screen = "menu", nameFrom: Screen = "menu", boardFrom: Screen = "menu";
let night: 1 | 2 | 3 = 1, totalScore = 0, nightsWon = 0, currentSeed = 1, lastEntry = "";
let sim = new Sim(1);
const need = (n: number) => Math.ceil(TUNING.win_ratio * n);
const INTRO = [
  ["Đêm 1 · Đảo Bến", "Đèn ở bến tắt hết rồi, con. Thắp lại các ngọn Đèn Lồng Lớn và giữ cho ít nhất 3 trong 5 ngọn còn sáng tới bình minh. Đèn cạn dầu thì châm thêm đom đóm nhé."],
  ["Đêm 2 · Đảo Cau", "Hai đảo nối nhau bằng một cây cầu tre, không có lan can. Bước lên bục vàng để bay sang đảo bên kia. Coi chừng Gió Lạc: nó hay cướp đom đóm của người mang nặng. Cần giữ sáng ít nhất 4 trong 6 ngọn tới bình minh. Bóng Mực sẽ lẻn tới hút dầu đèn yếu."],
  ["Đêm 3 · Đảo Chuông", "Đảo Chuông có ba tầng. Đi lên bằng dốc hoặc bục vàng. Gió mạnh sẽ nổi lên mỗi nửa phút, thấy lá bay thì bám chắc nhé. Cần giữ sáng ít nhất 5 trong 7 ngọn tới bình minh."],
];
const ALL: Screen[] = ["menu", "intro", "pause", "settings", "keys", "result", "dawn", "name", "board"];
const ID: Record<string, string> = { menu: "sMenu", intro: "sIntro", pause: "sPause", settings: "sSettings", keys: "sKeys", result: "sResult", dawn: "sDawn", name: "sName", board: "sBoard" };

function show(s: Screen): void {
  screen = s;
  for (const k of ALL) $(ID[k]).classList.toggle("hidden", k !== s);
  $("hud").classList.toggle("hidden", s !== "play" && s !== "pause");
  audio.setMusic(s === "play");
  capturing = null;
  if (s === "settings") {
    $<HTMLInputElement>("setVol").value = String(Math.round(settings.volume * 100));
    $<HTMLInputElement>("setSens").value = String(Math.round(settings.sensitivity * 100));
    $<HTMLInputElement>("setCb").checked = settings.colorblind; $<HTMLInputElement>("setRm").checked = settings.reducedMotion; $<HTMLInputElement>("setLarge").checked = settings.largeText;
    syncSettingsLabels();
  }
  if (s === "keys") { $("keyMsg").textContent = ""; renderKeys(); }
  if (s === "name") { $("nameMsg").textContent = ""; $<HTMLInputElement>("nameInput").value = ""; $("nameInput").focus(); }
}
function syncSettingsLabels() { $("setVolV").textContent = `${Math.round(settings.volume * 100)}%`; $("setSensV").textContent = `${Math.round(settings.sensitivity * 100)}%`; }

function startNight(n: 1 | 2 | 3): void {
  night = n;
  currentSeed = (Date.now() & 0x7fffffff) | 0;
  sim = new Sim(currentSeed, {}, n);
  (window as unknown as { __game: unknown }).__game = { get sim() { return sim; } };
  camYaw = 0; faceYaw = 0; lastSec = -1; prevWind = false;
  loadNight(n);
  show("play");
}
function showIntro(n: 1 | 2 | 3): void {
  night = n;
  $("introName").textContent = INTRO[n - 1][0]; $("introQuote").textContent = `“${INTRO[n - 1][1]}”`;
  show("intro");
}

// ---- leaderboard screens
async function showBoard(from: Screen): Promise<void> {
  boardFrom = from;
  const entries = await loadBoard();
  const t = $("boardTable"); t.textContent = "";
  const head = document.createElement("tr");
  for (const h of ["#", "Tên", "Điểm", "Đêm thắng", "Ngày"]) { const th = document.createElement("th"); th.textContent = h; head.appendChild(th); }
  t.appendChild(head);
  entries.forEach((e, i) => {
    const tr = document.createElement("tr");
    if (`${e.name}@${e.achieved_at}` === lastEntry) tr.className = "me";
    [String(i + 1), e.name, String(e.score), `${e.nights_won}/3`, e.achieved_at.slice(0, 10)].forEach((v, c) => { const td = document.createElement("td"); td.textContent = v; if (c === 2) td.className = "num"; tr.appendChild(td); });
    t.appendChild(tr);
  });
  if (!entries.length) { const tr = document.createElement("tr"), td = document.createElement("td"); td.colSpan = 5; td.textContent = "Chưa có ai trên bảng."; tr.appendChild(td); t.appendChild(tr); }
  show("board");
}
function askName(from: Screen): void {
  nameFrom = from;
  $("nameScore").textContent = String(totalScore); $("nameNights").textContent = `${nightsWon}/3`;
  show("name");
}
async function saveName(): Promise<void> {
  const name = normalizeName($<HTMLInputElement>("nameInput").value);
  if (!validName(name)) { $("nameMsg").textContent = "Tên phải có 3–12 ký tự: chữ, số hoặc dấu _."; return; }
  const entries = await submitScore(name, totalScore, nightsWon, currentSeed);
  const mine = entries.find((e) => e.name === name && e.score === totalScore);
  lastEntry = mine ? `${mine.name}@${mine.achieved_at}` : "";
  await showBoard("menu");
}

on("bPlay", () => { audio.resume(); totalScore = 0; nightsWon = 0; showIntro(1); });
on("bBoard", () => { audio.resume(); void showBoard("menu"); });
on("bSettings", () => { audio.resume(); settingsFrom = "menu"; show("settings"); });
on("bGo", () => { audio.resume(); startNight(night); });
on("bResume", () => show("play"));
on("bRestart", () => startNight(night));
on("bPauseSettings", () => { settingsFrom = "pause"; show("settings"); });
on("bMenu", () => show("menu"));
on("bBack", () => show(settingsFrom));
on("bKeys", () => show("keys"));
on("bKeysBack", () => show("settings"));
on("bKeysReset", () => { settings.bindings = { ...DEFAULT_BINDINGS }; saveSettings(settings); applyUi(); $("keyMsg").textContent = "Đã khôi phục phím mặc định."; renderKeys(); });
on("bResMenu", () => show("menu"));
on("bDawnMenu", () => show("menu"));
on("bSave", () => askName("result"));
on("bDawnSave", () => askName("dawn"));
on("bNameOk", () => void saveName());
on("bNameSkip", () => show(nameFrom));
on("bBoardBack", () => show(boardFrom));
on("bNext", () => { if (sim.state === "won") showIntro((night + 1) as 2 | 3); else startNight(night); });
$("nameInput").addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") void saveName(); });
$<HTMLInputElement>("setVol").addEventListener("input", (e) => { settings.volume = Number((e.target as HTMLInputElement).value) / 100; audio.setVolume(settings.volume); syncSettingsLabels(); saveSettings(settings); });
$<HTMLInputElement>("setSens").addEventListener("input", (e) => { settings.sensitivity = Number((e.target as HTMLInputElement).value) / 100; syncSettingsLabels(); saveSettings(settings); });
for (const [id, key] of [["setCb", "colorblind"], ["setRm", "reducedMotion"], ["setLarge", "largeText"]] as const) {
  $<HTMLInputElement>(id).addEventListener("change", (e) => { settings[key] = (e.target as HTMLInputElement).checked; saveSettings(settings); applyUi(); });
}

// ---- events, captions (visual subtitles) and indicators
let lastSec = -1, prevWind = false, spawnArrow: { id: string; until: number } | null = null;
function caption(text: string, ms = 2600): void {
  const box = $("caption");
  const d = document.createElement("div"); d.textContent = text; box.appendChild(d);
  while (box.children.length > 4) box.removeChild(box.firstChild as Node);
  setTimeout(() => d.remove(), ms);
}
function onEvents(events: SimEvent[]): void {
  for (const e of events) {
    switch (e.name) {
      case "mote_picked": audio.play("pick"); break;
      case "lantern_lit": audio.play("light"); caption(e.data.relight ? "Đèn đã được thắp lại!" : "Đèn đã được thắp!"); break;
      case "refuel": caption(`Đã châm dầu (${e.data.fuel}/100)`); audio.play("pick"); break;
      case "lantern_out": caption("Một đèn đã tắt!"); audio.play("lose"); break;
      case "pulse": audio.play("pulse"); spawnPulse(); break;
      case "dash": audio.play("dash"); break;
      case "charm_picked": audio.play("charm"); caption("Bùa Gió: chạy nhanh, lướt liên tục!"); break;
      case "drifter_steal": audio.play("steal"); caption(`Gió Lạc cướp ${e.data.amount} đom đóm!`); break;
      case "drifter_drop": caption("Gió Lạc làm rơi đom đóm đã cướp"); break;
      case "shade_spawned": audio.play("spawn"); caption("Bóng Mực xuất hiện!"); spawnArrow = { id: String(e.data.id), until: performance.now() + 3500 }; break;
      case "player_hit": audio.play("hit"); flash(); if (!settings.reducedMotion) shake = 0.35; caption(e.data.by === "fall" ? "Rơi khỏi đảo!" : "Bị Bóng Mực chạm!"); break;
      case "game_over": endNight(e.data.result === "won", String(e.data.reason)); break;
    }
  }
}
function flash() { if (settings.reducedMotion) return; const f = $("flash"); f.style.opacity = "0.45"; setTimeout(() => (f.style.opacity = "0"), 120); }
function spawnPulse() {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: PAL.lampCore, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(sim.player.x, sim.player.y + 0.2, sim.player.z); scene.add(mesh); fx.push({ mesh, age: 0 });
}
function endNight(won: boolean, reason: string): void {
  audio.play(won ? "win" : "lose");
  if (won) { totalScore += sim.score; nightsWon++; }
  setTimeout(() => {
    if (won && night === 3) { $("dawnScore").textContent = String(totalScore); show("dawn"); return; }
    $("resTitle").textContent = won ? "Đảo vẫn sáng tới bình minh!" : reason === "dawn" ? "Trời sáng mà đảo chưa đủ sáng…" : "Ngọn lửa của Mây đã tắt";
    $("resText").textContent = `Điểm đêm này: ${sim.score}${won ? ` · Tổng: ${totalScore}` : ` · Tổng điểm các Đêm đã thắng: ${totalScore}`}`;
    $("bNext").textContent = won ? "Đêm kế tiếp" : "Chơi lại Đêm này";
    $("bSave").classList.toggle("hidden", won); // a run ends (and can be saved) on a loss or at dawn
    show("result");
  }, 900);
}

// ---------------------------------------------------------------- per-frame sync
const set = (id: string, v: string) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };

/** Put an arrow on the screen edge pointing towards a world position (hidden when the target is on screen). */
function edgeArrow(el: HTMLElement, wx: number, wy: number, wz: number): void {
  const v = new THREE.Vector3(wx, wy, wz).project(camera);
  const behind = v.z > 1, off = behind || Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.9;
  el.classList.toggle("hidden", !off);
  if (!off) return;
  let x = behind ? -v.x : v.x, y = behind ? -v.y : v.y;
  const m = Math.max(Math.abs(x), Math.abs(y)) || 1; x = (x / m) * 0.88; y = (y / m) * 0.82;
  el.style.left = `${((x + 1) / 2) * innerWidth - 14}px`; el.style.top = `${((1 - y) / 2) * innerHeight - 13}px`;
  el.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
}

function updateHud(): void {
  const P = sim.player, lit = sim.lanterns.filter((l) => l.lit).length;
  set("hudFlames", "❤".repeat(Math.max(0, P.flames)) + "♡".repeat(Math.max(0, TUNING.flames - P.flames)));
  const sec = Math.max(0, Math.ceil(sim.timeLeft));
  set("hudTime", `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`);
  $("hudTime").classList.toggle("low", sec <= 30);
  if (sec <= 10 && sec !== lastSec && sec > 0 && screen === "play" && !benchMode) audio.play("tick");
  lastSec = sec;
  const c10 = $("count10"); // last 10 seconds: big visual countdown (also a cue for players who cannot hear the ticks)
  c10.classList.toggle("hidden", !(sec <= 10 && sec > 0 && !benchMode)); if (sec <= 10) c10.textContent = String(sec);
  set("hudLit", `${lit}/${sim.lanterns.length} (cần ${need(sim.lanterns.length)})`); set("hudScore", String(sim.score));
  const bar = $("hudMotes");
  while (bar.children.length < sim.capacity) { const d = document.createElement("div"); d.className = "slot"; bar.appendChild(d); }
  while (bar.children.length > sim.capacity) bar.removeChild(bar.lastChild as Node);
  Array.from(bar.children).forEach((c, i) => c.classList.toggle("on", i < P.carried));
  set("hudCap", `${P.carried}/${sim.capacity}`);
  $("cdDash").classList.toggle("ready", P.dashCd === 0);
  $("cdPulse").classList.toggle("ready", P.pulseCd === 0 && P.carried >= TUNING.pulse_cost);
  const near = sim.lanterns.filter((l) => (!l.lit || l.fuelU < TUNING.fuel_max * 60) && Math.hypot(l.x - P.x, l.z - P.z) <= TUNING.interact_radius + 1.5)[0];
  const pr = $("hudPrompt");
  pr.classList.toggle("hidden", !near);
  const ik = keyLabel(settings.bindings.interact);
  if (near) pr.textContent = near.lit ? `${ik} — Châm dầu (${Math.round(near.fuelU / 60)}/${TUNING.fuel_max})` : `${ik} — Nạp ánh sáng (${near.deposited}/${near.everLit ? TUNING.relight_cost : TUNING.lantern_cost})`;
  const warn = $("hudWarn");
  const lowFuel = sim.lanterns.some((l) => l.lit && l.fuelU < TUNING.low_fuel_threshold * 60);
  const draining = sim.shades.some((s) => s.state === "drain");
  warn.classList.toggle("hidden", !sim.wind.warning && !sim.wind.active && !lowFuel && !draining);
  warn.textContent = draining ? "Bóng Mực đang hút dầu đèn!" : lowFuel ? "Đèn sắp hết dầu!" : sim.wind.active ? "Gió mạnh!" : "Gió sắp thổi!";
  if (sim.wind.warning && !prevWind) caption("Gió sắp thổi!");
  prevWind = sim.wind.warning;
  let target: { x: number; y: number; z: number } | null = null, td = Infinity;
  for (const l of sim.lanterns) if (!l.lit) { const d = Math.hypot(l.x - P.x, l.z - P.z); if (d < td) { td = d; target = l; } }
  if (target) edgeArrow($("arrow"), target.x, target.y + 3.6, target.z); else $("arrow").classList.add("hidden");
  const sa = $("arrowShade"), spawned = spawnArrow && performance.now() < spawnArrow.until ? sim.shades.find((s) => s.id === spawnArrow!.id) : undefined;
  if (spawned) edgeArrow(sa, spawned.x, spawned.gy + 1, spawned.z); else sa.classList.add("hidden");
}

function syncShades(clock: number): void {
  const P = sim.player, cb = settings.colorblind;
  (shadeRim.material as THREE.MeshBasicMaterial).color.setHex(rimColor(cb));
  (shadeEyes.material as THREE.MeshBasicMaterial).color.setHex(cb ? 0x00b3ff : 0xe6d9ff);
  (beams.material as THREE.LineBasicMaterial).color.setHex(rimColor(cb));
  const pos = beamGeo.getAttribute("position") as THREE.BufferAttribute;
  let n = 0, nb = 0;
  for (const s of sim.shades) {
    if (n >= SHADE_MAX) break;
    const st = s.state === "stunned", sc = s.state === "spawning" ? 0.4 : 1, sy = st ? 0.6 : 1.15;
    dummy.position.set(s.x, s.gy + (st ? 0.6 : 1 + Math.sin(clock * 3 + s.x) * 0.12), s.z);
    dummy.rotation.set(0, Math.atan2(P.x - s.x, P.z - s.z), 0);
    dummy.scale.set(sc, sc * sy, sc);
    dummy.updateMatrix();
    shadeBody.setMatrixAt(n, dummy.matrix); shadeRim.setMatrixAt(n, dummy.matrix);
    shadeBody.setColorAt(n, st ? stunColor : bodyColor);
    for (const sx of [-0.3, 0.3]) { eyeT.makeTranslation(sx, 0.25, 0.78); tmpM.multiplyMatrices(dummy.matrix, eyeT); shadeEyes.setMatrixAt(n * 2 + (sx < 0 ? 0 : 1), tmpM); }
    if (s.state === "drain") {
      const tl = sim.lanterns.find((x) => x.id === s.target);
      if (tl) { pos.setXYZ(nb * 2, s.x, s.gy + 1, s.z); pos.setXYZ(nb * 2 + 1, tl.x, tl.y + 3.6, tl.z); nb++; }
    }
    n++;
  }
  shadeBody.count = shadeRim.count = n; shadeEyes.count = n * 2;
  shadeBody.instanceMatrix.needsUpdate = shadeRim.instanceMatrix.needsUpdate = shadeEyes.instanceMatrix.needsUpdate = true;
  if (shadeBody.instanceColor) shadeBody.instanceColor.needsUpdate = true;
  pos.needsUpdate = true; beamGeo.setDrawRange(0, nb * 2);
}

function syncMotes(clock: number): void {
  const a = moteCloud.pts.geometry.getAttribute("position") as THREE.BufferAttribute, d = dropCloud.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
  let na = 0, nd = 0, blink = false;
  for (const m of sim.motes) {
    const y = m.y + 0.9 + Math.sin(clock * 2 + m.x * 3) * 0.2;
    if (m.kind === "dropped") { if (nd < MOTE_MAX) d.setXYZ(nd++, m.x, y, m.z); if (m.ttl < 120) blink = true; }
    else if (na < MOTE_MAX) a.setXYZ(na++, m.x, y, m.z);
  }
  a.needsUpdate = d.needsUpdate = true;
  moteCloud.pts.geometry.setDrawRange(0, na); dropCloud.pts.geometry.setDrawRange(0, nd);
  dropCloud.mat.opacity = blink ? 0.4 + 0.6 * Math.abs(Math.sin(clock * 12)) : 1; // dropped motes blink before they vanish
}

function syncViews(dt: number, clock: number): void {
  const P = sim.player, lit = sim.lanterns.filter((l) => l.lit).length;
  ambient.intensity = 0.15 + 0.55 * (lit / Math.max(1, sim.lanterns.length)); // palette spec: ambient grows with progress
  for (const l of sim.lanterns) {
    let v = lanternViews.get(l.id);
    if (!v) { v = makeLantern(); lanternViews.set(l.id, v); }
    const grp = v.group;
    grp.position.set(l.x, l.y, l.z);
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
    (v.halo.material as THREE.SpriteMaterial).opacity = l.lit ? (blinkOff ? 0.3 : 0.9) : (l.deposited / (l.everLit ? TUNING.relight_cost : TUNING.lantern_cost)) * 0.4;
    (v.pool.material as THREE.MeshBasicMaterial).opacity = l.lit ? 0.45 : 0; v.ring.visible = sim.safeOn(l);
  }
  player.position.set(P.x, P.y, P.z);
  player.rotation.y = faceYaw;
  player.visible = !(P.invuln > 0 && Math.floor(clock * 14) % 2 === 0) && P.fallWait === 0;
  hatGlow.scale.setScalar(1.2 + P.carried * 0.25);

  syncShades(clock);
  syncMotes(clock);
  const seen = new Set<string>();
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

  if (bench) { // fixed benchmark camera: circle r=30 at y=15 around the origin, counter-clockwise, one lap per 15 s
    const a = (2 * Math.PI * bench.t) / 15;
    camera.position.set(30 * Math.cos(a), 15, 30 * Math.sin(a)); camera.lookAt(0, 0, 0);
    return;
  }
  const th = (camYaw * Math.PI) / 180;
  const target = new THREE.Vector3(P.x - Math.sin(th) * 11, Math.max(P.y, P.fallWait > 0 ? -2 : P.y) + 7.5, P.z - Math.cos(th) * 11);
  camera.position.lerp(target, Math.min(1, dt * 6));
  if (shake > 0) { const k = shake * 0.7; camera.position.x += (Math.random() - 0.5) * k; camera.position.y += (Math.random() - 0.5) * k; shake = Math.max(0, shake - dt); }
  camera.lookAt(P.x, Math.max(P.y, -4) + 1.6, P.z);
}

// ---------------------------------------------------------------- benchmark mode (?bench=1&seed=42&duration=30)
interface BenchState { t: number; dts: number[]; warm: number; duration: number; first: boolean; jsHeapPeak: number }
let bench: BenchState | null = null;

function startBench(seed: number, duration: number): void {
  const rng = mulberry32(seed);
  const spread = (n: number, r: number): [number, number, number][] => Array.from({ length: n }, () => { const d = r * Math.sqrt(rng()), a = rng() * Math.PI * 2; return [Math.cos(a) * d, 0, Math.sin(a) * d]; });
  const scenario = {
    random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
    motes: spread(100, 38), shades: spread(200, 36).map((pos, i) => ({ id: `S${i + 1}`, pos, state: "wander" as const })),
    lanterns: ["L1", "L2", "L3"].map((id) => ({ id, lit: true, fuel: 100 })),
  };
  night = 1; sim = new Sim(seed, scenario, 1); sim.bench = true;
  loadNight(1);
  bench = { t: 0, dts: [], warm: 3, duration, first: false, jsHeapPeak: 0 };
  (window as unknown as { __benchResult: unknown }).__benchResult = null;
  show("play");
}

function benchFrame(dtMs: number): void {
  const b = bench as BenchState;
  b.t += dtMs / 1000;
  if (!b.first) { b.first = true; (window as unknown as { __benchFirst: number }).__benchFirst = performance.timeOrigin + performance.now(); }
  if (b.t >= b.warm) b.dts.push(dtMs);
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  if (mem) b.jsHeapPeak = Math.max(b.jsHeapPeak, mem.usedJSHeapSize / 1048576);
  if (b.t >= b.warm + b.duration && !(window as unknown as { __benchResult: unknown }).__benchResult) {
    const sorted = [...b.dts].sort((x, y) => x - y), n = b.dts.length;
    const sum = b.dts.reduce((s, x) => s + x, 0);
    const k = Math.max(1, Math.ceil(0.01 * n)), worst = sorted.slice(n - k);
    const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    (window as unknown as { __benchResult: unknown }).__benchResult = {
      frames: n, frame_ms_max: sorted[n - 1], frames_over_100ms: b.dts.filter((x) => x > 100).length, avg_fps: (1000 * n) / sum, p1_low_fps: 1000 / (worst.reduce((s, x) => s + x, 0) / k),
      frame_ms_p95: sorted[Math.min(n - 1, Math.ceil(0.95 * n) - 1)], js_heap_peak_mb: b.jsHeapPeak,
      gl_renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown", draw_calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
    };
  }
}

// ---------------------------------------------------------------- main loop
let acc = 0, last = performance.now(), clock = 0;
function frame(now: number): void {
  const dtMs = now - last; last = now;
  const dt = Math.min(0.1, dtMs / 1000); clock += dt;
  if (screen === "play") {
    acc += dt;
    while (acc >= 1 / TPS && sim.state === "playing") {
      onEvents(sim.step(bench ? IDLE : readInput()));
      latched.jump = latched.dash = latched.interact = latched.pulse = false;
      acc -= 1 / TPS;
    }
    if (sim.state !== "playing") acc = 0;
  } else acc = 0;
  if (bench) { benchFrame(dtMs); }
  if (screen !== "menu" && screen !== "dawn" && screen !== "board" && screen !== "name") { syncViews(dt, clock); if (screen === "play" || screen === "pause") updateHud(); }
  else { camera.position.set(Math.sin(clock * 0.1) * 40, 22, Math.cos(clock * 0.1) * 40); camera.lookAt(0, 0, 0); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
const IDLE: Input = { move: [0, 0], camYawDeg: 0, jump: false, dash: false, interact: false, pulse: false, pause: false };
loadNight(1);
camera.position.set(0, 22, 40);
if (benchMode) startBench(Number(query.get("seed") ?? 42), Number(query.get("duration") ?? 30)); else show("menu");
requestAnimationFrame(frame);

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
// debug hook used by manual/browser verification (jump straight to a night, measure render cost)
(window as unknown as { __ddl: unknown }).__ddl = { startNight, show, renderBench };
