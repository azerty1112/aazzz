import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { isFirstRun } from '@/lib/auth';
import { kvPing } from '@/lib/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [s, storage, firstRun] = await Promise.all([getSettings(), kvPing(), isFirstRun()]);

  let tokenValid = false;
  if (s.sessionCookie) {
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 6000);
      const r = await fetch('https://chatgpt.com/api/auth/session', {
        headers: { Cookie: s.sessionCookie, 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: c.signal, cache: 'no-store',
      });
      clearTimeout(t);
      if (r.ok) {
        const d = await r.json();
        tokenValid = !!d.accessToken;
        if (tokenValid && !s.accessToken) {
          const { updateSettings } = await import('@/lib/settings');
          await updateSettings({ accessToken: d.accessToken });
        }
      }
    } catch {}
  }

  return NextResponse.json({
    ready: !firstRun && !!s.sessionCookie && tokenValid,
    defaultPassword: firstRun,
    steps: {
      passwordSet: !firstRun,
      cookiePasted: !!s.sessionCookie,
      tokenValid,
    },
    storage: { backend: storage.backend, info: storage.info },
  });
}
