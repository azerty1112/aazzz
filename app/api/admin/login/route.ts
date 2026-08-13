import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminPassword } from '@/lib/settings';
import { signAdminToken, isFirstRun, setFirstRunComplete, bcrypt } from '@/lib/auth';
import { updateSettings } from '@/lib/settings';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (!password) return NextResponse.json({ error: 'كلمة المرور مطلوبة' }, { status: 400 });

  let isValid = false;

  // أول تشغيل: اقبل أي كلمة مرور، واحفظها تلقائياً
  if (await isFirstRun()) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    await updateSettings({ adminPasswordHash: hash });
    await setFirstRunComplete();
    isValid = true;
  } else {
    isValid = await verifyAdminPassword(password);
  }

  if (!isValid) return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 });

  const token = await signAdminToken();
  const response = NextResponse.json({ success: true, firstRun: await isFirstRun() === false });
  response.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return response;
}
