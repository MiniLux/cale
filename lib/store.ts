import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";
import type { EventMeta, Participant, PublicEvent } from "./types";

/**
 * Stockage des sondages. Fonctionne avec :
 * - Upstash Redis (API REST) : KV_REST_API_URL / KV_REST_API_TOKEN,
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (préfixe perso accepté)
 * - n'importe quel Redis classique (Redis Cloud, Upstash…) via une URL
 *   redis:// ou rediss:// : REDIS_URL, KV_URL, STORAGE_URL… peu importe le nom
 * - sinon, en local uniquement, un stockage en mémoire.
 */
const TTL_SECONDS = 60 * 60 * 24 * 120; // les sondages expirent après 120 jours

/** Opérations minimales dont l'app a besoin. Les valeurs sont stockées en JSON. */
interface Store {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttl: number): Promise<void>;
  hset(key: string, field: string, value: unknown): Promise<void>;
  hgetall<T>(key: string): Promise<T[]>;
  hlen(key: string): Promise<number>;
  expire(key: string, ttl: number): Promise<void>;
  del(keys: string[]): Promise<void>;
}

// ---------- Upstash (REST) ----------
function upstashStore(url: string, token: string): Store {
  const r = new UpstashRedis({ url, token });
  return {
    get: async <T,>(k: string) => (await r.get<T>(k)) ?? null,
    set: async (k, v, ttl) => void (await r.set(k, v, { ex: ttl })),
    hset: async (k, f, v) => void (await r.hset(k, { [f]: v })),
    hgetall: async <T,>(k: string) => {
      const all = await r.hgetall<Record<string, T>>(k);
      return all ? Object.values(all) : [];
    },
    hlen: (k) => r.hlen(k),
    expire: async (k, ttl) => void (await r.expire(k, ttl)),
    del: async (keys) => void (await r.del(...keys)),
  };
}

// ---------- Redis classique (TCP) ----------
type TcpClient = ReturnType<typeof createClient>;
const g = globalThis as unknown as { __caleTcp?: Promise<TcpClient>; __caleMem?: Mem };

function tcpStore(url: string): Store {
  const client = async (): Promise<TcpClient> => {
    if (!g.__caleTcp) {
      // disableOfflineQueue : si Redis est injoignable, on échoue tout de suite (message clair) au lieu de rester bloqué
      const c = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 8000 } });
      c.on("error", (e) => console.error("[cale] Redis :", e?.message ?? e));
      g.__caleTcp = c.connect().then(() => c);
      g.__caleTcp.catch(() => (g.__caleTcp = undefined)); // on réessaiera au prochain appel
    }
    return g.__caleTcp;
  };
  const parse = <T,>(s: string | null | undefined): T | null => {
    if (s == null) return null;
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };
  return {
    get: async <T,>(k: string) => parse<T>((await (await client()).get(k)) as string | null),
    set: async (k, v, ttl) => void (await (await client()).set(k, JSON.stringify(v), { EX: ttl })),
    hset: async (k, f, v) => void (await (await client()).hSet(k, f, JSON.stringify(v))),
    hgetall: async <T,>(k: string) => {
      const all = (await (await client()).hGetAll(k)) as Record<string, string>;
      return Object.values(all ?? {})
        .map((s) => parse<T>(s))
        .filter((x): x is T => x !== null);
    },
    hlen: async (k) => Number(await (await client()).hLen(k)),
    expire: async (k, ttl) => void (await (await client()).expire(k, ttl)),
    del: async (keys) => void (await (await client()).del(keys)),
  };
}

// ---------- Mémoire (dev local) ----------
type Mem = { kv: Map<string, unknown>; h: Map<string, Map<string, unknown>> };
function memoryStore(): Store {
  const mem: Mem = (g.__caleMem ??= { kv: new Map(), h: new Map() });
  return {
    get: async <T,>(k: string) => (mem.kv.get(k) as T) ?? null,
    set: async (k, v) => void mem.kv.set(k, v),
    hset: async (k, f, v) => {
      if (!mem.h.has(k)) mem.h.set(k, new Map());
      mem.h.get(k)!.set(f, v);
    },
    hgetall: async <T,>(k: string) => [...(mem.h.get(k)?.values() ?? [])] as T[],
    hlen: async (k) => mem.h.get(k)?.size ?? 0,
    expire: async () => {},
    del: async (keys) => {
      for (const k of keys) {
        mem.kv.delete(k);
        mem.h.delete(k);
      }
    },
  };
}

// ---------- Détection automatique ----------
type Detected = { kind: "upstash" | "redis" | "memory"; source: string; store: Store };

function detect(): Detected {
  const env = process.env;

  // 1. Paires REST Upstash, avec ou sans préfixe
  const pairs: [string, string][] = [
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ];
  for (const [u, t] of pairs) {
    for (const key of Object.keys(env)) {
      if (key === u || key.endsWith(`_${u}`)) {
        const tokenKey = key.slice(0, key.length - u.length) + t;
        if (env[key] && env[tokenKey]) {
          return { kind: "upstash", source: key, store: upstashStore(env[key]!, env[tokenKey]!) };
        }
      }
    }
  }

  // 2. N'importe quelle variable contenant une URL redis:// ou rediss://
  const preferred = ["REDIS_URL", "KV_URL"];
  const keys = Object.keys(env).sort(
    (a, b) => Number(preferred.includes(b)) - Number(preferred.includes(a))
  );
  for (const key of keys) {
    const val = env[key];
    if (val && /^rediss?:\/\//.test(val)) {
      return { kind: "redis", source: key, store: tcpStore(val) };
    }
  }

  return { kind: "memory", source: "", store: memoryStore() };
}

const detected = detect();
const db = detected.store;

/** En production sur Vercel, la mémoire n'est pas partagée entre les serveurs : Redis est obligatoire. */
export const storageMissing = detected.kind === "memory" && process.env.VERCEL === "1";

if (storageMissing) {
  console.error(
    "[cale] Aucune base Redis trouvée dans les variables d'environnement. " +
      "Connecte une base Redis au projet (onglet Storage), puis redéploie."
  );
}

// ---------- API utilisée par l'app ----------
const metaKey = (id: string) => `ev:${id}`;
const partsKey = (id: string) => `ev:${id}:p`;

export async function createEvent(meta: EventMeta): Promise<void> {
  await db.set(metaKey(meta.id), meta, TTL_SECONDS);
}

export async function getMeta(id: string): Promise<EventMeta | null> {
  if (!/^[A-Za-z0-9]{6,16}$/.test(id)) return null;
  return db.get<EventMeta>(metaKey(id));
}

export async function getParticipants(id: string): Promise<Participant[]> {
  const list = await db.hgetall<Participant>(partsKey(id));
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
  await db.hset(partsKey(eventId), p.id, p);
  await Promise.all([
    db.expire(partsKey(eventId), TTL_SECONDS),
    db.expire(metaKey(eventId), TTL_SECONDS),
  ]);
}

export async function countParticipants(eventId: string): Promise<number> {
  return db.hlen(partsKey(eventId));
}

export async function deleteEvent(id: string): Promise<void> {
  await db.del([metaKey(id), partsKey(id)]);
}

export async function updateMeta(meta: EventMeta): Promise<void> {
  await db.set(metaKey(meta.id), meta, TTL_SECONDS);
}

/** Diagnostic (/api/health) : quel stockage est utilisé, et test écriture/lecture. */
export async function healthCheck(): Promise<{
  storage: Detected["kind"];
  variable?: string;
  ok: boolean;
  error?: string;
  hint?: string;
}> {
  if (detected.kind === "memory") {
    // Uniquement les NOMS des variables (jamais les valeurs) pour aider au diagnostic
    const related = Object.keys(process.env).filter((k) => /REDIS|KV|UPSTASH|STORAGE/i.test(k));
    return {
      storage: "memory",
      ok: !storageMissing,
      error: storageMissing ? "Aucune variable Redis trouvée" : undefined,
      hint: storageMissing
        ? related.length
          ? `Variables vues : ${related.join(", ")}`
          : "Aucune variable liée à Redis : connecte la base au projet puis fais un Redeploy."
        : undefined,
    };
  }
  try {
    await db.set("cale:health", { t: Date.now() }, 60);
    const v = await db.get("cale:health");
    return { storage: detected.kind, variable: detected.source, ok: v != null };
  } catch (e) {
    return {
      storage: detected.kind,
      variable: detected.source,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
