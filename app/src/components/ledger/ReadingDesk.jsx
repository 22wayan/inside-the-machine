import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PAL } from '../../theme'
import { DOC_CAP, dimCounts, fmtDE, histLog, nearestCrossCountry, pctShorterThan, shortName } from '../../lib/ledger'
import { rgba } from './drawSheet'
import { MOD_LABEL } from './uiKit'

// E3 - DER LESETISCH: das zweite Bild des Akts.
//
// Er repariert den schwersten Interaktionsfehler des Altcodes vollstaendig. Dort mappte
// selExample einen Kreis per pool[i % pool.length] auf ein Beispiel: die Interaktion versprach
// Einzeldetail und lieferte Zufall, 589 von 590 samples waren unerreichbar. Jetzt ist jeder
// Strich in c7 genau ein Dokument, adressiert ueber die stabile ID aus buildDocIndex().
//
// DREI AUFLOESUNGSSTUFEN DESSELBEN DATUMS (Yi: abstract/elaborate): Strich (Hoehe) ->
// Textzeile (Breite + erste Woerter) -> Volldokument. Jede Stufe waechst aus der vorigen.
//
// KEIN FLIP ueber die Canvas-DOM-Grenze: hoechstes Jank-Risiko pro Stunde und es liefert einen
// Effekt, keinen Kanal. Der Ursprung wird stattdessen dadurch kommuniziert, dass der geklickte
// Strich im Blatt magenta markiert bleibt.
//
// INHALTS-GUARDRAIL: graySamples sind Gespraeche mit einem Moderations-Score ueber theta = 0,25.
// Sie sind bewusst unzensiert (das ist die methodische Pointe: theta ist gesetzt, nicht
// kalibriert), aber sie werden IMMER zuerst als solche angekuendigt - mit Score und Dimension -
// und ihr Text steht erst nach dem Aufdecken im DOM.

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
const SCORE_MAX_IN_SET = 0.58 // realer Maximalwert der graySamples; darueber ist das Set leer

const fontFor = (len) => (len < 200 ? 30 : len <= 600 ? 24 : 18)

export default function ReadingDesk({
  doc, docIndex, docsByCountry, countries, world, globalCats, lenQ, months, onClose, onNavigate, onFilterCat, reduce,
}) {
  const [revealed, setRevealed] = useState(false)
  const [visited, setVisited] = useState([])
  const boxRef = useRef(null)
  const isGray = doc?.kind === 'g'
  const c = doc ? countries[doc.ci] : null

  // Beim Wechsel des Belegs faellt die Enthuellung zurueck: ein Sprung darf nie ungefragt
  // einen Graubereich-Text aufdecken.
  useEffect(() => { setRevealed(false) }, [doc?.id])

  const sortedLens = useMemo(() => docIndex.docs.map((d) => d.len).sort((a, b) => a - b), [docIndex])
  const hist = useMemo(() => histLog(sortedLens, 30), [sortedLens])
  const dims = useMemo(() => dimCounts(docIndex.docs), [docIndex])
  const docNo = useMemo(() => docIndex.docs.findIndex((d) => d.id === doc?.id) + 1, [docIndex, doc])
  const sameCat = useMemo(() => (doc ? (docIndex.byCat.get(doc.cat) || []) : []), [docIndex, doc])

  const siblings = doc ? docsByCountry[doc.ci] : []
  const idxInCountry = siblings.findIndex((d) => d.id === doc?.id)

  const go = useCallback((next) => { if (next) onNavigate(next) }, [onNavigate])

  /**
   * QUERSCHNITT-SPRUNG: dieselbe Kategorie im naechstgelegenen ANDEREN Land, minimale Differenz
   * der Zeichenzahl. Dieselbe Kategorie in fuenf Laendern hintereinander lesen war im ganzen
   * Projekt bisher unmoeglich.
   * Pfeil hoch geht weiter in noch nicht besuchte Laender, Pfeil runter laesst besuchte wieder
   * zu - sonst liefe die Kette nach ein paar Spruengen tot und die Taste taete gar nichts.
   */
  const jumpCross = useCallback((allowVisited) => {
    if (!doc) return
    const next = nearestCrossCountry(doc, docIndex, allowVisited ? [] : visited)
    if (!next) return
    setVisited((v) => (v.includes(doc.ci) ? v : [...v, doc.ci]))
    onNavigate(next)
  }, [doc, docIndex, visited, onNavigate])

  // Scroll-Lock und Startfokus laufen NUR beim Oeffnen und Schliessen, nicht bei jedem
  // Blaettern. Haengte beides am selben Effekt wie der Tastatur-Handler, wuerde die zweite
  // Runde 'hidden' als "vorherigen" Wert sichern und die Seite beim Schliessen gesperrt lassen.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Fokus auf den Dialog selbst, nicht auf den ersten Knopf: so liest der Screenreader zuerst
    // die Signaturzeile (aria-labelledby) und nicht "zurueck-Knopf, deaktiviert".
    boxRef.current?.focus()
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  // Fokus-Falle und Tastaturkette. Abnahmebedingung, nicht Politur.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(siblings[idxInCountry + 1]); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(siblings[idxInCountry - 1]); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); jumpCross(false); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); jumpCross(true); return }
      if (e.key !== 'Tab') return
      const items = [...box.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      const at = document.activeElement
      // Der Dialogkasten selbst haelt den Startfokus und steht in keiner der beiden Richtungen
      // in der Liste - ohne diesen Zweig liefe der erste Shift+Tab aus der Falle heraus.
      if (!items.includes(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
      if (e.shiftKey && at === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, go, jumpCross, siblings, idxInCountry])

  if (!doc || !c) return null

  const pctBelow = pctShorterThan(sortedLens, doc.len)
  const showText = !isGray || revealed
  const restInCat = sameCat.length - 1

  return (
    <div
      className="ledger-desk-scrim"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ animation: `ledgerFade ${reduce ? 120 : 260}ms cubic-bezier(.22,1,.36,1)` }}
    >
      {/* reduce heisst reduce, NICHT none: der Tisch blendet in 120 ms auf, er springt nicht -
          und der Skalensprung 0,985 -> 1 faellt weg. Endzustand bleibt bitgleich. */}
      <div
        ref={boxRef}
        className="ledger-desk"
        role="dialog"
        aria-modal="true"
        aria-labelledby="desk-signature"
        tabIndex={-1}
        style={{
          animation: reduce ? 'ledgerFade 120ms linear' : 'ledgerRise 260ms cubic-bezier(.22,1,.36,1)',
        }}
      >
        {/* 1 - Signaturzeile: Herkunft, Position in der Grundgesamtheit, Zustand des Textes. */}
        <p id="desk-signature" className="mono ledger-desk-sig">
          WILDCHAT-1M / BELEG {fmtDE(docNo)} VON {fmtDE(docIndex.docs.length)} / {shortName(c.country).toUpperCase()} /
          {' '}{doc.cat.toUpperCase()} / {fmtDE(doc.len)} ZEICHEN / E-MAIL, TELEFON UND URL-PARAMETER MASKIERT
          {doc.redacted ? ' / IN DIESEM TEXT ERSETZT' : ''}
        </p>

        <div className="ledger-desk-grid" style={{ gridTemplateColumns: isGray ? '96px minmax(0, 1fr) 120px' : '96px minmax(0, 1fr)' }}>
          {/* 2 - Die Laengenleiter: beim Lesen sieht man, wo dieses Dokument in der Verteilung steht. */}
          <LengthLadder len={doc.len} lenQ={lenQ} />

          {/* 3 - Der Text als Held. Kein Kasten, kein Schatten, Originalschrift und Originalsprache. */}
          <div className="ledger-desk-main">
            {isGray && !revealed ? (
              <div className="ledger-warncard">
                <p className="t-label" style={{ color: PAL.machine, margin: 0 }}>Graubereich</p>
                <p className="mono" style={{ margin: '0.5rem 0 0', color: PAL.text, fontSize: '0.78rem', lineHeight: 1.6 }}>
                  Dieser Beleg liegt mit einem Moderations-Score von <b>{fmtDE(doc.score, 3)}</b> in der Dimension
                  {' '}<b>{MOD_LABEL[doc.dim] || doc.dim}</b> über der gesetzten Schwelle θ = 0,25.
                </p>
                <p className="mono" style={{ margin: '0.5rem 0 0', color: PAL.muted, fontSize: '0.7rem', lineHeight: 1.6, maxWidth: '62ch' }}>
                  θ ist gesetzt, nicht kalibriert, und der Score ist kein Sperrurteil über einen Text. Der Beleg wird
                  unverändert gezeigt, weil genau das die methodische Pointe ist: was eine Maschine als „Graubereich“
                  markiert, ist eine Schwellenwert-Entscheidung und keine Eigenschaft des Gesprächs. Der Text kann
                  Gewalt, sexuelle Inhalte oder Belästigung enthalten.
                </p>
                <button type="button" className="mono ledger-reveal" style={{ marginTop: '0.75rem' }} onClick={() => setRevealed(true)}>
                  Text aufdecken
                </button>
              </div>
            ) : (
              <p
                className="ledger-desk-text"
                lang="und"
                style={{ fontSize: fontFor(doc.len), maskImage: doc.capped ? 'linear-gradient(to bottom, #000 92%, transparent)' : undefined, WebkitMaskImage: doc.capped ? 'linear-gradient(to bottom, #000 92%, transparent)' : undefined }}
              >
                {doc.t}
              </p>
            )}
            {doc.capped && showText && (
              <p className="mono" style={{ color: PAL.muted, fontSize: '0.68rem', margin: '0.5rem 0 0' }}>
                Bei {fmtDE(DOC_CAP)} Zeichen gekappt (Pipeline), echte Länge unbekannt.
              </p>
            )}
          </div>

          {/* 4 - nur bei graySamples: Score-Thermometer und die echte Dimensionsverteilung. */}
          {isGray && <ScorePane score={doc.score} dim={doc.dim} dims={dims} total={docIndex.docs.filter((d) => d.kind === 'g').length} />}
        </div>

        {/* 5 - "Wo steht dieser Beleg": drei Panels, gleiche Achsenstaerke. */}
        <div className="ledger-desk-foot">
          <FootPanel title={`länger als ${fmtDE(pctBelow, 0)} % aller ${fmtDE(docIndex.docs.length)} Belege`}>
            <HistPanel hist={hist} len={doc.len} />
          </FootPanel>
          <FootPanel title={`Kategorie ${doc.cat} · Weltbalken, Landeswert als Hairline`}>
            <CatPanel globalCats={globalCats} country={c} cat={doc.cat} />
          </FootPanel>
          <FootPanel title={`Monatsverlauf ${shortName(c.country)} gegen Welt`}>
            <TrendPanel country={c} world={world} months={months} />
          </FootPanel>
        </div>

        {/* 6 - Navigation. Die Tastenkuerzel stehen im Bild, nicht in einer Hilfe. */}
        <div className="ledger-desk-nav">
          <span className="mono" style={{ color: PAL.muted, fontSize: '0.64rem' }}>
            Beleg {fmtDE(idxInCountry + 1)} von {fmtDE(siblings.length)} in {shortName(c.country)}
          </span>
          <button type="button" className="mono ledger-navbtn" disabled={idxInCountry <= 0} onClick={() => go(siblings[idxInCountry - 1])}>
            ← vorheriger
          </button>
          <button type="button" className="mono ledger-navbtn" disabled={idxInCountry >= siblings.length - 1} onClick={() => go(siblings[idxInCountry + 1])}>
            nächster →
          </button>
          <button type="button" className="mono ledger-navbtn" onClick={() => jumpCross(false)}>
            ↑ ähnlichster Beleg in einem anderen Land
          </button>
          <button
            type="button"
            className="mono ledger-navbtn"
            onClick={() => { onFilterCat(doc.cat); onClose() }}
          >
            {restInCat > 1 && `${fmtDE(restInCat)} weitere Belege in ${doc.cat} · Blatt danach ordnen`}
            {restInCat === 1 && `1 weiterer Beleg in ${doc.cat} · Blatt danach ordnen`}
            {restInCat === 0 && `${doc.cat} hat im ganzen Datensatz nur diesen einen lesbaren Beleg · Blatt trotzdem danach ordnen`}
          </button>
          <button type="button" className="mono ledger-navbtn ledger-navbtn--close" onClick={onClose}>Schließen (Esc)</button>
          <span className="mono" style={{ color: PAL.muted, fontSize: '0.62rem' }}>
            ←/→ blättert im Land · ↑ springt in ein anderes Land derselben Kategorie · Esc schließt
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Die Laengenleiter: vertikale Achse, Hoehe proportional zur Textlaenge, Ticks aus
 * lengthQuantiles() ueber alle 848. Ein Datum, kein Ornament - beim Blaettern faehrt der
 * Magenta-Marker sichtbar auf einen neuen Wert.
 */
// Kleinster Abstand zwischen Quantils-Zahl und Marker-Zahl, in Einheiten der viewBox. Die Zahlen
// sind 8 bzw. 9 gross; darunter beruehren sich die Zeilen. Gemessen: bei 10 blieb noch ein
// Beruehrungsfall unter 60 Belegen, bei 12 keiner mehr.
export const LABEL_MIN_ABSTAND = 12

/**
 * Um wie viel die Marker-Zahl vom naechsten Quantil wegruecken muss, damit sich die beiden
 * Zeilen nicht beruehren. Verschoben wird vom Quantil weg; liegt der Marker darueber, geht es
 * nach oben, sonst nach unten. Null, wenn ohnehin genug Platz ist.
 */
export function markerVersatz(yMarker, yQuantile, hoehe = 260) {
  const frei = (v) => yQuantile.every((q) => Math.abs(yMarker + v - q) >= LABEL_MIN_ABSTAND)
  const drin = (v) => yMarker + v >= 0 && yMarker + v <= hoehe
  if (frei(0)) return 0
  let naechstes = yQuantile[0]
  for (const q of yQuantile) if (Math.abs(q - yMarker) < Math.abs(naechstes - yMarker)) naechstes = q
  const raus = LABEL_MIN_ABSTAND - Math.abs(naechstes - yMarker)
  // Erst vom Quantil weg. Fuehrt das aus dem Bild - bei 2.000 Zeichen liegt der Marker ueber p90
  // (1.995) und ganz oben an der Kante, die Zahl wurde abgeschnitten - dann in die andere
  // Richtung. Sie ist dort frei, weil zwischen zwei Quantilen immer mehr Platz ist als 2x12.
  const weg = yMarker <= naechstes ? -raus : raus
  if (drin(weg) && frei(weg)) return weg
  const zurueck = -Math.sign(weg) * (LABEL_MIN_ABSTAND + Math.abs(naechstes - yMarker))
  if (drin(zurueck) && frei(zurueck)) return zurueck
  return drin(weg) ? weg : 0
}

function LengthLadder({ len, lenQ }) {
  const H = 260
  const y = (v) => H - (Math.sqrt(Math.max(0, v)) / Math.sqrt(lenQ.max)) * H
  const ticks = [['p25', lenQ.p25], ['p50', lenQ.p50], ['p75', lenQ.p75], ['p90', lenQ.p90]]
  return (
    <div className="ledger-desk-ladder">
      <svg viewBox={`0 0 96 ${H + 16}`} width="100%" role="img" style={{ display: 'block', height: 'auto' }}
        aria-label={`Längenleiter: dieser Beleg hat ${fmtDE(len)} Zeichen. Quantile über alle Belege: p25 ${fmtDE(lenQ.p25, 0)}, Median ${fmtDE(lenQ.p50, 0)}, p75 ${fmtDE(lenQ.p75, 0)}, p90 ${fmtDE(lenQ.p90, 0)} Zeichen.`}>
        <rect x="10" y="8" width="2" height={H} fill={rgba(PAL.human, 0.75)} />
        {ticks.map(([label, v]) => (
          <g key={label}>
            <rect x="6" y={8 + y(v)} width="10" height="1" fill={rgba(PAL.ink, 0.5)} />
            <text x="20" y={11 + y(v)} fontFamily="'IBM Plex Mono', monospace" fontSize="8" fill={PAL.muted}>{label} {fmtDE(v, 0)}</text>
          </g>
        ))}
        {/* DIE MARKER-ZAHL WEICHT AUS, DIE QUANTILE BLEIBEN. Beide Beschriftungen beginnen bei
            x = 20 - liegt der Beleg nahe an einem Quantil (442 Zeichen gegen den Median 430,
            1,5 px auseinander), sind die Zahlen ineinander gedruckt. Erst hatte ich stattdessen
            die Quantilszahl unterdrueckt; gemessen ueber 60 Belege verschwand sie in 48 Faellen,
            die Leiter verlor also meistens ihren Massstab. Jetzt rueckt die Marker-Zahl beiseite,
            weg vom naechsten Quantil. Der magenta Strich bleibt auf dem exakten Wert stehen -
            verschoben wird die Schrift, nicht das Datum. */}
        <rect x="2" y={8 + y(len) - 1} width="18" height="2" fill={PAL.machine} />
        <text x="22" y={11 + y(len) + markerVersatz(y(len), ticks.map(([, v]) => y(v)), H)}
          fontFamily="'IBM Plex Mono', monospace" fontSize="9" fontWeight="700" fill={PAL.machine}>{fmtDE(len)} Z.</text>
      </svg>
    </div>
  )
}

/** Score-Thermometer 0..1 mit beschrifteter θ-Marke und der echten Dimensionsverteilung. */
function ScorePane({ score, dim, dims, total }) {
  const H = 200
  const y = (v) => 8 + (1 - v) * H
  const maxDim = Math.max(1, ...dims.map(([, n]) => n))
  return (
    <div className="ledger-desk-score">
      <svg viewBox={`0 0 120 ${H + 24}`} width="100%" role="img" style={{ display: 'block', height: 'auto' }}
        aria-label={`Moderations-Score ${fmtDE(score, 3)} in der Dimension ${MOD_LABEL[dim] || dim}. Schwelle θ gleich 0,25. Der höchste Score im Datensatz ist 0,58.`}>
        <defs>
          <pattern id="deskHatch" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M-1 5 L5 -1 M2 8 L8 2" stroke={rgba(PAL.ink, 0.28)} strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="10" y={y(1)} width="14" height={H} fill={rgba(PAL.hairline, 0.1)} />
        {/* die Zone oberhalb des realen Maximums ist im Datensatz leer - schraffiert, nicht leer gelassen */}
        <rect x="10" y={y(1)} width="14" height={y(SCORE_MAX_IN_SET) - y(1)} fill="url(#deskHatch)" />
        <text x="28" y={y(1) + 8} fontFamily="'IBM Plex Mono', monospace" fontSize="7.5" fill={PAL.muted}>1,0</text>
        {/* DIE ERKLAERUNG STEHT IN DER LEERZONE, NICHT AN IHRER KANTE. Vorher hing sie an der
            0,58-Marke - und der hoechste Score im Set IST 0,58, also lag die Marker-Zahl "0,580"
            bei genau diesen Belegen auf "0,58 Maximum" und "darüber im Set". Die drei Zeilen
            beschreiben ohnehin die schraffierte Zone; dort haben sie Platz (42 % der Hoehe) und
            koennen mit keinem Score mehr kollidieren, weil dort per Definition keiner liegt. */}
        <text x="28" y={y(1) + 24} fontFamily="'IBM Plex Mono', monospace" fontSize="7.5" fill={PAL.muted}>0,58 Maximum</text>
        <text x="28" y={y(1) + 35} fontFamily="'IBM Plex Mono', monospace" fontSize="7" fill={PAL.muted}>darüber im Set</text>
        <text x="28" y={y(1) + 46} fontFamily="'IBM Plex Mono', monospace" fontSize="7" fill={PAL.muted}>nicht enthalten</text>
        <line x1="10" y1={y(SCORE_MAX_IN_SET)} x2="24" y2={y(SCORE_MAX_IN_SET)} stroke={rgba(PAL.ink, 0.4)} strokeWidth="1" />
        <rect x="6" y={y(0.25)} width="22" height="1" fill={rgba(PAL.human, 0.9)} />
        <text x="30" y={y(0.25) + 3} fontFamily="'IBM Plex Mono', monospace" fontSize="8" fill={PAL.human}>θ = 0,25</text>
        <rect x="4" y={y(score) - 1.5} width="26" height="3" fill={PAL.machine} />
        {/* Auch hier weicht die Zahl aus, nicht die Referenz: liegt ein Score dicht an theta
            (gemessen: 0,291 und 0,296 gegen 0,25), lagen beide Beschriftungen ineinander. Der
            magenta Strich bleibt auf dem exakten Score. */}
        <text x="34" y={y(score) + 3 + markerVersatz(y(score), [y(0.25)], H + 8)}
          fontFamily="'IBM Plex Mono', monospace" fontSize="9" fontWeight="700" fill={PAL.machine}>{fmtDE(score, 3)}</text>
        <text x="10" y={H + 20} fontFamily="'IBM Plex Mono', monospace" fontSize="7.5" fill={PAL.muted}>0,0</text>
      </svg>

      <p className="mono" style={{ margin: '0.5rem 0 0.3rem', color: PAL.muted, fontSize: '0.6rem' }}>
        Dimensionen der {fmtDE(total)} Graubereich-Belege
      </p>
      {dims.map(([key, n]) => (
        <div key={key} style={{ marginBottom: '0.22rem' }}>
          <div className="mono" style={{ fontSize: '0.6rem', color: key === dim ? PAL.machine : PAL.muted }}>{MOD_LABEL[key] || key} {fmtDE(n)}</div>
          <div style={{ height: 5, background: rgba(PAL.hairline, 0.08) }}>
            <div style={{ width: `${(n / maxDim) * 100}%`, height: '100%', background: key === dim ? PAL.machine : rgba(PAL.ink, 0.5) }} />
          </div>
        </div>
      ))}
      <p className="mono" style={{ margin: '0.4rem 0 0', color: PAL.muted, fontSize: '9px', lineHeight: 1.5 }}>
        hate steht nicht in dieser Liste: bei θ = 0,25 ist die Dimension im ganzen Public Set exakt leer. Das ist eine
        Nachweisgrenze, kein Befund.
      </p>
    </div>
  )
}

function FootPanel({ title, children }) {
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      {children}
      <figcaption className="mono" style={{ color: PAL.muted, fontSize: '0.62rem', marginTop: '0.25rem', lineHeight: 1.4 }}>{title}</figcaption>
    </figure>
  )
}

/** (a) Laengenhistogramm aller 848 auf log-x, 30 Bins, dieser Beleg als Magenta-Tick. */
function HistPanel({ hist, len }) {
  const VW = 300
  const VH = 64
  const max = Math.max(1, ...hist.map((b) => b.n))
  const lo = Math.log10(hist[0]?.x0 || 25)
  const span = (Math.log10(hist[hist.length - 1]?.x1 || 2000) - lo) || 1
  const x = (v) => ((Math.log10(Math.max(1, v)) - lo) / span) * VW
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" style={{ display: 'block', height: 'auto' }} aria-hidden="true">
      {hist.map((b, i) => {
        const h = (b.n / max) * (VH - 10)
        return <rect key={i} x={x(b.x0)} y={VH - 6 - h} width={Math.max(1, x(b.x1) - x(b.x0) - 1)} height={h} fill={rgba(PAL.ink, 0.45)} />
      })}
      <rect x="0" y={VH - 6} width={VW} height="1" fill={rgba(PAL.ink, 0.3)} />
      <rect x={Math.min(VW - 1.5, x(len))} y="0" width="1.5" height={VH - 4} fill={PAL.machine} />
    </svg>
  )
}

/** (b) globalCats als 9 Balken, eigene Kategorie Magenta, Landeswert als Hairline-Marker. */
function CatPanel({ globalCats, country, cat }) {
  const VW = 300
  const VH = 64
  const step = VW / globalCats.length
  const max = Math.max(...globalCats.map((g) => g.pct))
  const ownOf = (key) => ((country.cats || []).find((x) => x.cat === key)?.pct ?? 0)
  const ownMax = Math.max(max, ...globalCats.map((g) => ownOf(g.cat)))
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" style={{ display: 'block', height: 'auto' }} aria-hidden="true">
      {globalCats.map((g, i) => {
        const h = (g.pct / ownMax) * (VH - 10)
        const oh = (ownOf(g.cat) / ownMax) * (VH - 10)
        const isOwn = g.cat === cat
        return (
          <g key={g.cat}>
            <rect x={i * step} y={VH - 6 - h} width={step - 2} height={h} fill={isOwn ? PAL.machine : rgba(PAL.ink, 0.35)} />
            {/* der Landeswert liegt als 1 px Hairline IM Weltbalken: eine Mark, zwei Werte */}
            <rect x={i * step} y={VH - 6 - oh} width={step - 2} height="1.4" fill={rgba(PAL.human, 0.95)} />
          </g>
        )
      })}
      <rect x="0" y={VH - 6} width={VW} height="1" fill={rgba(PAL.ink, 0.3)} />
    </svg>
  )
}

/** (c) trend[13] des Landes als Sparkbar plus Weltreferenz auf derselben Anteilsskala. */
function TrendPanel({ country, world, months }) {
  const VW = 300
  const VH = 64
  const step = VW / months.length
  const total = (country.trend || []).reduce((s, v) => s + v, 0) || 1
  const own = (country.trend || []).map((v) => (v / total) * 100)
  const max = Math.max(35, ...own)
  const y = (v) => VH - 6 - (v / max) * (VH - 10)
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" style={{ display: 'block', height: 'auto' }} aria-hidden="true">
      {own.map((v, i) => <rect key={i} x={i * step} y={y(v)} width={step - 2} height={VH - 6 - y(v)} fill={rgba(PAL.ink, 0.45)} />)}
      <polyline fill="none" stroke={rgba(PAL.human, 0.85)} strokeWidth="1.2" points={world.shares.map((s, i) => `${i * step + step / 2},${y(s)}`).join(' ')} />
      <rect x="0" y={VH - 6} width={VW} height="1" fill={rgba(PAL.ink, 0.3)} />
    </svg>
  )
}
