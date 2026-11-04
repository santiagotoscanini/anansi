#!/usr/bin/env node
// TestFlight feedback for the iPhone app: the crash reports testers shared (with their full crash logs) and the
// screenshot feedback, read with the App Store Connect API key the deploy already uses. Run by
// .github/workflows/testflight-feedback.yml, so the crashes can be read without a Mac.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_P8=/path/AuthKey.p8 node ios/scripts/testflight-feedback.mjs <out-dir>
//
// Writes <out-dir>/summary.md and one <out-dir>/crash-<date>-<id>.txt per crash log.
import { sign } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BUNDLE_ID = 'com.santiagotoscanini.anansi'
const API = 'https://api.appstoreconnect.apple.com'

const keyId = process.env.ASC_KEY_ID
const issuerId = process.env.ASC_ISSUER_ID
const keyPath = process.env.ASC_KEY_P8
const outDir = process.argv[2] ?? 'testflight-feedback'
if (!keyId || !issuerId || !keyPath) {
  console.error('ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 are required')
  process.exit(2)
}

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

// An ES256 JWT, valid for 15 minutes (Apple allows 20).
function token() {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iss: issuerId, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }))
  const input = `${header}.${payload}`
  const signature = sign('sha256', Buffer.from(input), { key: readFileSync(keyPath), dsaEncoding: 'ieee-p1363' })
  return `${input}.${base64url(signature)}`
}

const bearer = token()

async function get(path) {
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    headers: { authorization: `Bearer ${bearer}` },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status} on ${path}: ${text.slice(0, 500)}`)
  return JSON.parse(text)
}

// Every page of a collection.
async function all(path) {
  const rows = []
  let next = path
  while (next) {
    const page = await get(next)
    rows.push(...page.data)
    next = page.links?.next
  }
  return rows
}

const apps = await get(`/v1/apps?filter[bundleId]=${BUNDLE_ID}`)
const app = apps.data[0]
if (!app) throw new Error(`No app with bundle ID ${BUNDLE_ID}`)

const builds = await all(`/v1/builds?filter[app]=${app.id}&limit=200&fields[builds]=version,uploadedDate`)
const buildVersion = new Map(builds.map((b) => [b.id, b.attributes.version]))

const crashes = await all(`/v1/apps/${app.id}/betaFeedbackCrashSubmissions?limit=100&include=build`)
const screenshots = await all(`/v1/apps/${app.id}/betaFeedbackScreenshotSubmissions?limit=100&include=build`)

mkdirSync(outDir, { recursive: true })
const lines = [`# TestFlight feedback for ${BUNDLE_ID}`, '']

function describe(row) {
  const a = row.attributes
  const build = buildVersion.get(row.relationships?.build?.data?.id) ?? '?'
  return `${a.createdDate} · build ${build} · ${a.deviceModel ?? '?'} · iOS ${a.osVersion ?? '?'}`
}

lines.push(`## Crashes (${crashes.length})`, '')
for (const crash of crashes) {
  lines.push(`- ${describe(crash)}${crash.attributes.comment ? ` · "${crash.attributes.comment}"` : ''}`)
  try {
    const log = await get(`/v1/betaFeedbackCrashSubmissions/${crash.id}/crashLog`)
    const file = `crash-${crash.attributes.createdDate.slice(0, 19).replaceAll(':', '')}-${crash.id}.txt`
    writeFileSync(join(outDir, file), log.data.attributes.logText ?? '')
    lines.push(`  - log: ${file}`)
  } catch (error) {
    lines.push(`  - no log: ${error.message}`)
  }
}

lines.push('', `## Screenshot feedback (${screenshots.length})`, '')
for (const shot of screenshots) {
  lines.push(`- ${describe(shot)}${shot.attributes.comment ? ` · "${shot.attributes.comment}"` : ''}`)
}

writeFileSync(join(outDir, 'summary.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
