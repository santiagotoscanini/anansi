import path from "path";

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

// Storage bucket ids. Created by migrations 0021/0022 with matching RLS.
export const AVATAR_BUCKET = "avatars";
export const PEOPLE_PHOTOS_BUCKET = "people-photos";
export const ATTACHMENTS_BUCKET = "attachments";

// Signed-URL TTL for private attachments. Long enough that a single sync
// render stays valid through any client-side debouncing/refetch; short
// enough that a leaked URL has bounded blast radius.
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
