import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return new NextResponse(null, { status: 302, headers: { Location: '/' } });
    }

    // Look up the token
    const { data: record, error: fetchError } = await supabase
      .from('verified_emails')
      .select('email, magic_token_expires_at, is_blocked')
      .eq('magic_token', token)
      .single();

    if (fetchError || !record) {
      return new NextResponse(null, { status: 302, headers: { Location: '/?error=Invalid link' } });
    }

    if (record.is_blocked) {
      return new NextResponse(null, { status: 302, headers: { Location: '/?error=Account blocked' } });
    }

    if (new Date(record.magic_token_expires_at) < new Date()) {
      // Expired: clear token
      await supabase
        .from('verified_emails')
        .update({ magic_token: null, magic_token_expires_at: null })
        .eq('email', record.email);
      return new NextResponse(null, { status: 302, headers: { Location: '/?error=Link expired' } });
    }

    // Extend verification for 30 days (same as OTP)
    const verifiedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Update user: extend verified_until and clear magic token
    await supabase
      .from('verified_emails')
      .update({
        verified_until: verifiedUntil,
        verified_at: new Date().toISOString(),
        magic_token: null,
        magic_token_expires_at: null,
      })
      .eq('email', record.email);

    // Redirect to dashboard with a script to set localStorage and then reload
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Redirecting...</title></head>
        <body>
          <script>
            localStorage.setItem('rk_verified_email', '${record.email}');
            window.location.href = '/dashboard';
          </script>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    console.error('Magic link verify error:', err);
    return new NextResponse(null, { status: 302, headers: { Location: '/?error=Server error' } });
  }
}