import { NextResponse } from "next/server";
import { createEvent, getMeta, storageMissing } from "@/lib/store";
import { randomId } from "@/lib/id";
import { isValidDateKey, todayKey } from "@/lib/dates";

export async function POST(req: Request) {
  if (storageMissing) {
    return NextResponse.json(
      {
        error:
          "Base de données non configurée : ajoute Upstash Redis dans l'onglet Storage de ton projet Vercel, puis redéploie.",
      },
      { status: 503 }
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const { title, dates, allowProposals } = (body ?? {}) as {
    title?: unknown;
    dates?: unknown;
    allowProposals?: unknown;
  };

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
  try {
    await createEvent({
      id,
      title: cleanTitle,
      dates: uniq,
      finalDate: null,
      createdAt: Date.now(),
      adminToken,
      allowProposals: allowProposals !== false,
    });
    // Vérifie que le sondage est bien relisible avant de rediriger
    if (!(await getMeta(id))) throw new Error("relecture impossible");
  } catch (e) {
    console.error("[cale] Échec de l'enregistrement :", e);
    return NextResponse.json(
      { error: "Impossible d'enregistrer le sondage (base de données inaccessible). Réessaie dans un instant." },
      { status: 500 }
    );
  }

  return NextResponse.json({ id, adminToken }, { status: 201 });
}
