import assert from 'node:assert/strict'
import { test } from 'node:test'

// The HTTP answer both file routes give, against the in-memory bucket (what
// `bucket()` is outside production). The env is set before the import:
// services/files.ts reaches ~/lib/env through the database client, which
// validates at import and connects lazily, so nothing here touches Postgres.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'
process.env.AUTH_SECRET ??= 'file-response-test-placeholder-secret-not-real'
const { fileResponse } = await import('./file-response')
const { bucket } = await import('../bucket')
const { fileKey } = await import('../services/file-refs')

const bytes = new Uint8Array(Buffer.from('0123456789'))
const file = { id: 'f1', mimeType: 'image/jpeg', sizeBytes: bytes.byteLength }
await bucket().put(fileKey(file.id), bytes, file.mimeType)

const get = (range?: string) => new Request('http://anansi.test/x', range ? { headers: { range } } : undefined)

test('a file lives at files/<id>', () => {
  assert.equal(fileKey('abc123'), 'files/abc123')
})

test('the whole file: 200, the row type, its length and the route cache policy', async () => {
  const res = await fileResponse(file, get(), { 'Cache-Control': 'private, max-age=300' })
  assert.ok(res)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/jpeg')
  assert.equal(res.headers.get('content-length'), '10')
  assert.equal(res.headers.get('cache-control'), 'private, max-age=300')
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), '0123456789')
})

test('the type comes from the row, whatever the object says', async () => {
  const res = await fileResponse({ ...file, mimeType: 'application/pdf' }, get(), {})
  assert.equal(res?.headers.get('content-type'), 'application/pdf')
})

test('one range: 206 with that slice', async () => {
  const res = await fileResponse(file, get('bytes=2-4'), {})
  assert.ok(res)
  assert.equal(res.status, 206)
  assert.equal(res.headers.get('content-range'), 'bytes 2-4/10')
  assert.equal(Buffer.from(await res.arrayBuffer()).toString(), '234')
})

test('a range past the end: 416, not cached', async () => {
  const res = await fileResponse(file, get('bytes=50-'), { 'Cache-Control': 'private, max-age=31536000, immutable' })
  assert.equal(res?.status, 416)
  assert.equal(res?.headers.get('content-range'), 'bytes */10')
  assert.equal(res?.headers.get('cache-control'), 'no-store')
})

test('no object for the row: null, which the route answers as not found', async () => {
  assert.equal(await fileResponse({ ...file, id: 'not-there' }, get(), {}), null)
})
