"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Brand from "./Brand";
import { Avatar, AvatarStack } from "./Avatars";
import {
  adminKey,
  lastName,
  lsGet,
  lsSet,
  meKey,
  newPid,
  pushHistory,
  saveLastName,
  type Me,
} from "@/lib/client";
import { fromKey, longLabel, monthLabel, shortLabel, todayKey, weekdayShort } from "@/lib/dates";
import { computeStats, rankStats } from "@/lib/ranking";
import type { Participant, PublicEvent, Vote } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function EventClient({ initial }: { initial: PublicEvent }) {
  const [event, setEvent] = useState<PublicEvent>(initial);
  const [me, setMe] = useState<Me | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, Vote>>({});
  const [registered, setRegistered] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [shakeWho, setShakeWho] = useState(false);
  const [toast, setToast] = useState("");
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState("");

  const whoRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef(false);

  const id = event.id;

  // ---------- Initialisation côté navigateur ----------
  useEffect(() => {
    setMounted(true);
    setToday(todayKey());
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setIsNew(true);
      window.history.replaceState(null, "", `/e/${id}`);
    }
    // lien organisateur : /e/xxx#admin=TOKEN
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hashToken = hash.get("admin");
    if (hashToken) {
      lsSet(adminKey(id), hashToken);
      window.history.replaceState(null, "", `/e/${id}`);
    }
    const token = hashToken || lsGet<string | null>(adminKey(id), null);
    setAdminToken(token);

    const saved = lsGet<Me | null>(meKey(id), null);
    if (saved) {
      setMe(saved);
      const p = initial.participants.find((x) => x.id === saved.pid);
      if (p) {
        setMyVotes(p.votes);
        setRegistered(true);
      }
    }
    setNameInput(lastName());
    pushHistory({ id, title: initial.title, ts: Date.now(), admin: !!token });
  }, [id, initial]);

  // ---------- Rafraîchissement automatique ----------
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${id}`, { cache: "no-store" });
      if (res.ok) setEvent(await res.json());
    } catch {
      /* hors ligne : on réessaiera */
    }
  }, [id]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && !pendingSave.current) refresh();
    };
    const t = setInterval(tick, 7000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  // ---------- Enregistrement automatique ----------
  const persist = useCallback(
    async (who: Me, votes: Record<string, Vote>) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/events/${id}/vote`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pid: who.pid, name: who.name, votes }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRegistered(true);
        setSaveState("saved");
        setEvent((ev) => ({
          ...ev,
          participants: [
            ...ev.participants.filter((p) => p.id !== who.pid),
            data.participant as Participant,
          ],
        }));
      } catch {
        setSaveState("error");
      } finally {
        pendingSave.current = false;
      }
    },
    [id]
  );

  const scheduleSave = useCallback(
    (who: Me, votes: Record<string, Vote>) => {
      pendingSave.current = true;
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(who, votes), 450);
    },
    [persist]
  );

  function askName() {
    whoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setShakeWho(true);
    setTimeout(() => setShakeWho(false), 400);
    setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 300);
  }

  function setVote(date: string, v: Vote | null) {
    if (!me) return askName();
    const next = { ...myVotes };
    if (v) next[date] = v;
    else delete next[date];
    setMyVotes(next);
    scheduleSave(me, next);
  }

  function confirmName(e?: React.FormEvent) {
    e?.preventDefault();
    const name = nameInput.trim();
    if (!name) {
      nameRef.current?.focus();
      return;
    }
    // Si quelqu'un a déjà ce prénom, on reprend sa ligne (changement d'appareil)
    const existing = event.participants.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) return pickExisting(existing);
    const who = { pid: newPid(), name };
    setMe(who);
    lsSet(meKey(id), who);
    saveLastName(name);
  }

  function pickExisting(p: Participant) {
    const who = { pid: p.id, name: p.name };
    setMe(who);
    setMyVotes(p.votes);
    setRegistered(true);
    lsSet(meKey(id), who);
    saveLastName(p.name);
  }

  function changeIdentity() {
    setMe(null);
    setMyVotes({});
    setRegistered(false);
    setSaveState("idle");
    try {
      localStorage.removeItem(meKey(id));
    } catch {}
  }

  // ---------- Partage ----------
  const shareUrl = mounted ? `${window.location.origin}/e/${id}` : "";
  const shareText = `${event.title} : on se voit quand ? Coche tes dispos ici 👉`;

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 1800);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("Lien copié ✓");
    } catch {
      window.prompt("Copie ce lien :", shareUrl);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text: shareText, url: shareUrl });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    copyLink();
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;

  // ---------- Organisateur ----------
  async function setFinal(date: string | null) {
    if (!adminToken) return;
    const res = await fetch(`/api/events/${id}/final`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminToken, date }),
    });
    if (res.ok) {
      setEvent((ev) => ({ ...ev, finalDate: date }));
      flash(date ? "C'est calé ! 🎉" : "Date annulée");
      if (date) window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      flash("Impossible : tu n'es pas l'organisateur");
    }
  }

  async function copyAdminLink() {
    if (!adminToken) return;
    try {
      await navigator.clipboard.writeText(`${shareUrl}#admin=${adminToken}`);
      flash("Lien organisateur copié — garde-le pour toi");
    } catch {
      window.prompt("Ton lien organisateur (ne le partage pas) :", `${shareUrl}#admin=${adminToken}`);
    }
  }

  // ---------- Calculs ----------
  const participants: Participant[] = useMemo(() => {
    const others = event.participants.filter((p) => p.id !== me?.pid);
    const mine =
      me && (registered || Object.keys(myVotes).length > 0)
        ? [{ id: me.pid, name: me.name, votes: myVotes, updatedAt: Date.now() }]
        : [];
    return [...others, ...mine];
  }, [event.participants, me, myVotes, registered]);

  const stats = useMemo(() => computeStats(event.dates, participants), [event.dates, participants]);
  const ranked = useMemo(() => rankStats(stats).filter((s) => s.score > 0), [stats]);
  const leader = ranked[0];
  const total = participants.length;
  const isAdmin = !!adminToken;
  const visibleDates = stats.filter((s) => !today || s.date >= today || s.date === event.finalDate);
  const pastCount = stats.length - visibleDates.length;
  const showShareCard = mounted && (isNew || (isAdmin && event.participants.length < 2));

  // ---------- Rendu ----------
  return (
    <main className="wrap">
      {toast && <div className="toast" role="status">{toast}</div>}

      <div className="top-bar">
        <Brand />
        <button className="btn btn-ghost btn-sm" onClick={share}>
          ↗ Inviter
        </button>
      </div>

      <h1 className="ev-title">{event.title}</h1>
      <p className="ev-sub">
        {total === 0
          ? "Personne n'a encore répondu."
          : `${total} personne${total > 1 ? "s ont" : " a"} répondu`}
        {total > 0 && (
          <span style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: 8 }}>
            <AvatarStack yes={participants} max={8} />
          </span>
        )}
      </p>

      {event.finalDate && <FinalCard event={event} isAdmin={isAdmin} onCancel={() => setFinal(null)} />}

      {showShareCard && !event.finalDate && (
        <div className="card share-card">
          <h2>{isNew ? "Sondage créé ! 🎉" : "Invite tes potes"}</h2>
          <p>Envoie le lien sur le groupe. Personne n&apos;a besoin de créer de compte.</p>
          <div className="btn-row">
            <a className="btn btn-wa" href={waHref} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <button className="btn btn-primary" onClick={share}>
              Partager le lien
            </button>
          </div>
        </div>
      )}

      {/* Meilleure date en direct */}
      {leader && !event.finalDate && (
        <div className="card">
          <div className="leader">
            <div className="leader-badge" aria-hidden>
              🏆
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="leader-label">Pour l&apos;instant, la meilleure date</div>
              <div className="leader-date">{longLabel(leader.date)}</div>
              <div className="leader-meta">
                {leader.yes.length}/{total} dispo
                {leader.maybe.length > 0 && ` · ${leader.maybe.length} si besoin`}
                {leader.no.length > 0 &&
                  leader.no.length <= 3 &&
                  ` · manque ${leader.no.map((p) => p.name).join(", ")}`}
              </div>
            </div>
          </div>
          {isAdmin && (
            <div className="podium">
              {ranked.slice(0, 3).map((s, i) => (
                <div key={s.date} className="podium-row">
                  <span className="rank">{i + 1}.</span>
                  <span className="grow">
                    <b>{shortLabel(s.date)}</b>{" "}
                    <span className="muted small">
                      {s.yes.length} ✓{s.maybe.length > 0 && ` · ${s.maybe.length} ~`}
                    </span>
                  </span>
                  <button className="btn btn-dark btn-sm" onClick={() => setFinal(s.date)}>
                    Valider
                  </button>
                </div>
              ))}
              <p className="hint" style={{ marginTop: 2 }}>
                Toi seul vois ces boutons (organisateur). Valider prévient tout le monde sur cette page.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Identité */}
      {mounted && !me && (
        <div ref={whoRef} className={`card ${shakeWho ? "shake" : ""}`}>
          <form onSubmit={confirmName}>
            <label className="step-label" htmlFor="name">
              👋 C&apos;est qui&nbsp;?
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="name"
                ref={nameRef}
                className="input"
                placeholder="Ton prénom"
                value={nameInput}
                maxLength={30}
                onChange={(e) => setNameInput(e.target.value)}
                autoComplete="given-name"
                enterKeyHint="go"
              />
              <button type="submit" className="btn btn-primary" disabled={!nameInput.trim()}>
                OK
              </button>
            </div>
            {event.participants.length > 0 && (
              <>
                <p className="hint">Tu as déjà répondu sur un autre appareil ? Tape sur ton prénom :</p>
                <div className="who-chips">
                  {event.participants.map((p) => (
                    <button type="button" key={p.id} className="who-chip" onClick={() => pickExisting(p)}>
                      <Avatar name={p.name} lg /> {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* Dates */}
      <div className="section-title">
        <h2>{me ? `Tes dispos, ${me.name}` : "Les dates proposées"}</h2>
        {me && (
          <button className="link-btn" onClick={changeIdentity}>
            Pas toi ?
          </button>
        )}
      </div>
      <p className="legend">
        <span><i style={{ background: "var(--yes)" }} />Tape = dispo</span>
        <span><i style={{ background: "var(--maybe)" }} />si besoin</span>
        <span>Rien = pas dispo</span>
      </p>

      <div className="date-list">
        {visibleDates.map((s, i) => {
          const mine = myVotes[s.date];
          const prev = visibleDates[i - 1];
          const newMonth =
            !prev || fromKey(prev.date).getMonth() !== fromKey(s.date).getMonth();
          const d = fromKey(s.date);
          const isLeader = leader?.date === s.date && total > 1 && !event.finalDate;
          const yesPct = total ? (s.yes.length / total) * 100 : 0;
          const maybePct = total ? (s.maybe.length / total) * 100 : 0;
          return (
            <div key={s.date} style={{ display: "contents" }}>
              {newMonth && visibleDates.length > 4 && <div className="month-sep">{monthLabel(d)}</div>}
              <div
                className={`date-card ${mine ?? ""}`}
                data-date={s.date}
              >
                <button
                  className="date-main"
                  onClick={() => setVote(s.date, mine === "yes" ? null : "yes")}
                  aria-pressed={mine === "yes"}
                  aria-label={`${longLabel(s.date)} : ${mine === "yes" ? "dispo" : mine === "maybe" ? "si besoin" : "pas dispo"}`}
                >
                  <span className="day-box">
                    <small>{weekdayShort(s.date)}</small>
                    <b>{d.getDate()}</b>
                  </span>
                  <span className="date-info">
                    <span className="date-name">
                      {longLabel(s.date)}
                      {event.finalDate === s.date && <span className="final-tag">Calé</span>}
                      {isLeader && <span className="crown" title="Meilleure date">🏆</span>}
                    </span>
                    <span className="date-who">
                      <AvatarStack yes={s.yes} maybe={s.maybe} />
                      {s.yes.length + s.maybe.length === 0
                        ? total > 0
                          ? "Personne pour l'instant"
                          : "Sois le premier !"
                        : `${s.yes.length} dispo${s.maybe.length ? ` · ${s.maybe.length} si besoin` : ""}`}
                    </span>
                    {total > 0 && (
                      <span className="bar" aria-hidden>
                        <span style={{ width: `${yesPct}%`, background: "var(--yes)" }} />
                        <span style={{ width: `${maybePct}%`, background: "var(--maybe)" }} />
                      </span>
                    )}
                  </span>
                </button>
                <div className="my-state">
                  <button
                    className="toggle"
                    onClick={() => setVote(s.date, mine === "yes" ? null : "yes")}
                    aria-label="Dispo"
                    tabIndex={-1}
                  >
                    {mine === "maybe" ? "~" : "✓"}
                  </button>
                  <button
                    className="maybe-btn"
                    onClick={() => setVote(s.date, mine === "maybe" ? null : "maybe")}
                    aria-pressed={mine === "maybe"}
                  >
                    si besoin
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {pastCount > 0 && (
          <p className="hint center">
            {pastCount} date{pastCount > 1 ? "s passées masquées" : " passée masquée"}
          </p>
        )}
      </div>

      {/* Détail */}
      {total > 1 && (
        <details className="card details" style={{ marginTop: 18 }}>
          <summary>
            Qui a répondu quoi <span className="chev">▾</span>
          </summary>
          <div className="grid-scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th className="name" />
                  {stats.map((s) => (
                    <th key={s.date}>
                      {weekdayShort(s.date)}
                      <br />
                      {fromKey(s.date).getDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id}>
                    <th className="name">{p.name}</th>
                    {stats.map((s) => {
                      const v = p.votes[s.date];
                      return (
                        <td key={s.date} className={v ?? ""}>
                          {v === "yes" ? "✓" : v === "maybe" ? "~" : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="total">
                  <th className="name">Total</th>
                  {stats.map((s) => (
                    <td key={s.date}>{s.yes.length + (s.maybe.length ? `+${s.maybe.length}` : "")}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      )}

      {isAdmin && (
        <p className="hint center" style={{ marginTop: 24 }}>
          Tu es l&apos;organisateur sur cet appareil.{" "}
          <button className="link-btn" onClick={copyAdminLink}>
            Copier mon lien organisateur
          </button>{" "}
          (pour valider depuis un autre appareil).
        </p>
      )}

      {/* Barre du bas */}
      {mounted && (
        <div className="bottom-bar">
          <div className="bottom-bar-inner">
            {me ? (
              <div className="save-pill">
                <span className="status">
                  <span
                    className={`dot ${saveState === "saved" ? "ok" : saveState === "saving" ? "busy" : saveState === "error" ? "err" : ""}`}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {saveState === "saving"
                      ? "Enregistrement…"
                      : saveState === "error"
                        ? "Pas enregistré, réessaie"
                        : saveState === "saved"
                          ? `C'est noté ! ${Object.keys(myVotes).length} date${Object.keys(myVotes).length > 1 ? "s" : ""} ✓`
                          : registered
                            ? "Tes réponses sont enregistrées"
                            : "Tape sur tes jours dispo"}
                  </span>
                </span>
                {!registered && Object.keys(myVotes).length === 0 ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => scheduleSave(me, {})}>
                    Aucune ne me va
                  </button>
                ) : saveState === "error" ? (
                  <button className="btn btn-dark btn-sm" onClick={() => persist(me, myVotes)}>
                    Réessayer
                  </button>
                ) : (
                  <button className="btn btn-dark btn-sm" onClick={share}>
                    Inviter
                  </button>
                )}
              </div>
            ) : (
              <button className="btn btn-primary btn-block" onClick={askName}>
                Mettre mes dispos
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function FinalCard({
  event,
  isAdmin,
  onCancel,
}: {
  event: PublicEvent;
  isAdmin: boolean;
  onCancel: () => void;
}) {
  const date = event.finalDate!;
  const compact = date.replaceAll("-", "");
  const next = fromKey(date);
  next.setDate(next.getDate() + 1);
  const nextCompact = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(next.getDate()).padStart(2, "0")}`;
  const url = typeof window !== "undefined" ? `${window.location.origin}/e/${event.id}` : "";

  const gcal =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(event.title)}` +
    `&dates=${compact}/${nextCompact}` +
    `&details=${encodeURIComponent(url)}`;

  function downloadIcs() {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Cale//FR",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${event.id}-${compact}@cale`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact}`,
      `DTEND;VALUE=DATE:${nextCompact}`,
      `SUMMARY:${esc(event.title)}`,
      `DESCRIPTION:${esc(url)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${event.title.replace(/[^\w\- ]+/g, "").trim() || "sortie"}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="card final-card">
      <div className="kicker">🎉 C&apos;est calé !</div>
      <div className="big">{longLabel(date)}</div>
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={downloadIcs}>
          📅 Ajouter à mon agenda
        </button>
        <a className="btn" href={gcal} target="_blank" rel="noopener noreferrer">
          Google Agenda
        </a>
      </div>
      {isAdmin && (
        <button className="link-btn" style={{ color: "#fff", marginTop: 12 }} onClick={onCancel}>
          Changer de date
        </button>
      )}
    </div>
  );
}
