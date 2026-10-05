import { PAL } from '../../theme'

// WIE ALT IST DAS WERKZEUG, DEM MAN GEGENUEBERSTEHT? Ein Balken, drei Klassen, direkt beschriftet.
//
// WARUM DIESE FRAGE UND NICHT "WELCHER ERSCHEINUNGSMONAT". Die erste Fassung zeigte die
// Download-Masse ueber 40 Erscheinungsmonate. Das war korrekt und unverstaendlich: "2026-03" ist
// fuer den Leser keine Groesse, und 40 spitze Balken sind kein Befund, sondern eine Textur. Die
// Frage, die der Abschluss stellt, lautet "haelt ein gelerntes Merkmal?" - dazu gehoert "wie alt
// ist das Werkzeug", nicht "wann kam es heraus". Dieselben Downloads, dieselbe Quelle, nur die
// Achse gewechselt: aus 40 Balken werden drei Klassen, die man in einer Sekunde liest.
//
// ENCODING: ein 100-%-Stapel. Erlaubt ist er hier, weil es genau DREI Teile eines Ganzen gibt
// und die Frage "wie viel davon ist neu" lautet, nicht "vergleiche Klasse zwei zwischen Gruppen"
// (dort waere der gemeinsame Nullpunkt das Problem). Jedes Segment traegt seine Zahl im Klartext.

const VW = 1320
const H_BAR = 54
const VH = 128
const PAD_X = 2

const fmtDE = (n, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
// Luminanz statt Farbton: die drei Klassen sind GEORDNET (neu bis alt), und fuer geordnete
// Attribute ist Helligkeit der richtige Kanal (Ware). Ein kategorialer Farbton waere hier falsch.
const SHADE = [0.95, 0.55, 0.28]

export default function ToolAge({ v }) {
  const buckets = v.ageBuckets || []
  if (!buckets.length) return null
  const total = buckets.reduce((s, b) => s + b.pct, 0) || 100
  const innerW = VW - PAD_X * 2

  const label = `Anteil der ${fmtDE(v.dl)} Downloads nach Alter des Modells am Datenstand `
    + `${v.asOf}: ` + buckets.map((b) => `${b.label} ${fmtDE(b.pct, 1)} Prozent`).join(', ') + '.'

  let off = 0
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" aria-label={label}
      style={{ display: 'block', height: 'auto', marginTop: 'var(--s-4)' }}>
      {buckets.map((b, i) => {
        const w = (b.pct / total) * innerW
        const x = PAD_X + off
        off += w
        const breit = w > 190 // erst ab dieser Breite passt die Beschriftung ins Segment
        return (
          <g key={b.label}>
            <rect x={x} y={0} width={Math.max(1, w - 2)} height={H_BAR}
              fill={PAL.human} opacity={SHADE[i]} />
            <text x={x} y={H_BAR + 26} className="display" fontSize="26" fill={PAL.text}>
              {fmtDE(b.pct, 0)} %
            </text>
            <text x={x} y={H_BAR + 45} fontFamily="'IBM Plex Mono', ui-monospace, monospace"
              fontSize="11" fill={PAL.muted}>
              {b.label}
            </text>
            <text x={x} y={H_BAR + 62} fontFamily="'IBM Plex Mono', ui-monospace, monospace"
              fontSize="10" fill={PAL.muted} opacity={breit ? 1 : 0}>
              {fmtDE(b.n)} Modelle
            </text>
          </g>
        )
      })}
      {/* Die Trennlinie zwischen "hoechstens ein halbes Jahr" und dem Rest: das ist die Aussage. */}
      <line x1={PAD_X + (buckets[0].pct / total) * innerW - 1} y1={-4}
        x2={PAD_X + (buckets[0].pct / total) * innerW - 1} y2={H_BAR + 4}
        stroke={PAL.machine} strokeWidth="2" />
    </svg>
  )
}
