import { NextResponse } from 'next/server';
import { refreshAccessToken, getAccessToken, invalidateToken } from '@/lib/chatgpt';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  const token = await getAccessToken();
  return NextResponse.json({
    hasToken: !!token,
    hasCookie: !!s.sessionCookie,
    cookieCount: s.sessionCookie ? s.sessionCookie.split(';').filter(x => x.includes('=')).length : 0,
    model: s.defaultModel,
  });
}

export async function POST(req: Request) {
  invalidateToken();
  const s = await getSettings();
  if (!s.sessionCookie) return NextResponse.json({ success: false, error: 'لا توجد كوكيز' }, { status: 400 });
  const t = await refreshAccessToken();
  if (t) return NextResponse.json({ success: true, message: 'تم تحديث التوكن بنجاح', tokenPreview: t.slice(0, 20) + '...' });
  return NextResponse.json({ success: false, error: 'فشل تحديث التوكن - الكوكيز غير صالحة أو منتهية' }, { status: 500 });
}
