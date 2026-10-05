// Verifikation des Visual-Upgrade-Passes: pro Akt gezielte Screenshots + Konsolenfehler.
// Aufruf: URL=http://localhost:5173 node scripts/shoot-upgrade.mjs [akt1|akt2|akt4|spot|hero|all]
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const URL = process.env.URL || 'http://localhost:5173'
const OUT = '/tmp/shots-upgrade'
const WHICH = process.argv[2] || 'all'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle', timeout: 40000 })
const want = (k) => WHICH === 'all' || WHICH === k

if (want('hero')) {
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/hero.png` })
}

if (want('akt1')) {
  // Mitte des Scroll-Wegs: Frontier halb gezeichnet, Ignite-Layer halb gezuendet
  await page.evaluate(() => {
    const el = document.getElementById('compute')
    window.scrollTo(0, el.offsetTop + el.offsetHeight * 0.45)
  })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/akt1-mid.png` })
  // Ende: alles gezuendet
  await page.evaluate(() => {
    const el = document.getElementById('compute')
    window.scrollTo(0, el.offsetTop + el.offsetHeight * 0.92)
  })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/akt1-end.png` })
  // Tooltip: einen Punkt hovern (Circles mit cursor-Style existieren jetzt)
  const dot = page.locator('#compute circle[style*="cursor"]').nth(260)
  await dot.hover({ force: true }).catch(() => {})
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/akt1-tooltip.png` })
}

if (want('akt2')) {
  await page.evaluate(() => {
    const el = document.getElementById('map')
    window.scrollTo(0, el.offsetTop + el.offsetHeight * 0.75)
  })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/akt2.png` })
}

if (want('akt4')) {
  // Deterministische Beat-Targets: scrolle auf feste Bruchteile der sticky-Buehne (Container
  // #wildchat-stage). Progress p entspricht scrollY = offsetTop + (offsetHeight - viewport)*p
  // (Framer 'start start'->'end end'), damit die BEATS-Schwellen exakt getroffen werden -> die
  // Screenshots (u3-Kartenform-Vergleich) sind reproduzierbar. p = Beat-Mitte je Fenster.
  const beats = [
    ['akt4-beat0', 0.12], // B0 Monats-Wachstum
    ['akt4-beat1', 0.35], // B1 Länderfelder nach Gesprächsvolumen
    ['akt4-beat2', 0.57], // B2 Kategorie-Farben
    ['akt4-beat3', 0.78], // B3 Graubereich (heat)
    ['akt4-explore', 0.95], // EXPLORE (freie Interaktion)
  ]
  for (const [name, p] of beats) {
    await page.evaluate((frac) => {
      const el = document.getElementById('wildchat-stage') || document.getElementById('wildchat')
      const span = Math.max(0, el.offsetHeight - window.innerHeight)
      window.scrollTo(0, el.offsetTop + span * frac)
    }, p)
    await page.waitForTimeout(1400)
    await page.screenshot({ path: `${OUT}/${name}.png` })
  }
}

if (want('spot')) {
  await page.evaluate(() => document.getElementById('spot')?.scrollIntoView({ block: 'start' }))
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/spot-start.png` })
  await page.locator('#spot .quiz-card').first().click().catch(() => {})
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/spot-reveal.png` })
  // Bis zum Ergebnis durchklicken: je Frage erste Karte, dann Weiter
  for (let i = 0; i < 12; i++) {
    const next = page.locator('#spot button:has-text("Weiter"), #spot button:has-text("Ergebnis")').first()
    if (await next.count()) { await next.click().catch(() => {}); await page.waitForTimeout(350) }
    const card = page.locator('#spot .quiz-card:not(:disabled), #spot button[data-pick]').first()
    if (await card.count()) { await card.click().catch(() => {}); await page.waitForTimeout(350) }
  }
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/spot-result.png` })
}

const real = errors.filter((e) => !/favicon|fonts.gstatic|fonts.googleapis/i.test(e))
console.log('Konsolen-Fehler gesamt:', errors.length, '| relevant:', real.length)
real.slice(0, 12).forEach((e) => console.log('  !', e.slice(0, 200)))
await browser.close()
// Exit-Code an 0 relevante Konsolenfehler koppeln (u3 nutzt den Screenshot-Lauf als Smoke-Gate).
process.exit(real.length ? 1 : 0)
