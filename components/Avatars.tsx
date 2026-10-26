"use client";

import { colorFor, initials } from "@/lib/client";
import type { Participant } from "@/lib/types";

export function Avatar({ name, maybe, lg }: { name: string; maybe?: boolean; lg?: boolean }) {
  return (
    <span
      className={`avatar ${maybe ? "maybe" : ""} ${lg ? "lg" : ""}`}
      style={{ background: colorFor(name) }}
      title={name}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  yes,
  maybe = [],
  max = 5,
}: {
  yes: Participant[];
  maybe?: Participant[];
  max?: number;
}) {
  const all = [...yes.map((p) => ({ p, m: false })), ...maybe.map((p) => ({ p, m: true }))];
  const shown = all.slice(0, max);
  const rest = all.length - shown.length;
  if (all.length === 0) return null;
  return (
    <span className="avatars">
      {shown.map(({ p, m }) => (
        <Avatar key={p.id} name={p.name} maybe={m} />
      ))}
      {rest > 0 && <span className="avatar more">+{rest}</span>}
    </span>
  );
}
