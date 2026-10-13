#!/bin/bash
# Turnaround sheet (front|side|back thirds) -> Meshy multi-view model (~15k tris)
# -> auto-rig -> Walk/Run merged -> 1024 px texture. ~35 credits.
# usage: tools/meshy-character.sh <sheet.png> <OutName> <height_m> <workdir>
# Then compress: node tools/squeeze.mjs <workdir>/<OutName>.glb public/models/.../<OutName>.glb
set -e
IMG="$1"; NAME="$2"; H="$3"; D="$4"; T=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$D/dl"; cd "$D"
python3 -I -c "
import json,base64,sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB')
u=[]
for n,(a,b) in {'front':(0,512),'side':(512,1024),'back':(1024,1536)}.items():
    im.crop((a,0,b,1024)).save(n+'.jpg',quality=92); u.append('data:image/jpeg;base64,'+base64.b64encode(open(n+'.jpg','rb').read()).decode())
json.dump({'image_urls':u,'ai_model':'latest','should_remesh':True,'topology':'triangle','target_polycount':15000,'should_texture':True,'enable_pbr':False,'symmetry_mode':'auto'},open('req.json','w'))" "$IMG"
G=$(curl -sS -X POST https://api.meshy.ai/openapi/v1/multi-image-to-3d -H 'Content-Type: application/json' -d @req.json | python3 -I -c "import json,sys;print(json.load(sys.stdin)['result'])")
echo "gen $G"
for i in $(seq 1 90); do s=$(curl -sS https://api.meshy.ai/openapi/v1/multi-image-to-3d/$G | python3 -I -c "import json,sys;print(json.load(sys.stdin)['status'])"); case $s in SUCCEEDED|FAILED|CANCELED) break;; esac; sleep 10; done
echo "gen status $s"; [ "$s" = SUCCEEDED ]
R=$(curl -sS -X POST https://api.meshy.ai/openapi/v1/rigging -H 'Content-Type: application/json' -d "{\"input_task_id\":\"$G\",\"height_meters\":$H}" | python3 -I -c "import json,sys;print(json.load(sys.stdin)['result'])")
echo "rig $R"
for i in $(seq 1 90); do curl -sS https://api.meshy.ai/openapi/v1/rigging/$R > rigres.json; s=$(python3 -I -c "import json;print(json.load(open('rigres.json'))['status'])"); case $s in SUCCEEDED|FAILED|CANCELED) break;; esac; sleep 8; done
echo "rig status $s"; [ "$s" = SUCCEEDED ] || { python3 -I -c "import json;print(json.load(open('rigres.json')).get('task_error'))"; exit 1; }
python3 -I -c "
import json;d=json.load(open('rigres.json'))['result']
print(d['rigged_character_glb_url']);print(d['basic_animations']['walking_glb_url']);print(d['basic_animations']['running_glb_url'])" > urls.txt
i=0; for n in rigged walk run; do i=$((i+1)); curl -sS -o dl/$n.glb "$(sed -n ${i}p urls.txt)"; done
node "$T/combine.mjs" $D/dl/rigged.glb $D/dl/walk.glb $D/dl/run.glb $D/$NAME.glb >/dev/null && node "$T/fin.mjs" $D/$NAME.glb
echo "DONE $NAME $G $R $(stat -c %s $D/$NAME.glb) $(sha256sum $D/$NAME.glb | cut -c1-64)"
