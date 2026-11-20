// Takes the README screenshots with a real browser:  npx tsx scripts/screenshots.ts   (needs `npm run build` first)
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { createGameServer } from "./server-lib";

const candidates = [process.env.CHROME_PATH ?? "", "C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
const exe = candidates.find((p) => p && existsSync(p));
if (!exe) { process.stderr.write("error: no browser found (set CHROME_PATH)\n"); process.exit(1); }
if (!existsSync(resolve("dist/index.html"))) { process.stderr.write("error: run npm run build first\n"); process.exit(1); }
mkdirSync("docs/screenshots", { recursive: true });

(async () => {
  const server = createGameServer();
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const browser = await puppeteer.launch({ executablePath: exe, headless: false, defaultViewport: { width: 1280, height: 720 }, args: ["--window-size=1280,820", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`, { waitUntil: "load" });
    const shot = async (name: string) => { await new Promise((r) => setTimeout(r, 500)); await page.screenshot({ path: `docs/screenshots/${name}.png` }); };
    await shot("menu");
    // Night 1: two lit lanterns (one running low), a draining shade, some motes carried
    await page.evaluate(`(() => { const d = window.__ddl; d.startNight(1); const s = window.__game.sim;
      s.lanterns[0].lit = true; s.lanterns[0].everLit = true; s.lanterns[0].fuelU = 5200;
      s.lanterns[1].lit = true; s.lanterns[1].everLit = true; s.lanterns[1].fuelU = 1300;
      s.player.x = 8; s.player.z = 14; s.player.carried = 6; s.player.successfulLights = 2; s.player.flames = 2;
      s.shades.push({id:'S9', x:21.5, z:8.2, gy:0, state:'drain', left:0, pushLeft:0, dx:1, dz:0, expel:0, target:'L2', drainTicks:0});
      d.renderBench(4); })()`);
    await shot("night1");
    await page.evaluate("(() => { const d = window.__ddl; d.startNight(2); window.__game.sim.player.x = 20; window.__game.sim.player.z = 8; window.__game.sim.player.carried = 5; d.renderBench(4); })()");
    await shot("night2");
    await page.evaluate("(() => { const d = window.__ddl; d.startNight(3); const s = window.__game.sim; s.player.z = -8; s.lanterns[3].lit = true; s.lanterns[3].fuelU = 5500; d.renderBench(4); })()");
    await shot("night3");
    await page.evaluate("window.__ddl.show('settings')");
    await shot("settings");
  } finally { await browser.close(); server.close(); }
  process.exit(0);
})();
