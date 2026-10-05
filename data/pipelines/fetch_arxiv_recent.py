#!/usr/bin/env python3
"""Laedt aktuelle KI-Paper (2022-2026) ueber die offizielle arXiv-API nach (Kategorien + Datum +
Abstract, ohne Login), als Ergaenzung zum 2007-2021-Bestand fuer Akt 2 (Map). Rate-limit 3,1s.
-> daten-raw/arxiv_recent.json   Lauf: inside-ai/.venv/bin/python daten/fetch_arxiv_recent.py"""
import json
import time
import urllib.request
import xml.etree.ElementTree as ET

from layout import resolve_layout

NS = {"a": "http://www.w3.org/2005/Atom", "arx": "http://arxiv.org/schemas/atom"}
CATS = ["cs.LG", "cs.CV", "cs.CL", "cs.AI", "cs.NE", "stat.ML", "cs.RO", "cs.IR"]
YEARS = [2022, 2023, 2024, 2025, 2026]
PER = 220
OUT = resolve_layout(__file__).raw / "arxiv_recent.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

out, seen = [], set()
for cat in CATS:
    for yr in YEARS:
        q = f"cat:{cat}+AND+submittedDate:[{yr}01010000+TO+{yr}12312359]"
        url = f"http://export.arxiv.org/api/query?search_query={q}&start=0&max_results={PER}&sortBy=submittedDate&sortOrder=descending"
        try:
            xml = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "va-research"}), timeout=60).read()
            root = ET.fromstring(xml)
            n = 0
            for e in root.findall("a:entry", NS):
                eid = e.find("a:id", NS)
                pc = e.find("arx:primary_category", NS)
                summ = e.find("a:summary", NS)
                pub = e.find("a:published", NS)
                if eid is None or pc is None or summ is None or pub is None:
                    continue
                if eid.text in seen:
                    continue
                seen.add(eid.text)
                out.append({"abstract": " ".join(summ.text.split()), "cat": pc.get("term"), "year": int(pub.text[:4])})
                n += 1
            print(f"{cat} {yr}: +{n} (gesamt {len(out)})", flush=True)
        except Exception as ex:  # noqa: BLE001
            print(f"{cat} {yr} ERR {ex}", flush=True)
        time.sleep(3.1)

OUT.write_text(json.dumps(out))
print(f"FERTIG: {len(out)} aktuelle Paper -> {OUT}", flush=True)
