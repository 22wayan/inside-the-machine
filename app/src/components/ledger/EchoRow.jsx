import { CAT_BUCKET, PAL } from '../../theme'
import { rgba } from './drawSheet'
import { COLS as COLS_FULL, ECHO, MOD_FOCUS, W, slotX, splitAtBreak } from './geometry'

// Zeilen-Echo: die gewaehlte Zeile 1:1 wiederholt, direkt darunter die Weltzeile.
//
// WARUM SVG UND NICHT CANVAS: in #wildchat darf es GENAU EIN Canvas geben (scripts/e2e.mjs
// prueft count === 1). Das Echo ist deshalb SVG - was hier sogar der bessere Traeger ist:
// scharfer Text bei jeder Skalierung und jede Mark ist ein echtes DOM-Element.
//
// WARUM UEBERHAUPT EIN ECHO: das Dossier steht unter einem 1.272 px hohen Blatt. Wer Zeile 41
// waehlt, hat die Originalzeile beim Lesen des Details nicht mehr im Bild. Das Echo nimmt
// dieselben x-Konstanten und dieselben Skalen mit nach unten (geometry.js ist die einzige
// Quelle) - der Blick springt nicht, und die Abweichung bleibt als Kantenversatz lesbar.

const MONO = "'IBM Plex Mono', ui-monospace, monospace"

function Glyph({ form, x, cy, fill }) {
  if (form === 'triangle') return <polygon points={`${x},${cy - 3.6} ${x - 3.4},${cy + 2.6} ${x + 3.4},${cy + 2.6}`} fill={fill} />
  if (form === 'square') return <rect x={x - 2.7} y={cy - 2.7} width="5.4" height="5.4" fill={fill} />
  if (form === 'circle') return <circle cx={x} cy={cy} r="3" fill={fill} />
  return <rect x={x - 3.6} y={cy - 0.75} width="7.2" height="1.5" fill={fill} />
}

const FORM = { violence: 'triangle', sexual: 'square', harassment: 'circle' }

/** Eine Echo-Zeile. isWorld schaltet auf die Referenzdarstellung (Kontur statt Flaeche in c2). */
function Row({
  top, label, labelColor, n, nText, seg, modPct, docs, scales, world, isWorld, cols: COLS, fmt,
}) {
  const { barY, barH, axisY, baseY } = ECHO
  let off = 0
  const wx = scales.mod(world.modPct)
  const mx = scales.mod(modPct)
  return (
    <g transform={`translate(0 ${top})`}>
      <text x={COLS.c1.x0} y={16} fontFamily={MONO} fontSize="10" fontWeight="700" fill={labelColor}>{label}</text>

      {/* c2 Volumen. Die Weltsumme liegt NICHT auf der Laenderskala: Kontur statt Flaeche,
          sonst waere ein gefuellter 100-px-Balken neben dem der USA ein Lie Factor. */}
      {isWorld
        ? <rect x={COLS.c2.x0 + 0.5} y={barY + 0.5} width={COLS.c2.barW - 1} height={barH - 1} fill="none" stroke={rgba(PAL.human, 0.8)} strokeWidth="1" />
        : <rect x={COLS.c2.x0} y={barY} width={Math.max(0, scales.vol(n) - COLS.c2.x0)} height={barH} fill={rgba(PAL.human, 0.9)} />}
      <rect x={COLS.c2.x0} y={barY} width="1" height={barH} fill={rgba(PAL.ink, 0.3)} />
      <text x={COLS.c2.numX} y={16} textAnchor="end" fontFamily={MONO} fontSize="9.5" fill={isWorld ? rgba(PAL.human, 0.9) : rgba(PAL.ink, 0.72)}>{nText}</text>

      {/* c3 Wofuer: 7 Segmente in fixer Reihenfolge, "Sonstiges" links am gemeinsamen Nullpunkt
          und schraffiert - Unsicherheit gehoert in die Tinte, nicht in die Fussnote (Cairo). */}
      {seg.map((v, b) => {
        const x = COLS.c3.x0 + (off / 100) * COLS.c3.w
        const wpx = (v / 100) * COLS.c3.w
        off += v
        if (wpx <= 0.02) return null
        return <rect key={CAT_BUCKET[b].key} x={x} y={barY} width={wpx} height={barH} fill={b === 0 ? 'url(#echoHatch)' : CAT_BUCKET[b].color} />
      })}

      {/* c4 Graubereich: Position auf der gebrochenen Fokusskala, Abweichung redundant als
          Laenge (im linearen Fokus echte Prozentpunkte, am Bruch aufgeteilt statt darueber
          hinweg), modTop (nominal, 4 Auspraegungen) als FORM - CVD-sicher und ohne Farbbudget. */}
      {splitAtBreak(mx, wx, scales.mod).map(([sx, ex]) => (
        <rect key={`d${sx}`} x={sx} y={axisY - 1} width={ex - sx} height="2" fill={rgba(PAL.ink, modPct >= world.modPct ? 0.85 : 0.38)} />
      ))}
      <Glyph form={isWorld ? 'dash' : (FORM[docs?.modTop] || 'dash')} x={mx} cy={axisY} fill={isWorld ? PAL.human : rgba(PAL.ink, 0.88)} />
      {modPct > MOD_FOCUS && (
        <text x={mx - 6} y={axisY - 4} textAnchor="end" fontFamily={MONO} fontSize="8" fill={rgba(PAL.ink, 0.8)}>{fmt(modPct, 1)} %</text>
      )}

      {/* c7 Belege: das Slot-Raster bleibt sichtbar leer, wo kein Beleg liegt. */}
      {!isWorld && (
        <g>
          {Array.from({ length: COLS.c7.nSample }, (_, j) => (
            <rect key={`rs${j}`} x={slotX('s', j)} y={baseY} width={COLS.c7.slotW - 1.2} height="1" fill={rgba(PAL.ink, 0.1)} />
          ))}
          {Array.from({ length: COLS.c7.nGray }, (_, j) => (
            <rect key={`rg${j}`} x={slotX('g', j)} y={baseY} width={COLS.c7.slotW - 1.2} height="1" fill={rgba(PAL.ink, 0.1)} />
          ))}
          {(docs?.list || []).map((d) => {
            const h = scales.docH(d.len)
            return <rect key={d.id} x={slotX(d.kind, d.i) + 2.85} y={baseY - h} width="3" height={h} fill={rgba(PAL.human, d.kind === 's' ? 0.95 : 0.5)} />
          })}
        </g>
      )}
    </g>
  )
}

/**
 * Beide Zeilen zusammen, 1320 x 58. Die Weltzeile steht darunter, damit jede Abweichung als
 * Kantenversatz gegen eine Referenz gelesen wird und nicht als Farbnuance (Ware).
 */
export default function EchoRow({
  country, seg, worldSeg, world, docs, scales, label, cols = COLS_FULL,
}) {
  const COLS = cols
  return (
    // aria-hidden: das Echo wiederholt exakt die Werte, die schon in der einen sr-only-Tabelle
    // stehen. Es zweimal vorlesen zu lassen waere Laerm, kein Zugang.
    <svg viewBox={`0 0 ${W} ${ECHO.h}`} width="100%" aria-hidden="true"
      style={{ display: 'block', minWidth: 980, height: 'auto' }}>
      <defs>
        <pattern id="echoHatch" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={CAT_BUCKET[0].color} />
          <path d="M-1 5 L5 -1 M2 8 L8 2" stroke="rgba(11,10,12,0.85)" strokeWidth="1.4" />
        </pattern>
      </defs>

      {/* der Achsenbruch der Graubereich-Spalte, als leere Luecke wie im Blatt */}
      <rect x={scales.mod.breakLo} y="0" width={scales.mod.breakHi - scales.mod.breakLo} height={ECHO.h} fill={rgba(PAL.ink, 0.045)} />
      {/* die durchgehende Weltlinie bei 3,8 % laeuft auch hier durch beide Zeilen */}
      <rect x={scales.mod(world.modPct) - 0.5} y="0" width="1" height={ECHO.h} fill={rgba(PAL.human, 0.85)} />
      <rect x="0" y="0" width={COLS.rail.x1} height={ECHO.rowH} fill={PAL.machine} />

      <Row
        top={0}
        label={label}
        labelColor={PAL.machine}
        n={country.n}
        nText={docs.fmt(country.n)}
        seg={seg}
        modPct={country.modPct ?? 0}
        docs={{ list: docs.list, modTop: country.modTop }}
        scales={scales}
        world={world}
        cols={COLS}
        fmt={docs.fmt}
      />
      <Row
        top={ECHO.rowH}
        label="WELT"
        labelColor={PAL.human}
        n={world.n}
        nText={`Σ ${docs.fmt(world.n)}`}
        seg={worldSeg}
        modPct={world.modPct}
        docs={null}
        scales={scales}
        world={world}
        cols={COLS}
        fmt={docs.fmt}
        isWorld
      />
    </svg>
  )
}
