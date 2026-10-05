import { PAL } from '../../theme'
import { CHANCE, DETECTION_PAIRS, DETECTION_RATES } from './outlookText'

// WIE GUT ERKENNEN MENSCHEN SYNTHETISCHE INHALTE? Sieben kontrollierte Studien auf EINER Skala.
//
// WARUM ALS GRAFIK. Dieselben Zahlen standen vorher als drei Absaetze Prosa da. Prosa kann
// Werte nur nacheinander nennen; der Befund ist aber ein VERGLEICH: die Quote streut von unter
// dem Zufall bis 82 %, und was sie bewegt, ist nicht das Alter des Generators, sondern Motiv
// und Betrachtungszeit. Nebeneinander auf gemeinsamer Skala sieht man das in einer Sekunde,
// im Fliesstext gar nicht (Munzner: compare als Task, nicht lookup).
//
// ENCODING. Position auf gemeinsamer Skala plus Laenge ab der 50-%-Referenz, dem Zufall
// (Cleveland & McGill Rang 1). Die Nulllinie der Balken ist deshalb 50 und nicht 0: gefragt ist
// "besser oder schlechter als Raten", nicht "wie viel Prozent". Ein Balken nach LINKS heisst
// unter dem Zufall - das gibt es hier wirklich (GAN-Portraets, 48,2 %).
//
// FARBE. Alle Balken sind Teal, weil alle dasselbe messen: die Leistung von MENSCHEN. Teal ist
// im Farbsystem der Story genau dafuer reserviert. Der erste Entwurf faerbte die zwei
// Vergleichspaare magenta und teal, um sie zu gruppieren - das war ein Regelverstoss: Magenta
// gehoert der Maschine, Teal dem Menschen, keine von beiden ist eine freie Gruppierungsfarbe.
// Die Paare bindet jetzt allein die Klammer rechts, also Position statt Farbe. Nur der Wert
// unter dem Zufall traegt die Outcome-Farbe, und das ist ein Urteil, keine Kategorie.

const VW = 1320
const VH = 300
const PAD_L = 300 // Studienbeschriftung, links buendig
const PAD_R = 150 // Wert plus Quelle rechts
const PAD_T = 34
const PAD_B = 40
const ROW = (VH - PAD_T - PAD_B) / DETECTION_RATES.length
const BAR_H = 15
const X0 = 40 // Skalenanfang: unter 40 % liegt keine Studie, 0 waere leerer Raum
const X1 = 90

const fmtDE = (n, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
const PAIR_MARK = PAL.axis // Klammerfarbe: neutral, sie gruppiert und benennt nichts

export default function DetectionRates() {
  const innerW = VW - PAD_L - PAD_R
  const x = (v) => PAD_L + ((v - X0) / (X1 - X0)) * innerW
  const y = (i) => PAD_T + i * ROW
  const xChance = x(CHANCE)

  const label = `Trefferquoten aus sieben kontrollierten Studien, gemeinsame Skala, `
    + `${CHANCE} Prozent ist Raten. `
    + DETECTION_RATES.map((d) => `${d.label} ${fmtDE(d.v)} Prozent bei n gleich ${d.n}`).join('; ')
    + '. Die Spanne reicht von unter dem Zufall bis 82 Prozent.'

  return (
    <div className="spot-chartscroll">
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" aria-label={label}
        style={{ display: 'block', height: 'auto', minWidth: 720 }}>
        {/* Skalenmarken. 50 traegt die Referenz und ist deshalb die einzige durchgezogene Linie. */}
        {[40, 50, 60, 70, 80, 90].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={PAD_T - 8} y2={VH - PAD_B}
              stroke={v === CHANCE ? PAL.axis : PAL.grid} strokeWidth="1"
              strokeDasharray={v === CHANCE ? undefined : '2 4'} />
            <text x={x(v)} y={VH - PAD_B + 14} textAnchor="middle"
              fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="9.5" fill={PAL.muted}>
              {v} %
            </text>
          </g>
        ))}
        <text x={xChance} y={PAD_T - 14} textAnchor="middle"
          fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="10" fill={PAL.text}>
          Raten
        </text>

        {DETECTION_RATES.map((d, i) => {
          const unter = d.v < CHANCE
          // Gleiche Mark fuer alle sieben; die zwei Paare heben sich nur durch Deckkraft ab.
          const col = PAL.human
          const bx = unter ? x(d.v) : xChance
          const bw = Math.abs(x(d.v) - xChance)
          return (
            <g key={d.label}>
              <text x={PAD_L - 14} y={y(i) + BAR_H} textAnchor="end"
                fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="10.5"
                fill={d.paar ? PAL.text : PAL.muted}>
                {d.label}
              </text>
              <rect x={bx} y={y(i) + 2} width={Math.max(1, bw)} height={BAR_H}
                fill={col} opacity={d.paar ? 0.95 : 0.55} />
              <text x={x(d.v) + (unter ? -6 : 6)} y={y(i) + BAR_H - 1} textAnchor={unter ? 'end' : 'start'}
                fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="11" fontWeight="700"
                fill={unter ? PAL.no : PAL.text}>
                {fmtDE(d.v)} %
              </text>
              <text x={VW - PAD_R + 66} y={y(i) + BAR_H - 1} textAnchor="end"
                fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="9" fill={PAL.muted}>
                n = {d.n.toLocaleString('de-DE')}
              </text>
            </g>
          )
        })}

        {/* Die zwei Paare bekommen ihre Klammer: der Vergleich IST die Aussage, nicht der Einzelwert. */}
        {DETECTION_PAIRS.map((pair) => {
          const idx = DETECTION_RATES.map((d, i) => (d.paar === pair.key ? i : -1)).filter((i) => i >= 0)
          if (idx.length !== 2) return null
          const top = y(idx[0]) + 2
          const bot = y(idx[1]) + BAR_H + 2
          const bx = VW - PAD_R + 76
          return (
            <g key={pair.key}>
              <path d={`M${bx} ${top} L${bx + 6} ${top} L${bx + 6} ${bot} L${bx} ${bot}`}
                fill="none" stroke={PAIR_MARK} strokeWidth="1" />
              <text x={bx + 11} y={(top + bot) / 2 + 3}
                fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="9.5" fill={PAL.text}>
                {pair.key === 'tipps' ? '+4,5' : '+10'}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
