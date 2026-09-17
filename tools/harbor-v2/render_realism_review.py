"""4K views of the real authored Blender geometry, not AI concept images.

blender --background --python this_file -- --zone all [--width 3840]
The disposable review world/camera is not saved into the source assets.
"""
import argparse
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/harbor-v2/zones"))
from preview_render import render_views

VIEWS = {
    "garden-ac": ("garden", (-7, 26, 64), (-38, 3, 29), 39),
    "construction-ad": ("construction", (18, 45, 32), (-39, 15, -25), 35),
    "container-bd": ("container-bd", (67, 11, -9), (43, 2, -32), 40),
    "operations-ab": ("operations-ab", (-23, 7, -23), (1, 2, -34), 35),
    "ferris-harbor": ("ferris-harbor", (36, 24, 88), (-4, 8, 43), 38),
    "warehouse-v2": ("warehouse", (45, 18, 51), (0, 4, 0), 42),
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", choices=["all", *VIEWS], default="all")
    parser.add_argument("--width", type=int, default=3840)
    parser.add_argument("--original", action="store_true", help="render untouched source for before/after")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    out = ROOT / "docs/v2/harbor/realism-review"
    for name in VIEWS if args.zone == "all" else [args.zone]:
        directory, eye, target, lens = VIEWS[name]
        suffix = "" if args.original else "-realism"
        bpy.ops.wm.open_mainfile(filepath=str(ROOT / f"art-source/harbor-v2/{directory}/{name}{suffix}.blend"))
        render_views(out, [(f"{'before' if args.original else 'blender'}-{name}", eye, target, lens)],
                     resolution=(args.width, round(args.width*9/16)),
                     hide_collections=("COLLISION", "COLLISION_ZONE", "REFERENCE", "PREVIEW_ONLY", "RENDER_LOD1"))
