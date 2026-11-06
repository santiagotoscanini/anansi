// The HTTP answer for a stored file, shared by the two routes that serve one:
// /api/files/$id (the browser, by session) and /api/v1/attachments/$id (the
// phone, by API key). Each route proves who may read the file and names its
// cache policy; this streams the bytes out of the bucket, which no browser or
// phone can reach itself.
//
// The row names the Content-Type, as it always has. Content-Length and ETag
// come from the object, and one `bytes=` Range goes on to the store and comes
// back as a 206 (`objectResponse`); a request without a Range gets the same
// 200 it always did.
import { objectResponse, RangeNotSatisfiable } from '../object-store'
import { openFile, type FileRecord } from '../services/files'

/** The file's response, or null when its bytes are not in the bucket (a 404 to the caller). */
export async function fileResponse(
  file: FileRecord,
  request: Request,
  headers: Record<string, string>,
): Promise<Response | null> {
  let object
  try {
    object = await openFile(file.id, request.headers.get('range'))
  } catch (err) {
    if (!(err instanceof RangeNotSatisfiable)) throw err
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${file.sizeBytes}`, 'Cache-Control': 'no-store' },
    })
  }
  if (!object) return null
  const response = objectResponse(object, headers)
  response.headers.set('Content-Type', file.mimeType)
  return response
}
