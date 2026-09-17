"""Render the actual response-station geometry with disposable review lighting.

Pass -- --width 3840 for native4K. Camera, light and ground do not go to glTF.
"""
import argparse
from pathlib import Path
import sys

import bpy

sys.path.insert(0,str(Path(__file__).resolve().parent))
from preview_render import render_views
from zone_kit import to_blender

ROOT=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser()
parser.add_argument("--width",type=int,default=1280)
parser.add_argument("--views",nargs="+",choices=("closed","open","interior"),default=("closed","open","interior"))
args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
bpy.ops.wm.open_mainfile(filepath=str(ROOT/"art-source/harbor-v2/response-station/response-station.blend"))
bpy.context.scene.eevee.shadow_pool_size="1024"
# A context ground plane and two broad interior light sources are preview-only.
bpy.ops.mesh.primitive_plane_add(size=200,location=to_blender((-42,-.025,0)))
ground=bpy.context.object
ground.name="TMP_CONTEXT_GROUND"
ground.data.materials.append(bpy.data.materials["MAT_RS_CONCRETE"])
for z in (-4.6,4.6):
    data=bpy.data.lights.new("TMP_INTERIOR_LIGHT","AREA")
    data.energy=350
    data.color=(.62,.83,1)
    data.shape="RECTANGLE"
    data.size=9
    data.size_y=2
    obj=bpy.data.objects.new(data.name,data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location=to_blender((-42,4.7,z))
out=ROOT/"art-source/harbor-v2/_staging/response-station/review"
if "closed" in args.views:
    render_views(out,[("station-closed",(-23,9.5,17),(-42,2.4,0),38)],
                 resolution=(args.width,round(args.width*9/16)))
for obj in bpy.context.scene.objects:
    if obj.get("gameplayRole")=="hunterGate":
        obj.hide_render=True
views=[]
if "open" in args.views:
    views.append(("station-open",(-23,7.3,13),(-42,2.2,0),38))
if "interior" in args.views:
    views.append(("station-interior",(-34.0,2.45,3.7),(-48,2.4,-.5),20))
if views:
    render_views(out,views,resolution=(args.width,round(args.width*9/16)))
