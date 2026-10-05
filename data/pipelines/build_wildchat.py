#!/usr/bin/env python3
"""Baut aus WildChat-1M die App-Daten fuer Akt 4 (Wie die Welt mit KI redet) — Pipeline v2.

Pro Land: Sprachverteilung (exakt), Hauptnutzung + volle Themen-Verteilung (Heuristik v2 auf
Stichprobe), Top-Modelle, Monatsverlauf, Schnitt-Gespraechstiefe, Graubereich-Anteil (modPct)
und unzensierte Beispiel-Prompts inklusive gezielter Beispiele ueber der Moderationsschwelle.
Global: Sprachen, Monate, Gesamt, Top-Modell, Kategorien, Moderations-Block.

Neu ggue. v1 (schemaVersion 2):
  1) Graubereich-Metrik aus openai_moderation.category_scores (max ueber sexual/harassment/
     violence/hate/self-harm ueber ALLE Turns; Anteil > theta je Land = modPct). `flagged` ist
     im Public Set durchgaengig false und wird NICHT verwendet (nur als Limitation dokumentiert).
  2) Laender-Zentroide programmatisch aus world-110m.geo.json (LABEL_X/LABEL_Y, Index ueber
     NAME/NAME_LONG) + ALIAS-Dict + Stadtstaaten-Overrides. Schwelle n>=1500.
  3) Heuristik v2: bis zu 3 User-Turns (Cap 2000 Zeichen), Code-Fence-Check vor der len>1500-
     Regel, Sprach-Packs Russisch/Chinesisch, neue Kategorie 'Bild-Prompts'.

-> app/public/data/wildchat.json  (Lauf: inside-ai/.venv/bin/python daten/build_wildchat.py)
Beispieltexte werden nicht durch eine lokale Wortliste gefiltert. Der Quelldatensatz kann einzelne
Eintraege bereits redigiert enthalten; dieses Flag wird deshalb pro Beispiel mit ausgegeben.
"""
import json
import re
import sys
from collections import Counter

import duckdb

from layout import resolve_layout

LAYOUT = resolve_layout(__file__)
WC = f"read_parquet('{LAYOUT.raw}/hf/allenai__WildChat-1M/**/*.parquet')"
GEO = LAYOUT.app_data / "world-110m.geo.json"

# --- Graubereich-Metrik ------------------------------------------------------
# theta=0.25 ist der Startwert (in Caption + Paper ausgewiesen). Die 5 Dimensionen sind die
# aussagekraeftigen OpenAI-Moderations-Kategorien; je Gespraech zaehlt das Maximum ueber alle Turns.
THETA = 0.25
# DuckDB-Feldname -> Ausgabe-Schluessel. "self-harm" muss gequotet werden (Sonderzeichen).
MOD_DIMS = [("sexual", "sexual"), ("harassment", "harassment"), ("violence", "violence"),
            ("hate", "hate"), ('"self-harm"', "self-harm")]
COUNTRY_MIN = 1500  # Schwelle: ab so vielen Gespraechen bekommt ein Land einen Bubble (Coverage ~95 %).

# --- Laender-Zentroide programmatisch ----------------------------------------
# WildChat-Laendernamen, die NICHT direkt auf geo.json NAME/NAME_LONG matchen -> kanonischer Name.
ALIAS = {
    "Türkiye": "Turkey",
    "The Netherlands": "Netherlands",
    "DR Congo": "Democratic Republic of the Congo",
    "United States": "United States of America",
}
# Stadtstaaten fehlen im 110m-Datensatz (zu klein) -> manuelle (lat, lon)-Overrides.
CITY_STATE = {
    "Hong Kong": (22.30, 114.17),
    "Singapore": (1.35, 103.82),
    "Macao": (22.20, 113.55),
}


def load_centroid_index():
    """NAME/NAME_LONG -> (lat, lon) aus world-110m.geo.json (LABEL_Y/LABEL_X = Natural-Earth-Label-Anker)."""
    geo = json.loads(GEO.read_text())
    idx = {}
    for feat in geo["features"]:
        pr = feat["properties"]
        if pr.get("LABEL_X") is None or pr.get("LABEL_Y") is None:
            continue
        latlon = (round(pr["LABEL_Y"], 2), round(pr["LABEL_X"], 2))
        for key in ("NAME", "NAME_LONG"):
            nm = pr.get(key)
            if nm:
                idx.setdefault(nm, latlon)
    return idx


def centroid(name, idx):
    """Aufloesung mit Vorrang: Stadtstaat-Override > ALIAS > direkter NAME/NAME_LONG-Treffer."""
    if name in CITY_STATE:
        return CITY_STATE[name]
    alias = ALIAS.get(name)
    if alias and alias in idx:
        return idx[alias]
    return idx.get(name)


LANG_DE = {"English": "Englisch", "Russian": "Russisch", "Chinese": "Chinesisch", "German": "Deutsch",
           "French": "Französisch", "Japanese": "Japanisch", "Arabic": "Arabisch", "Spanish": "Spanisch",
           "Portuguese": "Portugiesisch", "Korean": "Koreanisch", "Italian": "Italienisch", "Polish": "Polnisch",
           "Turkish": "Türkisch", "Ukrainian": "Ukrainisch", "Vietnamese": "Vietnamesisch", "Indonesian": "Indonesisch",
           "Dutch": "Niederländisch", "Persian": "Persisch", "Thai": "Thai", "Hindi": "Hindi", "Nolang": "ohne"}

# --- Heuristik v2 ------------------------------------------------------------
# Reihenfolge in classify(): (b) Code-Fence/Code zuerst, dann Bild-Prompts, dann die len>1500->
# Rollenspiel-Regel, dann die Themen-Muster, zuletzt generische Frage/Anfrage. Sprach-Packs
# (c) Russisch/Chinesisch sind je Kategorie in die Regexe eingewoben.
CODE = re.compile(r"```|\b(python|javascript|java|c\+\+|c#|typescript|function|def |import |class |error|bug|code|html|css|react|sql|api|compile|debug|algorithm|terminal|git|код|программ|代码|编程|函数)\b", re.I)
# (d) Bild-Prompts: Stable-Diffusion-/Midjourney-Muster (Tag-Ketten, Qualitaets-Booster, Parameter).
IMG = re.compile(r"masterpiece|best quality|\b(8k|4k|uhd|ultra[- ]?detailed|highly detailed|photorealistic|octane render|unreal engine|trending on artstation|depth of field|hyper[- ]?realistic|cinematic lighting|volumetric lighting|negative prompt|full body|intricate details|realistic photo)\b|--ar |--v \d|::\d", re.I)
PATS = [
    ("Übersetzen", re.compile(r"\b(translate|translation)\b|übersetz|traduc|traduire|翻译|翻譯|переведи|переведите|terjemah", re.I)),
    ("Rollenspiel/Story", re.compile(r"\*[a-z][^*]{0,40}\*|\b(roleplay|role[- ]play|act as|pretend|you are (now |a )|you're a|in character|stay in character|continue the story|next chapter|respond as|narrator|fanfic|waifu|character|scenario)\b|ролев|отыгрыш|продолжи истори|角色扮演|扮演|继续故事", re.I)),
    ("Schreiben/Text", re.compile(r"\b(write|essay|email|e-mail|letter|poem|story|article|blog|paragraph|rewrite|summariz|summary|cover letter|script|caption|outline|draft|generate|create|make (me|a|an|up)|come up with|list of|name (some|a few|\d|ideas|for)|ideas for|brainstorm|design|develop|compose|give me a)\b|schreib|écris|напиши|сочини|статью|写|编写|生成|创作|取名|起名|设计|制定|列出|做一个", re.I)),
    ("Wissen/Erklären", re.compile(r"\b(what|who|why|how|when|where|which|explain|define|definition|difference between|tell me about|meaning of|is it|are there|do you know|can you|could you|list|describe|recommend|suggest|is there)\b|erklär|was ist|объясни|что тако|как |почему|сколько|解释|是什么|为什么|如何|怎么|请问|哪些|多少|介绍|描述", re.I)),
    ("Mathe/Logik", re.compile(r"\b(solve|calculate|equation|integral|derivative|probability|matrix|theorem|formula)\b|\d+\s*[\+\-\*/=]\s*\d|реши|вычисли|计算|求解", re.I)),
    ("Ratschlag", re.compile(r"\b(should i|how to deal|my (girlfriend|boyfriend|wife|husband|boss)|i feel|advice|tips for)\b|посоветуй|建议|怎么办", re.I)),
]
QMARK = re.compile(r"[?？]|请|帮我|给我")  # generische Frage/Anfrage -> Wissen/Erklären (letzter Rettungsanker)

# --- PII-Schutz für angezeigte Beispiel-Prompts -------------------------------------------
# WildChat ist zwar öffentlich und vorab redigiert, der Redaction-Pass des Datensatzes ist aber
# nachweislich unvollständig: in der Stichprobe standen Klartext-Mailadressen realer Personen.
# Wer Fremdinhalte anzeigt, redigiert selbst. Nur klar erkennbare Muster maskieren, damit der
# Prompt lesbar bleibt und die Kategorie-Zuordnung (classify) unverändert gilt.
RX_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b")
RX_URL = re.compile(r"https?://\S+")
RX_PHONE = re.compile(r"(?<!\d)(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})+(?!\d)")
RX_INTL_PHONE = re.compile(r"(?<!\w)\+\d{1,3}(?:[\s().-]*\d){7,14}(?!\w)")
RX_LONGNUM = re.compile(r"(?<!\d)\d{12,}(?!\d)")  # Karten-/Konto-/Session-artige Ziffernketten
RX_IPV4 = re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])")
RX_AUTH = re.compile(
    r"\b(authorization|proxy-authorization|blade-auth|x-api-key|api[-_ ]?key)\b"
    r"\s*[:=]\s*(?:\[[^\]\r\n]*\]|\"[^\"\r\n]*\"|'[^'\r\n]*'|[^,;\r\n]{1,200})",
    re.I,
)
RX_SECRET = re.compile(
    r"\b(password|passwd|pwd|access[_ -]?token|secret[_ -]?key|client[_ -]?secret)\b"
    r"\s*[:=]\s*(?:\[[^\]\r\n]*\]|\"[^\"\r\n]*\"|'[^'\r\n]*'|[^\s,;]+)",
    re.I,
)
RX_LOGIN = re.compile(
    r"\b(user(?:name)?|login)\b\s*[:=]\s*(?:\[[^\]\r\n]*\]|\"[^\"\r\n]*\"|'[^'\r\n]*'|[^\s,;]+)",
    re.I,
)
RX_REDACTION_TAIL = re.compile(r"(\[Zugang entfernt\])(?:\s+entfernt\])+")


def redact_pii(text: str) -> str:
    """Maskiert personenbezogene Muster in einem anzuzeigenden Prompt.

    URLs werden auf die Domain gekürzt (Tracking- und Session-IDs raus), Mailadressen,
    Telefonnummern und überlange Ziffernketten durch Platzhalter ersetzt.
    """
    if not text:
        return text
    out = RX_AUTH.sub(lambda m: f"{m.group(1)}: [Zugang entfernt]", text)
    out = RX_SECRET.sub(lambda m: f"{m.group(1)}: [Zugang entfernt]", out)
    out = RX_LOGIN.sub(lambda m: f"{m.group(1)}: [Zugang entfernt]", out)
    out = RX_EMAIL.sub("[E-Mail entfernt]", out)
    out = RX_URL.sub(lambda m: re.sub(r"^(https?://[^/]+).*$", r"\1/[...]", m.group(0)), out)
    out = RX_IPV4.sub("[IP-Adresse entfernt]", out)
    out = RX_INTL_PHONE.sub("[Nummer entfernt]", out)
    out = RX_PHONE.sub("[Nummer entfernt]", out)
    out = RX_LONGNUM.sub("[Nummer entfernt]", out)
    out = RX_REDACTION_TAIL.sub(r"\1", out)
    return out


def classify(c):
    if not c:
        return "Sonstiges"
    if CODE.search(c):
        return "Programmieren"
    if IMG.search(c):
        return "Bild-Prompts"
    if len(c) > 1500:
        return "Rollenspiel/Story"
    for name, pat in PATS:
        if pat.search(c):
            return name
    if QMARK.search(c):
        return "Wissen/Erklären"
    return "Sonstiges"


# Fuer details-on-demand werden je Heuristik-Kategorie bis zu zwei Beispiele gespeichert. Es gibt
# bewusst KEINE lokale Inhalts-Wortliste: explizite, gewaltbezogene oder anderweitig schwierige
# Prompts gehoeren zur Datenlage und werden im Interface mit Kontext statt Zensur gezeigt.
EXAMPLES_PER_CAT = 2
GRAY_EXAMPLES_PER_COUNTRY = 5

# Erste bis zu 3 User-Turns konkateniert, Cap 2000 Zeichen (Heuristik v2, Punkt a). Praedikat des
# Reservoir-Samplings bleibt unveraendert (conversation[1].content IS NOT NULL) -> gleicher Seed-Zug.
USER3 = ("substr(array_to_string(list_slice("
         "list_transform(list_filter(conversation, x -> x.role = 'user'), x -> x.content), 1, 3), ' '), 1, 2000)")


def short_model(m):
    return (m or "?").replace("gpt-", "GPT-").replace("-turbo", " turbo")[:24]


def main():
    con = duckdb.connect()
    idx = load_centroid_index()
    _run(con, idx)


def _run(con, idx):
    # Laender ab COUNTRY_MIN Gespraechen, nach Volumen. Zentroid programmatisch aufloesen.
    co_all = con.execute(
        f"SELECT country, count(*) n FROM {WC} WHERE country IS NOT NULL "
        f"GROUP BY 1 HAVING count(*) >= {COUNTRY_MIN} ORDER BY 2 DESC"
    ).fetchall()

    matched, unmatched = [], []
    for c, n in co_all:
        if centroid(c, idx) is not None:
            matched.append((c, n))
        else:
            unmatched.append((c, n))

    if unmatched:
        print("WARN: kein Zentroid fuer:", ", ".join(f"{c}(n={n})" for c, n in unmatched), file=sys.stderr)
    # Hard-Fail wenn ein Top-10-Land (nach Volumen) keinen Zentroid hat.
    top10 = {c for c, _ in co_all[:10]}
    missing_top = top10 - {c for c, _ in matched}
    if missing_top:
        sys.exit(f"HARD-FAIL: Top-10-Land ohne Zentroid: {missing_top}")

    co = matched
    rank_by = {c: i + 1 for i, (c, _) in enumerate(co)}

    # Globale Monatsliste (fuer den Per-Land-Verlauf in gleicher Reihenfolge)
    mo = con.execute(f"SELECT substr(CAST(timestamp AS VARCHAR),1,7) m, count(*) n FROM {WC} WHERE timestamp IS NOT NULL GROUP BY 1 ORDER BY 1").fetchall()
    month_list = [m for m, _ in mo]

    # Sprachverteilung je Land (exakt, Top 6)
    lang_rows = con.execute(f"""
      WITH t AS (SELECT country, language, count(*) n FROM {WC} WHERE country IS NOT NULL GROUP BY 1,2),
           r AS (SELECT *, row_number() OVER (PARTITION BY country ORDER BY n DESC) rn,
                        sum(n) OVER (PARTITION BY country) tot FROM t)
      SELECT country, language, n, tot FROM r WHERE rn <= 6""").fetchall()
    langs_by = {}
    for c, lang, n, tot in lang_rows:
        langs_by.setdefault(c, []).append({"l": LANG_DE.get(lang, lang), "pct": round(100 * n / tot)})

    # Top-Modelle je Land
    model_rows = con.execute(f"""SELECT country, model, n FROM (
        SELECT country, model, count(*) n, row_number() OVER (PARTITION BY country ORDER BY count(*) DESC) rn
        FROM {WC} WHERE country IS NOT NULL GROUP BY 1,2) WHERE rn <= 3""").fetchall()
    models_by = {}
    for c, m, n in model_rows:
        models_by.setdefault(c, []).append((m, n))

    # Monatsverlauf je Land
    trend_rows = con.execute(f"""SELECT country, substr(CAST(timestamp AS VARCHAR),1,7) m, count(*) n FROM {WC}
        WHERE country IS NOT NULL AND timestamp IS NOT NULL GROUP BY 1,2""").fetchall()
    trend_by = {}
    for c, m, n in trend_rows:
        trend_by.setdefault(c, {})[m] = n

    # Schnitt-Gespraechstiefe (Turns) je Land
    turn_by = {c: t for c, t in con.execute(f"SELECT country, avg(turn) FROM {WC} WHERE country IS NOT NULL GROUP BY 1").fetchall()}

    # --- Graubereich: max category_score je Gespraech (ueber alle Turns), Anteil > THETA -----------
    # Ein Scan: je Dimension list_max ueber die Turn-Liste, dann greatest() = Gespraechs-Score.
    # flagged bleibt ungenutzt (Public Set: durchgaengig false) -> siehe Limitation im Paper.
    dim_sql = ",\n    ".join(
        f"list_max(list_transform(openai_moderation, x -> x.category_scores.{fld})) AS {key.replace('-', '_')}"
        for fld, key in MOD_DIMS
    )
    score_cols = [key.replace("-", "_") for _, key in MOD_DIMS]
    mod_rows = con.execute(f"""
      WITH s AS (
        SELECT country,
        {dim_sql}
        FROM {WC} WHERE country IS NOT NULL AND openai_moderation IS NOT NULL
      )
      SELECT country, count(*) n,
        avg(CASE WHEN greatest({', '.join(score_cols)}) > {THETA} THEN 1 ELSE 0 END) modfrac,
        {', '.join(f'avg(CASE WHEN {sc} > {THETA} THEN 1 ELSE 0 END) f_{sc}' for sc in score_cols)}
      FROM s GROUP BY 1""").fetchall()
    # Spalten: country, n, modfrac, dann je Dimension der Anteil.
    mod_by = {}
    gN = 0
    g_mod = 0.0
    g_dim = {key: 0.0 for _, key in MOD_DIMS}
    for row in mod_rows:
        c, n, modfrac = row[0], row[1], row[2] or 0.0
        dim_fracs = {key: (row[3 + i] or 0.0) for i, (_, key) in enumerate(MOD_DIMS)}
        # modTop nur setzen, wenn der ANGEZEIGTE Anteil > 0 ist. Gegen dieselbe 1-Dezimal-Rundung
        # gaten wie modPct: sonst zeigt das Modal "0 % ... (v. a. <Dimension>)" bei einem Land, dessen
        # modfrac zwar > 0 ist, aber auf 0,0 % rundet (z. B. Nigeria) -> irrefuehrend (Ehrlichkeit).
        modpct = round(100 * modfrac, 1)
        mod_by[c] = {"modPct": modpct,
                     "modTop": max(dim_fracs, key=dim_fracs.get) if modpct > 0 else None}
        gN += n
        g_mod += modfrac * n
        for key, fr in dim_fracs.items():
            g_dim[key] += fr * n
    moderation = {
        "threshold": THETA,
        "globalPct": round(100 * g_mod / gN, 1) if gN else 0,
        "byDim": {k: round(100 * v / gN, 1) for k, v in g_dim.items()} if gN else {},
        "method": (f"max category_score über {{sexual,harassment,violence,hate,self-harm}} je Gespräch "
                   f"(alle Turns), Anteil > θ={THETA}. flagged ungenutzt (Public Set: durchgängig false)."),
    }

    # Unzensierte Beispiele oberhalb der analytischen Schwelle. Die Auswahl ist deterministisch:
    # pro Land die fuenf hoechsten eindeutigen Prompt-Scores, mit stabilem Hash-Tiebreaker. Das ist
    # KEIN Policy-Flag und keine repraesentative Stichprobe, sondern details-on-demand zur Metrik.
    score_expr = f"greatest({', '.join(score_cols)})"
    dim_case = "CASE " + " ".join(
        f"WHEN score = {key.replace('-', '_')} THEN '{key}'" for _, key in MOD_DIMS
    ) + " ELSE 'unbekannt' END"
    gray_rows = con.execute(f"""
      WITH base AS (
        SELECT country, {USER3} AS content, coalesce(redacted, false) AS source_redacted,
               {dim_sql}
        FROM {WC}
        WHERE country IS NOT NULL AND openai_moderation IS NOT NULL
          AND conversation[1].content IS NOT NULL
      ), scored AS (
        SELECT *, {score_expr} AS score FROM base
      ), labeled AS (
        SELECT *, {dim_case} AS dimension FROM scored
        WHERE score > {THETA} AND length(trim(content)) >= 25
      ), dedup AS (
        SELECT country, content, max(score) AS score,
               arg_max(dimension, score) AS dimension,
               bool_or(source_redacted) AS source_redacted
        FROM labeled GROUP BY country, content
      )
      SELECT country, content, score, dimension, source_redacted
      FROM dedup
      QUALIFY row_number() OVER (
        PARTITION BY country ORDER BY score DESC, hash(content)
      ) <= {GRAY_EXAMPLES_PER_COUNTRY}
      ORDER BY country, score DESC, hash(content)
    """).fetchall()
    gray_by = {}
    for c, content, score, dimension, source_redacted in gray_rows:
        text = redact_pii(" ".join((content or "").split()))
        gray_by.setdefault(c, []).append({
            "t": text,
            "cat": classify(text),
            "score": round(float(score), 3),
            "dim": dimension,
            "sourceRedacted": bool(source_redacted),
        })

    countries = []
    global_cats = Counter()
    for c, n in co:
        sample = con.execute(f"""SELECT {USER3}, coalesce(redacted, false) FROM {WC}
            WHERE country = ? AND conversation[1].content IS NOT NULL
            USING SAMPLE 6000 ROWS (reservoir, 7)""", [c]).fetchall()
        cats = Counter()
        examples = []
        examples_per_cat = Counter()
        for content, source_redacted in sample:
            cat = classify(content)
            cats[cat] += 1
            text = redact_pii(" ".join((content or "").split()))
            if len(text) >= 25 and examples_per_cat[cat] < EXAMPLES_PER_CAT:
                examples.append({
                    "t": text,
                    "cat": cat,
                    "sourceRedacted": bool(source_redacted),
                })
                examples_per_cat[cat] += 1
        global_cats.update(cats)
        ns = sum(cats.values()) or 1
        cat_list = [{"cat": k, "pct": round(100 * v / ns)} for k, v in cats.most_common()]
        top_use = next(((x["cat"], x["pct"]) for x in cat_list if x["cat"] != "Sonstiges"), ("gemischt", 0))
        lat, lon = centroid(c, idx)
        mod = mod_by.get(c, {"modPct": 0.0, "modTop": None})
        countries.append({
            "country": c, "n": n, "rank": rank_by[c], "lat": lat, "lon": lon,
            "langs": langs_by.get(c, []),
            "use": top_use[0], "usePct": top_use[1],
            "cats": cat_list,
            "modPct": mod["modPct"], "modTop": mod["modTop"],
            "samples": examples,
            "graySamples": gray_by.get(c, []),
            "models": [{"m": short_model(m), "pct": round(100 * mn / n)} for m, mn in models_by.get(c, [])],
            "trend": [trend_by.get(c, {}).get(m, 0) for m in month_list],
            "avgTurns": round(turn_by.get(c, 0), 1),
        })

    la = con.execute(f"SELECT language, count(*) n FROM {WC} GROUP BY 1 ORDER BY 2 DESC LIMIT 12").fetchall()
    total = con.execute(f"SELECT count(*) FROM {WC}").fetchone()[0]
    topmodel = con.execute(f"SELECT model, count(*) n FROM {WC} GROUP BY 1 ORDER BY 2 DESC LIMIT 1").fetchone()
    gtot = sum(global_cats.values()) or 1

    out = {
        "schemaVersion": 3,
        "countries": countries,
        "languages": [{"language": LANG_DE.get(lang, lang), "n": n} for lang, n in la],
        "months": [{"month": m, "n": n} for m, n in mo],
        "total": total,
        "topModel": topmodel[0],
        "coveredByCentroid": sum(c["n"] for c in countries),
        "globalCats": [{"cat": k, "pct": round(100 * v / gtot, 1)} for k, v in global_cats.most_common()],
        "moderation": moderation,
    }
    (LAYOUT.app_data / "wildchat.json").write_text(json.dumps(out))
    sonst = next((g["pct"] for g in out["globalCats"] if g["cat"] == "Sonstiges"), 0)
    print(f"wildchat.json: {len(countries)} Laender, {len(mo)} Monate, total {total}")
    print(f"  Coverage {100*out['coveredByCentroid']/total:.1f}% | Sonstiges {sonst}% | Graubereich global {moderation['globalPct']}% (θ={THETA})")
    print(f"  modPct-Spanne: {min(c['modPct'] for c in countries)}–{max(c['modPct'] for c in countries)}%")


if __name__ == "__main__":
    main()
