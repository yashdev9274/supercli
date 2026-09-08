#!/usr/bin/env python3
"""Validate a distribution app without launching it or reading user credentials."""
import json
import pathlib
import plistlib
import subprocess
import sys


def verify(app, version, build):
    with (app / "Contents/Info.plist").open("rb") as source:
        info = plistlib.load(source)
    expected = {
        "CFBundleIdentifier": "ai.supercode.desktop",
        "CFBundleShortVersionString": version,
        "CFBundleVersion": build,
        "CFBundleExecutable": "Supercode",
        "CFBundleIconName": "AppIcon",
        "LSMinimumSystemVersion": "14.0",
    }
    for key, value in expected.items():
        if info.get(key) != value:
            raise ValueError(f"Unexpected {key}: {info.get(key)!r}; expected {value!r}")
    binary = app / "Contents/MacOS/Supercode"
    subprocess.run(["lipo", str(binary), "-verify_arch", "arm64", "x86_64"], check=True)
    resources = app / "Contents/Resources"
    for name in ("AppIcon.icns", "Assets.car", "terminal-contracts.json"):
        if not (resources / name).is_file() or (resources / name).stat().st_size == 0:
            raise ValueError(f"Missing bundle resource: {name}")
    with (resources / "terminal-contracts.json").open() as source:
        json.load(source)
    for path in app.rglob("*"):
        if path.name == ".env" or path.name.startswith(".env.") or path.suffix in (".p12", ".p8", ".key", ".swift"):
            raise ValueError(f"Unexpected development/credential file: {path.relative_to(app)}")
    print(f"Verified universal app {version} ({build}), icon and terminal contracts")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: verify-app.py Supercode.app X.Y.Z build-number")
    verify(pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3])
