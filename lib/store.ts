import { Redis } from "@upstash/redis";
import type { EventMeta, Participant, PublicEvent } from "./types";

/**
 * Stockage : Upstash Redis (via l'intégration Vercel Marketplace) si les
 * variables d'environnement sont présentes, sinon un stockage en mémoire
 * pratique pour le développement local.
 */
const TTL_SECONDS = 60 * 60 * 24 * 120; // les sondages expirent après 120 jours

/**
 * Trouve les identifiants Upstash quel que soit le nom des variables :
 * - KV_REST_API_URL / KV_REST_API_TOKEN (intégration Vercel), éventuellement
 *   avec un préfixe personnalisé (ex. STORAGE_KV_REST_API_URL)
 * - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (console Upstash)
 * - REDIS_URL / KV_URL au format rediss://default:TOKEN@host:6379 (Upstash)
 */
function findCredentials(): { url: string; token: string } | null {
  const env = process.env;
  const pairs: [string, string][] = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];
  for (const [u, t] of pairs) {
    if (env[u] && env[t]) return { url: env[u]!, token: env[t]! };
    // même chose avec un préfixe personnalisé
    for (const key of Object.keys(env)) {
      if (key.endsWith(`_${u}`)) {
        const prefix = key.slice(0, -u.length);
        const tok = env[`${prefix}${t}`];
        if (env[key] && tok) return { url: env[key]!, token: tok };
      }
    }
  }
  // URL Redis classique d'Upstash → on en déduit l'URL REST et le token
  const redisUrlKey = Object.keys(env).find(
    (k) => (k === "REDIS_URL" || k === "KV_URL" || k.endsWith("_REDIS_URL") || k.endsWith("_KV_URL")) && env[k]
  );
  if (redisUrlKey) {
    try {
      const u = new URL(env[redisUrlKey]!);
      if (u.hostname.endsWith("upstash.io") && u.password) {
        return { url: `https://${u.hostname}`, token: decodeURIComponent(u.password) };
      }
    } catch {
      /* URL invalide */
    }
  }
  return null;
}

const creds = findCredentials();
const redis = creds ? new Redis({ url: creds.url, token: creds.token }) : null;

/** En production sur Vercel, la mémoire n'est pas partagée entre les serveurs : Redis est obligatoire. */
export const storageMissing = !redis && process.env.VERCEL === "1";

if (storageMissing) {
  console.error(
    "[cale] Aucune base Redis trouvée dans les variables d'environnement. " +
      "Ajoute Upstash Redis depuis l'onglet Storage de ton projet Vercel, puis redéploie."
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

/** Diagnostic : type de stockage et test d'écriture/lecture. */
export async function healthCheck(): Promise<{ storage: "redis" | "memory"; ok: boolean; error?: string }> {
  if (!redis) return { storage: "memory", ok: !storageMissing, error: storageMissing ? "Aucune variable Redis trouvée" : undefined };
  try {
    await redis.set("cale:health", Date.now(), { ex: 60 });
    const v = await redis.get("cale:health");
    return { storage: "redis", ok: v != null };
  } catch (e) {
    return { storage: "redis", ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
