import { NextResponse } from 'next/server';
import { verify } from 'otplib';
import { ADMIN_COOKIE, SESSION_TTL_MS, createSessionValue } from '../../../../lib/adminSession';

// Cho phep lech dong ho +/- 30 giay. LUU Y: otplib v13 tinh bang GIAY,
// khac v12 (tinh theo buoc 30s) - dat nham la sai ca dai.
const EPOCH_TOLERANCE_SECONDS = 30;

export async function POST(req) {
  const secret = process.env.ADMIN_TOTP_SECRET;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !sessionSecret) {
    return NextResponse.json({ error: 'Admin login chua duoc cau hinh' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body khong hop le' }, { status: 400 });
  }

  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Ma phai gom dung 6 chu so' }, { status: 400 });
  }

  // verify() tra ve object { valid: boolean }, KHONG phai boolean.
  // Viet "if (await verify(...))" la luon dung -> ai cung dang nhap duoc.
  const result = await verify({ secret, token: code, epochTolerance: EPOCH_TOLERANCE_SECONDS });
  if (!result.valid) {
    return NextResponse.json({ error: 'Ma khong dung' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, await createSessionValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
