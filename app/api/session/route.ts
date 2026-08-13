import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken, getAccessToken } from '@/lib/chatgpt';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [token, settings] = await Promise.all([getAccessToken(), getSettings()]);
  return NextResponse.json({
    accessToken: token ? 'present' : null,
    hasCookie: !!settings.sessionCookie,
    cookieLength: settings.sessionCookie?.length || 0,
  });
}

export async function POST() {
  const settings = await getSettings();
  if (!settings.sessionCookie) {
    return NextResponse.json(
      { success: false, error: 'لا توجد كوكيز محفوظة. أضف الكوكيز من لوحة الإدارة أولاً.' },
      { status: 400 }
    );
  }
  const newToken = await refreshAccessToken();
  if (newToken) {
    return NextResponse.json({
      success: true,
      message: 'تم تحديث التوكن بنجاح',
      tokenPreview: newToken.substring(0, 20) + '...',
    });
  }
  return NextResponse.json(
    {
      success: false,
      error: 'فشل تحديث التوكن. الكوكيز غير صالحة أو منتهية الصلاحية. سجّل دخولك إلى chatgpt.com مجدداً وانسخ الكوكيز.',
    },
    { status: 500 }
  );
}
