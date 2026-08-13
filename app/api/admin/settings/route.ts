import { NextRequest, NextResponse } from 'next/server';
import { getSettings, updateSettings } from '@/lib/settings';
import { isAdminAuthenticated, bcrypt } from '@/lib/auth';
import { invalidateToken, refreshAccessToken } from '@/lib/chatgpt';
import { kvPing } from '@/lib/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const s = await getSettings();
  return NextResponse.json({
    sessionCookie: s.sessionCookie,
    hasAccessToken: !!s.accessToken,
    apiAccessKey: s.apiAccessKey || '',
    defaultModel: s.defaultModel,
    supabaseUrl: s.supabaseUrl || '',
    supabaseKey: s.supabaseKey ? '***' : '',
    hasSupabaseKey: !!s.supabaseKey,
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const {
    sessionCookie,
    accessToken,
    apiAccessKey,
    defaultModel,
    newAdminPassword,
    supabaseUrl,
    supabaseKey,
    clearToken,
  } = body;

  const patch: any = {};

  if (typeof sessionCookie === 'string') {
    patch.sessionCookie = sessionCookie.trim();
    patch.accessToken = '';
    invalidateToken();
  }
  if (typeof accessToken === 'string' && accessToken.trim() && accessToken !== '***set***' && accessToken !== '***') {
    patch.accessToken = accessToken.trim();
    invalidateToken();
  }
  if (typeof clearToken !== 'undefined' && clearToken) {
    patch.accessToken = '';
    invalidateToken();
  }
  if (typeof apiAccessKey === 'string') patch.apiAccessKey = apiAccessKey.trim();
  if (typeof defaultModel === 'string' && defaultModel.trim()) patch.defaultModel = defaultModel.trim();
  if (typeof newAdminPassword === 'string' && newAdminPassword.length >= 4) {
    patch.adminPasswordHash = await bcrypt.hash(newAdminPassword, 10);
  }
  if (typeof supabaseUrl === 'string') patch.supabaseUrl = supabaseUrl.trim();
  if (typeof supabaseKey === 'string' && supabaseKey.trim() && supabaseKey !== '***') {
    patch.supabaseKey = supabaseKey.trim();
  }

  await updateSettings(patch);

  // محاولة تجديد التوكن تلقائياً بعد تحديث الكوكيز
  let autoRefreshed = false;
  const updated = await getSettings();
  if (updated.sessionCookie) {
    const t = await refreshAccessToken();
    autoRefreshed = !!t;
  }

  // فحص الاتصال بـ Supabase
  const storage = await kvPing();

  return NextResponse.json({ success: true, autoRefreshed, storage });
}
