#!/usr/bin/env bash
set -euo pipefail
set +x
umask 022

fail() { printf '%s\n' "$*" >&2; exit 1; }
usage() {
  printf '%s\n' 'Usage: bash scripts/package-dmg.sh <production|development> <X.Y.Z> <build-number> [output-directory]'
  printf '%s\n' 'Production requires DEVELOPER_ID_APPLICATION and NOTARY_PROFILE; SIGNING_KEYCHAIN is optional.'
}
[[ $# -ge 3 && $# -le 4 ]] || { usage; exit 1; }
mode=$1
version=$2
build=$3
[[ "$mode" == production || "$mode" == development ]] || fail 'Invalid packaging mode'
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail 'Version must be X.Y.Z'
[[ "$build" =~ ^[1-9][0-9]{0,8}$ ]] || fail 'Build number must be a positive integer (up to 9 digits)'
[[ $(uname -s) == Darwin ]] || fail 'DMG packaging requires macOS'
root=$(cd "$(dirname "$0")/.." && pwd)
output=${4:-"$root/dist"}
mkdir -p "$output"
output=$(cd "$output" && pwd)
name="Supercode-$version-universal"
[[ "$mode" != development ]] || name="$name-development"
[[ ! -e "$output/$name.dmg" && ! -e "$output/$name.dmg.sha256" ]] || fail 'Output already exists; use a fresh directory or version'
for tool in xcodebuild xcodegen codesign hdiutil ditto python3; do
  command -v "$tool" >/dev/null || fail "Missing build tool: $tool"
done
sign_args=(--force)
notary_args=(--keychain-profile "${NOTARY_PROFILE:-}")
if [[ "$mode" == production ]]; then
  [[ ${DEVELOPER_ID_APPLICATION:-} == 'Developer ID Application: '* ]] || fail 'Set DEVELOPER_ID_APPLICATION to a Developer ID Application identity'
  [[ -n ${NOTARY_PROFILE:-} ]] || fail 'Set NOTARY_PROFILE to a stored notarytool Keychain profile'
  if [[ -n ${SIGNING_KEYCHAIN:-} ]]; then
    sign_args+=(--keychain "$SIGNING_KEYCHAIN")
    notary_args+=(--keychain "$SIGNING_KEYCHAIN")
  fi
  xcrun notarytool history "${notary_args[@]}" >/dev/null
fi
work=$(mktemp -d "${TMPDIR:-/tmp}/supercode-dmg.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$work/staging"
# Generate from the canonical spec, including version substitutions and new sources.
bash "$root/scripts/generate.sh"
xcodebuild -project "$root/SupercodeDesktop.xcodeproj" -scheme SupercodeDesktop \
  -configuration Release -destination 'generic/platform=macOS' \
  -derivedDataPath "$work/build" ARCHS='arm64 x86_64' ONLY_ACTIVE_ARCH=NO \
  CODE_SIGNING_ALLOWED=NO MARKETING_VERSION="$version" CURRENT_PROJECT_VERSION="$build" build
app="$work/staging/Supercode.app"
ditto "$work/build/Build/Products/Release/Supercode.app" "$app"
python3 "$root/scripts/verify-app.py" "$app" "$version" "$build"

notarize() {
  local artifact=$1
  local result=$2
  xcrun notarytool submit "$artifact" "${notary_args[@]}" \
    --wait --timeout 30m --output-format json > "$result"
  python3 - "$result" <<'PY'
import json, sys
with open(sys.argv[1]) as f:
    result = json.load(f)
if result.get("status") != "Accepted":
    raise SystemExit("Notarization failed; submission ID: " + str(result.get("id")))
PY
}
if [[ "$mode" == production ]]; then
  codesign --force --sign "$DEVELOPER_ID_APPLICATION" "${sign_args[@]}" \
    --options runtime --timestamp --entitlements "$root/SupercodeDesktop/SupercodeDesktop.entitlements" "$app"
  codesign --verify --deep --strict --verbose=2 "$app"
  ditto -c -k --keepParent "$app" "$work/Supercode.zip"
  notarize "$work/Supercode.zip" "$work/app-notary.json"
  xcrun stapler staple "$app"
  xcrun stapler validate "$app"
  spctl --assess --type execute --verbose=2 "$app"
else
  # Ad-hoc signing supports local Apple Silicon testing; this is not Developer ID signing.
  codesign --force --sign - "$app"
  codesign --verify --deep --strict "$app"
fi
ln -s /Applications "$work/staging/Applications"
hdiutil create -volname "Supercode $version" -srcfolder "$work/staging" \
  -format UDZO -fs HFS+ "$work/$name.dmg"
if [[ "$mode" == production ]]; then
  codesign --sign "$DEVELOPER_ID_APPLICATION" "${sign_args[@]}" --timestamp "$work/$name.dmg"
  notarize "$work/$name.dmg" "$work/dmg-notary.json"
  xcrun stapler staple "$work/$name.dmg"
  xcrun stapler validate "$work/$name.dmg"
  codesign --verify --strict "$work/$name.dmg"
  spctl --assess --type open --context context:primary-signature --verbose=2 "$work/$name.dmg"
fi
hdiutil verify "$work/$name.dmg"
# Publish only fully verified artifacts; never overwrite an existing release.
python3 - "$work/$name.dmg" "$output/$name.dmg" <<'PY'
import hashlib, pathlib, shutil, sys
source, target = map(pathlib.Path, sys.argv[1:])
with source.open("rb") as src, target.open("xb") as dst:
    shutil.copyfileobj(src, dst)
with pathlib.Path(str(target) + ".sha256").open("x") as f:
    f.write(hashlib.sha256(target.read_bytes()).hexdigest() + "  " + target.name + "\n")
PY
printf 'Created %s\n' "$output/$name.dmg"
[[ "$mode" != development ]] || printf '%s\n' 'DEVELOPMENT ONLY: not notarized or suitable for public distribution.'
