# PyInstaller spec for the standalone lifelist.exe (see README's release section).
# Build with:  pyinstaller lifelist.spec
# Bundles the same files lifelist.py reads at dev time (template.html, src/*.js, vendor/, and
# species_reference.json) into the exe itself; only the user's export_*.json and the generated
# lifelist.html live next to the exe at runtime.
a = Analysis(
    ["lifelist.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("template.html", "."),
        ("species_reference.json", "."),
        ("src", "src"),
        ("vendor", "vendor"),
    ],
    hiddenimports=[],
    hookspath=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="lifelist",
    console=True,
    onefile=True,
)
