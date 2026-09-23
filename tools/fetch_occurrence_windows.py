"""One-off/maintenance script: fills in an "occurrence window" (typical months seen in
Germany/Luxembourg) for wishlist species that have no official breeding-season (BZC) window,
i.e. species that don't breed here but show up as passage migrants or winter/summer visitors.

The official ornitho.de reference spreadsheet (reference/ornitho-Referenzliste-Arten-*.xlsx)
only carries breeding-season data, nothing for non-breeders. This uses GBIF's public occurrence
API instead: for each such species, fetch a month-by-month occurrence count for DE+LU, then find
the shortest circular run of months that covers most of the records. That run becomes an
occStart/occEnd window, analogous to bzcStart/bzcEnd but explicitly NOT a breeding indicator
(the app must label it differently in the UI).

Run this AFTER tools/extract_species_reference.py (which regenerates species_reference.json
from the spreadsheet and would otherwise wipe these fields out).

Usage: python tools/fetch_occurrence_windows.py
Requires: internet access (dev-only, not needed to build/use the app itself)
"""
import calendar
import json
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REF_PATH = os.path.join(ROOT, "species_reference.json")

# a window has to explain at least this share of records to count as "the season"
COVERAGE = 0.85
# below this many DE/LU records, the month histogram is too noisy to trust
MIN_RECORDS = 15
# a window this long (or longer) isn't a useful "season" anymore (near-year-round occurrence)
MAX_WINDOW_MONTHS = 9


def api_get(url):
    with urllib.request.urlopen(url, timeout=20) as resp:
        return json.load(resp)


def match_taxon_key(latin):
    url = "https://api.gbif.org/v1/species/match?" + urllib.parse.urlencode({"name": latin})
    data = api_get(url)
    return data.get("usageKey") if data.get("matchType") != "NONE" else None


def month_counts(taxon_key):
    url = "https://api.gbif.org/v1/occurrence/search?" + urllib.parse.urlencode(
        [("taxonKey", taxon_key), ("country", "DE"), ("country", "LU"),
         ("facet", "month"), ("facetLimit", 12), ("limit", 0)])
    data = api_get(url)
    counts = {int(c["name"]): c["count"] for c in data["facets"][0]["counts"]}
    return counts


def shortest_covering_window(counts):
    """Shortest circular run of months covering >= COVERAGE of the total. Returns (start, end, months) or None."""
    total = sum(counts.values())
    if total < MIN_RECORDS:
        return None
    best = None
    for start in range(1, 13):
        acc, length = 0, 0
        for offset in range(12):
            m = (start - 1 + offset) % 12 + 1
            acc += counts.get(m, 0)
            length += 1
            if acc >= COVERAGE * total:
                break
        end = (start - 1 + length - 1) % 12 + 1
        if best is None or length < best[2]:
            best = (start, end, length)
    if best is None or best[2] > MAX_WINDOW_MONTHS:
        return None
    return best[0], best[1]


def to_window_md(start_month, end_month):
    last_day = calendar.monthrange(2001, end_month)[1]  # 2001: same non-leap reference year as doyOf()
    return f"{start_month:02d}-01", f"{end_month:02d}-{last_day:02d}"


def main():
    with open(REF_PATH, encoding="utf-8") as fh:
        ref = json.load(fh)

    targets = [e for e in ref["wishlist"] if not e.get("bzcStart")]
    print(f"{len(targets)} species without a breeding window; querying GBIF...")

    filled, skipped = 0, 0
    for i, entry in enumerate(targets):
        latin = entry["latin"]
        try:
            taxon_key = match_taxon_key(latin)
            if taxon_key is None:
                print(f"  [{i+1}/{len(targets)}] {latin}: no GBIF match")
                skipped += 1
                continue
            counts = month_counts(taxon_key)
            window = shortest_covering_window(counts)
            if window is None:
                print(f"  [{i+1}/{len(targets)}] {latin}: no usable window (too few/too spread-out records)")
                skipped += 1
                continue
            occ_start, occ_end = to_window_md(*window)
            entry["occStart"], entry["occEnd"] = occ_start, occ_end
            filled += 1
            print(f"  [{i+1}/{len(targets)}] {latin}: {occ_start} .. {occ_end}")
        except Exception as e:
            print(f"  [{i+1}/{len(targets)}] {latin}: error {e}")
            skipped += 1
        time.sleep(0.2)

    with open(REF_PATH, "w", encoding="utf-8") as fh:
        json.dump(ref, fh, ensure_ascii=False, indent=1, sort_keys=True)

    print(f"filled {filled}, skipped {skipped}")
    print("written:", REF_PATH)


if __name__ == "__main__":
    main()
