import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { kvSet } from './kv';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET || 'in-mem-' + (process.env.VERCEL_URL || 'default-secret-change-me');
  return new TextEncoder().encode(s);
}

export async function signAdminToken() {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getSecret());
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.role === 'admin';
  } catch { return false; }
}

export async function isAdminAuthenticated(req?: NextRequest): Promise<boolean> {
  const t = req?.cookies.get('admin_token')?.value;
  return t ? verifyAdminToken(t) : false;
}

export async function isFirstRun(): Promise<boolean> {
  if (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH) return false;
  const { getSettings } = await import('./settings');
  const s = await getSettings();
  return !s.adminPasswordHash;
}

export async function setFirstRunDone() {
  try { await kvSet('first_run', true); } catch {}
}

export function randomPassword(len = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let p = '';
  const b = randomBytes(len);
  for (let i = 0; i < len; i++) p += chars[b[i] % chars.length];
  return p;
}

export async function getJwtStatus(): Promise<{ source: 'env' | 'default'; effective: boolean; hint: string }> {
  if (process.env.JWT_SECRET && !process.env.JWT_SECRET.startsWith('in-mem-')) {
    return { source: 'env', effective: true, hint: 'آمن (من البيئة)' };
  }
  return { source: 'default', effective: true, hint: 'تلقائي (يمكن ضبط JWT_SECRET)' };
}

export { bcrypt };
