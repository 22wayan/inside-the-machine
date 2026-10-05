#!/usr/bin/env python3
"""Validiert Heuristik v2 (classify() in build_wildchat.py) gegen eine LLM-Annotation
auf einer stratifizierten Real-Data-Stichprobe. Algorithm-Level-Validierung im Sinne
des Nested Model (Munzner 2009) — siehe TASK_SPEC.md Punkt 4.

Modi:
  --make-sample  zieht eine stratifizierte Stichprobe (~400 Convos, seed 11) aus den
                 echten WildChat-Parquets, schliesst BLOCK-Treffer aus und schreibt
                 die Klartext-Stichprobe nach daten/validation/sample.local.jsonl
                 (gitignored) sowie Aggregat-Metadaten nach sample-meta.json (committbar).
  --score        liest sample.local.jsonl (Heuristik-Kategorie je id) und labels.json
                 (LLM-Annotator-Kategorie je id), rechnet Konfusionsmatrix, Precision/
                 Recall/F1 je Kategorie, Macro-F1 und Cohen's Kappa, und schreibt NUR
                 Aggregate nach heuristik-report.json/.md (kein Klartext).

Inhalts-Guardrail: sample.local.jsonl bleibt lokal (gitignored); alle committbaren
Artefakte (labels.json, sample-meta.json, heuristik-report.*) enthalten ausschliesslich
ids, Kategorien und Zahlen — nie Prompt-Text.
"""
import argparse
import json
import random
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_wildchat import USER3, WC, classify  # dieselbe Heuristik-Logik wie die Pipeline (DRY)
from layout import resolve_layout

LAYOUT = resolve_layout(__file__)
VALDIR = LAYOUT.validation
SAMPLE_PATH = VALDIR / "sample.local.jsonl"
META_PATH = VALDIR / "sample-meta.json"
LABELS_PATH = VALDIR / "labels.json"
REPORT_JSON = VALDIR / "heuristik-report.json"
REPORT_MD = VALDIR / "heuristik-report.md"

SEED = 11
POOL_N = 20000  # Kandidaten-Pool vor Stratifizierung (reservoir sample aus den echten Parquets)
TARGET_N = 400  # Zielgroesse der Stichprobe
MIN_PER_CAT = 15  # Mindestbesetzung je Kategorie, damit Precision/Recall pro Kategorie belastbar bleibt

# Die veröffentlichte App zensiert Beispiele nicht pauschal. Für die lokale
# Annotator-Stichprobe werden explizite/heikle Inhalte dennoch ausgeschlossen,
# weil der Klartext nur der Heuristik-Validierung dient.
BLOCK = re.compile(
    r"\b(sex|sexual|porn|nsfw|nude|naked|penis|vagina|orgasm|masturbat|rape|suicide|"
    r"kill myself|incest|genital|erotic|fetish)\b",
    re.I,
)


def stratified_alloc(counts, target, min_n):
    """Verteilt `target` Stichproben ueber Kategorien: erst ein Mindest-Floor je
    Kategorie (gedeckelt auf die verfuegbare Menge), danach Round-Robin ueber die
    groessten Pools zuerst, bis das Ziel erreicht oder alle Pools erschoepft sind."""
    cats = sorted(counts)
    total_avail = sum(counts.values())
    if total_avail <= target:
        return dict(counts)
    alloc = {c: min(counts[c], min_n) for c in cats}
    remaining = target - sum(alloc.values())
    order = sorted(cats, key=lambda c: -counts[c])
    i = 0
    while remaining > 0 and any(alloc[c] < counts[c] for c in cats):
        c = order[i % len(order)]
        if alloc[c] < counts[c]:
            alloc[c] += 1
            remaining -= 1
        i += 1
    return alloc


def make_sample():
    import duckdb

    con = duckdb.connect()
    rows = con.execute(
        f"SELECT {USER3} FROM {WC} WHERE conversation[1].content IS NOT NULL "
        f"USING SAMPLE {POOL_N} ROWS (reservoir, {SEED})"
    ).fetchall()
    pool = [content for (content,) in rows if content]

    n_pool = len(pool)
    excluded = [t for t in pool if BLOCK.search(t)]
    kept = [t for t in pool if not BLOCK.search(t)]
    exclusion_rate = len(excluded) / n_pool if n_pool else 0.0

    by_cat = {}
    for t in kept:
        by_cat.setdefault(classify(t), []).append(t)

    alloc = stratified_alloc({c: len(v) for c, v in by_cat.items()}, TARGET_N, MIN_PER_CAT)

    rng = random.Random(SEED)
    picked = []
    for cat, n in alloc.items():
        items = by_cat[cat][:]
        rng.shuffle(items)
        picked.extend((cat, t) for t in items[:n])
    rng.shuffle(picked)

    VALDIR.mkdir(parents=True, exist_ok=True)
    with SAMPLE_PATH.open("w", encoding="utf-8") as f:
        for i, (cat, t) in enumerate(picked):
            f.write(json.dumps({"id": f"s{i:04d}", "heuristic_cat": cat, "text": t}, ensure_ascii=False) + "\n")

    meta = {
        "seed": SEED,
        "n_pool": n_pool,
        "n_excluded_block": len(excluded),
        "exclusion_rate": round(exclusion_rate, 4),
        "n_sample": len(picked),
        "alloc": alloc,
    }
    META_PATH.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    print(f"sample.local.jsonl: n={len(picked)} (pool={n_pool}, BLOCK-Ausschluss={len(excluded)} = "
          f"{100 * exclusion_rate:.2f}%)")
    print(f"  Verteilung je Kategorie: {alloc}")


def compute_metrics(pred_by_id, true_by_id):
    """pred_by_id = Heuristik-Kategorie je id, true_by_id = LLM-Annotator-Kategorie je
    id (Referenz). Liefert Konfusionsmatrix + Precision/Recall/F1 je Kategorie +
    Macro-F1 + Cohen's Kappa. Reine Funktion, keine I/O."""
    missing = set(pred_by_id) - set(true_by_id)
    if missing:
        raise ValueError(f"labels fehlen fuer ids: {sorted(missing)[:5]}...")

    ids = sorted(pred_by_id)
    n = len(ids)
    cats = sorted(set(pred_by_id.values()) | set(true_by_id.values()))
    cm = {t: Counter() for t in cats}
    for sid in ids:
        cm[true_by_id[sid]][pred_by_id[sid]] += 1

    true_totals = {t: sum(cm[t].values()) for t in cats}
    pred_totals = {c: sum(cm[t][c] for t in cats) for c in cats}

    per_cat = {}
    for c in cats:
        tp = cm[c][c]
        fn = true_totals[c] - tp
        fp = pred_totals[c] - tp
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        per_cat[c] = {"precision": round(precision, 4), "recall": round(recall, 4),
                       "f1": round(f1, 4), "support": true_totals[c]}

    accuracy = sum(cm[c][c] for c in cats) / n if n else 0.0
    macro_f1 = sum(v["f1"] for v in per_cat.values()) / len(per_cat) if per_cat else 0.0

    po = accuracy
    pe = sum((true_totals[c] / n) * (pred_totals[c] / n) for c in cats) if n else 0.0
    kappa = (po - pe) / (1 - pe) if (1 - pe) else 0.0

    return {
        "n": n,
        "accuracy": round(po, 4),
        "kappa": round(kappa, 4),
        "macroF1": round(macro_f1, 4),
        "perCat": per_cat,
        "confusion": {t: {p: cm[t][p] for p in cats} for t in cats},
    }


def render_md(report, meta):
    lines = [
        "# Heuristik-Validierung (Algorithm-Level, Nested Model)",
        "",
        f"Stichprobe n={report['n']} (seed={SEED}, stratifiziert je Heuristik-Kategorie, "
        f"Pool={meta.get('n_pool', '?')}, BLOCK-Ausschluss={meta.get('n_excluded_block', '?')} "
        f"= {100 * meta.get('exclusion_rate', 0):.2f}%).",
        "",
        f"- Accuracy: **{report['accuracy']}**",
        f"- Cohen's Kappa: **{report['kappa']}**",
        f"- Macro-F1: **{report['macroF1']}**",
        "",
        "## Precision / Recall / F1 je Kategorie",
        "",
        "| Kategorie | Precision | Recall | F1 | Support (LLM-Annotator) |",
        "| --- | --- | --- | --- | --- |",
    ]
    for cat, v in sorted(report["perCat"].items()):
        lines.append(f"| {cat} | {v['precision']} | {v['recall']} | {v['f1']} | {v['support']} |")
    lines += ["", "## Konfusionsmatrix (Zeilen = LLM-Annotator, Spalten = Heuristik)", ""]
    cats = sorted(report["confusion"])
    lines.append("| true \\ pred | " + " | ".join(cats) + " |")
    lines.append("| --- | " + " | ".join("---" for _ in cats) + " |")
    for t in cats:
        row = report["confusion"][t]
        lines.append(f"| {t} | " + " | ".join(str(row.get(p, 0)) for p in cats) + " |")
    return "\n".join(lines) + "\n"


def score():
    if not SAMPLE_PATH.exists():
        sys.exit(f"Fehlt: {SAMPLE_PATH} — erst --make-sample laufen lassen.")
    if not LABELS_PATH.exists():
        sys.exit(f"Fehlt: {LABELS_PATH} — Stichprobe erst als LLM-Annotator klassifizieren.")

    pred_by_id = {}
    with SAMPLE_PATH.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            pred_by_id[row["id"]] = row["heuristic_cat"]

    labels_raw = json.loads(LABELS_PATH.read_text())
    true_by_id = {r["id"]: r["cat"] for r in labels_raw}

    report = compute_metrics(pred_by_id, true_by_id)
    meta = json.loads(META_PATH.read_text()) if META_PATH.exists() else {}
    report["seed"] = SEED
    report["sampleMeta"] = meta

    REPORT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    REPORT_MD.write_text(render_md(report, meta))
    print(f"heuristik-report: n={report['n']} · Accuracy={report['accuracy']} · "
          f"κ={report['kappa']} · MacroF1={report['macroF1']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--make-sample", action="store_true", help="stratifizierte Stichprobe ziehen")
    ap.add_argument("--score", action="store_true", help="Report aus sample + labels rechnen")
    args = ap.parse_args()
    if args.make_sample:
        make_sample()
    elif args.score:
        score()
    else:
        ap.error("--make-sample oder --score angeben")
