'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginInner() {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [first, setFirst] = useState<boolean|null>(null);
  const router = useRouter();
  const sp = useSearchParams();
  const redirect = sp.get('redirect') || '/admin';

  useEffect(() => {
    fetch('/api/setup',{cache:'no-store'}).then(r=>r.json()).then(d=>setFirst(d.defaultPassword)).catch(()=>setFirst(false));
  },[]);

  async function submit(e:React.FormEvent) {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const r = await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
      const d = await r.json();
      if (r.ok) router.push(redirect);
      else setErr(d.error||'خطأ');
    } catch { setErr('فشل الاتصال'); }
    setLoading(false);
  }

  return (
    <div style={{maxWidth:400,margin:'80px auto',padding:20}}>
      <div style={{background:'white',padding:28,borderRadius:14,boxShadow:'0 4px 20px rgba(0,0,0,0.07)'}}>
        <div style={{textAlign:'center',marginBottom:16}}>
          <div style={{fontSize:40,marginBottom:6}}>{first?'🚀':'🔐'}</div>
          <h1 style={{fontSize:20,fontWeight:700}}>{first?'مرحباً!':'تسجيل الدخول'}</h1>
          <p style={{color:'#666',fontSize:13,marginTop:6}}>{first?'اختر كلمة مرور للوحة الإدارة':'أدخل كلمة المرور'}</p>
        </div>
        <form onSubmit={submit}>
          <input type="password" autoFocus value={password} onChange={e=>setPassword(e.target.value)}
            placeholder={first?'كلمة المرور الجديدة (4 أحرف+)':'كلمة المرور'}
            style={{width:'100%',padding:11,margin:'8px 0 14px',borderRadius:8,border:'1px solid #d1d5db',fontSize:15,outline:'none'}} required minLength={4}/>
          <button type="submit" disabled={loading||password.length<4} style={{
            width:'100%',padding:11,background:loading||password.length<4?'#9ca3af':'#0070f3',color:'white',
            border:'none',borderRadius:8,fontSize:15,fontWeight:600,cursor:loading||password.length<4?'not-allowed':'pointer'
          }}>{loading?'⏳...':first?'🚀 ابدأ':'دخول'}</button>
          {err && <p style={{color:'#dc2626',marginTop:10,textAlign:'center',fontSize:13}}>{err}</p>}
        </form>
        <div style={{textAlign:'center',marginTop:14}}>
          <a href="/" style={{fontSize:13,color:'#0070f3',textDecoration:'none'}}>← الواجهة الرئيسية</a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div style={{minHeight:'100vh',display:'grid',placeItems:'center',color:'#666'}}>جاري التحميل...</div>}><LoginInner/></Suspense>;
}
