// Struktur-Smoke-Test des Akts 4. Er haelt genau die Invarianten fest, an denen
// scripts/e2e.mjs im Browser scheitern wuerde - hier aber ohne Browser und ohne Server,
// damit ein Bruch schon beim `npm test` auffliegt und nicht erst im Screenshot.
//
// Der Akt hat ZWEI EBENEN: Ebene 1 (die Frage plus eine direkt beschriftete Aufteilung der 9
// Nutzungs-Kategorien) ist immer da, Ebene 2 (das Register) haengt an einem Schalter. Beide
// Zustaende werden geprueft: `closed` ist der Erstkontakt, `open` das vollstaendige Register.
// detailOpen ist deshalb Prop und nicht nur State - sonst waere Ebene 2 ohne Browser nicht
// pruefbar (dieselbe Begruendung wie beim injizierten Datensatz).
//
// Gerendert wird mit renderToStaticMarkup gegen die echte wildchat.json. Effekte laufen dabei
// nicht; geprueft wird die Render-Phase (Struktur, A11y-Geruest, alle 53 Zeilen).

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import ConversationLedger from '../ConversationLedger'

const data = JSON.parse(readFileSync(new URL('../../../public/data/wildchat.json', import.meta.url), 'utf8'))
const closed = renderToStaticMarkup(createElement(ConversationLedger, { data }))
const html = renderToStaticMarkup(createElement(ConversationLedger, { data, detailOpen: true }))
const count = (re) => (html.match(re) || []).length
const countIn = (s, re) => (s.match(re) || []).length
const flat = html.replace(/\s+/g, ' ') // JSX bricht Saetze ueber Zeilen um
const flatClosed = closed.replace(/\s+/g, ' ')

describe('Ebene 1: die Frage und die Aufteilung der 9 Kategorien', () => {
  it('die Überschrift ist die FRAGE des Akts, nicht seine Schlussfolgerung', () => {
    expect(flatClosed).toContain('Wofür redet die Welt mit der')
    expect(flatClosed).toContain('Maschine?')
    // Der Titel "Zwei von 53 Ländern ..." ist eine Schlussfolgerung aus dem Blatt und steht
    // deshalb erst in Ebene 2.
    expect(flatClosed).not.toContain('tragen die')
    expect(flat).toContain('Zwei von 53 Ländern tragen die')
  })

  it('9 Segmente, 6 direkt beschriftet, Anteile aus globalCats', () => {
    expect(countIn(closed, /class="useov-seg"/g)).toBe(9)
    // sechs Labels ab 8 % plus ein Rest-Block fuer die drei kleinsten
    expect(countIn(closed, /class="useov-label"/g)).toBe(6)
    expect(countIn(closed, /useov-label--rest/g)).toBe(1)
    for (const c of data.globalCats.slice(0, 6)) {
      expect(flatClosed).toContain(c.cat)
      expect(flatClosed).toContain(`${c.pct.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`)
    }
    // keine separate Farb-Legende: die Labels sitzen an der Mark
    expect(flatClosed).not.toContain('Legende')
  })

  it('die drei kleinsten Kategorien werden als Gruppe am Bandende annotiert', () => {
    expect(flatClosed).toContain('die letzten 2,5 %')
    expect(flatClosed).toContain('Übersetzen 1,4 %')
    expect(flatClosed).toContain('Mathe/Logik 1,0 %')
    expect(flatClosed).toContain('Ratschlag 0,1 %')
    expect(countIn(closed, /class="useov-swatch"/g)).toBe(3)
  })

  it('„Sonstiges“ steht als erstes Segment, schraffiert, mit einem Satz Klartext', () => {
    // das erste Segment traegt die Schraffur (dieselbe 6-px-Textur wie im Register)
    expect(closed).toContain('repeating-linear-gradient(-45deg')
    expect(flatClosed).toContain('Das größte Segment ist ein Eingeständnis: 21,8 % der Gespräche lassen sich '
      + 'von der Heuristik keiner Kategorie eindeutig zuordnen.')
  })

  it('ein Satz Datenkontext, alle Zahlen aus den Daten', () => {
    expect(flatClosed).toContain('837.989 echte Gespräche')
    expect(flatClosed).toContain('aus dem Zeitraum 2023-04 bis 2024-04')
    expect(flatClosed).toContain('796.322 einem von 53 Ländern zugeordnet')
    expect(flatClosed).toContain('Stichwort-Heuristik')
  })

  it('der Aufhänger zeigt die Streuung zwischen den Ländern, gerechnet statt getippt', () => {
    expect(flatClosed).toContain('Rollenspiel/Story steht global bei 13,8 %')
    expect(flatClosed).toContain('in Jamaika bei 79 %')
    expect(flatClosed).toContain('in Deutschland bei 46 %')
    // cats[] ist ganzzahlig gerundet: ein fehlender Eintrag heisst "unter 0,5 %", nicht "null"
    expect(flatClosed).toContain('in 3 von 53 Ländern unter einem halben Prozent')
  })

  it('jedes Segment ist eine Schaltflaeche in die zweite Ebene', () => {
    // Ebene 1 ist nicht nur Uebersicht, sondern Einstieg: ein Klick oeffnet das Register und
    // stellt die Wofuer-Spalte auf genau diese Kategorie um. Ohne Button waere das eine tote Grafik.
    expect(countIn(closed, /class="useov-seg"/g)).toBe(9)
    expect(countIn(closed, /<button[^>]*class="useov-seg"/g)).toBe(9)
    for (const c of data.globalCats) {
      expect(flatClosed).toContain(`aria-label="${c.cat}, `)
    }
    // die Ansage sagt BEIDE Folgen des Klicks, nicht nur "oeffnen"
    expect(flatClosed).toMatch(/Register öffnen und nach dieser Kategorie ordnen/)
    // der Hinweis steht sichtbar und getrennt vom Sonstiges-Befund
    expect(closed).toContain('class="useov-pickhint"')
    expect(flatClosed).toContain('Klick auf ein Segment öffnet das Register, nach dieser Kategorie geordnet.')
  })

  it('der Schalter sagt, was kommt, und meldet seinen Zustand', () => {
    expect(flatClosed).toContain('Alle 53 Länder im Detail: das Register öffnen')
    expect(closed).toContain('aria-expanded="false"')
    expect(closed).toContain('aria-controls="wildchat-register"')
    // der Hinweis sagt, was man dort SIEHT und TUN kann, nicht wie die Grafik gebaut ist
    expect(flatClosed).toContain('Dahinter liegt eine Zeile je Land: wie viel dort gesprochen wurde, '
      + 'wofür, wie oft es grenzwertig wurde. Nach jeder Spalte sortierbar, und 846 Gespräche kann '
      + 'man einzeln lesen.')
    expect(flatClosed).not.toContain('Mark-Spalten')
    expect(html).toContain('aria-expanded="true"')
    expect(flat).toContain('Register schließen')
  })
})

describe('ConversationLedger rendert die Sektion', () => {
  it('Anker #wildchat existiert in beiden Ebenen (Motion.jsx ACT_IDS und e2e.mjs)', () => {
    expect(count(/id="wildchat"/g)).toBe(1)
    expect(countIn(closed, /id="wildchat"/g)).toBe(1)
  })

  it('ohne Daten existiert die Sektion trotzdem - kein Early-Return vor dem Container', () => {
    const empty = renderToStaticMarkup(createElement(ConversationLedger))
    expect(empty).toContain('id="wildchat"')
    expect(empty).not.toContain('<canvas')
  })

  it('GENAU EIN Canvas bei offener Ebene 2, KEINES bei geschlossener (e2e.mjs)', () => {
    expect(count(/<canvas/g)).toBe(1)
    expect(countIn(closed, /<canvas/g)).toBe(0)
  })

  it('GENAU EINE sr-only-Tabelle, in BEIDEN Ebenen erreichbar', () => {
    // Der Screenreader-Zugang haengt NICHT am Schalter: die Tabelle liegt ausserhalb von Ebene 2.
    for (const s of [html, closed]) {
      expect(countIn(s, /<table class="sr-only"/g)).toBe(1)
      expect(countIn(s, /<th scope="col"/g)).toBe(9)
      expect(countIn(s, /<th scope="row"/g)).toBe(53)
      expect(s).toContain('<caption>')
      expect(s).toContain('aria-sort="descending"') // aktive Sortierung Volumen, absteigend
    }
  })

  it('die Tabelle behält ALLE Werte, auch die der beiden entfernten Spalten', () => {
    // Aus dem Blatt sind zwei Kanaele verschwunden, keine Zahl. Tiefe (Runden je Gespraech) und
    // Verlaufsabweichung (TVD) stehen hier weiter Zeile fuer Zeile.
    expect(flat).toContain('<th scope="col">Runden je Gespräch</th>')
    expect(flat).toContain('<th scope="col">Abweichung vom Weltverlauf in Prozent</th>')
    expect(flat).toContain('Tiefe und Verlauf stehen nur hier und im Detailband')
    // Israel: 1,9 Runden je Gespraech, TVD 41,9 % - beides aus den Daten gerechnet
    const israel = data.countries.find((c) => c.country === 'Israel')
    expect(flat).toContain(`<td>${israel.avgTurns.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>`)
    // jede der 53 Zeilen hat 8 <td> (Rang + 7 Werte) neben ihrem <th scope="row">
    expect(count(/<td>/g)).toBe(53 * 8)
  })

  it('geschlossen enthält Ebene 1 nichts vom Register', () => {
    expect(countIn(closed, /class="ledger-sheet"/g)).toBe(0)
    expect(countIn(closed, /class="ledger-colhead"/g)).toBe(0)
    expect(countIn(closed, /class="ledger-row-btn"/g)).toBe(0)
    expect(countIn(closed, /class="ledger-note"/g)).toBe(0)
    expect(closed).not.toContain('r = 0,71')
  })

  it('53 Zeilen-Buttons plus 4 Sortierköpfe sind tastaturerreichbar', () => {
    expect(count(/class="ledger-row-btn"/g)).toBe(53)
    expect(count(/class="ledger-colhead"/g)).toBe(4)
    for (const label of ['Nach Land sortieren', 'Nach Volumen sortieren', 'Nach Wofür sortieren', 'Nach Graubereich sortieren']) {
      expect(flat).toContain(label)
    }
    expect(html).toContain('aria-label="Israel, Rang')
  })

  it('das Blatt liegt in einem eigenen overflow-Wrapper (kein Seiten-Overflow bei 390 px)', () => {
    expect(count(/class="ledger-scroll"/g)).toBe(1)
    expect(count(/class="ledger-sheet"/g)).toBe(1)
  })

  it('vor dem Blatt steht EIN Satz plus eine BILD-Legende, keine Vorrede', () => {
    // Der Erstkontakt hatte vier Bloecke vor der Grafik und schob sie rund 160 px nach unten.
    // Jetzt: ein Satz, dann die Legende als Bild, dann die Vis.
    expect(flat).toMatch(/Jede Zeile unten ist ein Land/)
    expect(flat).toMatch(/Spaltenkopf klicken sortiert/)
    // Der Satz bleibt kurz: die Kodierung ZEIGT die Legende, sie wird nicht beschrieben.
    const satz = flat.match(/Jede Zeile unten ist ein Land(.*?)<\/p>/s)?.[1] ?? ''
    expect(satz.replace(/\s+/g, ' ').trim().length).toBeLessThan(220)
    // Die Legende steht VOR dem Blatt und zeigt alle vier Spalten
    expect(html.indexOf('class="sheet-legend"')).toBeLessThan(html.indexOf('class="ledger-sheet"'))
    expect(count(/class="sheet-legend-tile"/g)).toBe(4)
    for (const t of ['Volumen', 'Wofür', 'Graubereich', 'Belege']) expect(flat).toContain(`>${t}</p>`)
    // Die Graubereich-Spalte hat mehr als eine Markenart. Alle muessen in der Legende stehen,
    // sonst ist die Spalte nicht lesbar.
    expect(flat).toContain('Punkt = das Land')
    expect(flat).toMatch(/Linie = Welt, 3,8 %/)
    for (const g of ['Gewalt', 'sexuell', 'Belästigung', 'kein Fall']) expect(flat).toContain(g)
    // Der Rechenweg bleibt, aber als Satz: er ist Nachschlagestoff, kein Lesevoraussetzung.
    expect(flat).toMatch(/Moderationswerte über 0,25 liegt/)
    // Kein Jargon-Auftakt: die alten Formeln bleiben verboten.
    expect(flat).not.toContain('ausgerichtete Marken')
    expect(flat).not.toContain('auf gemeinsamem Nullpunkt, rechts die')
    // Die Methodik ist nicht verloren, nur verlagert: sie steht weiter im Dokument.
    expect(flat).toMatch(/6,25× gestaucht|6,25×\)/)
    expect(flat).toMatch(/dieselben \d+ Skalen/)
    expect(flat).toMatch(/Volumen als Kontur statt/)
  })

  it('das Dossier ist ohne Auswahl im DOM und hat eine feste Hoehe (Stufe C, CLS = 0)', () => {
    expect(count(/class="ledger-dossier[ "]/g)).toBe(1)
    expect(html).toMatch(/class="ledger-dossier ledger-dossier--empty" style="--dossier-h:\d+px/)
    // Das Zeilen-Echo des Dossiers ist SVG. Waere es Canvas, braeche e2e.mjs sofort.
    expect(count(/<canvas/g)).toBe(1)
    expect(flat).toContain('Hier steht alles, was in eine Zeile nicht passt.')
    // Der Leerzustand sagt, was zu TUN ist und was dann kommt - kurz, ohne Methodik-Prosa.
    expect(flat).toMatch(/Eine Zeile im Blatt anklicken/)
    expect(flat).toContain('als lesbare Blöcke')
  })

  it('ohne Auswahl gibt es keine Belegstrich-Buttons und keinen Lesetisch (Stufe D)', () => {
    expect(count(/class="ledger-doc-btn"/g)).toBe(0)
    expect(count(/role="dialog"/g)).toBe(0)
    expect(html).not.toContain('ledger-desk-scrim')
  })

  it('die Pointe steht UNTER dem Blatt, mit These davor', () => {
    // Reihenfolge im DOM: erst das Blatt, dann die These, dann das Streudiagramm.
    expect(html.indexOf('class="ledger-sheet"')).toBeLessThan(html.indexOf('class="ledger-pointe"'))
    expect(html.indexOf('class="ledger-pointe"')).toBeLessThan(html.indexOf('Rollenspiel erklärt den Graubereich nicht'))
    expect(flat).toContain('Die naheliegende Erklärung:')
    expect(flat).toContain('Rollenspiel treibt den Graubereich.')
    // Die SCHLUSSFOLGERUNG muss dastehen: der Befund allein sagt nicht, was daraus folgt.
    expect(flat).toContain('Rollenspiel erklärt den Graubereich nicht')
    expect(flat).toMatch(/hat zwei Länder gelesen und nicht 53/)
    // Beide Regressionslinien sind gleichzeitig im Bild, sonst haengt die Pointe am Klick
    expect(flat).toContain('>ohne die zwei<')
    expect(flat).toContain('>mit allen 53<')
  })

  it('beide r-Werte stehen als PAAR im Bild, gleich gross (Abnahmebedingung des EvidencePanels)', () => {
    // Der Befund IST der Unterschied. Vorher stand 0,71 gross und 0,24 in der Fussnote - wer nur
    // die grosse Zahl las, nahm das Gegenteil mit. Jetzt beide in derselben Groesse nebeneinander.
    expect(flat).toMatch(/0,71<\/span>.*mit den zwei.*0,24<\/span>.*ohne sie \(n = 51\)/s)
    expect(count(/font-size:2\.6rem/g)).toBe(2) // gleich gross, keine Hierarchie zwischen ihnen
    // Nebenmasse und Auswahlregel sind nicht verloren, nur eingeklappt
    expect(html).toContain('Spearman ρ = 0,37')
    expect(html).toContain('r(log n, Graubereich) = 0,02')
    expect(flat).toContain('Hebelwert der Regression')
    expect(count(/<circle/g)).toBeGreaterThanOrEqual(53) // 53 Länder als Punkte
  })

  it('die zwei Hebelpunkte tragen ihren Namen DAUERHAFT im Diagramm', () => {
    // Ohne Beschriftung war "zwei Zeilen tragen den Zusammenhang" im Bild nicht nachvollziehbar:
    // die zwei Punkte sahen aus wie 51 andere und waren nur per Hover zu identifizieren.
    expect(flat).toMatch(/Jamaika 79 %/)
    expect(flat).toMatch(/Israel 63 %/)
  })

  it('die sechs Ehrlichkeitssätze stehen vollständig im DOM, eingeklappt statt als Fußnote', () => {
    expect(count(/class="ledger-note"/g)).toBe(6)
    // dasselbe natives-details-Muster wie die Quellen-Notizen der anderen Akte
    // zwei eingeklappte Notizen im Akt: die Spalten-Ehrlichkeit und die Rechenwege der Pointe
    expect(count(/class="source-note /g)).toBe(2)
    expect(flat).toContain('Was diese Spalten genau messen, und was sie nicht zeigen')
    // jeder Satz beginnt mit dem, was die Spalte MISST, nicht mit ihrer Bauart
    expect(flat).toContain('Wie viele Gespräche das Land beigetragen hat.')
    expect(flat).toContain('Worüber geredet wurde, als Anteil am eigenen Volumen.')
    // Was die Spalte MISST, sagt jetzt die Legende als Bild; die Notiz traegt die Vorbehalte.
    expect(flat).toMatch(/θ = 0,25 ist gesetzt, nicht kalibriert/)
    expect(flat).toMatch(/Ähnlichkeit mit einer der fünf Dimensionen/)
    expect(flat).toContain('Einzelne Gespräche, die man wirklich lesen kann.')
    expect(flat).toContain('Der lange Schwanz ist ein Flüstern, und das ist die wahre Form einer Potenzverteilung')
    expect(flat).toContain('ist das Eingeständnis, keine Kategorie')
    expect(flat).toContain('sind die Nachweisgrenze dieses vormoderierten Public Sets, kein Befund')
    expect(flat).toContain('Erhebungslücke')
    expect(flat).toContain('nicht proportional zum Volumen und nicht zufällig gezogen')
    expect(flat).toContain('Keine Karte, weil die Zuordnung keine Geografie hergibt')
    // die Glyphen-Legende gehoert zur Graubereich-Spalte, nicht in die Kopfzeile
    expect(flat).toContain('Glyphe am Belegstrich: <b>▲ Gewalt · ■ sexuelle Inhalte · ● Belästigung · ▬ kein Fall</b>')
    // die Zahlen in den Saetzen kommen aus den Daten, nicht aus dem Fliesstext
    expect(flat).toContain('170.520 = 100 px, also 1.705,2 Gespräche je Pixel')
    expect(flat).toContain('Griechenland mit 1.513 Gesprächen wird 0,89 px breit')
    expect(flat).toContain('θ = 0,25 ist gesetzt, nicht kalibriert')
    expect(flat).toContain('14 von 53 Ländern haben weniger als 3.000 Gespräche')
    expect(flat).toContain('35 von 846 sind bei 2.000 Zeichen gekappt')
  })

  it('die Kopfzahlen 797 und 846 kommen aus den Daten', () => {
    expect(html).toContain('>797<')
    expect(html).toContain('>846<')
    expect(html).toContain('Striche im Einheiten-Kamm')
    expect(html).toContain('einzeln adressierbare Belege')
  })

  it('die Mono-Datenzeile deklariert Datentypen und Tasks (Munzner What/Why)', () => {
    expect(flat).toContain('53 Länder × 7 Attribute × 13 Monate + 846 Belege')
    expect(flat).toContain('Vergleichen · Ordnen · Umordnen (Seriation) · Verbinden · Nachschlagen / Vertiefen')
  })

  it('Stufe E: die Schalter der Bedienleiste sind echte Toggles mit aria-pressed', () => {
    // Volumenfilter und Übergänge aus. Die Encode-Umschaltung des Verlaufs sitzt seit dem
    // Spalten-Umbau am Verlaufs-Diagramm im Detailband, nicht mehr hier.
    expect(count(/aria-pressed="false"/g)).toBeGreaterThanOrEqual(2)
    expect(flat).toContain('nur Länder ab 5.000 Gesprächen (29 von 53)')
    expect(flat).toContain('Übergänge aus')
    // ohne Zug gibt es keinen Bereichsfilter und damit auch keinen Aufheben-Knopf
    expect(flat).not.toContain('Bereich aufheben')
  })

  it('Stufe E: die drei Wege in die Tiefe stehen weiter im Dokument, nur nicht mehr vor der Vis', () => {
    // Sie sind aus dem Kopf in die eingeklappte Notiz gewandert: nachschlagbar, aber nicht
    // im Weg. Verloren gehen darf keiner der drei.
    expect(flat).toContain('Zeile anklicken zeigt das Land im Detail')
    expect(flat).toContain('Belegstrich rechts öffnet den Gesprächstext')
    expect(flat).toMatch(/Zug über die Graubereich-Spalte filtert/)
    expect(flat).not.toContain('nochmal klicken dreht die Richtung')
    // Responsive-Regel: es entfällt keine Spalte mehr, es wird umverteilt
    expect(flat).toContain('Unter 1200 px Breite gibt <i>Wofür</i> 80 px an <i>Graubereich</i> ab')
    expect(flat).toContain('Es entfällt keine Spalte mehr.')
    // die Absolutskala des Verlaufs nennt ihr Maximum weiter im Ehrlichkeitssatz
    expect(flat).toContain('gemeinsame Skala 0 bis 20.960, Maximum China 2023-05')
  })

  it('der Befund über die eigene Gestaltung steht im Bild, nicht nur im Paper', () => {
    expect(flat).toContain('Hier standen bis vor kurzem zwei weitere Spalten')
    expect(flat).toContain('Tiefe spannte real nur 1,5 bis 3,8 Runden, die mittlere Hälfte 2,2 bis 2,8')
    expect(flat).toContain('auf 80 px Spaltenbreite lagen damit fast alle 53 Punkte übereinander')
    expect(flat).toContain('Ein Kanal, der den Vergleich nicht trägt, ist kein Gewinn, sondern Tinte.')
    // und die neue Skala begruendet sich mit der alten Zahl
    expect(flat).toMatch(/1 % von 4 % nur 21 px trennt/)
  })

  it('kein verbotener Kanal: kein viridis, kein Glow, keine Fläche in Magenta als Kategorie', () => {
    for (const s of [html, closed]) {
      expect(s).not.toMatch(/blur|box-shadow|filter:/i)
      expect(s).not.toMatch(/rgb\(253,231,37\)|rgb\(72,33,115\)/) // viridis-Endpunkte
    }
  })
})
