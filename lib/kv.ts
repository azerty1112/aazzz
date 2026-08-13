/**
 * واجهة KV موحّدة (REST only - تعمل على Node.js و Edge runtime)
 * تدعم:
 *   - Upstash REST (Vercel KV / Upstash) — متوافق مع Edge
 *   - الذاكرة — fallback
 *   - Redis URL خارجي يُحول إلى REST عبر الـ HTTP endpoint (Upstash-style)
 *
 * ملاحظة: تمت إزالة ioredis TCP لأنه لا يعمل على Vercel Edge runtime.
 * إذا كنت تريد ربط Redis خارجي، استخدم مزود يدعم REST API مثل Upstash.
 * لمعرفات KV من Vercel، كل شيء يعمل تلقائياً.
 */
import { Redis as UpstashRedis } from '@upstash/redis';

type KVBackend = 'upstash' | 'memory';

interface KVStore {
  backend: KVBackend;
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
}

let cachedStore: KVStore | null = null;
let cachedBackendKey: string = '';
const memoryData: Map<string, any> = new Map();

function buildBackendKey(): string {
  const env = process.env as Record<string, string | undefined>;
  return [
    env.KV_REST_API_URL, env.KV_REST_API_TOKEN,
    env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN,
    env.REDIS_REST_API_URL, env.REDIS_REST_API_TOKEN,
  ].join('|');
}

function createUpstashStore(url: string, token: string): KVStore {
  const client = new UpstashRedis({ url, token });
  return {
    backend: 'upstash',
    async get<T>(key: string) {
      try { return (await client.get(key)) as T | null; } catch { return null; }
    },
    async set(key: string, value: any) {
      try { await client.set(key, JSON.stringify(value)); } catch {}
    },
    async del(key: string) {
      try { await client.del(key); } catch {}
    },
    async ping() {
      try { return (await client.ping()) === 'PONG'; } catch { return false; }
    },
  };
}

const memoryStore: KVStore = {
  backend: 'memory',
  async get<T>(key: string) { return (memoryData.get(key) as T) ?? null; },
  async set(key: string, value: any) { memoryData.set(key, value); },
  async del(key: string) { memoryData.delete(key); },
  async ping() { return true; },
};

export function resetKVCache() {
  cachedStore = null;
  cachedBackendKey = '';
}

/**
 * يختار متاح من المتغيرات البيئية (فقط REST endpoints).
 * الأولوية:
 *  1. KV_REST_API_URL/TOKEN (Vercel KV)
 *  2. UPSTASH_REDIS_REST_URL/TOKEN
 *  3. REDIS_REST_API_URL/TOKEN
 *  4. الذاكرة
 */
export function getKVSync(): KVStore {
  if (cachedStore && cachedBackendKey === buildBackendKey()) return cachedStore;

  const env = process.env as Record<string, string | undefined>;

  const pairs = [
    { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN },
    { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN },
    { url: env.REDIS_REST_API_URL, token: env.REDIS_REST_API_TOKEN },
  ];

  for (const { url, token } of pairs) {
    if (url && token && (url.startsWith('https://') || url.startsWith('http://'))) {
      cachedStore = createUpstashStore(url, token);
      cachedBackendKey = buildBackendKey();
      return cachedStore;
    }
  }

  cachedStore = memoryStore;
  cachedBackendKey = buildBackendKey();
  return cachedStore;
}

export async function getKV(): Promise<KVStore> {
  return getKVSync();
}

export async function kvGet<T = any>(key: string): Promise<T | null> {
  return getKVSync().get<T>(key);
}

export async function kvSet(key: string, value: any): Promise<void> {
  return getKVSync().set(key, value);
}

export async function kvDel(key: string): Promise<void> {
  return getKVSync().del(key);
}

export async function kvPing(): Promise<{ ok: boolean; backend: KVBackend; info: string }> {
  const store = getKVSync();
  const ok = await store.ping();
  const info =
    store.backend === 'upstash'
      ? 'Upstash REST (Vercel KV)'
      : 'الذاكرة (مؤقت - غير دائم)';
  return { ok, backend: store.backend, info };
}

/**
 * يتحقق من وجود متغيرات KV.
 */
export function hasKVConfigured(): boolean {
  const env = process.env as Record<string, string | undefined>;
  return !!(
    (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) ||
    (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  );
}
