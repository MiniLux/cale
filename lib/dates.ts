/** Utilitaires de dates — on manipule uniquement des jours "YYYY-MM-DD" (pas de fuseau). */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Samedi 14 novembre" */
export function longLabel(key: string): string {
  const s = fromKey(key).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return cap(s);
}

/** "sam." */
export function weekdayShort(key: string): string {
  return fromKey(key)
    .toLocaleDateString("fr-FR", { weekday: "short" })
    .replace(".", "");
}

/** "novembre 2026" */
export function monthLabel(d: Date): string {
  return cap(d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
}

/** "Sam. 14 nov." */
export function shortLabel(key: string): string {
  return cap(
    fromKey(key).toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  );
}

export function isValidDateKey(key: string): boolean {
  if (!DATE_RE.test(key)) return false;
  const d = fromKey(key);
  return toKey(d) === key;
}

/** Plus ancienne date acceptée par le serveur : hier en UTC (tolère les fuseaux horaires). */
export function minAcceptedKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
