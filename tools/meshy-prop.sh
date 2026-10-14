#!/bin/bash
# Text prompt -> Meshy text-to-3D preview + refine (static prop). 30 credits.
# usage: tools/meshy-prop.sh <Name> <polycount> "<prompt>" ; writes <workdir>/<Name>/raw.glb
# Then: node tools/opt.mjs raw.glb mid.glb && node tools/squeeze.mjs mid.glb public/models/env/<Name>.glb [texSize]
set -e
N="$1"; P="$2"; PROMPT="$3"; D="${WORKDIR:-.}/$N"; mkdir -p $D; cd $D
python3 -I -c "import json,sys;json.dump({'mode':'preview','prompt':sys.argv[1],'art_style':'realistic','ai_model':'latest','topology':'triangle','target_polycount':int(sys.argv[2]),'should_remesh':True},open('preq.json','w'))" "$PROMPT" "$P"
T=$(curl -sS -X POST https://api.meshy.ai/openapi/v2/text-to-3d -H 'Content-Type: application/json' -d @preq.json | python3 -I -c "import json,sys;print(json.load(sys.stdin)['result'])"); echo "preview $T"
for i in $(seq 1 90); do s=$(curl -sS https://api.meshy.ai/openapi/v2/text-to-3d/$T | python3 -I -c "import json,sys;print(json.load(sys.stdin)['status'])"); case $s in SUCCEEDED|FAILED|CANCELED) break;; esac; sleep 8; done; echo "preview $s"; [ $s = SUCCEEDED ]
R=$(curl -sS -X POST https://api.meshy.ai/openapi/v2/text-to-3d -H 'Content-Type: application/json' -d "{\"mode\":\"refine\",\"preview_task_id\":\"$T\",\"enable_pbr\":${PBR:-false}}" | python3 -I -c "import json,sys;print(json.load(sys.stdin)['result'])"); echo "refine $R"
for i in $(seq 1 90); do curl -sS https://api.meshy.ai/openapi/v2/text-to-3d/$R > res.json; s=$(python3 -I -c "import json;print(json.load(open('res.json'))['status'])"); case $s in SUCCEEDED|FAILED|CANCELED) break;; esac; sleep 8; done; echo "refine $s"; [ $s = SUCCEEDED ]
curl -sS -o raw.glb "$(python3 -I -c "import json;print(json.load(open('res.json'))['model_urls']['glb'])")"
echo "DONE $N $T $R $(stat -c %s raw.glb)"
