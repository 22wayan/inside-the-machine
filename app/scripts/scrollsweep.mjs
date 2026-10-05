// Scroll-Frame-Bughunt: faehrt die ganze Story in kleinen Schritten ab und prueft in JEDEM
// Frame auf Layout- und Laufzeitfehler. Viele Bugs zeigen sich nur in bestimmten Scroll-
// Positionen (halb gerevealte Sticky-Buehnen, Overlays die kurz ueberlappen, Canvas-Resize).
//
// Aufruf: URL=http://localhost:4173 node scripts/scrollsweep.mjs [--frames 40] [--width 1440] [--shots all|flagged|none]
// Exit 0 = keine Befunde, 1 = Befunde (Details auf stdout, Screenshots in /tmp/shots-sweep).
import { chromium } from 'playwright'
import { mkdirSync, rmSync } from 'fs'

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

const URL = process.env.URL || 'http://localhost:4173'
const FRAMES = parseInt(arg('frames', '40'), 10)
const WIDTH = parseInt(arg('width', '1440'), 10)
const HEIGHT = parseInt(arg('height', '900'), 10)
const SHOTS = arg('shots', 'flagged') // all | flagged | none
const OUT = `/tmp/shots-sweep/${WIDTH}`

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] })
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })

const runtimeErrors = []
page.on('console', (m) => { if (m.type() === 'error') runtimeErrors.push({ kind: 'console', text: m.text() }) })
page.on('pageerror', (e) => runtimeErrors.push({ kind: 'pageerror', text: e.message }))

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(1500)

// Im Frame ausgefuehrte Layout-Pruefung. Bewusst konservativ: nur klare Fehler melden,
// keine Geschmacksfragen (sonst ersaeuft der Report in Rauschen).
const inspect = () => page.evaluate(() => {
  const findings = []
  const vw = window.innerWidth
  const vh = window.innerHeight
  const doc = document.documentElement

  // Effektive Sichtbarkeit ueber die Eltern-Kette: Motion blendet Overlays per inline-opacity
  // aus. Ohne diese Pruefung meldet der Sweep gestapelte, aber unsichtbare Panels als Overlap.
  const effVisible = (el) => {
    let node = el
    let op = 1
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node)
      if (cs.visibility === 'hidden' || cs.display === 'none') return false
      op *= parseFloat(cs.opacity || '1')
      if (op < 0.08) return false
      node = node.parentElement
    }
    return true
  }
  // Liegt das Element in einem Container der ueberstehendes bewusst abschneidet?
  const clippedByAncestor = (el) => {
    let node = el.parentElement
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node)
      // hidden = abgeschnitten, auto/scroll = bewusst intern scrollbar (z.B. das breite
      // Register-Blatt auf schmalen Viewports). Beides ist kein Layout-Fehler.
      if (cs.clipPath !== 'none') return true
      if (['hidden', 'auto', 'scroll'].includes(cs.overflow) || ['hidden', 'auto', 'scroll'].includes(cs.overflowX)) return true
      node = node.parentElement
    }
    return false
  }

  // 1. Horizontaler Overflow der Seite (haeufigster Layout-Bug bei breiten Viz)
  if (doc.scrollWidth > vw + 2) {
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.right > vw + 2 || r.left < -2) && getComputedStyle(el).position !== 'fixed'
      })
      .slice(0, 4)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`)
    findings.push({ type: 'h-overflow', detail: `scrollWidth ${doc.scrollWidth} > ${vw}; Verdaechtige: ${wide.join(', ') || 'unklar'}` })
  }

  // 2. Sichtbarer Text der aus seinem Container laeuft (abgeschnitten)
  for (const el of document.querySelectorAll('p, h1, h2, h3, span, div, a, button, li, td, th')) {
    if (el.children.length > 0) continue
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    if (r.bottom < 0 || r.top > vh) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.overflow === 'hidden') continue
    if (el.scrollWidth > el.clientWidth + 6 && cs.textOverflow !== 'ellipsis' && cs.whiteSpace === 'nowrap') {
      findings.push({ type: 'text-clip', detail: `"${(el.textContent || '').trim().slice(0, 42)}" scrollW ${el.scrollWidth} > clientW ${el.clientWidth}` })
    }
  }

  // 3. Elemente die aus dem Viewport ragen obwohl sie sichtbar sein sollen (rechts/links)
  for (const el of document.querySelectorAll('svg, canvas, table, .step-card, .quiz-card')) {
    const r = el.getBoundingClientRect()
    if (r.width < 8 || r.bottom < 0 || r.top > vh) continue
    if (!effVisible(el) || clippedByAncestor(el)) continue // bewusst abgeschnitten oder unsichtbar
    if (r.right > vw + 24 || r.left < -24) {
      findings.push({ type: 'viz-overflow', detail: `${el.tagName.toLowerCase()} ragt heraus: left ${Math.round(r.left)} right ${Math.round(r.right)} (vw ${vw})` })
    }
  }

  // 4. Canvas ohne Groesse ODER mit zu kleinem Backingstore. Der zweite Fall ist der
  //    gefaehrlichere: ein Canvas mit Default-Bitmap (300x150) wird auf CSS-Groesse
  //    hochskaliert und ist unlesbar verwaschen, faellt aber durch jeden ==0-Test.
  for (const c of document.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect()
    if (r.bottom < 0 || r.top > vh) continue
    if (r.width < 8) continue
    if (c.width === 0 || c.height === 0) {
      findings.push({ type: 'canvas-zero', detail: `canvas sichtbar (${Math.round(r.width)}x${Math.round(r.height)}) aber Bitmap ${c.width}x${c.height}` })
    } else if (c.width < r.width * 0.9 || c.height < r.height * 0.9) {
      findings.push({ type: 'canvas-underscaled', detail: `Bitmap ${c.width}x${c.height} zu klein fuer CSS ${Math.round(r.width)}x${Math.round(r.height)} (verwaschen)` })
    }
  }

  // 5. Grosse leere Flaeche im Viewport (Whitespace-Wueste zwischen Sektionen)
  const cells = 6
  let emptyRun = 0, maxEmptyRun = 0
  for (let i = 0; i < cells; i++) {
    const y = (vh / cells) * (i + 0.5)
    const stack = document.elementsFromPoint(vw / 2, y)
    const meaningful = stack.some((el) => {
      if (['HTML', 'BODY'].includes(el.tagName)) return false
      const r = el.getBoundingClientRect()
      if (r.height > vh * 1.5) return false // reine Wrapper ignorieren
      const cs = getComputedStyle(el)
      const hasInk = (el.textContent || '').trim().length > 0 || ['CANVAS', 'SVG', 'IMG'].includes(el.tagName)
      return hasInk && cs.visibility !== 'hidden' && cs.opacity !== '0'
    })
    if (meaningful) { emptyRun = 0 } else { emptyRun++; maxEmptyRun = Math.max(maxEmptyRun, emptyRun) }
  }
  if (maxEmptyRun >= cells) findings.push({ type: 'empty-screen', detail: 'ganzer Viewport ohne sichtbaren Inhalt' })

  // 6. Ueberlappung: Text-Panels die sich gegenseitig verdecken (Beat-Cards ueber Legenden)
  const panels = [...document.querySelectorAll('.step-card, [class*="card"], [style*="position: absolute"]')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 80 && r.height > 40 && r.top < vh && r.bottom > 0
        && (el.textContent || '').trim().length > 12 && effVisible(el) // nur wirklich sichtbare Panels
    })
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i].getBoundingClientRect(), b = panels[j].getBoundingClientRect()
      if (panels[i].contains(panels[j]) || panels[j].contains(panels[i])) continue
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ox > 40 && oy > 24) {
        findings.push({ type: 'panel-overlap', detail: `"${(panels[i].textContent || '').trim().slice(0, 24)}" ueberlappt "${(panels[j].textContent || '').trim().slice(0, 24)}" (${Math.round(ox)}x${Math.round(oy)}px)` })
      }
    }
  }

  return { findings, scrollY: Math.round(window.scrollY), docH: doc.scrollHeight }
})

const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight)
const step = Math.max(1, Math.floor((totalHeight - HEIGHT) / FRAMES))
const report = []

for (let f = 0; f <= FRAMES; f++) {
  const y = Math.min(f * step, totalHeight - HEIGHT)
  await page.evaluate((yy) => window.scrollTo(0, yy), y)
  await page.waitForTimeout(420) // Reveals/Transitions setzen lassen
  const errBefore = runtimeErrors.length
  const { findings, scrollY } = await inspect()
  const frameErrors = runtimeErrors.slice(errBefore)
  const flagged = findings.length > 0 || frameErrors.length > 0
  if (flagged) {
    report.push({ frame: f, scrollY, findings, errors: frameErrors })
  }
  if (SHOTS === 'all' || (SHOTS === 'flagged' && flagged)) {
    await page.screenshot({ path: `${OUT}/f${String(f).padStart(3, '0')}-y${scrollY}${flagged ? '-FLAG' : ''}.png` })
  }
}

await browser.close()

// --- Bericht ---
const byType = {}
for (const r of report) for (const f of r.findings) byType[f.type] = (byType[f.type] || 0) + 1
console.log(`\n=== SCROLL-SWEEP ${WIDTH}x${HEIGHT} | ${FRAMES + 1} Frames | Dokumenthoehe ${totalHeight}px ===`)
console.log(`Laufzeitfehler gesamt: ${runtimeErrors.length}`)
console.log(`Frames mit Befund: ${report.length}/${FRAMES + 1}`)
if (Object.keys(byType).length) console.log('Befund-Typen:', JSON.stringify(byType))
for (const r of report.slice(0, 25)) {
  console.log(`\n-- Frame ${r.frame} (y=${r.scrollY})`)
  for (const f of r.findings) console.log(`   [${f.type}] ${f.detail}`)
  for (const e of r.errors) console.log(`   [${e.kind}] ${e.text.slice(0, 160)}`)
}
if (report.length > 25) console.log(`\n... und ${report.length - 25} weitere Frames mit Befund`)
console.log(`\nScreenshots: ${OUT}`)

process.exit(report.length > 0 || runtimeErrors.length > 0 ? 1 : 0)
