// Headless-Render- und Layout-Check fuer "Inside the Machine".
// Prueft die harten Layout-Regeln visuell: nichts gecappt, nichts ueberlappend, Visualisierung gross.
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const URL = process.env.URL || 'http://localhost:5180'
const OUT = '/tmp/shots-iai'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto(URL, { waitUntil: 'networkidle', timeout: 40000 })
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/0-hero.png` })

// Akt 1 Compute: in den Blick scrollen, Animation abwarten
await page.evaluate(() => document.getElementById('compute')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(2400)
await page.screenshot({ path: `${OUT}/1-compute.png` })
// Hover-Tooltip auf einem Modell-Punkt pruefen
await page.locator('#compute circle[style*="cursor"]').nth(180).hover({ force: true }).catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/1-compute-hover.png` })

// Akt 2 Map of AI: scrollen, Auto-Play der Jahre abwarten (Karte fuellt sich)
await page.evaluate(() => document.getElementById('map')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(11500)
await page.screenshot({ path: `${OUT}/1b-map.png` })

// Akt 3 Family Tree: scrollen, Force-Simulation absetzen lassen
await page.evaluate(() => document.getElementById('family')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(3500)
await page.screenshot({ path: `${OUT}/2-family.png` })

// Akt 4 WildChat
await page.evaluate(() => document.getElementById('wildchat')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(6000)
await page.screenshot({ path: `${OUT}/3-wildchat.png` })

// Akt 5 Spot the Machine: Startzustand + ein Klick (Reveal pruefen)
await page.evaluate(() => document.getElementById('spot')?.scrollIntoView({ block: 'start' }))
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/4-spot.png` })
await page.locator('#spot button').first().click().catch(() => {})
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/4-spot-reveal.png` })

// Gesamtseite (Layout-Fluss, Whitespace-Check)
await page.screenshot({ path: `${OUT}/full.png`, fullPage: true })

// Mobil-Check (Layout darf nicht brechen)
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } })
await mob.goto(URL, { waitUntil: 'networkidle', timeout: 40000 })
await mob.evaluate(() => document.getElementById('compute')?.scrollIntoView({ block: 'start' }))
await mob.waitForTimeout(1800)
await mob.screenshot({ path: `${OUT}/mobile-compute.png` })
await mob.close()

const real = errors.filter((e) => !/favicon|fonts.gstatic|fonts.googleapis/i.test(e))
console.log('Konsolen-Fehler gesamt:', errors.length, '| relevant:', real.length)
real.slice(0, 12).forEach((e) => console.log('  !', e.slice(0, 200)))
await browser.close()
process.exit(0)
