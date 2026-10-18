#!/bin/bash
# Builds the CrazyGames Basic Launch version (owner, 18 Oct): guest play only, no
# ads and no CrazyGames code (their Basic Launch asks for none), no links out, no install or offline copy. Our own site is not
# affected (it is built by deploy-pages.sh as before).
# usage: tools/build-cg.sh <outdir>
#   -> <outdir>/ (index.html at the top) and <outdir>.zip to upload
set -e
OUT="$(realpath -m "$1")"
ID=none
rm -rf "$OUT" "$OUT.zip"
VITE_AUTH=device VITE_PORTAL=cg npx vite build --outDir "$OUT" --emptyOutDir
cd "$OUT"
# Our website's own pages and the offline copy don't belong in the upload.
rm -f sw.js about.html privacy.html manifest.webmanifest CNAME admin.html
python3 -I - <<'EOF'
import re
h = open('index.html').read()
# No install manifest, and no link-preview tags pointing at our website.
h = re.sub(r'\s*<link rel="manifest"[^>]*>', '', h)
h = re.sub(r'\s*<meta (property|name)="(og|twitter):[^"]*"[^>]*>', '', h)
open('index.html', 'w').write(h)
EOF
zip -qr "$OUT.zip" .
echo "Built $OUT.zip ($(du -h "$OUT.zip" | cut -f1)), CrazyGames basic (no ads)"
