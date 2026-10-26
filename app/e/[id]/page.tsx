import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicEvent } from "@/lib/store";
import EventClient from "@/components/EventClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ev = await getPublicEvent(id);
  if (!ev) return { title: "Sondage introuvable — Calé" };
  const title = `📅 ${ev.title} — on se voit quand ?`;
  const description = ev.finalDate
    ? "C'est calé ! Ouvre pour voir la date."
    : `${ev.dates.length} date${ev.dates.length > 1 ? "s" : ""} proposée${ev.dates.length > 1 ? "s" : ""}. Coche tes dispos en 10 secondes, sans compte.`;
  return { title, description, openGraph: { title, description }, robots: { index: false } };
}

export default async function EventPage({ params }: Props) {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) notFound();
  return <EventClient initial={event} />;
}
