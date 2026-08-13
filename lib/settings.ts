import bcrypt from 'bcryptjs';
import { kvGet, kvSet, kvPing, hasSupabase, setSupabaseCredentials, getStore } from './kv';

export interface AppSettings {
  sessionCookie: string;
  accessToken?: string;
  apiAccessKey?: string;
  adminPasswordHash?: string;
  defaultModel: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

const DEFAULT: AppSettings = {
  sessionCookie: '',
  accessToken: '',
  apiAccessKey: process.env.API_ACCESS_KEY || '',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  defaultModel: 'gpt-4o',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
};

const KEY = 'app_settings';
const FIRST_RUN_KEY = 'first_run';
let memCache: AppSettings = { ...DEFAULT };
let initialized = false;

async function loadFromStore(): Promise<AppSettings | null> {
  // لا نستخدم Supabase قبل أن تُهيّأ الإعدادات - نقرأ من الذاكرة أولاً
  const s = getStore();
  // إذا كان المخزن supabase، نستطيع القراءة منه لأن الاعتمادات موجودة في env
  if (s.backend === 'supabase') {
    try {
      const stored = await s.get<AppSettings>(KEY);
      if (stored) return stored;
    } catch {}
  }
  return null;
}

export async function getSettings(): Promise<AppSettings> {
  let s: AppSettings = { ...DEFAULT };
  if (process.env.CHATGPT_SESSION_COOKIE) s.sessionCookie = process.env.CHATGPT_SESSION_COOKIE;
  if (process.env.CHATGPT_ACCESS_TOKEN) s.accessToken = process.env.CHATGPT_ACCESS_TOKEN;

  if (!initialized) {
    initialized = true;
    // محاولة تحميل الإعدادات المحفوظة (حتى لو من الذاكرة)
    try {
      const stored = await kvGet<AppSettings>(KEY);
      if (stored) {
        s = { ...s, ...stored };
        // إذا كانت هناك اعتمادات Supabase محفوظة، نفعّلها
        if (stored.supabaseUrl && stored.supabaseKey && !(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)) {
          setSupabaseCredentials(stored.supabaseUrl, stored.supabaseKey);
          // إعادة محاولة التحميل من Supabase بعد تفعيلها
          try {
            const s2 = await kvGet<AppSettings>(KEY);
            if (s2) s = { ...DEFAULT, ...s2 };
          } catch {}
        }
        memCache = s;
        return s;
      }
    } catch {}
    return { ...s, ...memCache };
  }

  try {
    const stored = await kvGet<AppSettings>(KEY);
    if (stored) { s = { ...s, ...stored }; memCache = s; return s; }
  } catch {}
  return { ...s, ...memCache };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  // تفعيل اعتمادات Supabase ديناميكياً إذا كانت في الـ patch
  if (patch.supabaseUrl !== undefined || patch.supabaseKey !== undefined) {
    const next = { ...memCache, ...patch };
    if (next.supabaseUrl && next.supabaseKey) {
      setSupabaseCredentials(next.supabaseUrl, next.supabaseKey);
    }
  }
  const cur = await getSettings();
  const upd = { ...cur, ...patch };
  memCache = upd;
  try { await kvSet(KEY, upd); } catch {}
  return upd;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const s = await getSettings();
  if (!s.adminPasswordHash) {
    if (process.env.ADMIN_PASSWORD) return password === process.env.ADMIN_PASSWORD;
    return false;
  }
  try { return bcrypt.compare(password, s.adminPasswordHash); } catch { return false; }
}

export async function getStorageStatus() { return kvPing(); }
export function storageConfigured() { return hasSupabase(); }

export async function isFirstRun(): Promise<boolean> {
  if (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH) return false;
  try {
    const done = await kvGet<boolean>(FIRST_RUN_KEY);
    if (done) return false;
  } catch {}
  const s = await getSettings();
  return !s.adminPasswordHash;
}

export async function markSetupDone() {
  try { await kvSet(FIRST_RUN_KEY, true); } catch {}
}
