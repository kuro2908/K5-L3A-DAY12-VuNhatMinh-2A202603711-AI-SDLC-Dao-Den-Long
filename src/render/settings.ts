// Persisted user settings (volume, mouse sensitivity). Falls back to defaults when storage is unavailable.
export interface Settings { volume: number; sensitivity: number }
const KEY = "ddl.settings";
const DEFAULTS: Settings = { volume: 0.6, sensitivity: 1 };

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw.volume === "number" && typeof raw.sensitivity === "number") {
      return { volume: Math.min(1, Math.max(0, raw.volume)), sensitivity: Math.min(3, Math.max(0.2, raw.sensitivity)) };
    }
  } catch { /* private mode / corrupt value */ }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
