import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "~/lib/data";
import { users } from "~/lib/data/schema";
import { createAuthToken, hashPassword } from "~/lib/auth-server";

// See login/route.ts for the cookie-shape rationale.
const COOKIE_NAME = "goals-auth";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  const hashed = await hashPassword(parsed.data.password);
  const [user] = await db
    .insert(users)
    .values({ name: parsed.data.name, email: parsed.data.email, password: hashed })
    .returning();
  if (!user) {
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
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
