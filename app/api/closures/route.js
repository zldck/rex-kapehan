import { NextResponse } from 'next/server';
import { getClosuresForDate } from '../_lib/closures';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return NextResponse.json({ error: 'A valid date is required' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await getClosuresForDate(date);
  if (error) {
    console.error('Public closures fetch error:', error);
    return NextResponse.json({ error: 'Failed to load closures' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ closures: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
}
