// Server-side validation for base64 upload payloads. All uploads pass through
// here before they ever touch disk: we cap size, decode the envelope, and (for
// images) sniff magic bytes so a JS file renamed `.png` is rejected.
//
// Size cap is generous on purpose — personal app, single user — but the server
// must not allow unbounded payloads. 10MB binary ≈ 14MB base64.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10MB binary
export const MAX_UPLOAD_BASE64_LENGTH = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 100 // ~14MB string + slack

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/
const DATA_URL_PREFIX_RE = /^data:[^;]+;base64,/

export type DecodedUpload = { buffer: Buffer; mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null }

export class UploadValidationError extends Error {}

// Decode + size-check a base64 payload. Throws UploadValidationError on any
// problem, returns the buffer + sniffed MIME (null if not a recognized image).
export function decodeUpload(data: string): DecodedUpload {
  if (typeof data !== 'string' || data.length === 0) {
    throw new UploadValidationError('Empty upload')
  }
  if (data.length > MAX_UPLOAD_BASE64_LENGTH) {
    throw new UploadValidationError(`Upload exceeds ${MAX_UPLOAD_BYTES} bytes`)
  }

  const cleanBase64 = data.replace(DATA_URL_PREFIX_RE, '')
  if (!BASE64_RE.test(cleanBase64)) {
    throw new UploadValidationError('Invalid base64 envelope')
  }

  const buffer = Buffer.from(cleanBase64, 'base64')
  if (buffer.length === 0) {
    throw new UploadValidationError('Decoded upload is empty')
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(`Upload exceeds ${MAX_UPLOAD_BYTES} bytes`)
  }

  return { buffer, mime: sniffImageMime(buffer) }
}

// Magic-byte detection for the image formats we accept. Returns null if the
// buffer doesn't match any known image header. Don't trust file extensions —
// browsers content-sniff and will execute a renamed JS as if it were an image.
export function sniffImageMime(buf: Buffer): DecodedUpload['mime'] {
  if (buf.length < 12) return null

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg'
  }
  // GIF: "GIF87a" or "GIF89a"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    const v = buf[4]
    if ((v === 0x37 || v === 0x39) && buf[5] === 0x61) return 'image/gif'
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

// Decode + require the result to be one of the accepted image formats. Used
// by avatar / person-photo / attachments-with-fileType=image paths.
export function decodeImageUpload(data: string): DecodedUpload {
  const decoded = decodeUpload(data)
  if (decoded.mime === null) {
    throw new UploadValidationError('File does not match any accepted image format (PNG, JPEG, GIF, WebP)')
  }
  return decoded
}

// Legacy thin wrapper kept for callers that only need a boolean. Prefer
// decodeImageUpload above when you want the buffer too.
export function isValidBase64Image(data: string): boolean {
  try {
    decodeImageUpload(data)
    return true
  } catch {
    return false
  }
}
