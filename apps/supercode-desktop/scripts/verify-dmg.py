#!/usr/bin/env python3
"""Read-only package validation; never installs or launches the application."""
import hashlib
import pathlib
import subprocess
import sys
import tempfile


def verify(dmg, version, build):
    checksum = pathlib.Path(str(dmg) + ".sha256").read_text().split()
    if checksum != [hashlib.sha256(dmg.read_bytes()).hexdigest(), dmg.name]:
        raise ValueError("DMG checksum mismatch")
    with tempfile.TemporaryDirectory(prefix="supercode-dmg-inspect-") as mount:
        subprocess.run([
            "hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint", mount, str(dmg),
        ], check=True, stdout=subprocess.DEVNULL)
        try:
            directory = pathlib.Path(mount)
            if {p.name for p in directory.iterdir() if not p.name.startswith(".")} != {"Supercode.app", "Applications"}:
                raise ValueError("Unexpected DMG contents")
            shortcut = directory / "Applications"
            if not shortcut.is_symlink() or shortcut.readlink() != pathlib.Path("/Applications"):
                raise ValueError("Missing Applications shortcut")
            app = directory / "Supercode.app"
            subprocess.run([
                sys.executable, str(pathlib.Path(__file__).with_name("verify-app.py")),
                str(app), version, build,
            ], check=True)
            subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
        finally:
            subprocess.run(["hdiutil", "detach", mount], check=True)
    print("Verified DMG checksum, contents, app signature and Applications shortcut")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("Usage: verify-dmg.py Supercode.dmg X.Y.Z build-number")
    verify(pathlib.Path(sys.argv[1]).resolve(), sys.argv[2], sys.argv[3])
