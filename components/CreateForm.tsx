"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, longLabel, toKey } from "@/lib/dates";
import MonthCalendar from "./MonthCalendar";
import {
  adminKey,
  getHistory,
  lsSet,
  pushHistory,
  removeHistory,
  type HistoryItem,
} from "@/lib/client";

type Preset = { label: string; build: (today: Date) => string[] };

/** Prochaines dates (aujourd'hui inclus) dont le jour de semaine est dans `days` (0 = dimanche). */
function nextDays(today: Date, span: number, days: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < span; i++) {
    const d = addDays(today, i);
    if (days.includes(d.getDay())) out.push(toKey(d));
  }
  return out;
}

const PRESETS: Preset[] = [
  {
    label: "Ce week-end",
    build: (t) => {
      // vendredi → dimanche à venir (ou en cours)
      const out: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(t, i);
        if ([5, 6, 0].includes(d.getDay())) out.push(toKey(d));
        if (d.getDay() === 0) break;
      }
      return out;
    },
  },
  { label: "Les 7 prochains jours", build: (t) => nextDays(t, 7, [0, 1, 2, 3, 4, 5, 6]) },
  { label: "Jeudis", build: (t) => nextDays(t, 28, [4]) },
  { label: "Vendredis & samedis", build: (t) => nextDays(t, 28, [5, 6]) },
  { label: "Les week-ends du mois", build: (t) => nextDays(t, 28, [6, 0]) },
  { label: "Soirs de semaine", build: (t) => nextDays(t, 14, [1, 2, 3, 4]) },
];

const IDEAS = ["Resto", "Ciné", "Apéro", "Week-end", "Escape game", "Soirée jeux", "Bowling"];

export default function CreateForm() {
  const router = useRouter();
  const [today, setToday] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [placeholder, setPlaceholder] = useState("Resto, ciné, week-end…");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [allowProposals, setAllowProposals] = useState(true);

  useEffect(() => {
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setToday(t);
    setHistory(getHistory());
    let i = 0;
    const timer = setInterval(() => {
      i = (i + 1) % IDEAS.length;
      setPlaceholder(`${IDEAS[i]}…`);
    }, 2200);
    return () => clearInterval(timer);
  }, []);

  function toggle(key: string) {
    setError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyPreset(p: Preset) {
    if (!today) return;
    const keys = p.build(today);
    setError("");
    setSelected((prev) => {
      const allIn = keys.every((k) => prev.has(k));
      const next = new Set(prev);
      keys.forEach((k) => (allIn ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) {
      setError("Choisis au moins une date dans le calendrier 👆");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, dates: [...selected], allowProposals }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      lsSet(adminKey(data.id), data.adminToken);
      pushHistory({ id: data.id, title: title.trim() || "Sortie entre potes", ts: Date.now(), admin: true });
      router.push(`/e/${data.id}?new=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Oups, réessaie.");
      setBusy(false);
    }
  }

  const sorted = [...selected].sort();
  const isPresetOn = (p: Preset) => {
    if (!today) return false;
    const keys = p.build(today);
    return keys.length > 0 && keys.every((k) => selected.has(k));
  };

  return (
    <>
      <div className="card">
        <label className="step-label" htmlFor="title">
          <span className="step-num">1</span> C&apos;est pour quoi&nbsp;?
        </label>
        <input
          id="title"
          className="input"
          value={title}
          maxLength={80}
          placeholder={placeholder}
          onChange={(e) => setTitle(e.target.value)}
          enterKeyHint="next"
          autoComplete="off"
        />
      </div>

      <div className="card">
        <p className="step-label">
          <span className="step-num">2</span> Quelles dates proposer&nbsp;?
        </p>

        <div className="chips" role="group" aria-label="Raccourcis">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`chip ${isPresetOn(p) ? "on" : ""}`}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <MonthCalendar selected={selected} onToggle={toggle} />

        <p className="hint">
          {sorted.length === 0
            ? "Tape sur les jours qui t'arrangent. Plus il y a de choix, plus c'est facile de trouver."
            : sorted.length === 1
              ? `1 date : ${longLabel(sorted[0])}`
              : `${sorted.length} dates, du ${longLabel(sorted[0]).toLowerCase()} au ${longLabel(sorted[sorted.length - 1]).toLowerCase()}`}
          {sorted.length > 0 && (
            <>
              {" · "}
              <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>
                Tout effacer
              </button>
            </>
          )}
        </p>

        <label className="switch-row">
          <span>
            <b>Les invités peuvent proposer d&apos;autres dates</b>
            <small>Pratique si aucune de tes dates ne convient. Modifiable plus tard.</small>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={allowProposals}
            onChange={(e) => setAllowProposals(e.target.checked)}
          />
        </label>
      </div>

      {history.length > 0 && (
        <div className="card history">
          <p className="step-label" style={{ marginBottom: 4 }}>
            Mes sondages
          </p>
          {history.map((h) => (
            <div key={h.id} className="history-row">
              <a href={`/e/${h.id}`}>
                <span>{h.title}</span>
                <span className="muted small">{h.admin ? "organisé par moi ›" : "›"}</span>
              </a>
              <button
                type="button"
                className="history-x"
                aria-label={`Retirer « ${h.title} » de ma liste`}
                title="Retirer de ma liste"
                onClick={() => {
                  removeHistory(h.id);
                  setHistory(getHistory());
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="how">
        <div>
          <span>🔗</span> Pas de compte, pas d&apos;appli : juste un lien à envoyer sur le groupe.
        </div>
        <div>
          <span>👆</span> Chacun tape sur les jours où il est dispo. 10 secondes.
        </div>
        <div>
          <span>🏆</span> La date qui arrange le plus de monde ressort en tête.
        </div>
      </div>

      <div className="bottom-bar">
        <div className="bottom-bar-inner">
          {error && (
            <p className="center small shake" style={{ color: "var(--accent)", margin: "0 0 8px", fontWeight: 650 }}>
              {error}
            </p>
          )}
          <button type="button" className="btn btn-primary btn-block" onClick={submit} disabled={busy}>
            {busy
              ? "Création…"
              : selected.size === 0
                ? "Créer le sondage"
                : `Créer le sondage · ${selected.size} date${selected.size > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </>
  );
}

