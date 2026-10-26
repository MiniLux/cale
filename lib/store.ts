import { Redis } from "@upstash/redis";
import type { EventMeta, Participant, PublicEvent } from "./types";

/**
 * Stockage : Upstash Redis (via l'intégration Vercel Marketplace) si les
 * variables d'environnement sont présentes, sinon un stockage en mémoire
 * pratique pour le développement local.
 */
const TTL_SECONDS = 60 * 60 * 24 * 120; // les sondages expirent après 120 jours

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

if (!redis && process.env.VERCEL) {
  console.warn(
    "[cale] Aucune base Redis configurée : les données seront perdues. " +
      "Ajoute Upstash Redis depuis l'onglet Storage de ton projet Vercel."
  );
}

type Mem = { meta: Map<string, EventMeta>; parts: Map<string, Map<string, Participant>> };
const g = globalThis as unknown as { __caleMem?: Mem };
const mem: Mem = (g.__caleMem ??= { meta: new Map(), parts: new Map() });

const metaKey = (id: string) => `ev:${id}`;
const partsKey = (id: string) => `ev:${id}:p`;

export async function createEvent(meta: EventMeta): Promise<void> {
  if (redis) {
    await redis.set(metaKey(meta.id), meta, { ex: TTL_SECONDS });
  } else {
    mem.meta.set(meta.id, meta);
    mem.parts.set(meta.id, new Map());
  }
}

export async function getMeta(id: string): Promise<EventMeta | null> {
  if (!/^[A-Za-z0-9]{6,16}$/.test(id)) return null;
  if (redis) return (await redis.get<EventMeta>(metaKey(id))) ?? null;
  return mem.meta.get(id) ?? null;
}

export async function getParticipants(id: string): Promise<Participant[]> {
  let list: Participant[];
  if (redis) {
    const all = await redis.hgetall<Record<string, Participant>>(partsKey(id));
    list = all ? Object.values(all) : [];
  } else {
    list = [...(mem.parts.get(id)?.values() ?? [])];
  }
  return list.sort((a, b) => a.updatedAt - b.updatedAt);
}

export async function getPublicEvent(id: string): Promise<PublicEvent | null> {
  const meta = await getMeta(id);
  if (!meta) return null;
  const participants = await getParticipants(id);
  const { adminToken: _ignored, ...rest } = meta;
  return { ...rest, participants };
}

export async function saveParticipant(eventId: string, p: Participant): Promise<void> {
  if (redis) {
    await redis.hset(partsKey(eventId), { [p.id]: p });
    await Promise.all([
      redis.expire(partsKey(eventId), TTL_SECONDS),
      redis.expire(metaKey(eventId), TTL_SECONDS),
    ]);
  } else {
    if (!mem.parts.has(eventId)) mem.parts.set(eventId, new Map());
    mem.parts.get(eventId)!.set(p.id, p);
  }
}

export async function countParticipants(eventId: string): Promise<number> {
  if (redis) return await redis.hlen(partsKey(eventId));
  return mem.parts.get(eventId)?.size ?? 0;
}

export async function updateMeta(meta: EventMeta): Promise<void> {
  if (redis) await redis.set(metaKey(meta.id), meta, { ex: TTL_SECONDS });
  else mem.meta.set(meta.id, meta);
}
