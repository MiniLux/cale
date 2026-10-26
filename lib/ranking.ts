import type { Participant } from "./types";

export type DateStat = {
  date: string;
  yes: Participant[];
  maybe: Participant[];
  no: Participant[];
  score: number;
};

/** Classe les dates : dispo = 1 point, si besoin = 0,5 point. */
export function computeStats(dates: string[], participants: Participant[]): DateStat[] {
  return dates.map((date) => {
    const yes: Participant[] = [];
    const maybe: Participant[] = [];
    const no: Participant[] = [];
    for (const p of participants) {
      const v = p.votes[date];
      if (v === "yes") yes.push(p);
      else if (v === "maybe") maybe.push(p);
      else no.push(p);
    }
    return { date, yes, maybe, no, score: yes.length + maybe.length * 0.5 };
  });
}

export function rankStats(stats: DateStat[]): DateStat[] {
  return [...stats].sort(
    (a, b) =>
      b.score - a.score ||
      b.yes.length - a.yes.length ||
      a.date.localeCompare(b.date)
  );
}
