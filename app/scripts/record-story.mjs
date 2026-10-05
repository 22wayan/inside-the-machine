/**
 * Screenrecording der Story, Bild fuer Bild gerendert statt in Echtzeit mitgeschnitten.
 *
 * WARUM NICHT recordVideo. Ein Echtzeit-Mitschnitt nimmt auf, was der Rechner gerade schafft.
 * Gemessen laufen Akt 2 (478k Punkte) bei 51 fps und Akt 3 (Zoom ueber 38k Sterne) bei 38 fps -
 * ein Mitschnitt zeigt genau dieses Ruckeln. Hier wird jede Scroll-Position exakt gesetzt, ein
 * Bild geholt, und ffmpeg setzt die Bilder zu konstanten 30 fps zusammen.
 *
 * VOLLSTAENDIGKEIT IST HIER DAS ZIEL, nicht Kuerze. Die erste Fassung lief 84 Sekunden und
 * uebersprang die Haelfte: den Galaxie-Explorer, die Feld-Auswahl in Akt 2, den Bereichsfilter
 * und den Lesetisch in Akt 4, die eingeklappten Notizen, die Bildfragen im Quiz. Dieses Drehbuch
 * fuehrt jede Interaktion vor, die die Story anbietet, und haelt lange genug an, dass man mitliest.
 *
 * DER ROTE FADEN ist der der Story: die KI vermisst sich selbst (Akte 1 bis 3), dann wird
 * gemessen, wofuer Menschen sie benutzen (Akt 4), am Ende wird der Betrachter gemessen (Akt 5).
 *
 * Lauf:  cd inside-ai/app && node scripts/record-story.mjs
 *        (setzt einen laufenden Preview voraus: npm run preview -- --port 4173 --strictPort)
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const URL = process.env.URL || 'http://localhost:4173'
const W = 1920
const H = 1080
const FPS = 30
const TMP = '/tmp/story-frames'
const OUT = process.env.OUT || join(process.cwd(), '../paper/screenrecording.mp4')

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
let frame = 0
let page = null

async function shot() {
  await page.screenshot({ path: join(TMP, `f${String(frame).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 })
  frame++
}
/** Standbild: dieselbe Ansicht fuer n Sekunden, damit man lesen kann. */
async function hold(s) { for (let i = 0; i < Math.round(s * FPS); i++) await shot() }
/** Wie hold, aber die ECHTE Zeit laeuft weiter: fuer Uebergaenge, die an Zeit haengen. */
async function live(s) {
  for (let i = 0; i < Math.round(s * FPS); i++) { await page.waitForTimeout(1000 / FPS); await shot() }
}
async function scrollTo(zielY, s) {
  const startY = await page.evaluate(() => window.scrollY)
  const n = Math.max(1, Math.round(s * FPS))
  for (let i = 1; i <= n; i++) {
    await page.evaluate((v) => window.scrollTo(0, v), startY + (zielY - startY) * ease(i / n))
    await shot()
  }
}
const yOf = (sel, off = 0) => page.evaluate(([s, o]) => {
  const el = document.querySelector(s)
  return el ? el.getBoundingClientRect().top + window.scrollY + o : 0
}, [sel, off])
const hOf = (sel) => page.evaluate((s) => document.querySelector(s)?.offsetHeight ?? 0, sel)
/** Maus sichtbar hinbewegen, damit Hover-Zustaende im Video entstehen. */
async function hoverAt(sel, dx = 0.5, dy = 0.5) {
  const box = await page.evaluate((s) => {
    const e = document.querySelector(s); if (!e) return null
    const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)
  if (!box) return false
  await page.mouse.move(box.x + box.w * dx, box.y + box.h * dy, { steps: 12 })
  return true
}

async function main() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true })
  mkdirSync(TMP, { recursive: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  page = await ctx.newPage()
  const fehler = []
  page.on('pageerror', (e) => fehler.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()) })

  console.log(`==> ${URL} bei ${W}x${H}, ${FPS} fps`)
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto' })
  await page.waitForTimeout(1500)

  // ═══ 1. HERO ══════════════════════════════════════════════════════════════════
  console.log('  1/12 Hero')
  await hold(4)

  // ═══ 2. AKT 1: der Aufstieg ═══════════════════════════════════════════════════
  console.log('  2/12 Akt 1: Compute')
  const a1 = await yOf('#compute'); const h1 = await hOf('#compute')
  await scrollTo(a1, 2)
  await hold(4)                                    // die FLOP-Erklaerung lesen
  for (const f of [0.22, 0.38, 0.52, 0.66, 0.8, 0.93]) {
    await scrollTo(a1 + h1 * f, 1.6)
    await hold(1.6)                                // Meilenstein fuer Meilenstein
  }
  if (await hoverAt('#compute svg', 0.72, 0.42)) await live(1.6)
  await hoverAt('#compute svg', 0.85, 0.3); await live(1.6)
  await scrollTo(await yOf('#compute details', -520), 1.2)
  await page.evaluate(() => document.querySelector('#compute details')?.setAttribute('open', ''))
  await live(0.8); await hold(3.5)

  // ═══ 3. AKT 2: die Forschungslandkarte ════════════════════════════════════════
  console.log('  3/12 Akt 2: Landkarte')
  const a2 = await yOf('#map'); const h2 = await hOf('#map')
  await scrollTo(a2, 1.8)
  await hold(3)
  for (const f of [0.25, 0.45, 0.62, 0.78, 0.92]) { // 2007 bis 2026 durchlaufen
    await scrollTo(a2 + h2 * f, 1.5)
    await hold(1.4)
  }
  for (const feld of ['Maschinelles Lernen', 'Computer Vision', 'Sprachverarbeitung']) {
    await page.evaluate((f) => {
      const b = [...document.querySelectorAll('#map button')].find((x) => x.textContent.includes(f))
      b?.click()
    }, feld)
    await live(1); await hold(2.6)                 // Top-Paper des Feldes lesen
  }
  await scrollTo(await yOf('#map details', -560), 1.2)
  await page.evaluate(() => document.querySelector('#map details')?.setAttribute('open', ''))
  await live(0.8); await hold(3)

  // ═══ 4. AKT 3: die Galaxie ════════════════════════════════════════════════════
  console.log('  4/12 Akt 3: Galaxie')
  const a3 = await yOf('#family'); const h3 = await hOf('#family')
  await scrollTo(a3, 1.8)
  await hold(3)
  for (const f of [0.3, 0.55, 0.8, 0.95]) { await scrollTo(a3 + h3 * f, 1.5); await hold(1.4) }
  await hoverAt('#family canvas', 0.5, 0.45); await live(1.4)
  await hoverAt('#family canvas', 0.62, 0.55); await live(1.4)

  // ═══ 5. AKT 3: der Vollbild-Explorer ══════════════════════════════════════════
  console.log('  5/12 Akt 3: Explorer (Vollbild)')
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#family button')].find((x) => /erkunden/i.test(x.textContent))
    b?.click()
  })
  await live(1.5); await hold(2.5)

  // DER ZEIGER MUSS INS LEERE, SONST IST DAS BILD DUNKEL. Drei Aufnahmen sind hier gescheitert,
  // und es lag nie am Zoom: der Explorer hat einen Spotlight ("Auf eine Sonne zeigen hebt ihre
  // Familie hervor"), der beim Hover ALLE anderen Familien abdunkelt. Der Zeiger stand nach dem
  // Zoomen auf einem Stern und blieb dort - also lief der ganze Abschnitt im gedimmten Zustand
  // (gemessen: 4,1 s bzw. 18 s unter der Schwarzschwelle von ffmpeg blackdetect).
  //
  // Regel deshalb: zoomen mit dem Zeiger auf der Bildmitte (d3-zoom braucht ihn ueber dem Canvas),
  // aber JEDES Standbild mit dem Zeiger in einer leeren Ecke. Der Spotlight wird genau einmal
  // absichtlich ausgeloest - fuer den Tooltip, wo er hingehoert.
  const cv = await page.evaluate(() => {
    const o = [...document.querySelectorAll('canvas')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((q) => q.r.width > 200 && q.r.bottom > 0 && q.r.top < window.innerHeight)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]
    if (!o) return { mx: 960, my: 540, lx: 60, ly: 140 }
    return {
      mx: o.r.left + o.r.width / 2,
      my: o.r.top + o.r.height / 2,
      lx: o.r.left + 50,                 // leere Ecke: die Galaxie sitzt mittig, hier steht nie ein Stern
      ly: o.r.top + o.r.height - 60,
    }
  })
  const insLeere = async () => { await page.mouse.move(cv.lx, cv.ly, { steps: 10 }); await page.waitForTimeout(250) }
  const aufsBild = async () => { await page.mouse.move(cv.mx, cv.my, { steps: 10 }); await page.waitForTimeout(150) }

  // 1. Zustand normalisieren - bis zum Anschlag raus. Ohne Frames: im Video soll der Explorer in
  //    der Uebersicht aufgehen, nicht sichtbar zurueckkurbeln. Der Explorer erbt sonst den Zoom
  //    aus dem gescrollten Akt, und der haengt daran, wie lange die Aufnahme vorher gebraucht hat.
  await aufsBild()
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(45) }
  await page.waitForTimeout(700)
  await insLeere()
  await hold(3)                                     // die ganze Galaxie: 160 Familien, ungedimmt

  // 2. Sechs Stufen hinein. Sondiert ueber acht Stufen: Anschlag 15,2 -> Stufe 6 34,3 (hellstes
  //    Bild, ~30 benannte Familien mit Spiralarmen und drei goldenen Merge-Boegen) -> Stufe 12 17,7.
  await aufsBild()
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await live(0.4) }
  await insLeere()
  const gemessen = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((q) => q.r.width > 200 && q.r.bottom > 0 && q.r.top < window.innerHeight)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0].el
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let summe = 0; let n = 0
    for (let i = 0; i < d.length; i += 4 * 37) { summe += (d[i] + d[i + 1] + d[i + 2]) / 3; n++ }
    return +(summe / n).toFixed(1)
  })
  console.log(`      Explorer: 6 Stufen, Helligkeit ${gemessen} (ungedimmt erwartet > 30)`)
  await hold(4.5)                                   // die benannten Familien und Merge-Boegen lesen

  // 3. Jetzt der Spotlight, absichtlich: die hellste Zelle dieser Ansicht ist eine Sonne.
  const sonne = await page.evaluate(() => {
    const o = [...document.querySelectorAll('canvas')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((q) => q.r.width > 200 && q.r.bottom > 0 && q.r.top < window.innerHeight)
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]
    if (!o) return null
    const c = o.el
    const img = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const COLS = 10; const ROWS = 6
    let best = { v: -1, cx: 0.5, cy: 0.5 }
    for (let ry = 1; ry < ROWS - 1; ry++) {
      for (let rx = 1; rx < COLS - 1; rx++) {
        let summe = 0; let n = 0
        const x0 = Math.floor((rx / COLS) * c.width); const x1 = Math.floor(((rx + 1) / COLS) * c.width)
        const y0 = Math.floor((ry / ROWS) * c.height); const y1 = Math.floor(((ry + 1) / ROWS) * c.height)
        for (let y = y0; y < y1; y += 4) {
          for (let x = x0; x < x1; x += 4) {
            const i = (y * c.width + x) * 4
            summe += img[i] + img[i + 1] + img[i + 2]; n++
          }
        }
        const v = summe / Math.max(1, n)
        if (v > best.v) best = { v, cx: (rx + 0.5) / COLS, cy: (ry + 0.5) / ROWS }
      }
    }
    return { x: o.r.left + o.r.width * best.cx, y: o.r.top + o.r.height * best.cy }
  })
  if (sonne) { await page.mouse.move(sonne.x, sonne.y, { steps: 14 }); await live(1.5); await hold(2) }
  await insLeere()
  await hold(1.5)                                   // Spotlight aus, die Galaxie wieder ganz da

  // 4. Zurueck in die Uebersicht.
  await aufsBild()
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await live(0.35) }
  await insLeere()
  await hold(1.5)
  await page.keyboard.press('Escape')
  await live(1.2); await hold(1)

  // ═══ 6. AKT 4, EBENE 1: die Frage ═════════════════════════════════════════════
  console.log('  6/12 Akt 4: die Frage')
  await scrollTo(await yOf('#wildchat'), 2)
  await hold(4.5)                                   // Band und Aufhaenger lesen
  await scrollTo(await yOf('.useov-text', -420), 1.4)
  await hold(4)

  // ═══ 7. AKT 4: Klick ins Band ═════════════════════════════════════════════════
  console.log('  7/12 Akt 4: Klick ins Band')
  await scrollTo(await yOf('.useov-band', -300), 1.4)
  await hoverAt('.useov-seg:nth-child(4)', 0.5, 0.5); await live(1)
  await page.evaluate(() => document.querySelectorAll('#wildchat .useov-seg')[3]?.click())
  await live(2.5)                                   // der Flug ins Register

  // ═══ 8. AKT 4: die Legende ════════════════════════════════════════════════════
  console.log('  8/12 Akt 4: Legende')
  await scrollTo(await yOf('.sheet-legend', -120), 1.4)
  await hold(6)                                     // alle vier Kacheln lesen

  // ═══ 9. AKT 4: das Register bedienen ══════════════════════════════════════════
  console.log('  9/12 Akt 4: Register')
  await scrollTo(await yOf('.ledger-sheet', -70), 1.4)
  await hold(3)
  const sheet = await page.evaluate(() => {
    const c = document.querySelector('#wildchat canvas'); const r = c.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })
  const rowY = (rank) => sheet.y + (106 + rank * 22 + 11) * (sheet.h / 1272)
  await page.mouse.move(sheet.x + sheet.w * 0.3, rowY(0), { steps: 14 }); await live(1.6)
  await page.mouse.move(sheet.x + sheet.w * 0.45, rowY(2), { steps: 14 }); await live(1.6)
  await page.mouse.move(sheet.x + sheet.w * 0.62, rowY(4), { steps: 14 }); await live(1.6)

  for (const spalte of ['Volumen', 'Graubereich']) {
    await page.evaluate((s) => {
      const b = [...document.querySelectorAll('#wildchat .ledger-colhead')].find((x) => x.textContent.includes(s))
      b?.click()
    }, spalte)
    await live(2.2); await hold(1.6)                // die Sortierung IST die Analyse
  }

  await scrollTo(await yOf('.ledger-controls', -100), 1.2)
  for (let i = 0; i < 2; i++) {                     // Chip-Filter an, dann wieder aus
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#wildchat button')].find((x) => x.textContent.trim() === 'Programmieren')
      b?.click()
    })
    await live(2.2); await hold(i === 0 ? 2 : 0.4)
  }

  // ═══ 10. AKT 4: Bereichsfilter, Dossier, Lesetisch ════════════════════════════
  console.log(' 10/12 Akt 4: Bereichsfilter und Detail')
  await scrollTo(await yOf('.ledger-sheet', -70), 1.2)
  const gx = (v) => sheet.x + (718 + v) * (sheet.w / 1320)
  await page.mouse.move(gx(20), rowY(6), { steps: 8 })
  await page.mouse.down()
  for (const v of [60, 110, 170, 230]) { await page.mouse.move(gx(v), rowY(24), { steps: 6 }); await live(0.4) }
  await page.mouse.up()
  await live(1.8); await hold(2.4)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#wildchat button')].find((x) => /Bereich aufheben/.test(x.textContent))
    b?.click()
  })
  await live(1.4)

  await page.evaluate(() => document.querySelectorAll('#wildchat .ledger-row-btn')[1]?.click())
  await live(1.6)
  await scrollTo(await yOf('.ledger-dossier', -80), 1.4)
  await hold(5)                                     // Themen, Sprachen, Modelle, Zeit
  for (const label of ['Anteil am eigenen Jahr', 'Tempo']) {
    await page.evaluate((l) => {
      const b = [...document.querySelectorAll('.ledger-dossier button')].find((x) => x.textContent.trim().startsWith(l))
      b?.click()
    }, label)
    await live(1.4); await hold(2.2)
  }
  await scrollTo(await yOf('.ledger-sheet', -70), 1.2)
  await page.evaluate(() => document.querySelectorAll('#wildchat .ledger-row-btn')[8]?.click())
  await live(1.4)
  await scrollTo(await yOf('.ledger-dossier', -80), 1.2)
  await hold(4)                                     // zweites Land: der Vergleich

  console.log(' 11/12 Akt 4: Lesetisch und Pointe')
  const geoeffnet = await page.evaluate(() => {
    const b = document.querySelectorAll('.ledger-dossier .ledger-docblock')
    if (!b.length) return false
    b[Math.min(3, b.length - 1)].click(); return true
  })
  if (geoeffnet) { await live(1.6); await hold(5.5); await page.keyboard.press('Escape'); await live(1.2) }

  await scrollTo(await yOf('#wildchat details', -180), 1.2)
  await page.evaluate(() => document.querySelectorAll('#wildchat details').forEach((d) => d.setAttribute('open', '')))
  await live(0.8); await hold(5)                    // die Ehrlichkeits-Notizen

  await scrollTo(await yOf('.ledger-pointe', -100), 1.6)
  await hold(5)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#wildchat button')].find((x) => /Ausreißer ausblenden/.test(x.textContent))
    b?.click()
  })
  await live(1.8); await hold(3.5)                  // die Linie kippt sichtbar

  // ═══ 12. AKT 5: das Finale ════════════════════════════════════════════════════
  console.log(' 12/12 Akt 5: Finale')
  await scrollTo(await yOf('#spot'), 2)
  await hold(3.5)
  for (let runde = 0; runde < 4; runde++) {
    await hold(2.4)                                 // Frage lesen
    await page.evaluate((r) => {
      const s = document.querySelector('#spot')
      const o = [...s.querySelectorAll('button')].filter((x) => !/Nochmal|Weiter|Ergebnis/.test(x.textContent))
      o[r % 2]?.click()
    }, runde)
    await live(2.2)                                 // Feedback, Konfetti, Aufloesung
    await page.evaluate(() => {
      const w = [...document.querySelectorAll('#spot button')].find((x) => /Weiter|Ergebnis/.test(x.textContent))
      w?.click()
    })
    await live(0.8)
  }
  for (let k = 0; k < 40; k++) {
    if (await page.evaluate(() => !!document.querySelector('#spot .spot-tells'))) break
    await page.evaluate(() => {
      const s = document.querySelector('#spot')
      const w = [...s.querySelectorAll('button')].find((x) => /Weiter|Ergebnis/.test(x.textContent))
      if (w) { w.click(); return }
      const o = [...s.querySelectorAll('button')].filter((x) => !/Nochmal/.test(x.textContent))
      o[0]?.click()
    })
    await page.waitForTimeout(90)
  }
  await page.waitForTimeout(700)

  await scrollTo(await yOf('#spot .display', -300), 1.6)
  await hold(4)                                     // Score und die Chips je Frage
  await scrollTo(await yOf('.spot-tells', -100), 1.4)
  await hold(4.5)                                   // Text gegen Bild
  await scrollTo(await yOf('.spot-tells', 380), 1.4)
  await hold(6)                                     // die Trefferquoten-Grafik
  await scrollTo(await yOf('.spot-outlook', -140), 1.4)
  await hold(5)                                     // Video: 2.820 und das Alter
  await scrollTo(await yOf('.spot-prov', -220), 1.4)
  await hold(5)                                     // Herkunft
  await page.evaluate(() => document.querySelectorAll('#spot details').forEach((d) => d.setAttribute('open', '')))
  await live(0.8); await hold(5)                    // Quellen des Abschlusses
  await scrollTo(await page.evaluate(() => document.body.scrollHeight), 2)
  await hold(3)                                     // Footer

  console.log(`\n==> ${frame} Bilder, ${(frame / FPS).toFixed(1)} s`)
  console.log(`==> Konsolenfehler waehrend der Aufnahme: ${fehler.length}`)
  if (fehler.length) console.log('    ' + fehler.slice(0, 3).join('\n    '))
  await browser.close()

  console.log('==> ffmpeg')
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', join(TMP, 'f%05d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', OUT], { stdio: ['ignore', 'ignore', 'pipe'] })
  rmSync(TMP, { recursive: true })
  console.log(`==> fertig: ${OUT}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
