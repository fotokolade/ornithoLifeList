"""Builds lifelist.html from an ornitho.de JSON export.

Usage:  python lifelist.py [--source export.json] [--redact]
        python lifelist.py --check-update
        lifelist.exe [same options]
Without --source, the newest export_*.json next to the script (or the exe) is used.
--redact writes lifelist_redacted.html without any place names or coordinates.
--check-update asks GitHub whether a newer release exists (only the version number is fetched,
nothing is sent) and builds nothing. A normal build never goes online.
"""
import argparse
import base64
import glob
import http.client
import json
import os
import re
import sys
import urllib.request

# Two different base directories are needed once this script can also run as a PyInstaller-frozen
# exe: RESOURCES is where the app's own bundled files live (template.html, src/, vendor/,
# species_reference.json) -- inside the exe's temp extraction dir (sys._MEIPASS) when frozen, next
# to this script otherwise. HERE is where the user's own files live: the export_*.json to read and
# the lifelist.html to write, both expected next to the exe (or next to this script in dev mode).
if getattr(sys, "frozen", False):
    RESOURCES = sys._MEIPASS
    HERE = os.path.dirname(os.path.abspath(sys.executable))
else:
    RESOURCES = HERE = os.path.dirname(os.path.abspath(__file__))

REPO = "fotokolade/OrnithoLifeList"
RELEASES_URL = f"https://github.com/{REPO}/releases"
LATEST_RELEASE_API = f"https://api.github.com/repos/{REPO}/releases/latest"
UPDATE_TIMEOUT = 10  # seconds; enough for a slow connection, short enough not to hang offline or behind a stuck proxy

FLAG_ESCAPED = 1
FLAG_COLLECTIVE = 2

# Concatenation order for src/*.js -> the page's single <script> tag. There are no imports (the
# page must work from file://, where <script type="module"> is blocked by CORS), so this fixed
# order stands in for one: later files rely on function hoisting to see earlier consts/functions.
APP_JS_FILES = [
    "i18n.js", "counties.js", "data.js", "charts.js", "heat.js", "overview.js", "list.js",
    "regions.js", "targets.js", "planner.js", "activity.js", "tours.js", "map.js", "app.js",
]

# Leaflet, its marker-cluster plugin, and Chart.js are vendored (see vendor/, tools/update_vendor.py)
# rather than fetched from a CDN at runtime, so the map and charts work fully offline too. Both
# libraries are permissively licensed (Leaflet: BSD-2-Clause, Leaflet.markercluster/Chart.js: MIT) —
# see README for attribution.
VENDOR_JS_FILES = ["leaflet.min.js", "leaflet.markercluster.min.js", "chart.umd.min.js"]
VENDOR_CSS_FILES = ["leaflet.min.css", "MarkerCluster.min.css", "MarkerCluster.Default.min.css"]
# images referenced via relative url(images/...) in leaflet.min.css; inlined as data URIs since the
# CSS itself is embedded inline rather than served from vendor/ as a real file. The default marker
# icon isn't included here: this app always passes its own custom `icon:`, so L.Icon.Default (the
# only thing that would ever request it) is never instantiated and the image never fetched.
VENDOR_CSS_IMAGES = ["layers.png", "layers-2x.png"]


def build_app_js():
    parts = []
    for name in APP_JS_FILES:
        with open(os.path.join(RESOURCES, "src", name), encoding="utf-8") as fh:
            parts.append(fh.read().rstrip("\n"))
    return "\n".join(parts)


def build_vendor_js():
    parts = []
    for name in VENDOR_JS_FILES:
        with open(os.path.join(RESOURCES, "vendor", name), encoding="utf-8") as fh:
            parts.append(fh.read().rstrip("\n"))
    return "\n".join(parts)


def build_vendor_css():
    parts = []
    for name in VENDOR_CSS_FILES:
        with open(os.path.join(RESOURCES, "vendor", name), encoding="utf-8") as fh:
            css = fh.read()
        if name == "leaflet.min.css":
            for image in VENDOR_CSS_IMAGES:
                with open(os.path.join(RESOURCES, "vendor", "images", image), "rb") as fh:
                    data_uri = "data:image/png;base64," + base64.b64encode(fh.read()).decode("ascii")
                css = css.replace(f"images/{image}", data_uri)
        parts.append(css)
    return "\n".join(parts)


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


def own_position(o):
    """Where this record was made, when the export knows it more precisely than its place, as
    (lat, lon, source): source 1 is the phone's GPS position (gps_lat/gps_lon, where the observer
    stood), 2 a point set by hand (coord_lat/coord_lon with precision "precise", mostly where the bird
    was). None for records tied to a place or a grid square."""
    for source, (lat, lon, ok) in enumerate((("gps_lat", "gps_lon", True), ("coord_lat", "coord_lon", o.get("precision") == "precise")), 1):
        try:
            la, lo = float(o.get(lat) or 0), float(o.get(lon) or 0)
        except (TypeError, ValueError):
            continue
        if ok and la and lo:
            return round(la, 5), round(lo, 5), source
    return None


def parse_municipality(text):
    # county codes may end in "*": ornitho's mark for the district around a city of the same code (BY, A*)
    m = re.match(r"^(.*?)\s*\((\w+),\s*([\w*]+)\)$", text or "")
    if m:
        return m.group(1), m.group(2), m.group(3)
    return (text or "").strip(), "", ""


def load_species_reference():
    """Latin-name lookups generated from the official ornitho.de species list, plus GBIF-derived
    occurrence windows for non-breeding species; see tools/extract_species_reference.py and
    tools/fetch_occurrence_windows.py. Returns (english_by_latin, wishlist_rows, rare_rows): rare_rows are the
    species of the ornitho.de list that are not on the wishlist, mostly rare vagrants, as [latin, german, english]."""
    path = os.path.join(RESOURCES, "species_reference.json")
    with open(path, encoding="utf-8") as fh:
        ref = json.load(fh)
    english_by_latin = {latin: names["en"] for latin, names in ref["lifeListNames"].items() if names.get("en")}
    wishlist_rows = [
        [e["latin"], e["de"], e["en"], e["bzcStart"], e["bzcEnd"], e.get("occStart"), e.get("occEnd")]
        for e in ref["wishlist"]
    ]
    # by Latin or German name: the wishlist may use a newer genus (Astur gentilis, Accipiter gentilis: Habicht)
    on_wishlist = {e["latin"] for e in ref["wishlist"]} | {e["de"] for e in ref["wishlist"]}
    # plain binomials only: no "A / B" pairs, hybrids, "sp." or subspecies
    rare_rows = [[latin, names["de"], names.get("en") or ""] for latin, names in ref["lifeListNames"].items()
                 if latin not in on_wishlist and names.get("de") not in on_wishlist and len(latin.split()) == 2
                 and "/" not in latin and " x " not in latin and "sp." not in latin and names.get("de")]
    return english_by_latin, wishlist_rows, rare_rows


def build_data(sightings, english_by_latin):
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
            *(own_position(o) or ()),  # only when there is one: keeps the page small
        ])

    obs.sort(key=lambda r: r[1])  # stable: keeps export order within a day

    sp_rows = [None] * len(taxa)
    for key, t in taxa.items():
        flags = (FLAG_ESCAPED if t["escaped"] else 0) | (FLAG_COLLECTIVE if t["collective"] else 0)
        latin = key.split("|")[0]
        sp_rows[t["idx"]] = [t["exact"] or t["names"][0], latin, min(t["order"]), flags, english_by_latin.get(latin, "")]

    return {"sp": sp_rows, "pl": place_rows, "obs": obs}


# the holiday planner's data per scope, made from GBIF by tools/fetch_gbif_planner.py; a missing file
# just leaves its scope out of the planner
PLANNER_SCOPES = ["de-states", "de", "eu"]


def load_planner_data():
    out = {}
    for scope in PLANNER_SCOPES:
        path = os.path.join(RESOURCES, "data", f"gbif_planner_{scope}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                out[scope] = json.load(fh)
    return out


def load_tour_diagram():
    """The diagram of the tour settings per language (tools/make_tour_diagram.py)."""
    out = {}
    for lang in ("de", "en"):
        path = os.path.join(RESOURCES, "data", f"tour-settings-{lang}.svg")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                out[lang] = fh.read()
    return out


def build_page_data(sightings, source_name, redact):
    english_by_latin, wishlist_rows, rare_rows = load_species_reference()
    data = build_data(sightings, english_by_latin)
    data["euro"] = wishlist_rows
    data["rare"] = rare_rows
    data["planner"] = load_planner_data()
    if not redact:  # the tours, whose settings it explains, are left out of a redacted page
        data["tourDiagram"] = load_tour_diagram()
    if redact:  # remove place data from the file itself, not just from the display
        data["pl"] = [["", "", r[2], r[3], 0, 0] for r in data["pl"]]
        data["obs"] = [r[:7] for r in data["obs"]]
    data["meta"] = {
        "redacted": redact,
        "source": source_name,
    }
    return data


def render_html(data):
    with open(os.path.join(RESOURCES, "template.html"), encoding="utf-8") as fh:
        tpl = fh.read()
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    app_js = build_app_js().replace("</script", "<\\/script")
    vendor_js = build_vendor_js().replace("</script", "<\\/script")
    vendor_css = build_vendor_css().replace("</style", "<\\/style")
    # vendor/data/app placeholders first, in increasing order of "how likely is this blob to
    # accidentally contain another placeholder's literal text" — str.replace() replaces every
    # occurrence, so once a large blob is substituted in, any later replace() pass would also hit
    # a stray match inside *that* blob (this bit us once: a JS comment mentioning "__VENDOR_JS__")
    return (tpl.replace("__VENDOR_CSS__", vendor_css).replace("__VENDOR_JS__", vendor_js)
            .replace("__DATA_JSON__", blob).replace("__APP_JS__", app_js))


def app_version():
    """The app's version, read from src/i18n.js so the page footer and the CLI can never disagree."""
    with open(os.path.join(RESOURCES, "src", "i18n.js"), encoding="utf-8") as fh:
        return re.search(r'APP_VERSION = "([^"]+)"', fh.read()).group(1)


def parse_version(text):
    """"v1.2.3" or "1.2.3" -> (1, 2, 3); anything else (e.g. a pre-release tag) -> None."""
    m = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", (text or "").strip())
    return tuple(int(x) for x in m.groups()) if m else None


def latest_release(timeout=UPDATE_TIMEOUT):
    """(tag, url) of the newest published GitHub release, or None when GitHub can't be reached."""
    req = urllib.request.Request(LATEST_RELEASE_API, headers={
        "Accept": "application/vnd.github+json", "User-Agent": f"OrnithoLifeList/{app_version()}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            rel = json.load(resp)
        return rel["tag_name"], rel.get("html_url") or RELEASES_URL
    except (OSError, http.client.HTTPException, ValueError, KeyError, TypeError):  # offline, timeout, HTTP error, cut-off response, unexpected JSON
        return None


def update_message(current, release):
    """The line to print for a release lookup result, or None when there is nothing to report."""
    if release is None:
        return None
    tag, url = release
    latest, mine = parse_version(tag), parse_version(current)
    if latest is None or mine is None or latest <= mine:
        return None
    what = "lifelist.exe" if getattr(sys, "frozen", False) else "the new version"
    return f"Update available: {tag} (you have v{current}). Download {what} from {url}"


def check_update_now():
    """--check-update: says whether a newer release exists, all is well, or GitHub can't be reached."""
    current = app_version()
    release = latest_release()
    if release is None:
        print(f"Could not reach GitHub. Check for new versions at {RELEASES_URL}")
    else:
        print(update_message(current, release) or f"lifelist is up to date (v{current}, latest release {release[0]}).")


def main():
    parser = argparse.ArgumentParser(description="Builds lifelist.html from an ornitho.de JSON export.")
    parser.add_argument("--source", "-s", help="export JSON file (default: newest export_*.json)")
    parser.add_argument("--redact", action="store_true", help="write lifelist_redacted.html without place data")
    parser.add_argument("--check-update", action="store_true", help="only check GitHub for a newer version, build nothing")
    parser.add_argument("--version", action="version", version=f"%(prog)s {app_version()}")
    opts = parser.parse_args()  # unknown flags abort, so a typo cannot produce an unredacted file
    if opts.check_update:
        check_update_now()
        return
    redact = opts.redact
    src = opts.source or find_export()
    src = os.path.abspath(src)
    print("Source:", src)
    with open(src, encoding="utf-8") as fh:
        sightings = json.load(fh)["data"]["sightings"]

    data = build_page_data(sightings, os.path.basename(src), redact)
    dst = os.path.join(HERE, "lifelist_redacted.html" if redact else "lifelist.html")
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(render_html(data))

    counted = {r[0] for r in data["obs"] if data["sp"][r[0]][3] == 0}
    print(f"Observations: {len(data['obs'])}, taxa: {len(data['sp'])}, "
          f"species (excluding escapes and collective taxa): {len(counted)}")
    print("Written:", dst, f"({os.path.getsize(dst) / 1e6:.2f} MB)")


if __name__ == "__main__":
    # When frozen into an exe, the console window closes the instant the process exits, so a
    # double-clicking user would never see the output (including an error like "no export found").
    # Keep the window open with a pause in that case, on both success and a controlled sys.exit().
    frozen = getattr(sys, "frozen", False)
    try:
        main()
    except SystemExit as e:
        if isinstance(e.code, str):
            print(e.code, file=sys.stderr)
        if not frozen:
            raise
    if frozen:
        input("\nDone. Press Enter to close.")
