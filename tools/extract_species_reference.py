"""One-off/maintenance script: extracts species_reference.json from the official
ornitho.de species reference spreadsheet in reference/.

Not part of the normal build (lifelist.py never imports openpyxl); re-run this by hand
whenever reference/ornitho-Referenzliste-Arten-*.xlsx is updated to a newer version.

Usage: python tools/extract_species_reference.py
Requires: pip install openpyxl (dev-only, not needed to build/use the app itself)
"""
import glob
import json
import os
import re

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# The reference spreadsheet (2025-11-27) predates a few taxonomic splits/renames that the
# user's own, more recent ornitho.de export already reflects (checked against export_*.json
# directly: Astur gentilis, Botaurus minutus, Coloeus monedula, Zapornia parva, and the
# Curruca warblers all appear there under the newer name). For those, keep our current,
# newer canonical Latin name and use LOOKUP_ONLY purely to find the matching row in the
# older reference (for its German/English name and breeding window).
LOOKUP_ONLY = {
    "Botaurus minutus": "Ixobrychus minutus",
    "Astur gentilis": "Accipiter gentilis",
    "Zapornia parva": "Porzana parva",
    "Curruca nisoria": "Sylvia nisoria",
    "Curruca curruca": "Sylvia curruca",
    "Curruca communis": "Sylvia communis",
    "Curruca hortensis": "Sylvia hortensis",
    "Curruca melanocephala": "Sylvia melanocephala",
}
# The reverse case: our hand-curated list had the OLDER name; adopt the reference's newer
# one as the new canonical Latin (and German name, where the reference's is more specific/
# current, e.g. Columba livia f. domestica for the feral form ornitho.de actually tracks).
RENAME_CANONICAL = {
    "Bonasa bonasia": "Tetrastes bonasia",
    "Aquila pomarina": "Clanga pomarina",
    "Larus melanocephalus": "Ichthyaetus melanocephalus",
    "Larus genei": "Chroicocephalus genei",
    "Columba livia": "Columba livia f. domestica",
    "Calonectris diomedea": "Calonectris borealis",
}
# "Pyrrhocorax pyrrhocorax" (Alpenkrähe) has no entry at all in the DE/LU reference list
# (not a species ornitho.de tracks there) and is dropped from the wishlist.
DROP = {"Pyrrhocorax pyrrhocorax"}


def find_workbook():
    files = glob.glob(os.path.join(ROOT, "reference", "ornitho-Referenzliste-Arten-*.xlsx"))
    if not files:
        raise SystemExit("No ornitho-Referenzliste-Arten-*.xlsx found in reference/")
    return max(files, key=os.path.getmtime)


def to_md(de_date):
    """'1.4.' -> '04-01'; '..' or empty -> None."""
    if not de_date or de_date == "..":
        return None
    m = re.match(r"^\s*(\d{1,2})\.(\d{1,2})\.\s*$", de_date)
    if not m:
        return None
    day, month = int(m.group(1)), int(m.group(2))
    return f"{month:02d}-{day:02d}"


def load_wishlist_latins():
    with open(os.path.join(ROOT, "src", "i18n.js"), encoding="utf-8") as fh:
        content = fh.read()
    m = re.search(r"const EURO_SPECIES = \[(.*?)\n\];", content, re.S)
    pairs = re.findall(r'\["([^"]+)","([^"]+)"\]', m.group(1))
    return [latin for latin, _name in pairs]


def main():
    wb = openpyxl.load_workbook(find_workbook(), read_only=True, data_only=True)
    ws = wb["Artenliste"]
    rows = list(ws.iter_rows(min_row=6, values_only=True))

    by_latin = {}
    for r in rows:
        latin = (r[3] or "").strip()
        if not latin or r[8] not in ("Art", "Unterart"):
            continue  # skip "unbestimmt"/"Hybrid" and the two placeholder rows (no @3)
        by_latin[latin] = {
            "de": (r[5] or r[4] or "").strip(),  # Artname_deutsch_ornitho, falls back to Artname_deutsch
            "en": (r[6] or "").strip(),
            "bzcStart": to_md(r[9]),
            "bzcEnd": to_md(r[10]),
        }

    wishlist_latins = load_wishlist_latins()
    wishlist = []
    life_list_lookup = {}  # every "Art"/"Unterart" taxon: latin -> {de, en}, for annotating the user's own life list
    for latin, entry in by_latin.items():
        life_list_lookup[latin] = {"de": entry["de"], "en": entry["en"]}

    missing = []
    for latin in wishlist_latins:
        if latin in DROP:
            continue
        canonical = RENAME_CANONICAL.get(latin, latin)
        lookup_latin = LOOKUP_ONLY.get(latin, canonical)
        entry = by_latin.get(lookup_latin)
        if not entry:
            missing.append(latin)
            continue
        wishlist.append({
            "latin": canonical, "de": entry["de"], "en": entry["en"],
            "bzcStart": entry["bzcStart"], "bzcEnd": entry["bzcEnd"],
        })

    if missing:
        print("WARNING: no reference match for:", missing)

    wishlist.sort(key=lambda e: e["de"])
    out = {
        "source": os.path.basename(find_workbook()),
        "lifeListNames": life_list_lookup,
        "wishlist": wishlist,
    }
    dst = os.path.join(ROOT, "species_reference.json")
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1, sort_keys=True)

    with_bzc = sum(1 for e in wishlist if e["bzcStart"])
    print(f"wishlist: {len(wishlist)} species, {with_bzc} with a breeding-season window")
    print(f"lifeListNames: {len(life_list_lookup)} taxa")
    print("written:", dst)


if __name__ == "__main__":
    main()
