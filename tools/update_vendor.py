"""One-off/maintenance script: (re-)downloads the vendored Leaflet, Leaflet.markercluster and
Chart.js builds into vendor/, so lifelist.py can embed them into the generated HTML instead of
loading them from a CDN at runtime (see lifelist.py's build_vendor_js()/build_vendor_css()).

Not part of the normal build (lifelist.py only reads vendor/, it never fetches anything itself,
so building lifelist.html never needs internet access). Re-run this by hand to bump a version;
update the version numbers below first.

Licenses: Leaflet is BSD-2-Clause; Leaflet.markercluster and Chart.js are MIT. All three permit
bundling/redistribution as long as their copyright notice goes along: HEADERS puts it in front of
the minified files that lack one. See the README for attribution.

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

# The minified Leaflet and Leaflet.markercluster builds carry no copyright notice, but their licences
# require it to travel with every copy (and so with every generated lifelist.html and the exe): it is put
# in front of them here. "/*!" comments survive minifiers and are copied into the page unchanged.
LEAFLET_LICENSE = """/*! Leaflet {version}, https://leafletjs.com
 * BSD 2-Clause License
 * Copyright (c) 2010-2023, Vladimir Agafonkin
 * Copyright (c) 2010-2011, CloudMade
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are
 * permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of
 *    conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list
 *    of conditions and the following disclaimer in the documentation and/or other materials
 *    provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
 * TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
"""
CLUSTER_LICENSE = """/*! Leaflet.markercluster {version}, https://github.com/Leaflet/Leaflet.markercluster
 * MIT License
 * Copyright 2012 David Leaver
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
"""
HEADERS = {
    "leaflet.min.js": LEAFLET_LICENSE.format(version=LEAFLET_VERSION),
    "leaflet.min.css": LEAFLET_LICENSE.format(version=LEAFLET_VERSION),
    "leaflet.markercluster.min.js": CLUSTER_LICENSE.format(version=CLUSTER_VERSION),
    "MarkerCluster.min.css": CLUSTER_LICENSE.format(version=CLUSTER_VERSION),
    "MarkerCluster.Default.min.css": CLUSTER_LICENSE.format(version=CLUSTER_VERSION),
}


def with_header(name, data):
    """`data` (bytes) with its licence header in front, once."""
    head = HEADERS.get(name, "").encode("utf-8")
    return data if not head or data.startswith(head) else head + data


def main():
    for name, url in FILES.items():
        dst = os.path.join(VENDOR, name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        print(f"{name} <- {url}")
        with urllib.request.urlopen(url, timeout=20) as resp:
            with open(dst, "wb") as fh:
                fh.write(with_header(name, resp.read()))
    print("done:", VENDOR)


if __name__ == "__main__":
    main()
