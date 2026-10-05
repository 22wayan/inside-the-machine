// Misst die tatsaechliche Bildrate der Canvas-Akte waehrend echter Interaktion.
// Hintergrund: das Short Paper nennt auf der Algorithm-Ebene des Nested Model fps-Werte.
// Solche Zahlen gehoeren gemessen, nicht behauptet. Dieses Skript liefert den Beleg und
// laesst sich vom Pruefer wiederholen.
//
// Aufruf: URL=http://localhost:4173 node scripts/measure-fps.mjs
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:4173'
const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })

// Zaehlt Frames ueber ein Zeitfenster, waehrend das uebergebene Verhalten laeuft.
const measure = async (label, sectionId, drive, ms = 3000) => {
  await page.evaluate((id) => {
    const el = document.getElementById(id)
    window.scrollTo(0, el.offsetTop + Math.min(300, el.offsetHeight * 0.3))
  }, sectionId)
  await page.waitForTimeout(1200)

  await page.evaluate(() => {
    window.__frames = 0
    window.__stop = false
    const tick = () => { window.__frames++; if (!window.__stop) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
  const t0 = Date.now()
  await drive()
  const elapsed = Date.now() - t0
  const frames = await page.evaluate(() => { window.__stop = true; return window.__frames })
  const fps = frames / (elapsed / 1000)
  console.log(`${label.padEnd(28)} ${fps.toFixed(1)} fps  (${frames} Frames in ${elapsed} ms)`)
  return fps
}

// Akt 2: Punktwolke, waehrend gescrollt wird (Jahres-Durchlauf = teuerste Operation)
const fpsMap = await measure('Akt 2 (Punktwolke, Scroll)', 'map', async () => {
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(80)
  }
})

// Akt 3: Galaxie, waehrend gezoomt wird
const fpsGal = await measure('Akt 3 (Galaxie, Zoom)', 'family', async () => {
  await page.mouse.move(720, 500)
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, i % 2 ? -140 : 140)
    await page.waitForTimeout(100)
  }
})

// Akt 4: Register, waehrend umsortiert wird (Tween ueber 53 Zeilen)
const fpsLedger = await measure('Akt 4 (Register, Sortieren)', 'wildchat', async () => {
  for (let i = 0; i < 6; i++) {
    await page.evaluate((k) => {
      const heads = document.querySelectorAll('#wildchat .ledger-colhead')
      heads[k % heads.length]?.click()
    }, i)
    await page.waitForTimeout(450)
  }
})

const punkte = await page.evaluate(async () => {
  const B = document.querySelector('base')?.href || '/'
  const m = await fetch(`${B}data/map.json`).then((r) => r.json()).catch(() => null)
  const f = await fetch(`${B}data/familytree.json`).then((r) => r.json()).catch(() => null)
  return { map: m?.n ?? null, family: f?.field?.x?.length ?? null }
})

console.log('\nGerenderte Punkte laut Daten:', JSON.stringify(punkte))
console.log('Hinweis: Headless-Chromium, deviceScaleFactor 1. Auf echter Hardware kann es abweichen.')
await browser.close()
