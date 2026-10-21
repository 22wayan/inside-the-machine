// Mobile-Audit: faehrt die Story auf Telefon- und Tablet-Viewports ab und misst die typischen
// Mobil-Fehler. Nur lesend, aendert keinen Zustand der App.
//
// Aufruf: URL=http://localhost:5173 node scripts/mobile-audit.mjs [--out /tmp/itm-mobile] [--shots 1] [--sizes 375x667,390x844]
// Ausgabe: JSON-Bericht auf stdout (Zusammenfassung) und <out>/<w>x<h>/report.json, Screenshots
// je Sektion und als Scroll-Frames in <out>/<w>x<h>/.
import { chromium } from 'playwright'
import { mkdirSync, rmSync, writeFileSync } from 'fs'

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

const URL = process.env.URL || 'http://localhost:5173'
const OUT = arg('out', '/tmp/itm-mobile')
const SHOTS = arg('shots', '1') === '1'
const SIZES = arg('sizes', '375x667,390x844,412x915,768x1024')
  .split(',')
  .map((s) => s.split('x').map(Number))

// Mindestwerte aus der Aufgabenstellung: Fliesstext >= 14 px, Tap-Ziele >= 40 px.
const MIN_BODY_PX = 14
const MIN_LABEL_PX = 10
const MIN_TAP_PX = 40
const FRAMES_PER_SCREEN = 1

const SECTIONS = [
  ['hero', 'header.act'],
  ['act1-intro', 'section[aria-label^="Akt 1"]'],
  ['act1-compute', '#compute'],
  ['act2-intro', 'section[aria-label^="Akt 2"]'],
  ['act2-map', '#map'],
  ['act3-intro', 'section[aria-label^="Akt 3"]'],
  ['act3-family', '#family'],
  ['act4-intro', 'section[aria-label^="Akt 4"]'],
  ['act4-wildchat', '#wildchat'],
  ['interlude', '#interlude'],
  ['act5-spot', '#spot'],
  ['footer', 'footer'],
]

// Laeuft im Browser: misst den aktuell sichtbaren Ausschnitt.
function inspectFrame({ MIN_BODY_PX, MIN_LABEL_PX, MIN_TAP_PX }) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const doc = document.documentElement
  const out = { overflow: doc.scrollWidth - vw, smallText: [], tinySvgText: [], smallTaps: [], overlaps: [], clipped: [] }
  const visible = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh
  const effVisible = (el) => {
    let node = el
    let op = 1
    while (node && node !== doc) {
      const cs = getComputedStyle(node)
      if (cs.visibility === 'hidden' || cs.display === 'none') return false
      op *= parseFloat(cs.opacity || '1')
      if (op < 0.08) return false
      node = node.parentElement
    }
    return true
  }
  const label = (el) => {
    const sec = el.closest('section[id], section[aria-label], header, footer')
    const s = sec ? (sec.id || sec.getAttribute('aria-label') || sec.tagName.toLowerCase()) : '?'
    return `${s} :: ${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}`
  }
  // HTML-Text: nur Elemente mit eigenem Textknoten.
  for (const el of document.querySelectorAll('body *:not(svg *):not(script):not(style)')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
    if (!own) continue
    const r = el.getBoundingClientRect()
    if (!visible(r) || el.closest('.sr-only')) continue
    if (!effVisible(el)) continue
    const fs = parseFloat(getComputedStyle(el).fontSize)
    const isProse = el.tagName === 'P' && (el.textContent || '').trim().length > 80
    const min = isProse ? MIN_BODY_PX : MIN_LABEL_PX
    if (fs < min) out.smallText.push(`${fs.toFixed(1)}px ${isProse ? 'prose' : 'label'} | ${label(el)}`)
    if (r.right > vw + 1 || r.left < -1) {
      if (!el.closest('.ledger-scroll, .ledger-echo, .ledger-docscroll, .spot-chartscroll')) out.clipped.push(`x ${Math.round(r.left)}..${Math.round(r.right)} | ${label(el)}`)
    }
  }
  // SVG-Text: effektive Pixelgroesse = Schriftgroesse mal Skalierung des viewBox.
  for (const t of document.querySelectorAll('svg text')) {
    const r = t.getBoundingClientRect()
    if (!visible(r) || !effVisible(t)) continue
    const m = t.getScreenCTM()
    const scale = m ? Math.hypot(m.a, m.b) : 1
    const px = parseFloat(getComputedStyle(t).fontSize) * scale
    if (px < MIN_LABEL_PX) out.tinySvgText.push(`${px.toFixed(1)}px | ${label(t)}`)
  }
  // foreignObject-Text in skalierten SVGs (Story-Boxen in Akt 1)
  for (const fo of document.querySelectorAll('svg foreignObject')) {
    const r = fo.getBoundingClientRect()
    if (!visible(r) || !effVisible(fo)) continue
    const m = fo.getScreenCTM()
    const scale = m ? Math.hypot(m.a, m.b) : 1
    const inner = fo.querySelector('div div:last-child') || fo
    const px = parseFloat(getComputedStyle(inner).fontSize) * scale
    if (px < MIN_BODY_PX) out.tinySvgText.push(`${px.toFixed(1)}px foreignObject | ${label(fo)}`)
  }
  // Tap-Ziele
  for (const el of document.querySelectorAll('button, a[href], input, select, summary, [role="button"], [tabindex="0"]')) {
    const r = el.getBoundingClientRect()
    if (!visible(r) || !effVisible(el)) continue
    if (getComputedStyle(el).pointerEvents === 'none') continue
    if (r.width < MIN_TAP_PX || r.height < MIN_TAP_PX) out.smallTaps.push(`${Math.round(r.width)}x${Math.round(r.height)} | ${label(el)}`)
  }
  // Text-Panels, die sich gegenseitig oder einen Chart verdecken
  const panels = [...document.querySelectorAll('p, h1, h2, h3, .step-card, [role="status"], .map-label, .map-epoch, .map-info')]
    .filter((el) => { const r = el.getBoundingClientRect(); return visible(r) && r.width > 40 && effVisible(el) && !el.closest('.sr-only') })
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      if (panels[i].contains(panels[j]) || panels[j].contains(panels[i])) continue
      const a = panels[i].getBoundingClientRect(), b = panels[j].getBoundingClientRect()
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (ox > 20 && oy > 8) out.overlaps.push(`${label(panels[i])}  <>  ${label(panels[j])} (${Math.round(ox)}x${Math.round(oy)})`)
    }
  }
  return out
}

// Laeuft im Browser einmal pro Seite: strukturelle Befunde.
function inspectStatic() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const res = { touchNone: [], sticky: [], hoverOnly: [], viewport: '' }
  res.viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || 'FEHLT'
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (cs.touchAction === 'none' && r.width > vw * 0.5) {
      res.touchNone.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} in ${el.closest('section')?.id || '?'}`)
    }
    if (cs.position === 'sticky') {
      res.sticky.push(`${el.closest('section')?.id || el.closest('section')?.getAttribute('aria-label') || '?'}: sticky h=${Math.round(r.height)} (vh ${vh}) contentH=${el.scrollHeight} overflow=${cs.overflow}`)
    }
  }
  return res
}

// Tipp-Pruefungen: gibt es zu jedem Hover-Inhalt ein Tipp-Aequivalent, und verdeckt es nichts?
async function checkInteractions(page) {
  const res = { act1Tooltip: null, act2Card: null, act2CardOverlapsLabel: null, act3ExplorerAspect: null }
  // Akt 1: ans Ende der Buehne scrollen (alle Punkte gezuendet), auf einen Punkt tippen.
  const c = await page.locator('#compute').evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height } })
  await page.evaluate((y) => scrollTo(0, y), Math.round(c.top + c.h * 0.55))
  await page.waitForTimeout(500)
  const dot = await page.evaluate(() => {
    const vh = innerHeight
    const cs = [...document.querySelectorAll('#compute svg circle')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top > 0 && r.bottom < vh })
    const el = cs[Math.floor(cs.length / 2)]
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (dot) {
    await page.touchscreen.tap(dot.x, dot.y)
    await page.waitForTimeout(300)
    res.act1Tooltip = (await page.locator('#compute').getByText('FLOP · Parameter').count()) > 0
  }
  // Akt 2: Feld-Label antippen, Feldkarte muss erscheinen und darf kein Label verdecken.
  const m = await page.locator('#map').evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height } })
  await page.evaluate((y) => scrollTo(0, y), Math.round(m.top + m.h * 0.45))
  await page.waitForTimeout(500)
  const label = page.locator('#map .map-label').first()
  if (await label.count()) {
    const b = await label.boundingBox()
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
    await page.waitForTimeout(400)
    res.act2Card = (await page.locator('#map .map-info').count()) > 0
    res.act2CardOverlapsLabel = await page.evaluate(() => {
      const card = document.querySelector('#map .map-info')
      if (!card) return null
      const a = card.getBoundingClientRect()
      return [...document.querySelectorAll('#map .map-label')].some((l) => {
        const b = l.getBoundingClientRect()
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4
      })
    })
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2) // Pin wieder loesen
    await page.waitForTimeout(200)
  }
  // Akt 3: Explorer oeffnen, Seitenverhaeltnis des Canvas gegen den Inhalt 1320 x 820 pruefen.
  const btn = page.getByText('Galaxie erkunden').first()
  if (await btn.count()) {
    await btn.scrollIntoViewIfNeeded()
    await btn.tap()
    await page.waitForTimeout(600)
    const r = await page.locator('#family canvas').evaluate((cv) => { const q = cv.getBoundingClientRect(); return q.width / q.height })
    res.act3ExplorerAspect = Number((r / (1320 / 820)).toFixed(3)) // 1.000 = unverzerrt
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
  return res
}

const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] })
const summary = []

for (const [w, h] of SIZES) {
  const dir = `${OUT}/${w}x${h}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const phone = w < 600
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: phone, hasTouch: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(1200)

  const staticRes = await page.evaluate(inspectStatic)
  const sectionRes = {}
  for (const [name, sel] of SECTIONS) {
    const loc = page.locator(sel).first()
    if (!(await loc.count())) { sectionRes[name] = { missing: true }; continue }
    const box = await loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, height: r.height } })
    const frames = Math.max(1, Math.ceil((box.height / h) * FRAMES_PER_SCREEN))
    const agg = { height: Math.round(box.height), frames, overflowMax: 0, smallText: new Set(), tinySvgText: new Set(), smallTaps: new Set(), overlaps: new Set(), clipped: new Set() }
    for (let f = 0; f < frames; f++) {
      const y = Math.round(box.top + f * h)
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(450)
      const r = await page.evaluate(inspectFrame, { MIN_BODY_PX, MIN_LABEL_PX, MIN_TAP_PX })
      agg.overflowMax = Math.max(agg.overflowMax, r.overflow)
      for (const k of ['smallText', 'tinySvgText', 'smallTaps', 'overlaps', 'clipped']) r[k].forEach((v) => agg[k].add(v))
      if (SHOTS) await page.screenshot({ path: `${dir}/${name}-${String(f).padStart(2, '0')}.png` })
    }
    sectionRes[name] = Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, v instanceof Set ? [...v] : v]))
  }
  const interactions = await checkInteractions(page)
  const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  const report = { size: `${w}x${h}`, docOverflow, errors, static: staticRes, interactions, sections: sectionRes }
  writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2))
  const count = (k) => Object.values(sectionRes).reduce((s, v) => s + (v[k]?.length || 0), 0)
  summary.push({
    size: `${w}x${h}`,
    docOverflow,
    maxSectionOverflow: Math.max(...Object.values(sectionRes).map((v) => v.overflowMax || 0)),
    smallText: count('smallText'),
    tinySvgText: count('tinySvgText'),
    smallTaps: count('smallTaps'),
    overlaps: count('overlaps'),
    clipped: count('clipped'),
    touchNone: staticRes.touchNone.length,
    tapAct1: interactions.act1Tooltip,
    tapAct2: interactions.act2Card,
    act2CardCoversLabel: interactions.act2CardOverlapsLabel,
    act3Aspect: interactions.act3ExplorerAspect,
    errors: errors.length,
  })
  await ctx.close()
}
await browser.close()
console.table(summary)
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2))
