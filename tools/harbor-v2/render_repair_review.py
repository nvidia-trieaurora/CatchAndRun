"""Native Blender review: --zone rescue-quay|response-station [--width 3840]."""
from pathlib import Path
import sys
import argparse
import bpy
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/harbor-v2/zones'))
from preview_render import render_views
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--zone',choices=['rescue-quay','response-station'],required=True)
p.add_argument('--width',type=int,default=3840)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.wm.open_mainfile(filepath=str(ROOT/f'art-source/harbor-v2/{a.zone}/{a.zone}.blend'))
views={
 'rescue-quay':[("blender-rescue-quay",(28,15,7),(46,2.5,24),43),
                ("blender-rescue-workshop",(45,3.2,14),(54.5,1.6,20.4),38)],
 'response-station':[("blender-response-station",(-20,13,20),(-42,2,0),43)],
}
render_views(ROOT/'docs/v2/harbor/repair-review',views[a.zone],resolution=(a.width,round(a.width*9/16)),
 hide_collections=('COLLISION','COLLISION_ZONE','REFERENCE','PREVIEW_ONLY','RENDER_LOD1'))
