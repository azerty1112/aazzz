import { NextRequest } from 'next/server';
import { createStream } from '@/lib/chatgpt';
import { OpenAIMessage } from '@/lib/types';
import { getSettings } from '@/lib/settings';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * نقطة نهاية متوافقة جزئياً مع OpenAI Chat Completions API
 * تسهّل استخدام البروكسي كبديل مباشر في التطبيقات التي تدعم OpenAI.
 */
export async function POST(req: NextRequest) {
  const ip = req.ip || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'anon';
  if (!(await checkRateLimit(ip))) {
    return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } });
  }

  const s = await getSettings();
  const auth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (s.apiAccessKey && auth !== s.apiAccessKey) {
    return new Response(JSON.stringify({ error: { message: 'Unauthorized', type: 'auth_error' } }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (!s.sessionCookie) {
    return new Response(JSON.stringify({ error: { message: 'Cookies not configured', type: 'config_error' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  let body: any = {};
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: { message: 'Bad request', type: 'invalid_request_error' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }

  const messages: OpenAIMessage[] = Array.isArray(body.messages)
    ? body.messages.filter((m: any) => m && typeof m.role === 'string' && typeof m.content === 'string')
    : [];

  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: { message: 'messages array required', type: 'invalid_request_error' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const model = body.model || s.defaultModel || 'gpt-4o';
  const stream = body.stream !== false;

  // نمرر النداء إلى نفس منطق الستريم في /api/chat
  return createStream(messages, undefined, undefined, model);
}

export async function GET() {
  return new Response(JSON.stringify({ object: 'list', data: [
    { id: 'gpt-4o', object: 'model' },
    { id: 'gpt-4o-mini', object: 'model' },
    { id: 'gpt-4', object: 'model' },
    { id: 'o1', object: 'model' },
  ] }), { headers: { 'Content-Type': 'application/json' } });
}
