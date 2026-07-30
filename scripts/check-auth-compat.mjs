#!/usr/bin/env node
// Prove that the Next stack and the TanStack Start stack issue and accept the
// SAME session cookie — migration risk R1.
//
//   pnpm dev        # Next,  :3100
//   pnpm dev:start  # Start, :3001
//   node scripts/check-auth-compat.mjs
//
// Why this exists: the session cookie is a JWE whose key is
//   hkdf(sha256, AUTH_SECRET, salt, `Auth.js Generated Encryption Key (${salt})`, 64)
// and `salt` DEFAULTS TO THE COOKIE NAME, which itself is `authjs.session-token`
// over http and `__Secure-authjs.session-token` over https. Any drift in the
// name, in `useSecureCookies`, or in how the request protocol is detected
// produces a wrong key — and a wrong key does not raise: decryption yields null
// and every signed-in user is silently logged out.
//
// So the checks below are not "does login work". They are:
//   1. does a cookie minted by EITHER stack resolve on BOTH,
//   2. do both stacks switch to the __Secure- name under x-forwarded-proto,
//   3. do both refuse a right-named cookie carrying the wrong salt.
//
// (2) and (3) are the negative controls, and they are the reason this script is
// worth more than a manual login. A port that hardcodes the protocol passes a
// login test and fails (2); one that hand-derives the key passes (1) and fails
// (3).
//
// Scope note: this drives each stack through its own /api/auth/* mount, which
// is the one session surface both stacks share and so the only one that can be
// compared directly. Two adjacent paths are NOT covered here:
//
//   - the Start server-fn wrappers (src/server/fn/auth.fn.ts), which call the
//     same Auth() with the same config, so they mint an identical cookie;
//   - getServerSession() (src/server/auth/session.ts), the path every page load
//     actually uses, which resolves the protocol through createActionURL rather
//     than through the request URL.
//
// Both were verified by hand in phase 3.2 (see .golden/README.md). Once an
// authenticated route exists — phase 3.4 — extend this script to hit one, and
// the getServerSession path becomes covered on every run.
const NEXT = process.env.NEXT_URL ?? 'http://localhost:3100'
const START = process.env.START_URL ?? 'http://localhost:3001'

const EMAIL = process.env.TEST_EMAIL ?? 'santi@test.local'
const PASSWORD = process.env.TEST_PASSWORD ?? 'devpassword12345'

const failures = []
const ok = (label, detail = '') => console.log(`  ok    ${label}${detail && `  ${detail}`}`)
const bad = (label, detail) => {
  console.log(`  FAIL  ${label}  ${detail}`)
  failures.push(`${label}: ${detail}`)
}

/**
 * Sign in through a stack's own Auth.js mount.
 *
 * `forwarded` simulates a TLS-terminating proxy, which is how production
 * actually runs — and which changes the cookie names, so it is not a cosmetic
 * variation of the plain call.
 */
async function signIn(origin, { forwarded = false } = {}) {
  const fwd = forwarded ? { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'anansi.example.test' } : {}

  const csrfRes = await fetch(`${origin}/api/auth/csrf`, { headers: fwd })
  if (!csrfRes.ok) throw new Error(`${origin}/api/auth/csrf → ${csrfRes.status}`)
  const { csrfToken } = await csrfRes.json()

  // The csrf cookie must come back with the POST or @auth/core rejects the token.
  const csrfCookie = csrfRes.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')

  const res = await fetch(`${origin}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { ...fwd, 'content-type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD }),
  })

  const setCookie = res.headers.getSetCookie().find((c) => c.includes('authjs.session-token='))
  if (!setCookie) throw new Error(`${origin} issued no session cookie (status ${res.status})`)
  const [pair] = setCookie.split(';')
  const eq = pair.indexOf('=')
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), secure: /;\s*Secure/i.test(setCookie) }
}

const mintCookie = async (origin) => (await signIn(origin)).value

/** Read the session back, optionally pretending to sit behind an https proxy. */
async function readSession(origin, cookieName, token, { forwardedHttps = false } = {}) {
  const headers = { cookie: `${cookieName}=${token}` }
  if (forwardedHttps) headers['x-forwarded-proto'] = 'https'
  const res = await fetch(`${origin}/api/auth/session`, { headers })
  const body = await res.json()
  return body?.user?.id ?? null
}

/** The `kid` of a JWE header is a thumbprint of the DERIVED key. Equal kid ⇒ equal key. */
function kid(token) {
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()).kid
}

console.log(`Next  ${NEXT}\nStart ${START}\n`)

const cookies = {}
for (const [name, origin] of [
  ['next', NEXT],
  ['start', START],
]) {
  try {
    cookies[name] = await mintCookie(origin)
  } catch (err) {
    bad(`${name} sign-in`, err.message)
  }
}
if (failures.length) {
  console.error('\nCould not mint a cookie — is the dev server up and the test user registered?')
  console.error(`Expected user ${EMAIL} in the database named by DATABASE_URL.`)
  process.exit(1)
}

console.log('cross-stack reads (a cookie from either stack must resolve on both)')
const seen = new Set()
for (const [issuer, token] of Object.entries(cookies)) {
  for (const [reader, origin] of [
    ['next', NEXT],
    ['start', START],
  ]) {
    const id = await readSession(origin, 'authjs.session-token', token)
    if (id) {
      seen.add(id)
      ok(`${issuer} cookie → ${reader}`, id)
    } else {
      bad(`${issuer} cookie → ${reader}`, 'resolved to null')
    }
  }
}
if (seen.size > 1) bad('user identity', `stacks disagreed: ${[...seen].join(' vs ')}`)

console.log('\nderived key (equal `kid` ⇒ both stacks derived the same encryption key)')
const kids = Object.fromEntries(Object.entries(cookies).map(([k, v]) => [k, kid(v)]))
if (kids.next === kids.start) ok('kid matches', `${kids.next.slice(0, 24)}…`)
else bad('kid differs', `next=${kids.next.slice(0, 16)}… start=${kids.start.slice(0, 16)}…`)

console.log('\nnegative controls (these MUST be null — a pass here is the whole point)')
for (const [reader, origin] of [
  ['next', NEXT],
  ['start', START],
]) {
  // Under https the cookie name gains a __Secure- prefix, so the unprefixed one
  // must not be found at all.
  const unprefixed = await readSession(origin, 'authjs.session-token', cookies.next, { forwardedHttps: true })
  if (unprefixed === null) ok(`${reader}: https + unprefixed name`, 'null')
  else bad(`${reader}: https + unprefixed name`, `resolved to ${unprefixed} — the __Secure- switch is not happening`)

  // Right name, but this token was sealed with the http-derived salt.
  const wrongSalt = await readSession(origin, '__Secure-authjs.session-token', cookies.next, { forwardedHttps: true })
  if (wrongSalt === null) ok(`${reader}: https + wrong salt`, 'null')
  else bad(`${reader}: https + wrong salt`, `resolved to ${wrongSalt} — the salt is not the cookie name`)
}

// Production terminates TLS at a proxy, so this — not the plain http case
// above — is the shape that actually ships. It also exercises the request
// rewrite in src/routes/api.auth.$.ts on a POST, i.e. with a body to preserve.
console.log('\nbehind a TLS-terminating proxy (x-forwarded-proto: https)')
for (const [label, origin] of [
  ['next', NEXT],
  ['start', START],
]) {
  try {
    const cookie = await signIn(origin, { forwarded: true })
    if (cookie.name === '__Secure-authjs.session-token' && cookie.secure) {
      ok(`${label}: issues ${cookie.name}`, 'Secure')
    } else {
      bad(`${label}: prod cookie shape`, `got name=${cookie.name} secure=${cookie.secure}`)
    }

    const id = await readSession(origin, cookie.name, cookie.value, { forwardedHttps: true })
    if (id) ok(`${label}: reads it back`, id)
    else bad(`${label}: reads it back`, 'resolved to null')
  } catch (err) {
    // A thrown error here usually means the POST body did not survive a
    // request reconstruction, so authorize() never saw the credentials.
    bad(`${label}: forwarded sign-in`, err.message)
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log('\nauth cookies are compatible in both directions')
