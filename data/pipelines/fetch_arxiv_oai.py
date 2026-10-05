#!/usr/bin/env python3
"""Vollbestand-Harvest der KI-Paper 2022-2026 via arXiv OAI-PMH (offiziell, keyless, resumable).

Schliesst die Datenluecke von Akt 2 (Map): der bisherige fetch_arxiv_recent.py zog nur eine
~220er-Stichprobe je Feld/Jahr ueber die Such-API; hier kommt der komplette Bestand.

Wichtig (verifiziert an der Live-API):
- Endpoint ist der NEUE Host https://oaipmh.arxiv.org/oai (export.arxiv.org/oai2 antwortet leer).
- from/until filtern nach DATESTAMP (= letzte Metadaten-Aenderung), NICHT Einreichung. Ein Harvest
  ab 2022 enthaelt daher auch alte Paper mit spaeteren Updates -> wir filtern nach <created> (echtes
  Einreichungsdatum) und Primaer-Kategorie.
- Set "cs" enthaelt alle Paper mit irgendeiner cs-Kategorie (auch Crosslists). stat.ML-Paper ohne
  cs-Crosslist fehlen darin; deshalb zweiter kleiner Durchlauf mit Set "stat".
- Offene Listen (from ohne until) laufen serverseitig in den Timeout -> MONATS-SLICING: jede
  Anfrage deckt einen Monat ab, die Liste bleibt klein, Vollstaendigkeit bleibt identisch.
- Resumable: Slice-Index + resumptionToken in STATE, Records als JSONL (append) -> Abbruch ist ok,
  einfach neu starten.

Lauf: inside-ai/.venv/bin/python daten/fetch_arxiv_oai.py   (laeuft 1-2h, 3.1s Politeness-Sleep)
"""
import json
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from layout import resolve_layout

BASE = "https://oaipmh.arxiv.org/oai"
NS = {"oai": "http://www.openarchives.org/OAI/2.0/", "arx": "http://arxiv.org/OAI/arXiv/"}
CATS = {"cs.LG", "cs.CV", "cs.CL", "cs.AI", "cs.NE", "stat.ML", "cs.RO", "cs.IR"}
MIN_CREATED = "2022-01-01"
END_YM = (2026, 7)  # letzter Harvest-Monat (heute)
RAW = resolve_layout(__file__).raw
OUT = RAW / "arxiv_oai_2022plus.jsonl"
STATE = RAW / "arxiv_oai_state.json"
SLEEP = 3.1
CONTACT = os.environ.get("OPEN_DATA_CONTACT", "").strip()


def month_slices() -> list[tuple[str, str, str]]:
    """(set, from, until) je Monat 2022-01 .. END_YM, erst cs, dann stat."""
    out = []
    for s in ["cs", "stat"]:
        y, m = 2022, 1
        while (y, m) <= END_YM:
            ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
            last = {1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30, 7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}[m]
            out.append((s, f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{last:02d}"))
            y, m = ny, nm
    return out


SLICES = month_slices()


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"slice_idx": 0, "token": None, "pages": 0, "kept": 0, "done": False}


def save_state(st: dict) -> None:
    STATE.write_text(json.dumps(st))


def fetch(url: str) -> bytes:
    user_agent = "va-abschlussprojekt-harvest/1.0"
    if CONTACT:
        user_agent += f" ({CONTACT})"
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    return urllib.request.urlopen(req, timeout=120).read()


def parse_records(xml: bytes) -> tuple[list[dict], str | None, str | None]:
    root = ET.fromstring(xml)
    recs = []
    for rec in root.iter(f"{{{NS['oai']}}}record"):
        meta = rec.find(f"{{{NS['oai']}}}metadata")
        if meta is None:  # geloeschte Records haben keine Metadaten
            continue
        arx = meta.find(f"{{{NS['arx']}}}arXiv")
        if arx is None:
            continue
        get = lambda tag: (arx.findtext(f"{{{NS['arx']}}}{tag}") or "").strip()  # noqa: E731
        cats = get("categories").split()
        if not cats:
            continue
        primary = cats[0]
        created = get("created")
        if primary not in CATS or created < MIN_CREATED:
            continue
        abstract = " ".join(get("abstract").split())
        if len(abstract) <= 80:  # gleiche Mindestlaenge wie im 2007-2021-Bestand (build_map.py)
            continue
        recs.append({
            "id": get("id"),
            "cat": primary,
            "year": int(created[:4]),
            "abstract": abstract,
            "title": " ".join(get("title").split()),
        })
    tok_el = root.find(f".//{{{NS['oai']}}}resumptionToken")
    token = tok_el.text.strip() if tok_el is not None and tok_el.text else None
    # completeListSize fuer den Fortschritts-Log
    total = tok_el.get("completeListSize") if tok_el is not None else None
    return recs, token, total


def main() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    st = load_state()
    if st.get("done"):
        print("Bereits fertig (STATE.done). Zum Neu-Harvest STATE + JSONL loeschen.", flush=True)
        return
    seen_ids: set[str] = set()
    if OUT.exists():  # Dedup ueber Neustarts (Token-Seite kann teilweise doppelt kommen)
        with OUT.open() as f:
            for line in f:
                try:
                    seen_ids.add(json.loads(line)["id"])
                except Exception:  # noqa: BLE001
                    pass
        print(f"Resume: {len(seen_ids)} Records bereits auf Platte, Slice {st['slice_idx']}/{len(SLICES)}, Token {'ja' if st['token'] else 'nein'}", flush=True)

    out_f = OUT.open("a")
    while st["slice_idx"] < len(SLICES):
        cur_set, frm, until = SLICES[st["slice_idx"]]
        if st["token"]:
            url = f"{BASE}?verb=ListRecords&resumptionToken={urllib.parse.quote(st['token'])}"
        else:
            url = f"{BASE}?verb=ListRecords&metadataPrefix=arXiv&set={cur_set}&from={frm}&until={until}"
        try:
            xml = fetch(url)
            recs, token, total = parse_records(xml)
        except Exception as ex:  # noqa: BLE001
            print(f"ERR Slice {st['slice_idx']} ({cur_set} {frm}) Seite {st['pages']}: {ex}; retry in 30s", flush=True)
            time.sleep(30)
            continue
        new = 0
        for r in recs:
            if r["id"] in seen_ids:
                continue
            seen_ids.add(r["id"])
            out_f.write(json.dumps(r, ensure_ascii=False) + "\n")
            new += 1
        out_f.flush()
        st["pages"] += 1
        st["kept"] += new
        st["token"] = token
        save_state(st)
        if token is None:
            print(f"[{cur_set} {frm[:7]}] Slice {st['slice_idx'] + 1}/{len(SLICES)} fertig: gesamt {len(seen_ids)} behalten ({st['pages']} Seiten, ListSize {total})", flush=True)
            st["slice_idx"] += 1
            st["token"] = None
            save_state(st)
        time.sleep(SLEEP)
    st["done"] = True
    save_state(st)
    out_f.close()
    print(f"FERTIG: {len(seen_ids)} KI-Paper 2022+ -> {OUT}", flush=True)


if __name__ == "__main__":
    main()
