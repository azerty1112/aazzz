import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated, getJwtStatus } from '@/lib/auth';
import { getSettings, getStorageStatus } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const [storage, settings, jwt] = await Promise.all([
    getStorageStatus(),
    getSettings(),
    getJwtStatus(),
  ]);
  const cookieCount = settings.sessionCookie
    ? settings.sessionCookie.split(';').filter(x => x.includes('=')).length
    : 0;
  const hasSess = /session-token/i.test(settings.sessionCookie || '');

  // فحص سريع للتوكن عبر جلسة ChatGPT
  let tokenFresh = false;
  if (settings.sessionCookie) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 6000);
      const r = await fetch('https://chatgpt.com/api/auth/session', {
        headers: {
          Cookie: settings.sessionCookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128',
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: c.signal, cache: 'no-store',
      });
      clearTimeout(t);
      if (r.ok) {
        const d = await r.json().catch(() => ({}));
        tokenFresh = !!d.accessToken;
      }
    } catch {}
  }

  return NextResponse.json({
    kvPingOk: storage.ok,
    backend: storage.backend,
    backendInfo: storage.info,
    hasSessionCookie: !!settings.sessionCookie,
    cookieValid: hasSess,
    cookieCount,
    hasAccessToken: !!settings.accessToken,
    tokenFresh,
    hasApiKey: !!settings.apiAccessKey,
    jwt,
    hasSupabase: storage.backend === 'supabase',
    envVars: {
      hasSupabaseEnv: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasAdminPassword: !!process.env.ADMIN_PASSWORD,
      hasJwtSecret: !!process.env.JWT_SECRET,
    },
    supabaseUrlConfigured: !!settings.supabaseUrl,
    supabaseKeyConfigured: !!settings.supabaseKey,
  });
}
