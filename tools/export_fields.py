"""Lists which fields an ornitho.de export contains, without printing any of their values.

Usage:  python tools/export_fields.py [export.json]      (default: the newest export_*.json)

For every field path (e.g. observers[].coord_lat) it prints in how many sightings it occurs and what
kind of value it holds. For fields that look like coordinates it also counts how often they differ
from the place's own coordinates, which shows whether sightings carry a position of their own, and how
far the phone's GPS position lies from the point set for the bird (distances only).
Names, places, dates and coordinates themselves are never printed, so the output is safe to share.
"""
import glob
import json
import math
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def kind(v):
    if isinstance(v, dict):
        return "object"
    if isinstance(v, list):
        return "list"
    if isinstance(v, bool):
        return "yes/no"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        try:
            float(v)
            return "number (text)"
        except ValueError:
            return "text"
    return "empty"


def walk(value, path, seen, kinds):
    """Collects every field path below `value` into `seen` (one sighting) and their value kinds."""
    if isinstance(value, dict):
        for k, v in value.items():
            p = f"{path}.{k}" if path else k
            seen.add(p)
            kinds[p][kind(v)] += 1
            walk(v, p, seen, kinds)
    elif isinstance(value, list):
        for v in value:
            walk(v, path + "[]", seen, kinds)


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else max(glob.glob(os.path.join(HERE, "export_*.json")) or [""],
                                                   key=lambda f: os.path.getmtime(f) if f else 0)
    if not src:
        sys.exit("No export_*.json found. Pass the file:  python tools/export_fields.py export.json")
    with open(src, encoding="utf-8") as fh:
        sightings = json.load(fh)["data"]["sightings"]

    count, kinds = Counter(), defaultdict(Counter)
    own_position = Counter()  # coordinate-like observer fields that differ from the place's coordinates
    gps_vs_coord = []  # metres between gps_* (phone) and coord_* (point set) of one record: only the distances
    for s in sightings:
        seen = set()
        walk(s, "", seen, kinds)
        count.update(seen)
        place = s.get("place") or {}
        for o in s.get("observers") or []:
            for key in ("coord_lat", "coord_lon"):
                if key in o and key in place:
                    try:
                        if abs(float(o[key]) - float(place[key])) > 1e-6:
                            own_position[key] += 1
                    except (TypeError, ValueError):
                        pass
            try:
                g = float(o["gps_lat"]), float(o["gps_lon"])
                c = float(o["coord_lat"]), float(o["coord_lon"])
                if all(g) and all(c):
                    dy, dx = (g[0] - c[0]) * 111320, (g[1] - c[1]) * 111320 * math.cos(math.radians(c[0]))
                    gps_vs_coord.append(math.hypot(dx, dy))
            except (KeyError, TypeError, ValueError):
                pass
            for key, v in o.items():
                if key in ("precision", "estimation_code") and isinstance(v, str):
                    kinds[f"observers[].{key} = {v}"]["value"] += 1  # a short code, not personal data

    total = len(sightings)
    print(f"{total} sightings\n")
    print(f"{'field':60} {'in sightings':>14}  kind")
    for p in sorted(count):
        print(f"{p:60} {count[p]:>8} ({100 * count[p] / total:3.0f}%)  {', '.join(kinds[p])}")
    codes = sorted(p for p in kinds if " = " in p)
    if codes:
        print("\nCodes used:")
        for p in codes:
            print(f"  {p}: {kinds[p]['value']}")
    if own_position:
        print("\nObserver coordinates that differ from the place's coordinates:")
        for key, n in own_position.items():
            print(f"  observers[].{key}: {n} sightings ({100 * n / total:.0f}%)")
    else:
        print("\nNo observer coordinates that differ from the place's coordinates.")
    if not gps_vs_coord:
        print("\nNo sightings with both gps_* and coord_* to compare.")
    else:
        d = sorted(gps_vs_coord)
        same = sum(1 for x in d if x < 2)
        print(f"\ngps_* next to coord_* in {len(d)} sightings: the same point (< 2 m) in {same} ({100 * same / len(d):.0f}%),"
              f" otherwise typically {d[len(d) // 2]:.0f} m apart (90% within {d[int(len(d) * 0.9)]:.0f} m)")


if __name__ == "__main__":
    main()
