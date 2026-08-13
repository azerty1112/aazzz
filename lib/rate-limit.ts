// تحديد بسيط للطلبات في الذاكرة فقط (لا حاجة لـ Redis لهذا)
const hits = new Map<string, { count: number; reset: number }>();

export async function checkRateLimit(id: string): Promise<boolean> {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 30;
  const e = hits.get(id);
  if (!e || now > e.reset) {
    hits.set(id, { count: 1, reset: now + windowMs });
    return true;
  }
  e.count++;
  // تنظيف دوري
  if (hits.size > 500) hits.forEach((v, k) => { if (now > v.reset) hits.delete(k); });
  return e.count <= max;
}
