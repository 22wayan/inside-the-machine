#!/usr/bin/env python3
"""Baut die Daten fuer Akt 5 (Spot the Machine): kuratierte Echt-vs-KI-Bilder + HC3-Textpaare
(Mensch vs. ChatGPT) zu derselben, klar formulierten Frage - plus den VIDEO-BEFUND des Abschlusses
aus demselben Hugging-Face-Modellkarten-Zensus, aus dem Akt 3 gebaut ist.
-> app/public/data/spot/*.jpg + app/public/data/spot.json
Lauf: inside-ai/.venv/bin/python daten/build_spot.py
Bilder: app/public/data/spot/{ai,real}_*.jpg sind eine MANUELL gesichtete Auswahl aus
Parveshiiii/AI-vs-Real (HF, MIT) - echte Fotos vs. KI-Bilder, ~426-640px (statt CIFAKE-32x32);
auf Erkennbarkeit + Unbedenklichkeit geprueft. Dieses Skript listet sie nur (regeneriert sie nicht)."""
import json
import re

import duckdb

from layout import resolve_layout

LAYOUT = resolve_layout(__file__)
HC = f"read_parquet('{LAYOUT.raw}/hf/Hello-SimpleAI__HC3/all/**/*.parquet', union_by_name=true)"
# Derselbe Zensus wie build_familytree.py (Akt 3). Der Abschluss misst darin die Videogenerierung,
# damit er eine Fortsetzung der Story ist und kein angeklebter Kommentar.
MC = f"read_parquet('{LAYOUT.raw}/hf/librarian-bots__model_cards_with_metadata/**/*.parquet')"
VIDEO_TAGS = ("text-to-video", "image-to-video", "video-to-video", "image-text-to-video")
TOP_VIDEO = 6        # namentlich gezeigte Modelle (Konzentration: Top 4 tragen 58 % der Downloads)
BIAS_FACTORS = (1, 2, 3, 5)   # Sensitivitaetstest gegen den Recency-Bias des Dumps
BIAS_CUT = "2025-07"          # "alt" = vor diesem Monat erschienen
OUT = LAYOUT.app_data
(OUT / "spot").mkdir(parents=True, exist_ok=True)

# Sicherheits-Wortliste: Paare mit explizitem/heiklem Inhalt ausschliessen (Praesentation)
BLOCK = re.compile(r"\b(sex|sexual|porn|nsfw|nude|naked|penis|vagina|orgasm|masturbat|rape|suicide|kill myself|incest|genital|erotic|fetish)\b", re.I)

# --- r6-Kuration: gezielte Fragenauswahl statt Zufall ---------------------------------------
# Bevorzugt werden verstaendliche why/how/what-Alltagsfragen (ELI5-Forum), kurz und klar.
# Medizin-/Fachfragen (z. B. "chemotherapy") sind als Quiz-Einstieg ausgeschlossen: das Publikum
# soll die FRAGE sofort verstehen, damit nur die Mensch-vs-KI-Unterscheidung Arbeit macht.
AVOID = re.compile(
    r"\b(chemo\w*|cancer|tumou?r|diagnos\w*|disease|syndrome|medicat\w*|prescri\w*|"
    r"surg(?:ery|ical)|anesthe\w*|antibiot\w*|vaccin\w*|insulin|diabet\w*|hepatit\w*|cholesterol|"
    r"blood pressure|psychiatr\w*|schizophren\w*|seizure|autism|adhd|"
    r"mortgage|amortiz\w*|hedge fund|derivativ\w*|401\s?k|litigat\w*|attorney|felony|"
    r"quantum|theorem|voltage|enzyme|molecul\w*|isotope|polynomial)\b", re.I)
PREFER_Q = re.compile(r"^(why|how|what)\b", re.I)
QUIZ_TEXTS = 7  # Anzahl Textpaare im Quiz-Pool
CAND_ROWS = 4000  # genug Pool für bewusst passende, statt nur zufällige Fragen
# Themen, die für einen Visual-Analytics-Kurs einen natürlichen Anker liefern: Wahrnehmung,
# Karten, Farbe, Bildschirme, Licht und Messung. Das Quiz bleibt HC3-basiert, bekommt aber eine
# Sprache, die den Kurskontext aufnimmt statt Katzen-/Haustier-Trivia zu wiederholen.
COURSE_CONTEXT = re.compile(r"\b(map|maps|greenland|colour|color|screen|display|visual|graph|chart|diagram|axis)\b", re.I)
COURSE_AVOID = re.compile(r"\b(trademark|Hershey)\b", re.I)


def eli5_score(cq, src):
    """Kurations-Score: hoeher = besserer Quiz-Einstieg (Alltagsfrage, klar, kurz)."""
    s = 0
    if src == "reddit_eli5":
        s += 2  # Alltagsfragen-Forum zuerst
    if PREFER_Q.match(cq):
        s += 2  # why/how/what liest sich sofort als Frage
    if len(cq) <= 90:
        s += 1  # kurz = auf einen Blick erfassbar
    if COURSE_CONTEXT.search(cq):
        s += 7  # Kurspassung vor allgemeiner Alltagstrivia
    return s


def avg_sentence_len(s):
    sents = [x for x in re.split(r"[.!?]+", s) if x.strip()]
    return len(s) / max(len(sents), 1)


def text_difficulty(h, g):
    """Schwierigkeit 1-3 (1=leicht, 3=schwer): je aehnlicher Laenge und Satzrhythmus der beiden
    Antworten, desto schwerer ist Mensch von Maschine zu trennen (der Laengen-Tell faellt weg)."""
    len_sim = min(len(h), len(g)) / max(len(h), len(g))
    style_sim = min(avg_sentence_len(h), avg_sentence_len(g)) / max(avg_sentence_len(h), avg_sentence_len(g))
    sim = (len_sim + style_sim) / 2
    if sim >= 0.78:
        return 3
    if sim >= 0.55:
        return 2
    return 1


# Finale Bild-Kuration: keine Cartoon-/Pixel-Art und keine auffälligen Tierporträts. Die drei
# synthetischen Motive sind absichtlich unspektakuläre Hochschul-/Alltagsszenen; sie wurden nach
# Sichtprüfung auf plausible Optik ausgewählt. Die echten Bilder sind in der öffentlichen Fassung
# drei CC0-Fotos von Wikimedia Commons mit denselben Motiven (Café, Bibliothek, Bahnsteig); die
# abgegebene Fassung nutzte Fotos aus AI-vs-Real, deren Herkunft nicht belegt ist. Damit testet das Quiz nicht Stil,
# sondern die tatsächlich schwierige Grenzziehung Foto vs. synthetisches Foto.
CURATED_IMAGES = [
    {"file": "spot/ai_library_v2.png", "isAI": True, "difficulty": 3},
    {"file": "spot/ai_platform_v2.png", "isAI": True, "difficulty": 3},
    {"file": "spot/ai_cafeteria_v2.png", "isAI": True, "difficulty": 3},
    {"file": "spot/real_cafe.jpg", "isAI": False, "difficulty": 3},
    {"file": "spot/real_library.jpg", "isAI": False, "difficulty": 3},
    {"file": "spot/real_platform.jpg", "isAI": False, "difficulty": 3},
]

con = duckdb.connect()

# Bilder: explizite handverlesene Auswahl statt alle Dateien des Ordners zu übernehmen.
images = CURATED_IMAGES


def detok(s):
    # HC3 ist tokenisiert (Leerzeichen vor Satzzeichen, um Slashes, vor Kontraktionen) -> normalisieren
    s = re.sub(r"\s+([.,;:!?%])", r"\1", s)
    s = re.sub(r"\s+([')\]])", r"\1", s)
    s = re.sub(r"([(\[])\s+", r"\1", s)
    s = re.sub(r"\s+(n't|'re|'ve|'ll|'d|'s|'m)\b", r"\1", s)
    s = re.sub(r"\s*/\s*", "/", s)
    return s


def clean(s):
    s = re.sub(r"URL_\d+", "", s or "")
    s = re.sub(r"\[\s*(this|here|link|removed|deleted)\s*\]", "", s, flags=re.I)
    # Reddit-Markdown-Links, deren Ziel gerade als URL_n entfernt wurde: aus "[Chromism](URL_0)"
    # wird sonst "[Chromism] ()" - ein sichtbares Rohdaten-Artefakt im Finale. Der Linktext ist
    # inhaltlich Teil des Satzes und bleibt deshalb als reiner Text stehen.
    s = re.sub(r"\[([^\[\]]*)\]\s*\(\s*\)", r"\1", s)
    s = re.sub(r"\(\s*\)", "", s)  # leere Klammerpaare ohne Linktext
    s = re.sub(r"\[\s*\]", "", s)  # leere eckige Klammern ohne Linktext
    s = re.sub(r"&gt;|&lt;|&amp;", " ", s)
    s = re.sub(r"\bhuhe\b", "huge", s, flags=re.I)  # offensichtlicher Tippfehler im Quellpost
    return detok(" ".join(s.split()))


def core_question(q):
    q = clean(q)
    m = re.search(r"^(.{15,150}?\?)", q)  # Kernfrage bis zum ersten Fragezeichen
    if m:
        return m.group(1).strip()
    return (q[:120].rsplit(" ", 1)[0] + " …") if len(q) > 120 else q


def trim(s, n=480):
    s = clean(s)
    return s if len(s) <= n else s[:n].rsplit(" ", 1)[0] + " …"


# Erst FILTERN (Subquery), dann samplen -> sonst greift USING SAMPLE vor dem WHERE.
# Grosser deterministischer Kandidaten-Pool; die eigentliche Auswahl ist kuratiert (Score).
raw = con.execute(f"""
  SELECT question, human_answers[1] AS h, chatgpt_answers[1] AS g, source FROM (
    SELECT * FROM {HC}
    WHERE source IN ('reddit_eli5', 'open_qa')
      AND human_answers[1] IS NOT NULL AND chatgpt_answers[1] IS NOT NULL
      AND length(question) BETWEEN 30 AND 200
      AND length(human_answers[1]) BETWEEN 220 AND 640
      AND length(chatgpt_answers[1]) BETWEEN 220 AND 760
  ) USING SAMPLE {CAND_ROWS} ROWS (reservoir, 11)""").fetchall()

SRC_LABEL = {"reddit_eli5": "Alltagsfrage (ELI5-Forum)", "open_qa": "Wissensfrage"}
candidates = []
for q, h, g, src in raw:
    cq = core_question(q)
    if not cq.endswith("?") or len(cq) < 18:
        continue
    if BLOCK.search(q) or BLOCK.search(h) or BLOCK.search(g):
        continue
    if AVOID.search(cq):  # Fach-/Medizinfrage: kein Quiz-Einstieg
        continue
    if COURSE_AVOID.search(cq):
        continue
    candidates.append((eli5_score(cq, src), cq, h, g, src))

# Beste Kandidaten zuerst (stabil: bei Score-Gleichstand bleibt die Sample-Reihenfolge)
candidates.sort(key=lambda c: -c[0])
texts = []
seen = set()
for _score, cq, h, g, src in candidates:
    key = cq.lower()[:40]
    if key in seen:
        continue
    seen.add(key)
    texts.append({"q": cq, "human": trim(h), "ai": trim(g),
                  "source": SRC_LABEL.get(src, src), "difficulty": text_difficulty(trim(h), trim(g))})
    if len(texts) >= QUIZ_TEXTS:
        break

# Aufsteigend nach Schwierigkeit: das Quiz beginnt leicht und endet schwer
texts.sort(key=lambda t: t["difficulty"])

# --- Abschluss-Befund: Videogenerierung im HF-Zensus -----------------------------------------
# WARUM QUERSCHNITT UND KEINE ZEITREIHE: der Dump ist ein Fenster-Snapshot, kein Zensus der
# HF-Geschichte. Aus 2022-2024 enthaelt er nur wenige Tausend Modelle, aus 2025/26 aber ueber
# 600.000 - "neue Modelle je Monat" waere daraus zu 60-fach Erfassung statt Wachstum (Lie Factor).
# Belastbar ist stattdessen, WO die heutige NUTZUNG sitzt: Downloads sind Lebenszeit-Zaehler der
# im Snapshot vorhandenen Modelle, und die 20 meistgeladenen (86 % aller Video-Downloads) sind
# alle vorhanden, auch die alten von 2023. Deshalb: Download-Masse nach Erscheinungsmonat, plus
# ein Sensitivitaetstest, der die alten Modelle absichtlich hochrechnet.

def build_video():
    tags = "', '".join(VIDEO_TAGS)
    where = f"pipeline_tag IN ('{tags}')"
    as_of, n_all, n_tagged = con.execute(
        f"SELECT max(createdAt), count(*), count(pipeline_tag) FROM {MC}").fetchone()

    # Erfassungsbruch selbst messen, statt ihn zu behaupten
    cov = dict(con.execute(f"""
        SELECT CASE WHEN createdAt < '2025-01' THEN 'alt' ELSE 'neu' END k, count(*)
        FROM {MC} GROUP BY 1""").fetchall())

    raw = {m: (n, int(dl or 0)) for m, n, dl in con.execute(f"""
        SELECT strftime(CAST(createdAt AS TIMESTAMP), '%Y-%m') m, count(*), sum(downloads)
        FROM {MC} WHERE {where} GROUP BY 1""").fetchall()}
    # LUECKENLOSE Achse: Monate ohne ein einziges Video-Modell muessen als Luecke sichtbar sein,
    # sonst staucht die Grafik die stillen Monate weg und behauptet gleichmaessige Abstaende.
    def month_range(a, b):
        y, mo = int(a[:4]), int(a[5:7])
        while f"{y:04d}-{mo:02d}" <= b:
            yield f"{y:04d}-{mo:02d}"
            mo += 1
            if mo > 12:
                y, mo = y + 1, 1
    months = [{"m": m, "n": raw.get(m, (0, 0))[0], "dl": raw.get(m, (0, 0))[1]}
              for m in month_range(min(raw), max(raw))]
    by_tag = [{"tag": t, "n": n, "dl": int(dl or 0)} for t, n, dl in con.execute(f"""
        SELECT pipeline_tag, count(*), sum(downloads)
        FROM {MC} WHERE {where} GROUP BY 1 ORDER BY 2 DESC""").fetchall()]
    ranked = [(mid, int(dl or 0), m, tag) for mid, dl, m, tag in con.execute(f"""
        SELECT modelId, downloads, strftime(CAST(createdAt AS TIMESTAMP), '%Y-%m'), pipeline_tag
        FROM {MC} WHERE {where} ORDER BY downloads DESC, modelId""").fetchall()]

    n_vid = sum(x["n"] for x in months)
    dl_vid = sum(x["dl"] for x in months)
    assert n_vid == len(ranked), f"Modellzahl inkonsistent: {n_vid} vs {len(ranked)}"

    def age_buckets(rows, stamp):
        """Download-Masse nach ALTER am Datenstand, in drei Klassen."""
        ay, am = int(stamp[:4]), int(stamp[5:7])
        def age(m):
            y, mo = int(m[:4]), int(m[5:7])
            return (ay - y) * 12 + (am - mo)
        total = sum(r["dl"] for r in rows) or 1
        klassen = [("bis 6 Monate", 0, 6), ("7 bis 12 Monate", 7, 12), ("älter", 13, 10**6)]
        out = []
        for name, lo, hi in klassen:
            dl = sum(r["dl"] for r in rows if lo <= age(r["m"]) <= hi)
            n = sum(r["n"] for r in rows if lo <= age(r["m"]) <= hi)
            out.append({"label": name, "dl": dl, "n": n, "pct": round(100 * dl / total, 1)})
        return out

    def weighted_median(items):
        """Erscheinungsmonat, an dem die halbe Download-Masse erreicht ist."""
        total = sum(dl for _m, dl in items)
        if total <= 0:
            return None
        run = 0
        for m, dl in sorted(items):
            run += dl
            if run * 2 >= total:
                return m
        return None

    half = weighted_median([(x["m"], x["dl"]) for x in months])
    # Sensitivitaet: alte Modelle absichtlich hochskalieren, als waeren sie zu duenn erfasst
    sens = [{"f": f, "m": weighted_median(
        [(m, dl * (f if m < BIAS_CUT else 1)) for _i, dl, m, _t in ranked])} for f in BIAS_FACTORS]
    # Stabilitaet ueber die Download-Rangliste: haengt der Median an einem einzelnen Modell?
    stab = []
    for k in (10, 20, 50, 100):
        if k <= len(ranked):
            sub = ranked[:k]
            stab.append({"k": k, "m": weighted_median([(m, dl) for _i, dl, m, _t in sub]),
                         "pct": round(100 * sum(dl for _i, dl, _m, _t in sub) / dl_vid, 1)})

    top4 = round(100 * sum(dl for _i, dl, _m, _t in ranked[:4]) / dl_vid, 1)
    # Die vier Monate mit der groessten Download-Masse: darauf sitzt die Nutzung
    peak = sorted(months, key=lambda x: -x["dl"])[:4]
    peak_pct = round(100 * sum(p["dl"] for p in peak) / dl_vid, 1)

    return {
        "asOf": as_of[:10],
        "modelsTotal": n_all,
        "modelsTagged": n_tagged,
        "n": n_vid,
        "dl": dl_vid,
        "pctOfTagged": round(100 * n_vid / n_tagged, 2),
        "byTag": by_tag,
        "months": months,
        "top": [{"id": i, "dl": dl, "m": m, "tag": t} for i, dl, m, t in ranked[:TOP_VIDEO]],
        "top4Pct": top4,
        "halfMonth": half,
        "halfSensitivity": sens,
        "halfStability": stab,
        "biasCut": BIAS_CUT,   # damit die Bildunterschrift den Schnitt nicht hartcodieren muss
        # ALTER STATT ERSCHEINUNGSMONAT. Ein Erscheinungsmonat ist fuer den Leser eine abstrakte
        # Groesse ("2026-03" sagt nichts); "hoechstens ein halbes Jahr alt" ist die Frage, die er
        # wirklich hat. Dieselben Downloads, nur die x-Achse gewechselt.
        "ageBuckets": age_buckets(months, as_of),
        "peakMonths": [p["m"] for p in peak],
        "peakPct": peak_pct,
        "coverage": {"before2025": cov.get("alt", 0), "from2025": cov.get("neu", 0)},
    }


video = build_video()

# Tell-Statistik (echt, aus dem vollen HC3): mittlere Antwortlaenge
tell = con.execute(f"SELECT round(avg(length(human_answers[1]))), round(avg(length(chatgpt_answers[1]))) FROM {HC}").fetchone()

out = {"images": images, "texts": texts, "tell": {"human": int(tell[0]), "ai": int(tell[1])},
       "video": video}
(OUT / "spot.json").write_text(json.dumps(out, ensure_ascii=False))
print(f"spot.json: {len(images)} Bilder, {len(texts)} Textpaare | Tell human {tell[0]} vs ai {tell[1]} Zeichen")
print("  Bilder:", ", ".join(f"{i['file'].split('/')[-1]}=D{i['difficulty']}" for i in images))
for t in texts:
    print(f"  [D{t['difficulty']}] [{t['source']}] {t['q']}")
print(f"  Video (Stand {video['asOf']}): {video['n']} von {video['modelsTotal']} Modellen, "
      f"{video['dl']} Downloads; halbe Masse ab {video['halfMonth']}, "
      f"Sensitivitaet {', '.join(f'x{s["f"]}->{s["m"]}' for s in video['halfSensitivity'])}")
print(f"  Erfassungsbruch des Dumps: {video['coverage']['before2025']} Modelle vor 2025, "
      f"{video['coverage']['from2025']} ab 2025 -> keine Zeitreihe zulaessig")
