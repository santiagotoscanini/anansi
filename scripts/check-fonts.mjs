#!/usr/bin/env node
// Verify that every one of the five typefaces actually renders — migration
// risk R3.
//
//   node scripts/check-fonts.mjs http://localhost:3001/     # TanStack Start
//   node scripts/check-fonts.mjs http://localhost:3100/     # Next (baseline)
//
// Why this exists rather than a screenshot diff: src/styles/globals.css
// terminates each font stack in `Georgia, serif` / `ui-sans-serif`, so a wrong
// family name produces no error, no warning and no build failure. The page
// renders — in the wrong typeface.
//
// HOW IT CHECKS, and why the two obvious approaches are both inadequate:
//
//   - Comparing the resolved --font-* custom property against an expected
//     string is a substring game. `--font-geist: 'Geist Sans'` (the wrong
//     @fontsource package) still "contains" Geist, so it passes while the
//     real Geist never renders.
//   - document.fonts.check() / .load() interrogates the @font-face rules,
//     which exist independently of whether any variable points at them. Both
//     halves can pass while the wiring between them is broken.
//
// So this renders a probe element in each role's actual font stack and asks
// Chrome which font it PICKED, via CDP's CSS.getPlatformFontsForNode — the
// same data DevTools shows in its "Rendered Fonts" panel. That is end-to-end:
// it fails if the variable is wrong, if the family name is wrong, if the
// weight/style subset was never imported, or if the .woff2 404s.
//
// Exits non-zero and names the offender on any failure.
//
// Playwright is deliberately NOT a dependency of this repo — scripts/
// capture-screens.sh already gets it through `npx playwright`, and adding a
// browser-shipping package to package.json for one verification script is a
// poor trade. So resolve it the same way: whatever npx already downloaded.
// Override with PLAYWRIGHT_PATH=/path/to/node_modules/playwright if needed.
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

  // The npx cache usually holds several playwright versions, and each one
  // pins an exact browser build number ("Executable doesn't exist at
  // .../chromium_headless_shell-1208"). Take the highest version, which is
  // the one whose browsers `npx playwright install` most recently fetched.
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
  console.error('playwright not found. Run `npx playwright install chromium` first,')
  console.error('or set PLAYWRIGHT_PATH to a node_modules/playwright directory.')
  process.exit(2)
}
// playwright is CommonJS, so a dynamic import lands its exports under
// `.default` rather than as named bindings.
const playwright = await import(pathToFileURL(join(dir, 'index.js')).href)
const { chromium } = playwright.default ?? playwright

const url = process.argv[2] ?? 'http://localhost:3001/'

// The five roles as globals.css defines them. `expect` is the family Chrome
// must report actually rendering — from .golden/font-vars.txt, i.e. what
// next/font emits today. Weight/style pairs are the ones the app declares,
// no more and no less; a missing italic subset is a real regression because
// the browser silently substitutes a synthesised oblique.
const ROLES = [
  { varName: '--font-brand', expect: 'Cormorant Garamond', weights: [400, 500, 600, 700], italic: true },
  { varName: '--font-display', expect: 'Instrument Serif', weights: [400], italic: true },
  { varName: '--font-text', expect: 'Newsreader', weights: [300, 400, 500, 600], italic: true },
  { varName: '--font-ui', expect: 'Geist', weights: [300, 400, 500, 600, 700], italic: false },
  { varName: '--font-mono', expect: 'Geist Mono', weights: [400, 500], italic: false },
]

const browser = await chromium.launch()
const page = await browser.newPage()
const cdp = await page.context().newCDPSession(page)
await cdp.send('DOM.enable')
await cdp.send('CSS.enable')

await page.goto(url, { waitUntil: 'networkidle' })

const probes = []
for (const role of ROLES) {
  for (const weight of role.weights) {
    probes.push({ ...role, weight, style: 'normal' })
    if (role.italic) probes.push({ ...role, weight, style: 'italic' })
  }
}

// One probe element per weight/style, each carrying the role's real font
// stack. Rendered off-screen but NOT display:none or visibility:hidden —
// Chrome does not resolve platform fonts for a box it never paints.
await page.evaluate((list) => {
  const host = document.createElement('div')
  host.id = 'font-probe-host'
  host.style.cssText = 'position:fixed;left:-9999px;top:0;'
  for (const [i, p] of list.entries()) {
    const el = document.createElement('div')
    el.id = `font-probe-${i}`
    el.style.fontFamily = `var(${p.varName})`
    el.style.fontWeight = String(p.weight)
    el.style.fontStyle = p.style
    el.style.fontSize = '32px'
    el.textContent = 'Anansi weaves 0123'
    host.appendChild(el)
  }
  document.body.appendChild(host)
}, probes)

// Give the lazily-fetched faces a chance to arrive now that something uses them.
await page.evaluate(() => document.fonts.ready)

const { root } = await cdp.send('DOM.getDocument', { depth: -1 })

const failures = []
const perRole = new Map(ROLES.map((r) => [r.varName, { ok: 0, total: 0 }]))
const rendered = []

for (const [i, p] of probes.entries()) {
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `#font-probe-${i}` })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })

  // getPlatformFontsForNode returns every font used for the node's text,
  // ordered by glyph count. The first is what rendered the bulk of it.
  //
  // The value is the PLATFORM font name, not the CSS family: Chrome reports
  // the face's internal full name, so weight 500 of Geist comes back as
  // "Geist Medium" and Newsreader carries its optical-size axis as
  // "Newsreader 16pt 16pt SemiBold". Hence a prefix test rather than
  // equality. That is still sufficient to catch R3's actual failure mode —
  // a fallback renders as "Georgia" or ".AppleSystemUIFont", which shares no
  // prefix with any expected family.
  const actual = fonts?.[0]?.familyName ?? '(none)'
  const tally = perRole.get(p.varName)
  tally.total++
  rendered.push({ probe: `${p.varName} ${p.weight} ${p.style}`, actual })

  if (actual.startsWith(p.expect)) {
    tally.ok++
  } else {
    failures.push(`${p.varName} @ ${p.weight} ${p.style}: expected a "${p.expect}" face, Chrome rendered "${actual}"`)
  }
}

await browser.close()

for (const role of ROLES) {
  const t = perRole.get(role.varName)
  const mark = t.ok === t.total ? 'ok  ' : 'FAIL'
  console.log(`${mark} ${role.varName} → ${role.expect} (${t.ok}/${t.total} faces rendered)`)
}

// The exact platform names, for diffing one stack against the other. The
// pass/fail above answers "did anything fall back to Georgia"; this table
// answers the migration's real question, "does Start render what Next
// rendered", which no hardcoded expectation can capture.
if (process.env.DUMP === '1') {
  console.log('')
  for (const r of rendered) console.log(`${r.probe.padEnd(28)} ${r.actual}`)
}

if (failures.length) {
  console.error('')
  for (const f of failures) console.error(`  ${f}`)
  console.error(`\n${failures.length} of ${probes.length} probes failed at ${url}`)
  process.exit(1)
}
console.log(`\nall ${probes.length} font probes render a correct face at ${url}`)
