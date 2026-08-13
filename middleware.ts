import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'in-mem-' + (process.env.VERCEL_URL || 'default-secret-change-me')
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/admin')) {
    const token = req.cookies.get('admin_token')?.value;
    let valid = false;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        valid = payload.role === 'admin';
      } catch { valid = false; }
    }
    if (!valid) {
      const url = new URL('/login', req.url);
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
