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

export async function GET(request) {
  try {
    // Check admin auth
    const token = request.cookies.get('admin_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const isValid = await verifyToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all verified users
    const { data: users, error } = await supabase
      .from('verified_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch users error:', error);
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
    }

    // Also fetch booking counts for each user
    const usersWithStats = await Promise.all(
      (users || []).map(async (user) => {
        const { count, error: countError } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('client_email', user.email);

        return {
          ...user,
          total_bookings: countError ? 0 : count,
        };
      })
    );

    return NextResponse.json({ users: usersWithStats });
  } catch (err) {
    console.error('Fetch users error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}