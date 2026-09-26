"""Builds the standalone lifelist.exe for a GitHub release.

Usage:  python build.py [--skip-tests]      (on Windows also: double-click build.bat)

Needs `pip install pyinstaller`. Runs the tests first (a failing test stops the build), then builds
dist/lifelist.exe from lifelist.spec and writes its SHA256 checksum next to it, for the release
notes (README: "Ohne Python: fertige exe verwenden"). PyInstaller builds for the system it runs on,
so the Windows exe has to be built on Windows; elsewhere this makes a binary for that system.
"""
import argparse
import hashlib
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lifelist  # noqa: E402


def run_tests():
    print("Running the tests ...")
    res = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-t", "."], cwd=HERE)
    if res.returncode:
        sys.exit("Tests failed, nothing was built. Fix them or use --skip-tests.")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Builds dist/lifelist.exe with PyInstaller.")
    parser.add_argument("--skip-tests", action="store_true", help="build without running the tests first")
    opts = parser.parse_args()
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        sys.exit("PyInstaller is missing. Install it with:  pip install pyinstaller")
    if not opts.skip_tests:
        run_tests()

    version = lifelist.app_version()
    print(f"Building lifelist {version} ...")
    res = subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "lifelist.spec"], cwd=HERE)
    if res.returncode:
        sys.exit("PyInstaller failed, see its output above.")

    exe = os.path.join(HERE, "dist", "lifelist.exe" if os.name == "nt" else "lifelist")
    digest = sha256(exe)
    # Unix line ends, also when built on Windows: `sha256sum -c` on Linux chokes on a trailing \r
    with open(exe + ".sha256", "w", encoding="utf-8", newline="\n") as fh:
        fh.write(f"{digest}  {os.path.basename(exe)}\n")
    print(f"\nBuilt:   {exe} ({os.path.getsize(exe) / 1e6:.1f} MB)")
    print(f"SHA256:  {digest}")
    name = os.path.basename(exe)
    print(f"\nFor the release: tag v{version} on GitHub, attach {name}, {name}.sha256, verify.bat, verify.ps1 and verify.sh,"
          " and put the SHA256 in the release notes.")


if __name__ == "__main__":
    main()
