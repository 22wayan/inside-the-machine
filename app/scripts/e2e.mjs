// Präsentations-Smoke-Test für "Inside the Machine".
// Erwartet einen laufenden Vite-Server; URL kann per Umgebungsvariable überschrieben werden.
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:5173'
let failed = 0
const check = (condition, label) => {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}: ${label}`)
  if (!condition) failed++
}

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(URL, { waitUntil: 'networkidle', timeout: 40_000 })
await page.waitForTimeout(900)

check((await page.title()).startsWith('Inside the Machine'), 'Dokumenttitel stimmt')
for (const id of ['compute', 'map', 'family', 'wildchat', 'spot']) {
  check(await page.locator(`#${id}`).count() === 1, `#${id} vorhanden`)
}
check(await page.locator('#compute circle[style*="cursor"]').count() > 100, 'Akt 1 enthält interaktive Modellpunkte')
check(await page.locator('#family canvas').count() === 1, 'Akt 3 rendert die Galaxie')

// Akt 4 hat zwei Ebenen. Ebene 1 (die Aufteilung der 9 Nutzungs-Kategorien) ist HTML, das
// Canvas-Blatt des Registers haengt an einem Schalter und liegt vorher NICHT im DOM.
// Die Invariante bleibt deshalb exakt und wird nur zweiteilig geprueft statt auf "hoechstens
// ein Canvas" aufgeweicht: vor dem Oeffnen null, nach dem Oeffnen genau eines. Ein aufgeweichter
// Check (<= 1) waere bestanden, auch wenn das Register gar nicht mehr rendert.
check(await page.locator('#wildchat canvas').count() === 0, 'Akt 4 startet ohne Register-Canvas (Ebene 1)')
check(await page.locator('#wildchat .ledger-open-btn').count() === 1, 'Akt 4 hat den Schalter zur zweiten Ebene')
await page.locator('#wildchat .ledger-open-btn').click()
await page.waitForTimeout(900)
check(await page.locator('#wildchat canvas').count() === 1, 'Akt 4 rendert das Register nach dem Öffnen')

await page.locator('#spot').scrollIntoViewIfNeeded()
await page.waitForTimeout(500)
check((await page.locator('#spot').getByText(/Frage 1 \/ 12/).count()) === 1, 'Finale startet mit 12 Fragen')
const firstCard = page.locator('#spot .quiz-card').first()
await firstCard.click()
check((await page.locator('#spot [role="status"]').count()) === 1, 'Quiz zeigt unmittelbares Feedback')

const desktopWidth = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
check(desktopWidth[0] === desktopWidth[1], 'Kein horizontaler Overflow auf Desktop')

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
await mobile.goto(URL, { waitUntil: 'networkidle', timeout: 40_000 })
await mobile.waitForTimeout(500)
// Auch mobil MIT geoeffnetem Register messen: das 1320 px breite Blatt ist der Kandidat Nummer
// eins fuer horizontalen Seiten-Overflow, es darf nur in seinem eigenen Wrapper scrollen.
await mobile.locator('#wildchat .ledger-open-btn').click()
await mobile.waitForTimeout(900)
const mobileWidth = await mobile.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
check(mobileWidth[0] === mobileWidth[1], 'Kein horizontaler Overflow auf Mobil')
check(await mobile.locator('#spot').count() === 1, 'Finale ist mobil vorhanden')

const relevantErrors = errors.filter((e) => !/favicon|fonts\.googleapis|fonts\.gstatic/i.test(e))
check(relevantErrors.length === 0, 'Keine relevanten Konsolenfehler')
relevantErrors.slice(0, 5).forEach((e) => console.log(`    ${e.slice(0, 180)}`))

await mobile.close()
await browser.close()
process.exit(failed ? 1 : 0)
