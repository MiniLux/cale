import { NextResponse } from "next/server";
import { createEvent } from "@/lib/store";
import { randomId } from "@/lib/id";
import { isValidDateKey, todayKey } from "@/lib/dates";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const { title, dates } = (body ?? {}) as { title?: unknown; dates?: unknown };

  const cleanTitle =
    (typeof title === "string" ? title.trim().slice(0, 80) : "") || "Sortie entre potes";

  if (!Array.isArray(dates) || dates.length === 0) {
    return NextResponse.json({ error: "Choisis au moins une date" }, { status: 400 });
  }
  // On tolère un jour de décalage (fuseaux horaires) pour "aujourd'hui".
  const yesterday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const uniq = [...new Set(dates)]
    .filter((d): d is string => typeof d === "string" && isValidDateKey(d))
    .filter((d) => d >= yesterday || d >= todayKey())
    .sort();

  if (uniq.length === 0) {
    return NextResponse.json({ error: "Dates invalides" }, { status: 400 });
  }
  if (uniq.length > 62) {
    return NextResponse.json({ error: "62 dates maximum" }, { status: 400 });
  }

  const id = randomId(8);
  const adminToken = randomId(16);
  await createEvent({
    id,
    title: cleanTitle,
    dates: uniq,
    finalDate: null,
    createdAt: Date.now(),
    adminToken,
  });

  return NextResponse.json({ id, adminToken }, { status: 201 });
}
