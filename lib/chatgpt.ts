import { getSettings, updateSettings } from './settings';
import { ChatPayload, OpenAIMessage, ChatGPTMessage } from './types';
import { randomUUID } from 'crypto';

const SESSION_URL = 'https://chatgpt.com/api/auth/session';
const CONVO_URL = 'https://chatgpt.com/backend-api/conversation';
const ORIGIN = 'https://chatgpt.com';

// متصفح حقيقي - Cloudflare يتحقق من هذه الهيدرز
const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
  Referer: ORIGIN + '/',
  Origin: ORIGIN,
  'sec-ch-ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'Accept-Encoding': 'identity',
  Priority: 'u=1, i',
  DNT: '1',
  Connection: 'keep-alive',
};

// ─── إدارة التوكن ───────────────────────────────────────────
let tokenCache: { token: string; ts: number } | null = null;
const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 دقائق

export async function getAccessToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && tokenCache && Date.now() - tokenCache.ts < TOKEN_TTL_MS) {
    return tokenCache.token;
  }
  const s = await getSettings();
  if (!forceRefresh && s.accessToken) {
    tokenCache = { token: s.accessToken, ts: Date.now() };
    return s.accessToken;
  }
  return refreshAccessToken();
}

export async function refreshAccessToken(): Promise<string | null> {
  const s = await getSettings();
  if (!s.sessionCookie) return null;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 15000);
    const r = await fetch(SESSION_URL, {
      method: 'GET',
      headers: {
        Cookie: s.sessionCookie,
        ...HEADERS,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: c.signal,
      redirect: 'manual',
    });
    clearTimeout(t);
    if (r.status === 0 || (r.status >= 300 && r.status < 400)) return null;
    if (!r.ok) return null;
    const text = await r.text();
    if (!text) return null;
    let d: any = {};
    try { d = JSON.parse(text); } catch { return null; }
    if (d.accessToken) {
      tokenCache = { token: d.accessToken, ts: Date.now() };
      await updateSettings({ accessToken: d.accessToken }).catch(() => {});
      return d.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/** تحديث تلقائي للتوكن قبل إرسال أي رسالة */
export async function ensureValidToken(): Promise<string | null> {
  // نستخدم التوكن المخبوز إذا كان حديثاً، وإلا نجدّده
  if (tokenCache && Date.now() - tokenCache.ts < TOKEN_TTL_MS) return tokenCache.token;
  const s = await getSettings();
  if (s.accessToken && tokenCache && tokenCache.token === s.accessToken) {
    tokenCache.ts = Date.now();
    return s.accessToken;
  }
  return refreshAccessToken();
}

// ─── بناء الـ payload ───────────────────────────────────────
function buildPayload(
  messages: OpenAIMessage[],
  convId: string | undefined,
  parentId: string | undefined,
  model: string
): ChatPayload {
  const chatgptMsgs: ChatGPTMessage[] = [];
  let lastId = '';

  for (const m of messages) {
    const id = randomUUID();
    let role: 'user' | 'assistant' | 'system' = 'user';
    let recipient = 'all';
    if (m.role === 'assistant') { role = 'assistant'; recipient = 'all'; }
    else if (m.role === 'system') { role = 'system'; recipient = 'all'; }

    chatgptMsgs.push({
      id,
      author: { role, name: role === 'system' ? 'custom-user' : undefined, metadata: {} },
      create_time: new Date().toISOString(),
      content: { content_type: 'text', parts: [m.content] },
      status: 'finished_successfully',
      end_turn: role !== 'user',
      weight: 1.0,
      metadata: model.startsWith('o1') || model.startsWith('o3') ? { serialization_metadata: { custom_symbol_offsets: [], progress: [] } } : {},
      recipient,
    });
    lastId = id;
  }

  const parent = parentId && parentId.length > 0 ? parentId : (lastId || randomUUID());

  const payload: ChatPayload = {
    action: 'next',
    messages: chatgptMsgs,
    parent_message_id: parent,
    model,
    conversation_id: convId || undefined,
    timezone_offset_min: new Date().getTimezoneOffset(),
    history_and_training_disabled: false,
    force_paragen: false,
    force_paragen_model_slug: '',
    force_nulligen: false,
    suggestions: [],
    conversation_mode: { kind: 'primary_assistant', plugin_ids: null },
    arkose_token: null,
    arkose_token_data: { value: null },
    websocket_request_id: randomUUID(),
    plugin_ids: null,
    persona: 'chatgpt-free',
    supported_encodings: ['v1'],
    supports_buffering: true,
  };

  // نماذج o1/o3 تحتاج حقول إضافية ولا تدعم الستريمينغ أحياناً
  if (model.startsWith('o1') || model.startsWith('o3')) {
    payload.reasoning_effort = model.includes('mini') ? 'low' : 'high';
  }

  return payload;
}

// ─── استخراج النص من الرد ───────────────────────────────────
function extractReply(d: any): string {
  if (!d || !d.message) return '';
  const msg = d.message;
  if (msg.content?.content_type === 'text' && Array.isArray(msg.content.parts)) {
    return msg.content.parts
      .filter((p: any) => typeof p === 'string')
      .join('\n');
  }
  if (typeof msg.content?.text === 'string') return msg.content.text;
  return '';
}

function extractErrorFromSSE(text: string): string | null {
  for (const line of text.split('\n').reverse()) {
    const tr = line.trim();
    if (!tr.startsWith('data:')) continue;
    const data = tr.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      if (j.detail) return typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
      if (j.error) return typeof j.error === 'string' ? j.error : (j.error.message || JSON.stringify(j.error));
      if (j.message?.content?.parts) return null; // رد ناجح
    } catch {}
  }
  return null;
}

function friendlyError(code: number, body: string): string {
  if (code === 401 || code === 403) return 'انتهت صلاحية الجلسة - الرجاء تحديث الكوكيز';
  if (code === 429) return 'معدل طلبات مرتفع - انتظر قليلاً أو حدّث الكوكيز';
  if (code === 400) {
    const detail = safeDetail(body);
    if (detail) return `طلب غير صالح: ${detail}`;
    return 'طلب غير صالح (قد تحتاج لتحديث الكوكيز)';
  }
  if (code === 503) return 'خادم ChatGPT مشغول - حاول لاحقاً';
  if (code >= 500) return 'خادم ChatGPT غير متاح حالياً';
  if (code === 0) return 'فشل الاتصال بـ ChatGPT';
  const detail = safeDetail(body);
  return detail || `خطأ ${code}`;
}

function safeDetail(body: string): string | null {
  try {
    const j = JSON.parse(body);
    if (typeof j.detail === 'string') return j.detail;
    if (j.detail?.message) return j.detail.message;
    if (typeof j.error === 'string') return j.error;
    if (j.error?.message) return j.error.message;
    return null;
  } catch { return null; }
}

// ─── إرسال طلب عادي (non-streaming) ────────────────────────
export async function sendRequest(
  messages: OpenAIMessage[],
  convId?: string,
  parentId?: string,
  model?: string,
  retry = false
): Promise<{ reply: string; conversationId: string; parentMessageId: string }> {
  const s = await getSettings();
  const m = model || s.defaultModel || 'gpt-4o';
  if (!s.sessionCookie) throw new Error('لم يتم ضبط الكوكيز');

  let token = await getAccessToken();
  if (!token && !retry) {
    token = await refreshAccessToken();
  }
  if (!token) throw new Error('تعذر الحصول على توكن الوصول - حدّث الكوكيز');

  const payload = buildPayload(messages, convId, parentId, m);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 55000);

  let r: Response;
  try {
    r = await fetch(CONVO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
        Cookie: s.sessionCookie,
        ...HEADERS,
        'oai-device-id': randomUUID(),
        'oai-language': 'en-US',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
      signal: c.signal,
      redirect: 'manual',
    });
  } catch (e: any) {
    clearTimeout(t);
    throw new Error(e.name === 'AbortError' ? 'انتهت مهلة الطلب' : 'فشل الاتصال بـ ChatGPT');
  }
  clearTimeout(t);

  // إعادة المحاولة بعد مسح التوكن
  if ((r.status === 401 || r.status === 403 || r.status === 0) && !retry) {
    tokenCache = null;
    await updateSettings({ accessToken: '' }).catch(() => {});
    const nt = await refreshAccessToken();
    if (nt) return sendRequest(messages, convId, parentId, model, true);
  }

  if (!r.ok) {
    const b = await r.text().catch(() => '');
    throw new Error(friendlyError(r.status, b));
  }

  const txt = await r.text();
  let data: any = {};

  // غالباً الرد SSE حتى لو طلبنا JSON
  const last = lastSSEData(txt);
  if (last) {
    data = last;
  } else {
    try { data = JSON.parse(txt); }
    catch { throw new Error('لم يتم استلام رد صالح'); }
  }

  const reply = extractReply(data);
  if (!reply) {
    // ربما كان الرد خطأ داخل الـ SSE
    const err = extractErrorFromSSE(txt);
    if (err) throw new Error(err);
    throw new Error('لم يتم استلام رد');
  }
  return {
    reply,
    conversationId: data.conversation_id || convId || '',
    parentMessageId: data.message?.id || payload.parent_message_id,
  };
}

// ─── ستريم SSE ─────────────────────────────────────────────
export async function createStream(
  messages: OpenAIMessage[],
  convId?: string,
  parentId?: string,
  model?: string,
  retry = false
): Promise<Response> {
  const s = await getSettings();
  const m = model || s.defaultModel || 'gpt-4o';
  if (!s.sessionCookie) return errResponse('لم يتم ضبط الكوكيز');

  let token = await getAccessToken();
  if (!token && !retry) {
    token = await refreshAccessToken();
  }
  if (!token) return errResponse('تعذر الحصول على توكن الوصول');

  const payload = buildPayload(messages, convId, parentId, m);
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 58000);

  let r: Response;
  try {
    r = await fetch(CONVO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
        Cookie: s.sessionCookie,
        ...HEADERS,
        'oai-device-id': randomUUID(),
        'oai-language': 'en-US',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
      signal: c.signal,
      redirect: 'manual',
    });
  } catch (e: any) {
    clearTimeout(t);
    if (e?.name === 'AbortError') return errResponse('انتهت مهلة الطلب');
    return errResponse('فشل الاتصال بـ ChatGPT');
  }

  // إعادة المحاولة في حالة 401/403 داخل الستريم
  if ((r.status === 401 || r.status === 403) && !retry) {
    clearTimeout(t);
    tokenCache = null;
    await updateSettings({ accessToken: '' }).catch(() => {});
    const nt = await refreshAccessToken();
    if (nt) return createStream(messages, convId, parentId, model, true);
    const b = await r.text().catch(() => '');
    return errResponse(friendlyError(r.status, b));
  }

  if (!r.ok || !r.body) {
    clearTimeout(t);
    const b = await r.text().catch(() => '');
    return errResponse(friendlyError(r.status, b));
  }

  const { readable, writable } = new TransformStream();
  const w = writable.getWriter();
  const enc = new TextEncoder();
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let fullText = '';
  let cId = convId || '';
  let mId = '';
  let aborted = false;

  (async () => {
    try {
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim();
          if (!d || d === '[DONE]') continue;
          let j: any;
          try { j = JSON.parse(d); } catch { continue; }

          if (j.conversation_id) cId = j.conversation_id;
          if (j.message?.id) mId = j.message.id;

          // رسالة خطأ من الخادم
          if (j.error || (j.detail && !j.message)) {
            const msg =
              (typeof j.error === 'string' ? j.error : j.error?.message) ||
              (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)) ||
              'خطأ من ChatGPT';
            await w.write(enc.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
            aborted = true;
            break;
          }

          // رسالة اكتمال
          if (j.message?.status === 'finished_successfully' || j.message?.end_turn === true) {
            continue;
          }

          const txt = extractReply(j);
          if (txt && txt.length > fullText.length) {
            const delta = txt.slice(fullText.length);
            fullText = txt;
            await w.write(
              enc.encode(
                `data: ${JSON.stringify({
                  id: mId || randomUUID(),
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: m,
                  conversation_id: cId,
                  choices: [{ delta: { content: delta }, finish_reason: null }],
                })}\n\n`
              )
            );
          }
        }
      }

      // رسالة نهائية بالمعرفات
      await w.write(
        enc.encode(
          `data: ${JSON.stringify({
            done: true,
            conversation_id: cId,
            parent_message_id: mId,
            content: fullText,
          })}\n\n`
        )
      );
      await w.write(enc.encode('data: [DONE]\n\n'));
      await w.close();
    } catch (e: any) {
      try {
        await w.write(
          enc.encode(`data: ${JSON.stringify({ error: e?.message || 'خطأ في الستريم' })}\n\n`)
        );
        await w.close();
      } catch {}
    } finally {
      clearTimeout(t);
      try { reader.releaseLock(); } catch {}
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function lastSSEData(text: string): any | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const tr = lines[i].trim();
    if (!tr.startsWith('data:')) continue;
    const data = tr.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const j = JSON.parse(data);
      if (j.message?.id || j.conversation_id) return j;
    } catch {}
  }
  return null;
}

function errResponse(msg: string) {
  return new Response(
    `data: ${JSON.stringify({ error: msg })}\n\ndata: [DONE]\n\n`,
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    }
  );
}

export function invalidateToken() {
  tokenCache = null;
}
