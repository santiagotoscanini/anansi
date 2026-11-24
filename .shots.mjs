// node .shots.mjs <outdir> <scheme: dark|light> <width> <paths...>
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const [out, scheme, width, ...paths] = process.argv.slice(2)
const token = readFileSync(process.env.TOKFILE, 'utf8').trim()
const browser = await chromium.launch({ executablePath: process.env.CHROME })
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(width) < 600 ? 844 : 900 }, colorScheme: scheme, deviceScaleFactor: 1 })
await ctx.addCookies([{ name: 'authjs.session-token', value: token, domain: 'localhost', path: '/' }])
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message))
for (const p of paths) {
  await page.goto(`http://localhost:5180${p}`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  const name = p.replace(/[/?=&]+/g, '_').replace(/^_/, '') || 'root'
  // The tab scrolls inside its own container; expand it so a full-page shot shows everything.
  await page.addStyleTag({ content: 'main.h-screen{height:auto!important;min-height:100vh} main .overflow-auto,main .overflow-y-auto,main .h-full{height:auto!important;overflow:visible!important}' })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${out}/${name}-${scheme}-${width}.png`, fullPage: true })
  console.log('shot', name)
}
await browser.close()
