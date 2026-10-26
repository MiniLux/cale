"use client";

/** Petits utilitaires côté navigateur (localStorage protégé, identité, historique). */

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* navigation privée, stockage plein… on ignore */
  }
}

export function newPid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type Me = { pid: string; name: string };
export const meKey = (eventId: string) => `cale:me:${eventId}`;
export const adminKey = (eventId: string) => `cale:admin:${eventId}`;

export type HistoryItem = { id: string; title: string; ts: number; admin?: boolean };
const HISTORY_KEY = "cale:history";

export function getHistory(): HistoryItem[] {
  return lsGet<HistoryItem[]>(HISTORY_KEY, []);
}

export function pushHistory(item: HistoryItem): void {
  const list = getHistory().filter((h) => h.id !== item.id);
  const prev = getHistory().find((h) => h.id === item.id);
  list.unshift({ ...item, admin: item.admin || prev?.admin });
  lsSet(HISTORY_KEY, list.slice(0, 12));
}

export function removeHistory(id: string): void {
  lsSet(
    HISTORY_KEY,
    getHistory().filter((h) => h.id !== id)
  );
}

/** Oublie tout ce que ce navigateur sait d'un sondage (après suppression). */
export function forgetEvent(id: string): void {
  removeHistory(id);
  try {
    localStorage.removeItem(adminKey(id));
    localStorage.removeItem(meKey(id));
  } catch {
    /* ignore */
  }
}

export function lastName(): string {
  return lsGet<string>("cale:lastName", "");
}
export function saveLastName(name: string): void {
  lsSet("cale:lastName", name);
}

const PALETTE = [
  "#E4572E", "#17BEBB", "#7A5CFA", "#F2A541", "#2E86AB",
  "#D7263D", "#3BB273", "#C05299", "#8C6E4D", "#4357AD",
];

export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : name.trim().slice(0, 2);
  return s.toUpperCase();
}
