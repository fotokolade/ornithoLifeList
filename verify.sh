#!/bin/sh
# Checks that lifelist.exe is exactly the file published on the GitHub releases page (Linux, macOS),
# for instance before handing it on to a Windows computer. The counterpart of verify.bat / verify.ps1.
# Usage: sh verify.sh [path/to/lifelist.exe]
# Compares with lifelist.exe.sha256 next to the exe (attached to each release), or asks for the
# checksum shown in the release notes when that file is missing.

exe=${1:-"$(dirname "$0")/lifelist.exe"}
if [ ! -f "$exe" ]; then
    echo "$exe not found. Put this script next to lifelist.exe or pass its path."
    exit 2
fi

# sha256sum on Linux, shasum on macOS
if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$exe" | cut -d' ' -f1)
elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$exe" | cut -d' ' -f1)
else
    echo "Neither sha256sum nor shasum is installed."
    exit 2
fi

if [ -f "$exe.sha256" ]; then
    expected=$(tr -d '\r' < "$exe.sha256" | awk '{print $1; exit}')
    echo "Checksum from $(basename "$exe").sha256"
else
    printf "Paste the SHA256 checksum from the release page: "
    read -r expected
fi
expected=$(printf '%s' "$expected" | tr -d ' \r\n' | tr 'A-F' 'a-f')
case "$expected" in
    *[!0-9a-f]* | "")
        echo "That is not a SHA256 checksum (64 hexadecimal characters)."
        exit 2 ;;
esac
if [ ${#expected} -ne 64 ]; then
    echo "That is not a SHA256 checksum (64 hexadecimal characters)."
    exit 2
fi

echo "expected: $expected"
echo "actual:   $actual"
if [ "$actual" = "$expected" ]; then
    echo "OK: lifelist.exe matches the published checksum."
    exit 0
fi
echo "WARNING: the checksum does NOT match. This lifelist.exe is not the published one - do not run it."
exit 1
