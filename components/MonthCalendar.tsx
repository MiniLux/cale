"use client";

import { useEffect, useMemo, useState } from "react";
import { longLabel, monthLabel, toKey } from "@/lib/dates";

const DOW = ["L", "M", "M", "J", "V", "S", "D"];
const MAX_MONTHS_AHEAD = 11;

type Props = {
  selected: Set<string>;
  onToggle: (key: string) => void;
  /** Dates déjà dans le sondage : affichées mais non sélectionnables */
  taken?: Set<string>;
  /** Mois affiché au départ (YYYY-MM-DD de n'importe quel jour du mois) */
  startKey?: string;
};

export default function MonthCalendar({ selected, onToggle, taken, startKey }: Props) {
  const [today, setToday] = useState<Date | null>(null);
  const [cursor, setCursor] = useState<Date | null>(null);

  useEffect(() => {
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setToday(t);
    const start = startKey ? new Date(`${startKey}T12:00:00`) : t;
    const s = start < t ? t : start;
    setCursor(new Date(s.getFullYear(), s.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cells = useMemo(() => {
    if (!cursor) return [];
    const offset = (new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return out;
  }, [cursor]);

  if (!cursor || !today) return <div style={{ height: 320 }} />;

  const todayK = toKey(today);
  const minMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const maxMonth = new Date(today.getFullYear(), today.getMonth() + MAX_MONTHS_AHEAD, 1);
  const move = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <>
      <div className="cal-head">
        <button
          type="button"
          className="cal-nav"
          aria-label="Mois précédent"
          onClick={() => move(-1)}
          disabled={cursor <= minMonth}
        >
          ‹
        </button>
        <strong>{monthLabel(cursor)}</strong>
        <button
          type="button"
          className="cal-nav"
          aria-label="Mois suivant"
          onClick={() => move(1)}
          disabled={cursor >= maxMonth}
        >
          ›
        </button>
      </div>
      <div className="cal-grid" role="grid">
        {DOW.map((d, i) => (
          <div key={i} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const k = toKey(d);
          const past = k < todayK;
          const isTaken = !!taken?.has(k);
          const on = selected.has(k);
          const we = d.getDay() === 0 || d.getDay() === 6;
          return (
            <button
              key={k}
              type="button"
              disabled={past || isTaken}
              aria-pressed={on}
              aria-label={`${longLabel(k)}${isTaken ? " (déjà dans le sondage)" : ""}`}
              title={isTaken ? "Déjà dans le sondage" : undefined}
              className={`cal-day ${on ? "on" : ""} ${we ? "weekend" : ""} ${k === todayK ? "today" : ""} ${isTaken ? "taken" : ""}`}
              onClick={() => onToggle(k)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </>
  );
}
