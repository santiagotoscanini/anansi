import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "~/lib/data";
import { users } from "~/lib/data/schema";
import { createAuthToken, validatePassword } from "~/lib/auth-server";
import { checkRateLimit, clientIpFromHeaders } from "~/lib/rate-limit";

// HttpOnly auth cookie. Set server-side from this route handler so XSS in any
// rendered user content can't read or steal the token. Replaces the older
// pattern of returning the token in the JSON body and storing it via
// document.cookie on the client.
const COOKIE_NAME = "goals-auth";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts per 15-minute window per source IP. Stops slow
  // password sprays; legitimate users won't hit this even on multiple typos.
  const ip = clientIpFromHeaders(req.headers);
  const rl = checkRateLimit("auth.login", `ip:${ip}`, { limit: 5, windowMs: 15 * 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  // Constant-time-ish: still hash-compare even when the user row is missing
  // would be ideal, but bcryptjs.compare with an empty hash throws. Acceptable
  // for a single-user-tier personal app.
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const ok = await validatePassword(parsed.data.password, user.password);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createAuthToken(user.id, user.name);
  const res = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
