import { NextResponse } from "next/server";
import { getPublicEvent } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const event = await getPublicEvent(id);
  if (!event) return NextResponse.json({ error: "Sondage introuvable" }, { status: 404 });
  return NextResponse.json(event, { headers: { "Cache-Control": "no-store" } });
}
