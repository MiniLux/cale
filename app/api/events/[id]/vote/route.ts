import { NextResponse } from "next/server";
import { countParticipants, getMeta, getParticipants, saveParticipant } from "@/lib/store";
import type { Vote } from "@/lib/types";

const MAX_PARTICIPANTS = 60;

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meta = await getMeta(id);
  if (!meta) return NextResponse.json({ error: "Sondage introuvable" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const { pid, name, votes } = (body ?? {}) as {
    pid?: unknown;
    name?: unknown;
    votes?: unknown;
  };

  if (typeof pid !== "string" || !/^[A-Za-z0-9-]{8,40}$/.test(pid)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const cleanName = typeof name === "string" ? name.trim().slice(0, 30) : "";
  if (!cleanName) return NextResponse.json({ error: "Prénom requis" }, { status: 400 });

  const allowed = new Set(meta.dates);
  const cleanVotes: Record<string, Vote> = {};
  if (votes && typeof votes === "object") {
    for (const [date, v] of Object.entries(votes as Record<string, unknown>)) {
      if (allowed.has(date) && (v === "yes" || v === "maybe")) cleanVotes[date] = v;
    }
  }

  const existing = (await getParticipants(id)).find((p) => p.id === pid);
  if (!existing && (await countParticipants(id)) >= MAX_PARTICIPANTS) {
    return NextResponse.json({ error: "Sondage complet" }, { status: 409 });
  }

  const participant = { id: pid, name: cleanName, votes: cleanVotes, updatedAt: Date.now() };
  await saveParticipant(id, participant);
  return NextResponse.json({ ok: true, participant });
}
