#!/usr/bin/env node
// Verify that code-split translations still render, and still render at the
// right moment.
//
//   node scripts/check-i18n.mjs http://localhost:5173/
//
// Why this exists rather than a screenshot diff: since Phase 4b the language
// bundles are separate chunks fetched at runtime, and i18next does not block on
// a missing bundle — it renders the raw key path ("landing.hero.title") and
// carries on. Every failure mode here is therefore silent to the build:
//
//   - hydrating before the chunk lands paints key paths over correct server
//     HTML, which React repairs by re-rendering — a visible flash, no error;
//   - a locale whose chunk 404s renders key paths permanently, still HTTP 200;
//   - loading BOTH bundles eagerly (the regression this phase removed) costs
//     ~37 KB gzipped on first paint and is invisible in every functional test.
//
// So the assertions are: correct language in the DOM, zero key paths, zero
// hydration errors, and exactly one locale chunk on the wire.
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

const dir = resolvePlaywrightDir()
if (!dir) {
  console.error('playwright not found; run `npx playwright install chromium` first')
  process.exit(1)
}
const { chromium } = await import(pathToFileURL(join(dir, 'index.mjs')).href)

const BASE = process.argv[2] ?? 'http://localhost:5173/'
const origin = new URL(BASE).origin

let fails = 0
function ok(label, cond, extra = '') {
  if (!cond) fails++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`)
}

const browser = await chromium.launch()

// A key path that leaked into the DOM instead of being translated. Matches
// "landing.hero.title" but not prose containing a period, by requiring every
// segment to be identifier-shaped and the whole string to be the entire text
// node (i18next emits the key alone when it cannot resolve it).
const KEY_PATH = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+){1,}$/

async function visit({ label, url, cookie, expectLang, expectText, expectChunks }) {
  const ctx = await browser.newContext()
  if (cookie) {
    await ctx.addCookies([{ name: 'anansi:locale', value: cookie, url: origin }])
  }
  const page = await ctx.newPage()

  const chunks = []
  page.on('request', (r) => {
    const m = /\/([a-z]{2})-[A-Za-z0-9_-]+\.js$/.exec(new URL(r.url()).pathname)
    // Dev serves modules by source path; prod serves hashed chunks. Match both.
    if (m && ['en', 'es'].includes(m[1])) chunks.push(m[1])
    if (/locales\/(en|es)\.json/.test(r.url())) chunks.push(/locales\/(en)\.json/.test(r.url()) ? 'en' : 'es')
  })

  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto(url, { waitUntil: 'load' })
  // Let hydration and any post-hydration language switch settle.
  await page.waitForTimeout(1500)

  console.log(`\n--- ${label} ---`)

  const lang = await page.evaluate(() => document.documentElement.lang)
  ok(`${label}: <html lang> is ${expectLang}`, lang === expectLang, `got ${lang}`)

  const i18nLang = await page.evaluate(() => document.documentElement.getAttribute('lang'))
  ok(
    `${label}: page renders ${expectLang} copy`,
    (await page.content()).includes(expectText),
    `looking for "${expectText}"`,
  )

  const leaked = await page.evaluate((src) => {
    const re = new RegExp(src)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const out = []
    while (walker.nextNode()) {
      const t = walker.currentNode.textContent?.trim() ?? ''
      if (t && re.test(t)) out.push(t)
    }
    return out.slice(0, 5)
  }, KEY_PATH.source)
  ok(`${label}: no untranslated key paths in the DOM`, leaked.length === 0, leaked.join(', '))

  // React logs hydration mismatches as console errors. Anything here means the
  // client rendered something different from the server HTML.
  const hydration = errors.filter((e) => /hydrat|did not match|Minified React error #(418|423|425)/i.test(e))
  ok(`${label}: no hydration errors`, hydration.length === 0, hydration.slice(0, 2).join(' | '))

  const unique = [...new Set(chunks)]
  ok(
    `${label}: fetched locale bundles = [${expectChunks.join(', ')}]`,
    unique.length === expectChunks.length && expectChunks.every((c) => unique.includes(c)),
    `got [${unique.join(', ')}]`,
  )

  void i18nLang
  await ctx.close()
}

// 1. Default visitor: English only. The Spanish bundle must never be requested —
//    that is the whole point of the split.
await visit({
  label: 'no cookie',
  url: BASE,
  expectLang: 'en',
  expectText: 'Goals',
  expectChunks: ['en'],
})

// 2. Spanish cookie: server renders Spanish, client hydrates Spanish, and the
//    English bundle is never fetched.
await visit({
  label: 'es cookie',
  url: BASE,
  cookie: 'es',
  expectLang: 'es',
  expectText: 'Objetivos',
  expectChunks: ['es'],
})

// 3. ?locale=es with no cookie. The param is read by the root loader, so the
//    SERVER renders Spanish and only the Spanish bundle is ever fetched — the
//    English one must not appear. Before the loader honoured the param this
//    server-rendered English, hydrated English, then swapped to Spanish: a
//    hydration mismatch, two bundles on the wire, and a page crawlers only saw
//    in English. All three are asserted away here.
await visit({
  label: '?locale=es shareable link',
  url: `${BASE}?locale=es`,
  expectLang: 'es',
  expectText: 'Objetivos',
  expectChunks: ['es'],
})

await browser.close()
console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`)
process.exit(fails === 0 ? 0 : 1)
