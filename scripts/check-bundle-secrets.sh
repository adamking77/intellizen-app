#!/bin/bash
# check-bundle-secrets.sh — refuse-to-ship gate for IntelliZen release artifacts.
#
# Scans a .app bundle, .dmg, or dist/ directory for embedded Supabase JWTs and
# fails if any decodes to role=service_role. Mandatory release step per
# CLAUDE.md (audit F-01).
#
# IMPORTANT: Tauri v2 embeds frontend assets COMPRESSED inside the app binary,
# so string-scanning a packaged .app/.dmg can give a FALSE NEGATIVE. The
# authoritative gate is scanning dist/ (the exact JS that gets embedded)
# immediately after `vite build`, before packaging. Scan the .dmg too, but
# never as the only check.
#
# Usage: scripts/check-bundle-secrets.sh dist
#        scripts/check-bundle-secrets.sh <path-to.app|.dmg>

set -u

TARGET="${1:?usage: check-bundle-secrets.sh <.app|.dmg|dist-dir>}"
MOUNT=""
cleanup() {
  if [[ -n "$MOUNT" ]]; then hdiutil detach "$MOUNT" -quiet || true; fi
}
trap cleanup EXIT

SCAN_PATH="$TARGET"
if [[ "$TARGET" == *.dmg ]]; then
  MOUNT=$(hdiutil attach -readonly -nobrowse "$TARGET" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')
  [[ -n "$MOUNT" ]] || { echo "❌ could not mount $TARGET"; exit 2; }
  SCAN_PATH="$MOUNT"
fi

echo "Scanning $SCAN_PATH for embedded Supabase service-role JWTs..."
if [[ "$TARGET" == *.app || "$TARGET" == *.dmg ]]; then
  echo "⚠️  Tauri binaries embed assets compressed — a clean result here is NOT"
  echo "    sufficient. Also run this script against dist/ from the same build."
fi

python3 - "$SCAN_PATH" <<'PY'
import base64, json, os, re, sys

scan_path = sys.argv[1]
jwt_re = re.compile(rb'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}')
hits = set()

for root, _dirs, files in os.walk(scan_path):
    for name in files:
        path = os.path.join(root, name)
        try:
            if os.path.getsize(path) > 300 * 1024 * 1024:
                continue
            with open(path, 'rb') as fh:
                blob = fh.read()
        except OSError:
            continue
        for match in jwt_re.finditer(blob):
            token = match.group(0).decode()
            payload = token.split('.')[1]
            payload += '=' * (-len(payload) % 4)
            try:
                claims = json.loads(base64.urlsafe_b64decode(payload))
            except Exception:
                continue
            if claims.get('role') == 'service_role':
                hits.add((path, token[:24]))

if hits:
    print('❌ SERVICE-ROLE KEY FOUND IN ARTIFACT — DO NOT SHIP')
    for path, prefix in sorted(hits):
        print(f'   {path}: {prefix}...')
    sys.exit(1)

print('✅ No service-role JWT found in artifact.')
PY
exit $?
