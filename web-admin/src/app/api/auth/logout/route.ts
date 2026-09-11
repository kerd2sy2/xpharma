import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('xpharma_session', '', {
    path: '/',
    expires: new Date(0),
    maxAge: 0,
    sameSite: 'lax'
  });
  return response;
}
