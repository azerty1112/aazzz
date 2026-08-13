'use client';

import { useState, useEffect, useRef } from 'react';

type SetupState = 'loading' | 'ready' | 'needs-cookie' | 'invalid-cookie';

interface ChatMsg { role: 'user' | 'assistant'; content: string; }

const EXAMPLES = [
  { icon: '📝', title: 'كتابة مقال', prompt: 'اكتب لي مقالاً قصيراً عن أهمية الذكاء الاصطناعي في التعليم الحديث، بمقدمة وثلاث فقرات وخاتمة.' },
  { icon: '💻', title: 'كود برمجي', prompt: 'اكتب دالة Python تأخذ قائمة أرقام وتُرجع أكبر رقم وأصغر رقم فيها، مع شرح بسيط للكود.' },
  { icon: '🌐', title: 'ترجمة', prompt: 'ترجم النص التالي إلى الإنجليزية:\n\n"الذكاء الاصطناعي يُحدث ثورة في كيفية تفاعلنا مع التكنولوجيا."' },
  { icon: '📧', title: 'بريد إلكتروني', prompt: 'اكتب رسالة بريد إلكتروني مهنية لطلب إجازة لمدة أسبوع من المدير.' },
  { icon: '🍳', title: 'وصفة طبخ', prompt: 'أعطني وصفة سهلة وسريعة لتحضير شوربة العدس بالخضار.' },
  { icon: '🧮', title: 'حل مسألة', prompt: 'اشرح لي كيف أحل: ثمن 3 أقلام ودفترين هو 15 دولار، ثمن القلم 2 دولار، فما ثمن الدفتر؟' },
  { icon: '✍️', title: 'تلخيص', prompt: 'لخّص في 3 نقاط: تغير المناخ يهدد المدن الساحلية بارتفاع مستوى البحر، ويسبب ظواهر جوية متطرفة، ويتطلب تعاوناً دولياً للاستثمار في الطاقة المتجددة.' },
  { icon: '🎯', title: 'خطة عمل', prompt: 'ضع لي خطة دراسية أسبوعية لتحسين مهاراتي في اللغة الإنجليزية خلال شهر.' },
];

export default function Home() {
  const [setup, setSetup] = useState<SetupState>('loading');
  const [setupMsg, setSetupMsg] = useState('');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [parentMessageId, setParentMessageId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─── فحص تلقائي للحالة عند تحميل الصفحة ───
  useEffect(() => {
    checkSetup();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const checkSetup = async () => {
    setSetup('loading');
    setSetupMsg('جاري فحص الإعدادات...');
    try {
      const res = await fetch('/api/setup', { cache: 'no-store' });
      const data = await res.json();

      if (data.ready) {
        setSetup('ready');
        setSetupMsg('');
      } else if (!data.steps.cookiePasted) {
        setSetup('needs-cookie');
        setSetupMsg(
          data.defaultPassword
            ? '👋 مرحباً! يبدو أن هذه أول زيارة. الخطوة الوحيدة المطلوبة: لصق كوكيز ChatGPT في لوحة الإدارة للبدء فوراً.'
            : '⚠️ لم يتم العثور على كوكيز صالحة. يرجى تحديثها من لوحة الإدارة.'
        );
      } else {
        setSetup('invalid-cookie');
        setSetupMsg('❌ الكوكيز الحالية منتهية الصلاحية. حدّثها من لوحة الإدارة.');
      }
    } catch {
      setSetup('ready');
      setSetupMsg('');
    }
  };

  // ─── محادثة ───
  const handleExampleClick = (p: string) => { setPrompt(p); textareaRef.current?.focus(); };
  const handleNewChat = () => {
    setMessages([]); setConversationId(undefined); setParentMessageId(undefined);
    setStreamingText(''); setErrorMsg(''); setPrompt('');
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || loading) return;
    const userPrompt = prompt.trim();
    setErrorMsg(''); setLoading(true); setPrompt(''); setStreamingText('');
    const newMsgs: ChatMsg[] = [...messages, { role: 'user', content: userPrompt }];
    setMessages(newMsgs);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;
      const res = await fetch('/api/chat', {
        method: 'POST', headers,
        body: JSON.stringify({ messages: newMsgs, stream, conversation_id: conversationId, parent_message_id: parentMessageId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error || `خطأ ${res.status}`);
        setLoading(false);
        // إذا كان خطأ كوكيز، افحص الحالة مجدداً
        if (res.status === 503 || (d.error && d.error.includes('كوكي'))) checkSetup();
        return;
      }
      let reply = '';
      if (stream) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No reader');
        const decoder = new TextDecoder();
        let done = false, buf = '';
        while (!done) {
          const { value, done: dr } = await reader.read();
          done = dr; if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const ds = line.slice(5).trim();
            if (!ds || ds === '[DONE]') continue;
            try {
              const j = JSON.parse(ds);
              if (j.error) { setErrorMsg(j.error); done = true; break; }
              if (j.done) { if (j.conversation_id) setConversationId(j.conversation_id); if (j.parent_message_id) setParentMessageId(j.parent_message_id); continue; }
              const delta = j.choices?.[0]?.delta?.content;
              if (delta) { reply += delta; setStreamingText(reply); }
            } catch {}
          }
        }
      } else {
        const d = await res.json();
        if (!d.success) { setErrorMsg(d.error); setLoading(false); return; }
        reply = d.response;
        if (d.conversation_id) setConversationId(d.conversation_id);
        if (d.parent_message_id) setParentMessageId(d.parent_message_id);
      }
      if (reply) setMessages([...newMsgs, { role: 'assistant', content: reply }]);
      setStreamingText('');
    } catch (e: any) {
      setErrorMsg('فشل الاتصال: ' + (e?.message || ''));
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // ─── شاشة الإعداد الأولي ───
  if (setup === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</div>
          <p style={{ color: '#666', marginTop: 10, fontSize: 15 }}>جاري التحقق من الإعدادات...</p>
          <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (setup === 'needs-cookie' || setup === 'invalid-cookie') {
    return (
      <main style={{ maxWidth: 600, margin: '40px auto', padding: 20 }}>
        <div style={{ backgroundColor: 'white', padding: 30, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
          <div style={{ fontSize: 60, marginBottom: 15 }}>{setup === 'needs-cookie' ? '🚀' : '🔐'}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 10 }}>
            {setup === 'needs-cookie' ? 'خطوة واحدة فقط للبدء!' : 'يجب تحديث الكوكيز'}
          </h1>
          <p style={{ color: '#555', fontSize: 14, lineHeight: 1.8, marginBottom: 20, textAlign: 'right' }}>
            {setup === 'needs-cookie'
              ? 'كل شيء جاهز تلقائياً! الخطوة الوحيدة المتبقية هي لصق كوكيز ChatGPT الخاصة بك (لن يتمكن التطبيق من العمل بدونها لأنها مفتاح الوصول لحسابك).'
              : 'انتهت صلاحية الكوكيز. يرجى تسجيل الدخول إلى chatgpt.com مجدداً ونسخ الكوكيز.'}
          </p>

          <div style={{ backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: 15, marginBottom: 20, textAlign: 'right', fontSize: 13, color: '#0c4a6e', lineHeight: 1.9 }}>
            <b>الطريقة الأسرع (30 ثانية):</b>
            <ol style={{ paddingRight: 20, marginTop: 5 }}>
              <li>ثبّت إضافة <a href="https://chromewebstore.google.com/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg" target="_blank" rel="noopener" style={{ color: '#2563eb' }}>EditThisCookie</a> على Chrome</li>
              <li>سجّل دخولك إلى <a href="https://chatgpt.com" target="_blank" rel="noopener" style={{ color: '#2563eb' }}>chatgpt.com</a></li>
              <li>اضغط أيقونة الإضافة → <b>Export</b> (أيقونة السهم)</li>
              <li>اذهب للوحة الإدارة، الصق الكوكيز في أداة "الاستيراد السريع"</li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/login" style={{
              padding: '12px 28px', backgroundColor: '#0070f3', color: 'white',
              borderRadius: 10, textDecoration: 'none', fontSize: 15, fontWeight: 600,
            }}>
              ⚙️ الذهاب إلى لوحة الإدارة
            </a>
            <button onClick={checkSetup} style={{
              padding: '12px 20px', backgroundColor: '#f3f4f6', color: '#333',
              border: '1px solid #d1d5db', borderRadius: 10, fontSize: 14,
            }}>
              🔄 إعادة الفحص
            </button>
          </div>

          {setup === 'needs-cookie' && (
            <div style={{ marginTop: 20, padding: 10, backgroundColor: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
              💡 كلمة المرور الافتراضية للوحة الإدارة: <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>admin</code>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ─── الواجهة الرئيسية (جاهز) ───
  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 16, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', marginBottom: 10, paddingTop: 4 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>🤖 ChatGPT Proxy</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', marginTop: 4 }}>
          <span style={{ color: '#16a34a', fontSize: 12 }}>● متصل</span>
          {messages.length > 0 && (
            <button onClick={handleNewChat} style={{
              padding: '4px 12px', fontSize: 12, backgroundColor: '#f3f4f6', color: '#333',
              border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer',
            }}>🆕 محادثة جديدة</button>
          )}
          <a href="/login" style={{ fontSize: 11, color: '#999', textDecoration: 'none' }}>الإدارة</a>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: 12, marginBottom: 12, borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 14 }}>
          ❌ {errorMsg}
          {errorMsg.includes('جلسة') || errorMsg.includes('كوكي') ? (
            <div style={{ marginTop: 5 }}>
              <a href="/login" style={{ color: '#2563eb', fontSize: 12 }}>→ الذهاب إلى لوحة الإدارة لتحديث الكوكيز</a>
            </div>
          ) : null}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
        {messages.length === 0 ? (
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#555', textAlign: 'center', margin: '20px 0 12px' }}>💡 ابدأ بسؤال أو اختر مثالاً</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => handleExampleClick(ex.prompt)}
                  onMouseOver={e => { e.currentTarget.style.borderColor = '#0070f3'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.transform = 'none'; }}
                  style={{ textAlign: 'right', padding: 14, backgroundColor: 'white', border: '1px solid #e5e7eb',
                    borderRadius: 10, cursor: 'pointer', lineHeight: 1.5, transition: 'all .2s' }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>{ex.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a1a', marginBottom: 3 }}>{ex.title}</div>
                  <div style={{ fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {ex.prompt.split('\n')[0]}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-start' : 'flex-end', marginBottom: 12 }}>
                <div style={{
                  maxWidth: '85%', padding: '12px 16px', borderRadius: 12,
                  backgroundColor: m.role === 'user' ? '#0070f3' : '#fff',
                  color: m.role === 'user' ? '#fff' : '#1a1a1a',
                  border: m.role === 'user' ? 'none' : '1px solid #e5e7eb',
                  whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 15,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>
                    {m.role === 'user' ? '👤 أنت' : '🤖 المساعد'}
                  </div>
                  {m.content}
                </div>
              </div>
            ))}
            {streamingText && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <div style={{
                  maxWidth: '85%', padding: '12px 16px', borderRadius: 12, backgroundColor: '#fff',
                  color: '#1a1a1a', border: '1px solid #e5e7eb', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 15,
                }}>
                  <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>🤖 المساعد</div>
                  {streamingText}<span className="blink">▊</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div style={{ position: 'sticky', bottom: 0, backgroundColor: '#f5f5f5', paddingTop: 8, paddingBottom: 8 }}>
        <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #d1d5db', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <textarea
            ref={textareaRef} value={prompt}
            onChange={e => setPrompt(e.target.value)} onKeyDown={handleKeyDown}
            rows={messages.length > 0 ? 2 : 3}
            placeholder={loading ? 'جاري إنشاء الرد...' : 'اكتب رسالتك...'}
            disabled={loading}
            style={{ width: '100%', padding: 14, fontSize: 15, border: 'none', outline: 'none', resize: 'none', backgroundColor: 'transparent', fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #f0f0f0', backgroundColor: '#fafafa', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#555', cursor: 'pointer' }}>
                <input type="checkbox" checked={stream} onChange={e => setStream(e.target.checked)} /> ⚡ بث مباشر
              </label>
            </div>
            <button onClick={handleSubmit} disabled={loading || !prompt.trim()} style={{
              padding: '8px 24px', fontSize: 15, fontWeight: 600,
              backgroundColor: loading || !prompt.trim() ? '#9ca3af' : '#0070f3',
              color: 'white', border: 'none', borderRadius: 8,
              cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
            }}>
              {loading ? '⏳ ...' : 'إرسال ↵'}
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .blink { animation: blink 1s step-end infinite; color: #0070f3; }
        @keyframes blink { 50% { opacity: 0; } }
        body { background-color: #f5f5f5; }
      `}</style>
    </main>
  );
}
