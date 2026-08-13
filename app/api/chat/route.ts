import { NextRequest, NextResponse } from 'next/server';
import { sendChatRequest, createStreamResponse } from '@/lib/chatgpt';
import { OpenAIMessage } from '@/lib/types';
import { getSettings } from '@/lib/settings';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.ip ||
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'anonymous';

    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: 'تم تجاوز عدد الطلبات. حاول بعد دقيقة.' },
        { status: 429 }
      );
    }

    const apiKey = req.headers.get('x-api-key');
    const settings = await getSettings();
    if (settings.apiAccessKey && apiKey !== settings.apiAccessKey) {
      return NextResponse.json({ error: 'غير مصرح - مفتاح API غير صحيح' }, { status: 401 });
    }

    if (!settings.sessionCookie) {
      return NextResponse.json(
        { error: 'لم يتم إعداد الكوكيز بعد. يرجى التواصل مع المسؤول.' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    let messages: OpenAIMessage[] = [];
    let stream = false;
    let model = body.model || settings.defaultModel;
    let conversationId: string | undefined;
    let parentMessageId: string | undefined;

    if (Array.isArray(body.messages)) {
      messages = body.messages.filter(
        (m: any) => m && typeof m.role === 'string' && typeof m.content === 'string'
      );
      stream = body.stream === true;
      conversationId = body.conversation_id;
      parentMessageId = body.parent_message_id;
    } else if (typeof body.prompt === 'string' && body.prompt.trim()) {
      messages = [{ role: 'user', content: body.prompt.trim() }];
      stream = body.stream === true;
      conversationId = body.conversation_id;
      parentMessageId = body.parent_message_id;
    } else {
      return NextResponse.json(
        { error: 'يجب إرسال `messages` (مصفوفة) أو `prompt` (نص)' },
        { status: 400 }
      );
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: 'لا توجد رسائل' }, { status: 400 });
    }

    // تحديد النموذج
    const validModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'o1', 'text-davinci-002-render-sha'];
    if (!validModels.includes(model)) {
      model = settings.defaultModel;
    }

    if (stream) {
      return createStreamResponse(messages, conversationId, parentMessageId, model);
    }

    const result = await sendChatRequest(messages, conversationId, parentMessageId, model);
    return NextResponse.json({
      success: true,
      response: result.reply,
      conversation_id: result.conversationId,
      parent_message_id: result.parentMessageId,
      model,
    });
  } catch (error: any) {
    const message = error?.message || 'خطأ غير متوقع';
    // تحديد رمز الحالة المناسب
    let status = 500;
    if (message.includes('لم يتم ضبط كوكي') || message.includes('تعذر الحصول على Access Token')) status = 503;
    else if (message.includes('429') || message.includes('معدل')) status = 429;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
