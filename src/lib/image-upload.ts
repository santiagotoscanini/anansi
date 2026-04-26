// Validates the envelope of a base64-encoded image payload before we touch
// disk. Bare base64 (no data URL prefix) and `data:image/...;base64,...` URLs
// are both accepted. Anything that fails the regex or fails to decode is
// rejected at the API boundary so we never write garbage.
export function isValidBase64Image(data: string): boolean {
  try {
    const base64Pattern = /^data:image\/[a-zA-Z]+;base64,|^[A-Za-z0-9+/]+={0,2}$/;
    if (!base64Pattern.test(data)) return false;
    const cleanBase64 = data.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
    Buffer.from(cleanBase64, "base64");
    return true;
  } catch {
    return false;
  }
}
