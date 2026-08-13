'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type SetupState = 'loading' | 'ready' | 'needs-setup';

interface ChatMsg { role: 'user' | 'assistant' | 'system'; content: string; id?: string }

const MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', icon: '⭐' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', icon: '⚡' },
  { id: 'gpt-4', name: 'GPT-4', icon: '🧠' },
  { id: 'o1', name: 'O1', icon: '🔬' },
  { id: 'o3-mini', name: 'O3 Mini', icon: '🧪' },
];

const EXAMPLES = [
  { icon: '📝', title: 'مقال', prompt: 'اكتب مقالاً قصيراً عن الذكاء الاصطناعي والتعليم.' },
  { icon: '💻', title: 'كود', prompt: 'اكتب دالة Python لفرز قائمة أرقام.' },
  { icon: '🌐', title: 'ترجمة', prompt: 'ترجم إلى الإنجليزية: "الذكاء الاصطناعي يغير العالم."' },
  { icon: '📧', title: 'إيميل', prompt: 'اكتب إيميل مهني لطلب إجازة.' },
  { icon: '🍳', title: 'وصفة', prompt: 'أعطني وصفة شوربة عدس سهلة.' },
  { icon: '🧮', title: 'حل مسألة', prompt: 'اشرح حل مسألة: 3 أقلام ودفترين بـ 15، القلم بـ 2، فكم ثمن الدفتر؟' },
];

export default function Home() {
  const [setup, setSetup] = useState<SetupState>('loading');
  const [setupInfo, setSetupInfo] = useState<any>(null);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o');
  const [convId, setConvId] = useState<string | undefined>(undefined);
  const [parentId, setParentId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState('');
  const [err, setErr] = useState('');
  const [connected, setConnected] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { checkSetup(); }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  // استعادة المحادثة من localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chat-state');
      if (saved) {
        const d = JSON.parse(saved);
        if (Array.isArray(d.messages) && d.messages.length > 0) {
          setMessages(d.messages);
          setConvId(d.convId);
          setParentId(d.parentId);
          setModel(d.model || 'gpt-4o');
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        'chat-state',
        JSON.stringify({ messages, convId, parentId, model })
      );
    } catch {}
  }, [messages, convId, parentId, model]);

  async function checkSetup() {
    setSetup('loading');
    try {
      const r = await fetch('/api/setup', { cache: 'no-store' });
      const d = await r.json();
      setConnected(!!d.steps?.tokenValid);
      if (d.ready) { setSetup('ready'); setSetupInfo(d); }
      else { setSetup('needs-setup'); setSetupInfo(d); }
    } catch { setSetup('ready'); }
  }

  function newChat() {
    setMessages([]);
    setConvId(undefined);
    setParentId(undefined);
    setStreaming('');
    setErr('');
    setPrompt('');
    try { localStorage.removeItem('chat-state'); } catch {}
  }

  function stopGenerating() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  const submit = useCallback(async () => {
    if (!prompt.trim() || sending) return;
    const text = prompt.trim();
    setErr('');
    setSending(true);
    setPrompt('');
    setStreaming('');

    const newMsgs: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(newMsgs);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: newMsgs,
          stream: true,
          model,
          conversation_id: convId,
          parent_message_id: parentId,
        }),
        signal: ac.signal,
        cache: 'no-store',
      });

      if (!r.ok) {
        let errText = `خطأ ${r.status}`;
        try {
          const d = await r.json();
          errText = d.error || errText;
        } catch {}
        // إزالة رسالة المستخدم في حالة فشل كلي فقط إذا لم يكن محادثة مستمرة
        if (errText.includes('كوكيز') || errText.includes('توكن') || r.status === 503) {
          setMessages(newMsgs); // نبقي رسالة المستخدم لكن نظهر خطأ
          checkSetup();
        }
        setErr(errText);
        setSending(false);
        return;
      }

      const reader = r.body?.getReader();
      if (!reader) throw new Error('لا يوجد قارئ للرد');

      const dec = new TextDecoder();
      let reply = '';
      let done = false;
      let buf = '';
      let newConvId = convId;
      let newParentId = parentId;

      while (!done) {
        const read = await reader.read();
        if (read.done) { done = true; break; }
        const value = read.value;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const ds = line.slice(5).trim();
          if (!ds || ds === '[DONE]') continue;
          let j: any;
          try { j = JSON.parse(ds); } catch { continue; }
          if (j.error) { setErr(j.error); done = true; break; }
          if (j.done) {
            if (j.conversation_id) newConvId = j.conversation_id;
            if (j.parent_message_id) newParentId = j.parent_message_id;
            if (j.content && !reply) reply = j.content;
            continue;
          }
          const delta = j.choices?.[0]?.delta?.content;
          if (delta) {
            reply += delta;
            setStreaming(reply);
          }
          if (j.conversation_id && !newConvId) newConvId = j.conversation_id;
        }
      }

      if (reply) {
        setConvId(newConvId);
        setParentId(newParentId);
        setMessages([...newMsgs, { role: 'assistant', content: reply }]);
      }
      setStreaming('');
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setErr('فشل الاتصال: ' + (e?.message || 'خطأ غير معروف'));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [prompt, sending, messages, apiKey, model, convId, parentId]);

  function keyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  if (setup === 'loading') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, animation: 'spin 1s linear infinite' }}>⚙️</div>
        <p style={{ color: '#666', marginTop: 8 }}>جاري التحميل...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>;
  }

  if (setup === 'needs-setup') {
    return <main style={{ maxWidth: 560, margin: '40px auto', padding: 20 }}>
      <div style={{ backgroundColor: 'white', padding: 30, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🚀</div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>خطوة واحدة للبدء</h1>
        <p style={{ color: '#555', marginTop: 8, fontSize: 14, lineHeight: 1.8 }}>
          {setupInfo?.defaultPassword
            ? 'اختر كلمة مرور للوحة الإدارة، ثم الصق كوكيز ChatGPT وابدأ مباشرة.'
            : 'يجب تحديث كوكيز ChatGPT. ادخل لوحة الإدارة لاستيرادها.'}
        </p>
        <div style={{ marginTop: 18 }}>
          <a href="/login" style={{
            display: 'inline-block', padding: '12px 28px', backgroundColor: '#0070f3', color: 'white',
            borderRadius: 10, textDecoration: 'none', fontWeight: 600, fontSize: 15,
          }}>⚙️ الذهاب للإعداد</a>
        </div>
        <button onClick={checkSetup} style={{ marginTop: 12, padding: '8px 16px', background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', fontSize: 13 }}>
          🔄 إعادة الفحص
        </button>
      </div>
    </main>;
  }

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 16, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>🤖 ChatGPT Proxy</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{ color: connected ? '#16a34a' : '#dc2626', fontSize: 12 }}>
            ● {connected ? 'متصل' : 'غير متصل'}
          </span>
          {messages.length > 0 && (
            <button onClick={newChat} style={{ padding: '3px 10px', fontSize: 12, border: '1px solid #ddd', borderRadius: 6, background: 'white', cursor: 'pointer' }}>
              🆕 محادثة جديدة
            </button>
          )}
          <select value={model} onChange={e => setModel(e.target.value)} disabled={sending}
            style={{ padding: '3px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #ddd', background: 'white' }}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
          </select>
          <a href="/admin" style={{ fontSize: 11, color: '#999', textDecoration: 'none' }}>الإدارة</a>
        </div>
      </div>

      {err && <div style={{ padding: 10, marginBottom: 10, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
        ❌ {err}
        <button onClick={() => setErr('')} style={{ float: 'left', background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>×</button>
        {(err.includes('جلسة') || err.includes('كوكي') || err.includes('توكن')) && (
          <div style={{ marginTop: 4 }}>
            <a href="/login" style={{ color: '#2563eb', fontSize: 12 }}>→ تحديث الكوكيز</a>
          </div>
        )}
      </div>}

      <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8, paddingBottom: 8 }} dir="rtl">
        {messages.length === 0 ? (
          <div>
            <h3 style={{ fontSize: 14, color: '#555', textAlign: 'center', margin: '20px 0 10px' }}>💡 أمثلة جاهزة — اضغط لتجربتها</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: 8 }}>
              {EXAMPLES.map((ex, i) => (
                <button key={i} onClick={() => setPrompt(ex.prompt)}
                  style={{ textAlign: 'right', padding: 12, background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer', lineHeight: 1.5 }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{ex.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{ex.title}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{ex.prompt.slice(0, 50)}...</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}
            {streaming && (
              <MessageBubble role="assistant" content={streaming} streaming />
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: '#f5f5f5', paddingTop: 8, zIndex: 10 }}>
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #d1d5db', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
          <textarea
            ref={taRef}
            value={prompt}
            onChange={e => { setPrompt(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'; }}
            onKeyDown={keyDown}
            rows={1}
            placeholder={sending ? 'جاري التفكير...' : 'اكتب رسالتك... (Enter للإرسال, Shift+Enter لسطر جديد)'}
            disabled={sending}
            dir="rtl"
            style={{ width: '100%', padding: 12, fontSize: 15, border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', maxHeight: 200, minHeight: 44 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderTop: '1px solid #f0f0f0', background: '#fafafa', flexWrap: 'wrap', gap: 6 }}>
            <input type="text" placeholder="🔑 API Key (اختياري)" value={apiKey} onChange={e => setApiKey(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, width: 150, outline: 'none' }} dir="ltr" />
            <div style={{ display: 'flex', gap: 6 }}>
              {sending ? (
                <button onClick={stopGenerating} style={{
                  padding: '7px 20px', fontSize: 14, fontWeight: 600,
                  background: '#dc2626', color: 'white',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                }}>⏹ إيقاف</button>
              ) : (
                <button onClick={submit} disabled={!prompt.trim()} style={{
                  padding: '7px 20px', fontSize: 14, fontWeight: 600,
                  background: !prompt.trim() ? '#9ca3af' : '#0070f3', color: 'white',
                  border: 'none', borderRadius: 8, cursor: !prompt.trim() ? 'not-allowed' : 'pointer',
                }}>إرسال ↵</button>
              )}
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .blink{animation:blink 1s step-end infinite;color:#0070f3;font-weight:bold}
        @keyframes blink{50%{opacity:0}}
        * { box-sizing: border-box; }
        body { margin: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Arial, sans-serif; }
        html, body { direction: rtl; }
      `}</style>
    </main>
  );
}

function MessageBubble({ role, content, streaming }: { role: 'user' | 'assistant' | 'system'; content: string; streaming?: boolean }) {
  const isUser = role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-start' : 'flex-end',
      marginBottom: 12,
    }}>
      <div style={{
        maxWidth: '85%',
        padding: '12px 16px',
        borderRadius: 16,
        borderTopRightRadius: isUser ? 4 : 16,
        borderTopLeftRadius: isUser ? 16 : 4,
        background: isUser ? '#0070f3' : 'white',
        color: isUser ? 'white' : '#1a1a1a',
        border: isUser ? 'none' : '1px solid #e5e7eb',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        lineHeight: 1.8,
        fontSize: 15,
        boxShadow: '0 1px 3px rgba(0,0,0,.05)',
      }}>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4, fontWeight: 600 }}>
          {isUser ? '👤 أنت' : '🤖 ChatGPT'}
        </div>
        {content}
        {streaming && <span className="blink">▊</span>}
      </div>
    </div>
  );
}
