"""Unit tests fuer die reine Logik in validate_heuristik.py (Stratifizierung,
Konfusionsmatrix/Precision/Recall/F1/Kappa). Keine echten Daten noetig (siehe
u5_validation.mjs fuer die End-to-End-Acceptance gegen den echten Report)."""
import math

from build_wildchat import redact_pii
from validate_heuristik import compute_metrics, render_md, stratified_alloc


def test_stratified_alloc_hits_target_when_pool_sufficient():
    counts = {"A": 100, "B": 80, "C": 60}
    alloc = stratified_alloc(counts, target=30, min_n=5)
    assert sum(alloc.values()) == 30
    for cat in counts:
        assert alloc[cat] <= counts[cat]


def test_stratified_alloc_respects_min_floor_when_available():
    counts = {"A": 100, "B": 5, "C": 50}
    alloc = stratified_alloc(counts, target=30, min_n=10)
    # B hat nur 5 verfuegbar -> gedeckelt auf 5, nicht auf den Floor 10 aufgefuellt
    assert alloc["B"] == 5
    assert sum(alloc.values()) == 30


def test_stratified_alloc_returns_all_when_pool_below_target():
    counts = {"A": 10, "B": 5}
    alloc = stratified_alloc(counts, target=100, min_n=10)
    assert alloc == counts


def test_compute_metrics_perfect_agreement_gives_kappa_one():
    pred = {"s0": "A", "s1": "A", "s2": "B", "s3": "B"}
    true = dict(pred)
    report = compute_metrics(pred, true)
    assert report["n"] == 4
    assert report["accuracy"] == 1.0
    assert report["kappa"] == 1.0
    assert report["macroF1"] == 1.0
    for v in report["perCat"].values():
        assert v["precision"] == 1.0
        assert v["recall"] == 1.0


def test_compute_metrics_known_confusion_matches_hand_computed_values():
    # true A: s0..s5 (6), true B: s6..s9 (4). Heuristik (pred) verfehlt 2 von A und 1 von B.
    true = {f"s{i}": "A" for i in range(6)} | {f"s{i}": "B" for i in range(6, 10)}
    pred = {
        "s0": "A", "s1": "A", "s2": "A", "s3": "A", "s4": "B", "s5": "B",
        "s6": "A", "s7": "B", "s8": "B", "s9": "B",
    }
    report = compute_metrics(pred, true)
    assert report["n"] == 10
    assert math.isclose(report["accuracy"], 0.7)
    assert math.isclose(report["kappa"], 0.4, abs_tol=1e-9)
    assert math.isclose(report["perCat"]["A"]["precision"], 0.8, abs_tol=1e-4)
    assert math.isclose(report["perCat"]["A"]["recall"], 2 / 3, abs_tol=1e-4)
    assert math.isclose(report["perCat"]["B"]["precision"], 0.6, abs_tol=1e-4)
    assert math.isclose(report["perCat"]["B"]["recall"], 0.75, abs_tol=1e-4)
    assert math.isclose(report["macroF1"], 0.696969696969697, abs_tol=1e-4)


def test_render_md_contains_only_aggregates_never_raw_text():
    pred = {"s0": "A", "s1": "A", "s2": "B"}
    true = {"s0": "A", "s1": "B", "s2": "B"}
    report = compute_metrics(pred, true)
    md = render_md(report, {"n_pool": 1000, "n_excluded_block": 10, "exclusion_rate": 0.01})
    assert "Kappa" in md
    assert "Konfusionsmatrix" in md
    assert '"text"' not in md
    # Kategorie-Namen (A, B) und Zahlen duerfen vorkommen, aber keine Prompt-artigen Saetze
    assert all(len(line) < 200 for line in md.splitlines())


def test_compute_metrics_raises_when_label_missing_for_sampled_id():
    pred_by_id = {"s0": "A", "s1": "B"}  # Heuristik-Kategorien aus sample.local.jsonl
    true_by_id_incomplete = {"s0": "A"}  # labels.json deckt s1 nicht ab
    try:
        compute_metrics(pred_by_id, true_by_id_incomplete)
        assert False, "sollte bei fehlenden Annotator-Labels fehlschlagen"
    except ValueError:
        pass


def test_redact_pii_removes_credentials_network_and_international_phone():
    raw = (
        "Server 192.0.2.42 User: demo-admin Password: example-secret "
        'Authorization: ["Basic ZXhhbXBsZTp0ZXN0"], '
        'Blade-Auth: ["bearer example.token.value"] Phone +212 649-508069'
    )
    clean = redact_pii(raw)
    for secret in (
        "192.0.2.42",
        "demo-admin",
        "example-secret",
        "ZXhhbXBsZTp0ZXN0",
        "example.token.value",
        "+212 649-508069",
    ):
        assert secret not in clean
    assert "[IP-Adresse entfernt]" in clean
    assert clean.count("[Zugang entfernt]") >= 4
    assert "[Nummer entfernt]" in clean
