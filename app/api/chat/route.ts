import { NextRequest, NextResponse } from 'next/server';
import { createStream, ensureValidToken, refreshAccessToken, invalidateToken } from '@/lib/chatgpt';
import { OpenAIMessage } from '@/lib/types';
import { getSettings } from '@/lib/settings';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ALLOWED_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'o1', 'o1-mini', 'o1-preview', 'o3-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'];

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.ip ||
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'anon';

    if (!(await checkRateLimit(ip))) {
      return NextResponse.json({ error: 'تم تجاوز الحد - حاول بعد قليل' }, { status: 429 });
    }

    const s = await getSettings();

    // مفتاح API
    const apiKey = req.headers.get('x-api-key') || req.nextUrl.searchParams.get('key') || '';
    if (s.apiAccessKey && apiKey !== s.apiAccessKey) {
      return NextResponse.json({ error: 'غير مصرح - مفتاح API خاطئ' }, { status: 401 });
    }

    if (!s.sessionCookie) {
      return NextResponse.json({ error: 'لم يتم إعداد الكوكيز بعد - ادخل صفحة الإدارة' }, { status: 503 });
    }

    // ─── تحديث التوكن تلقائياً قبل أي طلب ───
    const token = await ensureValidToken();
    if (!token) {
      invalidateToken();
      const t2 = await refreshAccessToken();
      if (!t2) {
        return NextResponse.json(
          { error: 'تعذر الحصول على توكن الوصول - حدّث الكوكيز من لوحة الإدارة' },
          { status: 503 }
        );
      }
    }

    let body: any = {};
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'جسم الطلب غير صالح (JSON expected)' }, { status: 400 }); }

    let messages: OpenAIMessage[] = [];
    let stream = true;
    let model = (body.model || s.defaultModel || 'gpt-4o').toString();
    let convId: string | undefined = body.conversation_id;
    let parentId: string | undefined = body.parent_message_id;

    // تطبيع اسم الموديل
    if (!ALLOWED_MODELS.includes(model)) {
      // السماح لأي موديل يبدو ببادئة مألوفة
      if (!/^[a-z0-9\-\.]+$/i.test(model) || model.length > 40) {
        model = 'gpt-4o';
      }
    }

    if (Array.isArray(body.messages)) {
      messages = (body.messages as any[])
        .filter(
          (m: any) =>
            m &&
            typeof m === 'object' &&
            typeof m.role === 'string' &&
            typeof m.content === 'string' &&
            ['user', 'assistant', 'system'].includes(m.role) &&
            m.content.trim().length > 0
        )
        .map((m) => ({ role: m.role, content: m.content.toString() })) as OpenAIMessage[];
      stream = body.stream !== false && body.stream !== 'false';
    } else if (typeof body.prompt === 'string' && body.prompt.trim()) {
      messages = [{ role: 'user', content: body.prompt.trim() }];
      stream = body.stream !== false && body.stream !== 'false';
    } else {
      return NextResponse.json(
        { error: 'يجب إرسال messages (مصفوفة) أو prompt (نص)' },
        { status: 400 }
      );
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: 'لا توجد رسائل صالحة' }, { status: 400 });
    }

    // حد أقصى معقول لعدد الرسائل
    if (messages.length > 200) {
      messages = messages.slice(-200);
    }

    // نماذج o1 لا تدعم ستريم في الغالب
    const forceNoStream = model.startsWith('o1') || model.startsWith('o3');
    if (forceNoStream) stream = false;

    // دائماً نستخدم الستريم في الواجهة الأمامية؛ أما non-streaming فنحوّله داخلياً من الستريم
    if (stream) {
      return createStream(messages, convId, parentId, model);
    }

    // non-streaming: نجمع الستريم حتى النهاية
    const resp = await createStream(messages, convId, parentId, model);
    if (!resp.body) {
      return NextResponse.json({ error: 'لا يوجد رد' }, { status: 500 });
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let fullContent = '';
    let finalConvId = convId || '';
    let finalMsgId = '';
    let errMsg = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim();
        if (!d || d === '[DONE]') continue;
        try {
          const j = JSON.parse(d);
          if (j.error) errMsg = j.error;
          if (j.done) {
            if (j.conversation_id) finalConvId = j.conversation_id;
            if (j.parent_message_id) finalMsgId = j.parent_message_id;
            if (j.content) fullContent = j.content;
          } else if (j.choices?.[0]?.delta?.content) {
            fullContent += j.choices[0].delta.content;
          }
        } catch {}
      }
    }
    if (errMsg && !fullContent) {
      return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      response: fullContent,
      conversation_id: finalConvId,
      parent_message_id: finalMsgId,
      model,
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || 'خطأ غير متوقع' },
      { status: 500 }
    );
  }
}
