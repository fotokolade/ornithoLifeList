"""Synthetic sightings in the shape of an ornitho.de JSON export (only the fields lifelist.py reads)."""
from datetime import date, timedelta


def sighting(latin, name, day, place_id="1", place="Teich am Wald", municipality="Musterdorf (SN, GR)",
             lat="51.1", lon="14.5", count="1", estimation="EXACT_VALUE", time=None, atlas=None,
             photo=False, rarity="common", sys_order="100"):
    observer = {
        "count": count,
        "estimation_code": estimation,
        "timing": {
            "@notime": "0" if time else "1",
            "@ISO8601": f"{day}T{time or '00:00'}:00+02:00",
        },
    }
    if atlas:
        observer["atlas_code"] = {"@id": "1", "#text": atlas}
    if photo:
        observer["medias"] = [{"type": "PHOTO"}]
    return {
        "date": {"@ISO8601": f"{day}T00:00:00+02:00"},
        "species": {"name": name, "latin_name": latin, "sys_order": sys_order, "rarity": rarity},
        "place": {"@id": place_id, "name": place, "municipality": municipality,
                  "coord_lat": lat, "coord_lon": lon},
        "observers": [observer],
    }


SPECIES = [
    ("Parus major", "Kohlmeise"), ("Cyanistes caeruleus", "Blaumeise"), ("Erithacus rubecula", "Rotkehlchen"),
    ("Turdus merula", "Amsel"), ("Ardea cinerea", "Graureiher"), ("Anas platyrhynchos", "Stockente"),
    ("Buteo buteo", "Mäusebussard"), ("Corvus corax", "Kolkrabe"), ("Sitta europaea", "Kleiber"),
    ("Fringilla coelebs", "Buchfink"),
]
PLACES = [
    ("1", "Teich am Wald", "Musterdorf (SN, GR)", "51.10", "14.50"),
    ("2", "Heide Nord [Teilfläche]", "Beispielstadt (SN, BZ)", "51.30", "14.20"),
    ("3", "Flussaue", "Anderort (BB, SPN)", "51.70", "14.30"),
]


def sample_export(years=(2023, 2024)):
    """A few hundred sightings spread over every month of `years`, several places, some with time,
    breeding code and photo, plus one collective taxon, one escape and one explicit zero count."""
    out = []
    i = 0
    for year in years:
        d = date(year, 1, 3)
        while d.year == year:
            for k in range(3):
                latin, name = SPECIES[(i + k) % len(SPECIES)]
                pid, place, muni, lat, lon = PLACES[(i + k) % len(PLACES)]
                out.append(sighting(
                    latin, name, d.isoformat(), place_id=pid, place=place, municipality=muni, lat=lat, lon=lon,
                    count=str(1 + (i % 7)), time=f"{6 + (i % 14):02d}:{(i * 7) % 60:02d}" if i % 3 else None,
                    atlas="B4" if d.month in (4, 5, 6) and k == 0 else None, photo=i % 5 == 0,
                    sys_order=str(100 + (i + k) % len(SPECIES)),
                ))
            i += 1
            d += timedelta(days=9)
    out.append(sighting("Larus argentatus / michahellis", "Silber-_oder_Mittelmeermöwe", f"{years[0]}-05-05"))
    out.append(sighting("Cygnus atratus", "Trauerschwan", f"{years[0]}-06-06", rarity="escaped"))
    out.append(sighting("Grus grus", "Kranich", f"{years[0]}-07-07", count="0"))
    return out
