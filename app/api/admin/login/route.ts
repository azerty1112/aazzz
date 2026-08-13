import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword } from '@/lib/settings';
import { signAdminToken, isFirstRun, setFirstRunDone, bcrypt } from '@/lib/auth';
import { updateSettings } from '@/lib/settings';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (!password) return NextResponse.json({ error: 'كلمة المرور مطلوبة' }, { status: 400 });

  let valid = false;
  const firstRun = await isFirstRun();

  if (firstRun) {
    // أول تشغيل - احفظ كلمة المرور هذه
    if (password.length < 4) return NextResponse.json({ error: 'كلمة المرور قصيرة جداً' }, { status: 400 });
    const hash = await bcrypt.hash(password, 10);
    await updateSettings({ adminPasswordHash: hash });
    await setFirstRunDone();
    valid = true;
  } else {
    valid = await verifyAdminPassword(password);
  }

  if (!valid) return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 });

  const token = await signAdminToken();
  const res = NextResponse.json({ success: true, firstRun });
  res.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 3600,
  });
  return res;
}
