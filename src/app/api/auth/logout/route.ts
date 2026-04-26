import { NextResponse } from "next/server";

const COOKIE_NAME = "goals-auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Expiring with maxAge=0 is the spec-compliant way to clear an HttpOnly
  // cookie — the client can't reach it via document.cookie any more.
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
