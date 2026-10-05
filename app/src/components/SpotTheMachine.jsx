import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PAL, OUTCOME, SCENE_BG } from '../theme'
import { CountUp, Reveal, SourceNote } from './Motion'
import VideoOutlook from './spot/VideoOutlook'
import { AGE_LEAD, CLOSING, DETECTION_CAPTION, IMAGE_TELL, OUTLOOK_SOURCES, PROVENANCE, VIDEO_TEXT } from './spot/outlookText'

// Akt 5 (Finale), "Spot the Machine". Interaktives Ratespiel Mensch vs. KI (HC3-Texte +
// CIFAKE-Bilder). Deckt zugleich die geforderte Lesbarkeits-/Unterscheidungs-Evaluation ab:
// gemessen wird, ob ein Mensch KI noch erkennt. Mensch = Teal (human), KI/Maschine = Magenta (machine).

const HUMAN = PAL.human // Mensch = Teal
const AI = PAL.machine // KI/Maschine = Magenta, zugleich der Marken-Akzent (die Maschine ist der Protagonist)
const OK = OUTCOME.ok // Outcome richtig (entkoppelt von den Entitaetsfarben)
const NO = OUTCOME.no // Outcome falsch
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((p) => p[1])
const SEG_H = 5 // Hoehe der Fortschritts-Segmente
const IMG_W = 'clamp(300px, 38vw, 420px)' // Bildgroesse fluid (war fix 300x300, zu klein fuer das Finale)
const WIPE = { duration: 0.45, ease: [0.22, 1, 0.36, 1] } // Reveal-Wipe der Identitaets-Labels

// --- Gamification-Feedback (r5) -------------------------------------------------------------
// Karten-Flash in den semantischen Outcome-Farben, Shake bei falsch, Puls + Konfetti bei richtig.
// Dezent gehalten (Tufte: kurzer Moment statt Dauer-Effekt, kein Sound). Reduced Motion:
// statisches Feedback rein ueber Farbe (getoentes Karten-Background, kein Bewegungsreiz).
const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`
const FLASH_A = 0.16 // Spitzen-Alpha des Karten-Flash
const STATIC_A = 0.12 // statische Toenung bei Reduced Motion
const FB_T = { duration: 0.5, ease: [0.22, 1, 0.36, 1] } // Timing des Feedback-Moments

const cardFeedback = (chosen, correct, reduce) => {
  if (!chosen) return { animate: {}, style: {} }
  const col = correct ? OK : NO
  if (reduce) return { animate: {}, style: { background: rgba(col, STATIC_A) } } // nur Farbe
  const flash = [rgba(col, 0), rgba(col, FLASH_A), rgba(col, 0)] // Karten-Flash (Outcome-Farbe)
  return correct
    ? { animate: { scale: [1, 1.02, 1], backgroundColor: flash }, style: {} } // Puls bei richtig
    : { animate: { x: [0, -7, 7, -5, 5, 0], backgroundColor: flash }, style: {} } // Shake bei falsch
}

const KONFETTI_N = 12 // wenige Partikel, ein kurzer Burst (kein neues Package, reine motion-Spans)
const KONFETTI_COLORS = [OK, '#a7f3d0', '#6ee7b7'] // Gruen-Toene des Outcome "richtig" (semantisch)

function Konfetti() {
  const parts = useMemo(() => Array.from({ length: KONFETTI_N }, (_, k) => ({
    left: 8 + (k / KONFETTI_N) * 84,
    dx: (Math.random() - 0.5) * 56,
    dy: -(28 + Math.random() * 52),
    rot: Math.random() * 240 - 120,
    size: 4 + Math.random() * 4,
    color: KONFETTI_COLORS[k % KONFETTI_COLORS.length],
    dur: 0.55 + Math.random() * 0.35,
  })), [])
  return (
    <span aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 6 }}>
      {parts.map((p, k) => (
        <motion.span key={k}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
          animate={{ opacity: [1, 1, 0], x: p.dx, y: p.dy, rotate: p.rot }}
          transition={{ duration: p.dur, ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${p.left}%`, top: '58%', width: p.size, height: p.size * 0.55, background: p.color, borderRadius: 1 }} />
      ))}
    </span>
  )
}

export default function SpotTheMachine() {
  const [d, setD] = useState(null)
  const [round, setRound] = useState(0)
  const reduce = useReducedMotion()
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/spot.json`).then((r) => r.json()).then(setD).catch((e) => console.error('spot:', e)) }, [])

  const questions = useMemo(() => {
    if (!d) return []
    // Jede Runde lässt bewusst einige Items aus: Reihenfolge, Textauswahl, Bildauswahl und
    // Antwortseite wechseln. So ist "Nochmal" eine neue Runde statt derselben neun Karten.
    const texts = shuffle(d.texts).slice(0, 6).map((t) => {
      const humanA = Math.random() < 0.5
      return { type: 'text', q: t.q, source: t.source, a: humanA ? t.human : t.ai, b: humanA ? t.ai : t.human, humanIsA: humanA }
    })
    // Nur die fotonah kuratierten Bilder: Illustrationen, Cartoon und Pixel-Art sind kein fairer
    // Test. Drei echte und drei KI-Bilder bleiben ausgeglichen; die Reihenfolge mischt beide Klassen.
    const photoLike = d.images.filter((im) => (im.difficulty ?? 0) >= 2)
    const imgs = shuffle([
      ...shuffle(photoLike.filter((im) => im.isAI)).slice(0, 3),
      ...shuffle(photoLike.filter((im) => !im.isAI)).slice(0, 3),
    ]).map((im) => ({ type: 'image', file: im.file, isAI: im.isAI }))
    return [...texts, ...imgs]
  }, [d, round])

  const [i, setI] = useState(0)
  const [results, setResults] = useState([]) // je Frage {correct, type}: Fortschritts-Strip + Ergebnis-Analyse
  const [pick, setPick] = useState(null) // {choice, correct}

  if (!d) return <section id="spot" className="act" style={{ background: SCENE_BG }} />
  const total = questions.length
  const done = i >= total
  const q = questions[i]
  const score = results.filter((r) => r.correct).length

  const answer = (choice, correct) => { if (pick) return; setResults((rs) => [...rs, { correct, type: q.type }]); setPick({ choice, correct }) }
  const next = () => { setPick(null); setI((v) => v + 1) }
  const restart = () => { setI(0); setResults([]); setPick(null); setRound((v) => v + 1) }

  // Fortschritts-Strip: beantwortet = ok/no, aktuell = Magenta-Rahmen, offen = Hairline.
  // Farbe ist hier nie alleiniger Kanal: die Status-Zeile traegt Haken/Kreuz, das Ergebnis Glyphen (CVD).
  const progressStrip = (
    <div role="img" aria-label={`${results.length} von ${total} beantwortet, ${score} richtig`}
      style={{ display: 'flex', gap: 4, margin: '0 0 var(--s-5)' }}>
      {questions.map((qq, idx) => {
        const r = results[idx]
        return (
          <span key={idx} style={{
            flex: 1, height: SEG_H, borderRadius: 2, boxSizing: 'border-box',
            background: r ? (r.correct ? OK : NO) : 'rgba(236,232,225,0.07)',
            border: !r && idx === i ? `1px solid ${PAL.machine}` : '1px solid transparent',
          }} />
        )
      })}
    </div>
  )

  return (
    <section id="spot" aria-label="Spot the Machine" className="act" style={{ background: SCENE_BG }}>
      <div className="layout-container">
        <div className="editorial-grid">
          <div className="text-column">
            <Reveal>
              <p className="kicker" style={{ marginBottom: 'var(--s-2)' }}>Finale · Mensch oder Maschine</p>
              <p className="t-data" style={{ color: PAL.muted, margin: '0 0 var(--s-4)' }}>Daten: Items (Text + Bild), binär gelabelt · Task: Unterscheidung Mensch vs. KI (durch dich)</p>
              <h2 className="t-display-l" style={{ margin: 0 }}>Erkennst du sie noch?</h2>
            </Reveal>
          </div>

          {!done && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="t-data" style={{ display: 'flex', justifyContent: 'space-between', color: PAL.muted, margin: 'var(--s-6) 0 var(--s-4)' }}>
                <span>Frage {i + 1} / {total}</span>
                {/* Treffer-Zaehler zaehlt animiert hoch: neue Zahl rollt rein + kurzer Puls in OK-Gruen */}
                <span>Treffer: <motion.span key={score} initial={reduce || score === 0 ? false : { y: 8, opacity: 0 }}
                  animate={reduce || score === 0 ? {} : { y: 0, opacity: 1, scale: [1, 1.35, 1], color: [OK, OK, PAL.text] }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                  style={{ display: 'inline-block', color: PAL.text, fontWeight: 600 }}>{score}</motion.span></span>
              </div>
              {progressStrip}

              {q.type === 'text' ? (
                <>
                  <p className="t-lead" style={{ color: PAL.text, margin: '0 0 var(--s-2)' }}>
                    Welche Antwort schrieb ein <span style={{ color: HUMAN }}>Mensch</span>?
                  </p>
                  <p className="t-lead" style={{ color: PAL.text, fontStyle: 'italic', borderLeft: '3px solid var(--machine-line)', paddingLeft: 'var(--s-4)', margin: '0 0 var(--s-3)' }}>„{q.q}“</p>
                  <p className="t-data" style={{ color: PAL.muted, marginBottom: 'var(--s-5)' }}>{q.source}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--s-5)' }}>
                    {['a', 'b'].map((opt) => {
                      const isHuman = (opt === 'a') === q.humanIsA
                      const chosen = pick?.choice === opt
                      // Outcome: gewaehlte Karte = Richtigkeit (OK/NO), andere = wahre Identitaet (Mensch/KI)
                      const bd = pick ? (chosen ? (pick.correct ? OK : NO) : (isHuman ? HUMAN : AI)) : undefined
                      const fb = pick ? cardFeedback(chosen, pick.correct, reduce) : { animate: {}, style: {} }
                      return (
                        <motion.button key={opt} onClick={() => answer(opt, isHuman)} disabled={!!pick}
                          className="quiz-card t-body"
                          animate={fb.animate}
                          transition={FB_T}
                          style={{ textAlign: 'left', padding: 'var(--s-5)', borderColor: bd, position: 'relative', overflow: 'hidden', ...fb.style }}>
                          {pick && (
                            <motion.span className="t-label"
                              initial={reduce ? false : { clipPath: 'inset(0 100% 0 0)' }}
                              animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={WIPE}
                              style={{ display: 'block', color: isHuman ? HUMAN : AI, marginBottom: 'var(--s-2)' }}>
                              {isHuman ? 'Mensch' : 'KI (ChatGPT)'}
                            </motion.span>
                          )}
                          {opt === 'a' ? q.a : q.b}
                          {pick && chosen && pick.correct && !reduce && <Konfetti />}
                        </motion.button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="t-lead" style={{ color: PAL.text, margin: '0 0 var(--s-5)' }}>
                    Echtes Foto oder von einer KI erzeugt?
                  </p>
                  <div style={{ display: 'flex', gap: 'var(--s-8)', alignItems: 'center', flexWrap: 'wrap' }}>
                    <img src={`${import.meta.env.BASE_URL}data/${q.file}`} alt="Zu beurteilendes Bild; ob es ein echtes Foto oder KI-generiert ist, ist nur visuell zu entscheiden"
                      style={{ width: IMG_W, height: 'auto', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 8, border: `1.5px solid ${pick ? (q.isAI ? AI : HUMAN) : PAL.hairline}` }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', minWidth: 220 }}>
                      {[['Echtes Foto', false], ['KI-generiert', true]].map(([lbl, guessAI]) => {
                        const chosen = pick?.choice === lbl
                        const bd = pick && chosen ? (pick.correct ? OK : NO) : undefined
                        const fb = pick ? cardFeedback(chosen, pick.correct, reduce) : { animate: {}, style: {} }
                        return (
                          <motion.button key={lbl} onClick={() => answer(lbl, guessAI === q.isAI)} disabled={!!pick}
                            animate={fb.animate}
                            transition={FB_T}
                            className="quiz-card t-body" style={{ padding: 'var(--s-3) var(--s-5)', borderColor: bd, position: 'relative', overflow: 'hidden', ...fb.style }}>
                            {lbl}
                            {pick && chosen && pick.correct && !reduce && <Konfetti />}
                          </motion.button>
                        )
                      })}
                      {pick && (
                        <motion.p className="t-data"
                          initial={reduce ? false : { clipPath: 'inset(0 100% 0 0)' }}
                          animate={{ clipPath: 'inset(0 0% 0 0)' }} transition={WIPE}
                          style={{ color: q.isAI ? AI : HUMAN }}>
                          Es war: {q.isAI ? 'KI-generiert' : 'ein echtes Foto'}
                        </motion.p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {pick && (
                <div role="status" aria-live="polite" aria-atomic="true" style={{ marginTop: 'var(--s-6)', display: 'flex', alignItems: 'center', gap: 'var(--s-6)' }}>
                  <span className="t-data" style={{ color: pick.correct ? OK : NO }}>{pick.correct ? '✓ Richtig' : '✗ Daneben'}</span>
                  <button onClick={next} className="t-data" style={{ background: PAL.machine, color: PAL.onAccent, border: 'none', borderRadius: 999, padding: 'var(--s-2) var(--s-6)', cursor: 'pointer' }}>{i + 1 < total ? 'Weiter →' : 'Ergebnis →'}</button>
                </div>
              )}
            </div>
          )}

          {done && (() => {
            const tTot = results.filter((r) => r.type === 'text').length
            const tOk = results.filter((r) => r.type === 'text' && r.correct).length
            const bTot = results.filter((r) => r.type === 'image').length
            const bOk = results.filter((r) => r.type === 'image' && r.correct).length
            let tIdx = 0; let bIdx = 0
            return (
            <div style={{ gridColumn: '1 / -1', marginTop: 'var(--s-8)' }}>
              <p className="kicker" style={{ marginBottom: 'var(--s-2)' }}>Dein Ergebnis</p>
              <p className="display" style={{ fontSize: 'clamp(3.5rem, 8vw, 6rem)', lineHeight: 1, color: PAL.text, margin: 0 }}>
                <CountUp to={score} duration={1.1} /><span style={{ color: PAL.muted, fontSize: '0.4em' }}> / {total}</span>
              </p>
              {/* Per-Frage-Analyse: Glyphe + Farbe (nie Farbe allein, CVD) und die Text/Bild-Aufschluesselung */}
              <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', marginTop: 'var(--s-5)' }}>
                {results.map((r, idx) => {
                  const label = r.type === 'text' ? `T${++tIdx}` : `B${++bIdx}`
                  const col = r.correct ? OK : NO
                  return (
                    <span key={idx} className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, border: `1px solid ${col}`, color: col, fontSize: '0.74rem' }}>
                      {r.correct ? '✓' : '✗'} {label}
                    </span>
                  )
                })}
              </div>
              <p className="t-data" style={{ color: PAL.muted, marginTop: 'var(--s-2)' }}>
                Text: <span style={{ color: PAL.text }}>{tOk}/{tTot}</span> · Bild: <span style={{ color: PAL.text }}>{bOk}/{bTot}</span>
              </p>
              <p className="t-body" style={{ color: PAL.muted, marginTop: 'var(--s-4)', maxWidth: '60ch' }}>
                {score >= total - 1 ? 'Starkes Auge. Doch die Grenze verschwimmt, und sie wird weiter verschwimmen.' : score <= total / 2 ? 'Schwerer, als es aussieht. Genau das ist der Punkt.' : 'Kaum besser als ein Münzwurf, und das ist kein Zufall: Text und Bild sind kaum noch zu trennen.'}
              </p>
              <SourceNote className="prose">
                HC3 (Mensch- vs. ChatGPT-Antworten, 2023; peer-reviewt, CC BY-SA 4.0, wirkt auf die abgeleiteten Daten weiter). Bilder: drei handverlesene, fotorealistische Synthese-Szenen und drei echte Fotos von Wikimedia Commons (CC0: Luke Chesser, Jonas Muth, Onthewings). Dieses Spiel ist zugleich die vorläufige Lesbarkeits-/Unterscheidungs-Evaluation der Arbeit. Diese {total} Fragen sind eine Anekdote, keine Studie; der Längen-Vergleich beruht auf allen HC3-Antworten, nicht auf deinen Fragen.
              </SourceNote>

              {/* Der Abschluss der Story: nicht woran man es erkennt, sondern wie lange ein
                  Merkmal haelt. Eigene Datei, weil er eine eigene Argumentation und eine eigene
                  Grafik hat und dieser Akt sonst ueber 400 Zeilen waechst. */}
              <VideoOutlook
                v={d.video}
                tellHuman={d.tell.human}
                tellAI={d.tell.ai}
                imageTell={IMAGE_TELL}
                detectionCaption={DETECTION_CAPTION}
                videoText={VIDEO_TEXT}
                ageLead={AGE_LEAD}
                provenance={PROVENANCE}
                closing={CLOSING}
                sources={OUTLOOK_SOURCES}
              />

              <button onClick={restart} className="t-data" style={{ marginTop: 'var(--s-8)', background: 'transparent', color: PAL.text, border: `1px solid ${PAL.hairline}`, borderRadius: 999, padding: 'var(--s-2) var(--s-6)', cursor: 'pointer' }}>Nochmal</button>
            </div>
            )
          })()}
        </div>
      </div>
    </section>
  )
}
