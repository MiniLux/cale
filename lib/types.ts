export type Vote = "yes" | "maybe";

export type Participant = {
  id: string;
  name: string;
  /** date (YYYY-MM-DD) -> vote. Une date absente = pas dispo. */
  votes: Record<string, Vote>;
  updatedAt: number;
};

export type EventMeta = {
  id: string;
  title: string;
  dates: string[];
  finalDate: string | null;
  createdAt: number;
  adminToken: string;
};

/** Ce qui est envoyé au navigateur (sans le token admin). */
export type PublicEvent = Omit<EventMeta, "adminToken"> & {
  participants: Participant[];
};
