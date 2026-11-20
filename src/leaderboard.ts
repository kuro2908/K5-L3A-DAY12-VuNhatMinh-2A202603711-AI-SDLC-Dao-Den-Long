// Local leaderboard rules (Ticket-04 section 3). Pure functions: shared by the disk-backed server and the browser fallback.
export interface Entry { name: string; score: number; nights_won: number; achieved_at: string; seed: number }
export const MAX_ENTRIES = 10;

/** 3-12 characters: ASCII letters/digits/underscore (Vietnamese letters with diacritics are accepted as a bonus). */
const NAME_RE = /^[\p{Script=Latin}0-9_]{3,12}$/u;
export const normalizeName = (n: string): string => n.normalize("NFC").trim();
export const validName = (n: unknown): n is string => typeof n === "string" && NAME_RE.test(normalizeName(n));

/** ISO 8601 with the local UTC offset, e.g. 2026-11-20T19:30:00+07:00. */
export function isoWithOffset(d: Date): string {
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? "+" : "-", a = Math.abs(off);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

export function isEntry(e: unknown): e is Entry {
  const x = e as Entry;
  return !!x && validName(x.name) && Number.isFinite(x.score) && x.score >= 0 && Number.isInteger(x.nights_won) && x.nights_won >= 0 && x.nights_won <= 3
    && typeof x.achieved_at === "string" && !Number.isNaN(Date.parse(x.achieved_at)) && Number.isInteger(x.seed);
}

/** Highest score first; equal scores: whoever got there first stays on top. */
export function sortEntries(entries: Entry[]): Entry[] {
  return entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.score - a.e.score || Date.parse(a.e.achieved_at) - Date.parse(b.e.achieved_at) || a.i - b.i).map((x) => x.e);
}

export function addEntry(entries: Entry[], entry: Entry): Entry[] {
  return sortEntries([...entries, { ...entry, name: normalizeName(entry.name) }]).slice(0, MAX_ENTRIES);
}

/** Parse stored JSON defensively: drop anything that is not a valid entry. */
export function parseEntries(raw: unknown): Entry[] {
  const list = Array.isArray(raw) ? raw : (raw as { entries?: unknown })?.entries;
  return sortEntries(Array.isArray(list) ? list.filter(isEntry) : []).slice(0, MAX_ENTRIES);
}
