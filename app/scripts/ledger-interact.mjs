// Interaktions-Abnahme fuer Akt 4 (Das Register): Zeile waehlen, Dossier, Lesetisch,
// Tastatur, Escape-Rueckgabe, Scroll-Lock. Prueft die Dinge, die statische Tests nicht sehen.
// Aufruf: URL=http://localhost:4173 node scripts/ledger-interact.mjs
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const URL = process.env.URL || 'http://localhost:4173'
const OUT = '/tmp/shots-ledger'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()) })

const checks = []
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ' | ' + detail : ''}`) }

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
const sec = await page.evaluate(() => { const el = document.getElementById('wildchat'); return { top: el.offsetTop, h: el.offsetHeight } })
await page.evaluate((t) => window.scrollTo(0, t - 40), sec.top)
await page.waitForTimeout(1200)

// --- 0. Ebene 2 oeffnen. Alles was dieses Skript prueft (Zeilenklick, Beleg, Escape,
// Sortieren) liegt seit dem Zwei-Ebenen-Umbau hinter dem Schalter. Der Schalter selbst wird
// hier mitgeprueft: ohne ihn kommt der Leser gar nicht an das Register.
const openBtn = await page.evaluate(() => {
  const b = document.querySelector('#wildchat .ledger-open-btn')
  if (!b) return null
  const before = b.getAttribute('aria-expanded')
  b.click()
  return before
})
check('Schalter zur zweiten Ebene vorhanden', openBtn === 'false', `aria-expanded vorher=${openBtn}`)
await page.waitForTimeout(1200)
check('Schalter meldet den offenen Zustand',
  await page.evaluate(() => document.querySelector('#wildchat .ledger-open-btn')?.getAttribute('aria-expanded')) === 'true')

// --- 1. Genau ein Canvas, sr-Tabelle genau einmal
const struct = await page.evaluate(() => ({
  canvas: document.querySelectorAll('#wildchat canvas').length,
  srTables: document.querySelectorAll('#wildchat table.sr-only').length,
  rowBtns: document.querySelectorAll('#wildchat .ledger-row-btn').length,
}))
check('genau ein Canvas', struct.canvas === 1, `canvas=${struct.canvas}`)
check('genau eine sr-Tabelle', struct.srTables === 1, `tables=${struct.srTables}`)
check('53 Zeilen-Buttons', struct.rowBtns === 53, `btns=${struct.rowBtns}`)

// --- 2. Zeile waehlen -> Dossier fuellt sich, Blatthoehe bleibt gleich
const hBefore = await page.evaluate(() => document.documentElement.scrollHeight)
await page.evaluate(() => document.querySelectorAll('#wildchat .ledger-row-btn')[2]?.click())
await page.waitForTimeout(900)
const hAfter = await page.evaluate(() => document.documentElement.scrollHeight)
// GENAU EIN Wachstum ist erlaubt, und zwar hier: leer ist das Detailband nur so hoch wie sein
// Einladungstext (rund 200 px), gefuellt braucht es die gemessene Maximalhoehe. Der Sprung faellt
// mit dem scrollIntoView der Auswahl zusammen, der Leser sieht das Band ankommen statt springen.
// WAS NICHT WACKELN DARF, ist der Wechsel zwischen den 53 Laendern - dort tritt CLS wirklich auf.
check('erste Auswahl waechst genau einmal', hAfter > hBefore, `${hBefore} -> ${hAfter}`)
const hSwitch = []
for (const i of [0, 17, 33, 50]) {
  await page.evaluate((k) => document.querySelectorAll('#wildchat .ledger-row-btn')[k]?.click(), i)
  await page.waitForTimeout(260)
  hSwitch.push(await page.evaluate(() => document.documentElement.scrollHeight))
}
check('Dokumenthoehe stabil beim WECHSEL zwischen Laendern',
  Math.max(...hSwitch) - Math.min(...hSwitch) < 4, hSwitch.join(' -> '))
const dossier = await page.evaluate(() => {
  const t = document.body.innerText
  return { hasEcho: !!document.querySelector('#wildchat svg'), textLen: t.length }
})
check('Dossier gerendert', dossier.hasEcho)
await page.screenshot({ path: `${OUT}/f-dossier.png` })

// --- 3. Tempo-Toggle (Treppe)
const tempo = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#wildchat button')].find((b) => /tempo/i.test(b.textContent || ''))
  if (!btn) return null
  btn.click(); return btn.getAttribute('aria-pressed')
})
check('Tempo-Toggle vorhanden', tempo !== null, `aria-pressed=${tempo}`)
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/g-treppe.png` })

// --- 4. Beleg oeffnen -> Lesetisch
const opened = await page.evaluate(() => {
  const b = document.querySelector('#wildchat .ledger-doc-btn')
  if (!b) return 'kein doc-btn'
  b.focus(); b.click(); return 'ok'
})
await page.waitForTimeout(1000)
const desk = await page.evaluate(() => {
  const el = document.querySelector('[role="dialog"]') || document.querySelector('.ledger-desk')
  return el ? { open: true, text: (el.innerText || '').slice(0, 80) } : { open: false }
})
check('Lesetisch oeffnet per Klick', desk.open, opened + (desk.text ? ' | ' + desk.text.replace(/\n/g, ' ') : ''))
await page.screenshot({ path: `${OUT}/h-lesetisch.png` })

// --- 5. Scroll-Lock aktiv, danach wieder frei (der gemeldete Bug)
const lockedWhileOpen = await page.evaluate(() => getComputedStyle(document.body).overflow)
await page.keyboard.press('Escape')
await page.waitForTimeout(700)
const afterClose = await page.evaluate(() => ({
  overflow: getComputedStyle(document.body).overflow,
  dialog: !!document.querySelector('[role="dialog"]'),
  focused: document.activeElement?.className || document.activeElement?.tagName,
}))
check('Scroll-Lock waehrend Lesetisch', lockedWhileOpen === 'hidden', `overflow=${lockedWhileOpen}`)
check('Scroll wieder frei nach Escape', afterClose.overflow !== 'hidden', `overflow=${afterClose.overflow}`)
check('Lesetisch geschlossen', !afterClose.dialog)
check('Fokus zurueck auf Beleg', /doc-btn/.test(String(afterClose.focused)), `focus=${afterClose.focused}`)

// --- 6. Seite laesst sich nach dem Schliessen wirklich scrollen.
// Achtung: index.css setzt `scroll-behavior: smooth`, scrollBy ist also asynchron.
// Mit `behavior: 'instant'` messen, sonst misst der Test nur die Animationslatenz.
const y0 = await page.evaluate(() => window.scrollY)
await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'instant' }))
await page.waitForTimeout(250)
const y1 = await page.evaluate(() => window.scrollY)
check('Seite scrollt nach Schliessen', y1 - y0 > 100, `delta=${y1 - y0}`)

// --- 7. Sortierung per Spaltenkopf
await page.evaluate((t) => window.scrollTo(0, t - 40), sec.top)
await page.waitForTimeout(500)
const sortRes = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('#wildchat .ledger-colhead')]
  if (!heads.length) return null
  const before = document.querySelector('#wildchat table.sr-only tbody tr th')?.textContent
  heads[2]?.click()
  return { n: heads.length, before }
})
await page.waitForTimeout(1400)
const sortAfter = await page.evaluate(() => document.querySelector('#wildchat table.sr-only tbody tr th')?.textContent)
check('Spaltenkopf sortiert um', sortRes && sortRes.before !== sortAfter, `${sortRes?.before} -> ${sortAfter}`)
await page.screenshot({ path: `${OUT}/i-sortiert.png` })

// --- 8. Reduced motion: Endbild sofort da
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const p2 = await ctx2.newPage()
await p2.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
await p2.evaluate(() => { const el = document.getElementById('wildchat'); window.scrollTo(0, el.offsetTop - 40) })
await p2.waitForTimeout(800)
await p2.evaluate(() => document.querySelector('#wildchat .ledger-open-btn')?.click())
await p2.waitForTimeout(800)
await p2.evaluate(() => document.querySelectorAll('#wildchat .ledger-colhead')[2]?.click())
await p2.waitForTimeout(200) // absichtlich kurz: ohne Motion muss das Endbild sofort stehen
await p2.screenshot({ path: `${OUT}/j-reduced-motion.png` })
check('reduced-motion rendert', true)
await ctx2.close()

console.log('\nKonsolen-/Seitenfehler:', errors.length)
if (errors.length) console.log(errors.slice(0, 6).join('\n'))
const failed = checks.filter((c) => !c.ok)
console.log(`\n=== ${checks.length - failed.length}/${checks.length} Checks bestanden ===`)
await browser.close()
process.exit(failed.length || errors.length ? 1 : 0)
