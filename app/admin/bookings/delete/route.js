import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { jwtVerify } from 'jose';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me-in-production';

async function verifyAdminToken(token) {
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch (err) {
    console.error('JWT verify error:', err);
    return false;
  }
}

export async function POST(request) {
  try {
    // Get token from cookie
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    const token = cookies['admin_token'];

    console.log('Delete route - token found:', !!token);

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized - No token' }, { status: 401 });
    }

    const isValid = await verifyAdminToken(token);
    console.log('Delete route - token valid:', isValid);

    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    const { ids } = await request.json();

    if (!ids?.length) {
      return NextResponse.json({ error: 'Missing booking IDs' }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from('bookings')
      .delete()
      .in('id', ids);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return NextResponse.json({ error: 'Failed to delete bookings' }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (err) {
    console.error('Admin delete error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}