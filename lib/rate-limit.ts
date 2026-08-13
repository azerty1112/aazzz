import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let limiter: Ratelimit | null = null;
let checked = false;

// ذاكرة للتخزين المؤقت مع ربط أبسط
const hits = new Map<string, { count: number; resetAt: number }>();

function getLimiter(): Ratelimit | null {
  if (checked) return limiter;
  checked = true;

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const redis = new Redis({ url, token });
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(30, '1 m'),
        analytics: false,
        prefix: 'ratelimit',
      });
    } catch {
      limiter = null;
    }
  }
  return limiter;
}

export async function checkRateLimit(identifier: string): Promise<boolean> {
  const rl = getLimiter();
  if (!rl) {
    const now = Date.now();
    const windowMs = 60_000;
    const max = 30;
    const entry = hits.get(identifier);
    if (!entry || now > entry.resetAt) {
      hits.set(identifier, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count++;
    // تنظيف الخريطة من وقت لآخر
    if (hits.size > 1000) {
      hits.forEach((v, k) => { if (now > v.resetAt) hits.delete(k); });
    }
    return entry.count <= max;
  }
  try {
    const { success } = await rl.limit(identifier);
    return success;
  } catch {
    return true;
  }
}
