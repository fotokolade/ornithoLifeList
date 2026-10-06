"""Builds lifelist.html from one or more ornitho.de JSON exports.

Usage:  python lifelist.py [--source export.json [export2.json ...]] [--redact]
        python lifelist.py --check-update
        lifelist.exe [same options]
Without --source, every export_*.json next to the script (or the exe) is read, so the history can be
split into several exports (e.g. one per year) and only the current one needs to be re-downloaded.
Sightings contained in more than one file are counted once; the newest export wins.
--redact writes lifelist_redacted.html without any place names or coordinates.
--check-update asks GitHub whether a newer release exists (only the version number is fetched,
nothing is sent) and builds nothing. A normal build never goes online.
"""
import argparse
import base64
import collections
import datetime
import glob
import http.client
import json
import os
import re
import sys
import traceback
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

REPO = "fotokolade/ornithoLifeList"
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
    "regions.js", "targets.js", "planner.js", "activity.js", "tours.js", "map.js", "timelapse.js", "app.js",
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


def find_exports():
    # escaped: a folder like "Vögel [2024]" would otherwise be read as a pattern and match nothing
    files = glob.glob(os.path.join(glob.escape(HERE), "export_*.json"))
    if not files:
        sys.exit("No export_*.json found.")
    return files


def expand_sources(patterns):
    """--source values -> file paths. Wildcards are expanded here as well, because cmd.exe and
    PowerShell pass them through literally instead of expanding them like a Unix shell."""
    files = []
    for pattern in patterns:
        # an existing path is taken literally, so names with [ ] (e.g. "Vögel [2024]/export.json") still work
        matches = glob.glob(pattern) if glob.has_magic(pattern) and not os.path.exists(pattern) else [pattern]
        if not matches:
            sys.exit(f"No file matches {pattern}.")
        if matches == [pattern] and not os.path.isfile(pattern):
            sys.exit(f"File not found: {pattern}")
        files.extend(matches)
    return files


def sighting_id(s):
    """ornitho's own sighting id; the whole record serves as fallback for exports without one.
    id_universal comes first: it is unique across the ornitho portals, whereas id_sighting is only
    unique within one, so exports from e.g. ornitho.de and ornitho.lu could share an id_sighting."""
    # a malformed record (no dict, no observer list) gets no id of its own here: build_data skips it with a reason
    o = s.get("observers") if isinstance(s, dict) else None
    o = o[0] if isinstance(o, list) and o and isinstance(o[0], dict) else {}
    if o.get("id_universal"):
        return "u" + str(o["id_universal"])
    if o.get("id_sighting"):
        return "s" + str(o["id_sighting"])
    return json.dumps(s, sort_keys=True)


def merge_exports(exports):
    """exports: [(name, sightings)] ordered oldest first. Returns the sightings of all exports with
    duplicates removed (overlapping periods, or an old full export next to newer partial ones). For a
    sighting in several files the record of the later file is kept, so edits made on ornitho since
    the older export show up."""
    merged = {}
    for _, sightings in exports:
        for s in sightings:
            merged[sighting_id(s)] = s
    return list(merged.values())


def export_time(path):
    """When the export was made: the timestamp ornitho puts into the file name
    (export_23283_77699_20260919_002546.json), which survives copying and unzipping, unlike the
    modification time -- that only serves as fallback for files named otherwise."""
    m = re.search(r"_(\d{8}_\d{6})\.json$", os.path.basename(path), re.IGNORECASE)
    if m:
        try:
            return datetime.datetime.strptime(m.group(1), "%Y%m%d_%H%M%S").timestamp()
        except ValueError:
            pass
    return os.path.getmtime(path)


NOT_AN_EXPORT = "Is it the JSON export from ornitho.de? See HOWTO.md."


def load_export(path):
    """The sightings of one export file. A file that cannot be read, or is no ornitho.de JSON export, stops
    the run with a message naming it (no traceback: double-clicking users of the exe only see this)."""
    name = os.path.basename(path)
    try:
        # utf-8-sig: a file saved again by a Windows editor may start with a byte order mark
        with open(path, encoding="utf-8-sig") as fh:
            doc = json.load(fh)
    except OSError as e:
        sys.exit(f"Cannot read {name}: {e.strerror or e}.")
    except UnicodeDecodeError:
        sys.exit(f"{name} is not a text file in UTF-8. {NOT_AN_EXPORT}")
    except json.JSONDecodeError as e:
        sys.exit(f"{name} is not valid JSON ({e.msg}, line {e.lineno}). {NOT_AN_EXPORT}")
    data = doc.get("data") if isinstance(doc, dict) else None
    sightings = data.get("sightings") if isinstance(data, dict) else None
    if not isinstance(sightings, list):
        sys.exit(f"{name} contains no list of sightings (data.sightings). {NOT_AN_EXPORT}")
    return sightings


def load_exports(paths):
    """Reads the given export files, oldest (see export_time) first. Returns [(basename, sightings)]."""
    return [(os.path.basename(path), load_export(path))
            for path in sorted({os.path.abspath(p) for p in paths}, key=lambda p: (export_time(p), p))]


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
    tm = o.get("timing")
    tm = tm if isinstance(tm, dict) else {}
    iso = str(tm.get("@ISO8601") or "")
    if tm.get("@notime") != "0" or len(iso) < 16:
        return -1
    try:
        return int(iso[11:13]) * 60 + int(iso[14:16])
    except ValueError:
        return -1


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


def to_int(value, default):
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def place_coords(pl):
    """(lat, lon) of a place, rounded; (0, 0), which the page reads as "no coordinates", when they are
    missing or no numbers."""
    try:
        lat, lon = float(pl.get("coord_lat")), float(pl.get("coord_lon"))
    except (TypeError, ValueError):
        return 0, 0
    return round(lat, 4), round(lon, 4)


def check_sighting(s):
    """The parts of an export record the page cannot do without: (observer, species, place, day).
    Raises ValueError naming what is missing. Smaller flaws are mended where they are read instead
    (a count that is no number counts as 0, a place without usable coordinates is kept without them)."""
    o = s.get("observers") if isinstance(s, dict) else None
    o = o[0] if isinstance(o, list) and o else None
    if not isinstance(o, dict):
        raise ValueError("no observer data")
    sp, pl, date = s.get("species"), s.get("place"), s.get("date")
    if not isinstance(sp, dict) or not str(sp.get("latin_name") or "").strip() or not str(sp.get("name") or "").strip():
        raise ValueError("no species")
    if not isinstance(pl, dict) or not isinstance(pl.get("@id"), (str, int)) or not pl.get("@id"):
        raise ValueError("no place")
    day = str(date.get("@ISO8601") or "")[:10] if isinstance(date, dict) else ""
    # YYYY-MM-DD only: the page reads year, month and day by position, and Python 3.11+ would also take "20240101"
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            raise ValueError
        datetime.date.fromisoformat(day)
    except ValueError:
        raise ValueError("no valid date") from None
    return o, sp, pl, day


def build_data(sightings, english_by_latin, skipped=None):
    """skipped: a list that gets the reason for each record left out because it lacks what the page needs."""
    taxa = {}     # key -> dict
    places = {}   # ornitho place id -> index
    place_rows = []
    obs = []

    for s in sightings:
        try:
            o, sp, pl, day = check_sighting(s)
        except ValueError as e:
            if skipped is not None:
                skipped.append(str(e))
            continue
        if o.get("count") == "0" and o.get("estimation_code") == "EXACT_VALUE":
            continue  # explicit zero count: reported as not seen
        latin, sp_name = str(sp["latin_name"]), str(sp["name"])
        escaped = sp.get("rarity") == "escaped" or "domestica" in latin
        key, collective = species_key(latin, sp_name, escaped)
        t = taxa.setdefault(key, {
            "names": [], "escaped": True, "collective": collective,
            "order": [], "exact": None, "idx": len(taxa),
        })
        t["escaped"] = t["escaped"] and escaped
        t["order"].append(to_int(sp.get("sys_order"), 99999))  # unknown: sorted last
        name = sp_name.replace("_", " ")
        if latin.strip() == key:
            t["exact"] = name
        t["names"].append(name)

        pid = pl["@id"]
        if pid not in places:
            muni, state, county = parse_municipality(str(pl.get("municipality") or ""))
            place_rows.append([
                re.sub(r"\s*\[[^\]]*\]\s*$", "", str(pl.get("name") or "?")),
                muni, state, county, *place_coords(pl),
            ])
            places[pid] = len(place_rows) - 1

        count = to_int(o.get("count"), 0)
        obs.append([
            t["idx"], day, places[pid], count,
            1 if any(isinstance(m, dict) and m.get("type") == "PHOTO" for m in o.get("medias") or []) else 0, atlas_code(o), minute_of_day(o),
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
PLANNER_SCOPES = ["de", "eu"]


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


def build_page_data(sightings, source_names, redact, skipped=None):
    """source_names: the export file name, or a list of them when several exports were merged.
    skipped: see build_data."""
    if isinstance(source_names, str):
        source_names = [source_names]
    english_by_latin, wishlist_rows, rare_rows = load_species_reference()
    data = build_data(sightings, english_by_latin, skipped)
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
        "sources": [] if redact else sorted(source_names),  # the file names carry the ornitho user ID
    }
    return data


def render_html(data):
    with open(os.path.join(RESOURCES, "template.html"), encoding="utf-8") as fh:
        tpl = fh.read()
    # The data may hold any text (place names are free text on ornitho): "<" only ever occurs inside
    # JSON strings, so writing it as \\u003c keeps the JSON the same and leaves nothing the HTML parser
    # could read as markup, not even "<!--<script>", which would otherwise swallow the end of the block.
    parts = {
        "DATA_JSON": json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c"),
        "APP_JS": re.sub(r"</(script)", r"<\\/\1", build_app_js(), flags=re.IGNORECASE),
        "VENDOR_JS": re.sub(r"</(script)", r"<\\/\1", build_vendor_js(), flags=re.IGNORECASE),
        "VENDOR_CSS": re.sub(r"</(style)", r"<\\/\1", build_vendor_css(), flags=re.IGNORECASE),
    }
    # one pass over the template: what is put in is not searched again, so a placeholder's name inside
    # the data or the code (a place called "__APP_JS__", a comment) stays as it is
    return re.sub(r"__(DATA_JSON|APP_JS|VENDOR_JS|VENDOR_CSS)__", lambda m: parts[m.group(1)], tpl)


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
    parser = argparse.ArgumentParser(description="Builds lifelist.html from one or more ornitho.de JSON exports.")
    parser.add_argument("--source", "-s", nargs="+", metavar="FILE",
                        help="export JSON file(s), wildcards allowed (default: every export_*.json)")
    parser.add_argument("--redact", action="store_true", help="write lifelist_redacted.html without place data")
    parser.add_argument("--check-update", action="store_true", help="only check GitHub for a newer version, build nothing")
    parser.add_argument("--version", action="version", version=f"%(prog)s {app_version()}")
    opts = parser.parse_args()  # unknown flags abort, so a typo cannot produce an unredacted file
    if opts.check_update:
        check_update_now()
        return
    redact = opts.redact
    exports = load_exports(expand_sources(opts.source) if opts.source else find_exports())
    for name, sightings in exports:
        print(f"Source: {name} ({len(sightings)} sightings)")
    sightings = merge_exports(exports)
    duplicates = sum(len(s) for _, s in exports) - len(sightings)
    if duplicates:
        print(f"Duplicates (contained in more than one export, counted once): {duplicates}")

    skipped = []
    data = build_page_data(sightings, [name for name, _ in exports], redact, skipped)
    if skipped:
        reasons = ", ".join(f"{n}x {why}" for why, n in collections.Counter(skipped).most_common())
        print(f"Skipped {len(skipped)} of {len(sightings)} records the page cannot use ({reasons}).")
    if not data["obs"]:
        sys.exit("No observations to show: the export contains no usable sightings. Nothing was written.")
    dst = os.path.join(HERE, "lifelist_redacted.html" if redact else "lifelist.html")
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(render_html(data))

    counted = {r[0] for r in data["obs"] if data["sp"][r[0]][3] == 0}
    print(f"Observations: {len(data['obs'])}, taxa: {len(data['sp'])}, "
          f"species (excluding escapes and collective taxa): {len(counted)}")
    print("Written:", dst, f"({os.path.getsize(dst) / 1e6:.2f} MB)")


def run_frozen():
    """main() for the exe: its console window closes the instant the process ends, so a double-clicking
    user would never see what happened. Every ending, an unexpected error too, is shown and the window
    waits for Enter; the exit code still tells a calling script whether it worked."""
    code = 0
    try:
        main()
    except SystemExit as e:  # sys.exit("message") of a known problem, or argparse's --help/--version/errors
        if isinstance(e.code, str):
            print(e.code, file=sys.stderr)
            code = 1
        else:
            code = e.code or 0
    except Exception:  # anything unforeseen: the details, and where to report them
        traceback.print_exc()
        print(f"\nSomething went wrong. Please report the message above at https://github.com/{REPO}/issues", file=sys.stderr)
        code = 1
    try:
        input("\nDone. Press Enter to close." if code == 0 else "\nStopped. Press Enter to close.")
    except EOFError:  # started without a console to answer from (e.g. by a scheduled task)
        pass
    return code


if __name__ == "__main__":
    if getattr(sys, "frozen", False):
        sys.exit(run_frozen())
    main()
