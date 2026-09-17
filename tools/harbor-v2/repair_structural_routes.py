"""RP03 bounded native route parity and construction slab collision.

Preserves High geometry except the explicitly measured Operations door/base/trim
footprints, and every existing collision/reference node. Writes sibling native
sources and staging GLBs. No rendering or production writes.
"""
from pathlib import Path
import hashlib
import json
import runpy
import sys
import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "tools/harbor-v2"), str(ROOT / "tools/harbor-v2/zones")]
import realism_pass as rp
import zone_kit as zk

STAGING = ROOT / "art-source/harbor-v2/_staging/structural-rp03"


OPS_HIGH_EDIT_BOUNDS = [((-9.161, -.001, -43.161), (-8.979, .901, -28.839)),
                        ((-9.231, .259, -38.961), (-9.169, 3.311, -34.989)),
                        ((-9.171, .899, -43.171), (-9.109, .941, -28.829)),
                        ((-8.761, .249, -40.801), (-8.739, 1.251, -29.149)),
                        ((-9.171, .899, -28.891), (9.171, .941, -28.829))]


def high_signature(excluded=()):
    rows = []
    for obj in rp.render_meshes():
        if obj.name.endswith("LOD1"):
            continue
        obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            points = [zk.to_three(obj.matrix_world @ obj.data.vertices[i].co) for i in tri.vertices]
            if any(within(points, lo, hi) for lo, hi in excluded): continue
            rows.append((obj.name, tuple(round(v, 6) for p in points for v in p)))
    return hashlib.sha256(repr(sorted(rows)).encode()).hexdigest()


def components(bm):
    pending = set(bm.verts)
    while pending:
        seed = pending.pop(); group = {seed}; stack = [seed]
        while stack:
            for edge in stack.pop().link_edges:
                for v in edge.verts:
                    if v in pending:
                        pending.remove(v); group.add(v); stack.append(v)
        yield group


def within(points, lo, hi):
    return all(all(lo[i] - .00001 <= p[i] <= hi[i] + .00001 for i in range(3)) for p in points)


def garden(K):
    # Only these complete original primitive components are removed. Back wall,
    # gables, porch, lawn, foliage and every High vertex stay exactly as authored.
    targets = {
        "MAT_PLASTER_OLD": [((-40.25, .35, 18), (-39.75, 10.35, 26)),
                            ((-30.25, .35, 18), (-29.75, 10.35, 26)),
                            ((-40.25, .35, 25.75), (-29.75, 10.35, 26.25))],
        "MAT_BRICK": [((-32.25, .35, 18.25), (-30.75, 12.85, 19.75))],
        "MAT_ROOF_METAL_DARK": [((-41.15, 10.8, 17), (-28.85, 13.65, 27))],
    }
    removed = []
    for obj in list(rp.render_meshes()):
        if not obj.name.endswith("LOD1") or len(obj.material_slots) != 1:
            continue
        bounds = targets.get(obj.material_slots[0].material.name, [])
        if not bounds: continue
        bm = bmesh.new(); bm.from_mesh(obj.data); erase = []
        for group in components(bm):
            points = [zk.to_three(obj.matrix_world @ v.co) for v in group]
            if any(within(points, lo, hi) for lo, hi in bounds): erase.extend(group)
        if erase:
            removed.append({"name": obj.name, "vertices": len(erase)})
            bmesh.ops.delete(bm, geom=erase, context="VERTS"); bm.to_mesh(obj.data)
        bm.free()
    if sum(row["vertices"] for row in removed) != 56:
        raise RuntimeError("Expected sealed Low wall/chimney/roof components (56 welded vertices); found " + repr(removed))

    created = []
    def box(name, lo, hi, material):
        obj = K.box("rp03_" + name, tuple(hi[i] - lo[i] for i in range(3)), tuple((lo[i] + hi[i]) / 2 for i in range(3)),
                    bpy.data.materials[material], lod="LOD1", tags={"repairPass": "RP03"})
        created.append(obj)
        return obj
    plaster = "MAT_PLASTER_OLD"; timber = "MAT_WOOD_WEATHERED"; brick = "MAT_BRICK"
    for x in (-40, -30):
        for i, (ya, yb, za, zb) in enumerate([
            (.35, 1.35, 18, 26), (1.35, 3.35, 18, 19.5), (1.35, 3.35, 24.5, 26),
            (3.35, 6.35, 18, 26), (6.35, 8.35, 18, 19.5), (6.35, 8.35, 24.5, 26), (8.35, 10.35, 18, 26),
        ]): box(f"window_wall_{x}_{i}", (x - .25, ya, za), (x + .25, yb, zb), plaster)
        for y0, y1 in ((1.35, 3.35), (6.35, 8.35)):
            for ya, yb in ((y0 - .1, y0), (y1, y1 + .1)):
                box("window_horizontal", (x - .28, ya, 19.5), (x + .28, yb, 24.5), timber)
            for za, zb in ((19.4, 19.5), (24.5, 24.6)):
                box("window_jamb", (x - .28, y0, za), (x + .28, y1, zb), timber)
    for i, (xa, xb, ya, yb) in enumerate([
        (-40.25, -36.5, .35, 5.35), (-33.5, -29.75, .35, 5.35), (-36.5, -33.5, 3.15, 5.35),
        (-40.25, -37.5, 5.35, 10.35), (-32.5, -29.75, 5.35, 10.35), (-37.5, -32.5, 9.7, 10.35),
    ]): box(f"front_{i}", (xa, ya, 25.75), (xb, yb, 26.25), plaster)
    box("loggia_header", (-37.6, 9.55, 25.71), (-32.4, 9.7, 26.29), timber)
    for x0, x1 in ((-37.6, -37.5), (-32.5, -32.4)):
        box("loggia_jamb", (x0, 5.35, 25.71), (x1, 9.55, 26.29), timber)
    for lo, hi in [
        ((-32.25, .35, 18.25), (-30.75, 12.85, 18.4)),
        ((-32.25, .35, 18.25), (-32.1, 12.85, 19.75)),
        ((-30.9, .35, 18.25), (-30.75, 12.85, 19.75)),
        ((-32.25, 2.35, 19.6), (-30.75, 12.85, 19.75)),
    ]: box("open_chimney", lo, hi, brick)
    for lo, hi in [
        ((-32.37, 12.85, 18.13), (-30.63, 12.99, 18.4)),
        ((-32.37, 12.85, 19.6), (-30.63, 12.99, 19.87)),
        ((-32.37, 12.85, 18.4), (-32.1, 12.99, 19.6)),
        ((-30.9, 12.85, 18.4), (-30.63, 12.99, 19.6)),
    ]: box("chimney_rim", lo, hi, "MAT_BASE_CONCRETE")
    def roof_y(z): return 13.65 - .54 * abs(z - 22)
    for i, (x0, x1, z0, z1) in enumerate([
        (-41.15, -32.25, 17, 22), (-30.75, -28.85, 17, 22),
        (-32.25, -30.75, 17, 18.25), (-32.25, -30.75, 19.75, 22),
        (-41.15, -28.85, 22, 27),
    ]):
        v = [(x0, roof_y(z0), z0), (x1, roof_y(z0), z0), (x1, roof_y(z1), z1), (x0, roof_y(z1), z1)]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        created.append(K.mesh(f"rp03_flue_roof_{i}", v + [(x, y - .14, z) for x, y, z in v], faces,
                              bpy.data.materials["MAT_ROOF_METAL_DARK"], lod="LOD1", force_recalc=True))
    # Carry the High interior floor, stairs, room joinery and correct open lining
    # verbatim into Low. These small batches provide visible support for existing
    # gameplay furniture and staircase colliders without rebuilding all detail.
    copied = []
    for obj in list(rp.render_meshes()):
        if not obj.name.endswith("LOD0") or len(obj.material_slots) != 1: continue
        if obj.material_slots[0].material.name not in ("MAT_WOOD_INTERIOR", "MAT_PLASTER_INTERIOR"): continue
        dup = obj.copy(); dup.data = obj.data.copy(); dup.name = obj.name.replace("LOD0", "RP03_LOD1")
        K.collections["RENDER_LOD1"].objects.link(dup); dup["zoneLod"] = "LOD1"; dup["repairPass"] = "RP03"
        copied.append(dup.name)
    if len(copied) != 2: raise RuntimeError("Expected 2 High interior material batches")
    # Balcony rails already have gameplay boxes; show their silhouette on Low.
    for ya, yb in ((6.32, 6.40), (5.95, 6.00)):
        box("balcony_front_rail", (-37.5, ya, 27.65), (-32.5, yb, 27.75), timber)
    for x in (-37.5, -36.25, -35, -33.75, -32.5):
        box("balcony_post", (x - .04, 5.55, 27.65), (x + .04, 6.4, 27.75), timber)
    # Existing RL01 materials are reused. New Low only needs world-metre UVs;
    # copied interior meshes retain the original baked contact/UV data unchanged.
    bpy.context.view_layer.update()
    for obj in created:
        rp.ensure_col(obj.data)
        uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
        for poly in obj.data.polygons:
            normal = obj.matrix_world.to_3x3() @ poly.normal
            axis = max(range(3), key=lambda i: abs(normal[i]))
            for li in poly.loop_indices:
                p = obj.matrix_world @ obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv = ((p.y if axis == 0 else p.x) / 2, (p.y if axis == 2 else p.z) / 2)
    # Batch ONLY newly authored Low shapes into existing Low material batches.
    groups = {}
    for obj in created: groups.setdefault(obj.material_slots[0].material, []).append(obj)
    for mat, objs in groups.items():
        target = next(o for o in K.collections["RENDER_LOD1"].all_objects if o.type == "MESH" and o not in created and len(o.material_slots) == 1 and o.material_slots[0].material == mat)
        bm = bmesh.new(); bm.from_mesh(target.data)
        for obj in objs:
            mesh = obj.data.copy(); mesh.transform(target.matrix_world.inverted() @ obj.matrix_world)
            bm.from_mesh(mesh); bpy.data.meshes.remove(mesh)
        bm.to_mesh(target.data); bm.free(); target.data.update()
        for obj in objs: bpy.data.objects.remove(obj, do_unlink=True)
    return {"removed": removed, "copiedHighInteriorBatches": copied}


def operations(K):
    removed = []
    targets = {"MAT_AB_SHEET": ((-9.12, .9, -43.12), (9.12, 6.98, -28.88)),
               "MAT_CONCRETE_YARD": ((-9.16, 0, -43.16), (9.16, .9, -28.84))}
    for obj in list(rp.render_meshes()):
        if not obj.name.endswith("LOD1") or len(obj.material_slots) != 1: continue
        bound = targets.get(obj.material_slots[0].material.name)
        if not bound: continue
        bm = bmesh.new(); bm.from_mesh(obj.data); erase = []
        for group in components(bm):
            if within([zk.to_three(obj.matrix_world @ v.co) for v in group], *bound): erase.extend(group)
        if erase:
            removed.append({"name": obj.name, "vertices": len(erase)})
            bmesh.ops.delete(bm, geom=erase, context="VERTS"); bm.to_mesh(obj.data)
        bm.free()
    if sum(r["vertices"] for r in removed) != 16: raise RuntimeError("Expected Operations Low full-wall and raised-base primitives: " + repr(removed))
    # Actual High side leaf lies across the supposedly open doorway. Move its
    # complete component 2.05m north against the adjacent solid wall. Rebuild
    # only the west base strip in two pieces, leaving a floor-level opening.
    high_changes = []
    for obj in list(rp.render_meshes()):
        if not obj.name.endswith("LOD0") or obj.parent: continue
        bm = bmesh.new(); bm.from_mesh(obj.data); moved = 0
        for group in components(bm):
            points = [zk.to_three(obj.matrix_world @ v.co) for v in group]
            if within(points, (-9.23, .26, -36.91), (-9.17, 3.31, -34.99)):
                delta = obj.matrix_world.inverted().to_3x3() @ Vector(zk.to_blender((0, 0, -2.05)))
                for v in group: v.co += delta
                moved += len(group)
        # Base strips were welded together at exterior corners. Remove only
        # complete west-strip polygons, never the map/building-wide component.
        erase = [f for f in bm.faces if any(within([zk.to_three(obj.matrix_world @ v.co) for v in f.verts], *OPS_HIGH_EDIT_BOUNDS[i]) for i in (0, 2, 3, 4))]
        if erase: bmesh.ops.delete(bm, geom=erase, context="FACES_ONLY")
        if erase or moved:
            bm.to_mesh(obj.data); high_changes.append({"name": obj.name, "movedDoorVertices": moved, "removedBaseFaces": len(erase)})
        bm.free()
    if not any(r["movedDoorVertices"] for r in high_changes) or not any(r["removedBaseFaces"] for r in high_changes):
        raise RuntimeError("Expected exact High side leaf and base components: " + repr(high_changes))
    created = []
    concrete = bpy.data.materials["MAT_CONCRETE_YARD"]
    navy = zk.TintedMaterial(bpy.data.materials["MAT_AB_SHEET"], (.10, .16, .21), "rp03_ops_navy")
    def box(name, lo, hi, mat=navy, lod="LOD1"):
        obj = K.box("rp03_" + name, tuple(hi[i] - lo[i] for i in range(3)), tuple((lo[i] + hi[i]) / 2 for i in range(3)), mat, lod=lod, bevel=.02 if lod == "LOD0" else 0, tags={"repairPass": "RP03"})
        created.append(obj)
    for z0, z1 in ((-43.16, -37), (-35, -28.84)):
        box("west_base_open", (-9.16, 0, z0), (-8.98, .9, z1), concrete, "LOD0")
        box("west_flashing_open", (-9.17, .9, z0), (-9.11, .94, z1), bpy.data.materials["MAT_STEEL_DARK"], "LOD0")
    for z0, z1 in ((-40.8, -37), (-35, -29.15)):
        box("west_dado_open", (-8.76, .25, z0), (-8.74, 1.25, z1), navy, "LOD0")
    for x0, x1 in ((-9.17, -5), (-2, 2), (5, 9.17)):
        box("front_flashing_open", (x0, .9, -28.89), (x1, .94, -28.83), bpy.data.materials["MAT_STEEL_DARK"], "LOD0")
    box("floor", (-9, .20, -40.8), (9, .252, -29), concrete)
    # The 2.2m solid ocean annex is an intentional existing gameplay barrier.
    box("annex", (-9.12, 0, -43.12), (9.12, 6.98, -40.8))
    for x0, x1 in ((-9.12, -5), (-2, 2), (5, 9.12)):
        box("front_cladding", (x0, .9, -29.15), (x1, 6.98, -28.88))
        box("front_plinth", (x0, 0, -29.15), (x1, .9, -28.84), concrete)
    for x0, x1 in ((-5, -2), (2, 5)):
        box("door_header", (x0, 5, -29.15), (x1, 6.98, -28.88))
        for x in (x0 - .06, x1):
            box("door_frame", (x, .252, -29.12), (x + .06, 5, -28.85))
    for z0, z1 in ((-40.8, -37), (-35, -28.88)):
        box("west_cladding", (-9.12, .9, z0), (-8.8, 6.98, z1))
        box("west_plinth", (-9.16, 0, z0), (-8.8, .9, z1), concrete)
    box("west_door_header", (-9.12, 3.5, -37), (-8.8, 6.98, -35))
    box("east_cladding", (8.8, .9, -40.8), (9.12, 6.98, -28.88))
    box("east_plinth", (8.8, 0, -40.8), (9.16, .9, -28.84), concrete)
    # Previously hidden storage masses have real existing colliders. Represent
    # them at their exact native bounds so Low entries lead into a usable room.
    for obj in list(bpy.context.scene.objects):
        if not obj.name.startswith("COL_MOVE_OPERATIONS_AB_"): continue
        points = [zk.to_three(obj.matrix_world @ v.co) for v in obj.data.vertices]
        if within(points, (-8.81, .20, -40.81), (8.81, 3, -29.15)):
            lo = tuple(min(p[i] for p in points) for i in range(3)); hi = tuple(max(p[i] for p in points) for i in range(3))
            box("equipment_" + obj.name, lo, hi)
    bpy.context.view_layer.update()
    for obj in created:
        rp.ensure_col(obj.data)
        uv = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
        for poly in obj.data.polygons:
            normal = obj.matrix_world.to_3x3() @ poly.normal; axis = max(range(3), key=lambda i: abs(normal[i]))
            for li in poly.loop_indices:
                p = obj.matrix_world @ obj.data.vertices[obj.data.loops[li].vertex_index].co
                uv.data[li].uv = ((p.y if axis == 0 else p.x) / 2, (p.y if axis == 2 else p.z) / 2)
    groups = {}
    for obj in created: groups.setdefault((obj.material_slots[0].material, obj.get("zoneLod")), []).append(obj)
    for (mat, lod), objs in groups.items():
        target = next(o for o in K.collections["RENDER_" + lod].all_objects if o.type == "MESH" and o not in created and len(o.material_slots) == 1 and o.material_slots[0].material == mat)
        bm = bmesh.new(); bm.from_mesh(target.data)
        for obj in objs:
            mesh = obj.data.copy(); mesh.transform(target.matrix_world.inverted() @ obj.matrix_world)
            bm.from_mesh(mesh); bpy.data.meshes.remove(mesh)
        bm.to_mesh(target.data); bm.free(); target.data.update()
        for obj in objs: bpy.data.objects.remove(obj, do_unlink=True)
    return {"removed": removed, "highExceptions": high_changes, "highExceptionBounds": OPS_HIGH_EDIT_BOUNDS,
            "doorsRestored": ["personnel", "roller", "west-side"], "interiorFloorTop": .252}


def run(zone, folder, namespace, harbor_zone):
    source = ROOT / f"art-source/harbor-v2/{folder}/{zone}-realism.blend"
    output = source.with_name(f"{zone}-structural-rp03.blend")
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source)); bpy.context.view_layer.update()
    K = zk.ZoneKit(namespace, harbor_zone, "garden-pbr"); K.bind_existing_scene()
    excluded = OPS_HIGH_EDIT_BOUNDS if namespace == "OPERATIONS_AB" else ()
    before_high = high_signature(excluded); protected = rp.protected_signature()
    if namespace == "GARDEN": changes = garden(K)
    elif namespace == "OPERATIONS_AB": changes = operations(K)
    else:
        # The lower slab's southeast 0.4 x 0.6 corner already intersects the
        # procedural 4m shoring column. Split around it without duplicate volumes.
        K.collider("RP03_POUR_1", (-33, 3.2, -21.8), (-30.2, 3.5, -15.8))
        K.collider("RP03_POUR_1_RETURN", (-33, 3.2, -15.8), (-30.6, 3.5, -15.2))
        K.collider("RP03_POUR_2", (-33, 6.4, -21.8), (-30.2, 6.7, -15.2))
        changes = {"newColliders": ["COL_MOVE_CONSTRUCTION_RP03_POUR_1", "COL_MOVE_CONSTRUCTION_RP03_POUR_1_RETURN", "COL_MOVE_CONSTRUCTION_RP03_POUR_2"]}
    bpy.context.view_layer.update()
    if high_signature(excluded) != before_high: raise RuntimeError("High render topology changed outside allowed exact side-door repair bounds")
    if any(rp.protected_signature().get(name) != sig for name, sig in protected.items()): raise RuntimeError("Protected node changed")
    if hashlib.sha256(source.read_bytes()).hexdigest() != source_hash: raise RuntimeError("Source changed")
    bpy.context.scene["structuralRepair"] = "RP03: High preserved except exact Operations doorway/base/trim footprints; Low route parity and exact native floor colliders"
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
    sys.argv = ["export", "--", "--output", str(STAGING / f"{zone}-candidate.glb")]
    runpy.run_path(str(ROOT / "tools/harbor-v2/export_zone_scene.py"), run_name="__main__")
    report = {"zone": zone, "source": str(source.relative_to(ROOT)), "sourceSHA256": source_hash, "native": str(output.relative_to(ROOT)),
              "highGeometryPreservedSHA256": before_high, "protectedNodesUnchanged": len(protected), **changes}
    (STAGING / f"{zone}-repair.json").write_text(json.dumps(report, indent=2) + "\n")
    print("STRUCTURAL_RP03=" + json.dumps(report))


STAGING.mkdir(parents=True, exist_ok=True)
ops_only = "--operations-only" in sys.argv
construction_only = "--construction-only" in sys.argv
if not ops_only and not construction_only:
    run("garden-ac", "garden", "GARDEN", "residential")
if not ops_only:
    run("construction-ad", "construction", "CONSTRUCTION", "construction")
if not construction_only:
    run("operations-ab", "operations-ab", "OPERATIONS_AB", "operations-ab")
