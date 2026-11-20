// Persisted user settings: volume, mouse sensitivity, colour-blind palette, reduced motion, large UI text, key bindings.
// Falls back to defaults when storage is unavailable or corrupt.
export type Action = "up" | "down" | "left" | "right" | "jump" | "dash" | "interact" | "pulse" | "pause";
export type Bindings = Record<Action, string>;

export const ACTIONS: { id: Action; label: string }[] = [
  { id: "up", label: "Tiến" }, { id: "down", label: "Lùi" }, { id: "left", label: "Sang trái" }, { id: "right", label: "Sang phải" },
  { id: "jump", label: "Nhảy" }, { id: "dash", label: "Lướt" }, { id: "interact", label: "Nạp ánh sáng / châm dầu" },
  { id: "pulse", label: "Tỏa sáng" }, { id: "pause", label: "Tạm dừng" },
];
export const DEFAULT_BINDINGS: Bindings = { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", jump: "Space", dash: "ShiftLeft", interact: "KeyE", pulse: "KeyQ", pause: "Escape" };

export interface Settings { volume: number; sensitivity: number; colorblind: boolean; reducedMotion: boolean; largeText: boolean; bindings: Bindings }
const KEY = "ddl.settings";
const defaults = (): Settings => ({ volume: 0.6, sensitivity: 1, colorblind: false, reducedMotion: false, largeText: false, bindings: { ...DEFAULT_BINDINGS } });

/** Human readable name of a KeyboardEvent.code. */
export function keyLabel(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = { Space: "Space", Escape: "Esc", ShiftLeft: "Shift trái", ShiftRight: "Shift phải", ControlLeft: "Ctrl trái", ControlRight: "Ctrl phải", AltLeft: "Alt trái", AltRight: "Alt phải", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "Enter", Tab: "Tab" };
  return map[code] ?? code;
}

/** Which action already uses `code` (other than `except`)? Used to detect and report key conflicts. */
export function conflictWith(b: Bindings, code: string, except: Action): Action | null {
  for (const a of ACTIONS) if (a.id !== except && b[a.id] === code) return a.id;
  return null;
}

export function loadSettings(): Settings {
  const s = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") {
      if (typeof raw.volume === "number") s.volume = Math.min(1, Math.max(0, raw.volume));
      if (typeof raw.sensitivity === "number") s.sensitivity = Math.min(3, Math.max(0.2, raw.sensitivity));
      s.colorblind = raw.colorblind === true; s.reducedMotion = raw.reducedMotion === true; s.largeText = raw.largeText === true;
      if (raw.bindings && typeof raw.bindings === "object") {
        const merged: Bindings = { ...DEFAULT_BINDINGS };
        for (const a of ACTIONS) if (typeof raw.bindings[a.id] === "string" && raw.bindings[a.id]) merged[a.id] = raw.bindings[a.id];
        // a saved set with duplicate keys would make actions unreachable: fall back to defaults
        s.bindings = new Set(Object.values(merged)).size === ACTIONS.length ? merged : { ...DEFAULT_BINDINGS };
      }
    }
  } catch { /* private mode / corrupt value */ }
  return s;
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
