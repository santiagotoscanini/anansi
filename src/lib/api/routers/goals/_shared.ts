import { writeFile, mkdir, unlink, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../data";
import { attachments } from "../../../data/schema";

export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// Allowed extensions for non-image attachments (images use the sniffed-MIME
// extension instead). Any extension outside this list is replaced with `.bin`,
// so a `.exe`/`.html`/`.svg` upload becomes a `.bin` blob that browsers
// content-disposition-download via mime-types lookup.
const SAFE_NONIMAGE_EXTS = new Set([
  ".pdf",
  ".txt",
  ".md",
  ".rtf",
  ".csv",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".zip",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".flac",
  ".mp4",
  ".mov",
  ".webm",
  ".mkv",
  ".avi",
]);

export function safeExtension(fileName: string, sniffedImageMime: string | null): string {
  if (sniffedImageMime) {
    return sniffedImageMime === "image/jpeg" ? ".jpg" : `.${sniffedImageMime.split("/")[1]}`;
  }
  const raw = path.extname(fileName).toLowerCase();
  return SAFE_NONIMAGE_EXTS.has(raw) ? raw : ".bin";
}

// Persist a pre-validated buffer under uploads/{userId}/attachments/{id}.{ext}.
// Caller is responsible for the matching DB row (kept atomic via tx-around-FS).
export async function writeAttachmentToDisk(args: {
  buffer: Buffer;
  userId: string;
  attachmentId: string;
  ext: string;
}): Promise<{ storagePath: string; sizeBytes: number }> {
  const relPath = path.join(args.userId, "attachments", `${args.attachmentId}${args.ext}`);
  const fullPath = path.join(UPLOADS_ROOT, relPath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, args.buffer);
  return { storagePath: relPath, sizeBytes: args.buffer.length };
}

export async function unlinkAttachmentFromDisk(storagePath: string): Promise<boolean> {
  const fullPath = path.join(UPLOADS_ROOT, storagePath);
  if (!existsSync(fullPath)) return false;
  try {
    await unlink(fullPath);
    return true;
  } catch (err) {
    console.warn(`[attachments] failed to unlink ${fullPath}:`, err);
    return false;
  }
}

// Orphan sweep: drop on-disk attachment files whose row no longer exists.
//
// Why this exists: attachments.upload writes the file inside the same DB tx as
// the row insert, so a tx rollback after the FS write leaves an orphan file
// (the only reachable failure mode is the post-write `tx.update` of
// storagePath/sizeBytes). We can't fully eliminate that race without a more
// involved staging-then-rename approach, so instead we sweep lazily.
//
// Runs at most once per user per process boot. Triggered on first attachment
// upload (so cold users don't pay the readdir cost). Cheap on small dirs;
// only walks the leaf, doesn't recurse.
const sweptUsers = new Set<string>();

export async function maybeSweepOrphanAttachments(userId: string): Promise<void> {
  if (sweptUsers.has(userId)) return;
  sweptUsers.add(userId); // claim immediately so concurrent calls don't re-sweep
  try {
    const dir = path.join(UPLOADS_ROOT, userId, "attachments");
    if (!existsSync(dir)) return;

    const files = await readdir(dir);
    if (files.length === 0) return;

    // Filename layout is `{cuid2}.{ext}` — strip the extension to get the id.
    const fileIds = files.map((f) => ({ file: f, id: f.replace(/\.[^.]+$/, "") }));
    const rows = await db.select({ id: attachments.id }).from(attachments).where(eq(attachments.userId, userId));
    const liveIds = new Set(rows.map((r) => r.id));

    // Second guard: only delete files whose id pattern looks like a cuid2
    // (24-char lowercase alnum). Belt-and-suspenders so a manually-placed file
    // (debugging, restore-from-backup mid-flight) doesn't get reaped.
    const ORPHAN_ID_RE = /^[a-z0-9]{24}$/;

    const orphans = fileIds.filter((f) => ORPHAN_ID_RE.test(f.id) && !liveIds.has(f.id));
    if (orphans.length === 0) return;

    // Cross-check against the DB by id (defends against a recently-inserted
    // attachment whose user-scoped read above missed the row due to read-after-
    // write timing across tx boundaries).
    const recentLive = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        inArray(
          attachments.id,
          orphans.map((o) => o.id),
        ),
      );
    const recentLiveIds = new Set(recentLive.map((r) => r.id));

    for (const o of orphans) {
      if (recentLiveIds.has(o.id)) continue;
      const fullPath = path.join(dir, o.file);
      try {
        await unlink(fullPath);
        console.warn(`[attachments] swept orphan ${fullPath}`);
      } catch (err) {
        console.warn(`[attachments] failed to sweep orphan ${fullPath}:`, err);
      }
    }
  } catch (err) {
    // Don't throw — sweep is best-effort. If anything goes wrong (perm denied,
    // FS unavailable) we want the actual upload that triggered this to still
    // succeed; we'll retry the sweep on the next process boot.
    console.warn(`[attachments] orphan sweep for user ${userId} failed:`, err);
    sweptUsers.delete(userId); // allow retry on next call
  }
}
