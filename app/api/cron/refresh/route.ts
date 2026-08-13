import { NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/chatgpt';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secretParam = searchParams.get('secret');
  const authHeader = req.headers.get('authorization');

  const cronSecret = process.env.CRON_SECRET;

  // التحقق من السر: إما عبر Bearer Token أو عبر query parameter
  const isAuthorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && secretParam === cronSecret);

  if (cronSecret && !isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // إذا لم يتم تعيين CRON_SECRET، نسمح بالوصول (للتطوير أو الاستخدام الشخصي)
  const token = await refreshAccessToken();
  if (token) {
    return NextResponse.json({ success: true, message: 'Token refreshed' });
  }
  return NextResponse.json({ success: false, error: 'Failed to refresh' }, { status: 500 });
}
