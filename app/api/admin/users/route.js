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
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendMembershipWelcomeEmail({ email, name, role, canBookWithoutPayment }) {
  if (!email || !RESEND_API_KEY) return false;

  const memberName = name?.trim() || 'Player';
  const isAdmin = role === 'admin';
  const subject = isAdmin
    ? 'You have been added as a Rex Kapehan admin'
    : 'Congratulations! You are now a Rex Kapehan member';

  const benefits = [
    'Book and reserve your slots without paying upfront',
    'Priority consideration for open play invitations',
    'Early access to apparel and exclusive items',
    'Member updates, promos, and event announcements',
  ];

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;background:#f7f7f5;color:#111827;line-height:1.6;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;padding:32px;">
        <div style="text-align:center;margin-bottom:22px;">
          <div style="font-size:12px;letter-spacing:3px;color:#a16207;font-weight:700;">REX KAPEHAN</div>
          <h1 style="margin:10px 0 8px;font-size:30px;line-height:1.2;color:#111827;">${isAdmin ? 'Admin Access Activated' : 'Welcome to the Club'}</h1>
          <p style="margin:0;color:#4b5563;font-size:16px;">Hello ${memberName},</p>
        </div>

        <p style="margin:0 0 18px;font-size:16px;color:#111827;">
          ${isAdmin
            ? 'Congratulations — you have been granted admin access to Rex Kapehan.'
            : 'Congratulations! You are now a premium member of Rex Kapehan.'}
        </p>

        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:18px 20px;margin:18px 0;">
          <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#9a4d00;">Your benefits include:</p>
          <ul style="margin:0;padding-left:20px;color:#374151;">
            ${benefits.map((benefit) => `<li style="margin:8px 0;">${benefit}</li>`).join('')}
          </ul>
        </div>

        <p style="margin:0 0 14px;font-size:15px;color:#374151;">
          ${canBookWithoutPayment || isAdmin
            ? 'You can now reserve sessions without paying upfront.'
            : 'You are now on the member list and can enjoy member benefits and updates.'}
        </p>

        <p style="margin:0 0 16px;font-size:15px;color:#374151;">
          We’re excited to have you with us. Expect member invites, early access opportunities, and updates from the club.
        </p>

        <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:12px;padding:16px 18px;margin:18px 0;color:#78350f;">
          <strong>Member responsibility:</strong> with great power comes great responsibility. Please be a responsible member and avoid no-show behavior when you reserve ahead without paying upfront.
        </div>

        <div style="text-align:center;margin-top:22px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://rexkapehan.com'}" style="display:inline-block;background:#a16207;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:700;">Visit Rex Kapehan</a>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rex Kapehan <no-reply@mail.rexkapehan.com>',
        to: email,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Membership welcome email error:', errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Membership welcome email error:', err);
    return false;
  }
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
          role: user.role || 'member',
          can_book_without_payment: Boolean(user.can_book_without_payment),
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

export async function POST(request) {
  try {
    const token = request.cookies.get('admin_token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const isValid = await verifyToken(token);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, name, phone, role = 'member', can_book_without_payment } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedRole = ['admin', 'member'].includes(role) ? role : 'member';
    const allowFreeBooking = Boolean(can_book_without_payment || normalizedRole === 'admin');

    const { data, error } = await supabase
      .from('verified_emails')
      .upsert({
        email: normalizedEmail,
        name: name?.trim() || null,
        phone: phone?.trim() || null,
        role: normalizedRole,
        can_book_without_payment: allowFreeBooking,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email' })
      .select('*');

    if (error) {
      console.error('Create user error:', error);
      return NextResponse.json({ error: 'Failed to save access user' }, { status: 500 });
    }

    const savedUser = data?.[0] || {
      email: normalizedEmail,
      role: normalizedRole,
      can_book_without_payment: allowFreeBooking,
      name: name?.trim() || null,
      phone: phone?.trim() || null,
    };

    try {
      await sendMembershipWelcomeEmail({
        email: normalizedEmail,
        name: savedUser.name || name || 'Member',
        role: normalizedRole,
        canBookWithoutPayment: Boolean(savedUser.can_book_without_payment ?? allowFreeBooking),
      });
    } catch (emailError) {
      console.error('Welcome email dispatch failed:', emailError);
    }

    return NextResponse.json({
      success: true,
      user: {
        ...savedUser,
        role: savedUser.role || normalizedRole,
        can_book_without_payment: Boolean(savedUser.can_book_without_payment ?? allowFreeBooking),
      },
    });
  } catch (err) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}