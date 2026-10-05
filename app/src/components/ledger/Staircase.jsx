import { useEffect, useRef, useState } from 'react'
import { PAL } from '../../theme'
import { THREAD_UNIT, easeCubicInOut, fmtDE, shortName, staircase } from '../../lib/ledger'
import { rgba } from './drawSheet'

// DIE TREPPE - die einzige echt neue Kodierung des Akts.
//
// Jede waagerechte Linie ist EIN Tausenderstrich aus dem Einheiten-Kamm, aufgeklappt auf die
// Zeitachse: Linie j spannt von dem Zeitpunkt, an dem das Land sein j-tes Tausend begonnen hat,
// bis zu dem, an dem es voll war. LAENGE = Zeit fuer 1.000 Gespraeche = Kehrwert der Aktivitaet.
// Damit traegt eine Laenge (Cleveland & McGill Rang 2) einen Wert, den das Projekt sonst nirgends
// zeigt: Tempo. Der Kamm oben im Blatt und die Treppe hier zeigen dieselben Striche - die
// Einheit bleibt ueber zwei Ansichten hinweg dieselbe zaehlbare Groesse.
//
// EHRLICHKEIT IM BILD, nicht in der Fussnote: innerhalb eines Monats ist linear interpoliert,
// weil nur Monatssummen vorliegen. Die Monatsgrenzen sind exakt, alles dazwischen ist Annahme.

const VW = 360
const PAD = { l: 4, r: 4, t: 10, b: 22 }
const DUR = 700 // gestaffelt nach Strichindex, ausgeloest durch genau einen Klick
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

export default function Staircase({ country, months, worldTrend, reduce }) {
  const k = Math.round((country.n || 0) / THREAD_UNIT)
  const pitch = Math.min(20, Math.max(1.5, 240 / Math.max(1, k)))
  const bandH = k * pitch
  const VH = bandH + PAD.t + PAD.b
  const innerW = VW - PAD.l - PAD.r
  const nM = months.length
  const x = (t) => PAD.l + (t / nM) * innerW

  const steps = staircase(country.trend || [], k)
  // Die Welt hat 837.989 Gespraeche, das Land k * 1.000. Damit beide Treppen dieselbe Strichzahl
  // haben und trotzdem beide den vollen Zeitraum ausfuellen, wird das Weltprofil auf die
  // Landessumme herunterskaliert: verglichen wird die FORM des Verlaufs, nicht das Volumen.
  const worldTotal = worldTrend.reduce((s, v) => s + v, 0) || 1
  const worldSteps = staircase(worldTrend.map((v) => (v * k * THREAD_UNIT) / worldTotal), k)

  const [p, setP] = useState(reduce ? 1 : 0)
  const rafRef = useRef(0)
  useEffect(() => {
    if (reduce) { setP(1); return undefined }
    const t0 = performance.now()
    const step = () => {
      const u = clamp01((performance.now() - t0) / DUR)
      setP(u)
      rafRef.current = u < 1 ? requestAnimationFrame(step) : 0
    }
    setP(0)
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [reduce, country.country])

  // Restfaden: k ist gerundet, die letzte Linie deckt deshalb selten exakt 1.000 Gespraeche ab.
  const covered = k * THREAD_UNIT
  const leftover = (country.n || 0) - covered
  const lastPartial = leftover < 0 ? (country.n || 0) - (k - 1) * THREAD_UNIT : null

  const gapT = months.findIndex((m) => m.month === '2024-01')

  return (
    <div>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" style={{ display: 'block', height: 'auto' }}
        aria-label={`Tempo-Treppe ${shortName(country.country)}: ${k} Linien, je 1.000 Gespräche. Länge einer Linie gleich Zeit für 1.000 Gespräche.`}>
        {/* Monatsraster: die exakten Grenzen. Alles dazwischen ist Interpolation. */}
        {months.map((m, j) => (
          <rect key={m.month} x={x(j)} y={PAD.t} width="0.5" height={bandH} fill={rgba(PAL.ink, j % 3 === 0 ? 0.12 : 0.05)} />
        ))}
        {gapT >= 0 && (
          <g>
            <rect x={x(gapT)} y={PAD.t - 4} width="1" height={bandH + 4} fill={rgba(PAL.machine, 0.5)} />
            <text x={x(gapT) + 3} y={PAD.t - 4} fontFamily="'IBM Plex Mono', monospace" fontSize="7" fill={PAL.machine}>Erhebungslücke</text>
          </g>
        )}

        {/* Weltprofil auf dieselbe Strichzahl normiert: 1 px Hairline hinter der Treppe. */}
        {worldSteps.map((s, i) => (
          <rect key={`w${i}`} x={x(s.t0)} y={PAD.t + i * pitch + pitch / 2} width={Math.max(0.6, x(s.t1) - x(s.t0))} height="1" fill={rgba(PAL.human, 0.35)} />
        ))}

        {steps.map((s, i) => {
          const local = clamp01(easeCubicInOut(p) * 1.35 - (i / Math.max(1, k)) * 0.35)
          if (local <= 0) return null
          const w = Math.max(0.8, x(s.t1) - x(s.t0)) * local
          const isLast = i === k - 1 && lastPartial != null
          return (
            <rect
              key={i}
              x={x(s.t0)}
              y={PAD.t + i * pitch + Math.max(0, pitch - 1.4) / 2}
              width={w}
              height={Math.min(1.6, Math.max(0.9, pitch - 0.6))}
              fill={rgba(PAL.ink, isLast ? 0.4 : 0.82)}
              strokeDasharray={isLast ? '2 2' : undefined}
              stroke={isLast ? rgba(PAL.ink, 0.6) : undefined}
              strokeWidth={isLast ? 0.6 : undefined}
            />
          )
        })}

        <text x={PAD.l} y={VH - 12} fontFamily="'IBM Plex Mono', monospace" fontSize="7.5" fill={PAL.muted}>{months[0]?.month}</text>
        <text x={VW - PAD.r} y={VH - 12} textAnchor="end" fontFamily="'IBM Plex Mono', monospace" fontSize="7.5" fill={PAL.muted}>{months[nM - 1]?.month}</text>
        <text x={PAD.l} y={VH - 2} fontFamily="'IBM Plex Mono', monospace" fontSize="7.5" fill={PAL.muted}>
          Länge = Zeit für 1.000 Gespräche · {k} Linien
        </text>
      </svg>

      <p className="mono" style={{ margin: '0.4rem 0 0', color: PAL.muted, fontSize: '9.5px', lineHeight: 1.55 }}>
        Innerhalb eines Monats linear interpoliert, weil nur Monatssummen vorliegen; die Monatsgrenzen sind exakt.
        {lastPartial != null && <> Letzte Linie gestrichelt, <b>Restfaden: {fmtDE(lastPartial)} Gespräche</b> statt {fmtDE(THREAD_UNIT)}.</>}
        {leftover > 0 && <> {fmtDE(leftover)} Gespräche liegen über dem letzten vollen Tausend und sind nicht im Bild.</>}
        {k > 60 && <> {fmtDE(k)} Striche: bei dieser Dichte liest das Band als Textur, die Längenverteilung bleibt lesbar.</>}
        {' '}Teal im Hintergrund ist die Welt-Treppe, auf dieselbe Strichzahl normiert.
      </p>
    </div>
  )
}
