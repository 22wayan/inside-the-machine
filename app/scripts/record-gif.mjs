// Records a short scroll-through of the built app for the README GIF.
// Usage: URL=http://localhost:4317 node scripts/record-gif.mjs  -> /tmp/itm/video/*.webm
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:4173'
const OUT = process.env.OUT || '/tmp/itm/video'
const SECTIONS = ['compute', 'map', 'family', 'wildchat', 'spot']

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
})
const page = await context.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

async function glideTo(id, ms = 2200) {
  const target = await page.evaluate((sid) => {
    const el = document.getElementById(sid)
    return el ? el.getBoundingClientRect().top + window.scrollY : null
  }, id)
  if (target == null) return
  const start = await page.evaluate(() => window.scrollY)
  const steps = Math.round(ms / 40)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    await page.evaluate((y) => window.scrollTo(0, y), start + (target - start) * eased)
    await page.waitForTimeout(40)
  }
}

for (const id of SECTIONS) {
  await glideTo(id)
  // a little further into each act so the visual, not only the headline, is on screen
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 40)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(1800)
}

await context.close()
await browser.close()
