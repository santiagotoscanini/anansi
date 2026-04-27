import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "~/lib/data";

// Liveness + readiness probe. Used by the Docker HEALTHCHECK and by any
// upstream (Traefik / NAS health monitor) that wants to know whether this
// container is actually serving. Public on purpose — exposing the existence
// of the app is fine; it returns no user data.
//
// 200 = process is up AND can reach the DB.
// 503 = process is up but DB roundtrip failed (most likely cause: pool
//       saturation or migrations still running on boot).
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch {
    return NextResponse.json({ status: "db_unreachable" }, { status: 503 });
  }
}
