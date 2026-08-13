'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginContent() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/admin';

  useEffect(() => {
    fetch('/api/setup', { cache: 'no-store' }).then(r => r.json()).then(data => {
      setIsFirstRun(data.defaultPassword && !data.steps?.cookiePasted);
    }).catch(() => setIsFirstRun(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(redirect);
      } else {
        setError(data.error || 'كلمة المرور غير صحيحة');
      }
    } catch {
      setError('فشل الاتصال');
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 420, margin: '80px auto', padding: 20 }}>
      <div style={{
        backgroundColor: 'white', padding: 30, borderRadius: 16,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>{isFirstRun ? '🚀' : '🔐'}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>
            {isFirstRun ? 'أهلاً بك!' : 'تسجيل الدخول'}
          </h1>
          <p style={{ color: '#666', fontSize: 13, marginTop: 8, lineHeight: 1.7 }}>
            {isFirstRun
              ? 'اختر كلمة مرور للوحة الإدارة. ستُحفظ تلقائياً.'
              : 'أدخل كلمة المرور للوصول إلى لوحة الإدارة.'}
          </p>
        </div>

        {isFirstRun && (
          <div style={{
            padding: 12, backgroundColor: '#dcfce7', border: '1px solid #bbf7d0',
            borderRadius: 8, fontSize: 12, color: '#166534', marginBottom: 16, lineHeight: 1.8,
          }}>
            ✅ كل شيء يعمل تلقائياً:
            <ol style={{ paddingRight: 18, marginTop: 5 }}>
              <li>اكتب كلمة مرور جديدة</li>
              <li>الصق كوكيز ChatGPT (استخدم أداة الاستيراد)</li>
              <li>اضغط "تحديث Access Token"</li>
              <li>ارجع للصفحة الرئيسية وابدأ!</li>
            </ol>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            type="password" autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isFirstRun ? 'اختر كلمة مرور (4 أحرف على الأقل)' : 'كلمة المرور'}
            style={{
              width: '100%', padding: 12, margin: '8px 0 16px', borderRadius: 8,
              border: '1px solid #d1d5db', fontSize: 15, outline: 'none',
            }}
            required
          />
          <button
            type="submit" disabled={loading || password.length < 4}
            style={{
              width: '100%', padding: 12,
              backgroundColor: loading || password.length < 4 ? '#9ca3af' : '#0070f3',
              color: 'white', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 600,
              cursor: loading || password.length < 4 ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '⏳ ...' : isFirstRun ? '🚀 إنشاء ومتابعة' : 'دخول'}
          </button>
          {error && <p style={{ color: '#dc2626', marginTop: 10, fontSize: 14, textAlign: 'center' }}>{error}</p>}
        </form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <a href="/" style={{ fontSize: 13, color: '#0070f3', textDecoration: 'none' }}>← العودة للواجهة</a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 15, color: '#666' }}>جاري التحميل...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
