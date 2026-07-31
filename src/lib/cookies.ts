// Cookie-header parsing shared by the shell's server fn. Pure and client-safe:
// no `document`, no request object, just string work, so the same function is
// usable from a server fn, a test, or a script.
//
// Hand-rolled rather than pulled from a cookie library because the shell reads
// exactly two cookies (locale, theme) and validates both against a closed set
// immediately afterwards — a malformed header degrades to `undefined`, which
// every caller already handles, rather than to a wrong value.
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined

  const prefix = `${name}=`
  const match = header.split(';').find((part) => part.trim().startsWith(prefix))
  if (!match) return undefined

  const raw = match.trim().slice(prefix.length)
  try {
    return decodeURIComponent(raw)
  } catch {
    // A value with a stray '%' is not valid percent-encoding and throws.
    // Treat it as absent rather than letting it take down the render.
    return undefined
  }
}
