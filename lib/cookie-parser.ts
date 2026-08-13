/**
 * أداة تحليل الكوكيز - تدعم عدة صيغ وتحولها إلى سلسلة Cookie header جاهزة
 */

export interface CookieItem {
  domain?: string;
  name: string;
  value: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  hostOnly?: boolean;
  expirationDate?: number;
  session?: boolean;
}

/**
 * يحاول تحليل نص الكوكيز من أي صيغة:
 * - JSON (Chrome DevTools export / EditThisCookie)
 * - سلسلة Cookie header (name=value; name2=value2)
 * - سلسلة من العناصر المفصولة بأسطر
 */
export function parseCookies(input: string): { cookieHeader: string; cookies: CookieItem[]; warnings: string[] } {
  const warnings: string[] = [];
  let cookies: CookieItem[] = [];

  const trimmed = input.trim();

  // 1) محاولة تحليل JSON
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      cookies = arr.filter(c => c && c.name && c.value !== undefined)
        .map(c => ({
          name: String(c.name),
          value: String(c.value),
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
        }));
    } catch (e) {
      warnings.push('تعذر تحليل JSON، سيتم المحاولة بصيغة نصية');
    }
  }

  // 2) إذا لم ينجح JSON، جرّب صيغة Cookie header أو أسطر متعددة
  if (cookies.length === 0) {
    // تقسيم إما بفاصلة منقوطة أو بسطر جديد
    const pairs = trimmed.includes(';')
      ? trimmed.split(';')
      : trimmed.split('\n');

    for (const pair of pairs) {
      const sep = pair.indexOf('=');
      if (sep > 0) {
        const name = pair.substring(0, sep).trim();
        const value = pair.substring(sep + 1).trim();
        if (name && value) {
          // إزالة علامات الاقتباس إذا وجدت
          const cleanValue = value.replace(/^"|"$/g, '');
          cookies.push({ name, value: cleanValue });
        }
      }
    }
  }

  // 3) تنظيف وتصفية الكوكيز
  const cleaned = cookies.map(c => ({
    ...c,
    name: c.name.trim(),
    value: String(c.value).trim(),
  })).filter(c => c.name && c.value);

  // 4) بناء سلسلة Cookie header
  const cookieHeader = cleaned.map(c => `${c.name}=${c.value}`).join('; ');

  // 5) تحذيرات مفيدة
  const hasSessionToken = cleaned.some(c =>
    c.name.includes('session-token') || c.name === '__Secure-next-auth.session-token'
  );
  const hasAuthToken = cleaned.some(c => c.name === '__Secure-oai-is' || c.name.includes('oai-is'));
  const hasCfCookies = cleaned.some(c => c.name.startsWith('__cf') || c.name === '_cfuvid');

  if (cleaned.length === 0) {
    warnings.push('لم يتم التعرف على أي كوكيز. تأكد من اللصق بشكل صحيح.');
  } else {
    if (!hasSessionToken) {
      warnings.push('⚠️ لم يتم العثور على `__Secure-next-auth.session-token` - قد لا تعمل الجلسة بدون هذا الكوكي.');
    }
    if (!hasAuthToken) {
      warnings.push('⚠️ لم يتم العثور على `__Secure-oai-is` - قد تحتاجه للمصادقة.');
    }
    if (!hasCfCookies) {
      warnings.push('تنبيه: لم يتم العثور على كوكيز Cloudflare (__cf_bm, _cfuvid) - قد تواجه حظر Cloudflare.');
    }
  }

  return { cookieHeader, cookies: cleaned, warnings };
}

/**
 * الكوكيز الأساسية المطلوبة لـ ChatGPT
 */
export const ESSENTIAL_COOKIES = [
  '__Secure-next-auth.session-token.0',
  '__Secure-next-auth.session-token.1',
  '__Secure-next-auth.callback-url',
  '__Host-next-auth.csrf-token',
  '__Secure-oai-is',
  '__oailb',
  '_cfuvid',
  '__cf_bm',
  '__cflb',
  'oai-did',
  'oai-sc',
];

/**
 * يتحقق مما إذا كانت الكوكيز تحتوي على العناصر الأساسية
 */
export function validateCookieHeader(cookieHeader: string): { valid: boolean; missing: string[]; hasSession: boolean } {
  const missing: string[] = [];
  const lower = cookieHeader.toLowerCase();
  const hasSession = cookieHeader.includes('session-token');

  // الكوكيز الأساسية للجلسة
  if (!hasSession) {
    missing.push('session-token (الكوكي الأساسي للجلسة)');
  }

  return {
    valid: hasSession,
    missing,
    hasSession,
  };
}
