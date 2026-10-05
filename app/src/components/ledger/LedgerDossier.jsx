import { useMemo, useState } from 'react'
import { CAT_COLOR, PAL } from '../../theme'
import { catDeltas, fmtDE, fmtSignedPP, shortName, tvd, wilson95 } from '../../lib/ledger'
import { rgba } from './drawSheet'
import { docBlockScale } from './geometry'
import EchoRow from './EchoRow'
import Staircase from './Staircase'
import { MOD_LABEL, bar, deltaRow, sectionTitle } from './uiKit'

// E2 - DAS DOSSIER: ein Slot FESTER HOEHE unter dem Blatt. Kein Modal, kein Akkordeon.
//
// DIE WICHTIGSTE ENGINEERING-ENTSCHEIDUNG DES AKTS: das Band ist immer im DOM und immer gleich
// hoch. Eine Hoehenmutation wuerde document.documentElement.scrollHeight mitten im Scroll aendern
// und damit (a) den Scroll-Anker springen lassen, (b) ScrollProgress (Motion.jsx:12-28) fuer ALLE
// fuenf Akte neu messen lassen - saemtliche Ticks der Fortschrittsleiste wanderten sichtbar - und
// (c) die 53 absolut positionierten A11y-Buttons mitten in einer Transition verschieben. CLS = 0.
//
// Inhaltlich traegt das Dossier genau die Dimensionen, die im Blatt keinen Platz haben:
// den Monatsverlauf in voller Aufloesung, die Gespraechstiefe auf einer Achse, die ihre
// Spreizung auch zeigt, Sprache und Modelle, das Wilson-Intervall (das aus dem Blatt bewusst
// herausgeflogen ist, weil es dort keinen Platz fuer seinen Vorbehalt hat) und die Belege als
// lesbare Bloecke.
//
// TIEFE UND VERLAUF SIND SEIT DEM SPALTEN-UMBAU NUR NOCH HIER (und in der sr-only-Tabelle).
// Im Blatt waren sie zwei Kanaele, die ihren Task nicht erfuellten: avgTurns spannte 1,5 bis 3,8
// Runden auf 80 px, die 13 Monatsbalken 0,073 bis 0,42 TVD auf 179 x 14 px. Hier bekommt die
// Tiefe 232 px fuer dieselbe Spanne und der Verlauf 360 x 150 px mit bezifferter y-Achse.

// GEMESSENER Maximalbedarf ueber alle 53 Laender, je Spaltenzahl des auto-fit-Grids. Eine
// einzige Zahl kann das nicht leisten: bei 1280 px stehen vier Spalten (Inhalt 986 px), bei
// 1200 px nur noch drei (1246 px), unter 768 px eine (1779 px). Ein zu kleiner Wert brachte
// das innere Scrollen zurueck, ein zu grosser toter Raum. CLS bleibt 0, weil die Hoehe je
// Viewport fest ist und sich nur beim Resize aendert - dann rechnet der Browser ohnehin neu.
const DOSSIER_H = 1060 // >= 1280 px, vier Spalten
const DOSSIER_H_3 = 1320 // 768 bis 1279 px, drei oder zwei Spalten
const DOSSIER_H_1 = 1860 // < 768 px, eine Spalte
// LEER braucht das Band nur seinen Einladungstext. Die feste Hoehe oben ist gegen CLS BEIM
// WECHSEL zwischen 53 Laendern gedacht - dort tritt das Problem auf. Vor der ersten Auswahl
// dieselbe Hoehe freizuhalten war kein Schutz, sondern rund 850 px leerer Kasten. Die Hoehe
// aendert sich deshalb genau EINMAL, auf einen Klick hin, und danach nie wieder.
const DOSSIER_H_EMPTY = 200
const BLOCK = docBlockScale()

export default function LedgerDossier({
  dossierRef, countries, selCi, world, buckets, docsByCountry, lenQ, threads, globalCats,
  months, monthCounts, maxMonth, selDocId, onOpenDoc, scales, cols, trendMode, onTrendMode, reduce,
}) {
  const [tab, setTab] = useState('trend')
  const c = selCi != null ? countries[selCi] : null

  const deltas = useMemo(() => (c ? catDeltas(c, globalCats) : []), [c, globalCats])
  const docs = selCi != null ? docsByCountry[selCi] : []
  const maxAbs = deltas.length ? Math.max(4, ...deltas.map((d) => Math.abs(d.delta))) : 1

  return (
    <div
      ref={dossierRef}
      className={`ledger-dossier${c ? '' : ' ledger-dossier--empty'}`}
      style={{
        '--dossier-h': `${DOSSIER_H}px`,
        '--dossier-h-3': `${DOSSIER_H_3}px`,
        '--dossier-h-1': `${DOSSIER_H_1}px`,
        '--dossier-h-empty': `${DOSSIER_H_EMPTY}px`,
      }}
      role="region"
      aria-label={c ? `Detail ${shortName(c.country)}` : 'Detailband, kein Land gewählt'}
    >
      {/* BEWUSST KEINE aria-live-Region: dieses Band ist gross und aendert sich vollstaendig.
          Eine Live-Region wuerde bei jedem Klick das ganze Dossier vorlesen. Die Ansage macht
          die eine role="status"-Zeile der Bedienleiste, kurz und in einem Satz. */}
      {!c ? (
        <div className="ledger-dossier-empty">
          <p className="t-label" style={{ color: PAL.muted, margin: 0 }}>Ein Land im Detail</p>
          <p className="mono" style={{ margin: '0.5rem 0 0', color: PAL.muted, fontSize: '0.7rem', lineHeight: 1.6, maxWidth: '62ch' }}>
            Hier steht alles, was in eine Zeile nicht passt. Eine Zeile im Blatt anklicken (oder mit Tab und Enter wählen):
            Themen gegen den Weltmix, Sprachen, Modelle, Monatsverlauf und alle Belege als lesbare Blöcke.
          </p>
        </div>
      ) : (
        // 140 ms Opacity-Crossfade des INHALTS. Keine Hoehenanimation, nie.
        <div className="ledger-dossier-body" style={{ animation: `ledgerFade ${reduce ? 60 : 140}ms ease-out` }} key={c.country}>
          {/* (a) Zeilen-Echo: der Kontext reist mit dem Detail mit. */}
          <div className="ledger-echo">
            <EchoRow
              country={c}
              seg={buckets[selCi]}
              worldSeg={world.buckets}
              world={world}
              scales={scales}
              label={shortName(c.country).toUpperCase()}
              docs={{ list: docs, fmt: fmtDE }}
              cols={cols}
            />
          </div>

          <div className="ledger-dossier-grid">
            <Identity c={c} selCi={selCi} world={world} threads={threads} docs={docs} />
            <ThemeDeltas deltas={deltas} maxAbs={maxAbs} />
            <Profile c={c} />
            <TimePane
              c={c} tab={tab} setTab={setTab} world={world} months={months} monthCounts={monthCounts}
              maxMonth={maxMonth} trendMode={trendMode} onTrendMode={onTrendMode} reduce={reduce}
            />
            <DocStack c={c} docs={docs} lenQ={lenQ} selDocId={selDocId} onOpenDoc={onOpenDoc} />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * (b) Das Land: Name, Volumen, Graubereich mit Intervall, Tiefe.
 *
 * Hier stehen genau die Werte, fuer die im Blatt kein tragfaehiger Kanal mehr existiert (Tiefe)
 * bzw. deren Vorbehalt dort keinen Platz hat (Graubereich mit Wilson-Intervall). Die neun
 * Themen-Deltas sind seit dem Vier-Spalten-Umbau eine eigene Spalte (ThemeDeltas), weil sie
 * diese hier sonst dreimal so hoch machten wie die anderen drei.
 */
function Identity({ c, selCi, world, threads, docs }) {
  const w = wilson95(c.modPct ?? 0, c.n)
  return (
    <section>
      {sectionTitle('Das Land', `Rang ${c.rank} von 53 nach Volumen`)}
      <p className="t-display-s" style={{ margin: '0 0 0.15rem', color: PAL.text }}>{shortName(c.country)}</p>
      {/* EINE KENNZAHL JE ZEILE. Als Fliesstext mit Trennpunkten brachen die Werte mitten
          durch ("2,10 % des / Datensatzes"), und die Umbruchstelle wanderte mit der Spaltenbreite.
          Als Liste steht jeder Wert geschlossen und die Zeilen sind links buendig. */}
      <ul className="ledger-facts">
        <li>{fmtDE(c.n)} Gespräche</li>
        <li>{fmtDE((100 * c.n) / world.total, 2)} % des Datensatzes</li>
        <li>{fmtDE(threads[selCi])} {threads[selCi] === 1 ? 'Strich' : 'Striche'} im Kamm</li>
        <li>{docs.length} Belege</li>
      </ul>

      <p className="mono" style={{ margin: '0 0 0.15rem', color: PAL.text, fontSize: '0.68rem', lineHeight: 1.5 }}>
        <span style={{ whiteSpace: 'nowrap' }}>Graubereich {fmtDE(c.modPct ?? 0, 1)} %</span>
        {' '}<span style={{ color: PAL.muted, whiteSpace: 'nowrap' }}>(95-%-Intervall {fmtDE(w.lo, 1)} bis {fmtDE(w.hi, 1)})</span>
      </p>
      {/* Der Vorbehalt in einer Zeile. Die Begruendung, warum diese Statistik nur hier und nicht
          im Blatt steht, liegt in der eingeklappten Graubereich-Notiz unter dem Blatt. */}
      <p className="mono" style={{ margin: '0 0 0.3rem', color: PAL.muted, fontSize: '9.5px', lineHeight: 1.55 }}>
        Rechnet auf Gesprächen, nicht auf Personen: die echten Intervalle sind breiter.
      </p>

      <TurnMark value={c.avgTurns ?? 0} world={world.avgTurns} />

    </section>
  )
}

/**
 * THEMEN als eigene Spalte, nicht als Anhang von "Das Land". Die neun Delta-Zeilen waren der
 * Grund, warum die erste Spalte dreimal so hoch wurde wie die anderen und das Band innen
 * scrollen musste. Als eigene Spalte im auto-fit-Grid tragen alle vier Spalten aehnlich viel.
 */
function ThemeDeltas({ deltas, maxAbs }) {
  return (
    <section>
      {sectionTitle('Themen', `${deltas.length} Kategorien gegen den Weltmix`)}
      {/* Nulllinie zentriert, nach |Delta| sortiert: die groesste Abweichung steht oben. */}
      {deltas.map((d) => deltaRow(d.cat, d.delta, maxAbs, CAT_COLOR[d.cat] || PAL.human, fmtSignedPP))}
    </section>
  )
}

/**
 * (b2) TIEFE, hier statt im Blatt. Wie lang ein Gespraech laeuft, bevor es endet.
 *
 * Derselbe Kanal wie vorher (Position auf gemeinsamer Skala, Cleveland-Dotplot), nur an der
 * Stelle, an der er seinen Task erfuellt: 232 px fuer die Spanne 1,4 bis 4,0 Runden sind
 * 89 px je Runde. In der 80 px breiten Blattspalte waren es 31 px je Runde - bei einer realen
 * Spreizung von 1,5 bis 3,8 und einer mittleren Haelfte von 2,2 bis 2,8 lagen dort 27 der 53
 * Punkte auf 19 px. Der Weltwert ist volumengewichtet (ein Wert je Gespraech, nicht je Land).
 */
function TurnMark({ value, world }) {
  const VW = 240
  const LO = 1.4
  const HI = 4.0
  const x = (v) => 4 + ((Math.min(HI, Math.max(LO, v)) - LO) / (HI - LO)) * (VW - 8)
  return (
    <div style={{ marginTop: '0.55rem' }}>
      <p className="mono" style={{ margin: 0, color: PAL.text, fontSize: '0.68rem', lineHeight: 1.5 }}>
        <span style={{ whiteSpace: 'nowrap' }}>Tiefe {fmtDE(value, 1)} Runden je Gespräch</span> <span style={{ color: PAL.muted }}>(Welt {fmtDE(world, 1)})</span>
      </p>
      <svg viewBox={`0 0 ${VW} 22`} width="100%" style={{ display: 'block', maxWidth: VW, height: 'auto' }}
        role="img" aria-label={`Gesprächstiefe ${fmtDE(value, 1)} Runden, Welt ${fmtDE(world, 1)}, Skala 1,4 bis 4,0.`}>
        <rect x="4" y="10" width={VW - 8} height="1" fill={rgba(PAL.ink, 0.18)} />
        {[1.5, 2, 2.5, 3, 3.5, 4].map((t) => (
          <g key={t}>
            <rect x={x(t) - 0.5} y="7" width="1" height="4" fill={rgba(PAL.ink, 0.3)} />
            {/* die Randmarken weichen nach innen aus, sonst schneidet die viewBox sie ab */}
            <text x={x(t)} y="21" textAnchor={t === 4 ? 'end' : 'middle'} fontFamily="'IBM Plex Mono', monospace" fontSize="7" fill={PAL.muted}>{fmtDE(t, 1)}</text>
          </g>
        ))}
        <rect x={x(world) - 0.5} y="3" width="1" height="8" fill={rgba(PAL.human, 0.9)} />
        <circle cx={x(value)} cy="10.5" r="3.4" fill={rgba(PAL.ink, 0.9)} />
      </svg>
    </div>
  )
}

/** (c) Sprache, Modelle - und die IP-Grenze des Datensatzes, konkret gemacht. */
function Profile({ c }) {
  const langs = (c.langs || []).filter((l) => (l.pct ?? 0) >= 1)
  return (
    <section>
      {sectionTitle('Sprache und Modell', '≥ 1 %')}
      {langs.map((l) => bar(l.l, l.pct, PAL.human))}
      <div style={{ height: 'var(--s-3)' }} />
      {(c.models || []).map((m) => bar(m.m, m.pct, rgba(PAL.machine, 0.75)))}
      {/* Der Japan-Fall (60 % Englisch) belegt die IP-Grenze, gehoert aber in kein einzelnes
          Laender-Dossier - er steht in der eingeklappten Global-Notiz unter dem Blatt. */}
      <p className="mono" style={{ margin: '0.5rem 0 0', color: PAL.muted, fontSize: '9.5px', lineHeight: 1.55 }}>
        Sprache des Gesprächs, nicht der Person. Modelle: die drei häufigsten des Landes.
      </p>
    </section>
  )
}

/**
 * (c2) Zeit: wann ein Land geredet hat ("Verlauf") und wie schnell ("Tempo").
 *
 * Der Verlauf stand bis zum Spalten-Umbau auch im Blatt, dort als 13 Balken auf 179 x 14 px -
 * die Varianz war messbar (TVD 0,073 bis 0,42), aber nicht sichtbar. Hier hat dieselbe Groesse
 * 360 x 150 px und eine bezifferte y-Achse, und hier sitzt seit dem Umbau auch die
 * ENCODE-Umschaltung (Yi): dieselbe Mark, derselbe Nullpunkt, anderes Attribut.
 */
function TimePane({ c, tab, setTab, world, months, monthCounts, maxMonth, trendMode, onTrendMode, reduce }) {
  const total = (c.trend || []).reduce((s, v) => s + v, 0) || 1
  const abs = trendMode === 'abs'
  const own = (c.trend || []).map((v) => (abs ? v : (v / total) * 100))
  const d = tvd(c, world.shares)
  const VW = 360
  const VH = 150
  const PADB = 26
  const top = Math.max(1, abs ? maxMonth || 1 : 35)
  const step = (VW - 8) / Math.max(1, own.length)
  const yScale = (v) => VH - PADB - (v * (VH - PADB - 8)) / top
  const grid = abs ? [0, 0.25, 0.5, 0.75, 1].map((f) => f * top) : [0, 10, 20, 30]
  const pill = (active) => ({
    font: 'inherit',
    fontSize: '0.62rem',
    cursor: 'pointer',
    color: active ? PAL.machine : PAL.muted,
    background: 'transparent',
    border: `1px solid ${active ? PAL.machine : rgba(PAL.hairline, 0.5)}`,
    borderRadius: 999,
    padding: '0.2rem 0.6rem',
  })

  return (
    <section>
      {/* Die TVD-Zahl steht in der Bildunterschrift, nicht zweimal: als Abschnitts-Detail sprengte
          sie die Spaltenbreite (gemessen 14 px Ueberlauf) und wiederholte nur den Satz darunter. */}
      {sectionTitle('Zeit', `${months.length} Monate`)}
      <div role="group" aria-label="Zeitansicht" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.45rem' }}>
        {[['trend', 'Verlauf'], ['tempo', 'Tempo']].map(([key, label]) => (
          <button key={key} type="button" className="mono" aria-pressed={tab === key}
            onClick={() => setTab(key)} style={pill(tab === key)}>
            {label}
          </button>
        ))}
        {/* Der Umschalter steht NUR am Verlauf, weil nur der Verlauf zwei Lesarten hat. */}
        {tab === 'trend' && (
          <button type="button" className="mono" aria-pressed={abs} onClick={onTrendMode} style={pill(abs)}>
            {abs ? 'Absolutzahlen' : 'Anteil am eigenen Jahr'}
          </button>
        )}
      </div>

      {tab === 'trend' ? (
        <div>
          <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" role="img" style={{ display: 'block', height: 'auto' }}
            aria-label={abs
              ? `Monatsverlauf ${shortName(c.country)}, 13 Monate, Gespräche je Monat, gemeinsame Skala 0 bis ${fmtDE(top)}.`
              : `Monatsverlauf ${shortName(c.country)}, 13 Monate, Anteil am eigenen Volumen, gemeinsame Skala 0 bis 35 Prozent.`}>
            {grid.map((g) => (
              <g key={g}>
                <rect x="4" y={yScale(g)} width={VW - 8} height="0.5" fill={rgba(PAL.ink, 0.1)} />
                <text x="4" y={yScale(g) - 2} fontFamily="'IBM Plex Mono', monospace" fontSize="7" fill={PAL.muted}>
                  {abs ? fmtDE(g, 0) : `${g} %`}
                </text>
              </g>
            ))}
            {/* Weltprofil als Referenz: dieselbe Skala, dieselbe Baseline. Im Absolutmodus
                fehlt sie, weil die Weltsumme (bis 104.604 im Monat) auf einer Skala fuer
                20.960 kein Vergleich waere, sondern eine Linie am Anschlag. */}
            {!abs && (
              <polyline
                fill="none"
                stroke={rgba(PAL.human, 0.75)}
                strokeWidth="1.2"
                points={world.shares.map((s, j) => `${4 + j * step + step / 2},${yScale(s)}`).join(' ')}
              />
            )}
            {own.map((v, j) => (
              <rect key={months[j]?.month || j} x={4 + j * step} y={yScale(v)} width={step - 2} height={Math.max(0, VH - PADB - yScale(v))} fill={rgba(PAL.ink, 0.55)} />
            ))}
            {months.map((m, j) => (j % 3 === 0 ? (
              <text key={m.month} x={4 + j * step} y={VH - 12} fontFamily="'IBM Plex Mono', monospace" fontSize="7" fill={PAL.muted}>{m.month.slice(2)}</text>
            ) : null))}
            <text x="4" y={VH - 2} fontFamily="'IBM Plex Mono', monospace" fontSize="7.5" fill={PAL.muted}>
              {abs
                ? `Balken: ${shortName(c.country)} · Skala 0 bis ${fmtDE(top)} je Monat, für alle Länder gleich`
                : `Balken: ${shortName(c.country)} · Linie: Welt`}
            </text>
          </svg>
          <p className="mono" style={{ margin: '0.4rem 0 0', color: PAL.muted, fontSize: '9.5px', lineHeight: 1.55 }}>
            {abs ? (
              <>Absolutzahlen, gemeinsame Skala für alle Länder, deshalb ohne Weltlinie
              {' '}({fmtDE(Math.max(...monthCounts))} im Monat wäre ein Balken am Anschlag).</>
            ) : (
              <>Anteil am eigenen Jahr, nicht Absolutzahl. Abweichung vom Weltverlauf
              {' '}<b style={{ color: PAL.text }}>{fmtDE(d * 100, 1)} %</b>.</>
            )}
            {' '}Delle Januar 2024 = Erhebungslücke.
          </p>
        </div>
      ) : (
        <Staircase country={c} months={months} worldTrend={monthCounts} reduce={reduce} />
      )}
    </section>
  )
}

/** (d) Der Belegstapel: Text als Mark. Breite traegt den Wert, die Typografie ist nur der Koerper. */
function DocStack({ c, docs, lenQ, selDocId, onOpenDoc }) {
  const [shown, setShown] = useState(() => new Set())
  const ticks = [['p25', lenQ.p25], ['Median', lenQ.p50], ['p75', lenQ.p75], ['p90', lenQ.p90]]
  const rulerW = BLOCK(lenQ.max)

  return (
    <section style={{ gridColumn: '1 / -1' }}>
      {sectionTitle('Belege', `${docs.length} von ${lenQ.n} · Blockbreite = Zeichenzahl`)}

      {/* EIN gemeinsamer horizontaler Scroller fuer Lineal UND Bloecke. Die Blockbreite ist eine
          Wertkodierung in Pixeln: der laengste Beleg ist rund 520 px breit und passt unter 640 px
          Fensterbreite nicht ins Bild. Ihn dort umzuskalieren wuerde die Kodierung brechen (die
          Strichhoehen im Blatt benutzen dieselbe Skala), ihn abzuschneiden verlor bis 390 px die
          Ticks p75 und p90. Also scrollt beides zusammen, wie das Blatt und das Zeilen-Echo. */}
      <div className="ledger-docscroll">
      {/* Quantils-Lineal: die Ticks kommen zur Laufzeit aus lengthQuantiles(), nie aus dem Text. */}
      <div style={{ position: 'relative', height: 20, width: rulerW, marginBottom: '0.35rem' }}>
        <span style={{ position: 'absolute', left: 0, right: 0, top: 13, height: 1, background: rgba(PAL.ink, 0.25) }} />
        {ticks.map(([label, v]) => (
          <span key={label} style={{ position: 'absolute', left: BLOCK(v), top: 0 }}>
            <span style={{ position: 'absolute', left: 0, top: 9, width: 1, height: 5, background: rgba(PAL.ink, 0.55) }} />
            <span className="mono" style={{ position: 'absolute', left: 2, top: -1, fontSize: '8px', color: PAL.muted, whiteSpace: 'nowrap' }}>
              {label} {fmtDE(v, 0)}
            </span>
          </span>
        ))}
      </div>

      <ul className="ledger-doclist">
        {docs.map((d) => {
          const isGray = d.kind === 'g'
          const open = shown.has(d.id)
          return (
            <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
              <span aria-hidden="true" style={{ width: 4, height: 12, flex: '0 0 auto', background: CAT_COLOR[d.cat] || PAL.muted }} />
              {isGray && !open ? (
                <>
                  <span className="mono" style={{ fontSize: '0.62rem', color: PAL.muted }}>
                    Graubereich · {MOD_LABEL[d.dim] || d.dim} · Score {fmtDE(d.score, 2)}
                  </span>
                  <button type="button" className="mono ledger-reveal" onClick={() => setShown((s) => new Set(s).add(d.id))}>
                    zum Lesen aufdecken
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="ledger-docblock"
                  onClick={() => onOpenDoc(d)}
                  aria-label={`Beleg lesen: ${d.cat}, ${fmtDE(d.len)} Zeichen${isGray ? `, Graubereich ${MOD_LABEL[d.dim] || d.dim} Score ${fmtDE(d.score, 2)}` : ''}`}
                  style={{
                    width: BLOCK(d.len),
                    borderBottom: `1px solid ${d.id === selDocId ? PAL.machine : rgba(PAL.hairline, 0.4)}`,
                    color: d.id === selDocId ? PAL.machine : PAL.text,
                    opacity: isGray ? 0.86 : 1,
                    maskImage: d.capped ? 'linear-gradient(to right, #000 88%, transparent)' : undefined,
                    WebkitMaskImage: d.capped ? 'linear-gradient(to right, #000 88%, transparent)' : undefined,
                  }}
                >
                  {d.t}
                </button>
              )}
              <span className="mono" style={{ fontSize: '0.6rem', color: PAL.muted, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                {fmtDE(d.len)} Z.{d.capped ? ' · abgeschnitten' : ''}
              </span>
            </li>
          )
        })}
      </ul>
      </div>
      {/* Warum der Text IM Block sitzt und warum Graubereich-Belege erst nach dem Aufdecken im
          DOM stehen, erklaert die eingeklappte Quellen-Notiz des Akts. Hier steht nur, was man tut. */}
      <p className="mono" style={{ margin: '0.4rem 0 0', color: PAL.muted, fontSize: '9.5px', lineHeight: 1.55 }}>
        Klick auf einen Block zeigt den vollen Gesprächstext.
      </p>
    </section>
  )
}

export { DOSSIER_H, DOSSIER_H_1, DOSSIER_H_3, DOSSIER_H_EMPTY }
