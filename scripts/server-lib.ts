// Static server for dist/ plus a tiny disk-backed leaderboard API (used by scripts/serve.ts, scripts/bench.ts and the tests).
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { addEntry, isEntry, isoWithOffset, parseEntries, validName, Entry } from "../src/leaderboard";

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".map": "application/json" };

export function leaderboardFile(): string { return resolve(process.env.LEADERBOARD_FILE ?? "data/leaderboard.json"); }

export function readLeaderboard(file = leaderboardFile()): Entry[] {
  try { return parseEntries(JSON.parse(readFileSync(file, "utf8"))); } catch { return []; }
}
function writeLeaderboard(entries: Entry[], file = leaderboardFile()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ entries }, null, 2) + "\n");
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((res, rej) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 4096) { req.destroy(); rej(new Error("too large")); } }); req.on("end", () => res(b)); req.on("error", rej); });
}

/** Handles /api/leaderboard; returns false when the request is not for it (so other handlers can continue). */
export async function handleLeaderboard(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname !== "/api/leaderboard") return false;
  res.setHeader("content-type", "application/json");
  if (req.method === "GET") { res.end(JSON.stringify({ entries: readLeaderboard() })); return true; }
  if (req.method === "POST") {
    try {
      const raw = JSON.parse(await body(req));
      if (!validName(raw.name)) { res.statusCode = 400; res.end(JSON.stringify({ error: "name must be 3-12 characters: letters, digits or _" })); return true; }
      const entry: Entry = { name: raw.name, score: Number(raw.score), nights_won: Number(raw.nights_won), achieved_at: typeof raw.achieved_at === "string" ? raw.achieved_at : isoWithOffset(new Date()), seed: Number(raw.seed) };
      if (!isEntry(entry)) { res.statusCode = 400; res.end(JSON.stringify({ error: "invalid entry" })); return true; }
      const entries = addEntry(readLeaderboard(), entry);
      writeLeaderboard(entries);
      res.end(JSON.stringify({ entries }));
    } catch { res.statusCode = 400; res.end(JSON.stringify({ error: "bad request" })); }
    return true;
  }
  res.statusCode = 405; res.end("{}");
  return true;
}

export function createGameServer(root = resolve("dist")): Server {
  return createServer(async (req, res) => {
    if (await handleLeaderboard(req, res)) return;
    const url = new URL(req.url ?? "/", "http://x");
    // static files (no path escape outside root)
    let path = normalize(join(root, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
    if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) path = join(root, "index.html");
    if (!existsSync(path)) { res.statusCode = 404; res.end("dist/ not found - run: npm run build"); return; }
    res.setHeader("content-type", MIME[extname(path)] ?? "application/octet-stream");
    res.end(readFileSync(path));
  });
}
