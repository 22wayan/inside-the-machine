#!/usr/bin/env python3
"""Baut Akt 2 (Map of AI Research): den VOLLEN KI-Bestand 2007-2021 (arXiv-Snapshot) plus den per
OAI-PMH geharvesteten VOLLBESTAND 2022-2026 (daten-raw/arxiv_oai_2022plus.jsonl, siehe
fetch_arxiv_oai.py; ersetzt die fruehere ~220er-API-Stichprobe je Feld/Jahr -> Datenluecke zu) ->
TF-IDF -> 2D (LSA/SVD), gefaerbt nach Hauptkategorie, mit Jahr fuer den Zeit-Scrub. Arrays-JSON.

Zusaetzlich: Top-Paper je Feld (meistzitiert laut OpenAlex, daten-raw/openalex_top.json, siehe
fetch_top_papers.py), gegen den eigenen Korpus gematcht (arXiv-ID) -> Titel/Jahr/Kategorie kommen
aus den arXiv-Daten (OpenAlex-Titel sind teils korrupt), Zitationszahl aus OpenAlex, plus die
Karten-Koordinaten des Papers fuer die Markierung beim Klick.

Volumen-Schutz: liegt der Gesamtbestand ueber TARGET_MAX, wird mit EINER einheitlichen Rate
deterministisch ausgeduennt (jeder k-te Punkt je (Jahr, Feld)-Gruppe) -> Proportionen bleiben
exakt erhalten; k steht als sampleK im JSON und die App legt es in der Caption offen.

-> app/public/data/map.json   Lauf: inside-ai/.venv/bin/python daten/build_map.py"""
import collections
import json

import duckdb
import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer

from layout import resolve_layout

LAYOUT = resolve_layout(__file__)
AX = f"read_parquet('{LAYOUT.raw}/hf/gfissore__arxiv-abstracts-2021/**/*.parquet')"
CATS = ["cs.LG", "cs.CV", "cs.CL", "cs.AI", "cs.NE", "stat.ML", "cs.RO", "cs.IR"]
# Kategoriale Palette (Observatorium, Brewer-orientiert/CVD-bewusst) - synchron mit app/src/theme.js CAT
CAT_COLORS = ["#4477aa", "#228833", "#ccbb44", "#aa3377", "#ee99aa", "#999933", "#66ccee", "#bbbbbb"]
TARGET_MAX = 480_000  # Obergrenze der gerenderten Punkte (JSON-Groesse + Canvas-Brush-Frame-Budget)
TOP_PER_CAT = 8  # Top-Paper je Feld im Klick-Panel

con = duckdb.connect()
# KONSISTENZ-KRITERIUM ueber beide Quellen: die PRIMAER-Kategorie muss eine der 8 sein (wie im
# OAI-Harvest 2022+). Ein reiner Crosslist-Match (primary z.B. eess.IV) zaehlte frueher mit und
# erzeugte einen kuenstlichen 2021->2022-Knick in der Jahres-Leiste; jetzt ist die Zeitreihe
# methodisch homogen ("KI-Paper" = primary in den 8 Feldern).
cat_list = ", ".join(f"'{c}'" for c in CATS)
rows = con.execute(f"""
  SELECT id, title, abstract, split_part(categories[1], ' ', 1) AS cat, CAST('20' || substr(id, 1, 2) AS INT) AS yr
  FROM {AX}
  WHERE regexp_matches(id, '^[0-9]{{4}}\\.') AND split_part(categories[1], ' ', 1) IN ({cat_list})
    AND abstract IS NOT NULL AND length(abstract) > 80
""").fetchall()
ids = [r[0] for r in rows]
titles = [" ".join((r[1] or "").split()) for r in rows]
abstracts = [r[2] for r in rows]
cats = [r[3] for r in rows]
years = [r[4] for r in rows]
print(f"{len(abstracts)} Abstracts aus Bestand 2007-2021 geladen (Vollbestand, kein Sampling)")

# Vollbestand 2022-2026 aus dem OAI-Harvest dazu (Primaer-Kategorie, Abstract, Titel).
# WICHTIG (an der Live-API verifiziert): das OAI-Feld <created> springt bei Versions-Updates auf
# das Datum der neuen Version (Beispiel 2112.10752: Submission 2021-12, created meldet 2022-04).
# Das Submissionsjahr wird deshalb deterministisch aus dem ID-Praefix (YYMM) abgeleitet, exakt wie
# im 2007-2021-Bestand -> homogene Zeitreihe, immun gegen Update-Rauschen. Records mit ID-Jahr
# < 2022 sind alte Submissions (Update/Umkategorisierung nach 2022) und gehoeren nicht in den Zuwachs.
oai_path = LAYOUT.raw / "arxiv_oai_2022plus.jsonl"
if oai_path.exists():
    n0 = len(abstracts)
    seen = set(ids)
    skipped_old = 0
    for line in oai_path.open():
        try:
            r = json.loads(line)
        except Exception:  # noqa: BLE001
            continue
        rid = r["id"]
        if rid in seen or len(rid) < 5 or not rid[:4].isdigit():
            continue
        id_yr = 2000 + int(rid[:2])
        if id_yr < 2022:
            skipped_old += 1
            continue
        seen.add(rid)
        ids.append(rid)
        titles.append(r.get("title") or "")
        abstracts.append(r["abstract"])
        cats.append(r["cat"])
        years.append(id_yr)
    print(f"+{len(abstracts) - n0} Paper 2022+ aus OAI-Vollbestand (Jahr aus ID-Praefix; {skipped_old} aeltere Submissions mit Update-created uebersprungen); gesamt {len(abstracts)}")
else:
    print("WARN: daten-raw/arxiv_oai_2022plus.jsonl fehlt -> nur Bestand bis 2021 (fetch_arxiv_oai.py laufen lassen)")

# Volumen-Schutz: EINE einheitliche Rate k ueber alle (Jahr, Feld)-Gruppen -> Proportionen exakt.
sample_k = 1
if len(abstracts) > TARGET_MAX:
    sample_k = int(np.ceil(len(abstracts) / TARGET_MAX))
    keep = []
    counters: dict[tuple, int] = collections.defaultdict(int)
    for i in range(len(abstracts)):
        g = (years[i], cats[i])
        if counters[g] % sample_k == 0:
            keep.append(i)
        counters[g] += 1
    ids = [ids[i] for i in keep]
    titles = [titles[i] for i in keep]
    abstracts = [abstracts[i] for i in keep]
    cats = [cats[i] for i in keep]
    years = [years[i] for i in keep]
    print(f"Volumen-Schutz: jeder {sample_k}. Punkt je (Jahr, Feld) -> {len(abstracts)} Punkte (Proportionen exakt)")
print("TF-IDF ...")

tfidf = TfidfVectorizer(max_features=20000, stop_words="english", min_df=5, max_df=0.5)
X = tfidf.fit_transform(abstracts)
print("TF-IDF:", X.shape, "-> SVD(2) ...")
coords = TruncatedSVD(n_components=2, random_state=42).fit_transform(X)

# Kategorie-verankertes Layout: jedes Feld bekommt einen Anker (Konstellation im Kreis),
# die lokale SVD-Struktur bleibt innerhalb des Kontinents erhalten -> klare, benennbare Inseln.
cat_idx = {c: i for i, c in enumerate(CATS)}
ci = np.array([cat_idx.get(c, len(CATS)) for c in cats])  # len = "andere"
n_main = len(CATS)
center = np.array([0.5, 0.5])
anchors = {}
for i in range(n_main):
    ang = 2 * np.pi * i / n_main - np.pi / 2
    anchors[i] = center + np.array([np.cos(ang) * 0.36, np.sin(ang) * 0.36])
anchors[n_main] = center  # "andere" diffus in der Mitte/Hintergrund
pos = np.zeros((len(cats), 2))
for k in range(n_main + 1):
    m = ci == k
    if not m.any():
        continue
    sub = coords[m]
    sub = (sub - sub.mean(0)) / (sub.std(0).mean() + 1e-9)  # standardisieren -> lokale Form
    spread = 0.135 if k < n_main else 0.42
    pos[m] = anchors[k] + sub * spread
pos = np.clip(pos, 0.015, 0.985)
xs = (pos[:, 0] * 1000).round().astype(int).tolist()
ys = (pos[:, 1] * 1000).round().astype(int).tolist()
ci = ci.tolist()

# Top-Paper je Feld: OpenAlex-Kandidaten gegen den Korpus matchen (arXiv-ID). Titel/Jahr/Feld aus
# dem Korpus (arXiv), Zitationen aus OpenAlex; Koordinaten fuer die Markierung auf der Karte.
top_out = []
top_path = LAYOUT.raw / "openalex_top.json"
if top_path.exists():
    cands = json.loads(top_path.read_text())
    idx_by_id = {aid: i for i, aid in enumerate(ids)}
    per_cat: dict[int, list] = collections.defaultdict(list)
    for cand in sorted(cands, key=lambda x: -x["citations"]):
        i = idx_by_id.get(cand["arxivId"])
        if i is None:
            continue
        k = ci[i]
        if k >= n_main or len(per_cat[k]) >= TOP_PER_CAT:
            continue
        per_cat[k].append({
            "c": k,
            "t": titles[i] or cand["title"],
            "y": years[i],
            "cit": cand["citations"],
            "id": ids[i],
            # r3a: klickbarer arXiv-Link im Panel; aus der Korpus-ID abgeleitet (identisch mit
            # cand["url"], aber unabhaengig davon, ob der OpenAlex-Cache das Feld schon traegt).
            "url": f"https://arxiv.org/abs/{ids[i]}",
            "x": xs[i],
            "yy": ys[i],
        })
    top_out = [p for k in sorted(per_cat) for p in per_cat[k]]
    print(f"Top-Paper gematcht: {len(top_out)} ({ {CATS[k]: len(v) for k, v in sorted(per_cat.items())} })")
else:
    print("WARN: daten-raw/openalex_top.json fehlt -> kein Top-Paper-Panel (fetch_top_papers.py laufen lassen)")

# r3b: Top-Paper PRO JAHR (Feld -> Jahr -> Liste{title, year, citations, url}). Kandidaten aus dem
# Per-Jahr-Cache (fetch_top_papers.py), gegen den Korpus gematcht wie oben; Feld = Primaer-Kategorie
# aus dem Korpus, Jahr = Korpus-Jahr (ID-Praefix) -> konsistent mit dem Jahres-Scrub der Karte,
# immun gegen OpenAlex-publication_year-Drift (v1-Submission vs. Verlagsjahr).
TOP_PER_CAT_YEAR = 3
top_by_year: dict[str, dict[str, list]] = {}
by_year_path = LAYOUT.raw / "openalex_top_by_year.json"
if by_year_path.exists():
    idx_by_id = {aid: i for i, aid in enumerate(ids)}
    seen_y: set[str] = set()
    n_y = 0
    for cands_y in json.loads(by_year_path.read_text()).values():
        for cand in cands_y:
            i = idx_by_id.get(cand["arxivId"])
            if i is None or cand["arxivId"] in seen_y:
                continue
            k = ci[i]
            if k >= n_main:
                continue
            seen_y.add(cand["arxivId"])
            top_by_year.setdefault(CATS[k], {}).setdefault(str(years[i]), []).append({
                "title": titles[i] or cand["title"],
                "year": years[i],
                "citations": cand["citations"],
                "url": f"https://arxiv.org/abs/{ids[i]}",
            })
            n_y += 1
    for by_yr in top_by_year.values():  # je Feld/Jahr: nach Zitationen sortieren, Top-N behalten
        for y in by_yr:
            by_yr[y] = sorted(by_yr[y], key=lambda p: -p["citations"])[:TOP_PER_CAT_YEAR]
    print(f"Top-Paper pro Jahr: {n_y} Matches, {len(top_by_year)} Felder")
else:
    print("WARN: daten-raw/openalex_top_by_year.json fehlt -> kein Jahres-Panel (fetch_top_papers.py laufen lassen)")

out = {
    "x": xs, "y": ys, "c": ci, "yr": years,
    "cats": [{"cat": c, "color": CAT_COLORS[i]} for i, c in enumerate(CATS)] + [{"cat": "andere", "color": "#5b5b6e"}],
    "yearRange": [min(years), max(years)],
    "n": len(xs),
    "sampleK": sample_k,
    "top": top_out,
    "topPapersByYear": top_by_year,
}
(LAYOUT.app_data / "map.json").write_text(json.dumps(out))
print(f"map.json: {len(xs)} Punkte, Jahre {out['yearRange']}, sampleK {sample_k}, top {len(top_out)}")
print("Kategorien:", collections.Counter(cats).most_common(9))
