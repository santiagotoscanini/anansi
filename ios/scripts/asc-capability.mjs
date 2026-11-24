// Turns a capability on for the app's App ID through the App Store Connect API, if it is not on already.
// Usage: node scripts/asc-capability.mjs <bundle id> <CAPABILITY_TYPE>   (e.g. com.example.app HEALTHKIT)
// Env: ASC_KEY_PATH (the .p8), ASC_KEY_ID, ASC_ISSUER_ID — the same key the export signs with.
//
// Xcode's cloud signing makes a profile from the App ID's capabilities, so an entitlement the App ID lacks fails
// the export. Run before exporting a build that adds one.
import { createPrivateKey, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const [bundleId, capability] = process.argv.slice(2)
const { ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID } = process.env
if (!bundleId || !capability || !ASC_KEY_PATH || !ASC_KEY_ID || !ASC_ISSUER_ID) {
  console.error('usage: ASC_KEY_PATH=… ASC_KEY_ID=… ASC_ISSUER_ID=… node asc-capability.mjs <bundle id> <CAPABILITY>')
  process.exit(2)
}

const b64 = (data) => Buffer.from(data).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const head = b64(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' }))
const body = b64(JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }))
const key = createPrivateKey(readFileSync(ASC_KEY_PATH))
const signature = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' })
const token = `${head}.${body}.${b64(signature)}`

async function api(method, path, payload) {
  const res = await fetch(`https://api.appstoreconnect.apple.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

const found = await api('GET', `/bundleIds?filter[identifier]=${encodeURIComponent(bundleId)}&limit=5`)
const app = found.data.find((b) => b.attributes.identifier === bundleId)
if (!app) throw new Error(`No App ID ${bundleId}`)
const caps = await api('GET', `/bundleIds/${app.id}/bundleIdCapabilities`)
if (caps.data.some((c) => c.attributes.capabilityType === capability)) {
  console.log(`${capability} is already on for ${bundleId}`)
} else {
  await api('POST', '/bundleIdCapabilities', {
    data: {
      type: 'bundleIdCapabilities',
      attributes: { capabilityType: capability },
      relationships: { bundleId: { data: { type: 'bundleIds', id: app.id } } },
    },
  })
  console.log(`${capability} turned on for ${bundleId}`)
}
