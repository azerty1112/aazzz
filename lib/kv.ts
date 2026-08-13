/**
 * واجهة KV بسيطة - تدعم:
 *   1) Supabase (عبر REST fetch) إذا وُجد SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *      (إما في env أو محفوظة في الإعدادات من لوحة الإدارة)
 *   2) الذاكرة كـ fallback
 */

export interface KVStore {
  backend: 'supabase' | 'memory';
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
  info?: string;
}

const TABLE = 'kv';
const memory = new Map<string, any>();

// إعدادات ديناميكية - يمكن تحديثها من لوحة الإدارة
let dynUrl = '';
let dynKey = '';

export function setSupabaseCredentials(url: string, key: string) {
  dynUrl = (url || '').replace(/\/$/, '');
  dynKey = key || '';
  rebuildStore();
}

function getCredentials(): { url: string; key: string } {
  const envUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  return {
    url: dynUrl || envUrl,
    key: dynKey || envKey,
  };
}

function createSupabaseStore(url: string, key: string): KVStore | null {
  if (!url || !key) return null;
  const base = `${url}/rest/v1/${TABLE}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  return {
    backend: 'supabase',
    info: 'Supabase',
    async get<T>(key: string): Promise<T | null> {
      try {
        const res = await fetch(
          `${base}?key=eq.${encodeURIComponent(key)}&select=value`,
          { headers, cache: 'no-store' }
        );
        if (!res.ok) return null;
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return rows[0].value as T;
      } catch {
        return null;
      }
    },
    async set(key: string, value: any): Promise<void> {
      try {
        // Upsert: ننشئ أو نحدّث
        let res = await fetch(base, {
          method: 'POST',
          headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
        });
        if (!res.ok && res.status !== 409) {
          // جرّب PATCH كخطة ثانية
          const existing = await this.get(key);
          if (existing) {
            await fetch(`${base}?key=eq.${encodeURIComponent(key)}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
            });
          } else {
            // جرّب PUT إذا فشل POST
            await fetch(`${base}?key=eq.${encodeURIComponent(key)}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
            });
          }
        }
      } catch {}
    },
    async del(key: string): Promise<void> {
      try {
        await fetch(`${base}?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers });
      } catch {}
    },
    async ping(): Promise<boolean> {
      try {
        // نتحقق عبر الوصول للجدول مباشرة (بحد 1 صف)
        const res = await fetch(`${base}?select=key&limit=1`, { headers, cache: 'no-store' });
        return res.ok;
      } catch { return false; }
    },
  };
}

function createMemoryStore(): KVStore {
  return {
    backend: 'memory',
    info: 'الذاكرة (مؤقت - تُفقد عند إعادة التشغيل)',
    async get<T>(k: string) { return (memory.get(k) ?? null) as T | null; },
    async set(k: string, v: any) { memory.set(k, v); },
    async del(k: string) { memory.delete(k); },
    async ping() { return true; },
  };
}

let store: KVStore = createMemoryStore();
let lastCreds = '';

function rebuildStore() {
  const { url, key } = getCredentials();
  const sig = url + '|' + key;
  if (sig === lastCreds && store) return;
  lastCreds = sig;
  store = createSupabaseStore(url, key) || createMemoryStore();
}

export function getStore(): KVStore {
  rebuildStore();
  return store;
}

export async function kvGet<T = any>(key: string) { return getStore().get<T>(key); }
export async function kvSet(key: string, value: any) { return getStore().set(key, value); }
export async function kvDel(key: string) { return getStore().del(key); }

export async function kvPing() {
  const s = getStore();
  return { ok: await s.ping(), backend: s.backend, info: s.info || '' };
}

export function hasSupabase() {
  const { url, key } = getCredentials();
  return !!(url && key);
}

// ملاحظة: اعتمادات Supabase المحفوظة في DB لا يمكن تحميلها قبل الاتصال بـ Supabase.
// لذلك إمّا أن تُضبط عبر متغيرات البيئة (مستحسن للإنتاج)، أو عبر لوحة الإدارة (ستعمل طيلة فترة
// بقاء السيرفر قيد التشغيل، وستفقد عند إعادة التشغيل في Vercel Serverless إذا لم تكن env).
