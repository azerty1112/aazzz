import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthenticated } from '@/lib/auth';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * يفحص صلاحية الكوكيز عن طريق إرسال طلب حقيقي إلى /api/auth/session
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getSettings();
  if (!settings.sessionCookie) {
    return NextResponse.json({
      ok: false,
      message: 'لا توجد كوكيز محفوظة',
      hasSessionCookie: false,
      cookieCount: 0,
      hasSessionToken: false,
    });
  }

  const cookieCount = settings.sessionCookie.split(';').filter(s => s.trim().includes('=')).length;
  const hasSessionToken = /__Secure-next-auth\.session-token/i.test(settings.sessionCookie);
  const hasCfCookie = /__cf_bm|_cfuvid/i.test(settings.sessionCookie);
  const hasOaiIs = /__Secure-oai-is/i.test(settings.sessionCookie);
  const hasOaiLb = /__oailb/i.test(settings.sessionCookie);

  // اختبار حقيقي: جلب الجلسة
  let tokenValid = false;
  let tokenError: string | null = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://chatgpt.com/api/auth/session', {
      headers: {
        Cookie: settings.sessionCookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      tokenValid = !!data.accessToken;
      if (!tokenValid) tokenError = 'الجلسة لا تحتوي على accessToken - الكوكيز منتهية';
    } else {
      tokenError = `استجاب الخادم بـ ${res.status}`;
    }
  } catch (e: any) {
    tokenError = e.name === 'AbortError' ? 'انتهت مهلة الاتصال' : (e.message || 'خطأ شبكة');
  }

  const ok = tokenValid && hasSessionToken;
  const issues: string[] = [];
  if (!hasSessionToken) issues.push('لا يوجد session-token - الكوكيز غير كافية');
  if (!hasCfCookie) issues.push('لا توجد كوكيز Cloudflare - قد تواجه حظر');
  if (!hasOaiIs) issues.push('لا يوجد __Secure-oai-is');
  if (!hasOaiLb) issues.push('لا يوجد __oailb');
  if (tokenError) issues.push(tokenError);

  return NextResponse.json({
    ok,
    cookieCount,
    hasSessionToken,
    hasCfCookie,
    hasOaiIs,
    hasOaiLb,
    tokenValid,
    issues,
    message: ok ? '✅ الكوكيز صالحة والجلسة تعمل' : issues[0] || 'مشكلة في الكوكيز',
  });
}
