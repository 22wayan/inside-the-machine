#!/usr/bin/env node
/**
 * build-paper.mjs, Export des Short Papers als PDF im Pflichtformat.
 *
 * Aufruf (aus beliebigem Verzeichnis):
 *   node inside-ai/paper/build-paper.mjs
 *
 * Pflichtformat (Aufgabenstellung):
 *   A4, max. 5 Seiten, 11 pt, doppelter Zeilenabstand (line-height 2.0),
 *   2,5 cm Rand auf allen Seiten.
 *
 * Warum dieser Weg: pandoc, LaTeX, WeasyPrint und wkhtmltopdf sind auf dem
 * Rechner nicht installiert und duerfen nicht global installiert werden.
 * Playwright + Chromium liegen im Arbeits-Repo unter inside-ai/app/node_modules
 * bzw. im Abgabepaket unter project/quellcode/node_modules und koennen ueber
 * page.pdf() seitengenau in A4 drucken. Der Markdown-Konverter
 * unten ist bewusst selbstgeschrieben (kein neues npm-Paket) und deckt genau
 * die im Paper vorkommenden Konstrukte ab, plus ein paar naheliegende Reserven
 * (Listen, Links, Trennlinien) fuer spaetere Textaenderungen.
 *
 * Bewusst NICHT unterstuetzt: _kursiv_ mit Unterstrichen. Im Quellenabschnitt
 * steht der Dateiname "model_cards_with_metadata"; eine Unterstrich-Regel wuerde
 * daraus stillschweigend Kursivtext machen und den Namen zerstoeren. Kursiv
 * laeuft ausschliesslich ueber *Sternchen*.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MD_PATH = path.join(SCRIPT_DIR, 'short-paper.md');
const PDF_PATH = path.join(SCRIPT_DIR, 'short-paper.pdf');
// Arbeits-Repo und Abgabepaket haben absichtlich verschiedene Ordnernamen.
// Der erste vorhandene package.json-Pfad ist der Require-Kontext fuer Playwright.
const APP_DIR_CANDIDATES = [
  path.resolve(SCRIPT_DIR, '..', 'app'),
  path.resolve(SCRIPT_DIR, '..', 'project', 'quellcode'),
];
const APP_DIR =
  APP_DIR_CANDIDATES.find((candidate) => fs.existsSync(path.join(candidate, 'package.json'))) ??
  APP_DIR_CANDIDATES[0];

const MAX_PAGES = 5;
const MARGIN_CM = '2.5cm';

// ---------------------------------------------------------------------------
// Markdown -> HTML
// ---------------------------------------------------------------------------

const escapeHtml = (raw) =>
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Inline-Auszeichnung eines bereits als Text erkannten Fragments.
 * Reihenfolge ist wichtig: Code-Spans werden zuerst herausgeschnitten, damit
 * Sternchen oder eckige Klammern innerhalb von `code` nicht interpretiert
 * werden. Erst danach wird escaped und formatiert.
 */
function renderInline(text) {
  const segments = [];
  const codeSpan = /`([^`\n]+)`/g;
  let cursor = 0;
  let match;

  while ((match = codeSpan.exec(text)) !== null) {
    if (match.index > cursor) {
      segments.push({ code: false, value: text.slice(cursor, match.index) });
    }
    segments.push({ code: true, value: match[1] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ code: false, value: text.slice(cursor) });
  }

  return segments
    .map((segment) => {
      const escaped = escapeHtml(segment.value);
      if (segment.code) return `<code>${escaped}</code>`;
      return (
        escaped
          // [Text](url) und [Text](url "Titel")
          .replace(
            /\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g,
            (_all, label, href) => `<a href="${href}">${label || href}</a>`,
          )
          // **fett** vor *kursiv*, sonst frisst die Kursiv-Regel die Sternchen
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      );
    })
    .join('');
}

/** Zerlegt eine Tabellenzeile "| a | b |" in ihre Zellen, respektiert \|. */
function splitTableRow(line) {
  const cells = [];
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '\\' && line[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (char === '|') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  // Die aeusseren Pipes erzeugen je ein leeres Randfeld, das faellt weg.
  if (cells.length && cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((cell) => cell.trim());
}

const isTableDelimiter = (line) =>
  /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());

function alignmentOf(spec) {
  const trimmed = spec.trim();
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const BLOCKQUOTE_RE = /^>\s?(.*)$/;

export function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out = [];

  // Optionales YAML-Frontmatter ueberspringen, damit ein "---" am Dateianfang
  // nicht faelschlich als Trennlinie landet.
  let i = 0;
  if (lines[0] !== undefined && lines[0].trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) i = end + 1;
  }

  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      flushParagraph();
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(trimmed);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (HR_RE.test(trimmed)) {
      flushParagraph();
      out.push('<hr />');
      i += 1;
      continue;
    }

    if (BLOCKQUOTE_RE.test(trimmed)) {
      flushParagraph();
      const quoted = [];
      while (i < lines.length && BLOCKQUOTE_RE.test(lines[i].trim())) {
        quoted.push(BLOCKQUOTE_RE.exec(lines[i].trim())[1].trim());
        i += 1;
      }
      const paragraphs = quoted
        .join('\n')
        .split(/\n\s*\n/)
        .map((block) => block.split('\n').join(' ').trim())
        .filter(Boolean)
        .map((block) => `<p>${renderInline(block)}</p>`)
        .join('');
      out.push(`<blockquote>${paragraphs}</blockquote>`);
      continue;
    }

    if (trimmed.startsWith('|') && isTableDelimiter(lines[i + 1] ?? '')) {
      flushParagraph();
      const header = splitTableRow(trimmed);
      const aligns = splitTableRow(lines[i + 1].trim()).map(alignmentOf);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push(splitTableRow(lines[i].trim()));
        i += 1;
      }
      const cell = (tag, value, index) => {
        const align = aligns[index] ?? 'left';
        return `<${tag} style="text-align:${align}">${renderInline(value)}</${tag}>`;
      };
      const head = `<tr>${header.map((v, n) => cell('th', v, n)).join('')}</tr>`;
      const rows = body
        .map((row) => `<tr>${row.map((v, n) => cell('td', v, n)).join('')}</tr>`)
        .join('');
      out.push(`<table><thead>${head}</thead><tbody>${rows}</tbody></table>`);
      continue;
    }

    if (UL_RE.test(line) || OL_RE.test(line)) {
      flushParagraph();
      const ordered = OL_RE.test(line);
      const pattern = ordered ? OL_RE : UL_RE;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(pattern.exec(lines[i])[1].trim());
        i += 1;
        // Fortsetzungszeilen (eingerueckt, kein neuer Listenpunkt) anhaengen.
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !pattern.test(lines[i]) &&
          !HEADING_RE.test(lines[i].trim()) &&
          !lines[i].trim().startsWith('|') &&
          !BLOCKQUOTE_RE.test(lines[i].trim())
        ) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i += 1;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      const rendered = items.map((item) => `<li>${renderInline(item)}</li>`).join('');
      out.push(`<${tag}>${rendered}</${tag}>`);
      continue;
    }

    paragraph.push(trimmed);
    i += 1;
  }

  flushParagraph();
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Print-CSS
// ---------------------------------------------------------------------------

/**
 * Schriftwahl: Serife (Times New Roman). Das Pflichtformat 11 pt / doppelter
 * Zeilenabstand / 2,5 cm Rand ist das klassische Manuskript-Layout, in dem eine
 * Serifenschrift die Konvention ist. Praktischer Nebeneffekt bei hartem
 * Seitenlimit: Times setzt bei gleicher Punktgroesse deutlich mehr Zeichen pro
 * Zeile als eine Grotesk.
 *
 * Zeilenabstand: 2.0 gilt fuer alle Textbestandteile einschliesslich Tabellen und
 * Literaturverzeichnis. Die Aufgabenstellung nennt keine Ausnahme; der Export
 * setzt die Vorgabe deshalb woertlich um.
 */
const TABLE_LINE_HEIGHT = 2;

const printCss = `
  @page {
    size: A4;
    margin: ${MARGIN_CM};
  }

  html {
    font-size: 11pt;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: "Times New Roman", "Liberation Serif", Georgia, serif;
    font-size: 11pt;
    line-height: 2;
    color: #000;
    background: #fff;
    text-align: justify;
    hyphens: auto;
    -webkit-hyphens: auto;
  }

  p {
    margin: 0 0 0.05em 0;
    orphans: 2;
    widows: 2;
  }

  h1, h2, h3, h4, h5, h6 {
    line-height: 2;
    font-weight: bold;
    text-align: left;
    hyphens: none;
    page-break-after: avoid;
    break-after: avoid;
  }

  /* Die 11-pt-Vorgabe gilt ohne Sonderformat-Ausnahme auch fuer Ueberschriften. */
  h1 { font-size: 11pt; margin: 0 0 0.05em 0; }
  h2 { font-size: 11pt; margin: 0.15em 0 0.05em 0; }
  h3 { font-size: 11pt; font-style: italic; font-weight: normal; margin: 0 0 0.05em 0; }
  h4, h5, h6 { font-size: 11pt; margin: 0.2em 0 0.05em 0; }

  blockquote {
    margin: 0.3em 0 0.5em 0;
    padding-left: 0.8em;
    border-left: 0.5pt solid #000;
    font-style: italic;
  }

  blockquote p { margin: 0; }

  ul, ol {
    margin: 0.2em 0 0.5em 0;
    padding-left: 1.6em;
  }

  li {
    line-height: 2;
    margin: 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.4em 0 0.6em 0;
    font-size: 11pt;
    line-height: ${TABLE_LINE_HEIGHT};
    text-align: left;
    hyphens: auto;
  }

  thead { display: table-header-group; }

  tr { page-break-inside: avoid; break-inside: avoid; }

  th, td {
    border: 0.5pt solid #000;
    padding: 2pt 4pt;
    vertical-align: top;
    text-align: left;
  }

  th { font-weight: bold; }

  code {
    font-family: "Courier New", monospace;
    font-size: 11pt;
  }

  /* Links schwarz und ohne Unterstreichung: im gedruckten Paper sind die
     Ziele Dateipfade bzw. Literaturangaben, blaue Weblinks waeren Chartjunk.
     Falls doch eine externe URL im Text steht, wird sie in Klammern sichtbar
     nachgestellt, damit der Druck nicht Information verliert. */
  a {
    color: #000;
    text-decoration: none;
  }

  a[href^="http"]::after {
    content: " (" attr(href) ")";
    font-size: 11pt;
    word-break: break-all;
  }

  hr {
    border: none;
    border-top: 0.5pt solid #000;
    margin: 0.6em 0;
  }
`;

export function buildHtml(bodyHtml) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Short Paper</title>
<style>${printCss}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Seitenzahl aus dem fertigen PDF lesen
// ---------------------------------------------------------------------------

/**
 * Zaehlt die Seiten im geschriebenen PDF. Primaerquelle ist /Count im
 * Seitenbaum-Wurzelknoten, Fallback sind die einzelnen /Type /Page Objekte.
 * Chromium (Skia) schreibt beide unkomprimiert, deshalb reicht eine
 * Textsuche ueber die Bytes. Gibt null zurueck, wenn beides fehlschlaegt,
 * dann wird nicht geraten sondern gemeldet.
 */
function countPdfPages(buffer) {
  const raw = buffer.toString('latin1');

  const pagesNodes = [...raw.matchAll(/\/Type\s*\/Pages\b[^]{0,400}?\/Count\s+(\d+)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (pagesNodes.length) return Math.max(...pagesNodes);

  const pageObjects = raw.match(/\/Type\s*\/Page(?![sA-Za-z])/g);
  if (pageObjects && pageObjects.length) return pageObjects.length;

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    console.error(`Fehler: ${MD_PATH} nicht gefunden.`);
    process.exit(2);
  }

  const markdown = fs.readFileSync(MD_PATH, 'utf8');
  const html = buildHtml(markdownToHtml(markdown));

  const keepHtml = process.argv.includes('--keep-html');
  const htmlPath = path.join(
    keepHtml ? SCRIPT_DIR : fs.mkdtempSync(path.join(os.tmpdir(), 'short-paper-')),
    'short-paper.html',
  );
  fs.writeFileSync(htmlPath, html, 'utf8');

  let chromium;
  try {
    const requireFromApp = createRequire(path.join(APP_DIR, 'package.json'));
    ({ chromium } = requireFromApp('playwright'));
  } catch (error) {
    console.error(
      `Fehler: playwright konnte nicht aus ${APP_DIR}/node_modules geladen werden.\n` +
        `Ursache: ${error.message}`,
    );
    process.exit(2);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: PDF_PATH,
      format: 'A4',
      printBackground: false,
      // Rand doppelt gesetzt: hier und in @page. Beide Werte sind identisch,
      // dadurch ergeben sich 2,5 cm, egal welche der beiden Angaben Chromium
      // im konkreten Build gewichtet.
      margin: { top: MARGIN_CM, right: MARGIN_CM, bottom: MARGIN_CM, left: MARGIN_CM },
    });
  } finally {
    await browser.close();
    if (!keepHtml) fs.rmSync(path.dirname(htmlPath), { recursive: true, force: true });
  }

  const pdfBuffer = fs.readFileSync(PDF_PATH);
  const pages = countPdfPages(pdfBuffer);

  console.log(`PDF geschrieben: ${PDF_PATH}`);
  console.log(`Format: A4, 11 pt, Zeilenabstand 2.0, Rand ${MARGIN_CM}`);
  console.log(`Groesse: ${(pdfBuffer.length / 1024).toFixed(1)} kB`);

  if (pages === null) {
    console.error('Fehler: Seitenzahl konnte nicht aus dem PDF gelesen werden.');
    process.exit(2);
  }

  console.log(`Seitenzahl: ${pages}`);

  if (pages > MAX_PAGES) {
    console.error(`PDF hat ${pages} Seiten, erlaubt sind ${MAX_PAGES}`);
    process.exit(1);
  }

  console.log(`OK: ${pages} von maximal ${MAX_PAGES} Seiten.`);
}

// Nur ausfuehren, wenn direkt gestartet. So kann die Datei auch importiert
// werden (z.B. fuer eine Platzanalyse), ohne dass der Export mitlaeuft.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
