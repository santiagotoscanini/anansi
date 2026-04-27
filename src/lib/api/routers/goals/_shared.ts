import { writeFile, mkdir, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

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
