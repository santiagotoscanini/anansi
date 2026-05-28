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

// Helper for routers that store a `/api/files/{id}` reference (e.g.
// users.avatarUrl, people.emoji when an image is uploaded). Kept in one
// place so a future change to the serving route only touches this string.
export function fileUrl(fileId: string): string {
  return `/api/files/${fileId}`;
}
