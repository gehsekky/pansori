#!/usr/bin/env bash
# Sync the licensed painted-art packs from the private pansori-assets overlay into
# the frontend's public/art, so the PAINTED tier (VITE_PAINTED_ART=1) has them.
#
# The public repo ships only the free glyph/color tier — these four dirs are
# gitignored here and live in the separate (private) pansori-assets repo. The
# free tier needs none of this; a clone without the overlay just renders glyphs.
# floors/ (CC0) and per-campaign room art stay in the public repo and are NOT
# touched here.
#
# Source: $PANSORI_ASSETS_DIR/art (default ../pansori-assets/art). Run manually
# after cloning the overlay, or in CI before `npm run build`. Production may
# instead serve the overlay from a CDN via VITE_ASSET_BASE_URL.
set -euo pipefail

# Resolve paths relative to the repo root (this script lives in scripts/).
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${PANSORI_ASSETS_DIR:-$REPO_ROOT/../pansori-assets}/art"
DEST="$REPO_ROOT/src/frontend/public/art"

if [ ! -d "$SRC" ]; then
  echo "sync-assets: no overlay at $SRC — skipping (the free tier needs no painted art)." >&2
  echo "sync-assets: set PANSORI_ASSETS_DIR or clone pansori-assets as a sibling to enable the painted tier." >&2
  exit 0
fi

for d in tiles markers icons sprites; do
  if [ -d "$SRC/$d" ]; then
    rm -rf "${DEST:?}/$d"
    cp -r "$SRC/$d" "$DEST/$d"
    echo "sync-assets: $d ($(find "$DEST/$d" -type f | wc -l | tr -d ' ') files)"
  fi
done
echo "sync-assets: painted art synced from $SRC"
