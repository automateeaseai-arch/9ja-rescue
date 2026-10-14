#!/bin/bash
# Builds the web version (Firebase accounts, real .glb models) and publishes it
# to the gh-pages branch, which GitHub Pages serves at
# https://9jarescue.app (the owner's domain; the github.io address forwards to it)
# The branch holds only the built files, replaced on every deploy.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT"
npx vite build --outDir "$OUT" --emptyOutDir
touch "$OUT/.nojekyll"   # serve files as they are (no Jekyll processing)
echo "9jarescue.app" > "$OUT/CNAME"   # the owner's own web address (bought 14 Oct)
SRC="$(git rev-parse --short HEAD)"
URL="$(git remote get-url origin)"
cd "$OUT"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" commit -qm "Web build of $SRC" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01BpsDsDbEYpy3RQnk4jBVLf"
git push -q --force "$URL" gh-pages
echo "Deployed $SRC from $OUT"
