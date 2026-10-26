import { NextResponse } from "next/server";
import { getAllDates, getMeta, updateMeta } from "@/lib/store";

/** Réservé à l'organisateur : valide (ou annule) la date finale. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const meta = await getMeta(id);
  if (!meta) return NextResponse.json({ error: "Sondage introuvable" }, { status: 404 });

  const { adminToken, date } = ((await req.json().catch(() => ({}))) ?? {}) as {
    adminToken?: unknown;
    date?: unknown;
  };
  if (adminToken !== meta.adminToken) {
    return NextResponse.json({ error: "Réservé à l'organisateur" }, { status: 403 });
  }
  if (date !== null && (typeof date !== "string" || !(await getAllDates(meta)).includes(date))) {
    return NextResponse.json({ error: "Date invalide" }, { status: 400 });
  }
  await updateMeta({ ...meta, finalDate: date });
  return NextResponse.json({ ok: true, finalDate: date });
}
