"""One-off/maintenance script: (re-)downloads the vendored Leaflet, Leaflet.markercluster and
Chart.js builds into vendor/, so lifelist.py can embed them into the generated HTML instead of
loading them from a CDN at runtime (see lifelist.py's build_vendor_js()/build_vendor_css()).

Not part of the normal build (lifelist.py only reads vendor/, it never fetches anything itself,
so building lifelist.html never needs internet access). Re-run this by hand to bump a version;
update the version numbers below first.

Licenses: Leaflet is BSD-2-Clause; Leaflet.markercluster and Chart.js are MIT. All three permit
bundling/redistribution; see README for attribution.

Usage: python tools/update_vendor.py
Requires: internet access (dev-only, not needed to build/use the app itself)
"""
import os
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VENDOR = os.path.join(ROOT, "vendor")

LEAFLET_VERSION = "1.9.4"
CLUSTER_VERSION = "1.5.3"
CHARTJS_VERSION = "4.5.1"

FILES = {
    "leaflet.min.js": f"https://cdnjs.cloudflare.com/ajax/libs/leaflet/{LEAFLET_VERSION}/leaflet.min.js",
    "leaflet.min.css": f"https://cdnjs.cloudflare.com/ajax/libs/leaflet/{LEAFLET_VERSION}/leaflet.min.css",
    "leaflet.markercluster.min.js": f"https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/{CLUSTER_VERSION}/leaflet.markercluster.min.js",
    "MarkerCluster.min.css": f"https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/{CLUSTER_VERSION}/MarkerCluster.min.css",
    "MarkerCluster.Default.min.css": f"https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/{CLUSTER_VERSION}/MarkerCluster.Default.min.css",
    "chart.umd.min.js": f"https://cdnjs.cloudflare.com/ajax/libs/Chart.js/{CHARTJS_VERSION}/chart.umd.min.js",
    # referenced via relative url(images/...) in leaflet.min.css and inlined as data URIs at build
    # time (see lifelist.py); not the default marker icon, which this app never actually uses
    os.path.join("images", "layers.png"): f"https://cdnjs.cloudflare.com/ajax/libs/leaflet/{LEAFLET_VERSION}/images/layers.png",
    os.path.join("images", "layers-2x.png"): f"https://cdnjs.cloudflare.com/ajax/libs/leaflet/{LEAFLET_VERSION}/images/layers-2x.png",
}


def main():
    for name, url in FILES.items():
        dst = os.path.join(VENDOR, name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        print(f"{name} <- {url}")
        with urllib.request.urlopen(url, timeout=20) as resp:
            with open(dst, "wb") as fh:
                fh.write(resp.read())
    print("done:", VENDOR)


if __name__ == "__main__":
    main()
