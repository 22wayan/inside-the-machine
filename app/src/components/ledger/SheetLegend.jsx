import { CAT_BUCKET, PAL } from '../../theme'
import { rgba } from './drawSheet'
import { MOD_FOCUS } from './geometry'

// DIE LEGENDE DES BLATTES. Sie zeigt jede der vier Spalten als Miniatur ihrer echten Mark und
// sagt in EINER Zeile, was die Mark bedeutet.
//
// WARUM ALS BILD UND NICHT ALS SATZ. Vorher stand ueber dem Blatt ein Satz ("Balken = wie viel,
// Farben = wofuer, Glyphe = wie oft"). Ein Satz kann eine Kodierung nur benennen, nicht zeigen:
// wer nicht weiss, wie eine Glyphe aussieht, findet sie im Blatt trotzdem nicht. Die Legende
// zeigt dieselbe Mark in derselben Farbe und Form, in der sie gleich im Blatt steht.
//
// DIE GRAUBEREICH-KACHEL ZEIGT DIE SYMBOLE, nicht den Rechenweg. Sie ist die einzige Spalte mit
// mehr als einer Markenart (Punkt fuers Land, Linie fuer die Welt, vier Glyphen am Belegstrich),
// und wer die nicht zuordnen kann, liest die Spalte nicht. Wie der Wert GERECHNET wird, steht
// in einem Satz darunter; das ist Nachschlagestoff, die Symbole sind Lesevoraussetzung.

const THETA = 0.25

const fmtDE = (n, d = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Eine Kachel: Miniatur der echten Mark oben, Bedeutung darunter. */
function Tile({ title, children, note }) {
  return (
    <div className="sheet-legend-tile">
      <p className="t-label" style={{ color: PAL.machine, margin: '0 0 var(--s-2)' }}>{title}</p>
      {children}
      <p className="mono" style={{ margin: 'var(--s-2) 0 0', color: PAL.muted, fontSize: '10px', lineHeight: 1.6 }}>{note}</p>
    </div>
  )
}

export default function SheetLegend({ world, maxN, minName, minN, docCount, threshold = THETA }) {
  return (
    <div className="sheet-legend" aria-label="Legende: was die vier Spalten des Registers zeigen">
      <Tile title="Volumen"
        note={`Länge = Gespräche. ${fmtDE(maxN, 0)} sind 100 px, ${minName} mit ${fmtDE(minN, 0)} wird 0,9 px breit. Linear, kein Mindestbalken.`}>
        <svg viewBox="0 0 200 30" width="100%" role="img" aria-hidden="true" style={{ display: 'block', height: 'auto' }}>
          <rect x="0" y="6" width="120" height="10" fill={rgba(PAL.human, 0.9)} />
          <rect x="0" y="6" width="1" height="10" fill={rgba(PAL.ink, 0.3)} />
          <rect x="0" y="22" width="3" height="6" fill={rgba(PAL.human, 0.9)} />
          <text x="130" y="15" className="mono" fontSize="9" fill={PAL.muted}>viel</text>
          <text x="9" y="28" className="mono" fontSize="9" fill={PAL.muted}>wenig</text>
        </svg>
      </Tile>

      <Tile title="Wofür"
        note="Farbanteile = Themen, immer in derselben Reihenfolge. Schraffiert ganz links: „Sonstiges“, also kein Thema erkannt.">
        <svg viewBox="0 0 200 30" width="100%" role="img" aria-hidden="true" style={{ display: 'block', height: 'auto' }}>
          <defs>
            <pattern id="legendHatch" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill={CAT_BUCKET[0].color} />
              <path d="M-1 5 L5 -1 M2 8 L8 2" stroke="rgba(11,10,12,0.85)" strokeWidth="1.4" />
            </pattern>
          </defs>
          {CAT_BUCKET.reduce((acc, b, i) => {
            const w = (b.pct / 100) * 200
            acc.nodes.push(
              <rect key={b.key} x={acc.off} y="6" width={w} height="12"
                fill={i === 0 ? 'url(#legendHatch)' : b.color} />,
            )
            acc.off += w
            return acc
          }, { off: 0, nodes: [] }).nodes}
        </svg>
      </Tile>

      {/* DIE SYMBOLE, die im Blatt wirklich stehen. Der erste Entwurf zeichnete hier den
          Rechenweg (fuenf Werte, groesster zaehlt, Schwelle 0,25). Das erklaerte, WIE die Zahl
          entsteht, aber nicht, was die Marken im Blatt bedeuten - und genau die muss man lesen
          koennen. Der Rechenweg steht jetzt in einem Satz darunter. */}
      <Tile title="Graubereich"
        note={`Wie oft ein Land grenzwertig wurde. Ein Gespräch zählt, wenn einer seiner fünf Moderationswerte über ${fmtDE(threshold, 2)} liegt. Bis ${MOD_FOCUS} % maßstabsgetreu, danach gestaucht.`}>
        {/* BESCHRIFTUNG UNTER DIE MARKE, NICHT DANEBEN. Danebengesetzt begannen die beiden Zeilen
            bei x = 128 und waren rund 90 Einheiten breit - also 18 bzw. 25 Einheiten ueber den
            Rand der viewBox hinaus, im Bild abgeschnitten ("Punkt = das La"). Untereinander
            passen sie in voller Laenge. */}
        <svg viewBox="0 0 200 96" width="100%" role="img"
          aria-label="Legende der Graubereich-Marken: Punkt gleich Wert des Landes, senkrechte Linie gleich Weltwert, und die vier Glyphen am Belegstrich."
          style={{ display: 'block', height: 'auto' }}>
          {/* Zeile 1: die Marke der Spalte selbst */}
          <line x1="0" y1="9" x2="120" y2="9" stroke={rgba(PAL.ink, 0.28)} strokeWidth="1" />
          <rect x="52" y="3" width="1.5" height="12" fill={PAL.human} />
          <circle cx="86" cy="9" r="3.4" fill={PAL.ink} />
          <text x="0" y="30" className="mono" fontSize="8.5" fill={PAL.muted}>Punkt = das Land</text>
          <text x="0" y="43" className="mono" fontSize="8.5" fill={PAL.human}>Linie = Welt, {fmtDE(world.modPct, 1)} %</text>

          {/* Zeile 2: die vier Glyphen am Belegstrich, in echter Form */}
          <text x="0" y="58" className="mono" fontSize="8.5" fill={PAL.muted}>Glyphe am Beleg:</text>
          {/* ZWEI REIHEN ZU ZWEI. Vier nebeneinander gaben je 50 px, und "Belästigung" ist
              darin 9 px zu breit - gemessen, das Label lief in die Nachbar-Glyphe. */}
          {[['▲', 'Gewalt'], ['■', 'sexuell'], ['●', 'Belästigung'], ['▬', 'kein Fall']].map((g, i) => (
            <g key={g[1]}>
              <text x={(i % 2) * 100} y={72 + Math.floor(i / 2) * 15} className="mono" fontSize="10" fill={PAL.ink}>{g[0]}</text>
              <text x={(i % 2) * 100 + 13} y={72 + Math.floor(i / 2) * 15} className="mono" fontSize="8" fill={PAL.muted}>{g[1]}</text>
            </g>
          ))}
        </svg>
      </Tile>

      <Tile title="Belege"
        note={`Ein Strich = ein Gespräch, Höhe = Zeichenzahl. ${fmtDE(docCount, 0)} davon kann man anklicken und lesen.`}>
        <svg viewBox="0 0 200 30" width="100%" role="img" aria-hidden="true" style={{ display: 'block', height: 'auto' }}>
          {[5, 12, 3, 9, 14, 6, 11, 4, 8].map((h, i) => (
            <rect key={i} x={i * 9} y={20 - h} width="4" height={h} fill={rgba(PAL.human, 0.85)} />
          ))}
          <text x="92" y="20" className="mono" fontSize="9" fill={PAL.muted}>kurz und lang</text>
        </svg>
      </Tile>
    </div>
  )
}
