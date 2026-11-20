// Runs the REAL headless CLI on the scenarios in scenarios/ and checks the output against the
// requirement it is meant to prove. Writes raw outputs + REPORT.md to docs/proof/phase-1/.
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type Row = Record<string, any>;
const OUT = "docs/proof/phase-1";
mkdirSync(OUT, { recursive: true });

function cli(name: string, args: string[]): { rows: Row[]; raw: string } {
  const out = `${OUT}/${name}.jsonl`;
  const r = spawnSync("npx", ["tsx", "src/headless/cli.ts", ...args, "--out", out], { encoding: "utf8", shell: true });
  if (r.status !== 0) throw new Error(`${name}: exit ${r.status}: ${r.stderr}`);
  const raw = readFileSync(out, "utf8");
  return { rows: raw.trim().split("\n").map((l) => JSON.parse(l)), raw };
}
const ev = (rows: Row[], n: string) => rows.filter((r) => r.type === "event" && r.name === n);
const end = (rows: Row[]) => rows[rows.length - 1];

const results: { req: string; how: string; ok: boolean; detail: string }[] = [];
const check = (req: string, how: string, ok: boolean, detail: string) => results.push({ req, how, ok, detail });

{ // win by lighting every lantern
  const { rows } = cli("win", ["--seed", "1", "--night", "1", "--ticks", "600", "--scenario", "scenarios/win.scenario.json", "--inputs", "scenarios/win.inputs.json"]);
  const go = ev(rows, "game_over")[0];
  check("Thắp hết đèn thì thắng", "win.scenario + win.inputs", go?.data.result === "won" && end(rows).state === "won", JSON.stringify({ lantern_lit: ev(rows, "lantern_lit")[0]?.data, game_over: go?.data, end: end(rows) }));
}
{ // hit
  const { rows } = cli("hit", ["--seed", "1", "--night", "1", "--ticks", "300", "--scenario", "scenarios/hit.scenario.json"]);
  const h = ev(rows, "player_hit")[0];
  check("Bóng Mực chạm thì mất máu (và rơi một phần đom đóm)", "hit.scenario", h?.data.flames === 2 && h?.data.dropped === 2, JSON.stringify(h));
}
{ // pulse
  const { rows } = cli("pulse", ["--seed", "1", "--night", "1", "--ticks", "10", "--snapshot-every", "1", "--scenario", "scenarios/pulse.scenario.json", "--inputs", "scenarios/pulse.inputs.json"]);
  const p = ev(rows, "pulse")[0];
  const s = rows.find((r) => r.type === "snapshot" && r.tick === 1)!;
  check("Tỏa sáng xua/choáng Bóng Mực trong bán kính, tốn ánh sáng", "pulse.scenario + pulse.inputs", JSON.stringify(p?.data.stunned_ids) === '["S1"]' && s.player.carried === 1 && s.shades[0].state === "stunned", JSON.stringify({ pulse: p?.data, carried: s.player.carried, S1: s.shades[0], S2: s.shades[1] }));
}
{ // safe radius
  const { rows } = cli("safe", ["--seed", "1", "--night", "1", "--ticks", "900", "--snapshot-every", "1", "--scenario", "scenarios/safe.scenario.json"]);
  const min = Math.min(...rows.filter((r) => r.type === "snapshot").map((r) => Math.hypot(r.shades[0].pos[0], r.shades[0].pos[2])));
  check("Bóng Mực sợ đèn: không vào bán kính an toàn quanh đèn đã thắp", "safe.scenario (900 snapshot)", min >= 8 - 1e-3 && ev(rows, "player_hit").length === 0, `khoảng cách nhỏ nhất tới đèn = ${min.toFixed(3)} (safe_radius 8), player_hit = 0`);
}
{ // dawn loss
  const { rows } = cli("dawn", ["--seed", "1", "--night", "1", "--ticks", "1000", "--scenario", "scenarios/dawn.scenario.json"]);
  check("Hết đêm mà chưa thắp hết đèn thì thua (dawn)", "dawn.scenario (5 s)", ev(rows, "game_over")[0]?.data.reason === "dawn" && end(rows).ticks === 300, JSON.stringify(end(rows)));
}
{ // determinism with random spawns
  const a = cli("determinism-a", ["--seed", "99", "--night", "1", "--ticks", "6000"]);
  const b = cli("determinism-b", ["--seed", "99", "--night", "1", "--ticks", "6000"]);
  const c = cli("determinism-c", ["--seed", "100", "--night", "1", "--ticks", "6000"]);
  check("Tính tất định: cùng seed → output giống hệt", "2 lần chạy seed 99 so từng byte; seed 100 phải khác", a.raw === b.raw && a.raw !== c.raw, `${a.raw.length} byte, shade_spawned = ${ev(a.rows, "shade_spawned").length}`);
}
{ // exit code 2 on malformed input
  writeFileSync(`${OUT}/bad-inputs.json`, JSON.stringify({ frames: [{ tick: 3 }, { tick: 3 }] }));
  const r = spawnSync("npx", ["tsx", "src/headless/cli.ts", "--seed", "1", "--night", "1", "--ticks", "5", "--inputs", `${OUT}/bad-inputs.json`, "--out", `${OUT}/x.jsonl`], { encoding: "utf8", shell: true });
  check("File inputs sai định dạng → mã thoát 2", "tick trùng nhau", r.status === 2, `exit=${r.status}, stderr=${r.stderr.trim()}`);
}

const sha = execSync("git rev-parse --short HEAD").toString().trim();
const md = [
  "# Bằng chứng Phase 1", "",
  `Sinh tự động bởi \`npm run proof\` ở commit \`${sha}\` (chạy lại ở tag \`phase-1\` phải ra cùng kết quả). Output thô: các file \`*.jsonl\` cùng thư mục.`, "",
  "| Yêu cầu | Cách kiểm chứng | Kết quả | Chi tiết |", "|---|---|---|---|",
  ...results.map((r) => `| ${r.req} | ${r.how} | ${r.ok ? "ĐẠT" : "CHƯA ĐẠT"} | \`${r.detail.replace(/\|/g, "/")}\` |`), "",
].join("\n");
writeFileSync(`${OUT}/REPORT.md`, md);
console.log(md);
if (results.some((r) => !r.ok)) process.exit(1);
