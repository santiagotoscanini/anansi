// Re-export Auth.js's edge middleware so /api/auth/* + protected routes get
// the session cookie available on `req.auth`. JWT session strategy means
// nothing else needs to run here — no token refresh, no DB round-trip.
//
// If you need to gate specific routes on auth, add an `authorized` callback in
// src/lib/auth/index.ts and switch the matcher below accordingly.
export { auth as middleware } from "~/lib/auth";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
