import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { memoryObjectStore, type Bytes, type ObjectStore } from '../src/server/object-store'
import { copyByteaToBucket, spread, type ByteaSource, type FileRow } from './bytea-to-s3'

// The one-off copy of files.data into the bucket, driven with a made-up table
// and the in-memory store. Deleted with the script.

const bytesOf = (text: string): Bytes => new Uint8Array(Buffer.from(text))

/** A `files` table: id → bytes (null for a row the bucket code wrote) and type. */
function table(rows: Record<string, { data: string | null; mime?: string }>): ByteaSource {
  return {
    async *rows() {
      for (const id of Object.keys(rows).sort()) {
        const { data, mime } = rows[id]!
        yield {
          id,
          mimeType: mime ?? 'image/jpeg',
          length: data === null ? null : bytesOf(data).byteLength,
        } satisfies FileRow
      }
    },
    async bytes(id) {
      const data = rows[id]?.data
      return data == null ? null : bytesOf(data)
    },
  }
}

const quiet = () => {
  const lines: string[] = []
  return { lines, log: (l: string) => lines.push(l), error: (l: string) => lines.push(l) }
}

describe('copyByteaToBucket', () => {
  test('copies every row that holds bytes to files/<id>, with its type', async () => {
    const store = memoryObjectStore()
    const out = quiet()
    const result = await copyByteaToBucket(
      table({ a: { data: 'alpha' }, b: { data: 'bravo!', mime: 'application/pdf' } }),
      store,
      { dryRun: false, ...out },
    )
    assert.deepEqual(result, { rows: 2, toCopy: 2, copied: 2, problems: 0 })
    assert.equal(Buffer.from((await store.read('files/a'))!).toString(), 'alpha')
    assert.equal((await store.open('files/b'))?.contentType, 'application/pdf')
    assert.ok(out.lines.some((l) => l.includes('sha256 of 2 sampled rows: 2 match')))
  })

  test('a second run copies nothing', async () => {
    const store = memoryObjectStore()
    const rows = table({ a: { data: 'alpha' } })
    await copyByteaToBucket(rows, store, { dryRun: false, ...quiet() })
    const again = await copyByteaToBucket(rows, store, { dryRun: false, ...quiet() })
    assert.equal(again.toCopy, 0)
    assert.equal(again.problems, 0)
  })

  test('re-copies an object of another size', async () => {
    const store = memoryObjectStore()
    await store.put('files/a', bytesOf('alp'), 'image/jpeg')
    const result = await copyByteaToBucket(table({ a: { data: 'alpha' } }), store, { dryRun: false, ...quiet() })
    assert.equal(result.copied, 1)
    assert.equal(Buffer.from((await store.read('files/a'))!).toString(), 'alpha')
  })

  test('a dry run writes nothing and fails nothing', async () => {
    const store = memoryObjectStore()
    const out = quiet()
    const result = await copyByteaToBucket(table({ a: { data: 'alpha' } }), store, { dryRun: true, ...out })
    assert.deepEqual(result, { rows: 1, toCopy: 1, copied: 0, problems: 0 })
    assert.equal(await store.head('files/a'), null)
    assert.ok(out.lines.some((l) => l.includes('would copy files/a (5 bytes, image/jpeg)')))
  })

  test('never prints contents', async () => {
    const out = quiet()
    await copyByteaToBucket(table({ a: { data: 'secret-bytes' } }), memoryObjectStore(), { dryRun: false, ...out })
    assert.ok(out.lines.length > 0)
    assert.ok(out.lines.every((l) => !l.includes('secret-bytes')))
  })

  test('a row the bucket code wrote is fine with its object and a failure without', async () => {
    const store = memoryObjectStore()
    await store.put('files/new', bytesOf('fresh'), 'image/png')
    const ok = await copyByteaToBucket(table({ new: { data: null } }), store, { dryRun: true, ...quiet() })
    assert.equal(ok.problems, 0)
    const lost = await copyByteaToBucket(table({ gone: { data: null } }), store, { dryRun: true, ...quiet() })
    assert.equal(lost.problems, 1)
  })

  test('a failed put is a problem, and the others still copy', async () => {
    const inner = memoryObjectStore()
    const store: ObjectStore = {
      ...inner,
      put: (key, bytes, type, opts) =>
        key === 'files/b' ? Promise.reject(new Error('503 Slow Down')) : inner.put(key, bytes, type, opts),
    }
    const out = quiet()
    const result = await copyByteaToBucket(table({ a: { data: 'alpha' }, b: { data: 'bravo' } }), store, {
      dryRun: false,
      ...out,
    })
    assert.equal(result.copied, 1)
    // The put itself, then the verification that finds it missing.
    assert.equal(result.problems, 2)
    assert.ok(out.lines.some((l) => l.includes('FAILED   files/b: 503 Slow Down')))
  })

  test('bytes that differ at the same size fail the sha256 sample', async () => {
    const store = memoryObjectStore()
    await store.put('files/a', bytesOf('ALPHA'), 'image/jpeg')
    const result = await copyByteaToBucket(table({ a: { data: 'alpha' } }), store, { dryRun: false, ...quiet() })
    assert.equal(result.toCopy, 0)
    assert.equal(result.problems, 1)
  })
})

test('spread picks evenly, first and last included', () => {
  assert.deepEqual(spread([1, 2, 3, 4, 5, 6, 7, 8, 9], 3), [1, 5, 9])
  assert.deepEqual(spread([1, 2], 5), [1, 2])
  assert.deepEqual(spread([1, 2, 3], 1), [1])
  assert.deepEqual(spread([1, 2, 3], 0), [])
})
