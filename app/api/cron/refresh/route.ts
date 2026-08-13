import { NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/chatgpt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  const auth = req.headers.get('authorization');

  if (process.env.CRON_SECRET) {
    const ok = secret === process.env.CRON_SECRET || auth === `Bearer ${process.env.CRON_SECRET}`;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const t = await refreshAccessToken();
  if (t) return NextResponse.json({ success: true, message: 'تم تحديث التوكن' });
  return NextResponse.json({ success: false, error: 'فشل التحديث' }, { status: 500 });
}
