"""RP05 isolated native rebuild using the existing station recipe/ZoneKit.

blender -b --python-exit-code 1 --python tools/visual-qa/build_station.py
Never overwrites the existing authoring source or runtime GLB.
"""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import bmesh

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/harbor-v2/zones"))
import build_response_station as station

OUT = ROOT / "art-source/harbor-v2/_staging/visual-qa-rp05/asset"
OUT.mkdir(parents=True, exist_ok=True)
station.SOURCE = ROOT / "art-source/harbor-v2/response-station/response-station-rp05.blend"
station.STAGING = OUT
# Keep the user's existing palette files and native source untouched.
station.K.texture_pack = "response-station-rp05"
original_materials, original_shell, original_gate = station.materials, station.shell, station.gate
original_box = station.box


def box_with_finished_soffit(name, bounds, material, bevel=0.0, tags=None):
    # Refinish the real structural slab: never add a ceiling below its collider.
    if name == "roof_slab":
        material = station.M["ceiling"]
    return original_box(name, bounds, material, bevel, tags)


def materials():
    original_materials()
    # Painted equipment enclosures are not raw corrugated container siding.
    station.M["navy"] = station.K.simple("MAT_RS_RP05_COATED_NAVY", (.035,.065,.085), .43, .10)
    station.M["silver"] = station.K.simple("MAT_RS_RP05_SATIN_ALUMINIUM", (.52,.59,.59), .38, .65)
    station.M["ceiling"] = station.K.simple("MAT_RS_RP05_CEILING", (.55,.59,.57), .83, 0)
    station.M["gasket"] = station.K.simple("MAT_RS_RP05_GASKET", (.012,.016,.018), .92, 0)
    # Existing CC0 steel micro-normal: subtle at actual metre scale, not big fake ribs.
    image = bpy.data.images.load(str(ROOT / "tools/harbor-v2/textures/container-bd-pbr/_derived/steel_dark_normal.png"), check_existing=True)
    image.colorspace_settings.name = "Non-Color"
    for key in ("navy", "silver"):
        mat = station.M[key]
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        texture = nodes.new("ShaderNodeTexImage"); texture.image = image
        normal = nodes.new("ShaderNodeNormalMap"); normal.inputs["Strength"].default_value = .12
        links.new(texture.outputs["Color"], normal.inputs["Color"])
        links.new(normal.outputs["Normal"], next(n for n in nodes if n.type == "BSDF_PRINCIPLED").inputs["Normal"])
        mat["source"] = "Existing Poly Haven metal_plate_02 CC0 derivative; coating factors authored in RP05"


def shell():
    original_shell()
    box, M = station.box, station.M
    # Opaque real headbox hides retracted shutter vertices; roof/route footprint unchanged.
    box("rp05_shutter_headbox", (-35.23,-34.62,5.005,5.38,-6.99,6.99), M["silver"], .025)
    box("rp05_headbox_seam", (-34.613,-34.605,5.08,5.095,-6.8,6.8), M["gasket"])
    for z in (-6.85,6.85):
        box("rp05_gate_track",(-35.20,-34.77,.15,5.0,z-.045,z+.045),M["silver"],.012)
    for side in (-1,1):
        z=side*6.865
        for y in (1.395,3.305):
            box("rp05_window_seal",(-48.86,-35.14,y-.016,y+.016,z-.007,z+.007),M["gasket"])
        if station.LOD == "LOD0":
            for x in (-46.2,-43.4,-40.6,-37.8):
                for y in (1.48,3.20):
                    box("rp05_frame_fastener",(x-.019,x+.019,y-.019,y+.019,z-.02,z+.02),M["silver"],.006)


def gate():
    original_gate()
    obj = bpy.data.objects[station.GATES[-1]]
    obj["gateTravelMode"] = "retract"
    obj["gateTravel"] = 5.06
    obj["gateRetractLocalY"] = .025


station.materials, station.shell, station.gate = materials, shell, gate
station.box = box_with_finished_soffit
original_apply = station.K.apply_all_modifiers
def triangulate_export():
    original_apply()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        bm = bmesh.new(); bm.from_mesh(obj.data)
        # Blender cannot generate tangent space for bevel/font n-gons.
        bmesh.ops.triangulate(bm, faces=list(bm.faces))
        bm.normal_update(); bm.to_mesh(obj.data); bm.free()
station.K.apply_all_modifiers = triangulate_export
station.main()
inputs = [Path(__file__), ROOT / "tools/harbor-v2/zones/build_response_station.py", ROOT / "tools/harbor-v2/zones/zone_kit.py"]
inputs += sorted((ROOT / "tools/harbor-v2/textures/container-bd-pbr/_derived").glob("*"))
manifest = {
    "recipe": "tools/visual-qa/build_station.py", "blender": bpy.app.version_string,
    "buildHash": bpy.app.build_hash.decode(), "units": "metres", "sourceUp": "Z", "exportUp": "Y",
    "source": str(station.SOURCE.relative_to(ROOT)), "seed": 20260907,
    "provenance": "Original procedural station recipe; existing CC0 textures documented in tools/harbor-v2/textures/ATTRIBUTION.md. System DIN/Arial font is converted to outlines, no font binary distributed.",
    "fontDependency": "DIN Alternate Bold.ttf or Arial Bold.ttf; same font required for identical glyph geometry",
    "collisions": "No exported collision; unchanged procedural shell and gate + existing 0.14m floor overlay",
    "skeleton": None, "animations": "Client HunterGateState retraction, no skeletal clips",
    "inputs": {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs if p.is_file()},
}
(OUT / "build-manifest.json").write_text(json.dumps(manifest,indent=2))
