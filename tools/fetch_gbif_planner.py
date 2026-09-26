"""Maintenance script: builds the data of the holiday planner from GBIF, for Germany or Europe.

For every region (Germany: districts, GADM level 2; Europe: provinces/states, GADM level 1) and month it
asks GBIF's occurrence search API for the number of all bird records and, as a facet, the records per
species. One species' share of all bird records in a region and month (its "reporting share") evens out
regions with many or few observers and serves as the chance of seeing it there. The shares are stored
as steps 0-9 on a log scale, per species only for its best regions, in data/gbif_planner_<scope>.json,
compact enough to ship with the repository; lifelist.py embeds it, so the page stays offline.

Only human observations under CC0 or CC BY (no NC data: the results are redistributed with this MIT
licensed repository). Raw answers are cached in tools/.gbif_cache/, so an interrupted run resumes without
asking again; delete the folder to fetch fresh data.

Usage:  python tools/fetch_gbif_planner.py --check          (a few test queries, a minute)
        python tools/fetch_gbif_planner.py --scope de       (about half an hour)
        python tools/fetch_gbif_planner.py --scope eu       (about an hour)
Options: --from-year 2015  --to-year <last full year>  --offline (cache only)
Requires: internet access (dev-only, not needed to build or use the app itself)
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REF_PATH = os.path.join(ROOT, "species_reference.json")
CACHE_DIR = os.path.join(HERE, ".gbif_cache")
OUT_DIR = os.path.join(ROOT, "data")

API = "https://api.gbif.org/v1"
AVES = 212
REQUESTS_PER_SECOND = 3
USER_AGENT = "OrnithoLifeList data fetch (https://github.com/fotokolade/OrnithoLifeList)"
LICENSES = ["CC0_1_0", "CC_BY_4_0"]
# a step's lower bound as a share of all bird records in the region and month: step 1 from 0.02 %, ..., step 9 from 10 %
LEVELS = [0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1]
# fewer bird records than this in a region and month say too little: its cells stay 0 (the totals still tell)
MIN_CELL_TOTAL = 100
# a species needs this many records in a region and month for a step there: one or two stray records
# (a vagrant, a mistake) in a month with few records would otherwise give a high share
MIN_CELL_RECORDS = 3
# largest acceptable output file; the number of regions kept per species is lowered until it fits
BUDGET_BYTES = 500_000
TOP_REGION_STEPS = [60, 50, 40, 30, 25, 20, 15, 10]

EU_COUNTRIES = {  # ISO 3166 alpha-2 (GBIF's country filter) -> GADM's level-0 id; no Russia (mostly Asian)
    "AT": "AUT", "BE": "BEL", "BG": "BGR", "HR": "HRV", "CY": "CYP", "CZ": "CZE", "DK": "DNK", "EE": "EST",
    "FI": "FIN", "FR": "FRA", "DE": "DEU", "GR": "GRC", "HU": "HUN", "IE": "IRL", "IT": "ITA", "LV": "LVA",
    "LT": "LTU", "LU": "LUX", "MT": "MLT", "NL": "NLD", "PL": "POL", "PT": "PRT", "RO": "ROU", "SK": "SVK",
    "SI": "SVN", "ES": "ESP", "SE": "SWE", "NO": "NOR", "IS": "ISL", "CH": "CHE", "LI": "LIE", "GB": "GBR",
    "AL": "ALB", "BA": "BIH", "ME": "MNE", "MK": "MKD", "RS": "SRB", "XK": "XKO", "MD": "MDA", "UA": "UKR",
    "BY": "BLR", "TR": "TUR", "AD": "AND", "MC": "MCO", "SM": "SMR", "VA": "VAT", "FO": "FRO", "GI": "GIB",
}
SCOPES = {
    "de": {"countries": {"DE": "DEU"}, "level": 2, "min_records": 50},
    "eu": {"countries": EU_COUNTRIES, "level": 1, "min_records": 200},
}


class Gbif:
    """GET requests against the GBIF API: cached on disk, throttled, retried."""

    def __init__(self, cache_dir=CACHE_DIR, offline=False):
        self.cache_dir, self.offline, self.last, self.fetched = cache_dir, offline, 0.0, 0
        os.makedirs(cache_dir, exist_ok=True)

    def get(self, path, params):
        url = f"{API}/{path}?" + urllib.parse.urlencode(params)
        cached = os.path.join(self.cache_dir, hashlib.sha1(url.encode()).hexdigest() + ".json")
        if os.path.exists(cached):
            with open(cached, encoding="utf-8") as fh:
                return json.load(fh)
        if self.offline:
            raise RuntimeError(f"not in the cache (--offline): {url}")
        for attempt in range(7):
            time.sleep(max(0.0, self.last + 1 / REQUESTS_PER_SECOND - time.time()))
            self.last = time.time()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=90) as resp:
                    data = json.load(resp)
                break
            except urllib.error.HTTPError as e:
                if e.code not in (429, 500, 502, 503, 504) or attempt == 6:
                    raise RuntimeError(f"GBIF answered {e.code} to {url}: {e.read()[:300]!r}")
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt == 6:
                    raise RuntimeError(f"GBIF not reachable ({e}): {url}")
            time.sleep(2 ** attempt * 2)
        tmp = cached + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        os.replace(tmp, cached)  # a run cut off mid-write leaves no broken cache file
        self.fetched += 1
        return data


def base_params(countries, years):
    return [("occurrenceStatus", "PRESENT"), ("basisOfRecord", "HUMAN_OBSERVATION"), ("hasGeospatialIssue", "false"),
            ("year", f"{years[0]},{years[1]}"), *(("license", x) for x in LICENSES),
            *(("country", c) for c in countries)]


def facet_counts(data):
    """{value: count} of the one facet asked for."""
    facets = data.get("facets") or []
    return {c["name"]: c["count"] for c in facets[0]["counts"]} if facets else {}


def list_regions(api, scope, years):
    """The GADM ids of the scope's regions that have bird records, within its countries."""
    sc = SCOPES[scope]
    field = f"gadmLevel{sc['level']}Gid"
    data = api.get("occurrence/search", base_params(sc["countries"], years) + [
        ("taxonKey", AVES), ("limit", 0), ("facet", field), ("facetLimit", 5000), ("facetMincount", 1)])
    allowed = set(sc["countries"].values())
    # records of a country whose coordinates fall just across its border land in the neighbour's regions
    return sorted(gid for gid in facet_counts(data) if gid.split(".")[0] in allowed)


def region_info(api, scope, years, gid):
    """Name, parent name and country of a region, from the GADM names GBIF attaches to its records."""
    sc = SCOPES[scope]
    data = api.get("occurrence/search", base_params(sc["countries"], years) + [
        ("taxonKey", AVES), ("gadmGid", gid), ("limit", 1)])
    rec = (data.get("results") or [{}])[0]
    gadm = rec.get("gadm") or {}
    name = (gadm.get(f"level{sc['level']}") or {}).get("name") or gid
    parent = (gadm.get(f"level{sc['level'] - 1}") or {}).get("name") or ""
    iso3 = gid.split(".")[0]
    country = next((k for k, v in sc["countries"].items() if v == iso3), rec.get("countryCode") or "")
    return {"id": gid, "name": name, "parent": parent, "country": country}


def region_months(api, scope, years, gid):
    """Per month (index 0-11): (all bird records, {species key: records})."""
    sc = SCOPES[scope]
    out = []
    for m in range(1, 13):
        data = api.get("occurrence/search", base_params(sc["countries"], years) + [
            ("taxonKey", AVES), ("gadmGid", gid), ("month", m), ("limit", 0),
            ("facet", "speciesKey"), ("facetLimit", 5000), ("facetMincount", 1)])
        out.append((data.get("count", 0), {int(k): v for k, v in facet_counts(data).items()}))
    return out


def level_of(share, levels=LEVELS):
    return sum(share >= b for b in levels)


def aggregate(months_by_region, min_records, min_cell_total=MIN_CELL_TOTAL, levels=LEVELS, min_cell_records=MIN_CELL_RECORDS):
    """months_by_region: per region the output of region_months().
    Returns (totals: per region 12 ints, steps: {species: {region index: [12 steps]}}) for the species with
    at least min_records records in the whole scope and at least one step above 0."""
    totals = [[t for t, _ in months] for months in months_by_region]
    records = {}
    for months in months_by_region:
        for _, per_species in months:
            for s, n in per_species.items():
                records[s] = records.get(s, 0) + n
    steps = {}
    for r, months in enumerate(months_by_region):
        for m, (total, per_species) in enumerate(months):
            if total < min_cell_total:
                continue
            for s, n in per_species.items():
                if records[s] < min_records or n < min_cell_records:
                    continue
                lv = level_of(n / total, levels)
                if lv:
                    steps.setdefault(s, {}).setdefault(r, [0] * 12)[m] = lv
    return totals, steps


def best_regions(cells, top, parents=None):
    """The `top` regions with the highest step in any month (then the highest sum over the year), plus the best
    region of every parent (federal state, country) the species occurs in: so a state learns about a species
    even where its districts aren't among the best `top` in all of Germany. `parents`: per region index."""
    rank = lambda r: (-max(cells[r]), -sum(cells[r]), r)  # noqa: E731
    order = sorted(cells, key=rank)
    keep = set(order[:top])
    if parents:
        best = {}
        for r in order:  # best first
            best.setdefault(parents[r], r)
        keep |= set(best.values())
    return {r: cells[r] for r in sorted(keep)}


def encode_cells(cells):
    return {str(r): "".join(map(str, v)) for r, v in cells.items()}


def build_output(meta, regions, totals, steps, species_info, budget=BUDGET_BYTES):
    """The file's content, with as many regions per species as the budget allows."""
    parents = [r.get("parent", "") for r in regions]
    for top in TOP_REGION_STEPS:
        species = [{**species_info[s], "key": s, "cells": encode_cells(best_regions(cells, top, parents))}
                   for s, cells in steps.items() if s in species_info]
        species.sort(key=lambda x: x["latin"])
        out = {"meta": {**meta, "topRegions": top}, "regions": regions, "totals": totals, "species": species}
        text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
        if len(text.encode()) <= budget or top == TOP_REGION_STEPS[-1]:
            return out, text


def clean_latin(name):
    """Only plain binomials of the ornitho.de list can be matched ("A / B", hybrids and "sp." cannot)."""
    return name if len(name.split()) == 2 and "/" not in name and " x " not in name and "sp." not in name else None


def ornitho_names(api):
    """{GBIF species key: (ornitho.de Latin name, German, English)} for the ornitho.de reference list."""
    with open(REF_PATH, encoding="utf-8") as fh:
        ref = json.load(fh)["lifeListNames"]
    out = {}
    for latin, names in ref.items():
        if not clean_latin(latin):
            continue
        m = api.get("species/match", [("name", latin), ("class", "Aves"), ("strict", "true")])
        if m.get("matchType") == "NONE" or m.get("rank") != "SPECIES":
            continue
        key = m.get("acceptedUsageKey") or m.get("usageKey")
        out.setdefault(key, (latin, names.get("de"), names.get("en")))
    return out


def species_info(api, keys, known):
    """{key: {latin, alias, de, en}}: names from the ornitho.de list where it has the species, else GBIF's; no hybrids."""
    info = {}
    for i, key in enumerate(sorted(keys), 1):
        sp = api.get(f"species/{key}", [])
        latin = sp.get("canonicalName") or sp.get("scientificName") or str(key)
        if " x " in latin or "×" in latin or sp.get("notho"):
            continue  # hybrids: no species to look for (left out of the file)
        if key in known:
            orn, de, en = known[key]
        else:
            orn, de, en = None, None, None
            vern = api.get(f"species/{key}/vernacularNames", [("limit", 200)]).get("results") or []
            de = next((v["vernacularName"] for v in vern if v.get("language") == "deu"), None)
            en = next((v["vernacularName"] for v in vern if v.get("language") == "eng"), None)
        info[key] = {"latin": latin, "alias": orn if orn and orn != latin else None, "de": de, "en": en}
        if i % 100 == 0:
            print(f"  names: {i}/{len(keys)}", flush=True)
    return info


def run(scope, years, offline=False):
    sc = SCOPES[scope]
    api = Gbif(offline=offline)
    started = time.time()
    print(f"[{scope}] regions ...", flush=True)
    gids = list_regions(api, scope, years)
    print(f"[{scope}] {len(gids)} regions; monthly records per region ...", flush=True)
    regions, months_by_region = [], []
    for i, gid in enumerate(gids, 1):
        regions.append(region_info(api, scope, years, gid))
        months_by_region.append(region_months(api, scope, years, gid))
        if i % 10 == 0 or i == len(gids):
            print(f"  {i}/{len(gids)} regions ({api.fetched} requests, {(time.time() - started) / 60:.0f} min)", flush=True)
    totals, steps = aggregate(months_by_region, sc["min_records"])
    print(f"[{scope}] {len(steps)} species; names ...", flush=True)
    info = species_info(api, steps.keys(), ornitho_names(api))
    today = datetime.date.today().isoformat()
    meta = {
        "scope": scope, "source": "GBIF.org", "fetched": today, "years": list(years),
        "filters": {"taxonKey": AVES, "basisOfRecord": "HUMAN_OBSERVATION", "occurrenceStatus": "PRESENT",
                    "hasGeospatialIssue": False, "licenses": LICENSES, "countries": sorted(sc["countries"])},
        "regionLevel": f"GADM level {sc['level']}", "levels": LEVELS, "minCellTotal": MIN_CELL_TOTAL,
        "minCellRecords": MIN_CELL_RECORDS,
        "minRecords": sc["min_records"],
        "citation": f"GBIF.org ({today}): occurrence counts via the GBIF occurrence search API "
                    f"(birds, human observations {years[0]}-{years[1]}, licences CC0 and CC BY). https://www.gbif.org",
    }
    out, text = build_output(meta, regions, totals, steps, info)
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"gbif_planner_{scope}.json")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    no_de = sum(1 for s in out["species"] if not s["de"])
    try:
        shown = os.path.relpath(path, ROOT)
    except ValueError:  # Windows: another drive than the repository (e.g. a temp folder in the tests)
        shown = path
    print(f"[{scope}] written {shown}:{len(text.encode()) // 1024} KB, {len(regions)} regions, "
          f"{len(out['species'])} species ({no_de} without a German name), {out['meta']['topRegions']} regions per species, "
          f"{(time.time() - started) / 60:.0f} min")


def check(years):
    """A few queries that show whether GBIF still takes the parameters this script relies on."""
    api = Gbif(cache_dir=os.path.join(CACHE_DIR, "check"))
    for scope in SCOPES:
        gids = list_regions(api, scope, years)
        print(f"[{scope}] {len(gids)} regions, e.g. {gids[:3]}")
        if not gids:
            sys.exit(f"[{scope}] no regions: the facet gadmLevel{SCOPES[scope]['level']}Gid or the filters don't work (any more)")
        info = region_info(api, scope, years, gids[0])
        months = region_months(api, scope, years, gids[0])
        print(f"  {info}: bird records per month {[t for t, _ in months]}, species in May {len(months[4][1])}")
        if not any(t for t, _ in months) or not months[4][1]:
            sys.exit("  no records per month or no species facet: the filter gadmGid or the facet speciesKey doesn't work (any more)")
    m = api.get("species/match", [("name", "Prunella collaris"), ("class", "Aves"), ("strict", "true")])
    print(f"species/match Prunella collaris -> {m.get('usageKey')} ({m.get('rank')}, {m.get('matchType')})")
    print("All fine: run --scope de and --scope eu.")


def main():
    last_year = datetime.date.today().year - 1
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--scope", choices=sorted(SCOPES))
    ap.add_argument("--from-year", type=int, default=2015)
    ap.add_argument("--to-year", type=int, default=last_year)
    ap.add_argument("--offline", action="store_true", help="use the cache only, no requests")
    ap.add_argument("--check", action="store_true", help="only test whether the API takes the queries")
    args = ap.parse_args()
    years = (args.from_year, args.to_year)
    try:
        if args.check:
            check(years)
        elif args.scope:
            run(args.scope, years, args.offline)
        else:
            ap.error("give --scope de, --scope eu or --check")
    except RuntimeError as e:
        sys.exit(str(e))
    except KeyboardInterrupt:
        sys.exit("\nStopped. Run the same command again to continue where it left off.")


if __name__ == "__main__":
    main()
