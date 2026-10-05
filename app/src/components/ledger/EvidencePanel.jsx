import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PAL } from '../../theme'
import { catPct, easeCubicInOut, fmtDE, leveragePoints, olsFit, pearson, shortName, spearman } from '../../lib/ledger'
import { rgba } from './drawSheet'
import { SourceNote } from '../Motion'

// "Der Beleg" - die methodische Pointe des Akts.
//
// Anscombe 1973 als BEDIENELEMENT: die einzige Grafik im Projekt, die ihre eigene Schlagzeile
// widerlegt. Die naheliegende Erklaerung "Rollenspiel treibt den Graubereich" (r = 0,71) faellt
// auf r = 0,24 zusammen, sobald die beiden Hebelpunkte fehlen. Die Schlagzeile des Akts ist
// deshalb nicht "Rollenspiel treibt den Graubereich", sondern "Zwei von 53 Laendern tragen die
// Korrelation".
//
// VERBINDLICH: beide Zahlen stehen gleichzeitig und in gleicher Sichtbarkeit im Bild. Es gibt
// keinen Screenshot dieses Panels, auf dem nur r = 0,71 zu sehen waere.

const VW = 320
const VH = 250
const M = { l: 34, r: 10, t: 10, b: 30 }
const PW = VW - M.l - M.r
const PH = VH - M.t - M.b
const X_MAX = 80 // Rollenspiel-Anteil in Prozent (real 0 bis 79)
const Y_MAX = 25 // Graubereich in Prozent (real 0,0 bis 24,0)
const DUR = 400

const px = (v) => M.l + (v / X_MAX) * PW
const py = (v) => M.t + PH - (v / Y_MAX) * PH
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

export default function EvidencePanel({ countries, shortOf, hoverCi, selCi, onHoverCountry, onSelectCountry, reduce }) {
  const [cut, setCut] = useState(false)
  const [mix, setMix] = useState(0)
  const mixRef = useRef(0)
  const rafRef = useRef(0)

  // Alle Kennzahlen zur Laufzeit aus den echten Daten. Keine Zahl in diesem Panel ist getippt.
  const stats = useMemo(() => {
    const x = countries.map((c) => catPct(c, 'Rollenspiel/Story'))
    const y = countries.map((c) => c.modPct ?? 0)
    const outIdx = new Set(leveragePoints(x, 2).map((p) => p.i))
    const keep = countries.map((_, i) => i).filter((i) => !outIdx.has(i))
    const kx = keep.map((i) => x[i])
    const ky = keep.map((i) => y[i])
    // Die beiden Hebelpunkte werden als INDIZES gefuehrt, nicht als Namen: der angezeigte Name ist
    // die deutsche Form, der Lookup darf davon nicht abhaengen.
    const outSorted = [...outIdx].sort((a, b) => shortName(countries[a].country).localeCompare(shortName(countries[b].country), 'de'))
    return {
      x,
      y,
      outIdx,
      outSorted,
      outNames: outSorted.map((i) => shortName(countries[i].country)),
      rAll: pearson(x, y),
      rCut: pearson(kx, ky),
      fitAll: olsFit(x, y),
      fitCut: olsFit(kx, ky),
      rho: spearman(x, y),
      rLogN: pearson(countries.map((c) => Math.log10(c.n)), y),
      nCut: keep.length,
    }
  }, [countries])

  // Eine Interpolation, ausgeloest durch genau einen Klick. Keine Ambient-Schleife.
  useEffect(() => {
    const target = cut ? 1 : 0
    if (reduce) { mixRef.current = target; setMix(target); return undefined }
    const from = mixRef.current
    const t0 = performance.now()
    const step = () => {
      const u = clamp01((performance.now() - t0) / DUR)
      const val = from + (target - from) * easeCubicInOut(u)
      mixRef.current = val
      setMix(val)
      if (u < 1) rafRef.current = requestAnimationFrame(step)
      else rafRef.current = 0
    }
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [cut, reduce])

  const lerp = useCallback((a, b) => a + (b - a) * mix, [mix])
  const m = lerp(stats.fitAll.m, stats.fitCut.m)
  const b = lerp(stats.fitAll.b, stats.fitCut.b)
  const r = lerp(stats.rAll, stats.rCut)
  const lineY0 = m * 0 + b
  const lineY1 = m * X_MAX + b
  const focusCi = hoverCi ?? selCi
  const [outA, outB] = stats.outNames

  const gridY = [0, 5, 10, 15, 20, 25]
  const gridX = [0, 20, 40, 60, 80]

  return (
    <figure style={{ margin: 0, display: 'grid', gap: 'var(--s-2)' }}>
      <figcaption className="t-label" style={{ color: PAL.muted }}>Der Beleg</figcaption>

      <svg viewBox={`0 0 ${VW} ${VH}`} role="img" width="100%" style={{ height: 'auto', display: 'block', overflow: 'visible' }}
        aria-label={`Streudiagramm: Rollenspiel-Anteil gegen Graubereich, ${countries.length} Länder. Über alle Länder ist r gleich ${fmtDE(stats.rAll, 2)}. Ohne ${outA} und ${outB} sinkt r auf ${fmtDE(stats.rCut, 2)} bei n gleich ${stats.nCut}.`}>
        {gridY.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={M.l + PW} y1={py(v)} y2={py(v)} stroke={PAL.grid} strokeWidth="1" />
            {/* Die Einheit haengt an der obersten Marke statt frei darueber zu stehen: dort
                ueberlappte sie die 25 (gemessen 7 x 8 px). */}
            <text x={M.l - 6} y={py(v) + 3} textAnchor="end" className="mono" fontSize="8" fill={PAL.muted}>
              {v === gridY[gridY.length - 1] ? `${v} %` : v}
            </text>
          </g>
        ))}
        {gridX.map((v) => (
          <text key={`x${v}`} x={px(v)} y={VH - 14} textAnchor="middle" className="mono" fontSize="8" fill={PAL.muted}>{v}</text>
        ))}
        <text x={M.l} y={VH - 3} className="mono" fontSize="8" fill={PAL.muted}>Rollenspiel/Story %</text>

        {/* Die Weltlinie des Blattes liegt auch hier: 3,8 % Graubereich, dieselbe Referenz. */}
        <line x1={M.l} x2={M.l + PW} y1={py(3.8)} y2={py(3.8)} stroke={rgba(PAL.human, 0.45)} strokeWidth="1" strokeDasharray="3 3" />

        {/* BEIDE LINIEN GLEICHZEITIG. Vorher war nur eine da und der Toggle kippte sie; wer nicht
            klickte, sah nie, dass es eine zweite gibt - die Pointe hing an einer Interaktion.
            Jetzt liegt die flache Linie (ohne die zwei) dauerhaft daneben und man SIEHT, wie steil
            die andere ist. Der Toggle betont nur noch, welche gerade gilt. */}
        <line x1={px(0)} x2={px(X_MAX)} y1={py(stats.fitCut.b)} y2={py(stats.fitCut.m * X_MAX + stats.fitCut.b)}
          stroke={PAL.human} strokeWidth={cut ? 2 : 1} strokeDasharray={cut ? undefined : '4 3'} opacity={cut ? 1 : 0.5} />
        {/* Die Linienlabels sitzen AN ihrer Linie, an einer freien Stelle. Rechts oben liegen die
            zwei Ausreisser mit ihren Beschriftungen, links unten die dichte Punktwolke - beide
            Stellen habe ich zuerst probiert und beide kollidierten. Frei ist die rechte Haelfte
            zwischen den Linien: die flache endet dort bei rund 7 %, die steile laeuft bei x = 50
            durch leeren Raum. */}
        <text x={px(X_MAX) - 4} y={py(stats.fitCut.m * X_MAX + stats.fitCut.b) - 8} textAnchor="end"
          className="mono" fontSize="9" fill={PAL.human} opacity={cut ? 1 : 0.65}>ohne die zwei</text>
        <line x1={px(0)} x2={px(X_MAX)} y1={py(stats.fitAll.b)} y2={py(stats.fitAll.m * X_MAX + stats.fitAll.b)}
          stroke={PAL.human} strokeWidth={cut ? 1 : 2} strokeDasharray={cut ? '4 3' : undefined} opacity={cut ? 0.4 : 1} />
        <text x={px(37)} y={py(stats.fitAll.m * 37 + stats.fitAll.b) - 7}
          className="mono" fontSize="9" fill={PAL.human} opacity={cut ? 0.5 : 1}>mit allen 53</text>

        {countries.map((c, i) => {
          const isOut = stats.outIdx.has(i)
          const isFocus = focusCi === i
          const dim = isOut ? 1 - 0.8 * mix : 1 // Ausreisser faden auf 20 %, sie verschwinden nicht
          return (
            <circle
              key={c.country}
              cx={px(stats.x[i])}
              cy={py(stats.y[i])}
              r={isFocus ? 4.5 : 3}
              fill={isFocus ? PAL.machine : rgba(PAL.ink, 0.65)}
              opacity={dim}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHoverCountry(i)}
              onMouseLeave={() => onHoverCountry(null)}
              onClick={() => onSelectCountry(i)}
            >
              <title>{`${shortOf[i]}: Rollenspiel ${fmtDE(stats.x[i], 0)} %, Graubereich ${fmtDE(stats.y[i], 1)} %`}</title>
            </circle>
          )
        })}

        {/* DIE ZWEI HEBELPUNKTE TRAGEN IHREN NAMEN, IMMER. Vorher waren sie zwei Punkte wie 51
            andere und nur per Hover identifizierbar - die Aussage "zwei Zeilen tragen den
            Zusammenhang" war damit im Bild nicht nachvollziehbar. Jetzt zeigt das Diagramm,
            WELCHE zwei. Sie verblassen beim Ausblenden mit, das Label geht mit. */}
        {stats.outSorted.slice(0, 2).map((i) => {
          const cx = px(stats.x[i]); const cy = py(stats.y[i])
          const links = cx > VW - 120
          return (
            <g key={`out-${i}`} pointerEvents="none" opacity={1 - 0.75 * mix}>
              <line x1={cx} y1={cy} x2={cx + (links ? -12 : 12)} y2={cy - 12} stroke={rgba(PAL.ink, 0.5)} strokeWidth="1" />
              <text x={cx + (links ? -15 : 15)} y={cy - 14} textAnchor={links ? 'end' : 'start'}
                className="mono" fontSize="10" fill={PAL.text}>
                {shortOf[i]} {fmtDE(stats.x[i], 0)} %
              </text>
            </g>
          )
        })}

        {/* CONNECT: die im Blatt fokussierte Zeile bekommt hier Ring und Label. Kein Auto-Scroll.
            DAS LABEL TRAEGT EINE PLATTE. Wo es landet, haengt am gewaehlten Land - es kann auf
            jedem Punkt, jeder Gitterlinie und jeder Linienbeschriftung liegen. Bei Rumaenien lag
            es genau auf "mit allen 53" und beide Wortfolgen waren ineinander gedruckt. Eine feste
            Ausweichrichtung loest das nicht (das naechste Land kollidiert woanders), eine Platte
            in Hintergrundfarbe schon: sie deckt, was darunter liegt, und das Label bleibt lesbar. */}
        {focusCi != null && focusCi >= 0 && (() => {
          // Ist das fokussierte Land einer der zwei Ausreisser, traegt es SCHON einen Namen
          // ("Jamaika 79 %"). Ein zweites Label daneben war eine Dopplung, die sich selbst
          // ueberlagert hat - gemessen bei genau diesen zwei von 53. Dann bleibt nur der Ring.
          if (stats.outSorted.slice(0, 2).includes(focusCi)) {
            return (
              <circle cx={px(stats.x[focusCi])} cy={py(stats.y[focusCi])} r="8" fill="none"
                stroke={PAL.machine} strokeWidth="1.4" pointerEvents="none" />
            )
          }
          const lx = Math.min(px(stats.x[focusCi]) + 11, VW - 4)
          const ly = py(stats.y[focusCi]) - 9
          const rechts = px(stats.x[focusCi]) > VW - 80
          const breite = shortOf[focusCi].length * 5.4 + 8   // Mono bei 9 px: rund 5,4 px je Zeichen
          return (
            <g pointerEvents="none">
              <circle cx={px(stats.x[focusCi])} cy={py(stats.y[focusCi])} r="8" fill="none" stroke={PAL.machine} strokeWidth="1.4" />
              <rect x={(rechts ? lx - breite : lx) - 4} y={ly - 9} width={breite} height="13"
                rx="2" fill={PAL.bg} opacity="0.92" />
              <text x={lx} y={ly} textAnchor={rechts ? 'end' : 'start'}
                className="mono" fontSize="9" fill={PAL.machine}>
                {shortOf[focusCi]}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* BEIDE ZAHLEN NEBENEINANDER, nicht eine gross und eine in der Fussnote. Der Befund IST
          der Unterschied zwischen ihnen; wer nur "r = 0,71" sieht, liest das Gegenteil. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
        <span className="display" style={{ fontSize: '2.6rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: cut ? PAL.muted : PAL.text }}>
          {fmtDE(stats.rAll, 2)}
        </span>
        <span className="mono" style={{ color: PAL.muted, fontSize: '0.7rem' }}>mit den zwei</span>
        <span aria-hidden="true" className="mono" style={{ color: PAL.machine, fontSize: '1.1rem' }}>→</span>
        <span className="display" style={{ fontSize: '2.6rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: cut ? PAL.text : PAL.muted }}>
          {fmtDE(stats.rCut, 2)}
        </span>
        <span className="mono" style={{ color: PAL.muted, fontSize: '0.7rem' }}>ohne sie (n = {stats.nCut})</span>
        <button
          type="button"
          className="mono"
          aria-pressed={cut}
          onClick={() => setCut((v) => !v)}
          style={{
            font: 'inherit',
            fontSize: '0.68rem',
            cursor: 'pointer',
            color: cut ? PAL.machine : PAL.muted,
            background: 'transparent',
            border: `1px solid ${cut ? PAL.machine : rgba(PAL.hairline, 0.5)}`,
            borderRadius: 999,
            padding: '0.24rem 0.7rem',
          }}
        >
          {cut ? '✓ ' : ''}Ausreißer ausblenden
        </button>
      </div>

      {/* DIE SCHLUSSFOLGERUNG, ausgeschrieben. "Zwei Laender tragen die Korrelation" ist ein
          Befund, keine Aussage: er sagt nicht, was daraus folgt. Genau das fehlte. */}
      <p className="t-body" style={{ margin: 0, color: PAL.text, maxWidth: '46ch' }}>
        Also: <b>Rollenspiel erklärt den Graubereich nicht.</b> Wer aus dieser Punktwolke eine Regel
        abliest, hat zwei Länder gelesen und nicht {countries.length}.
      </p>
      <SourceNote className="" label="Wie die zwei bestimmt wurden, und was sonst noch gerechnet ist">
        Ausgewählt sind {outA} und {outB} über den <b>Hebelwert der Regression</b>, nicht über eine Namensliste:
        {' '}{outB} liegt bei {fmtDE(stats.x[stats.outSorted[1]], 0)} % Rollenspiel, {outA} bei
        {' '}{fmtDE(stats.x[stats.outSorted[0]], 0)} %, der nächste Wert folgt erst bei
        {' '}{fmtDE(Math.max(...stats.x.filter((v, i) => !stats.outIdx.has(i))), 0)} %.
        {' '}Spearman ρ = {fmtDE(stats.rho, 2)} (rangbasiert, also unempfindlicher gegen genau solche Ausreißer).
        {' '}r(log n, Graubereich) = {fmtDE(stats.rLogN, 2)}: die Quote hängt nicht am Volumen des Landes.
        {' '}Die gestrichelte Linie ist der Weltwert 3,8 %, dieselbe Referenz wie im Blatt.
      </SourceNote>
    </figure>
  )
}
