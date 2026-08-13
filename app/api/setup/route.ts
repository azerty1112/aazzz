import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/settings';
import { kvPing } from '@/lib/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * يعيد حالة الإعداد الأولي للتطبيق - يُستخدم لتوجيه المستخدم تلقائياً
 */
export async function GET() {
  const [settings, storage] = await Promise.all([getSettings(), kvPing()]);

  const hasCookie = !!settings.sessionCookie && settings.sessionCookie.length > 50;
  const hasToken = !!settings.accessToken;
  let tokenValid = false;

  // فحص سريع للتوكن/الكوكيز إذا كانت موجودة
  if (hasCookie) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch('https://chatgpt.com/api/auth/session', {
        headers: {
          Cookie: settings.sessionCookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        tokenValid = !!data.accessToken;
        if (tokenValid && !settings.accessToken) {
          // حفظ التوكن تلقائياً
          const { updateSettings } = await import('@/lib/settings');
          await updateSettings({ accessToken: data.accessToken });
        }
      }
    } catch {}
  }

  return NextResponse.json({
    ready: hasCookie && tokenValid,
    steps: {
      adminPasswordSet: !!(process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH || (await hasCustomPassword())),
      cookiePasted: hasCookie,
      tokenValid,
      storageConnected: storage.backend !== 'memory',
    },
    storage: {
      backend: storage.backend,
      info: storage.info,
    },
    defaultPassword: !process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH,
  });
}

async function hasCustomPassword(): Promise<boolean> {
  const s = await getSettings();
  return !!s.adminPasswordHash;
}
