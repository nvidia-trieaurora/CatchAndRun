"""RP03 marine paint only: preserve all geometry, rigs, colliders, UVs and AO.

Default writes a sibling native source and exports to staging. --render renders
only, at --width 1600 by default; render sessions never save preview settings.
"""
from __future__ import annotations

import argparse
import array
import hashlib
import json
from pathlib import Path
import runpy
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "art-source/harbor-v2/ferris-harbor/ferris-harbor-ticket-repair.blend"
OUTPUT = SOURCE.with_name("ferris-harbor-fleet-rp03.blend")
STAGING = ROOT / "art-source/harbor-v2/_staging/fleet-rp03"
REVIEW = ROOT / "docs/v2/harbor/island-review/fleet"
sys.path.insert(0, str(ROOT / "tools/harbor-v2/zones"))
from preview_render import render_views


def digest_collection(items, field, size, kind="f"):
    values = array.array(kind, [0]) * (len(items) * size)
    items.foreach_get(field, values)
    return hashlib.sha256(values.tobytes()).hexdigest()


def scene_signature():
    result = {}
    for obj in bpy.context.scene.objects:
        item = {"type": obj.type, "parent": obj.parent.name if obj.parent else None,
                "matrix": [list(row) for row in obj.matrix_world],
                "extras": {key: repr(obj[key]) for key in sorted(obj.keys())},
                "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
                "collections": sorted(col.name for col in obj.users_collection)}
        if obj.type == "MESH":
            mesh = obj.data
            item["mesh"] = {
                "positions": digest_collection(mesh.vertices, "co", 3),
                "normals": digest_collection(mesh.vertices, "normal", 3),
                "edges": digest_collection(mesh.edges, "vertices", 2, "i"),
                "loops": digest_collection(mesh.loops, "vertex_index", 1, "i"),
                "polygon_start": digest_collection(mesh.polygons, "loop_start", 1, "i"),
                "polygon_size": digest_collection(mesh.polygons, "loop_total", 1, "i"),
                "material_index": digest_collection(mesh.polygons, "material_index", 1, "i"),
                "uv": {layer.name: digest_collection(layer.data, "uv", 2) for layer in mesh.uv_layers},
                "color": {layer.name: [layer.domain, layer.data_type, digest_collection(layer.data, "color", 4)]
                          for layer in mesh.color_attributes},
            }
        result[obj.name] = item
    return result


def repaint(name, tint, roughness):
    material = bpy.data.materials[name]
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    mix = next(node for node in tree.nodes if node.type == "MIX")
    ao = next(node for node in tree.nodes if node.type == "VERTEX_COLOR")
    assert any(link.from_node == ao and link.to_node == mix for link in tree.links), "Missing baked COLOR AO"
    for link in list(tree.links):
        if ((link.to_node == bsdf and link.to_socket.name in {"Metallic", "Roughness"})
                or (link.to_node == mix and link.to_socket.name == "A")
                or link.to_socket.name == "Occlusion"):
            tree.links.remove(link)
    # Keep the original multiply-by-COLOR path. Only its image input becomes a
    # constant linear paint colour; no raster textures are edited or generated.
    mix.inputs[6].default_value = (*tint, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = roughness
    normal = next(node for node in tree.nodes if node.type == "NORMAL_MAP")
    normal.inputs["Strength"].default_value = 0.12
    material.diffuse_color = (*tint, 1.0)
    material.metallic = 0.0
    material.roughness = roughness
    return {"name": name, "baseColorLinear": tint, "metallic": 0,
            "roughness": roughness, "normalStrength": 0.12, "vertexAO": ao.layer_name}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--render", action="store_true")
    parser.add_argument("--width", type=int, default=1600)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if args.render:
        bpy.ops.wm.open_mainfile(filepath=str(OUTPUT))
        # Rigged LOD1 meshes live in BOATS_DYNAMIC, not RENDER_LOD1. Hide the
        # duplicate tier for this disposable preview only; never save the flags.
        lod1 = {obj: obj.hide_render for obj in bpy.context.scene.objects if obj.name.endswith("_LOD1")}
        for obj in lod1:
            obj.hide_render = True
        try:
            render_views(REVIEW, [(f"fleet-marine-paint-{args.width}", (11.5, 3.2, 44.2), (6.5, .6, 50), 42)],
                         resolution=(args.width, round(args.width * 9 / 16)),
                         hide_collections=("COLLISION", "COLLISION_ZONE", "REFERENCE", "PREVIEW_ONLY", "RENDER_LOD1"))
        finally:
            for obj, hidden in lod1.items():
                obj.hide_render = hidden
        return
    source_sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    bpy.context.view_layer.update()
    before = scene_signature()
    materials = [repaint("MAT_HULL_CREAM", (.58, .59, .53), .38),
                 repaint("MAT_HULL_NAVY", (.013, .042, .062), .36)]
    if scene_signature() != before:
        raise RuntimeError("Material-only pass changed protected object or mesh data")
    STAGING.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), check_existing=False)
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != source_sha:
        raise RuntimeError("Original native source changed")
    sys.argv = ["export", "--", "--output", str(STAGING / "ferris-harbor-candidate.glb")]
    runpy.run_path(str(ROOT / "tools/harbor-v2/export_zone_scene.py"), run_name="__main__")
    report = {"source": str(SOURCE.relative_to(ROOT)), "sourceSHA256": source_sha,
              "sourcePreserved": True, "output": str(OUTPUT.relative_to(ROOT)),
              "protectedObjects": len(before), "allObjectAndMeshDataUnchanged": True, "materials": materials}
    (STAGING / "native-material-audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print("FLEET_PAINT=" + json.dumps(report))


if __name__ == "__main__":
    main()
