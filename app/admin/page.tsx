'use client';

import { useEffect, useState } from 'react';

interface Settings {
  sessionCookie: string;
  accessToken?: string;
  apiAccessKey?: string;
  defaultModel: string;
  rateLimitMaxRequests: number;
  rateLimitWindow: string;
}

interface StatusInfo {
  kvConnected: boolean;
  kvPingOk: boolean;
  backend?: string;
  backendInfo?: string;
  redisSource?: string;
  kvEnvConfigured?: boolean;
  hasSessionCookie: boolean;
  hasAccessToken: boolean;
  hasApiKey: boolean;
  cookieValid: boolean;
  cookieCount: number;
  jwt?: {
    source: 'env' | 'database' | 'fallback';
    effective: boolean;
    hint: string;
  };
  envVars: {
    hasJwtSecretEnv: boolean;
    hasAdminPassword: boolean;
    hasCronSecret: boolean;
    hasKvEnv: boolean;
  };
}

export default function AdminPage() {
  const [settings, setSettings] = useState<Settings>({
    sessionCookie: '',
    accessToken: '',
    apiAccessKey: '',
    defaultModel: 'gpt-4o',
    rateLimitMaxRequests: 20,
    rateLimitWindow: '1 m',
  });
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [checkingToken, setCheckingToken] = useState(false);
  const [testingCookie, setTestingCookie] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  const [cookieWarnings, setCookieWarnings] = useState<string[]>([]);
  const [cookiePreview, setCookiePreview] = useState<{ count: number; names: string[] } | null>(null);
  const [showCookieHelper, setShowCookieHelper] = useState(false);

  const showMsg = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage(msg);
    setMessageType(type);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/admin/status'),
      ]);
      if (!settingsRes.ok) throw new Error('Unauthorized');
      const settingsData = await settingsRes.json();
      setSettings(settingsData);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }
    } catch {
      showMsg('فشل تحميل الإعدادات أو انتهت الجلسة', 'error');
    }
  };

  // ─── استيراد الكوكيز ───────────────────────────────
  const handleCookieInputChange = (value: string) => {
    setCookieInput(value);
    parseAndPreview(value);
  };

  const parseAndPreview = (text: string) => {
    if (!text.trim()) {
      setCookiePreview(null);
      setCookieWarnings([]);
      return;
    }
    try {
      const cookieObj: Record<string, string> = {};
      let parsed = false;

      if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
        try {
          const data = JSON.parse(text);
          const arr = Array.isArray(data) ? data : [data];
          for (const c of arr) {
            if (c?.name && c.value !== undefined) cookieObj[c.name] = String(c.value);
          }
          parsed = arr.length > 0;
        } catch {}
      }
      if (!parsed) {
        const segments = text.includes('\n') ? text.split(/\r?\n/) : text.split(';');
        for (const seg of segments) {
          const m = seg.match(/^\s*([^=;]+?)\s*[=:]\s*(.*?)\s*;?\s*$/);
          if (m) {
            const name = m[1].trim();
            let val = m[2].trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (name && val && !name.startsWith('//') && !name.startsWith('#')) cookieObj[name] = val;
          }
        }
      }

      const names = Object.keys(cookieObj);
      setCookiePreview({ count: names.length, names });

      const hasSession = names.some(n => n.includes('session-token'));
      const hasOaiIs = names.some(n => n.includes('oai-is'));
      const hasCf = names.some(n => n.startsWith('__cf') || n === '_cfuvid' || n === '__cflb');
      const hasOaiLb = names.some(n => n === '__oailb');
      const hasCsrf = names.some(n => n.includes('csrf'));

      const w: string[] = [];
      if (!hasSession) w.push('❌ لا يوجد `session-token` - الكوكيز غير كافية');
      else w.push('✅ تم العثور على session-token');
      if (!hasOaiIs) w.push('⚠️ لا يوجد `__Secure-oai-is`');
      else w.push('✅ تم العثور على __Secure-oai-is');
      if (!hasCf) w.push('⚠️ لا توجد كوكيز Cloudflare');
      else w.push('✅ تم العثور على كوكيز Cloudflare');
      if (!hasOaiLb) w.push('⚠️ لا يوجد `__oailb`');
      else w.push('✅ تم العثور على __oailb');
      if (!hasCsrf) w.push('⚠️ لا يوجد CSRF token');
      else w.push('✅ تم العثور على CSRF token');
      setCookieWarnings(w);
    } catch {
      setCookieWarnings(['❌ خطأ في تحليل النص']);
      setCookiePreview(null);
    }
  };

  const applyCookies = () => {
    if (!cookiePreview || cookiePreview.count === 0) {
      showMsg('لا توجد كوكيز لاستيرادها', 'error');
      return;
    }
    let cookieObj: Record<string, string> = {};
    if (cookieInput.trim().startsWith('[') || cookieInput.trim().startsWith('{')) {
      const data = JSON.parse(cookieInput);
      const arr = Array.isArray(data) ? data : [data];
      for (const c of arr) if (c?.name && c.value !== undefined) cookieObj[c.name] = String(c.value);
    } else {
      const segments = cookieInput.includes('\n') ? cookieInput.split(/\r?\n/) : cookieInput.split(';');
      for (const seg of segments) {
        const m = seg.match(/^\s*([^=;]+?)\s*=\s*(.*?)\s*;?\s*$/);
        if (m) {
          const name = m[1].trim();
          let val = m[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
          if (name && val) cookieObj[name] = val;
        }
      }
    }
    const cookieHeader = Object.entries(cookieObj).map(([k, v]) => `${k}=${v}`).join('; ');
    setSettings(prev => ({ ...prev, sessionCookie: cookieHeader }));
    showMsg(`✅ تم استيراد ${cookiePreview.count} كوكي! اضغط "حفظ" ثم "تحديث Access Token".`, 'success');
    setCookieInput('');
    setCookiePreview(null);
    setCookieWarnings([]);
    setShowCookieHelper(false);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    showMsg('جاري الحفظ...', 'info');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, newAdminPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        let msg = '✅ تم الحفظ بنجاح';
        if (data.storage) msg += ` — التخزين: ${data.storage.ok ? '🟢' : '🔴'} ${data.storage.info}`;
        showMsg(msg, 'success');
        setNewAdminPassword('');
        loadData();
      } else {
        showMsg('❌ ' + (data.error || 'خطأ أثناء الحفظ'), 'error');
      }
    } catch {
      showMsg('❌ فشل الاتصال', 'error');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const handleTestCookie = async () => {
    setTestingCookie(true);
    showMsg('🩺 جاري فحص صلاحية الكوكيز...', 'info');
    try {
      const res = await fetch('/api/admin/cookie-health');
      const data = await res.json();
      if (res.ok) {
        if (data.ok) {
          showMsg('✅ الكوكيز صالحة! الجلسة تعمل بشكل سليم.', 'success');
        } else {
          const issues = data.issues?.slice(0, 3).join(' | ') || '';
          showMsg('❌ مشكلة في الكوكيز: ' + issues, 'error');
        }
      } else {
        showMsg('❌ فشل فحص الكوكيز', 'error');
      }
    } catch {
      showMsg('❌ فشل الاتصال', 'error');
    }
    setTestingCookie(false);
    loadData();
  };

  const handleRefreshToken = async () => {
    setCheckingToken(true);
    showMsg('جاري تحديث التوكن...', 'info');
    try {
      const res = await fetch('/api/session', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showMsg('✅ تم تحديث Access Token بنجاح!', 'success');
        loadData();
      } else {
        showMsg('❌ فشل تحديث التوكن - تأكد من الكوكيز', 'error');
      }
    } catch {
      showMsg('❌ فشل الاتصال', 'error');
    }
    setCheckingToken(false);
  };

  const msgColor = messageType === 'success' ? '#16a34a' : messageType === 'error' ? '#dc2626' : '#2563eb';

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', padding: 20 }}>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: none; } }
      `}</style>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 20, backgroundColor: 'white', padding: 20, borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a' }}>⚙️ لوحة الإدارة</h1>
          <p style={{ fontSize: 13, color: '#666', marginTop: 4 }}>أكمل الإعداد في ثلاث خطوات بسيطة 👇</p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: '8px 16px', backgroundColor: '#fef2f2', color: '#dc2626',
            border: '1px solid #fecaca', borderRadius: 8, fontSize: 14, fontWeight: 500,
          }}
        >
          🚪 خروج
        </button>
      </div>

      {/* Setup progress */}
      {status && (
        <div style={{
          backgroundColor: 'white', padding: 16, borderRadius: 12, marginBottom: 16,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: '#1a1a1a' }}>📋 التقدم</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <ChecklistItem done={!status.envVars.hasAdminPassword ? true : true} label="كلمة مرور الإدارة" always={true} />
            <ChecklistItem done={status.hasSessionCookie && status.cookieValid} label="كوكيز ChatGPT صالحة" />
            <ChecklistItem done={status.hasAccessToken} label="Access Token محدّث" />
            <ChecklistItem done={status.backend !== 'memory'} label="قاعدة بيانات دائمة (اختياري)" optional />
          </div>
        </div>
      )}

      {/* Status Dashboard */}
      {status && (
        <div style={{
          backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 15, color: '#1a1a1a' }}>📊 حالة النظام</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <StatusCard
              ok={status.kvPingOk && status.backend !== 'memory'}
              warn={status.kvPingOk && status.backend === 'memory'}
              icon={status.kvPingOk && status.backend !== 'memory' ? '🟢' : status.backend === 'memory' ? '🟡' : '🔴'}
              title="قاعدة البيانات"
              okText={status.backendInfo || 'متصلة'}
              warnText="ذاكرة (غير دائم)"
            />
            <StatusCard
              ok={status.hasSessionCookie && status.cookieValid}
              warn={status.hasSessionCookie && !status.cookieValid}
              icon={status.hasSessionCookie ? (status.cookieValid ? '🟢' : '🟡') : '🔴'}
              title="كوكي الجلسة"
              okText={status.cookieCount ? `${status.cookieCount} كوكي` : 'جاهز'}
              warnText={status.hasSessionCookie ? 'مراجعة' : 'غير مضبوط'}
            />
            <StatusCard
              ok={status.hasAccessToken}
              icon={status.hasAccessToken ? '🟢' : '🟡'}
              title="Access Token"
              okText="جاهز"
              warnText="سيتم توليده"
            />
            <StatusCard
              ok={!!(status.jwt?.effective)}
              icon={status.jwt?.effective ? '🟢' : '🔴'}
              title="JWT Secret"
              okText={status.jwt?.source === 'env' ? 'من البيئة (آمن)' : 'مولّد تلقائياً'}
              warnText="يجب ضبطه"
            />
          </div>

          {/* Storage Warning */}
          {status.backend === 'memory' && (
            <div style={{
              marginTop: 12, padding: 14, backgroundColor: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 8, fontSize: 13, lineHeight: 1.7,
            }}>
              <div style={{ fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
                ⚠️ التخزين الحالي: الذاكرة (غير دائم)
              </div>
              <p style={{ color: '#78350f' }}>
                الإعدادات ستفقد عند إعادة التشغيل. لحفظ دائم (مجاني):
              </p>
              <ol style={{ marginTop: 6, paddingRight: 20, color: '#78350f' }}>
                <li>Vercel → مشروعك → تبويب <b>Storage</b> (في الأعلى)</li>
                <li><b>Create Database</b> → اختر <b>Upstash Redis</b> (Free tier)</li>
                <li>اضغط Create ثم اربط بالمشروع</li>
                <li>اضغط <b>Redeploy</b> — ستُضاف المتغيرات تلقائياً!</li>
              </ol>
            </div>
          )}

          {/* JWT status */}
          {status.jwt?.source === 'env' && (
            <div style={{
              marginTop: 10, padding: 10, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, fontSize: 12, color: '#166534',
            }}>
              ✅ JWT_SECRET مُضبوط من متغير البيئة (آمن).
            </div>
          )}
          {status.jwt?.source === 'database' && (
            <div style={{
              marginTop: 10, padding: 10, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 8, fontSize: 12, color: '#1e40af',
            }}>
              ℹ️ تم توليد JWT_SECRET تلقائياً وحفظه في قاعدة البيانات.
            </div>
          )}

          {status.hasSessionCookie && !status.cookieValid && (
            <div style={{
              marginTop: 10, padding: 10, backgroundColor: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 8, fontSize: 12, color: '#92400e',
            }}>
              🍪 الكوكيز الحالية لا تحتوي على session-token - استخدم أداة الاستيراد أدناه.
            </div>
          )}
        </div>
      )}

      {message && (
        <div style={{
          padding: 12, marginBottom: 15, borderRadius: 8, backgroundColor: msgColor + '15',
          border: '1px solid ' + msgColor + '40', color: msgColor, fontSize: 14,
        }}>
          {message}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} style={{
        backgroundColor: 'white', padding: 20, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: '#1a1a1a' }}>🔧 الإعدادات</h2>

        {/* Cookies */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontWeight: 500, fontSize: 14 }}>🍪 كوكيز ChatGPT</label>
            <button
              type="button" onClick={() => setShowCookieHelper(!showCookieHelper)}
              style={{
                padding: '5px 12px', fontSize: 12, backgroundColor: '#eff6ff', color: '#2563eb',
                border: '1px solid #bfdbfe', borderRadius: 6,
              }}
            >
              {showCookieHelper ? '− إخفاء أداة الاستيراد' : '📥 استيراد سريع'}
            </button>
          </div>

          {showCookieHelper && (
            <div style={{
              padding: 16, backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, marginBottom: 12,
            }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#075985', marginBottom: 10 }}>🚀 استيراد سريع للكوكيز</h4>
              <p style={{ fontSize: 12, color: '#0c4a6e', marginBottom: 10, lineHeight: 1.7 }}>
                الطريقة الأسرع: ثبّت إضافة{' '}
                <a href="https://chromewebstore.google.com/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg" target="_blank" rel="noopener" style={{ color: '#2563eb' }}>EditThisCookie</a>
                {' '}على Chrome، ثم ادخل chatgpt.com، اضغط الأيقونة → Export، والصق هنا.
              </p>
              <textarea
                value={cookieInput}
                onChange={(e) => handleCookieInputChange(e.target.value)}
                rows={6}
                placeholder="الصق الكوكيز هنا (JSON أو نص)..."
                dir="ltr"
                style={{
                  width: '100%', padding: 10, borderRadius: 8, border: '1px solid #bae6fd',
                  fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none', backgroundColor: 'white',
                }}
              />
              {cookiePreview && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#075985', marginBottom: 6 }}>
                    تم التعرف على {cookiePreview.count} كوكي
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                    {cookiePreview.names.slice(0, 25).map(n => (
                      <span key={n} style={{
                        fontSize: 11, padding: '2px 8px',
                        backgroundColor: n.includes('session-token') ? '#dcfce7' : n.includes('cf') ? '#fef3c7' : '#e0f2fe',
                        color: '#1e293b', borderRadius: 4, fontFamily: 'monospace',
                      }}>{n}</span>
                    ))}
                    {cookiePreview.names.length > 25 && <span style={{ fontSize: 11, color: '#64748b' }}>+{cookiePreview.names.length - 25}</span>}
                  </div>
                  {cookieWarnings.length > 0 && (
                    <div style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.8 }}>
                      {cookieWarnings.map((w, i) => (
                        <div key={i} style={{
                          color: w.startsWith('✅') ? '#16a34a' : w.startsWith('❌') ? '#dc2626' : '#d97706',
                        }}>{w}</div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button" onClick={applyCookies}
                    disabled={cookieWarnings.some(w => w.startsWith('❌ لم'))}
                    style={{
                      padding: '8px 18px',
                      backgroundColor: cookieWarnings.some(w => w.startsWith('❌ لم')) ? '#9ca3af' : '#2563eb',
                      color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
                      cursor: cookieWarnings.some(w => w.startsWith('❌ لم')) ? 'not-allowed' : 'pointer',
                    }}
                  >✓ تطبيق الكوكيز</button>
                </div>
              )}
            </div>
          )}

          <textarea
            name="sessionCookie"
            value={settings.sessionCookie}
            onChange={handleChange}
            rows={3}
            placeholder="سيتم ملء هذا الحقل من أداة الاستيراد، أو الصق Cookie header يدوياً..."
            dir="ltr"
            style={{
              width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none',
            }}
          />
          {status && settings.sessionCookie && (
            <p style={{ fontSize: 12, color: status.cookieValid ? '#16a34a' : '#d97706', marginTop: 4 }}>
              {status.cookieCount} كوكي في السلسلة {status.cookieValid ? '✅' : '⚠️'}
            </p>
          )}
        </div>

        {/* Access Token */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>🎫 Access Token</label>
          <textarea
            name="accessToken"
            value={settings.accessToken || ''}
            onChange={handleChange}
            rows={1}
            placeholder="سيتم توليده تلقائياً"
            dir="ltr"
            style={{
              width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db',
              fontSize: 12, fontFamily: 'monospace', resize: 'vertical', outline: 'none',
            }}
          />
          <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            لا داعي لإدخاله يدوياً - اضغط "تحديث Access Token" بعد حفظ الكوكيز.
          </p>
        </div>

        {/* API Key */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>🔑 مفتاح API (اختياري)</label>
          <input
            type="text" name="apiAccessKey" value={settings.apiAccessKey || ''}
            onChange={handleChange} placeholder="اتركه فارغاً للسماح للجميع"
            dir="ltr"
            style={{
              width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none',
            }}
          />
          <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            إذا ضبطته، يجب إرسال Header <code style={{ fontSize: 11 }}>x-api-key</code> مع كل طلب.
          </p>
        </div>

        {/* Model & Rate limit */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 15, marginBottom: 18 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>🤖 النموذج الافتراضي</label>
            <select
              name="defaultModel" value={settings.defaultModel} onChange={handleChange}
              style={{
                width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db',
                fontSize: 14, outline: 'none', backgroundColor: 'white',
              }}
            >
              <option value="gpt-4o">GPT-4o (الأحدث)</option>
              <option value="gpt-4o-mini">GPT-4o Mini (سريع)</option>
              <option value="gpt-4">GPT-4</option>
              <option value="o1">O1 (التفكير العميق)</option>
              <option value="text-davinci-002-render-sha">GPT-3.5 Legacy</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>⏱ الطلبات/الدقيقة</label>
            <input
              type="number" name="rateLimitMaxRequests" value={settings.rateLimitMaxRequests}
              onChange={handleChange} min={1}
              style={{
                width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Admin Password */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 14 }}>🔒 كلمة مرور جديدة للإدارة</label>
          <input
            type="password" value={newAdminPassword}
            onChange={(e) => setNewAdminPassword(e.target.value)}
            placeholder="اتركها فارغة لعدم التغيير"
            style={{
              width: '100%', padding: 10, borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none',
            }}
          />
          <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            كلمة المرور الافتراضية عند أول استخدام: <code style={{ background: '#f3f4f6', padding: '1px 5px', borderRadius: 3 }}>admin</code>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" style={{
            padding: '10px 24px', backgroundColor: '#0070f3', color: 'white', border: 'none',
            borderRadius: 8, fontSize: 15, fontWeight: 600,
          }}>💾 حفظ الإعدادات</button>
          <button
            type="button" onClick={handleRefreshToken} disabled={checkingToken}
            style={{
              padding: '10px 20px', backgroundColor: checkingToken ? '#9ca3af' : '#16a34a',
              color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
              cursor: checkingToken ? 'not-allowed' : 'pointer',
            }}
          >{checkingToken ? '⏳ جاري...' : '🔄 تحديث Access Token'}</button>
          <button
            type="button" onClick={handleTestCookie} disabled={testingCookie}
            style={{
              padding: '10px 20px', backgroundColor: testingCookie ? '#9ca3af' : '#f59e0b',
              color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
              cursor: testingCookie ? 'not-allowed' : 'pointer',
            }}
          >{testingCookie ? '⏳ ...' : '🩺 فحص الكوكيز'}</button>
          <a href="/" style={{
            padding: '10px 20px', backgroundColor: '#f3f4f6', color: '#333', border: '1px solid #d1d5db',
            borderRadius: 8, fontSize: 15, textDecoration: 'none', display: 'inline-block',
          }}>← الواجهة</a>
        </div>
      </form>

      {/* Tips */}
      <div style={{
        marginTop: 20, padding: 16, backgroundColor: '#f9fafb', borderRadius: 12,
        fontSize: 13, color: '#666', lineHeight: 1.9,
      }}>
        <h3 style={{ fontWeight: 600, color: '#333', marginBottom: 8 }}>💡 نصائح:</h3>
        <ul style={{ paddingRight: 18 }}>
          <li><b>JWT_SECRET ليس إجبارياً</b> — سيُولّد تلقائياً في أول تشغيل. لكن يُفضّل وضعه يدوياً في Vercel Environment Variables لضمان الثبات.</li>
          <li>استخدم أداة <b>الاستيراد السريع</b> لإدخال الكوكيز من Chrome بضغطة زر.</li>
          <li>كلمة المرور الافتراضية: <code style={{ background: '#e5e7eb', padding: '2px 6px', borderRadius: 4 }}>admin</code> — غيّرها فوراً.</li>
          <li>لحفظ دائم للإعدادات، اربط <b>Upstash Redis</b> من Vercel Storage (مجاني).</li>
          <li>للتحديث التلقائي للتوكن كل 6 ساعات، استخدم Namecheap Cron (انظر CRON_SETUP.md).</li>
        </ul>
      </div>
    </div>
  );
}

function StatusCard({
  ok, warn, icon, title, okText, warnText,
}: {
  ok: boolean; warn?: boolean; icon: string; title: string; okText: string; warnText: string;
}) {
  const bg = ok ? '#f0fdf4' : warn ? '#fffbeb' : '#fef2f2';
  const border = ok ? '#bbf7d0' : warn ? '#fde68a' : '#fecaca';
  const text = ok ? '#166534' : warn ? '#92400e' : '#991b1b';
  return (
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${border}`, backgroundColor: bg }}>
      <div style={{ fontSize: 20 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4, color: text }}>{title}</div>
      <div style={{ fontSize: 12, color: text, opacity: 0.85, marginTop: 2 }}>{ok ? okText : warnText}</div>
    </div>
  );
}

function ChecklistItem({ done, label, optional, always }: { done: boolean; label: string; optional?: boolean; always?: boolean }) {
  const bg = done ? '#f0fdf4' : optional ? '#f9fafb' : '#fef2f2';
  const border = done ? '#bbf7d0' : optional ? '#e5e7eb' : '#fecaca';
  const check = done ? '✅' : optional ? '⚪' : '⬜';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      borderRadius: 8, backgroundColor: bg, border: `1px solid ${border}`,
      fontSize: 13, color: done ? '#166534' : optional ? '#6b7280' : '#991b1b',
    }}>
      <span style={{ fontSize: 16 }}>{always ? '👤' : check}</span>
      <span>{label}</span>
      {optional && <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 'auto' }}>(اختياري)</span>}
    </div>
  );
}
