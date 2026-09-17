"""RP03 native Harbor Market upgrade; preserve the surrounding RL01 container yard.

Only complete Low shop components and the old High sign are replaced. High stocked
fixtures, all existing colliders, RL01 shading, animated elements and yard geometry
are retained. Writes a versioned sibling .blend and a staging GLB, never production.
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
sys.path[:0] = [str(ROOT / "tools/harbor-v2"), str(ROOT / "tools/harbor-v2/zones")]
import realism_pass as realism
import zone_kit as zk
from preview_render import render_views

SOURCE = ROOT / "art-source/harbor-v2/container-bd/container-bd-realism.blend"
OUTPUT = SOURCE.with_name("container-bd-market-rp03.blend")
STAGING = ROOT / "art-source/harbor-v2/_staging/market-rp03"
REVIEW = ROOT / "docs/v2/harbor/repair-review/market-rp03"
K = zk.ZoneKit("CONTAINER_BD", "container-bd", "container-bd-pbr")
NEW = []
SHOP = ((36.9, -.05, -44.2), (53.8, 8.0, -30.7))
SIGN = ((41.1, 4.65, -31.001), (48.9, 5.65, -30.8))
TRANSOM = ((43.41, 3.199, -33.07), (46.59, 4.23, -32.85))


def inside(points, bounds):
    return all(all(bounds[0][i] - 1e-5 <= p[i] <= bounds[1][i] + 1e-5 for i in range(3)) for p in points)


def triangles_outside_shop():
    """Protect world-space render topology outside the exact surgery envelope."""
    rows = []
    for obj in realism.render_meshes():
        if obj in NEW:
            continue
        obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            points = [zk.to_three(obj.matrix_world @ obj.data.vertices[i].co) for i in tri.vertices]
            if not inside(points, SHOP):
                rows.append((obj.name, tuple(round(v, 5) for p in points for v in p)))
    return hashlib.sha256(repr(sorted(rows)).encode()).hexdigest(), len(rows)


def remove_components():
    report = []
    for obj in list(realism.render_meshes()):
        if obj.parent or obj.get("instanceKey") or obj.get("ambientMotion"):
            continue
        bounds = [SHOP] if obj.get("zoneLod") == "LOD1" or obj.name.endswith("LOD1") else [SIGN, TRANSOM]
        bm = bmesh.new(); bm.from_mesh(obj.data)
        pending = set(bm.verts); erase = []; count = 0
        while pending:
            seed = pending.pop(); component = {seed}; stack = [seed]
            while stack:
                for edge in stack.pop().link_edges:
                    for v in edge.verts:
                        if v in pending:
                            pending.remove(v); component.add(v); stack.append(v)
            if any(inside([zk.to_three(obj.matrix_world @ v.co) for v in component], bound) for bound in bounds):
                erase.extend(component); count += 1
        if erase:
            report.append({"name": obj.name, "components": count, "vertices": len(erase)})
            bmesh.ops.delete(bm, geom=erase, context="VERTS"); bm.to_mesh(obj.data)
            if len(obj.data.vertices) == 0:
                bpy.data.objects.remove(obj, do_unlink=True)
        bm.free()
    if sum(r["vertices"] for r in report if r["name"].endswith("LOD1")) < 100:
        raise RuntimeError("Expected Low shop component set not found; source is incompatible")
    return report


PALETTE = ["paint_yellow", "paint_white", "rubber", "safety_red", "machine_orange", "machine_yellow", "rust", "timber", "cardboard", "tarp_blue", "tarp_green", "steel_black", "trim", "shelf", "product_a", "product_b", "product_c", "grey", "bin_green", "white", "bike_blue", "concrete_dark", "rope", "cable", "interior", "navy", "wall_cream", "floor", "ceiling", "counter", "apple_red", "apple_green", "orange", "banana", "lemon", "potato", "cabbage", "tomato", "melon", "plum"]


def materials():
    M = {name: zk.PaletteSwatch(bpy.data.materials["MAT_BD_PALETTE"], ((i % 7) + .5) / 7, ((i // 7) + .5) / 7, name) for i, name in enumerate(PALETTE)}
    M.update(steel=bpy.data.materials["MAT_STEEL_DARK"], concrete=bpy.data.materials["MAT_CONCRETE_YARD"], glass=bpy.data.materials["MAT_GLASS_CLEAR"])
    # This material belongs to shop glazing/refrigerators, not the yard windows.
    for node in M["glass"].node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Alpha"].default_value = .17
            node.inputs["Roughness"].default_value = .11
    sheet = bpy.data.materials["MAT_CONTAINER_STEEL"]
    M["charcoal"] = zk.TintedMaterial(sheet, (.045, .05, .06), "market_charcoal")
    M["warm_metal"] = zk.TintedMaterial(sheet, (.32, .27, .19), "market_warm_metal")
    # New joinery uses existing material families; no new texture allocation.
    M["lamp"] = zk.PaletteSwatch(bpy.data.materials["MAT_BD_LIGHT"], .625, .375, "led")
    M["sign_light"] = zk.PaletteSwatch(bpy.data.materials["MAT_BD_LIGHT"], .875, .375, "sign")
    return M


def box(name, lo, hi, mat, lod="LOD0", bevel=0, collision=False, tags=None):
    if any(hi[i] <= lo[i] for i in range(3)):
        return None
    obj = K.box("market_" + name, tuple(hi[i] - lo[i] for i in range(3)), tuple((lo[i] + hi[i]) / 2 for i in range(3)), mat,
                lod=lod, bevel=bevel if lod == "LOD0" else 0, tags={"repairPass": "RP03", **(tags or {})})
    NEW.append(obj)
    if collision:
        K.collider("MARKET_" + name.upper(), lo, hi)
    return obj


def label(name, body, center, size, width, mat, lod):
    curve = bpy.data.curves.new(name, "FONT"); curve.body = body
    curve.align_x = "CENTER"; curve.align_y = "CENTER"; curve.size = size
    curve.resolution_u = 2; curve.extrude = .003 if lod == "LOD0" else 0
    font = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"
    if Path(font).exists():
        curve.font = bpy.data.fonts.load(font, check_existing=True)
    obj = bpy.data.objects.new(name, curve); bpy.context.scene.collection.objects.link(obj)
    obj.location = zk.to_blender(center); obj.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.update()
    if obj.dimensions.x > width:
        obj.scale *= width / obj.dimensions.x
    matrix = obj.matrix_world.copy()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(obj, do_unlink=True)
    obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj); obj.matrix_world = matrix
    K._finish(obj, mat, lod, {"castShadow": False, "repairPass": "RP03"}, 0)
    NEW.append(obj)


def split_hatch(name, x0, x1, y0, y1, z0, z1, mat, lod, collision=False):
    hx0, hx1, hz0, hz1 = 38.2, 39.3, -41.9, -40.7
    spans = [("w", (x0, y0, z0), (hx0, y1, z1)), ("e", (hx1, y0, z0), (x1, y1, z1)),
             ("n", (hx0, y0, z0), (hx1, y1, hz0)), ("s", (hx0, y0, hz1), (hx1, y1, z1))]
    for part, lo, hi in spans:
        box(name + "_" + part, lo, hi, mat, lod, collision=collision)


def low_store(M):
    L = "LOD1"
    # Thin wall faces, never full room/roof masses. Keep exactly the High gameplay routes.
    box("floor", (38.2, .23, -42.8), (51.8, .25, -33.15), M["floor"], L)
    for name, lo, hi in [
        ("wall_w", (37.88, .25, -43.12), (38.2, 5.45, -32.88)),
        ("wall_e", (51.8, .25, -43.12), (52.12, 5.45, -32.88)),
        ("wall_n", (38.2, .25, -43.12), (51.8, 5.45, -42.8)),
        ("wall_front_w", (38.2, .25, -33.15), (39.6, 5.45, -32.88)),
        ("wall_front_e", (50.4, .25, -33.15), (51.8, 5.45, -32.88)),
        ("wall_header", (39.6, 4.2, -33.15), (50.4, 5.45, -32.88)),
    ]: box(name, lo, hi, M["charcoal"], L)
    for x0, x1 in ((38, 43.5), (46.5, 52)):
        box("plinth", (x0, 0, -33.02), (x1, .7, -32.84), M["concrete"], L)
    for x0, x1 in ((39.6, 43.5), (46.5, 50.4)):
        box("glazing", (x0, .7, -32.99), (x1, 4.2, -32.975), M["glass"], L)
        for x in (x0, (x0 + x1) / 2, x1 - .06):
            box("mullion", (x, .7, -33.04), (x + .06, 4.2, -32.86), M["steel"], L)
        box("window_rail", (x0, 3, -33.04), (x1, 3.06, -32.86), M["steel"], L)
    box("operator_header", (43.42, 2.9, -33.25), (46.58, 3.2, -32.78), M["trim"], L)
    box("door_transom", (43.5, 3.2, -33.02), (46.5, 4.2, -32.98), M["glass"], L)
    for x0, x1 in ((42.0, 43.48), (46.52, 48.0)):
        box("open_door_glass", (x0, .38, -32.79), (x1, 2.72, -32.76), M["glass"], L)
        box("open_door_top", (x0, 2.72, -32.8), (x1, 2.84, -32.74), M["steel"], L)
        box("open_door_base", (x0, .27, -32.8), (x1, .39, -32.74), M["steel"], L)
    split_hatch("roof", 37, 53, 5.5, 5.8, -44, -32, M["charcoal"], L)
    split_hatch("ceiling", 38.2, 51.8, 4.2, 4.25, -42.8, -33.15, M["ceiling"], L)
    for x in (40.6, 45, 49.4):
        for z in (-39, -36.6, -34.3):
            box("ceiling_light", (x - .3, 4.188, z - .6), (x + .3, 4.2, z + .6), M["lamp"], L, tags={"castShadow": False})
    for name, lo, hi in [
        ("parapet_w", (37, 5.8, -44), (37.15, 6.36, -32)),
        ("parapet_e", (52.85, 5.8, -44), (53, 6.36, -32)),
        ("parapet_n", (37.15, 5.8, -44), (52.85, 6.36, -43.85)),
        ("parapet_s", (37.15, 5.8, -32.15), (52.85, 6.36, -32)),
        ("canopy", (37, 5.4, -33.1), (53, 5.65, -31)),
        ("canopy_fascia", (37, 4.6, -31.1), (53, 5.8, -30.98)),
    ]: box(name, lo, hi, M["concrete"] if name.startswith("parapet") else M["charcoal"], L)
    # Stockroom/office doorway walls, with matching open returns and furnishings.
    for x0, x1 in ((38.2, 39.7), (40.6, 41.9), (42.8, 43)):
        box("room_front", (x0, .25, -40.6), (x1, 4.2, -40.5), M["wall_cream"], L)
    for x0, x1 in ((40.8, 40.9), (42.9, 43)):
        box("room_side", (x0, .25, -42.8), (x1, 4.2, -40.6), M["wall_cream"], L)
    for x0, x1 in ((39.7, 40.6), (41.9, 42.8)):
        box("room_door_head", (x0, 2.35, -40.61), (x1, 2.43, -40.49), M["steel"], L)
    for name, lo, hi, mat in [
        ("gondola_a", (41.2, .25, -38.95), (42.2, 1.85, -35.15), "trim"),
        ("gondola_b", (45.6, .25, -40.35), (46.6, 1.85, -35.15), "trim"),
        ("fridge_rear", (43.2, .25, -42.8), (51.05, 2.15, -42.05), "white"),
        ("fridge_side", (51.05, .25, -42.05), (51.8, 2.15, -38.05), "white"),
        ("checkout", (48.7, .25, -37.6), (49.7, 1.15, -34.4), "navy"),
        ("impulse", (48.2, .25, -37.6), (48.7, 1.45, -36.4), "trim"),
        ("produce", (38.2, .25, -39.6), (39.5, 1.35, -34.6), "timber"),
        ("stock_shelf", (38.3, .25, -42.75), (40.7, 2.2, -42.3), "shelf"),
        ("manager_desk", (41, .65, -42.75), (42.2, .78, -42.1), "timber"),
        ("east_rack", (52.35, 0, -37.6), (53.25, 2, -36.8), "grey"),
        ("east_cabinet", (52.35, 0, -36.4), (53.25, 2, -35.6), "grey"),
        ("east_crates", (52.6, .18, -40.6), (53.7, 1.28, -39.5), "timber"),
        ("roof_ac", (47.2, 5.8, -40.55), (48.8, 6.6, -39.45), "grey"),
    ]: box(name, lo, hi, M[mat], L)
    # Small reusable product colour rows, batched into the existing palette.
    for shelf in range(3):
        for item in range(11):
            x = 43.38 + item * .66
            box("cold_drink", (x, .5 + shelf * .47, -42.08), (x + .42, .83 + shelf * .47, -42.015), M[("product_a", "product_b", "product_c")[item % 3]], L)
    for x in (41.21, 42.12, 45.61, 46.52):
        for z in (-38.2, -37.4, -36.6, -35.8):
            for shelf in range(3):
                box("grocery_row", (x, .55 + shelf * .43, z), (x + .07, .85 + shelf * .43, z + .48), M[("product_a", "product_b", "product_c")[shelf]], L)
    for z in (-41.53, -41.11):
        box("ladder_stile", (38.27, .35, z), (38.31, 6.8, z + .04), M["steel"], L)
    for i in range(20):
        y = .6 + i * .3
        box("ladder_rung", (38.275, y, -41.49), (38.31, y + .025, -41.1), M["steel"], L)


def architecture(M, lod):
    # A supported contemporary port shop: warm slatted soffit, dark rolled edge,
    # three recessed storefront bays, legible identity and attached wall signage.
    box("identity_panel", (40.2, 4.72, -30.975), (49.8, 5.58, -30.9), M["navy"], lod, bevel=.025)
    if lod == "LOD0":
        # The former "transom frame" was a solid steel box behind glass. Rebuild
        # only its perimeter so the upper storefront really looks into the shop.
        box("clear_transom", (43.5, 3.25, -32.99), (46.5, 4.14, -32.975), M["glass"], lod)
        for x0, x1 in ((43.42, 43.5), (46.5, 46.58)):
            box("transom_jamb", (x0, 3.2, -33.06), (x1, 4.22, -32.86), M["steel"], lod)
        for y0, y1 in ((3.2, 3.25), (4.14, 4.22)):
            box("transom_rail", (43.5, y0, -33.06), (46.5, y1, -32.86), M["steel"], lod)
    label("market_wordmark", "HARBOR  MARKET", (45, 5.21, -30.89), .59, 8.5, M["white"], lod)
    label("market_tagline", "PROVISIONS  /  COFFEE  /  DAILY GOODS", (45, 4.88, -30.89), .14, 7.9, M["paint_white"], lod)
    box("sign_underlight", (40.4, 4.69, -30.96), (49.6, 4.715, -30.86), M["sign_light"], lod, tags={"castShadow": False})
    # Deep vertical timber fins are fixed on the two opaque facade returns.
    for x0, x1 in ((38.25, 39.4), (50.6, 51.75)):
        for i in range(6 if lod == "LOD0" else 4):
            x = x0 + i * (x1 - x0) / (5 if lod == "LOD0" else 3)
            box("facade_fin", (x, .78, -32.86), (x + .055, 4.25, -32.72), M["timber"], lod, bevel=.006)
    for i in range(30 if lod == "LOD0" else 15):
        x = 38.25 + i * (13.45 / (29 if lod == "LOD0" else 14))
        box("soffit_slat", (x, 5.30, -32.8), (x + .075, 5.38, -31.15), M["timber"], lod, bevel=.004)
    for x in (38.1, 41.5, 48.5, 51.9):
        box("canopy_bracket", (x, 4.62, -33.10), (x + .07, 5.36, -33.02), M["steel"], lod)
        box("canopy_beam", (x, 5.24, -33.05), (x + .07, 5.35, -31.14), M["steel"], lod)
    for x in (39.61, 43.42, 46.5, 50.34):
        box("mullion_cap", (x, .75, -32.86), (x + .045, 4.15, -32.81), M["warm_metal"], lod)
    for x in (40.2, 41.4, 42.6, 47.25, 48.45, 49.65):
        box("glass_safety_band", (x, 1.45, -32.964), (x + .55, 1.485, -32.959), M["paint_white"], lod, tags={"castShadow": False})
    label("market_open_label", "OPEN  24H", (50.98, 2.85, -32.69), .16, 1.2, M["paint_white"], lod)
    label("market_door_label", "WELCOME", (45, 3.06, -32.765), .15, 1.3, M["paint_white"], lod)
    label("market_checkout_label", "CHECKOUT", (49.2, 2.9, -35.8), .20, 1.6, M["navy"], lod)
    # Two ceiling rods anchor the interior wayfinding sign (not a floating panel).
    box("checkout_sign", (48.3, 2.7, -35.84), (50.1, 3.10, -35.81), M["white"], lod)
    for x in (48.5, 49.9):
        box("checkout_sign_rod", (x, 3.1, -35.835), (x + .017, 4.2, -35.82), M["steel"], lod)
    if lod == "LOD0":
        for x in (38.5, 51.45):
            box("wall_light_housing", (x, 3.82, -32.75), (x + .20, 4.06, -32.61), M["steel"], lod, bevel=.018)
            box("wall_light_lens", (x + .025, 3.815, -32.735), (x + .175, 3.827, -32.625), M["lamp"], lod, tags={"castShadow": False})
        for x in (38.02, 52.06):
            for y in (.9, 2.1, 3.3, 4.5):
                box("downpipe_clamp", (x - .07, y, -32.85), (x + .07, y + .035, -32.77), M["steel"], lod)
        for x in (38.4, 51.1):
            box("store_number_panel", (x, 1.6, -32.71), (x + .45, 2.0, -32.66), M["navy"], lod)
            label("store_number", "07", (x + .225, 1.81, -32.652), .22, .35, M["white"], lod)


def collision_additions():
    # Procedural back/side/front glass and roof remain authoritative. These are
    # only previously missing volumes, tightly matched to High/Low new visuals.
    K.collider("MARKET_OPERATOR_HEADER", (43.5, 2.9, -33.25), (46.5, 4.0, -32.78))
    for name, lo, hi in [
        ("CEILING_E", (43, 4.2, -42.8), (51.8, 4.25, -33.15)),
        ("CEILING_STOCK", (39.3, 4.2, -42.8), (40.8, 4.25, -40.6)),
        ("CEILING_OFFICE", (40.9, 4.2, -42.8), (42.9, 4.25, -40.6)),
        ("CEILING_AISLE", (39.3, 4.2, -40.5), (43, 4.25, -33.15)),
        ("CEILING_DOOR_A", (39.7, 4.2, -40.6), (40.6, 4.25, -40.5)),
        ("CEILING_DOOR_B", (41.9, 4.2, -40.6), (42.8, 4.25, -40.5)),
        ("CEILING_N", (38.2, 4.2, -42.8), (39.3, 4.25, -41.9)),
        ("CEILING_S", (38.2, 4.2, -40.5), (39.3, 4.25, -33.15)),
        ("CEILING_HATCH_RETURN", (38.2, 4.2, -40.7), (39.3, 4.25, -40.6)),
        ("ROOM_HEADER_A", (39.7, 2.35, -40.61), (40.6, 2.43, -40.49)),
        ("ROOM_HEADER_B", (41.9, 2.35, -40.61), (42.8, 2.43, -40.49)),
    ]: K.collider("MARKET_" + name, lo, hi)


def finish_new():
    bpy.context.view_layer.update()
    for obj in NEW:
        realism.ensure_col(obj.data)
        if obj.get("uvLocked"):
            continue
        uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
        mw = obj.matrix_world
        for poly in obj.data.polygons:
            normal = mw.to_3x3() @ poly.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            for li in poly.loop_indices:
                p = mw @ obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv = ((p.y if axis == 0 else p.x) / 2, (p.y if axis == 2 else p.z) / 2)
    static = [o for o in realism.render_meshes() if not o.name.endswith("LOD1") and o.get("zoneLod") != "LOD1" and realism.solid(o)]
    realism.bake_contact(NEW, realism.world_bvh(static), 8)
    groups = {}
    for obj in NEW:
        mat = obj.material_slots[0].material
        groups.setdefault((obj.get("zoneLod"), mat), []).append(obj)
    for (lod, mat), objects in groups.items():
        target = next((o for o in K.collections["RENDER_" + lod].all_objects if o not in NEW and o.type == "MESH" and not o.parent
                       and not o.get("instanceKey") and not o.get("ambientMotion") and not o.get("ignoreWeaponRaycast")
                       and len(o.material_slots) == 1 and o.material_slots[0].material == mat), None)
        bm = bmesh.new()
        if target: bm.from_mesh(target.data)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for obj in objects:
            mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
            mesh.transform(obj.matrix_world if target is None else target.matrix_world.inverted() @ obj.matrix_world)
            bm.from_mesh(mesh); bpy.data.meshes.remove(mesh)
        if target is None:
            name = f"MESH_CONTAINER_BD_MARKET_RP03_{mat.name.removeprefix('MAT_')}_{lod}"
            target = bpy.data.objects.new(name, bpy.data.meshes.new(name)); bpy.context.scene.collection.objects.link(target)
            K._finish(target, mat, lod, {"repairPass": "RP03"}, 0)
        bm.to_mesh(target.data); bm.free(); target.data.update()
        for obj in objects: bpy.data.objects.remove(obj, do_unlink=True)
    NEW.clear()


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--render", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    if args.render:
        bpy.ops.wm.open_mainfile(filepath=str(OUTPUT))
        render_views(REVIEW, [
            ("market-front-4k", (59, 6.3, -14), (44.7, 2.4, -35.2), 41),
            ("market-interior-4k", (44.1, 2.05, -33.65), (45.2, 1.45, -40.8), 19),
        ], resolution=(3840, 2160), hide_collections=("COLLISION", "COLLISION_ZONE", "REFERENCE", "PREVIEW_ONLY", "RENDER_LOD1"))
        return
    STAGING.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE)); K.bind_existing_scene(); bpy.context.view_layer.update()
    protected = realism.protected_signature(); external = triangles_outside_shop()
    removed = remove_components()
    # No outside geometry can change during surgery; compare before batching too.
    if triangles_outside_shop() != external: raise RuntimeError("Changed geometry outside market scope")
    M = materials(); low_store(M); architecture(M, "LOD0"); architecture(M, "LOD1"); collision_additions()
    finish_new(); bpy.context.view_layer.update()
    if any(realism.protected_signature().get(name) != sig for name, sig in protected.items()):
        raise RuntimeError("Existing collision/rig/reference changed")
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != source_hash: raise RuntimeError("Source modified")
    bpy.context.scene["harborMarketRepair"] = "RP03: native architecture, Low route parity, operator/ceiling collisions"
    bpy.context.scene["harborMarketSourceSHA256"] = source_hash
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), check_existing=False)
    sys.argv = ["export", "--", "--output", str(STAGING / "container-bd-candidate.glb")]
    runpy.run_path(str(ROOT / "tools/harbor-v2/export_zone_scene.py"), run_name="__main__")
    report = {"source": str(SOURCE.relative_to(ROOT)), "sourceSHA256": source_hash, "blend": str(OUTPUT.relative_to(ROOT)),
              "sourcePreserved": True, "protectedNodesUnchanged": len(protected), "outsideTrianglesPreserved": external[1],
              "removed": removed, "newColliders": [o.name for o in bpy.context.scene.objects if o.name.startswith("COL_MOVE_CONTAINER_BD_MARKET_")]}
    (STAGING / "repair.json").write_text(json.dumps(report, indent=2) + "\n")
    print("MARKET_RP03=" + json.dumps(report))


if __name__ == "__main__": main()
