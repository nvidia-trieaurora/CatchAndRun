"""RP02: rebuild the Ferris ticket office in native Blender, with matching collision.

Reads the RL01 source, removes only complete mesh components inside the former
booth bounds, keeps all rig/reference/collider nodes untouched, and writes a sibling
source plus a staging GLB. Production promotion is a separate validated step.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import runpy
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/harbor-v2"))
sys.path.insert(0, str(ROOT / "tools/harbor-v2/zones"))
import realism_pass as realism
import zone_kit as zk
from preview_render import render_views

SOURCE = ROOT / "art-source/harbor-v2/ferris-harbor/ferris-harbor-realism.blend"
OUTPUT = SOURCE.with_name("ferris-harbor-ticket-repair.blend")
STAGING = ROOT / "art-source/harbor-v2/_staging/ticket-repair"
REVIEW = ROOT / "docs/v2/harbor/repair-review"
K = zk.ZoneKit("FERRIS_HARBOR", "ferris-harbor", "ferris-pbr")
NEW = []
COLLIDERS = []


def remove_old_booth():
    bounds = ((-21.11, -.01, 29.29), (-15.89, 4.32, 33.31))
    removed = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj.parent or not obj.name.startswith("MESH_FERRIS_HARBOR_") or obj.get("instanceKey"):
            continue
        bm = bmesh.new(); bm.from_mesh(obj.data)
        pending = set(bm.verts)
        erase = []
        while pending:
            seed = pending.pop()
            component = {seed}; stack = [seed]
            while stack:
                for edge in stack.pop().link_edges:
                    for v in edge.verts:
                        if v in pending:
                            pending.remove(v); component.add(v); stack.append(v)
            points = [zk.to_three(obj.matrix_world @ v.co) for v in component]
            if all(all(bounds[0][i] <= p[i] <= bounds[1][i] for i in range(3)) for p in points):
                erase.extend(component)
        if erase:
            removed.append({"mesh": obj.name, "vertices": len(erase)})
            bmesh.ops.delete(bm, geom=erase, context="VERTS")
            bm.to_mesh(obj.data)
            if not len(obj.data.vertices):
                bpy.data.objects.remove(obj, do_unlink=True)
        bm.free()
    # Fourteen high-detail parts plus the former low-detail solid box; reject a
    # stale/different authoring source rather than silently carving other content.
    expected = {"BASE_CONCRETE_SEAWALL_LOD0": 8, "PALETTE_LOD0": 56,
                "STEEL_NAVY_WEATHERED_LOD0": 36, "DECK_TIMBER_LOD0": 24,
                "LIGHT_UNIT_LAMP_FLICKER_LOD0": 48, "GLASS_BOAT_LOD0": 4,
                "STEEL_NAVY_WEATHERED_LOD1": 8}
    actual = {item["mesh"].removeprefix("MESH_FERRIS_HARBOR_"): item["vertices"] for item in removed}
    if actual != expected:
        raise RuntimeError(f"Unexpected old booth component signature: {actual}")
    return removed


def swatch(name, index):
    return zk.PaletteSwatch(bpy.data.materials["MAT_PALETTE"], ((index % 5) + .5) / 5, ((index // 5) + .5) / 5, name)


def box(name, lo, hi, mat, lod, *, bevel=.012, collision=False):
    obj = K.box("ticket_" + name, tuple(hi[i] - lo[i] for i in range(3)), tuple((hi[i] + lo[i]) / 2 for i in range(3)), mat, lod=lod, bevel=bevel if lod == "LOD0" else 0)
    obj["repairPass"] = "RP02"
    NEW.append(obj)
    if collision and lod == "LOD0":
        COLLIDERS.append(K.collider("ticket_" + name, lo, hi))
    return obj


def text(label, body, center, size, width, material, lod):
    curve = bpy.data.curves.new(label, "FONT")
    curve.body = body; curve.align_x = "CENTER"; curve.align_y = "CENTER"
    curve.size = size; curve.extrude = .002; curve.bevel_depth = 0
    curve.resolution_u = 2
    obj = bpy.data.objects.new(label, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = zk.to_blender(center)
    obj.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.update()
    if obj.dimensions.x > width:
        factor = width / obj.dimensions.x
        obj.scale = (factor, factor, factor)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    location = obj.location.copy(); rotation = obj.rotation_euler.copy(); scale = obj.scale.copy()
    bpy.data.objects.remove(obj, do_unlink=True)
    obj = bpy.data.objects.new(label, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location; obj.rotation_euler = rotation; obj.scale = scale
    K._finish(obj, material, lod, {"castShadow": False, "repairPass": "RP02"}, 0)
    NEW.append(obj)


def build(lod):
    navy = bpy.data.materials["MAT_STEEL_NAVY_WEATHERED"]
    concrete = bpy.data.materials["MAT_BASE_CONCRETE_SEAWALL"]
    timber = bpy.data.materials["MAT_DECK_TIMBER"]
    metal = bpy.data.materials["MAT_GALVANIZED"]
    black, cream, white, brick = swatch("black", 5), swatch("cream", 9), swatch("white", 12), swatch("brick", 1)
    x0, x1, z0, z1 = -20.9, -17.15, 29.5, 32.9
    # West-facing 1.45 m staff entrance. The east wall stays outside the Ferris
    # platform and its approach lane; front window is glazed, not a doorway.
    shell = [
        ("floor", (x0, .05, z0), (x1, .2, z1), concrete),
        ("back", (x0, .2, z0), (x1, 3.2, z0 + .18), navy),
        ("east", (x1 - .18, .2, z0), (x1, 3.2, z1), navy),
        ("west_back", (x0, .2, z0), (x0 + .18, 3.2, 30.1), navy),
        ("west_front", (x0, .2, 31.55), (x0 + .18, 3.2, z1), navy),
        ("west_header", (x0, 2.55, 30.1), (x0 + .18, 3.2, 31.55), navy),
        ("counter", (x0, .2, z1 - .2), (x1, 1.05, z1), timber),
        ("front_left", (x0, 1.05, z1 - .2), (-20.3, 3.2, z1), navy),
        ("front_right", (-17.8, 1.05, z1 - .2), (x1, 3.2, z1), navy),
        ("front_header", (-20.3, 2.65, z1 - .2), (-17.8, 3.2, z1), navy),
        ("roof", (x0 - .15, 3.2, z0 - .15), (-17.02, 3.4, z1 + .38), black),
    ]
    for name, lo, hi, mat in shell:
        box(name, lo, hi, mat, lod, collision=True)
    # Both quality tiers retain real glazing, an interior and the entrance.
    glass = bpy.data.materials.get("MAT_RP02_TICKET_GLASS")
    if glass is None:
        glass = K.simple("MAT_RP02_TICKET_GLASS", (.14, .24, .27), .14, alpha=.3, blended=True, double_sided=True)
    box("front_glass", (-20.3, 1.05, 32.79), (-17.8, 2.65, 32.83), glass, lod, bevel=0, collision=True)
    box("counter_top", (-20.34, 1.05, 32.32), (-17.76, 1.11, 33.09), cream, lod)
    for x in (-20.32, -19.05, -17.78):
        box("window_vertical", (x - .025, 1.1, 32.84), (x + .025, 2.66, 32.89), metal, lod)
    for y in (1.12, 2.65):
        box("window_horizontal", (-20.34, y - .03, 32.84), (-17.76, y + .03, 32.89), metal, lod)
    box("sign", (-20.68, 3.47, 32.95), (-17.36, 4.03, 33.055), brick, lod)
    for x in (-20.35, -17.7):
        box("sign_mount", (x - .045, 3.32, 32.97), (x + .045, 3.68, 33.04), metal, lod)
    text("ticket_main_sign", "HARBOR  TICKETS", (-19.02, 3.77, 33.065), .31, 3.05, cream, lod)
    text("ticket_counter_label", "BOARDING  /  01", (-19.02, .7, 32.915), .16, 2.2, cream, lod)
    # Muted architectural trims and a warm soffit luminaire rather than a blank
    # luminous rectangle; details attach to the shell and add no blocking boxes.
    for x in (x0 + .03, x1 - .08):
        box("corner_flashing", (x, .2, z1 + .012), (x + .05, 3.18, z1 + .052), metal, lod)
    for z in (30.06, 31.55):
        box("door_jamb", (x0 - .025, .2, z), (x0 + .22, 2.6, z + .04), cream, lod)
    box("door_lintel", (x0 - .025, 2.55, 30.06), (x0 + .22, 2.61, 31.59), cream, lod)
    box("plinth", (x0 - .02, .2, z1 + .012), (x1 + .02, .32, z1 + .07), metal, lod)
    if lod == "LOD0":
        for i in range(10):
            x = -20.95 + i * .42
            box("roof_seam", (x, 3.4, 29.4), (x + .025, 3.423, 33.21), metal, lod, bevel=0)
        box("light_housing", (-19.6, 3.12, 33.0), (-18.5, 3.18, 33.18), metal, lod)
        light = zk.PaletteSwatch(bpy.data.materials["MAT_LIGHT_UNIT"], .375, .125, "lamp")
        box("soffit_light", (-19.53, 3.105, 33.015), (-18.57, 3.12, 33.15), light, lod, bevel=0)
        for x in (-20.59, -17.45):
            for y in (3.54, 3.95):
                box("sign_bolt", (x - .017, y - .017, 33.055), (x + .017, y + .017, 33.078), metal, lod, bevel=0)
        for x in (-20.6, -20.25, -19.9, -19.55, -19.2, -18.85, -18.5, -18.15, -17.8, -17.45):
            box("counter_joint", (x, .33, 32.901), (x + .012, 1.015, 32.908), black, lod, bevel=0)
        box("interior_shelf", (-20.35, 1.9, 29.68), (-17.7, 1.96, 29.95), timber, lod)
        for x in (-20.3, -18.0):
            box("shelf_bracket", (x, 1.74, 29.69), (x + .045, 1.9, 29.93), metal, lod)


def uv_new():
    for obj in NEW:
        realism.ensure_col(obj.data)
        if obj.get("uvLocked"):
            continue
        mesh = obj.data
        uv = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
        mw = obj.matrix_world
        for poly in mesh.polygons:
            normal = mw.to_3x3() @ poly.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            for li in poly.loop_indices:
                p = mw @ mesh.vertices[mesh.loops[li].vertex_index].co
                uv.data[li].uv = ((p.y if axis == 0 else p.x) / 2, (p.y if axis == 2 else p.z) / 2)


def merge_new():
    # Add to existing static material batches, preserving their extras and every
    # dynamic rig. One new transparent material per tier is the only extra draw.
    bpy.context.view_layer.update()
    tiers = {lod: [o for o in NEW if o.get("zoneLod") == lod] for lod in ("LOD0", "LOD1")}
    for lod, members in tiers.items():
        groups = {}
        for obj in members:
            groups.setdefault(obj.material_slots[0].material, []).append(obj)
        for mat, objects in groups.items():
            target = next((o for o in K.collections["RENDER_" + lod].objects
                           if o not in NEW and o.type == "MESH" and not o.parent
                           and not o.get("instanceKey") and not o.get("ambientMotion")
                           and len(o.material_slots) == 1 and o.material_slots[0].material == mat), None)
            bm = bmesh.new()
            if target:
                bm.from_mesh(target.data)
            depsgraph = bpy.context.evaluated_depsgraph_get()
            for obj in objects:
                mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
                transform = obj.matrix_world if target is None else target.matrix_world.inverted() @ obj.matrix_world
                mesh.transform(transform); bm.from_mesh(mesh)
                bpy.data.meshes.remove(mesh)
            if target is None:
                name = f"MESH_FERRIS_HARBOR_{mat.name.removeprefix('MAT_')}_{lod}"
                mesh = bpy.data.meshes.new(name)
                target = bpy.data.objects.new(name, mesh)
                bpy.context.scene.collection.objects.link(target)
                K._finish(target, mat, lod, {"repairPass": "RP02"}, 0)
            bm.to_mesh(target.data); bm.free(); target.data.update()
            for obj in objects:
                bpy.data.objects.remove(obj, do_unlink=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    STAGING.mkdir(parents=True, exist_ok=True)
    if args.render:
        bpy.ops.wm.open_mainfile(filepath=str(OUTPUT))
        render_views(REVIEW, [
            ("ticket-office-front", (-25.5, 5.1, 41.3), (-18.9, 1.7, 31.5), 46),
            ("ticket-office-entrance", (-25.3, 2.6, 32), (-19, 1.55, 30.9), 35),
        ], resolution=(3840, 2160), hide_collections=("COLLISION", "COLLISION_ZONE", "REFERENCE", "PREVIEW_ONLY", "RENDER_LOD1"))
        return
    sha = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    K.bind_existing_scene(); bpy.context.view_layer.update()
    protected = realism.protected_signature()
    removed = remove_old_booth()
    build("LOD0"); build("LOD1")
    bpy.context.view_layer.update(); uv_new()
    static = [o for o in realism.render_meshes() if not o.name.endswith("LOD1") and o.get("zoneLod") != "LOD1" and realism.solid(o)]
    realism.bake_contact(NEW, realism.world_bvh(static), 12)
    merge_new()
    after = realism.protected_signature()
    if any(after.get(name) != signature for name, signature in protected.items()):
        raise RuntimeError("Existing protected collider, rig or reference changed")
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != sha:
        raise RuntimeError("Input RL01 source changed")
    bpy.context.scene["ticketOfficeRepair"] = "RP02: matched glass/walls/roof, 1.45 m west entrance, legible sign"
    bpy.context.scene["ticketOfficeSourceSHA256"] = sha
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), check_existing=False)
    sys.argv = ["export", "--", "--output", str(STAGING / "ferris-harbor-candidate.glb")]
    runpy.run_path(str(ROOT / "tools/harbor-v2/export_zone_scene.py"), run_name="__main__")
    report = {"source": str(SOURCE.relative_to(ROOT)), "sourceSHA256": sha, "sourcePreserved": True,
              "protectedNodesUnchanged": len(protected), "blend": str(OUTPUT.relative_to(ROOT)),
              "removedComponents": removed, "addedColliders": [o.name for o in COLLIDERS]}
    (STAGING / "repair.json").write_text(json.dumps(report, indent=2) + "\n")
    print("TICKET_REPAIR=" + json.dumps(report))


if __name__ == "__main__":
    main()
