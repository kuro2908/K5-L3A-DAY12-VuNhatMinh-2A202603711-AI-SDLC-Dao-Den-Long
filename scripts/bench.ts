// Benchmark (Ticket-04 section 1):  npx tsx scripts/bench.ts --seed 42 --duration 30 --out bench.json
// Serves dist/ (run `npm run build` first), opens Chrome/Chromium/Edge at 1280x720 (not fullscreen, vsync/frame-rate limit off),
// loads the benchmark scene (?bench=1: Night 1, 200 wandering shades, 100 motes, L1-L3 lit, orbiting camera), skips 3 s of warm-up,
// measures --duration seconds and writes bench.json.  Options: --headless (no visible window), --screenshot file.png.
import { existsSync, writeFileSync } from "node:fs";
import { cpus, platform, release, arch } from "node:os";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { createGameServer } from "./server-lib";

const t0 = Date.now(); // "process start": load_ms is measured from here to the first frame of the benchmark scene
const args = process.argv.slice(2);
const arg = (k: string, d?: string): string => {
  const i = args.indexOf(`--${k}`);
  if (i < 0 || i + 1 >= args.length) { if (d === undefined) { process.stderr.write(`error: missing --${k}\n`); process.exit(1); } return d as string; }
  return args[i + 1];
};
const seed = Number(arg("seed", "42")), duration = Number(arg("duration", "30")), out = arg("out");
if (!Number.isFinite(seed) || !(duration > 0)) { process.stderr.write("error: --seed must be a number and --duration > 0\n"); process.exit(1); }
const headless = args.includes("--headless");
const shot = args.includes("--screenshot") ? arg("screenshot") : "";

function findBrowser(): string {
  const env = process.env.CHROME_PATH ?? process.env.BROWSER;
  if (env && existsSync(env)) return env;
  const c: string[] = platform() === "win32"
    ? ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"]
    : platform() === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
  const hit = c.find((p) => existsSync(p));
  if (hit) return hit;
  for (const name of ["google-chrome", "chromium", "chromium-browser"]) { try { return execFileSync("which", [name], { encoding: "utf8" }).trim(); } catch { /* next */ } }
  process.stderr.write("error: no Chrome/Chromium/Edge found. Install one or set CHROME_PATH=/path/to/browser\n");
  process.exit(1);
}

if (!existsSync(resolve("dist/index.html"))) { process.stderr.write("error: dist/ not found - run: npm run build\n"); process.exit(1); }

(async () => { // async wrapper: tsx runs this file as CommonJS (no top-level await)
const server = createGameServer();
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;

const browser = await puppeteer.launch({
  executablePath: findBrowser(), headless,
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  args: ["--window-size=1280,820", "--disable-gpu-vsync", "--disable-frame-rate-limit", "--ignore-gpu-blocklist", "--no-first-run", "--no-default-browser-check",
    "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"],
});
let code = 0;
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/?bench=1&seed=${seed}&duration=${duration}`, { waitUntil: "load" });
  if (shot) { await new Promise((r) => setTimeout(r, 6000)); await page.screenshot({ path: shot }); }
  await page.waitForFunction("window.__benchResult", { timeout: (duration + 120) * 1000, polling: 500 });
  const r = (await page.evaluate("window.__benchResult")) as Record<string, number | string>;
  const first = (await page.evaluate("window.__benchFirst")) as number;
  const version = await browser.version();
  const round = (x: number, n = 1) => Math.round(x * 10 ** n) / 10 ** n;
  const result = {
    contract_version: "1.3",
    avg_fps: round(r.avg_fps as number), p1_low_fps: round(r.p1_low_fps as number), frame_ms_p95: round(r.frame_ms_p95 as number),
    frames: r.frames, frame_ms_max: round(r.frame_ms_max as number), frames_over_100ms: r.frames_over_100ms, load_ms: Math.round(first - t0),
    peak_mem_mb: null,
    peak_mem_note: "web build: the browser process RSS is not measurable from the page; JS heap peak is reported instead in js_heap_peak_mb",
    js_heap_peak_mb: round(r.js_heap_peak_mb as number),
    vsync_off: true,
    renderer: `${r.gl_renderer} | three.js r170 (WebGL2) | ${version}`,
    os: `${platform()} ${release()} ${arch()}, ${cpus()[0]?.model ?? "unknown CPU"} x${cpus().length}`,
    scene: { shades: 200, motes: 100, draw_calls: r.draw_calls, triangles: r.triangles, viewport: "1280x720", headless },
  };
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  process.stderr.write(`error: benchmark failed: ${(e as Error).message}\n`);
  code = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
})();
