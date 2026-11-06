// The copy behind scripts/migrate-bytea-to-s3.ts, kept apart from Postgres so
// a test (bytea-to-s3.test.ts) can drive it with a made-up table and the
// in-memory store. Deleted with that script.
//
// It reads every `files` row's id, type and byte count (`octet_length(data)`),
// copies the bytes of each row that still holds them to `files/<id>` with the
// row's Content-Type, and skips a key already in the bucket at the same size,
// so a second run copies nothing. Then it verifies: every row with bytes has
// its object at that size (count and bytes on both sides), every row without
// bytes (written by the bucket code) has its object, and the sha256 of a
// sample matches between the database and the bucket. It prints ids, keys,
// sizes and types, never contents.
import { createHash } from 'node:crypto'
import type { Bytes, ObjectStore } from '../src/server/object-store'
import { fileKey } from '../src/server/services/file-refs'

export interface FileRow {
  id: string
  mimeType: string
  /** `octet_length(data)`: the bytes the row still holds, or null when it holds none. */
  length: number | null
}

export interface ByteaSource {
  /** Every files row, in id order, a page at a time behind the iterator. No bytes. */
  rows(): AsyncIterable<FileRow>
  /** One row's bytes, or null when it holds none. */
  bytes(id: string): Promise<Bytes | null>
}

export interface CopyOptions {
  dryRun: boolean
  /** How many copied rows to compare by sha256, spread over the table. */
  sample?: number
  log?: (line: string) => void
  error?: (line: string) => void
}

const PREFIX = 'files/'
const num = (n: number) => n.toLocaleString('en-US')
const total = (rows: FileRow[]) => rows.reduce((s, r) => s + (r.length ?? 0), 0)
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Up to `n` items, evenly spread from first to last. */
export function spread<T>(items: T[], n: number): T[] {
  if (n <= 0 || items.length === 0) return []
  if (items.length <= n) return [...items]
  if (n === 1) return [items[0]!]
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]!)
}

/** Copy, then verify. `problems` is the count of failures; any is a non-zero exit. */
export async function copyByteaToBucket(source: ByteaSource, store: ObjectStore, opts: CopyOptions) {
  const log = opts.log ?? console.log
  const error = opts.error ?? console.error
  const failures: string[] = []

  const rows: FileRow[] = []
  for await (const row of source.rows()) rows.push(row)
  const withBytes = rows.filter((r) => r.length !== null)
  const without = rows.filter((r) => r.length === null)
  log(
    `  database  ${num(rows.length)} file rows: ${num(withBytes.length)} hold bytes (${num(total(withBytes))} bytes), ` +
      `${num(without.length)} hold none (written by the bucket code)`,
  )

  const inBucket = async () => {
    const sizes = new Map<string, number>()
    for await (const o of store.list(PREFIX)) sizes.set(o.key, o.size)
    return sizes
  }
  const before = await inBucket()
  const todo = withBytes.filter((r) => before.get(fileKey(r.id)) !== r.length)
  log(
    `  bucket    ${num(before.size)} objects under ${PREFIX}; ${num(withBytes.length - todo.length)} rows already there ` +
      `at their size, ${num(todo.length)} to copy (${num(total(todo))} bytes)`,
  )

  let copied = 0
  if (opts.dryRun) {
    for (const r of todo) log(`  would copy ${fileKey(r.id)} (${num(r.length ?? 0)} bytes, ${r.mimeType})`)
  } else {
    for (const r of todo) {
      const key = fileKey(r.id)
      try {
        const bytes = await source.bytes(r.id)
        if (!bytes) {
          failures.push(`${key}: the row holds no bytes any more`)
          continue
        }
        if (bytes.byteLength !== r.length) {
          failures.push(`${key}: read ${num(bytes.byteLength)} bytes, the row said ${num(r.length ?? 0)}`)
          continue
        }
        await store.put(key, bytes, r.mimeType)
        copied++
        log(`  copied   ${key} (${num(bytes.byteLength)} bytes, ${r.mimeType})`)
      } catch (err) {
        failures.push(`${key}: ${messageOf(err)}`)
      }
    }
  }

  // Verification, against a fresh listing.
  const after = await inBucket()
  const there = withBytes.filter((r) => after.get(fileKey(r.id)) === r.length)
  log(
    `  verify   ${num(there.length)} of ${num(withBytes.length)} rows that hold bytes are in the bucket at their size; ` +
      `${num(total(withBytes))} bytes in the database, ${num(total(there))} in the bucket`,
  )
  if (!opts.dryRun) {
    for (const r of withBytes) {
      if (after.get(fileKey(r.id)) !== r.length)
        failures.push(`${fileKey(r.id)}: not in the bucket at ${num(r.length ?? 0)} bytes`)
    }
  }

  // A row without bytes was written by the bucket code, object first: one
  // whose object is missing is a lost file, whatever this run did.
  const lost = without.filter((r) => !after.has(fileKey(r.id)))
  log(`  verify   ${num(without.length - lost.length)} of ${num(without.length)} rows that hold none have their object`)
  for (const r of lost) failures.push(`${fileKey(r.id)}: the row holds no bytes and the bucket has no object`)

  const named = new Set(rows.map((r) => fileKey(r.id)))
  const strays = [...after.keys()].filter((k) => !named.has(k))
  if (strays.length) log(`  note     ${num(strays.length)} objects under ${PREFIX} that no row names (left alone)`)

  // The bytes themselves, for a sample: what the database holds and what the
  // bucket holds hash the same.
  const sampled = spread(there, opts.sample ?? 25)
  let matched = 0
  for (const r of sampled) {
    const key = fileKey(r.id)
    try {
      const [fromDb, fromBucket] = await Promise.all([source.bytes(r.id), store.read(key)])
      if (fromDb && fromBucket && sha256(fromDb) === sha256(fromBucket)) matched++
      else failures.push(`${key}: its sha256 differs between the database and the bucket`)
    } catch (err) {
      failures.push(`${key}: sha256 check failed: ${messageOf(err)}`)
    }
  }
  log(`  verify   sha256 of ${num(sampled.length)} sampled rows: ${num(matched)} match`)

  for (const f of failures) error(`  FAILED   ${f}`)
  return { rows: rows.length, toCopy: todo.length, copied, problems: failures.length }
}
