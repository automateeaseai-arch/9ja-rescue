#!/bin/bash
# Builds the copy of the game published as a claude.ai artifact.
# Artifacts can't serve .glb files, so models ship as base64 text
# (VITE_MODELS_AS_TEXT makes the loader fetch <model>.glb.b64.txt).
# usage: tools/build-share.sh <outdir>   -> publish <outdir>/page.html with its assets/ and models/
set -e
OUT="$1"
rm -rf "$OUT"
VITE_MODELS_AS_TEXT=1 npx vite build --outDir "$OUT" --emptyOutDir
cd "$OUT/models"
for f in $(find . -name "*.glb"); do base64 -w0 "$f" > "$f.b64.txt"; rm "$f"; done
cd ..
# The artifact host adds its own <html>/<head>/<body>; strip ours.
python3 -I -c "
import re
h=open('index.html').read()
h=re.sub(r'<!doctype html>|</?html[^>]*>|</?head>|</?body>|<meta[^>]*>','',h,flags=re.I)
open('page.html','w').write(h.strip()+'\n')"
