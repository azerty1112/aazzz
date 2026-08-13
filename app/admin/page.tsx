'use client';

import { useState, useEffect } from 'react';

interface Settings {
  sessionCookie: string;
  hasAccessToken?: boolean;
  apiAccessKey?: string;
  defaultModel: string;
  supabaseUrl?: string;
  hasSupabaseKey?: boolean;
}

interface Status {
  kvPingOk: boolean;
  backend?: string;
  backendInfo?: string;
  hasSessionCookie: boolean;
  cookieValid: boolean;
  cookieCount: number;
  hasAccessToken: boolean;
  tokenFresh?: boolean;
  jwt?: { source: string; effective: boolean; hint: string };
  hasSupabase?: boolean;
  supabaseUrlConfigured?: boolean;
  supabaseKeyConfigured?: boolean;
}

export default function AdminPage() {
  const [settings, setSettings] = useState<Settings>({
    sessionCookie: '',
    apiAccessKey: '',
    defaultModel: 'gpt-4o',
    supabaseUrl: '',
  });
  const [supabaseKeyInput, setSupabaseKeyInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error' | 'info'>('info');
  const [status, setStatus] = useState<Status | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cookieText, setCookieText] = useState('');
  const [cookiePreview, setCookiePreview] = useState<{ count: number; names: string[] } | null>(null);
  const [cookieWarnings, setCookieWarnings] = useState<string[]>([]);
  const [showHelper, setShowHelper] = useState(false);
  const [showSupabase, setShowSupabase] = useState(false);

  const show = (m: string, t: 'success' | 'error' | 'info' = 'info') => {
    setMsg(m);
    setMsgType(t);
  };

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/admin/status'),
      ]);
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch {}
  };

  const parseCookie = (text: string) => {
    if (!text.trim()) { setCookiePreview(null); setCookieWarnings([]); return; }
    const obj: Record<string, string> = {};
    let parsed = false;

    if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
      try {
        const data = JSON.parse(text);
        const arr = Array.isArray(data) ? data : [data];
        for (const c of arr) {
          if (c?.name && c.value !== undefined) obj[c.name] = String(c.value);
        }
        parsed = arr.length > 0;
      } catch {}
    }

    if (!parsed) {
      // محاولة Parse كسلسلة Cookie header
      const segs = text.includes('\n')
        ? text.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        : text.split(';');
      for (const seg of segs) {
        // Netscape format?
        const tabParts = seg.split('\t');
        if (tabParts.length >= 7) {
          const name = tabParts[5];
          const val = tabParts[6];
          if (name && val) obj[name] = val;
          continue;
        }
        const m = seg.match(/^\s*([^=;]+?)\s*[=:]\s*(.*?)\s*;?\s*$/);
        if (m) {
          let v = m[2].trim();
          const n = m[1].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
          if (n && v) obj[n] = v;
        }
      }
    }

    const names = Object.keys(obj);
    setCookiePreview({ count: names.length, names });
    const warnings: string[] = [];
    const hasSession = names.some(n => n.includes('session-token'));
    const hasCf = names.some(n => n.startsWith('__cf') || n === '_cfuvid');
    const hasAuth = names.some(n => n.startsWith('_auth') || n.includes('auth'));
    if (!hasSession) warnings.push('❌ لا يوجد session-token');
    else warnings.push('✅ session-token موجود');
    if (!hasCf) warnings.push('⚠️ لا توجد كوكيز Cloudflare (قد تُحظر من Cloudflare)');
    else warnings.push('✅ كوكيز Cloudflare موجودة');
    if (hasAuth) warnings.push('✅ كوكيز المصادقة موجودة');
    setCookieWarnings(warnings);
  };

  const applyCookies = () => {
    if (!cookiePreview?.count) return;
    const obj: Record<string, string> = {};
    if (cookieText.trim().startsWith('[') || cookieText.trim().startsWith('{')) {
      try {
        const data = JSON.parse(cookieText);
        const arr = Array.isArray(data) ? data : [data];
        for (const c of arr) if (c?.name && c.value !== undefined) obj[c.name] = String(c.value);
      } catch {}
    } else {
      const segs = cookieText.includes('\n')
        ? cookieText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        : cookieText.split(';');
      for (const seg of segs) {
        const tabParts = seg.split('\t');
        if (tabParts.length >= 7) { obj[tabParts[5]] = tabParts[6]; continue; }
        const m = seg.match(/^\s*([^=;]+?)\s*=\s*(.*?)\s*;?\s*$/);
        if (m) {
          let v = m[2].trim();
          if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
          obj[m[1].trim()] = v;
        }
      }
    }
    // ترتيب الكوكيز: نحافظ عليها كما هي
    const cookieStr = Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('; ');
    setSettings(p => ({ ...p, sessionCookie: cookieStr }));
    show(`✅ تم استيراد ${cookiePreview.count} كوكي. اضغط حفظ ثم سيتم تحديث التوكن تلقائياً.`, 'success');
    setCookieText(''); setCookiePreview(null); setCookieWarnings([]); setShowHelper(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettings(p => ({ ...p, [name]: value }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    show('جاري الحفظ...', 'info');
    try {
      const body: any = { ...settings };
      if (supabaseKeyInput.trim()) body.supabaseKey = supabaseKeyInput.trim();
      if (newPassword) body.newAdminPassword = newPassword;
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        let msg = '✅ تم الحفظ بنجاح';
        if (data.autoRefreshed) msg += ' وتم تحديث التوكن تلقائياً';
        else if (body.sessionCookie) msg += ' (فشل تحديث التوكن - اضغط تحديث التوكن)';
        if (data.storage?.backend === 'supabase') msg += ' - متصل بـ Supabase 🟢';
        show(msg, 'success');
        setNewPassword('');
        setSupabaseKeyInput('');
        await load();
      } else {
        show('❌ ' + (data.error || 'خطأ'), 'error');
      }
    } catch {
      show('❌ فشل الاتصال', 'error');
    }
    setSaving(false);
  };

  const refreshToken = async () => {
    setRefreshing(true);
    show('جاري تحديث التوكن...', 'info');
    try {
      const res = await fetch('/api/session', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        show('✅ تم تحديث التوكن بنجاح - يمكنك البدء في المحادثة', 'success');
        load();
      } else {
        show('❌ فشل - تأكد من صحة الكوكيز وأن الجلسة لم تنتهِ', 'error');
      }
    } catch { show('❌ فشل الاتصال', 'error'); }
    setRefreshing(false);
  };

  const testCookies = async () => {
    setTesting(true);
    show('🩺 جاري فحص الكوكيز والتوكن...', 'info');
    try {
      const res = await fetch('/api/admin/status', { cache: 'no-store' });
      const data = await res.json();
      setStatus(data);
      if (data.tokenFresh) show('✅ الكوكيز والتوكن يعملان بشكل سليم', 'success');
      else if (data.hasSessionCookie) show('⚠️ الكوكيز موجودة لكن التوكن غير جاهز - اضغط تحديث التوكن', 'error');
      else show('❌ يجب إضافة الكوكيز أولاً', 'error');
    } catch { show('❌ فشل الفحص', 'error'); }
    setTesting(false);
  };

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const msgColor = msgType === 'success' ? '#16a34a' : msgType === 'error' ? '#dc2626' : '#2563eb';

  return (
    <div style={{ maxWidth: 820, margin: '20px auto', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: 16, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>⚙️ لوحة الإدارة</h1>
          <p style={{ fontSize: 12, color: '#666' }}>أضف الكوكيز، حدّث التوكن، وابدأ المحادثة</p>
        </div>
        <button onClick={logout} style={{ padding: '6px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 8, cursor: 'pointer' }}>خروج</button>
      </div>

      {status && (
        <div style={{ background: 'white', padding: 12, borderRadius: 12, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatusChip ok={status.tokenFresh || status.hasAccessToken} icon={status.tokenFresh || status.hasAccessToken ? '🟢' : '🔴'} label={status.tokenFresh ? 'التوكن فعّال' : status.hasAccessToken ? 'التوكن موجود' : 'لا توكن'} />
          <StatusChip ok={status.cookieValid} icon={status.cookieValid ? '🟢' : '🔴'} label={`كوكيز (${status.cookieCount})`} />
          <StatusChip ok={status.backend === 'supabase'} warn={status.backend === 'memory'} icon={status.backend === 'supabase' ? '🟢' : '🟡'} label={status.backendInfo || 'ذاكرة'} />
        </div>
      )}

      {msg && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, background: msgColor + '15', border: '1px solid ' + msgColor + '40', color: msgColor, fontSize: 14 }}>{msg}</div>
      )}

      <form onSubmit={save} style={{ background: 'white', padding: 18, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>🍪 كوكيز ChatGPT</h2>

        <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setShowHelper(!showHelper)}
            style={{ padding: '6px 14px', fontSize: 12, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer' }}>
            {showHelper ? '− إخفاء' : '📥 استيراد سريع (JSON)'}
          </button>
          <button type="button" onClick={refreshToken} disabled={refreshing}
            style={{ padding: '6px 14px', fontSize: 12, background: refreshing ? '#e5e7eb' : '#f0fdf4', color: refreshing ? '#666' : '#16a34a', border: '1px solid ' + (refreshing ? '#e5e7eb' : '#bbf7d0'), borderRadius: 6, cursor: refreshing ? 'wait' : 'pointer' }}>
            {refreshing ? '⏳ جاري التحديث...' : '🔄 تحديث التوكن يدوياً'}
          </button>
          <button type="button" onClick={testCookies} disabled={testing}
            style={{ padding: '6px 14px', fontSize: 12, background: testing ? '#e5e7eb' : '#fffbeb', color: testing ? '#666' : '#d97706', border: '1px solid ' + (testing ? '#e5e7eb' : '#fde68a'), borderRadius: 6, cursor: testing ? 'wait' : 'pointer' }}>
            {testing ? '⏳' : '🩺 فحص الكوكيز'}
          </button>
        </div>

        {showHelper && (
          <div style={{ padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, marginBottom: 10, fontSize: 12, color: '#0c4a6e', lineHeight: 1.8 }}>
            <b>الطريقة الأسهل:</b> ثبّت إضافة <b>EditThisCookie</b> أو <b>Export cookie JSON</b> على Chrome، سجّل دخولك إلى <code>chatgpt.com</code>، اضغط Export، والصق الناتج هنا:
            <textarea value={cookieText} onChange={e => { setCookieText(e.target.value); parseCookie(e.target.value); }}
              rows={6} dir="ltr" placeholder='الصق هنا JSON الكوكيز...'
              style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #bae6fd', fontFamily: 'monospace', fontSize: 11, marginTop: 6, outline: 'none', resize: 'vertical' }} />
            {cookiePreview && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, marginBottom: 4 }}>تم التعرف على {cookiePreview.count} كوكي:</div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                  {cookiePreview.names.slice(0, 30).map(n => (
                    <span key={n} style={{ fontSize: 10, padding: '1px 6px', background: n.includes('session') ? '#dcfce7' : n.includes('cf') ? '#fef3c7' : '#e0f2fe', borderRadius: 3, fontFamily: 'monospace' }}>{n}</span>
                  ))}
                </div>
                {cookieWarnings.map((w, i) => (
                  <div key={i} style={{ color: w.startsWith('✅') ? '#16a34a' : w.startsWith('❌') ? '#dc2626' : '#d97706', fontSize: 11 }}>{w}</div>
                ))}
                <button type="button" onClick={applyCookies}
                  disabled={cookieWarnings.some(w => w.startsWith('❌ لم'))}
                  style={{ marginTop: 6, padding: '6px 14px', background: cookieWarnings.some(w => w.startsWith('❌')) ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  تطبيق الكوكيز
                </button>
              </div>
            )}
          </div>
        )}

        <textarea name="sessionCookie" value={settings.sessionCookie} onChange={handleChange}
          rows={3} dir="ltr" placeholder="سيتم ملؤه تلقائياً من أداة الاستيراد، أو الصق يدوياً Cookie header هنا..."
          style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db', fontFamily: 'monospace', fontSize: 11, resize: 'vertical', outline: 'none' }} />
        <p style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
          {status?.cookieCount || 0} كوكي محفوظ {status?.hasAccessToken ? '| ✅ التوكن موجود' : '| ⚠️ لا يوجد توكن'}
        </p>

        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 14px' }}>🔧 إعدادات إضافية</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 500, fontSize: 13, marginBottom: 4 }}>🤖 النموذج الافتراضي</label>
            <select name="defaultModel" value={settings.defaultModel} onChange={handleChange}
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, background: 'white' }}>
              <option value="gpt-4o">⭐ GPT-4o (الأحدث)</option>
              <option value="gpt-4o-mini">⚡ GPT-4o Mini (سريع)</option>
              <option value="gpt-4">🧠 GPT-4</option>
              <option value="o1">🔬 O1 (تفكير عميق)</option>
              <option value="o3-mini">🧪 O3 Mini</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 500, fontSize: 13, marginBottom: 4 }}>🔑 مفتاح API للواجهة (اختياري)</label>
            <input type="text" name="apiAccessKey" value={settings.apiAccessKey || ''} onChange={handleChange}
              placeholder="لحماية الواجهة بكلمة سر"
              style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, outline: 'none' }} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontWeight: 500, fontSize: 13, marginBottom: 4 }}>🔒 كلمة مرور جديدة للإدارة</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            placeholder="اتركها فارغة لعدم التغيير"
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }} />
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '20px 0 10px', cursor: 'pointer' }} onClick={() => setShowSupabase(!showSupabase)}>
          🗄️ قاعدة البيانات (Supabase) — اختياري {showSupabase ? '▼' : '▶'}
        </h2>
        {showSupabase && (
          <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 14, fontSize: 12, lineHeight: 1.8, border: '1px solid #e5e7eb' }}>
            <p style={{ margin: '0 0 10px', color: '#666' }}>
              اربط Supabase مجاناً لحفظ الإعدادات والكوكيز عبر عمليات إعادة النشر. أنشئ جدول <code style={{background:'#e5e7eb', padding:'1px 4px', borderRadius:3}}>kv</code> كما في <code>SUPABASE_SETUP.md</code>.
              {' '}إذا تركتها فارغة، ستُحفظ البيانات في الذاكرة (تُفقد عند كل إعادة نشر).
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Supabase URL</label>
                <input type="text" name="supabaseUrl" value={settings.supabaseUrl || ''} onChange={handleChange} dir="ltr"
                  placeholder="https://xxx.supabase.co"
                  style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Service Role Key</label>
                <input type="password" value={supabaseKeyInput} onChange={e => setSupabaseKeyInput(e.target.value)} dir="ltr"
                  placeholder={settings.hasSupabaseKey ? '•••••••• (محفوظ - اتركها فارغة للإبقاء)' : 'eyJ...'}
                  style={{ width: '100%', padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: status?.kvPingOk ? '#16a34a' : '#d97706' }}>
              {status?.kvPingOk ? '🟢 متصل بقاعدة البيانات (' + status.backendInfo + ')' : '🟡 غير متصل (يستخدم الذاكرة حالياً)'}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving}
            style={{ padding: '9px 24px', background: saving ? '#9ca3af' : '#0070f3', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? '⏳ جاري الحفظ...' : '💾 حفظ كل الإعدادات'}
          </button>
          <a href="/" style={{ padding: '9px 16px', background: '#f3f4f6', color: '#333', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, textDecoration: 'none' }}>
            ← الذهاب للمحادثة
          </a>
        </div>
      </form>

      <div style={{ marginTop: 14, padding: 12, background: '#f9fafb', borderRadius: 10, fontSize: 12, color: '#6b7280', lineHeight: 1.8 }}>
        💡 <b>نصيحة:</b> لتحديث يومي تلقائي للتوكن، استخدم Namecheap cPanel Cron Job لاستدعاء:
        <br/>
        <code dir="ltr" style={{background:'#e5e7eb', padding:3, borderRadius:3, fontSize: 11}}>GET {typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'}/api/cron/refresh?secret=CRON_SECRET</code>
      </div>
    </div>
  );
}

function StatusChip({ ok, warn, icon, label }: { ok: boolean; warn?: boolean; icon: string; label: string }) {
  const bg = ok ? '#f0fdf4' : warn ? '#fffbeb' : '#fef2f2';
  const bd = ok ? '#bbf7d0' : warn ? '#fde68a' : '#fecaca';
  const cl = ok ? '#166534' : warn ? '#92400e' : '#991b1b';
  return <div style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${bd}`, background: bg, fontSize: 11, color: cl }}>{icon} {label}</div>;
}
