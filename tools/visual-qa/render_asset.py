"""Inspect the exported GLB, not merely the source scene. Preview lights != game.
blender -b --python-exit-code 1 --python tools/visual-qa/render_asset.py -- --glb FILE --out DIR
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"tools/harbor-v2/zones"))
from preview_render import render_views

p=argparse.ArgumentParser()
p.add_argument("--glb",type=Path,required=True);p.add_argument("--out",type=Path,required=True)
p.add_argument("--lod",choices=["LOD0","LOD1"],default="LOD0")
p.add_argument("--width",type=int,default=960)
a=p.parse_args(sys.argv[sys.argv.index("--")+1:])
bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(a.glb.resolve()))
for obj in bpy.context.scene.objects:
    if obj.type=="MESH":
        obj.hide_render=obj.name.startswith("COL_") or (obj.name.endswith(("LOD0","LOD1")) and not obj.name.endswith(a.lod))
bpy.context.scene.eevee.taa_render_samples=32
bpy.context.scene.eevee.shadow_pool_size="512"
views=[
    ("front",(-17,5,0),(-42,2.7,0),40),
    ("back",(-68,6,0),(-42,2.7,0),40),
    ("side",(-42,6,27),(-42,2.5,0),40),
    ("oblique",(-21,13,23),(-42,2.5,0),43),
    ("window-detail",(-39,3.2,11),(-42,2.5,6.9),45),
]
render_views(a.out,views,resolution=(a.width,round(a.width*9/16)))
a.out.mkdir(parents=True,exist_ok=True)
(a.out/"render-manifest.json").write_text(json.dumps({
    "input":str(a.glb),"sha256":hashlib.sha256(a.glb.read_bytes()).hexdigest(),
    "blender":bpy.app.version_string,"lod":a.lod,"views":views,"resolution":[a.width,round(a.width*9/16)],
    "lighting":"Disposable preview_render HDR+sun, AgX. Not evidence of in-game shading or performance.",
    "motion":"See runtime gate sequence; no skeletal animation in this asset.",
},indent=2))
