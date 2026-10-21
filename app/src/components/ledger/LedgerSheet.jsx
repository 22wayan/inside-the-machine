import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CAT_BUCKET, PAL } from '../../theme'
import { easeCubicInOut, normCats } from '../../lib/ledger'
import { makeHatch, rgba, drawSheet } from './drawSheet'
import {
  COLS as COLS_FULL, COMB_GAP, H, HEAD_LABEL_H, HEAD_Y, MARK_COL_KEYS, MOD_FOCUS,
  MOD_TAIL_SQUEEZE, N_ROWS, ROWS_Y0, ROW_H, W,
  brushRange, colAt, rowTop, slotAt, slotX, sortableFor,
} from './geometry'

// Akt 4 "Das Register" - das eine Canvas plus die HTML-Bedienschicht darueber.
//
// MOTION-REGEL DES AKTS: keine autonome Bewegung. Kein Drift, kein Twinkle, kein Puls, kein
// Scroll-Scrub. Es gibt KEINE Ambient-rAF-Schleife; die einzige Schleife startet auf eine
// Nutzerhandlung und beendet sich selbst. Bewegung dient ausschliesslich der Object Constancy
// (Heer & Robertson, InfoVis 2007), nicht der Dekoration.

const DUR = 620 // Phase 1: nur Position
const STAGGER = 260 // Welle laeuft vom NEUEN Platz 1 abwaerts (Verzoegerung haengt am Datenattribut)
const PULSE_DELAY = 100 // Phase 2 startet erst NACH Ankunft einer Zeile
const PULSE_DUR = 180 // nur Luminanz. Farbe und Position bewegen sich nie gleichzeitig.
const TOTAL = DUR + STAGGER + PULSE_DELAY + PULSE_DUR // 1.160 ms, unter der 1,2-s-Grenze

const MEASURE_WIN = 30 // Fensterbreite der Zeichenzeit-Messung
const MEASURE_EVERY = 12 // so oft wird der Median nachgemeldet (nie pro Frame)

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const pct = (v, total) => `${(v / total) * 100}%`

/** Kammsegmente in der aktuellen Reihenfolge: Startposition je Land. */
function combLayout(order, threads, pitch, out) {
  let x = 0
  for (let r = 0; r < order.length; r++) {
    const ci = order[r]
    out[ci] = x
    x += threads[ci] * pitch + COMB_GAP
  }
}

export default function LedgerSheet({
  countries, order, world, buckets, docsByCountry, threads, headHists,
  focusCat, focusValues, focusColor, dimmed, combCaption, shortOf, labelOf, docLabelOf, fmt,
  sortCol, sortDir, hoverCi, selCi, hoverBucket, selDocId, focusDocRef, scales,
  cols = COLS_FULL, brush = null,
  onHoverCountry, onSelectCountry, onHoverBucket, onSort, onOpenDoc, onBrush, onDrawTime, reduce,
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const rowBtnsRef = useRef([])
  const docBtnsRef = useRef({})

  // Alles, was pro Frame gelesen wird, liegt in Refs. Kein React-State im Draw-Pfad.
  const yRef = useRef(new Float32Array(N_ROWS))
  const syRef = useRef(new Float32Array(N_ROWS))
  const tyRef = useRef(new Float32Array(N_ROWS))
  const delayRef = useRef(new Float32Array(N_ROWS))
  const pulseRef = useRef(new Float32Array(N_ROWS))
  const rankRef = useRef(new Int16Array(N_ROWS))
  const combXRef = useRef(new Float32Array(N_ROWS))
  const combSXRef = useRef(new Float32Array(N_ROWS))
  const combTXRef = useRef(new Float32Array(N_ROWS))
  const dprRef = useRef(1)
  const hatchRef = useRef(null)
  const rectRef = useRef(null)
  const ptrRef = useRef({ x: 0, y: 0 })
  const drawRafRef = useRef(0)
  const tweenRafRef = useRef(0)
  const hitRafRef = useRef(0)
  const hitOkRef = useRef(true) // waehrend einer Transition ausgesetzt: Positionen waeren stale
  const firstRef = useRef(true)
  const timesRef = useRef([])
  const publishedRef = useRef(0)
  const pulsingRef = useRef(false)
  const prevOrderRef = useRef(null)
  const viewRef = useRef(null)
  // Der laufende Zug des Range-Brush lebt in Refs, nicht in State: waehrend des Ziehens darf
  // kein React-Render pro Frame laufen. Der Entwurf wird bei jedem Render aus dem Ref in das
  // View-Objekt zurueckgeschrieben, damit ein Render von aussen ihn nicht wegwirft.
  const brushStartRef = useRef(null)
  const brushDraftRef = useRef(null)
  const draggedRef = useRef(false)

  const [settled, setSettled] = useState(order)
  const [tip, setTip] = useState(null)
  // Tastaturfokus als eigener Zustand: er ist NICHT dasselbe wie Hover und nicht dasselbe wie
  // Auswahl, und er muss im Canvas sichtbar sein - sonst hat die Tastatur eine schwaechere
  // Rueckmeldung als die Maus.
  const [focusCi, setFocusCi] = useState(null)

  const totalThreads = useMemo(() => Array.from(threads).reduce((s, v) => s + v, 0), [threads])
  const pitch = (W - (N_ROWS - 1) * COMB_GAP) / totalThreads

  // Der komplette Zeichen-Input als ein Objekt in einem Ref. Jeder Render aktualisiert es,
  // der Draw liest nur daraus - so kann die rAF-Schleife ohne Closure-Neuerzeugung laufen.
  viewRef.current = {
    countries, order, world, buckets, docsByCountry, threads, headHists,
    focusCat, focusValues, focusColor, dimmed, combCaption, shortOf, fmt,
    sortCol, sortDir, hoverCi, selCi, hoverBucket, selDocId, scales, pitch,
    cols, brush, focusCi, brushDraft: brushDraftRef.current,
    y: yRef.current, rankOf: rankRef.current, combX: combXRef.current,
    pulse: pulseRef.current, pulsing: pulsingRef.current, hatch: hatchRef.current,
  }

  const draw = useCallback(() => {
    const cv = canvasRef.current
    const v = viewRef.current
    if (!cv || !v) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const t0 = performance.now()
    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0)
    v.hatch = hatchRef.current
    drawSheet(ctx, v)
    // Algorithm-Ebene des Nested Model: die Zeichenzeit wird GEMESSEN, nicht geschaetzt - und
    // sie bleibt aktuell. Ein einmal veroeffentlichter Wert aus den ersten zwoelf Frames waere
    // eine Momentaufnahme des Kaltstarts; hier laeuft ein Fenster ueber die letzten MEASURE_WIN
    // Frames und meldet alle MEASURE_EVERY Frames seinen Median nach.
    const times = timesRef.current
    times.push(performance.now() - t0)
    if (times.length > MEASURE_WIN) times.shift()
    publishedRef.current += 1
    if (times.length >= MEASURE_EVERY && publishedRef.current >= MEASURE_EVERY) {
      publishedRef.current = 0
      const sorted = [...times].sort((a, b) => a - b)
      onDrawTime?.({ ms: sorted[Math.floor(sorted.length / 2)], frames: times.length, dpr: dprRef.current })
    }
  }, [onDrawTime])

  const requestDraw = useCallback(() => {
    if (drawRafRef.current || tweenRafRef.current) return
    drawRafRef.current = requestAnimationFrame(() => { drawRafRef.current = 0; draw() })
  }, [draw])

  // --- Canvas-Backingstore und Schraffur (Device-Pixel) ---------------------
  useEffect(() => {
    const sync = () => {
      const cv = canvasRef.current
      if (!cv) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const wantW = Math.round(W * dpr)
      const wantH = Math.round(H * dpr)
      // Gegen die GEWUENSCHTE Groesse pruefen, nicht gegen "cv.width ist gesetzt": ein frisches
      // Canvas hat immer 300x150, und bei devicePixelRatio 1 (Beamer, 1080p-Monitor) waere
      // dprRef.current === dpr bereits beim ersten Lauf wahr. Der Backingstore blieb dann auf
      // 300x150 und das Blatt wurde unlesbar hochskaliert.
      if (cv.width === wantW && cv.height === wantH) return
      dprRef.current = dpr
      cv.width = wantW
      cv.height = wantH
      const ctx = cv.getContext('2d')
      hatchRef.current = ctx ? makeHatch(ctx, dpr) : null
      requestDraw()
    }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [requestDraw])

  // --- Umsortieren: staged + staggered -------------------------------------
  useEffect(() => {
    const y = yRef.current
    const ty = tyRef.current
    const ctgt = combTXRef.current
    order.forEach((ci, r) => {
      ty[ci] = rowTop(r)
      rankRef.current[ci] = r
      delayRef.current[ci] = (r / N_ROWS) * STAGGER
    })
    combLayout(order, threads, pitch, ctgt)

    // Eine identische Reihenfolge (z. B. React-StrictMode-Remount) darf keine Animation ausloesen.
    const same = prevOrderRef.current?.length === order.length
      && prevOrderRef.current.every((ci, r) => ci === order[r])
    prevOrderRef.current = order

    if (firstRef.current || reduce || same) {
      // reduce !== none: der Endzustand ist bitgleich, es faellt nur die Interpolation weg.
      firstRef.current = false
      y.set(ty)
      combXRef.current.set(ctgt)
      pulseRef.current.fill(1)
      pulsingRef.current = false
      hitOkRef.current = true
      setSettled(order)
      requestDraw()
      return undefined
    }

    // INTERRUPT-SICHERHEIT (der klassische Bug): der Startwert ist IMMER die aktuelle Position,
    // nie der alte Startwert. Ein Sortierwechsel mitten in der Animation laesst deshalb keine
    // Zeile springen. u wird zusaetzlich auf [0,1] geklemmt (Overshoot nach Tab-Wechsel).
    syRef.current.set(y)
    combSXRef.current.set(combXRef.current)
    pulseRef.current.fill(0)
    pulsingRef.current = true
    hitOkRef.current = false
    cancelAnimationFrame(tweenRafRef.current)
    const t0 = performance.now()
    const step = () => {
      const t = performance.now() - t0
      const sy = syRef.current
      const cx = combXRef.current
      const csx = combSXRef.current
      const pulse = pulseRef.current
      for (let ci = 0; ci < N_ROWS; ci++) {
        const e = easeCubicInOut(clamp01((t - delayRef.current[ci]) / DUR))
        y[ci] = sy[ci] + (ty[ci] - sy[ci]) * e
        cx[ci] = csx[ci] + (ctgt[ci] - csx[ci]) * e
        pulse[ci] = clamp01((t - (delayRef.current[ci] + DUR + PULSE_DELAY)) / PULSE_DUR)
      }
      viewRef.current.pulsing = pulsingRef.current
      draw()
      if (t < TOTAL) { tweenRafRef.current = requestAnimationFrame(step); return }
      tweenRafRef.current = 0
      y.set(ty)
      cx.set(ctgt)
      pulse.fill(1)
      pulsingRef.current = false
      hitOkRef.current = true
      viewRef.current.pulsing = false
      draw()
      setSettled(order) // DOM-Positionen der A11y-Buttons erst am Transitionsende schreiben
    }
    tweenRafRef.current = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(tweenRafRef.current); tweenRafRef.current = 0; pulsingRef.current = false }
  }, [order, reduce, threads, pitch, draw, requestDraw])

  // Jede sichtbare Zustandsaenderung loest genau einen koaleszierten Draw aus.
  useEffect(() => { requestDraw() }, [requestDraw, hoverCi, selCi, selDocId, hoverBucket, focusCat, focusCi, dimmed, sortCol, sortDir, headHists, world, buckets, cols, brush])

  // Der Lesetisch gibt den Fokus an den ausloesenden Strich zurueck (Escape-Kette, Spec 4).
  // Der Sheet besitzt die Buttons, also besitzt er auch die Rueckgabe.
  useEffect(() => {
    if (!focusDocRef) return undefined
    focusDocRef.current = (id) => docBtnsRef.current[id]?.focus()
    return () => { focusDocRef.current = null }
  }, [focusDocRef])
  // Die Refs nach dem Abbrechen auf 0 setzen: sonst haelt requestDraw nach einem Remount (React
  // StrictMode im Dev-Server) die abgebrochene Frame-ID fuer "laeuft schon" und zeichnet nie.
  useEffect(() => () => {
    cancelAnimationFrame(drawRafRef.current); drawRafRef.current = 0
    cancelAnimationFrame(hitRafRef.current); hitRafRef.current = 0
  }, [])

  // --- Rect nur im ResizeObserver und bei scroll messen, nie im mousemove ---
  useEffect(() => {
    const measure = () => { rectRef.current = canvasRef.current?.getBoundingClientRect() ?? null }
    measure()
    const ro = new ResizeObserver(measure)
    if (canvasRef.current) ro.observe(canvasRef.current)
    const wrap = wrapRef.current
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    wrap?.addEventListener('scroll', measure, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      wrap?.removeEventListener('scroll', measure)
    }
  }, [])

  // --- Hit-Test: rein arithmetisch, kein Quadtree ---------------------------
  /** Canvas-x zu einem Client-x. Zeichnen in Device-Pixeln, Hit-Test in CSS-Pixeln: nie mischen. */
  const canvasX = useCallback((clientX) => {
    const r = rectRef.current
    if (!r || !r.width) return null
    return (clientX - r.left) * (W / r.width)
  }, [])

  const hitAt = useCallback((clientX, clientY) => {
    const r = rectRef.current
    if (!r || !r.width) return null
    const s = W / r.width
    const x = (clientX - r.left) * s
    const y = (clientY - r.top) * s
    const rank = Math.floor((y - ROWS_Y0) / ROW_H)
    if (rank < 0 || rank >= N_ROWS) return null
    const v = viewRef.current
    const ci = v.order[rank]
    const col = colAt(x, v.cols)
    let bucket = null
    if (col === 'c3' && !v.focusCat) {
      let acc = 0
      const rel = ((x - v.cols.c3.x0) / v.cols.c3.w) * 100
      for (let b = 0; b < CAT_BUCKET.length; b++) {
        acc += v.buckets[ci][b]
        if (rel <= acc) { bucket = b; break }
      }
    }
    return { ci, rank, col, bucket, x, y }
  }, [])

  const resolveHover = useCallback(() => {
    hitRafRef.current = 0
    if (!hitOkRef.current || brushStartRef.current != null) return
    const hit = hitAt(ptrRef.current.x, ptrRef.current.y)
    onHoverCountry(hit ? hit.ci : null)
    onHoverBucket(hit ? hit.bucket : null)
    setTip((prev) => {
      if (!hit || !hit.col || hit.col === 'c0') return null
      if (prev && prev.ci === hit.ci && prev.col === hit.col && prev.bucket === hit.bucket) return prev
      return { ci: hit.ci, col: hit.col, rank: hit.rank, bucket: hit.bucket }
    })
  }, [hitAt, onHoverBucket, onHoverCountry])

  // --- Range-Brush auf c4 (Yi: filter) --------------------------------------
  // Ziehen ueber die Graubereich-Spalte filtert auf einen WERTEBEREICH. Das ist der Zugriff,
  // den Sortieren allein nicht gibt: "zeig mir alle Laender zwischen 5 und 12 Prozent" ist eine
  // Frage an die Verteilung, nicht an die Rangfolge - und sie ist mit dem Volumenfilter
  // kombinierbar (Reparatur von S4: Filter und Graubereich schliessen sich nicht aus).
  const commitDraft = useCallback((clientX) => {
    const x = canvasX(clientX)
    if (x == null || brushStartRef.current == null) return null
    return brushRange(brushStartRef.current, x, viewRef.current.cols)
  }, [canvasX])

  const endBrush = useCallback((clientX) => {
    if (brushStartRef.current == null) return
    const range = commitDraft(clientX)
    brushStartRef.current = null
    brushDraftRef.current = null
    if (viewRef.current) viewRef.current.brushDraft = null
    if (range) onBrush?.(range)
    else requestDraw()
  }, [commitDraft, onBrush, requestDraw])

  const onPointerDown = (e) => {
    if (!hitOkRef.current) return
    const hit = hitAt(e.clientX, e.clientY)
    draggedRef.current = false
    if (!hit || hit.col !== 'c4') return
    brushStartRef.current = hit.x
  }

  const onPointerMove = (e) => {
    ptrRef.current = { x: e.clientX, y: e.clientY }
    if (brushStartRef.current != null) {
      const draft = commitDraft(e.clientX)
      if (draft) draggedRef.current = true
      brushDraftRef.current = draft
      if (viewRef.current) viewRef.current.brushDraft = draft
      requestDraw()
      return
    }
    if (hitRafRef.current) return
    hitRafRef.current = requestAnimationFrame(resolveHover)
  }

  const onPointerUp = (e) => { endBrush(e.clientX) }

  const onPointerLeave = (e) => {
    endBrush(e.clientX)
    onHoverCountry(null)
    onHoverBucket(null)
    setTip(null)
  }
  // SELECT (Yi): ein Klick waehlt, ein zweiter Klick auf dieselbe Zeile hebt die Wahl auf.
  // ABSTRACT/ELABORATE: liegt der Klick auf einem BESETZTEN Belegslot, oeffnet er den Lesetisch -
  // ein Strich ist genau ein Dokument. Ein leerer Slot bleibt leer und waehlt nur die Zeile;
  // das Slot-Raster ist sichtbar und darf nicht so tun, als laege dort etwas.
  const onClick = (e) => {
    if (!hitOkRef.current) return // waehrend einer Transition waeren die Positionen stale
    if (draggedRef.current) { draggedRef.current = false; return } // ein Zug ist kein Klick
    const hit = hitAt(e.clientX, e.clientY)
    if (!hit) return
    const doc = hit.col === 'c7' ? docAtHit(docsByCountry[hit.ci], hit.x) : null
    if (doc) { onSelectCountry(hit.ci); onOpenDoc?.(doc); return }
    onSelectCountry(hit.ci === selCi ? null : hit.ci)
  }

  // --- Tastatur: 53 transparente Buttons ueber den Zeilen -------------------
  const onRowKey = (r) => (e) => {
    const move = (next) => {
      e.preventDefault()
      rowBtnsRef.current[Math.max(0, Math.min(N_ROWS - 1, next))]?.focus()
    }
    if (e.key === 'ArrowDown') move(r + 1)
    else if (e.key === 'ArrowUp') move(r - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(N_ROWS - 1)
    else if (e.key === 'Escape') onSelectCountry(null)
  }

  const tipData = tip
    ? tipContent(countries[tip.ci], world, tip.col, buckets[tip.ci], fmt, docsByCountry[tip.ci], focusCat, tip.bucket)
    : null
  const docCount = docsByCountry.reduce((s, a) => s + a.length, 0)
  // Der Zeiger sagt an, was die Spalte kann: ueber c4 wird gezogen (Bereichsfilter), ueberall
  // sonst wird geklickt (Zeile waehlen, Beleg oeffnen).
  const canvasCursor = tip?.col === 'c4' ? 'ew-resize' : 'pointer'

  return (
    <div className="ledger-scroll" ref={wrapRef}>
      <div className="ledger-sheet" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Register, ${N_ROWS} Länder als Zeilen: wie viel dort gesprochen wurde, wofür, `
            + `wie oft es grenzwertig wurde, und rechts ${docCount} einzeln lesbare Belege. `
            + `${MARK_COL_KEYS.filter((k) => cols[k]).length} Mark-Spalten auf gemeinsamem Nullpunkt. `
            + 'Alle Werte stehen in der Tabelle unter dieser Grafik.'}
          style={{ width: '100%', height: '100%', display: 'block', cursor: canvasCursor }}
          onMouseMove={onPointerMove}
          onMouseDown={onPointerDown}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerLeave}
          onClick={onClick}
        />

        {/* Spaltenkoepfe als echte Buttons. c7 ist bewusst KEIN Sortierschluessel:
            die Belegzahl ist kein Mass (5 bis 17 je Land, nicht proportional zum Volumen). */}
        {sortableFor(cols).map((key) => {
          const col = cols[key]
          const active = sortCol === key
          const label = key === 'c3' && focusCat ? focusCat : col.label
          return (
            <button
              key={key}
              type="button"
              className="ledger-colhead"
              aria-pressed={active}
              aria-label={`Nach ${label} sortieren${active ? `, aktuell ${sortDir === 'desc' ? 'absteigend' : 'aufsteigend'}` : ''}`}
              onClick={() => onSort(key)}
              style={{
                left: pct(col.x0, W),
                width: pct((col.x1 || col.x0 + 120) - col.x0, W),
                top: pct(HEAD_Y, H),
                height: pct(HEAD_LABEL_H, H),
                color: active ? PAL.machine : PAL.muted,
              }}
            >
              {label}
            </button>
          )
        })}
        <span className="ledger-colhead ledger-colhead--static" aria-hidden="true"
          style={{ left: pct(cols.c7.x0, W), width: pct(W - cols.c7.x0, W), top: pct(HEAD_Y, H), height: pct(HEAD_LABEL_H, H), color: PAL.muted }}>
          Belege · klicken zum Lesen
        </span>

        {/* 53 transparente Zeilen-Buttons. Positionen kommen aus rowTop(i) und werden nur am
            Transitionsende geschrieben - nie pro Frame. onFocus zeichnet dasselbe Highlight
            wie onMouseEnter (volle Hover-Paritaet). */}
        {settled.map((ci, r) => (
          <Fragment key={countries[ci].country}>
            <button
              ref={(el) => { rowBtnsRef.current[r] = el }}
              type="button"
              className="ledger-row-btn"
              style={{ top: pct(rowTop(r), H), height: pct(ROW_H, H) }}
              aria-label={labelOf(ci)}
              aria-pressed={selCi === ci}
              onFocus={() => { onHoverCountry(ci); setFocusCi(ci) }}
              onBlur={() => { onHoverCountry(null); setFocusCi((cur) => (cur === ci ? null : cur)) }}
              onClick={() => onSelectCountry(selCi === ci ? null : ci)}
              onKeyDown={onRowKey(r)}
            />
            {/* Nur in der GEWAEHLTEN Zeile: bis zu 22 Belegstrich-Buttons, Trefferflaeche
                8,7 x 22 px. Sie stehen direkt hinter ihrer Zeile im DOM, damit die Tab-Kette
                genau so laeuft wie in der Spezifikation: Zeile -> Enter -> Belege -> Enter. */}
            {selCi === ci && docsByCountry[ci].map((d) => (
              <button
                key={d.id}
                ref={(el) => { docBtnsRef.current[d.id] = el }}
                type="button"
                className="ledger-doc-btn"
                style={{
                  left: pct(slotX(d.kind, d.i), W),
                  width: pct(cols.c7.slotW, W),
                  top: pct(rowTop(r), H),
                  height: pct(ROW_H, H),
                }}
                aria-label={docLabelOf ? docLabelOf(d) : `Beleg lesen, ${d.len} Zeichen`}
                onFocus={() => setFocusCi(ci)}
                onBlur={() => setFocusCi((cur) => (cur === ci ? null : cur))}
                onClick={() => onOpenDoc?.(d)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return
                  e.preventDefault()
                  onSelectCountry(null)
                  rowBtnsRef.current[r]?.focus()
                }}
              />
            ))}
          </Fragment>
        ))}

        {tipData && (
          <div
            className="mono"
            style={{
              position: 'absolute',
              left: pct(Math.min(cols[tip.col].x0, W - 320), W),
              top: pct(rowTop(tip.rank) + ROW_H, H),
              transform: 'translateY(6px)',
              zIndex: 6,
              pointerEvents: 'none',
              maxWidth: 280,
              padding: '0.45rem 0.6rem',
              background: PAL.panel2,
              border: `1px solid ${rgba(PAL.machine, 0.45)}`,
              borderRadius: 6,
              color: PAL.text,
              fontSize: '0.68rem',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: PAL.machine }}>{shortOf[tip.ci]}</strong> · {tipData.head}
            <br />
            <span style={{ color: PAL.muted }}>{tipData.body}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Welches Dokument liegt unter x? Rein arithmetisch ueber slotAt(), kein Quadtree. */
function docAtHit(docs, x) {
  const slot = slotAt(x)
  if (!slot) return null
  return docs.find((d) => d.kind === slot.kind && d.i === slot.j) || null
}

/**
 * LOOKUP (Yi): exakter Wert, Weltwert und Delta - der Tooltip ergaenzt, er ersetzt nichts.
 *
 * Die Wofuer-Spalte hat DREI Lesarten, und der Tooltip muss der folgen, die gerade im Bild ist:
 * ist eine Kategorie fokussiert, gilt deren Wert; steht der Zeiger sonst ueber einem einzelnen
 * Segment des Stapels, gilt dessen Wert; erst ohne beides ist die groesste Kategorie die
 * sinnvolle Auskunft. Vorher nannte der Tooltip immer die groesste - bei fokussiertem
 * "Mathe/Logik" stand fuer Finnland "Sonstiges 29,3 %", waehrend der Balken 14,1 % zeigte.
 */
export function tipContent(c, world, col, bucket, fmt, docs, focusCat, hoverBucket) {
  const d = (a, b) => `${a - b >= 0 ? '+' : '−'}${fmt(Math.abs(a - b), 1)} pp gegenüber Welt`
  const NORM = 'Anteile auf 100 normiert (Rohsumme 98 bis 102)'
  if (col === 'c1' || col === 'c2') {
    return { head: `${fmt(c.n)} Gespräche`, body: `${fmt((100 * c.n) / world.total, 2)} % des Datensatzes · Weltsumme ${fmt(world.n)}` }
  }
  if (col === 'c3') {
    // ACHTUNG, zwei verschiedene Mengen: fokussierbar sind alle NEUN Kategorien, gestapelt werden
    // aber nur SIEBEN Buendel - Uebersetzen, Mathe/Logik und Ratschlag liegen zusammen im Buendel
    // "Rest". Fuer die drei gilt ihr eigener normierter Anteil (normCats), nicht der des Buendels.
    // Genau dieselbe Fallunterscheidung macht focusValues in ConversationLedger; waeren sie
    // verschieden, wuerden Balken und Tooltip auseinanderlaufen.
    if (focusCat) {
      const bi = CAT_BUCKET.findIndex((b) => b.key === focusCat)
      const inBucket = bi >= 0
      const v = inBucket ? (bucket[bi] ?? 0) : (normCats(c)[focusCat] ?? 0)
      const w = inBucket ? world.buckets?.[bi] : undefined
      return {
        head: `${focusCat} ${fmt(v, 1)} %`,
        // Der Weltvergleich steht nur da, wo es einen gibt. Fuer die drei Rest-Kategorien
        // fuehrt das Blatt keine Weltmarke, also wird hier auch keine behauptet.
        body: `${typeof w === 'number' ? `${d(v, w)} · ` : ''}${NORM}`,
      }
    }
    if (typeof hoverBucket === 'number' && CAT_BUCKET[hoverBucket]) {
      const b = CAT_BUCKET[hoverBucket]
      const v = bucket[hoverBucket] ?? 0
      const w = world.buckets?.[hoverBucket]
      const name = b.members ? `${b.key} (${b.members.join(', ')})` : b.key
      return { head: `${name} ${fmt(v, 1)} %`, body: `${typeof w === 'number' ? `${d(v, w)} · ` : ''}${NORM}` }
    }
    const top = CAT_BUCKET.map((b, i) => ({ key: b.key, v: bucket[i] })).sort((a, b) => b.v - a.v)[0]
    return { head: `${top.key} ${fmt(top.v, 1)} %`, body: `Sonstiges ${fmt(bucket[0], 1)} % · ${NORM}` }
  }
  if (col === 'c4') {
    const val = c.modPct ?? 0
    return {
      head: `Graubereich ${fmt(val, 1)} %`,
      body: `${d(val, world.modPct)} · ${val > MOD_FOCUS
        ? `steht rechts vom Achsenbruch, dort ist die Skala ${fmt(MOD_TAIL_SQUEEZE, 2)}× gestaucht`
        : `Skala bis ${MOD_FOCUS} % linear`} · θ = 0,25 gesetzt, nicht kalibriert · über die Spalte ziehen filtert auf einen Wertebereich`,
    }
  }
  if (col === 'c7') {
    const s = docs.filter((x) => x.kind === 's').length
    const g = docs.length - s
    return { head: `${docs.length} lesbare Belege`, body: `${s} regulär, ${g} im Graubereich · Höhe = Zeichenzahl · Zahl ist kein Maß` }
  }
  return { head: '', body: '' }
}
