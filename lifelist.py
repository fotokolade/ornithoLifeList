"""Builds lifelist.html from an ornitho.de JSON export.

Usage:  python lifelist.py [--source export.json] [--redact]
Without --source, the newest export_*.json next to this script is used.
--redact writes lifelist_redacted.html without any place names or coordinates.
"""
import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

FLAG_ESCAPED = 1
FLAG_COLLECTIVE = 2


def find_export():
    files = glob.glob(os.path.join(HERE, "export_*.json"))
    if not files:
        sys.exit("No export_*.json found.")
    return max(files, key=os.path.getmtime)


def species_key(latin, name, escaped):
    """Returns (key, collective). Subspecies fold into their species; escaped or
    domestic birds keep a taxon of their own so they never hide a wild one."""
    lat = latin.strip()
    collective = (
        "/" in lat or "sp." in lat or "_oder_" in name
        or " x " in lat or "unbestimmt" in name.lower()
    )
    if collective:
        return lat + "|c", True
    key = " ".join(lat.split()[:2])
    return (key + "|e" if escaped else key), False


def minute_of_day(o):
    """Local minute of the day of the sighting, or -1 when the export has no time."""
    tm = o.get("timing") or {}
    iso = tm.get("@ISO8601", "")
    if tm.get("@notime") != "0" or len(iso) < 16:
        return -1
    return int(iso[11:13]) * 60 + int(iso[14:16])


def atlas_code(o):
    ac = o.get("atlas_code")
    return (ac.get("#text") if isinstance(ac, dict) else ac) or ""


def parse_municipality(text):
    m = re.match(r"^(.*?)\s*\((\w+),\s*(\w+)\)$", text or "")
    if m:
        return m.group(1), m.group(2), m.group(3)
    return (text or "").strip(), "", ""


def build_data(sightings):
    taxa = {}     # key -> dict
    places = {}   # ornitho place id -> index
    place_rows = []
    obs = []

    for s in sightings:
        o = s["observers"][0]
        if o.get("count") == "0" and o.get("estimation_code") == "EXACT_VALUE":
            continue  # explicit zero count: reported as not seen
        sp = s["species"]
        latin = sp["latin_name"]
        escaped = sp.get("rarity") == "escaped" or "domestica" in latin
        key, collective = species_key(latin, sp["name"], escaped)
        t = taxa.setdefault(key, {
            "names": [], "escaped": True, "collective": collective,
            "order": [], "exact": None, "idx": len(taxa),
        })
        t["escaped"] = t["escaped"] and escaped
        t["order"].append(int(sp["sys_order"]))
        name = sp["name"].replace("_", " ")
        if latin.strip() == key:
            t["exact"] = name
        t["names"].append(name)

        pl = s["place"]
        pid = pl["@id"]
        if pid not in places:
            muni, state, county = parse_municipality(pl.get("municipality"))
            place_rows.append([
                re.sub(r"\s*\[[^\]]*\]\s*$", "", pl["name"]),
                muni, state, county,
                round(float(pl["coord_lat"]), 4), round(float(pl["coord_lon"]), 4),
            ])
            places[pid] = len(place_rows) - 1

        count = int(o.get("count") or 0)
        obs.append([
            t["idx"], s["date"]["@ISO8601"][:10], places[pid], count,
            1 if any(m.get("type") == "PHOTO" for m in o.get("medias") or []) else 0, atlas_code(o), minute_of_day(o),
        ])

    obs.sort(key=lambda r: r[1])  # stable: keeps export order within a day

    sp_rows = [None] * len(taxa)
    for key, t in taxa.items():
        flags = (FLAG_ESCAPED if t["escaped"] else 0) | (FLAG_COLLECTIVE if t["collective"] else 0)
        latin = key.split("|")[0]
        sp_rows[t["idx"]] = [t["exact"] or t["names"][0], latin, min(t["order"]), flags]

    return {"sp": sp_rows, "pl": place_rows, "obs": obs}


def main():
    parser = argparse.ArgumentParser(description="Builds lifelist.html from an ornitho.de JSON export.")
    parser.add_argument("--source", "-s", help="export JSON file (default: newest export_*.json)")
    parser.add_argument("--redact", action="store_true", help="write lifelist_redacted.html without place data")
    opts = parser.parse_args()  # unknown flags abort, so a typo cannot produce an unredacted file
    redact = opts.redact
    src = opts.source or find_export()
    src = os.path.abspath(src)
    print("Source:", src)
    with open(src, encoding="utf-8") as fh:
        sightings = json.load(fh)["data"]["sightings"]

    data = build_data(sightings)
    if redact:  # remove place data from the file itself, not just from the display
        data["pl"] = [["", "", r[2], r[3], 0, 0] for r in data["pl"]]
    data["meta"] = {
        "redacted": redact,
        "source": os.path.basename(src),
    }

    with open(os.path.join(HERE, "template.html"), encoding="utf-8") as fh:
        tpl = fh.read()
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    out = tpl.replace("__DATA_JSON__", blob)
    dst = os.path.join(HERE, "lifelist_redacted.html" if redact else "lifelist.html")
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(out)

    counted = {r[0] for r in data["obs"] if data["sp"][r[0]][3] == 0}
    print(f"Observations: {len(data['obs'])}, taxa: {len(data['sp'])}, "
          f"species (excluding escapes and collective taxa): {len(counted)}")
    print("Written:", dst, f"({os.path.getsize(dst) / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
