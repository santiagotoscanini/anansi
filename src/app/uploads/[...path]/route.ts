import { type NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { lookup } from "mime-types";
import { verifyAuthToken } from "~/lib/auth-server";
import { sniffImageMime } from "~/lib/image-upload";

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// Serves any file under the project's `uploads/` directory: avatars, person
// pictures, sync attachments. Every uploaded path is keyed by user id as its
// leading segment (`uploads/{userId}/...`), so the auth check here is simply
// "does the caller's JWT match the leading segment". This stops one user from
// guessing another user's cuid-based attachment URLs.
//
// We also resolve the requested path and verify it stays under UPLOADS_ROOT
// (defence-in-depth against decoded traversal sequences that the substring
// check missed: %2e%2e, NUL bytes, double-encoded inputs, etc.).
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    // 1. AuthN: read the HttpOnly auth cookie and verify the JWT.
    const token = request.cookies.get("goals-auth")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const auth = await verifyAuthToken(token);
    if (!auth.isValid || !auth.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. AuthZ: leading path segment must equal the caller's userId.
    const { path: segments } = await params;
    if (segments.length === 0 || segments[0] !== auth.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Path safety: resolve the absolute path and ensure it sits under
    //    UPLOADS_ROOT. Catches percent-encoded traversal, NUL bytes, etc.
    const fullPath = path.resolve(UPLOADS_ROOT, ...segments);
    const rootWithSep = UPLOADS_ROOT.endsWith(path.sep) ? UPLOADS_ROOT : UPLOADS_ROOT + path.sep;
    if (!fullPath.startsWith(rootWithSep)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buf = await readFile(fullPath);
    // Avatars are stored extensionless (uploads/{userId}/avatar) so a single
    // path always points at the current image regardless of source format.
    // mime-types.lookup() returns false for those, so we fall back to magic-
    // byte sniffing — same helper the upload validator uses, no second source
    // of truth. nosniff is preserved below to neutralize any UA mis-sniffing.
    // (Coerce `false` from lookup() to null so the chain stays readable with
    // ?? rather than mixing falsy operators.)
    const detected = lookup(fullPath) || null;
    const mimeType = detected ?? sniffImageMime(buf) ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        // nosniff: stops Chrome content-sniffing a renamed JS as image and
        // executing it. Pairs with the magic-byte check on upload.
        "X-Content-Type-Options": "nosniff",
        // private: per-user content; intermediaries must not share the
        // response across users.
        "Cache-Control": "private, max-age=86400",
        "Content-Length": buf.length.toString(),
      },
    });
  } catch (error) {
    console.error("Error serving uploaded file:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
