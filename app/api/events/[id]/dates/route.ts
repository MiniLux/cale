import { NextResponse } from "next/server";
import {
  addProposed,
  getMeta,
  getProposed,
  getPublicEvent,
  mergeDates,
  removeProposed,
  updateMeta,
} from "@/lib/store";
import { isValidDateKey, minAcceptedKey } from "@/lib/dates";

type Ctx = { params: Promise<{ id: string }> };

const MAX_TOTAL_DATES = 62;
const MAX_PER_PERSON = 10;

/** Un invité propose une ou plusieurs dates en plus. */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const meta = await getMeta(id);
  if (!meta) return NextResponse.json({ error: "Sondage introuvable" }, { status: 404 });

  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    pid?: unknown;
    name?: unknown;
    dates?: unknown;
    adminToken?: unknown;
  };
  const isAdmin = body.adminToken === meta.adminToken;
  if (meta.allowProposals === false && !isAdmin) {
    return NextResponse.json(
      { error: "L'organisateur a désactivé l'ajout de dates" },
      { status: 403 }
    );
  }
  if (typeof body.pid !== "string" || !/^[A-Za-z0-9-]{8,40}$/.test(body.pid)) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 30) : "";
  if (!name) return NextResponse.json({ error: "Prénom requis" }, { status: 400 });

  const proposed = await getProposed(id);
  const existing = new Set(mergeDates(meta, proposed));
  const min = minAcceptedKey();
  const fresh = [...new Set(Array.isArray(body.dates) ? body.dates : [])]
    .filter((d): d is string => typeof d === "string" && isValidDateKey(d) && d >= min)
    .filter((d) => !existing.has(d))
    .sort();

  if (fresh.length === 0) {
    return NextResponse.json({ error: "Ces dates sont déjà dans le sondage" }, { status: 400 });
  }
  if (existing.size + fresh.length > MAX_TOTAL_DATES) {
    return NextResponse.json({ error: `${MAX_TOTAL_DATES} dates maximum par sondage` }, { status: 400 });
  }
  const mine = proposed.filter((p) => p.pid === body.pid).length;
  if (!isAdmin && mine + fresh.length > MAX_PER_PERSON) {
    return NextResponse.json(
      { error: `Tu peux proposer ${MAX_PER_PERSON} dates maximum` },
      { status: 400 }
    );
  }

  const at = Date.now();
  await addProposed(
    id,
    fresh.map((date) => ({ date, by: name, pid: body.pid as string, at }))
  );
  return NextResponse.json({ ok: true, added: fresh, event: await getPublicEvent(id) });
}

/** Retire une date proposée : par la personne qui l'a proposée, ou par l'organisateur. */
export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const meta = await getMeta(id);
  if (!meta) return NextResponse.json({ error: "Sondage introuvable" }, { status: 404 });

  const body = ((await req.json().catch(() => ({}))) ?? {}) as {
    date?: unknown;
    pid?: unknown;
    adminToken?: unknown;
  };
  const isAdmin = body.adminToken === meta.adminToken;
  const item = (await getProposed(id)).find((p) => p.date === body.date);
  if (!item) return NextResponse.json({ error: "Date introuvable" }, { status: 404 });
  if (!isAdmin && item.pid !== body.pid) {
    return NextResponse.json({ error: "Tu ne peux retirer que tes propres dates" }, { status: 403 });
  }
  if (meta.finalDate === item.date) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Cette date a été validée par l'organisateur" }, { status: 409 });
    }
    await updateMeta({ ...meta, finalDate: null });
  }
  await removeProposed(id, item.date);
  return NextResponse.json({ ok: true, event: await getPublicEvent(id) });
}
