import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { SignJWT, jwtVerify } from 'jose';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me-in-production';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

// Helper: Create JWT token
async function createToken() {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

// Helper: Verify JWT token
async function verifyToken(token) {
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const { password, remember } = await request.json();

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    // Verify password
    const a = Buffer.from(password);
    const b = Buffer.from(ADMIN_PASSWORD);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Create token if remember me
    let token = null;
    if (remember) {
      token = await createToken();
    }

    // Update last login in Supabase (for audit)
    try {
      await supabase
        .from('verified_emails')
        .update({ last_login_at: new Date().toISOString() })
        .eq('email', 'admin@rexkapehan.com'); // Placeholder – we'll store admin email
    } catch (_) { /* ignore */ }

    const response = NextResponse.json({ success: true });

    // Set cookie if token exists
    if (token) {
      response.cookies.set('admin_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: '/',
      });
    }

    return response;
  } catch (err) {
    console.error('Admin login error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// GET: Check if user is authenticated via cookie
export async function GET(request) {
  try {
    const token = request.cookies.get('admin_token')?.value;
    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    const isValid = await verifyToken(token);
    return NextResponse.json({ authenticated: isValid });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}