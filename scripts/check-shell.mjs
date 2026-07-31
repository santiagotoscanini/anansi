#!/usr/bin/env node
// Verify the document shell — theme and sidebar geometry — is correct in the
// SERVER's HTML, not merely after hydration.
//
//   node scripts/check-shell.mjs http://localhost:5173/
//
// Both failures this guards are flashes, and a flash is invisible to every
// assertion that runs after the page settles: the client always converges on
// the right theme and the right sidebar width, so "is the page dark?" and "is
// the sidebar collapsed?" pass whether or not the user saw a white frame and a
// width jump first. The only meaningful question is what the server sent, so
// that is what gets asserted — from the raw HTML, before any script has run.
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function resolvePlaywrightDir() {
  if (process.env.PLAYWRIGHT_PATH) return process.env.PLAYWRIGHT_PATH
  const npxCache = join(homedir(), '.npm', '_npx')
  let entries
  try {
    entries = readdirSync(npxCache)
  } catch {
    return null
  }
  const found = []
  for (const entry of entries) {
    const candidate = join(npxCache, entry, 'node_modules', 'playwright')
    try {
      const { version } = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf8'))
      found.push({ dir: candidate, version })
    } catch {
      /* not a playwright install */
    }
  }
  if (!found.length) return null
  found.sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
  return found[found.length - 1].dir
}

const BASE = process.argv[2] ?? 'http://localhost:5173/'
const origin = new URL(BASE).origin

let fails = 0
function ok(label, cond, extra = '') {
  if (!cond) fails++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

const themeOf = (html) => /<html[^>]*\sdata-theme="([a-z]+)"/.exec(html)?.[1]

// ── 1. raw SSR output, no browser involved ───────────────────────────────
const noCookie = await fetch(BASE).then((r) => r.text())
ok('no cookie → server sends data-theme="light"', themeOf(noCookie) === 'light', `got ${themeOf(noCookie)}`)

const darkCookie = await fetch(BASE, { headers: { cookie: 'anansi:theme-resolved=dark' } }).then((r) => r.text())
ok('dark cookie → server sends data-theme="dark"', themeOf(darkCookie) === 'dark', `got ${themeOf(darkCookie)}`)

const junkCookie = await fetch(BASE, { headers: { cookie: 'anansi:theme-resolved=neon' } }).then((r) => r.text())
ok('unrecognised cookie falls back to light', themeOf(junkCookie) === 'light', `got ${themeOf(junkCookie)}`)

// ── 2. the round trip: does the client actually write that cookie? ───────
const dir = resolvePlaywrightDir()
if (!dir) {
  console.error('playwright not found; run `npx playwright install chromium` first')
  process.exit(1)
}
const { chromium } = await import(pathToFileURL(join(dir, 'index.mjs')).href)
const browser = await chromium.launch()

async function withScheme(colorScheme) {
  const ctx = await browser.newContext({ colorScheme })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  const cookie = (await ctx.cookies()).find((c) => c.name === 'anansi:theme-resolved')?.value
  return { ctx, page, applied, cookie }
}

const dark = await withScheme('dark')
ok('OS dark → ThemeSync applies dark', dark.applied === 'dark', `got ${dark.applied}`)
ok('OS dark → cookie written as dark', dark.cookie === 'dark', `got ${dark.cookie}`)

// The payoff: reload in the SAME context, so the cookie written above is sent.
// The server must now paint dark on its own, with no help from any script.
const reloaded = await dark.page.goto(BASE, { waitUntil: 'commit' })
const html = await reloaded.text()
ok('a returning dark-mode visitor gets dark markup (no flash)', themeOf(html) === 'dark', `got ${themeOf(html)}`)
await dark.ctx.close()

const light = await withScheme('light')
ok('OS light → cookie written as light', light.cookie === 'light', `got ${light.cookie}`)
await light.ctx.close()

// ── 3. an explicit preference must beat the OS ───────────────────────────
const ctx = await browser.newContext({ colorScheme: 'dark' })
await ctx.addCookies([{ name: 'anansi:theme-resolved', value: 'dark', url: origin }])
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'load' })
await page.evaluate(() => window.localStorage.setItem('anansi:theme', 'light'))
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(800)
const applied = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
const cookie = (await ctx.cookies()).find((c) => c.name === 'anansi:theme-resolved')?.value
ok('explicit light preference overrides OS dark', applied === 'light', `got ${applied}`)
ok('...and rewrites the cookie so SSR agrees next time', cookie === 'light', `got ${cookie}`)
await ctx.close()

// ── 4. sidebar geometry (needs a session — the shell lives under /app) ───
const EMAIL = process.env.TEST_EMAIL ?? 'santi@test.local'
const PASSWORD = process.env.TEST_PASSWORD ?? 'devpassword12345'

const csrfRes = await fetch(`${origin}/api/auth/csrf`)
const { csrfToken } = await csrfRes.json()
const csrfCookie = csrfRes.headers
  .getSetCookie()
  .map((c) => c.split(';')[0])
  .join('; ')
const signInRes = await fetch(`${origin}/api/auth/callback/credentials`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: csrfCookie },
  body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD }),
})
const sessionCookie = signInRes.headers.getSetCookie().find((c) => c.includes('authjs.session-token='))
if (!sessionCookie) {
  console.log('FAIL  sign-in for the sidebar checks — no session cookie')
  await browser.close()
  process.exit(1)
}
const [sessionPair] = sessionCookie.split(';')
const sessionEq = sessionPair.indexOf('=')
const sessionCookieSpec = {
  name: sessionPair.slice(0, sessionEq),
  value: sessionPair.slice(sessionEq + 1),
  domain: 'localhost',
  path: '/',
  httpOnly: true,
}

// The sidebar is rendered with an inline width, so the server's choice is
// legible in the raw HTML. Grab the widest `width:NNNpx` in the <aside>.
const sidebarWidthOf = (html) => {
  const aside = /<aside[^>]*>/.exec(html)?.[0] ?? ''
  return Number.parseInt(/width:\s*(\d+)px/.exec(aside)?.[1] ?? '', 10)
}

const appCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await appCtx.addCookies([sessionCookieSpec])
const appPage = await appCtx.newPage()
await appPage.goto(`${origin}/app`, { waitUntil: 'load' })
await appPage.waitForTimeout(1000)

const defaultCookie = (await appCtx.cookies()).find((c) => c.name === 'anansi:sidebar')?.value
ok('a wide viewport writes an expanded sidebar cookie', defaultCookie === '0:224', `got ${defaultCookie}`)

// Collapse it, then reload and read what the SERVER sent.
//
// Cookies are set through the context rather than document.cookie, and every
// navigation settles before the next step: the client rewrites this cookie on
// mount, so mutating it while a previous page is still hydrating lets that
// write land afterwards and clobber the value under test.
await appCtx.addCookies([{ name: 'anansi:sidebar', value: '1:224', url: origin }])
const collapsedResp = await appPage.goto(`${origin}/app`, { waitUntil: 'commit' })
const collapsedHtml = await collapsedResp.text()
ok(
  'a collapsed cookie makes the server render the 56px rail',
  sidebarWidthOf(collapsedHtml) === 56,
  `got ${sidebarWidthOf(collapsedHtml)}px`,
)

// A custom width must survive the same way.
await appPage.waitForTimeout(1200)
await appCtx.addCookies([{ name: 'anansi:sidebar', value: '0:320', url: origin }])
const wideResp = await appPage.goto(`${origin}/app`, { waitUntil: 'commit' })
const wideHtml = await wideResp.text()
ok('a custom width is server-rendered', sidebarWidthOf(wideHtml) === 320, `got ${sidebarWidthOf(wideHtml)}px`)

await appPage.waitForTimeout(1200)

// ...and no hydration error while doing it.
const sidebarErrors = []
appPage.on('console', (m) => {
  if (m.type() === 'error') sidebarErrors.push(m.text())
})
appPage.on('pageerror', (e) => sidebarErrors.push(String(e)))
await appPage.goto(`${origin}/app`, { waitUntil: 'load' })
await appPage.waitForTimeout(1200)
const sidebarHydration = sidebarErrors.filter((e) =>
  /hydrat|did not match|Minified React error #(418|423|425)/i.test(e),
)
ok('no hydration errors in the shell', sidebarHydration.length === 0, sidebarHydration.slice(0, 1).join(''))

const appliedWidth = await appPage.evaluate(() => document.querySelector('aside')?.style.width)
ok('the client agrees with the server after hydration', appliedWidth === '320px', `got ${appliedWidth}`)

// A narrow viewport must still force-collapse regardless of the cookie — the
// one input the cookie cannot encode.
const narrowCtx = await browser.newContext({ viewport: { width: 900, height: 900 } })
await narrowCtx.addCookies([sessionCookieSpec, { name: 'anansi:sidebar', value: '0:320', url: origin }])
const narrowPage = await narrowCtx.newPage()
await narrowPage.goto(`${origin}/app`, { waitUntil: 'load' })
await narrowPage.waitForTimeout(1000)
const narrowWidth = await narrowPage.evaluate(() => document.querySelector('aside')?.style.width)
ok('a narrow viewport still force-collapses', narrowWidth === '56px', `got ${narrowWidth}`)
const narrowCookie = (await narrowCtx.cookies()).find((c) => c.name === 'anansi:sidebar')?.value
ok('...and the cookie records the collapsed result', narrowCookie === '1:320', `got ${narrowCookie}`)

await narrowCtx.close()
await appCtx.close()

await browser.close()
console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`)
process.exit(fails === 0 ? 0 : 1)
