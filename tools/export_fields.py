"""Lists which fields an ornitho.de export contains, without printing any of their values.

Usage:  python tools/export_fields.py [export.json]      (default: the newest export_*.json)

For every field path (e.g. observers[].coord_lat) it prints in how many sightings it occurs and what
kind of value it holds. For fields that look like coordinates it also counts how often they differ
from the place's own coordinates, which shows whether sightings carry a position of their own.
Names, places, dates and coordinates themselves are never printed, so the output is safe to share.
"""
import glob
import json
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


if __name__ == "__main__":
    main()
