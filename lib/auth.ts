import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { kvGet, kvSet } from './kv';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const JWT_KEY = 'jwt_secret_instance';
const FIRST_RUN_KEY = 'first_run_done';

function getSecretBytes(): Uint8Array {
  let secret = process.env.JWT_SECRET;
  if (secret && !secret.startsWith('change-me') && !secret.startsWith('fallback')) {
    return new TextEncoder().encode(secret);
  }
  // سيتم توليدها ديناميكياً إذا لزم (في الميموري) في وقت التشغيل
  return new TextEncoder().encode(secret || 'in-memory-fallback-secret-change-this-in-production');
}

export async function signAdminToken(): Promise<string> {
  const secret = getSecretBytes();
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1d')
    .setIssuedAt()
    .sign(secret);
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const secret = getSecretBytes();
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export async function isAdminAuthenticated(req?: NextRequest): Promise<boolean> {
  const token = req?.cookies.get('admin_token')?.value;
  if (!token) return false;
  return verifyAdminToken(token);
}

export async function getAdminCookie() {
  try { return cookies().get('admin_token')?.value; } catch { return undefined; }
}

export async function getJwtStatus(): Promise<{ source: 'env' | 'fallback'; effective: boolean; hint: string }> {
  const env = process.env.JWT_SECRET;
  if (env && !env.startsWith('change-me') && !env.startsWith('fallback')) {
    return { source: 'env', effective: true, hint: 'مضبوط من البيئة (آمن)' };
  }
  return { source: 'fallback', effective: false, hint: 'القيمة الافتراضية - أضف JWT_SECRET للأمان' };
}

/**
 * إذا لم يكن هناك كلمة مرور على الإطلاق (أول تشغيل)، تقبل أي كلمة مرور
 * وتقوم بتشفيرها وحفظها تلقائياً.
 */
export async function isFirstRun(): Promise<boolean> {
  if (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH) return false;
  try {
    const done = await kvGet<boolean>(FIRST_RUN_KEY);
    if (done) return false;
  } catch {}
  return true;
}

export async function setFirstRunComplete() {
  try { await kvSet(FIRST_RUN_KEY, true); } catch {}
}

/**
 * يولّد كلمة مرور عشوائية ويحفظها (في حالة استخدام من قبل السكربتات)
 */
export function generateRandomPassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) pw += chars[bytes[i] % chars.length];
  return pw;
}

export { bcrypt };
