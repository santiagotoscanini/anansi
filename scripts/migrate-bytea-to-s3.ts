// ONE-OFF: copy the bytes of anansi's files out of Postgres into its bucket.
//
// Until November 2026 every uploaded file's bytes lived in `files.data`
// (bytea). Now they live in the app's bucket at `files/<id>`
// (src/server/services/files.ts). This copies the bytes the old rows still
// hold into that layout, between the deploy that moved the code and the
// migration that drops the column. scripts/bytea-to-s3.ts does the work and
// says what it checks; this file is the database, the bucket and the flags.
//
// It only reads the database: one read-only session (every transaction
// `default_transaction_read_only`), the rows paged by id, one row's bytes at a
// time. It prints ids, keys, sizes and types, never contents, and exits 1 on
// any failure, 2 on bad arguments.
//
// Bundled with everything it imports (postgres, the S3 SDK through the
// canonical src/server/object-store) into .output/scripts/ by
// vite.scripts.config.ts, because the runtime image holds only railpack.json's
// deploy.inputs and node_modules only as an allow-list. Self-contained, so it
// also runs in a container built before it existed (copy the .mjs in). Inside
// the app container, where DATABASE_URL and the S3_* variables are:
//
//   podman exec app-anansi node .output/scripts/migrate-bytea-to-s3.mjs --dry-run
//   podman exec app-anansi node .output/scripts/migrate-bytea-to-s3.mjs
//
// DELETE this file, scripts/bytea-to-s3.ts, its test, vite.scripts.config.ts
// and the second half of package.json's `build` with the migration that drops
// `files.data`.
import postgres from 'postgres'
import { objectStoreFromEnv, s3ConfigFromEnv, type ObjectStore } from '../src/server/object-store'
import { copyByteaToBucket, type ByteaSource } from './bytea-to-s3'

const USAGE = `usage: node .output/scripts/migrate-bytea-to-s3.mjs [--dry-run]

Copies the bytes still held in files.data (Postgres) to files/<id> in the app's
bucket, skipping objects already there at the same size, then verifies counts,
bytes and a sha256 sample on both sides. Reads DATABASE_URL and the five S3_*
variables from the environment; writes nothing to the database.

  --dry-run   read both sides and say what would be copied; write nothing
  --help      this text`

const PAGE = 200
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))

function pgSource(sql: postgres.Sql): ByteaSource {
  return {
    async *rows() {
      let after = ''
      for (;;) {
        const page = await sql<{ id: string; mime_type: string; length: number | null }[]>`
          select id, mime_type, octet_length(data) as length
          from files where id > ${after} order by id limit ${PAGE}`
        for (const r of page) yield { id: r.id, mimeType: r.mime_type, length: r.length }
        const last = page.at(-1)
        if (page.length < PAGE || !last) return
        after = last.id
      }
    },
    async bytes(id) {
      const [row] = await sql<{ data: Buffer | null }[]>`select data from files where id = ${id}`
      return row?.data ? new Uint8Array(row.data) : null
    },
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    return 0
  }
  if (args.some((a) => a !== '--dry-run')) {
    console.error(USAGE)
    return 2
  }
  const dryRun = args.includes('--dry-run')

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set: run this inside the app container')
    return 1
  }
  let store: ObjectStore | null
  try {
    store = objectStoreFromEnv(process.env)
  } catch (err) {
    console.error(messageOf(err)) // names the missing S3_* variables, never a value
    return 1
  }
  if (!store) {
    console.error('the S3_* variables are not set: turn Object storage on for the app, then run this in its container')
    return 1
  }

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => undefined,
    connection: { application_name: 'migrate-bytea-to-s3', default_transaction_read_only: true },
  })
  try {
    console.log(
      `${dryRun ? 'dry run: ' : ''}files.data → bucket ${s3ConfigFromEnv(process.env)?.bucket}, keys files/<id>`,
    )
    const { problems, toCopy, copied } = await copyByteaToBucket(pgSource(sql), store, { dryRun })
    if (problems) console.log(`${problems} problem(s): exit 1`)
    else if (dryRun) console.log(`dry run: nothing was written (${toCopy} to copy)`)
    else console.log(`done: ${copied} copied, every file is in the bucket`)
    return problems ? 1 : 0
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(messageOf(err))
    process.exit(1)
  },
)
