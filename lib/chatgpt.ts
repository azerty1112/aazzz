import { getSettings, updateSettings } from './settings';
import { ChatPayload, OpenAIMessage } from './types';
import { randomUUID } from 'crypto';

const CHATGPT_ORIGIN = 'https://chatgpt.com';
const SESSION_URL = `${CHATGPT_ORIGIN}/api/auth/session`;
const CONVERSATION_URL = `${CHATGPT_ORIGIN}/backend-api/conversation`;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/event-stream, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity', // نتجنب br/gzip لتبسيط القراءة في serverless
  'Referer': `${CHATGPT_ORIGIN}/`,
  'Origin': CHATGPT_ORIGIN,
  'sec-ch-ua': '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-origin',
  'DNT': '1',
  'Connection': 'keep-alive',
};

let accessTokenCache: { token: string; refreshedAt: number } | null = null;

/**
 * محاولة تحديث Access Token من الكوكيز
 */
async function tryRefreshToken(sessionCookie: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(SESSION_URL, {
      headers: { Cookie: sessionCookie, ...BROWSER_HEADERS, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.accessToken) {
      accessTokenCache = { token: data.accessToken, refreshedAt: Date.now() };
      return data.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const settings = await getSettings();

  // استخدام الكاش إذا كان حديثاً (أقل من 10 دقائق)
  if (accessTokenCache && Date.now() - accessTokenCache.refreshedAt < 10 * 60 * 1000) {
    return accessTokenCache.token;
  }

  if (settings.accessToken) {
    // التحقق بسرعة من صلاحية الكوكيز المخزنة (تجديد إذا مر وقت)
    accessTokenCache = { token: settings.accessToken, refreshedAt: Date.now() };
    return settings.accessToken;
  }

  return tryRefreshToken(sessionCookieFromSettings(settings));
}

function sessionCookieFromSettings(settings: { sessionCookie?: string }): string {
  return settings.sessionCookie || '';
}

export async function refreshAccessToken(): Promise<string | null> {
  const settings = await getSettings();
  const cookie = sessionCookieFromSettings(settings);
  if (!cookie) return null;
  const token = await tryRefreshToken(cookie);
  if (token) await updateSettings({ accessToken: token });
  return token;
}

/**
 * بناء Payload بطريقة مطابقة لما يرسله المتصفح
 */
export function buildPayload(
  messages: OpenAIMessage[],
  conversationId?: string,
  parentMessageId?: string,
  model: string = 'gpt-4o'
): ChatPayload {
  // ChatGPT يتطلب رسائل author mapping دقيق
  const chatMessages: any[] = [];
  let lastUserId = '';
  let lastAssistantId = '';

  for (const msg of messages) {
    let role: string;
    if (msg.role === 'assistant') role = 'assistant';
    else if (msg.role === 'system') role = 'system';
    else role = 'user';

    const id = randomUUID();
    const message: any = {
      id,
      author: { role, name: null, metadata: {} },
      content: { content_type: 'text', parts: [msg.content] },
      metadata: {
        serialized_metadata: JSON.stringify({
          custom_info: {
            client_archetype: 'next-web',
            from_source: 'direct',
          },
        }),
      },
    };
    // user messages have recipient
    if (role === 'user') {
      message.recipient = 'all';
      message.channel = null;
      lastUserId = id;
    } else {
      message.recipient = null;
      if (role === 'assistant') lastAssistantId = id;
    }
    message.create_time = Date.now() / 1000;
    chatMessages.push(message);
  }

  // يجب أن يكون parent_message_id إما آخر رسالة في المحادثة أو root
  const parent = parentMessageId || lastAssistantId || lastUserId || randomUUID();

  return {
    action: 'next',
    messages: chatMessages,
    parent_message_id: parent,
    model,
    conversation_id: conversationId || undefined,
    timezone_offset_min: new Date().getTimezoneOffset(),
    history_and_training_disabled: false,
    force_paragen: false,
    force_paragen_model_slug: '',
    suggestions: [],
    conversation_mode: { kind: 'primary_assistant', plugin_ids: null },
    arkose_token: null,
    websocket_request_id: randomUUID(),
  };
}

export function extractReply(data: any): string {
  try {
    if (!data?.message) return '';
    // الحالة الأساسية: رسالة مكتملة
    const msg = data.message;
    if (msg.status === 'in_progress' || msg.end_time === null) {
      // streaming chunk - take last part
      if (msg.content?.parts) {
        const txt = msg.content.parts.join('\n');
        return txt;
      }
    }
    if (msg.content?.parts) return msg.content.parts.join('\n').trim();
    if (typeof msg === 'string') return msg;
  } catch {}
  return '';
}

function parseErrorBody(body: string, status: number): string {
  try {
    const j = JSON.parse(body);
    if (j.detail) return typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
    if (j.error?.message) return j.error.message;
    if (j.message) return j.message;
    if (j.error) return typeof j.error === 'string' ? j.error : JSON.stringify(j.error);
  } catch {}
  // أكواد الحالة المعروفة
  if (status === 401) return 'انتهت صلاحية الجلسة - حدّث الكوكيز من لوحة الإدارة';
  if (status === 403) return 'حظر وصول (Cloudflare) - قد تحتاج لتحديث الكوكيز';
  if (status === 429) return 'معدل طلبات مرتفع - انتظر قليلاً';
  if (status === 502 || status === 503) return 'خدمة ChatGPT غير متاحة حالياً - حاول بعد دقائق';
  return `خطأ ${status}`;
}

/**
 * طلب محادثة رئيسي مع إعادة محاولة تلقائية عند فشل التوكن
 */
export async function sendChatRequest(
  messages: OpenAIMessage[],
  conversationId?: string,
  parentMessageId?: string,
  model?: string,
  isRetry = false
): Promise<{ reply: string; conversationId: string; parentMessageId: string }> {
  const settings = await getSettings();
  const effectiveModel = model || settings.defaultModel;

  if (!settings.sessionCookie) {
    throw new Error('لم يتم ضبط كوكي الجلسة. اذهب إلى لوحة الإدارة وأضف الكوكيز.');
  }

  let accessToken = await getAccessToken();
  if (!accessToken && !isRetry) {
    // محاولة تجديد التوكن أولاً
    accessToken = await refreshAccessToken();
  }
  if (!accessToken) {
    throw new Error(
      'تعذر الحصول على Access Token. الكوكيز غير صالحة أو منتهية الصلاحية.\n' +
      'الحل: ادخل إلى chatgpt.com في المتصفح، سجّل الدخول، ثم انسخ الكوكيز مجدداً من خلال أداة الاستيراد في لوحة الإدارة.'
    );
  }

  const payload = buildPayload(messages, conversationId, parentMessageId, effectiveModel);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  let response: Response;
  try {
    response = await fetch(CONVERSATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Cookie: settings.sessionCookie,
        ...BROWSER_HEADERS,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('انتهت مهلة الطلب (60 ثانية) - حاول مرة أخرى');
    throw new Error('فشل الاتصال بـ ChatGPT: ' + (e.message || 'خطأ شبكة'));
  }
  clearTimeout(timeout);

  // إذا كان 401/403 والتوكن قديم، جرب تجديده وإعادة الإرسال مرة واحدة
  if ((response.status === 401 || response.status === 403) && !isRetry) {
    accessTokenCache = null;
    const newToken = await refreshAccessToken();
    if (newToken) {
      return sendChatRequest(messages, conversationId, parentMessageId, model, true);
    }
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(parseErrorBody(errBody, response.status));
  }

  const text = await response.text();
  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    // SSE response - extract last data line
    const lines = text.split('\n');
    let lastValid = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const d = trimmed.slice(5).trim();
        if (d && d !== '[DONE]') lastValid = d;
      }
    }
    if (lastValid) {
      try { data = JSON.parse(lastValid); } catch { data = {}; }
    } else {
      data = {};
    }
  }

  const reply = extractReply(data);
  if (!reply) {
    throw new Error('لم يتم استلام رد من ChatGPT. قد تكون الكوكيز منتهية أو النموذج غير متاح لحسابك.');
  }

  return {
    reply,
    conversationId: data.conversation_id || conversationId || '',
    parentMessageId: data.message?.id || payload.parent_message_id,
  };
}

/**
 * طلب Stream للبث المباشر - يُعيد كائن Response مباشرة
 */
export async function createStreamResponse(
  messages: OpenAIMessage[],
  conversationId?: string,
  parentMessageId?: string,
  model?: string
): Promise<Response> {
  const settings = await getSettings();
  const effectiveModel = model || settings.defaultModel;
  let accessToken = await getAccessToken();

  if (!accessToken) accessToken = await refreshAccessToken();
  if (!accessToken) {
    return new Response(
      `data: ${JSON.stringify({ error: 'تعذر الحصول على Access Token - حدّث الكوكيز' })}\n\n`,
      {
        status: 401,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      }
    );
  }

  const payload = buildPayload(messages, conversationId, parentMessageId, effectiveModel);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 58000);

  let response: Response;
  try {
    response = await fetch(CONVERSATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        Cookie: settings.sessionCookie,
        ...BROWSER_HEADERS,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    return new Response(`data: ${JSON.stringify({ error: 'فشل الاتصال' })}\n\n`, {
      status: 500,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  if (!response.ok) {
    clearTimeout(timeout);
    let msg = `خطأ ${response.status}`;
    // إذا كان 401 جرب تجديد
    if (response.status === 401) {
      accessTokenCache = null;
      const newToken = await refreshAccessToken();
      if (newToken) {
        return createStreamResponse(messages, conversationId, parentMessageId, model);
      }
      msg = 'انتهت صلاحية الجلسة - حدّث الكوكيز';
    } else {
      const body = await response.text().catch(() => '');
      msg = parseErrorBody(body, response.status);
    }
    return new Response(`data: ${JSON.stringify({ error: msg })}\n\n`, {
      status: 200, // نُعيد 200 لكي يقرأ الـ stream الرسالة
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  }

  // بناء TransformStream لتمرير الـ SSE بشكل نظيف
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let capturedConvId = conversationId || '';
  let capturedMsgId = '';
  let fullText = '';

  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const d = line.slice(5).trim();
          if (!d || d === '[DONE]') {
            if (d === '[DONE]') {
              const meta = JSON.stringify({ done: true, conversation_id: capturedConvId, parent_message_id: capturedMsgId });
              await writer.write(encoder.encode(`data: ${meta}\n\n`));
              await writer.write(encoder.encode('data: [DONE]\n\n'));
              await writer.close();
              clearTimeout(timeout);
              return;
            }
            continue;
          }
          try {
            const json = JSON.parse(d);
            if (json.conversation_id) capturedConvId = json.conversation_id;
            if (json.message?.id) capturedMsgId = json.message.id;

            const text = extractReply(json);
            if (text && text.length > fullText.length) {
              const delta = text.slice(fullText.length);
              fullText = text;
              const chunk = JSON.stringify({
                id: capturedMsgId,
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: effectiveModel,
                conversation_id: capturedConvId,
                choices: [{ delta: { content: delta }, index: 0 }],
              });
              await writer.write(encoder.encode(`data: ${chunk}\n\n`));
            }
          } catch { /* تجاهل الأسطر غير الصالحة */ }
        }
      }
      // إذا انتهى بدون [DONE]
      const meta = JSON.stringify({ done: true, conversation_id: capturedConvId, parent_message_id: capturedMsgId });
      await writer.write(encoder.encode(`data: ${meta}\n\n`));
      await writer.write(encoder.encode('data: [DONE]\n\n'));
      await writer.close();
    } catch (err: any) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Stream error' })}\n\n`));
      await writer.close();
    } finally {
      clearTimeout(timeout);
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
