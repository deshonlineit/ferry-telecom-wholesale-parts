#!/usr/bin/env bash
# Renders the home-screen icon from the vector mark. Run this after redrawing
# public/assets/mark.svg: home screens need an opaque bitmap, so the diamond is
# drawn 150px wide on a white 180px canvas with a 15px margin.
set -euo pipefail
ASSETS="$(cd "$(dirname "$0")/../public/assets" && pwd)"
PAGE="$(mktemp -t brand-icon-XXXXXX.html)"
trap 'rm -f "$PAGE"' EXIT

cat > "$PAGE" <<HTML
<html><body style="margin:0;background:#ffffff">
<img src="file://$ASSETS/mark.svg" style="display:block;width:150px;height:150px;margin:15px">
</body></html>
HTML

chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=180,180 \
    --screenshot="$ASSETS/apple-touch-icon.png" "file://$PAGE" 2>/dev/null

echo "Wrote $ASSETS/apple-touch-icon.png"
