import { NextResponse } from 'next/server';
import { isAdminAuthenticated, getJwtStatus } from '@/lib/auth';
import { getSettings, getStorageStatus, storageConfigured } from '@/lib/settings';
import { validateCookieHeader } from '@/lib/cookie-parser';
import { NextRequest } from 'next/server';

const BAD_SECRETS = [
  'change-me-to-a-random-secret',
  'fallback-secret-change-me',
  'fallback-secret-change-me-PLEASE-DO-NOT-USE-THIS-IN-PRODUCTION',
  '',
];

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [storage, settings, jwtStatus] = await Promise.all([
    getStorageStatus(),
    getSettings(),
    getJwtStatus(),
  ]);

  const cookieValidation = validateCookieHeader(settings.sessionCookie || '');
  const cookieCount = settings.sessionCookie
    ? settings.sessionCookie.split(';').filter(s => s.trim().includes('=')).length
    : 0;

  const envJwt = process.env.JWT_SECRET || '';
  const hasJwtEnv = !!envJwt && !BAD_SECRETS.includes(envJwt);

  const hasKV = storageConfigured();

  let redisSource: string = 'الذاكرة (مؤقت)';
  if (process.env.KV_REST_API_URL) redisSource = 'Vercel KV (Upstash)';
  else if (process.env.UPSTASH_REDIS_REST_URL) redisSource = 'Upstash REST';

  return NextResponse.json({
    kvConnected: storage.ok && storage.backend !== 'memory',
    kvPingOk: storage.ok,
    backend: storage.backend,
    backendInfo: storage.info,
    redisSource,
    kvEnvConfigured: hasKV,
    hasSessionCookie: !!settings.sessionCookie,
    cookieValid: cookieValidation.valid,
    cookieCount,
    hasAccessToken: !!settings.accessToken,
    hasApiKey: !!settings.apiAccessKey,
    jwt: {
      source: jwtStatus.source,
      effective: jwtStatus.effective,
      hint: jwtStatus.hint,
    },
    envVars: {
      hasJwtSecretEnv: hasJwtEnv,
      hasAdminPassword: !!process.env.ADMIN_PASSWORD || !!process.env.ADMIN_PASSWORD_HASH,
      hasCronSecret: !!process.env.CRON_SECRET,
      hasKvEnv: hasKV,
    },
  });
}
