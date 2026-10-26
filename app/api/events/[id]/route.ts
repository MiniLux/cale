import { NextResponse } from "next/server";
import { deleteEvent, getMeta, getPublicEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const event = await getPublicEvent(id);
  if (!event) return NextResponse.json({ error: "Sondage introuvable" }, { status: 404 });
  return NextResponse.json(event, { headers: { "Cache-Control": "no-store" } });
}

/** Supprime définitivement le sondage et toutes les réponses (organisateur uniquement). */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const meta = await getMeta(id);
  if (!meta) return NextResponse.json({ ok: true }); // déjà supprimé
  const { adminToken } = ((await req.json().catch(() => ({}))) ?? {}) as { adminToken?: unknown };
  if (adminToken !== meta.adminToken) {
    return NextResponse.json({ error: "Réservé à l'organisateur" }, { status: 403 });
  }
  await deleteEvent(id);
  return NextResponse.json({ ok: true });
}
