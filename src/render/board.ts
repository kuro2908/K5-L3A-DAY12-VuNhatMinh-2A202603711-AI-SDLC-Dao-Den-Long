// Client side of the leaderboard. Prefers the disk-backed API (npm start / npm run dev); falls back to localStorage
// (e.g. a static copy of dist/ opened without the server).
import { Entry, addEntry, isoWithOffset, parseEntries } from "../leaderboard";

const KEY = "ddl.board";

async function api(init?: RequestInit): Promise<Entry[] | null> {
  try {
    const r = await fetch("/api/leaderboard", init);
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null; // e.g. a static host answering with index.html
    return parseEntries(await r.json());
  } catch { return null; }
}

function local(): Entry[] {
  try { return parseEntries(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { return []; }
}

export async function loadBoard(): Promise<Entry[]> {
  return (await api()) ?? local();
}

export async function submitScore(name: string, score: number, nightsWon: number, seed: number): Promise<Entry[]> {
  const entry: Entry = { name, score, nights_won: nightsWon, achieved_at: isoWithOffset(new Date()), seed };
  const served = await api({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entry) });
  if (served) return served;
  const entries = addEntry(local(), entry);
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* ignore */ }
  return entries;
}
