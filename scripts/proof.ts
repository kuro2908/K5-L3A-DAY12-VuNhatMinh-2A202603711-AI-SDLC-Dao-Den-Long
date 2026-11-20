// Runs the REAL headless CLI on inline scenarios and checks the output against the requirement each one proves.
// Usage: npm run proof [-- <phase-dir-name>]   (default: phase-2). Writes cases + raw output + REPORT.md to docs/proof/<phase>/.
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type Row = Record<string, any>;
const PHASE = process.argv[2] ?? "phase-2";
const OUT = `docs/proof/${PHASE}`;
mkdirSync(`${OUT}/cases`, { recursive: true });

const quiet = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false, motes: [], shades: [] };
interface Case { name: string; night?: number; ticks: number; every?: number; seed?: number; scenario?: object; inputs?: object[] }

function cli(c: Case): { rows: Row[]; raw: string; sec: number } {
  const base = `${OUT}/cases/${c.name}`;
  const args = ["--seed", String(c.seed ?? 1), "--night", String(c.night ?? 1), "--ticks", String(c.ticks), "--snapshot-every", String(c.every ?? 1), "--out", `${OUT}/${c.name}.jsonl`];
  if (c.scenario) { writeFileSync(`${base}.scenario.json`, JSON.stringify({ ...quiet, ...c.scenario }, null, 1)); args.push("--scenario", `${base}.scenario.json`); }
  if (c.inputs) { writeFileSync(`${base}.inputs.json`, JSON.stringify({ frames: c.inputs }, null, 1)); args.push("--inputs", `${base}.inputs.json`); }
  const t0 = Date.now();
  const r = spawnSync("npx", ["tsx", "src/headless/cli.ts", ...args], { encoding: "utf8", shell: true });
  if (r.status !== 0) throw new Error(`${c.name}: exit ${r.status}: ${r.stderr}`);
  const raw = readFileSync(`${OUT}/${c.name}.jsonl`, "utf8");
  return { rows: raw.trim().split("\n").map((l) => JSON.parse(l)), raw, sec: (Date.now() - t0) / 1000 };
}
const ev = (rows: Row[], n: string) => rows.filter((r) => r.type === "event" && r.name === n);
const snap = (rows: Row[], t: number) => rows.find((r) => r.type === "snapshot" && r.tick === t)!;
const lastSnap = (rows: Row[]) => [...rows].reverse().find((r) => r.type === "snapshot")!;
const end = (rows: Row[]) => rows[rows.length - 1];
const press = (tick: number, key: string) => [{ tick, [key]: true }, { tick: tick + 1, [key]: false }];
const L = (id: string, extra = {}) => ({ id, ...extra });
const litRest = ["L2", "L3", "L4", "L5"].map((id) => L(id, { lit: true }));

const results: { req: string; how: string; ok: boolean; detail: string }[] = [];
const check = (req: string, how: string, ok: boolean, detail: string) => results.push({ req, how, ok, detail });

// ---- Phase 1 behaviours, re-proven with the Ticket-02 standard numbers (regression)
{
  const { rows } = cli({ name: "r1-win", ticks: 100, scenario: { player: { carried: 10 }, lanterns: [L("L1", { pos: [0, 0, 1] }), ...litRest] }, inputs: press(0, "interact") });
  check("[P1] Thắp hết đèn thì thắng", "r1-win", ev(rows, "game_over")[0]?.data.result === "won" && end(rows).state === "won", JSON.stringify({ game_over: ev(rows, "game_over")[0]?.data, end: end(rows) }));
}
{
  const { rows } = cli({ name: "r2-hit", ticks: 300, scenario: { player: { carried: 5 }, shades: [{ id: "S1", pos: [3, 1, 0] }] } });
  const h = ev(rows, "player_hit")[0];
  check("[P1] Bóng Mực chạm: −1 Ngọn Lửa, rơi floor(mang/2)", "r2-hit", h?.data.flames === 2 && h?.data.dropped === 2, JSON.stringify(h));
}
{
  const { rows } = cli({ name: "r3-pulse", ticks: 130, scenario: { player: { carried: 5 }, shades: [{ id: "S1", pos: [4, 1, 0] }, { id: "S2", pos: [20, 1, 0] }] }, inputs: press(0, "pulse") });
  const s = snap(rows, 1);
  check("[P1] Tỏa Sáng choáng Bóng Mực ≤ 5 m, tốn 3 đom đóm, choáng 120 tick", "r3-pulse", JSON.stringify(ev(rows, "pulse")[0]?.data.stunned_ids) === '["S1"]' && s.player.carried === 2 && snap(rows, 119).shades[0].state === "stunned" && snap(rows, 121).shades[0].state !== "stunned", JSON.stringify({ pulse: ev(rows, "pulse")[0]?.data, carried: s.player.carried, push_x_at_15: snap(rows, 15).shades[0].pos[0] }));
}
{
  const { rows } = cli({ name: "r4-safe", ticks: 900, scenario: { lanterns: [L("L1", { pos: [0, 0, 0], lit: true })], shades: [{ id: "S1", pos: [10, 1, 0] }] } }); // inside the 12 m detect range: it really charges the barrier
  const min = Math.min(...rows.filter((r) => r.type === "snapshot").map((r) => Math.hypot(r.shades[0].pos[0], r.shades[0].pos[2])));
  check("[P1] Vùng an toàn: Bóng Mực bị chặn ở mép 6 m", "r4-safe (900 snapshot)", min >= 6 - 1e-3 && min < 6.1 && ev(rows, "player_hit").length === 0, `khoảng cách nhỏ nhất tới đèn = ${min.toFixed(3)} (phải ≈ safe_radius 6: bóng áp sát mép nhưng không vào)`);
}
{
  const { rows } = cli({ name: "r5-dawn", ticks: 1000, scenario: { time_left_s: 5 } });
  check("[P1] Hết đêm mà chưa thắp hết đèn thì thua (dawn)", "r5-dawn", ev(rows, "game_over")[0]?.data.reason === "dawn" && end(rows).ticks === 300, JSON.stringify(end(rows)));
}
{
  const a = cli({ name: "r6-det-a", night: 2, seed: 99, every: 10, ticks: 6000, scenario: { random_motes: true, random_shades: true, random_drifters: true, motes: undefined, shades: undefined } });
  const b = cli({ name: "r6-det-b", night: 2, seed: 99, every: 10, ticks: 6000, scenario: { random_motes: true, random_shades: true, random_drifters: true, motes: undefined, shades: undefined } });
  const c = cli({ name: "r6-det-c", night: 2, seed: 100, every: 10, ticks: 6000, scenario: { random_motes: true, random_shades: true, random_drifters: true, motes: undefined, shades: undefined } });
  check("[P1] Tính tất định (Đêm 2, có sinh ngẫu nhiên)", "2 lần seed 99 so từng byte; seed 100 phải khác", a.raw === b.raw && a.raw !== c.raw, `${a.raw.length} byte; shade_spawned=${ev(a.rows, "shade_spawned").length}, Gió Lạc id=${[...new Set(a.rows.filter((r) => r.type === "snapshot").flatMap((r) => r.drifters.map((d: Row) => d.id)))].join(",")}`);
}
{
  writeFileSync(`${OUT}/cases/bad-inputs.json`, JSON.stringify({ frames: [{ tick: 3 }, { tick: 3 }] }));
  const r = spawnSync("npx", ["tsx", "src/headless/cli.ts", "--seed", "1", "--night", "1", "--ticks", "5", "--inputs", `${OUT}/cases/bad-inputs.json`, "--out", `${OUT}/x.jsonl`], { encoding: "utf8", shell: true });
  check("[P1] File inputs sai định dạng → mã thoát 2", "bad-inputs.json", r.status === 2, `exit=${r.status}, stderr=${r.stderr.trim()}`);
}

// ---- Phase 2 new requirements
{
  const { rows } = cli({ name: "n1-dash", ticks: 40, inputs: [{ tick: 0, move: [0, 1] }, ...press(10, "dash")] });
  const dist = snap(rows, 23).player.pos[2] - snap(rows, 10).player.pos[2];
  check("[P2] Lướt: 14 m/s, 0.2 s (12 tick), event dash", "n1-dash", ev(rows, "dash").length === 1 && Math.abs(snap(rows, 11).player.vel[2] - 14) < 0.01, `vel@11=${snap(rows, 11).player.vel[2]}, quãng đường 13 tick=${dist.toFixed(2)} m, dash_cd_s=${snap(rows, 11).player.dash_cd_s}`);
}
{
  const { rows } = cli({ name: "n2-fall", ticks: 200, scenario: { player: { pos: [0, 0, 39.5], carried: 7 } }, inputs: [{ tick: 0, move: [0, 1] }] });
  const h = ev(rows, "player_hit")[0];
  const back = snap(rows, h.tick + 60).player;
  check("[P2] Rơi khỏi đảo: đúng 1 lần, −1 Lửa, mất hết đom đóm, chờ 60 tick, hồi sinh bất tử", "n2-fall", ev(rows, "player_hit").length === 1 && h.data.by === "fall" && h.data.lost === 7 && back.carried === 0 && back.invuln === true, JSON.stringify({ hit: h.data, respawn_tick: h.tick + 60, respawn_pos: back.pos, invuln: back.invuln }));
}
{
  const { rows } = cli({ name: "n3-pad", night: 2, ticks: 120, scenario: { player: { pos: [20, 0, 17.5] } }, inputs: [{ tick: 0, move: [0, 1] }, { tick: 5, move: [-1, 0] }] });
  const land = rows.find((r) => r.type === "snapshot" && r.tick > 5 && r.player.grounded && r.player.pos[0] > 40);
  const air = rows.filter((r) => r.type === "snapshot" && !r.player.grounded).length;
  check("[P2] Bục nhảy (Đêm 2): bay ~1.4 s, đáp trong đảo đích, bỏ qua phím hướng", "n3-pad", !!land && air >= 80 && ev(rows, "player_hit").length === 0, JSON.stringify({ air_ticks: air, landed_at: land?.player.pos, tick: land?.tick }));
}
{
  const { rows } = cli({ name: "n4-drifter", night: 2, ticks: 130, scenario: { player: { carried: 8 }, drifters: [{ id: "D1", pos: [6, 1.5, 0], state: "idle" }] } });
  const st = ev(rows, "drifter_steal")[0];
  check("[P2] Gió Lạc: chase khi mang ≥ 5, cướp min(3, mang), flee, không mất Lửa", "n4-drifter", st?.data.amount === 3 && st.data.carried === 5 && ev(rows, "player_hit").length === 0 && snap(rows, st.tick + 1).drifters[0].state === "flee", JSON.stringify(st));
}
{
  const { rows } = cli({ name: "n5-drifter-drop", night: 2, ticks: 6, scenario: { player: { carried: 3 }, drifters: [{ id: "D1", pos: [4, 1.5, 0], state: "flee", state_ticks_left: 200, stolen: 3 }] }, inputs: press(0, "pulse") });
  check("[P2] Tỏa Sáng trúng Gió Lạc đang mang đồ → thả lại (drifter_drop)", "n5-drifter-drop", ev(rows, "drifter_drop")[0]?.data.amount === 3, JSON.stringify(ev(rows, "drifter_drop")[0]?.data));
}
{
  const { rows } = cli({ name: "n6-charm", night: 2, ticks: 120, scenario: { player: { pos: [34.5, 0, 0] } }, inputs: [{ tick: 0, move: [1, 0] }] });
  const p = ev(rows, "charm_picked")[0];
  check("[P2] Bùa Gió: 600 tick, chạy 7.2 m/s, hồi sinh sau 2700 tick", "n6-charm", p?.data.charm_ticks === 600 && Math.abs(snap(rows, p.tick + 20).player.vel[0] - 7.2) < 0.01 && Math.abs(snap(rows, p.tick).charms[0].respawn_s - 45) < 0.1, JSON.stringify({ event: p?.data, vel: snap(rows, p.tick + 20).player.vel[0], respawn_s: snap(rows, p.tick).charms[0].respawn_s }));
}
{
  const { rows } = cli({ name: "n7-wind", night: 3, ticks: 1900, every: 10, scenario: { wind_enabled: true } });
  const w = snap(rows, 1810).wind, a = (w.dir_deg * Math.PI) / 180;
  const d = [snap(rows, 1860).player.pos[0] - snap(rows, 1800).player.pos[0], snap(rows, 1860).player.pos[2] - snap(rows, 1800).player.pos[2]];
  check("[P2] Gió mạnh (Đêm 3): báo trước 2 s, đẩy 2 m/s", "n7-wind", snap(rows, 1700).wind.warning && w.active && Math.abs(d[0] - Math.cos(a) * 2) < 0.05 && Math.abs(d[1] - Math.sin(a) * 2) < 0.05, JSON.stringify({ warning_at_1700: snap(rows, 1700).wind.warning, wind: w, pushed_1s: d.map((x) => +x.toFixed(3)) }));
}
{
  const { rows } = cli({ name: "n8-bellpad", night: 3, ticks: 120, scenario: { player: { pos: [0, 3, 13] } } });
  const p = lastSnap(rows).player;
  check("[P2] Bục nhảy (Đêm 3) đưa Mây lên tầng 2 (Y = 6)", "n8-bellpad", Math.abs(p.pos[1] - 6) < 0.01 && Math.hypot(p.pos[0], p.pos[2]) < 8, JSON.stringify(p.pos));
}
{
  const { rows } = cli({ name: "n9-pause", ticks: 40, inputs: [{ tick: 0, move: [0, 1] }, ...press(10, "pause"), { tick: 20, pause: true }, { tick: 21, pause: false }] });
  check("[P2] Tạm dừng: tick tăng, sim_tick/vị trí/thời gian đứng yên; paused/resumed", "n9-pause", snap(rows, 12).state === "paused" && snap(rows, 12).sim_tick === 10 && snap(rows, 15).player.pos[2] === snap(rows, 11).player.pos[2] && ev(rows, "resumed")[0]?.tick === 21, JSON.stringify({ at12: { state: snap(rows, 12).state, sim_tick: snap(rows, 12).sim_tick }, at21: { state: snap(rows, 21).state, sim_tick: snap(rows, 21).sim_tick } }));
}
{
  const { rows } = cli({ name: "n10-schedule", ticks: 1300, every: 10, seed: 3, scenario: { random_shades: true, random_motes: true, shades: undefined, motes: undefined } });
  const sp = ev(rows, "shade_spawned").map((e) => `${e.tick}:${e.data.id}`);
  check("[P2] Lịch sinh: 20 đom đóm lúc đầu +1 mỗi 240 tick; Bóng Mực 2 con tick 300, +1 mỗi 480", "n10-schedule", sp.join() === "300:S1,300:S2,780:S3,1260:S4" && rows[0].motes_active === 20 && snap(rows, 240).motes_active === 21, `shade_spawned=${sp.join(" ")}, motes@0=${rows[0].motes_active}, @240=${snap(rows, 240).motes_active}`);
}
{
  const r = cli({ name: "n11-fullnight", night: 3, seed: 5, every: 10, ticks: 21600, scenario: { random_motes: true, random_shades: true, motes: undefined, shades: undefined } });
  check("[P2] Một Đêm đầy đủ (≤ 21.600 tick) headless ≤ 30 s (gồm khởi động tsx)", "n11-fullnight", r.sec <= 30, `${r.sec.toFixed(1)} s, kết thúc: ${JSON.stringify(end(r.rows))}`);
}

const sha = execSync("git rev-parse --short HEAD").toString().trim();
const md = [
  `# Bằng chứng ${PHASE}`, "",
  `Sinh tự động bởi \`npm run proof\` (commit cha: \`${sha}\`; chạy lại ở tag \`${PHASE}\` phải ra cùng kết quả). Đầu vào từng ca: \`cases/\`; output thô: \`*.jsonl\`.`, "",
  "| Yêu cầu | Cách kiểm chứng | Kết quả | Chi tiết |", "|---|---|---|---|",
  ...results.map((r) => `| ${r.req} | ${r.how} | ${r.ok ? "ĐẠT" : "CHƯA ĐẠT"} | \`${r.detail.replace(/\|/g, "/")}\` |`), "",
].join("\n");
writeFileSync(`${OUT}/REPORT.md`, md);
console.log(md);
if (results.some((r) => !r.ok)) process.exit(1);
