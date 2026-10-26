import { NextResponse } from "next/server";
import { getMeta, updateMeta } from "@/lib/store";

/** Réglages de l'organisateur. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meta = await getMeta(id);
  if (!meta) return NextResponse.json({ error: "Sondage introuvable" }, { status: 404 });
  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    adminToken?: unknown;
    allowProposals?: unknown;
  };
  if (body.adminToken !== meta.adminToken) {
    return NextResponse.json({ error: "Réservé à l'organisateur" }, { status: 403 });
  }
  if (typeof body.allowProposals !== "boolean") {
    return NextResponse.json({ error: "Réglage invalide" }, { status: 400 });
  }
  await updateMeta({ ...meta, allowProposals: body.allowProposals });
  return NextResponse.json({ ok: true, allowProposals: body.allowProposals });
}
