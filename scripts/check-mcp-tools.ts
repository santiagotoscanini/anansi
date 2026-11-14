#!/usr/bin/env tsx
// The MCP tool catalog must not drift. AGENTS.md states the diff against
// .golden/mcp-tools.json "must be exactly zero after any change here" — this
// is what enforces it.
//
//   pnpm check:mcp-tools
//
// Why this replaced .golden/verify-mcp-tools.sh: that script curled a running
// server with a bearer token, so exercising the invariant meant booting the
// app, having a database, registering an OAuth client and completing a browser
// consent flow. That is too much ceremony to run on every PR, so in practice it
// ran approximately never — and an invariant nothing checks is a comment.
//
// The catalog is a pure function of tool REGISTRATION: handlers close over the
// McpCtx, but titles, descriptions and inputSchemas do not depend on it. So the
// whole thing can be derived in-process with a fake user id, no server, no
// database, no token.
//
// It still goes through a real Client over a real transport rather than reading
// the server's internals, because the interesting part is precisely what the
// SDK does on the way out: converting each Zod raw shape into JSON Schema. A
// zod major bump can change the emitted dialect (draft-07 → draft-2020-12),
// reorder `required`, or drop a constraint — all of which are invisible to
// `tsc` and all of which change what an LLM sees. Reaching into the registry
// would skip the conversion and check nothing that matters.
//
// Env is set before any app import: src/lib/env.ts validates at import time and
// the tool modules reach it through the service layer. Nothing connects —
// postgres.js opens its pool lazily and no handler is ever invoked.
process.env.DATABASE_URL ??= 'postgresql://check:check@localhost:5432/check'
process.env.AUTH_SECRET ??= 'check-mcp-tools-placeholder-secret-not-real'

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), '..', '.golden', 'mcp-tools.json')
const EXPECTED_COUNT = 91

/**
 * Stable stringify: sort object keys at every depth, leave array order alone.
 *
 * The golden file was captured through `jq -S`, which sorts keys — so the
 * comparison has to sort too or every run reports a diff made entirely of key
 * ordering. Array order is deliberately preserved: `required` is an array whose
 * order IS part of the schema's identity, and a reordering there is exactly the
 * kind of silent drift this check exists to catch.
 */
function canonical(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, val: unknown) => {
      if (val === null || typeof val !== 'object' || Array.isArray(val)) return val
      const obj = val as Record<string, unknown>
      const sorted: Record<string, unknown> = {}
      for (const k of Object.keys(obj).sort()) sorted[k] = obj[k]
      return sorted
    },
    2,
  )
}

async function listRegisteredTools() {
  // Imported dynamically so the env assignments above are in place first.
  const { buildMcpServer } = await import('../src/lib/mcp/server')

  // The user id is never dereferenced: listing tools reads registration
  // metadata and calls no handler.
  const server = buildMcpServer({ userId: '00000000-0000-0000-0000-000000000000' })
  const client = new Client({ name: 'check-mcp-tools', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    const { tools } = await client.listTools()
    return [...tools].sort((a, b) => a.name.localeCompare(b.name))
  } finally {
    await client.close()
    await server.close()
  }
}

const actual = await listRegisteredTools()

if (actual.length !== EXPECTED_COUNT) {
  console.error(`FAIL: expected ${EXPECTED_COUNT} tools, got ${actual.length}`)
  process.exit(1)
}

// Re-baselining is deliberately an explicit, separate invocation. The whole
// value of this check is that drift has to be looked at by a person; a script
// that silently rewrote its own oracle on failure would assert nothing. Run it
// only when the diff has been read and understood, and say so in the commit.
if (process.argv.includes('--update')) {
  writeFileSync(GOLDEN, canonical(actual) + '\n')
  console.log(`UPDATED ${GOLDEN.replace(process.cwd() + '/', '')} — ${actual.length} tools re-baselined.`)
  process.exit(0)
}

const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as unknown[]
const actualJson = canonical(actual)
const goldenJson = canonical(golden)

if (actualJson === goldenJson) {
  console.log(`OK: ${EXPECTED_COUNT} MCP tools, identical to ${GOLDEN.replace(process.cwd() + '/', '')}`)
  process.exit(0)
}

// Report the drift per tool rather than dumping two 2000-line blobs, so the
// failure names the tool that changed.
console.error(`FAIL: MCP tool catalog drifted from ${GOLDEN.replace(process.cwd() + '/', '')}\n`)

const goldenByName = new Map((golden as { name: string }[]).map((t) => [t.name, t]))
const actualByName = new Map(actual.map((t) => [t.name, t]))

for (const name of [...new Set([...goldenByName.keys(), ...actualByName.keys()])].sort()) {
  const g = goldenByName.get(name)
  const a = actualByName.get(name)
  if (!g) {
    console.error(`  + ${name} (added — not in golden)`)
    continue
  }
  if (!a) {
    console.error(`  - ${name} (removed — present in golden)`)
    continue
  }
  if (canonical(g) !== canonical(a)) {
    console.error(`  ~ ${name} (changed)`)
    console.error(`      golden: ${canonical(g).replace(/\n\s*/g, ' ').slice(0, 300)}`)
    console.error(`      actual: ${canonical(a).replace(/\n\s*/g, ' ').slice(0, 300)}`)
  }
}

console.error(
  '\nIf this change is intentional, re-capture the golden file and say so in the commit message.\n' +
    'The catalog is a public contract: renaming a tool or changing an inputSchema breaks\n' +
    'already-connected MCP clients.',
)
process.exit(1)
