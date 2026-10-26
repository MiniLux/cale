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
  /** Dates choisies par l'organisateur */
  dates: string[];
  finalDate: string | null;
  createdAt: number;
  adminToken: string;
  /** Les invités peuvent proposer d'autres dates (absent = oui, pour les anciens sondages) */
  allowProposals?: boolean;
};

/** Date ajoutée par un invité */
export type ProposedDate = {
  date: string;
  by: string;
  pid: string;
  at: number;
};

/** Ce qui est envoyé au navigateur (sans le token admin). */
export type PublicEvent = Omit<EventMeta, "adminToken" | "allowProposals"> & {
  /** Toutes les dates : celles de l'organisateur + celles proposées par les invités */
  dates: string[];
  allowProposals: boolean;
  proposed: ProposedDate[];
  participants: Participant[];
};
