"""Non-destructive, repeatable Blender detail/contact pass for all six districts.

Run with Blender --background --python-exit-code 1 --python this_file -- --zone all.
Always reads the original authored .blend, writes a sibling *-realism.blend and
staging GLB. Never modifies production assets or the artist's open Blender scene.
All collision/rig transforms are compared before/after. Contact shade is baked
into existing vertex colours (no AO texture, runtime light, or draw per detail).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import runpy
import sys
import time

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
STAGING = ROOT / "art-source/harbor-v2/_staging/realism"
ZONES = {
    "garden-ac": ("garden", "GARDEN", "residential"),
    "construction-ad": ("construction", "CONSTRUCTION", "construction"),
    "container-bd": ("container-bd", "CONTAINER_BD", "container-bd"),
    "operations-ab": ("operations-ab", "OPERATIONS_AB", "operations-ab"),
    "ferris-harbor": ("ferris-harbor", "FERRIS_HARBOR", "ferris-harbor"),
    "warehouse-v2": ("warehouse", "WAREHOUSE", "warehouse"),
}
EXCLUDED = {"COLLISION", "COLLISION_ZONE", "REFERENCE", "PREVIEW_ONLY"}


def render_meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"
            and not o.name.startswith(("COL_", "REF_", "MARKER_"))
            and not any(c.name in EXCLUDED for c in o.users_collection)]


def protected_signature():
    return {o.name: {"matrix": [list(row) for row in o.matrix_world],
                     "vertices": [list(v.co) for v in o.data.vertices] if o.type == "MESH" else [],
                     "parent": o.parent.name if o.parent else None}
            for o in bpy.context.scene.objects if o.name.startswith(("COL_", "REF_", "RIG_", "SOCKET_", "MARKER_"))}


def solid(obj):
    if obj.get("ambientMotion") or obj.parent or obj.get("instanceKey"):
        return False  # never bake a neighbour's shade into a moving/shared instance
    if any(t in obj.name.upper() for t in ("GLASS", "FOLIAGE", "LEAF", "PUDDLE", "WATER", "GRATING", "LIGHT", "EMISSIVE", "NEON", "LAMP", "GRASS", "SIGN")):
        return False
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                if node.inputs["Alpha"].is_linked or node.inputs["Alpha"].default_value < 0.99:
                    return False
                if node.inputs["Emission Strength"].default_value > 0:
                    return False
    return True


def world_bvh(objects):
    verts, faces = [], []
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        start = len(verts)
        verts.extend(obj.matrix_world @ v.co for v in mesh.vertices)
        faces.extend(tuple(start + i for i in poly.vertices) for poly in mesh.polygons)
        evaluated.to_mesh_clear()
    return BVHTree.FromPolygons(verts, faces) if faces else None


def ensure_col(mesh):
    col = mesh.color_attributes.get("Col")
    if col is None:
        col = mesh.color_attributes.new(name="Col", type="BYTE_COLOR", domain="CORNER")
        col.data.foreach_set("color", [1.0] * (len(col.data) * 4))
    mesh.color_attributes.active_color = col
    mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(col)
    return col


def wire_vertex_col(mat):
    """Use the glTF-recognized texture x COLOR_0 pattern, retaining original tints."""
    if not mat or not mat.use_nodes:
        return
    tree = mat.node_tree
    if any(n.type == "VERTEX_COLOR" and n.layer_name == "Col" for n in tree.nodes):
        return
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return
    color = bsdf.inputs["Base Color"]
    source = color.links[0].from_socket if color.links else None
    base = tuple(color.default_value)
    vertex = tree.nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "Col"
    vertex.label = "RL01 baked local contact shade"
    mix = tree.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 1.0
    mix.inputs[6].default_value = base
    if source:
        tree.links.new(source, mix.inputs[6])
    tree.links.new(vertex.outputs["Color"], mix.inputs[7])
    tree.links.new(mix.outputs[2], color)


def bake_contact(objects, tree, samples=12):
    # Cosine-weighted, deterministic hemisphere, 0.8 m local radius. The floor
    # is 0.76: this is crevice/contact shading, NOT baked sunlight or black dirt.
    directions = []
    for i in range(samples):
        r = math.sqrt((i + 0.5) / samples)
        a = i * math.pi * (3 - math.sqrt(5))
        directions.append((math.cos(a) * r, math.sin(a) * r, math.sqrt(1 - r*r)))
    total, shaded, minimum = 0, 0, 1.0
    for obj in objects:
        mesh = obj.data
        col = ensure_col(mesh)
        if not solid(obj) or not tree:
            continue
        # POINT tint layers are valid too; do not replace the existing paint.
        point_domain = col.domain == "POINT"
        cache = {}
        mw = obj.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        for poly in mesh.polygons:
            normal = (nm @ poly.normal).normalized()
            tangent = normal.cross(Vector((0, 0, 1)) if abs(normal.z) < .95 else Vector((0, 1, 0))).normalized()
            bitangent = normal.cross(tangent)
            for li in poly.loop_indices:
                vi = mesh.loops[li].vertex_index
                key = (vi, round(normal.x, 3), round(normal.y, 3), round(normal.z, 3))
                if key not in cache:
                    origin = mw @ mesh.vertices[vi].co + normal * .008
                    obstruction = 0.0
                    for x, y, z in directions:
                        hit, _, _, distance = tree.ray_cast(origin, tangent*x + bitangent*y + normal*z, .8)
                        if hit is not None:
                            obstruction += 1 - (distance / .8) ** .5
                    factor = 1 - .24 * obstruction / samples
                    cache[key] = factor
                factor = cache[key]
                idx = vi if point_domain else li
                if point_domain and ("painted", vi) in cache:
                    continue
                if point_domain:
                    cache[("painted", vi)] = True
                old = col.data[idx].color
                col.data[idx].color = (old[0]*factor, old[1]*factor, old[2]*factor, old[3])
                minimum = min(minimum, factor)
                total += 1
                shaded += factor < .995
    # Wire every material and create neutral colours on excluded receivers too,
    # since a palette may be shared by animated and static objects.
    mats = {s.material for o in objects for s in o.material_slots if s.material}
    for mat in mats:
        wire_vertex_col(mat)
    return {"samples": samples, "radiusMeters": .8, "colorCorners": total,
            "shadedCorners": shaded, "minimumMultiplier": round(minimum, 4)}


def refine_normals(objects):
    changed = []
    for mat in {s.material for o in objects for s in o.material_slots if s.material}:
        if not mat.use_nodes:
            continue
        name = mat.name.upper()
        strength = .48 if any(t in name for t in ("GALV", "STEEL", "METAL")) else .65
        if not any(t in name for t in ("GALV", "STEEL", "METAL", "CONCRETE", "SLAB", "ASPHALT")):
            continue
        for node in mat.node_tree.nodes:
            if node.type == "NORMAL_MAP" and node.inputs["Strength"].default_value > strength:
                changed.append(mat.name)
                node.inputs["Strength"].default_value = strength
    return sorted(set(changed))


def add_fixings(zone, harbor_zone, tree):
    """Small 3D mounting plates + hex bolts attached to verified support faces.

    Candidate locations come from existing structural references, never random
    scatter. A ray must confirm the visible support; all new vertices are tested
    against the zone route-clearance contract. No new gameplay collider needed:
    maximum relief is 17 mm on an already-solid column face.
    """
    if tree is None:
        return {"plates": 0}
    contract_path = ROOT / f"tools/harbor-v2/zones/contracts/{zone.lower()}.json"
    contract = json.loads(contract_path.read_text()) if contract_path.exists() else {}
    clearances = contract.get("clearance", [])
    bm = bmesh.new()
    placements = []
    bounds_seen = set()
    candidates = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.name.startswith(("COL_MOVE_", "REF_")):
            continue
        pts = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
        lo = Vector(tuple(min(p[i] for p in pts) for i in range(3)))
        hi = Vector(tuple(max(p[i] for p in pts) for i in range(3)))
        size = hi-lo
        if .18 <= size.x <= .75 and .18 <= size.y <= .75 and size.z >= 2.2:
            candidates.append(((lo.x+hi.x)*.5, lo.y, lo.z + .55, min(.24, size.x*.75), (0,-1,0)))
    # Porch posts do not need individual movement colliders in the legacy map.
    if zone == "GARDEN":
        candidates.extend((x, -28.325, .75, .18, (0,-1,0)) for x in (-39.5, -35., -30.5))
    for x,y,z,width,direction in sorted(candidates, key=lambda c:(c[0], c[1], c[2])):
        if len(placements) >= 24:
            break
        center = Vector((x,y,z)); normal = Vector(direction)
        key = tuple(round(v, 2) for v in center)
        if key in bounds_seen:
            continue
        bounds_seen.add(key)
        hit, surface_normal, _, _ = tree.ray_cast(center + normal*.08, -normal, .13)
        if hit is None or surface_normal.dot(normal) < .85 or (hit-center).length > .05:
            continue
        if any((hit - Vector((p[0], -p[2], p[1]))).length < .35 for p in placements):
            continue
        # Evaluate the full envelope, not just its centre, against walkable lanes.
        low = (hit.x-width/2, hit.z-.13, -hit.y-.025)
        high = (hit.x+width/2, hit.z+.13, -hit.y+.025)
        if any(all(low[i] < v["max"][i] and high[i] > v["min"][i] for i in range(3)) for v in clearances):
            continue
        if contract and any(low[i] < contract["footprint"]["min"][i] or high[i] > contract["footprint"]["max"][i] for i in range(3)):
            continue
        plate = bmesh.ops.create_cube(bm, size=1)["verts"]
        for v in plate:
            v.co = Vector((v.co.x*width, v.co.y*.006, v.co.z*.24)) + hit + normal*.004
        for dx in (-width*.3, width*.3):
            for dz in (-.075, .075):
                bolt = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=6,
                                             radius1=.012, radius2=.012, depth=.012)["verts"]
                rot = Vector((0,0,1)).rotation_difference(normal)
                for v in bolt:
                    v.co = rot @ v.co + hit + Vector((dx,0,dz)) + normal*.011
        placements.append([round(hit.x,4), round(hit.z,4), round(-hit.y,4)])
    if not placements:
        bm.free()
        return {"plates": 0}
    name = f"MESH_{zone}_RL01_FIXINGS_LOD0"
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    # A single batch and material for the entire district, never one draw/bolt.
    mat = bpy.data.materials.new(f"MAT_{zone}_RL01_FIXINGS")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (.22,.25,.26,1)
    bsdf.inputs["Metallic"].default_value = .65
    bsdf.inputs["Roughness"].default_value = .58
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name,mesh)
    collection = bpy.data.collections.get("RENDER_LOD0")
    (collection or bpy.context.scene.collection).objects.link(obj)
    obj["harborZone"] = harbor_zone
    obj["zoneLod"] = "LOD0"
    obj["castShadow"] = False
    obj["ignoreWeaponRaycast"] = True
    obj["harbor_v2_role"] = "render_mesh"
    mesh.calc_loop_triangles()
    return {"plates":len(placements),"triangles":len(mesh.loop_triangles),"positions":placements,
            "maxReliefMeters":.017,"drawCalls":1}


def clear_warehouse_sign_fascia():
    """Pull the existing sign in front of the roof edge, on two steel stand-offs.

    The old height-only validator passed even though the fascia masked the top
    of the letters from elevated views. Preserve its height/width and add real
    supporting geometry to its existing backing batch (zero extra draws).
    """
    prefix = "MESH_WAREHOUSE_SC04_SIGN_"
    backing = bpy.data.objects.get(prefix+"BACKING")
    if backing is None or backing.get("signClearancePass") == "RL01_FASCIA_CLEARANCE":
        return False
    for obj in bpy.context.scene.objects:
        if obj.name.startswith(prefix):
            obj.location.y -= .65
            obj["signClearancePass"] = "RL01_FASCIA_CLEARANCE"
    bpy.context.view_layer.update()
    inverse = backing.matrix_world.inverted()
    bm = bmesh.new()
    bm.from_mesh(backing.data)
    for x in (-4.4, 4.4):
        verts = bmesh.ops.create_cube(bm,size=1)["verts"]
        for vertex in verts:
            world = Vector((vertex.co.x*.12+x, vertex.co.y*.72-18.52, vertex.co.z*.12+7.45))
            vertex.co = inverse @ world
    bm.to_mesh(backing.data); bm.free()
    col = backing.data.color_attributes.get("Col")
    if col:
        col.data.foreach_set("color", [1.0]*(len(col.data)*4))
    return True


def restore_warehouse_lod1_roof_access():
    """Keep both collision-authored fire escapes visible on mobile/low LOD.

    The original build_lod1 omitted these routes entirely. This lightweight
    replacement follows the 42 existing tread boxes and two landing boxes
    exactly, with two batched materials for decks/support and readable rails.
    It never copies the high-detail SC02 meshes or edits gameplay colliders.
    """
    marker = "RL01_LOD1_ROOF_ACCESS"
    names = ("MESH_WAREHOUSE_RL01_ACCESS_STRUCTURE_LOD1", "MESH_WAREHOUSE_RL01_ACCESS_RAILS_LOD1")
    existing = [bpy.data.objects.get(name) for name in names]
    if all(obj is not None and obj.get("roofAccessPass") == marker for obj in existing):
        return {"applied": False, "alreadyApplied": True}
    if any(obj is not None for obj in existing):
        raise RuntimeError("Warehouse LOD1 roof access: incomplete or unowned prior pass")
    collection = bpy.data.collections.get("RENDER_LOD1")
    source_materials = [bpy.data.materials.get(name) for name in ("MAT_GALVANIZED", "MAT_SAFETY_YELLOW")]
    if collection is None or any(mat is None for mat in source_materials):
        raise RuntimeError("Warehouse LOD1 roof access: source collection/materials missing")
    # Separate ownership avoids glTF's UV/material variants renaming the high
    # SC02 materials on round-trip. Images remain shared; never edit their nodes.
    materials = []
    for source_material, suffix in zip(source_materials, ("GALVANIZED", "SAFETY_YELLOW")):
        name = f"MAT_RL01_ACCESS_{suffix}_LOD1"
        if bpy.data.materials.get(name) is not None:
            raise RuntimeError(f"Warehouse LOD1 roof access: unexpected existing material {name}")
        material = source_material.copy()
        material.name = name
        materials.append(material)

    def bounds(obj):
        points = [obj.matrix_world @ Vector(p) for p in obj.bound_box]
        return (Vector(tuple(min(p[i] for p in points) for i in range(3))),
                Vector(tuple(max(p[i] for p in points) for i in range(3))))

    flights = []
    for side in ("WEST", "EAST"):
        steps = []
        for index in range(21):
            name = f"COL_MOVE_EXT_STAIR_{side}_{index:02}"
            obj = bpy.data.objects.get(name)
            if obj is None or obj.type != "MESH":
                raise RuntimeError(f"Warehouse LOD1 roof access: missing {name}")
            lower, upper = bounds(obj)
            assert all(abs((upper-lower)[i]-size) < .0001 for i, size in enumerate((3., 1.4, .4))), name
            assert abs(lower.z-index*.4) < .0001, name
            steps.append((lower, upper))
        name = f"COL_MOVE_EXT_STAIR_LANDING_{side}"
        landing = bpy.data.objects.get(name)
        if landing is None or landing.type != "MESH":
            raise RuntimeError(f"Warehouse LOD1 roof access: missing {name}")
        lower, upper = bounds(landing)
        assert all(abs((upper-lower)[i]-size) < .0001 for i, size in enumerate((7., 1.9, .2))), name
        flights.append((side, steps, (lower, upper)))

    structure, rails = bmesh.new(), bmesh.new()
    tread_error = 0.
    ground_contacts = []
    def box(bm, lower, upper):
        lower, upper = Vector(lower), Vector(upper)
        size, center = upper-lower, (upper+lower)*.5
        assert min(size) > 0, "zero-sized access geometry"
        verts = bmesh.ops.create_cube(bm, size=1)["verts"]
        for vertex in verts:
            vertex.co = Vector(tuple(vertex.co[i]*size[i]+center[i] for i in range(3)))
        return verts

    def member(bm, start, end, width=.16):
        start, end = Vector(start), Vector(end)
        axis = end-start
        assert axis.length > .001 and width > 0, "degenerate access member"
        rotation = Vector((0, 0, 1)).rotation_difference(axis.normalized())
        verts = bmesh.ops.create_cube(bm, size=1)["verts"]
        for vertex in verts:
            vertex.co = rotation @ Vector((vertex.co.x*width, vertex.co.y*width, vertex.co.z*axis.length)) + (start+end)*.5

    for side, steps, landing in flights:
        for lower, upper in [*steps, landing]:
            verts = box(structure, lower, upper)
            # Reconstituted visual bounds, including the walkable top, must
            # coincide with their collider even after Float32 source rounding.
            error = max(abs(min(v.co[i] for v in verts)-lower[i]) for i in range(3))
            error = max(error, max(abs(max(v.co[i] for v in verts)-upper[i]) for i in range(3)))
            tread_error = max(tread_error, error)
            assert error < .00001, "LOD1 access tread differs from collision box"
        first, last = (steps[0][0]+steps[0][1])*.5, (steps[-1][0]+steps[-1][1])*.5
        stair_x = first.x
        for dx in (-1.2, 0., 1.2):
            member(structure, (stair_x+dx, first.y, .14), (stair_x+dx, last.y, steps[-1][0].z-.1), .24)
        # Match high-LOD SC02 bents rather than inventing new obstacles under
        # the route. Flat pad/column contacts terminate at the ground and beam.
        for index in (5, 10, 15, 20):
            lower, upper = steps[index]
            y, underside = (lower.y+upper.y)*.5, lower.z
            box(structure, (stair_x-1.65, y-.11, underside-.2), (stair_x+1.65, y+.11, underside))
            for dx in (-1.2, 1.2):
                x = stair_x+dx
                box(structure, (x-.24, y-.27, 0), (x+.24, y+.27, .16))
                box(structure, (x-.08, y-.08, .16), (x+.08, y+.08, underside-.2))
                ground_contacts.append([x, y])
        for dx in (-1.45, 1.45):
            x = stair_x+dx
            for index in (0, 4, 8, 12, 16, 20):
                lower, upper = steps[index]
                y = (lower.y+upper.y)*.5
                box(rails, (x-.035, y-.035, upper.z), (x+.035, y+.035, upper.z+1.08))
            for height, width in ((.55, .06), (1.08, .08)):
                member(rails, (x, first.y, steps[0][1].z+height),
                       (x, last.y, steps[-1][1].z+height), width)

        lower, upper = landing
        center, size = (lower+upper)*.5, upper-lower
        sign = -1 if side == "WEST" else 1
        outside_x = center.x+sign*(size.x*.5-.25)
        for dy in (-size.y*.38, size.y*.38):
            y = center.y+dy
            box(structure, (lower.x, y-.1, lower.z-.24), (upper.x, y+.1, lower.z))
            box(structure, (outside_x-.28, y-.28, 0), (outside_x+.28, y+.28, .2))
            box(structure, (outside_x-.1, y-.1, .2), (outside_x+.1, y+.1, lower.z-.24))
            ground_contacts.append([outside_x, y])
        far_y = upper.y if last.y > first.y else lower.y
        outer_edge, wall_edge = center.x+sign*size.x*.5, sign*22.9
        for height, width in ((.55, .06), (1.08, .08)):
            z = upper.z+height
            member(rails, (outer_edge, lower.y, z), (outer_edge, upper.y, z), width)
            member(rails, (outer_edge, far_y, z), (wall_edge, far_y, z), width)
        for x, y in ((outer_edge, lower.y), (outer_edge, upper.y), ((outer_edge+wall_edge)*.5, far_y), (wall_edge, far_y)):
            box(rails, (x-.035, y-.035, upper.z), (x+.035, y+.035, upper.z+1.08))

    triangles = 0
    for name, bm, material in zip(names, (structure, rails), materials):
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh); bm.free(); mesh.update()
        mesh.materials.append(material)
        # These materials retain base/ORM/normal textures, which require valid
        # TEXCOORD_0. Box-project in world metres (one repeat per 2 m); an empty
        # UV layer or no UVs can export invalid texCoord=-1 material variants.
        uv_names = {"UVMap"}
        uv_names.update(node.uv_map for node in material.node_tree.nodes
                        if node.type == "UVMAP" and node.uv_map)
        for uv_name in sorted(uv_names):
            layer = mesh.uv_layers.new(name=uv_name)
            for polygon in mesh.polygons:
                axis = max(range(3), key=lambda i: abs(polygon.normal[i]))
                for loop_index in polygon.loop_indices:
                    point = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                    if axis == 0:
                        uv = (point.y, point.z)
                    elif axis == 1:
                        uv = (point.x, point.z)
                    else:
                        uv = (point.x, point.y)
                    layer.data[loop_index].uv = (uv[0]*.5, uv[1]*.5)
            assert all(math.isfinite(value) for item in layer.data for value in item.uv)
        mesh.uv_layers.active = mesh.uv_layers["UVMap"]
        mesh.uv_layers["UVMap"].active_render = True
        ensure_col(mesh)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj["roofAccessPass"] = marker
        obj["harbor_v2_role"] = "render_mesh"
        obj["harborZone"] = "warehouse"
        obj["zoneLod"] = "LOD1"
        assert obj.matrix_world.to_3x3().determinant() == 1 and min(obj.scale) > 0
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
    assert triangles <= 3000, "lightweight access geometry budget exceeded"
    return {"applied": True, "matchedTreads": 42, "matchedLandings": 2,
            "addedTriangles": triangles, "addedDrawCalls": 2, "addedColliders": 0,
            "maximumTreadBoundsErrorMeters": tread_error, "groundedSupportPads": len(ground_contacts),
            "highLodGeometryUnchanged": True, "meshes": list(names),
            "ownedMaterials": [material.name for material in materials], "textureCoordinates": "UVMap, 2m box projection"}


def repair_garden_wheelbarrow():
    """Ground the existing wheel and attach the tray to a real steel underframe.

    The artist source is already material-batched. Match complete connected
    components, including their original bounds, instead of moving every nearby
    vertex (which would also move the adjacent boulder). All supports join the
    existing steel batch: no new material, object, draw call, or collider.
    """
    marker = "RL01_WHEELBARROW_SUPPORT"
    steel = bpy.data.objects.get("MESH_GARDEN_STEEL_DARK_LOD0")
    palette = bpy.data.objects.get("MESH_GARDEN_PALETTE_LOD0")
    if steel is None or palette is None:
        raise RuntimeError("Garden wheelbarrow repair: original material batches not found")
    marked = [obj.get("wheelbarrowSupportPass") == marker for obj in (steel, palette)]
    if all(marked):
        return {"applied": False, "alreadyApplied": True}
    if any(marked):
        raise RuntimeError("Garden wheelbarrow repair: incomplete prior pass")

    def component(obj, lower, upper, count):
        adjacency = [[] for _ in obj.data.vertices]
        for edge in obj.data.edges:
            a, b = edge.vertices
            adjacency[a].append(b); adjacency[b].append(a)
        visited, matches = set(), []
        for vertex in obj.data.vertices:
            if vertex.index in visited:
                continue
            queue = [vertex.index]; visited.add(vertex.index); indices = []
            while queue:
                i = queue.pop(); indices.append(i)
                for j in adjacency[i]:
                    if j not in visited:
                        visited.add(j); queue.append(j)
            if len(indices) != count:
                continue
            pts = [obj.matrix_world @ obj.data.vertices[i].co for i in indices]
            lo = [min(p[k] for p in pts) for k in range(3)]
            hi = [max(p[k] for p in pts) for k in range(3)]
            if all(abs(lo[k]-lower[k]) < .0002 and abs(hi[k]-upper[k]) < .0002 for k in range(3)):
                matches.append(indices)
        if len(matches) != 1:
            raise RuntimeError(f"Garden wheelbarrow repair: expected one unchanged component in {obj.name}, found {len(matches)}")
        return matches[0]

    component(steel, (-29.2, -31.4, .35), (-28.3, -30.6, .75), 24)
    wheel = component(palette, (-28.28, -31.72, .030767566), (-28.22, -31.28, .449232434), 20)
    old_center, new_center = Vector((-28.25, -31.5, .24)), Vector((-28.18, -31., .34))
    # X-axis -> transverse Three.js Z-axis. A further half-segment rotation
    # puts an actual decagon vertex on the lawn, not its circumscribed circle.
    rotation = Matrix.Rotation(math.pi/10, 3, "Y") @ Matrix.Rotation(math.pi/2, 3, "Z")
    inverse = palette.matrix_world.inverted()
    wheel_points = []
    for index in wheel:
        vertex = palette.data.vertices[index]
        world = new_center + rotation @ (palette.matrix_world @ vertex.co - old_center)
        vertex.co = inverse @ world
        wheel_points.append(world)
    palette.data.update()
    ground_y = .12
    assert abs(min(p.z for p in wheel_points)-ground_y) < .00001, "wheel must touch the lawn"

    ensure_col(steel.data)
    steel.data.calc_loop_triangles()
    old_triangles = len(steel.data.loop_triangles)
    inverse = steel.matrix_world.inverted()
    bm = bmesh.new(); bm.from_mesh(steel.data)
    old_faces = set(bm.faces)
    support_points, contacts = [], []
    def tube(start, end, radius=.025):
        # Input uses game X/Y-up/Z. Geometry is authored in Blender X/-Z/Y.
        start = Vector((start[0], -start[2], start[1]))
        end = Vector((end[0], -end[2], end[1]))
        axis = end-start
        rot = Vector((0, 0, 1)).rotation_difference(axis.normalized())
        vertices = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False,
                                         segments=8, radius1=radius, radius2=radius, depth=axis.length)["verts"]
        points = []
        for vertex in vertices:
            world = rot @ vertex.co + (start+end)*.5
            vertex.co = inverse @ world
            points.append(world); support_points.append(world)
        return points

    for z in (30.725, 31.275):
        # Handle sleeve -> tray cradle -> wheel fork; all endpoints coincide.
        tube((-29.26, .525, z), (-29.13, .325, z))
        cradle = tube((-29.13, .325, z), (-28.36, .325, z))
        assert abs(max(p.z for p in cradle)-.35) < .00001, "tray must rest on its cradle"
        tube((-28.36, .325, z), (-28.18, .34, z))
        leg = tube((-29.08, ground_y, z), (-29.08, .325, z))
        assert abs(min(p.z for p in leg)-ground_y) < .00001, "rear feet must touch the lawn"
        contacts.append([-29.08, ground_y, z])
    tube((-28.18, .34, 30.675), (-28.18, .34, 31.325), .028)  # shared axle through wheel and forks
    tube((-28.75, .325, 30.725), (-28.75, .325, 31.275))  # tray cross-member

    contract = json.loads((ROOT / "tools/harbor-v2/zones/contracts/garden.json").read_text())
    points = wheel_points + support_points
    lower = (min(p.x for p in points), min(p.z for p in points), min(-p.y for p in points))
    upper = (max(p.x for p in points), max(p.z for p in points), max(-p.y for p in points))
    assert all(lower[i] >= contract["footprint"]["min"][i] and upper[i] <= contract["footprint"]["max"][i] for i in range(3))
    assert not any(all(lower[i] < lane["max"][i] and upper[i] > lane["min"][i] for i in range(3)) for lane in contract["clearance"])
    # New BMesh corner colours default to black. Paint only new faces neutral,
    # preserving every existing tint; the regular contact bake runs afterward.
    col = bm.loops.layers.color.get("Col") or bm.loops.layers.float_color.get("Col")
    assert col is not None, "neutral corner colour layer is required"
    for face in bm.faces:
        if face not in old_faces:
            for loop in face.loops:
                loop[col] = (1., 1., 1., 1.)
    bm.to_mesh(steel.data); bm.free(); steel.data.update()
    steel.data.calc_loop_triangles()
    for obj in (steel, palette):
        obj["wheelbarrowSupportPass"] = marker
    return {"applied": True, "wheelVerticesReoriented": len(wheel), "addedSupportTubes": 10,
            "addedTriangles": len(steel.data.loop_triangles)-old_triangles,
            "addedDrawCalls": 0, "addedColliders": 0,
            "wheelCenter": [-28.18, .34, 31.], "wheelGroundY": round(min(p.z for p in wheel_points), 5),
            "rearFootContacts": contacts, "trayCradleContactY": .35,
            "routeClearancesPreserved": True}


def run(zone_name, samples):
    start = time.perf_counter()
    directory, zone, harbor_zone = ZONES[zone_name]
    source = ROOT / f"art-source/harbor-v2/{directory}/{zone_name}.blend"
    output = source.with_stem(source.stem + "-realism")
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source))
    bpy.context.view_layer.update()
    before = protected_signature()
    # The shipped SC04 sign was newer than the original warehouse .blend.
    # Recover those exact three visual nodes, not a stale replacement of the
    # warehouse. Never let an authoring polish silently remove a runtime fix.
    restored = []
    if zone == "WAREHOUSE" and bpy.data.objects.get("MESH_WAREHOUSE_SC04_SIGN_BACKING") is None:
        existing = set(bpy.context.scene.objects)
        sign_asset = STAGING / "shipped-warehouse-sign.glb"
        if not sign_asset.exists():
            raise RuntimeError("Run prepare_realism.mjs first to extract the shipped sign without unrelated material extensions")
        bpy.ops.import_scene.gltf(filepath=str(sign_asset))
        imported = [o for o in bpy.context.scene.objects if o not in existing]
        for obj in imported:
            if obj.name.startswith("MESH_WAREHOUSE_SC04_SIGN_"):
                for collection in tuple(obj.users_collection):
                    collection.objects.unlink(obj)
                bpy.data.collections["RENDER_SHARED"].objects.link(obj)
                restored.append(obj.name)
            else:
                bpy.data.objects.remove(obj, do_unlink=True)
        bpy.context.view_layer.update()
    sign_clearance = clear_warehouse_sign_fascia() if zone == "WAREHOUSE" else False
    mobile_roof_access = restore_warehouse_lod1_roof_access() if zone == "WAREHOUSE" else None
    wheelbarrow_support = repair_garden_wheelbarrow() if zone == "GARDEN" else None
    original = render_meshes()
    static = [o for o in original if not o.name.endswith("_LOD1") and solid(o)]
    tree = world_bvh(static)
    fittings = add_fixings(zone, harbor_zone, tree)
    objects = render_meshes()
    normals = refine_normals(objects)
    contact = bake_contact(objects, tree, samples)
    if before != protected_signature():
        raise RuntimeError("Protected collision/rig/marker changed")
    bpy.context.scene["realismPass"] = "RL01 contact shade + calibrated normals + anchored fixings"
    bpy.context.scene["realismSourceSHA256"] = source_sha
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
    if hashlib.sha256(source.read_bytes()).hexdigest() != source_sha:
        raise RuntimeError("Original artist source changed")
    glb = STAGING / f"{zone_name}-candidate.glb"
    args = sys.argv[:]
    sys.argv = ["export", "--", "--output", str(glb)]
    try:
        exporter = "export_authoring_scene.py" if zone == "WAREHOUSE" else "export_zone_scene.py"
        runpy.run_path(str(ROOT / "tools/harbor-v2" / exporter), run_name="__main__")
    finally:
        sys.argv = args
    report = {"zone":zone,"source":str(source.relative_to(ROOT)),"sourceSHA256":source_sha,
              "blend":str(output.relative_to(ROOT)),"glb":str(glb.relative_to(ROOT)),
              "sourcePreserved":True,"protectedNodesUnchanged":len(before),
              "restoredProductionDetails":restored,
              "warehouseSignFasciaClearance":sign_clearance,
              "warehouseLowLodRoofAccess":mobile_roof_access,
              "gardenWheelbarrowSupport":wheelbarrow_support,
              "contact":contact,"calibratedNormalMaterials":normals,"fixings":fittings,
              "payloadBytes":glb.stat().st_size,"seconds":round(time.perf_counter()-start,2)}
    (STAGING / f"{zone_name}-pass.json").write_text(json.dumps(report,indent=2)+"\n")
    print("REALISM_PASS="+json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zone", choices=["all", *ZONES], default="all")
    parser.add_argument("--samples", type=int, default=12)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    STAGING.mkdir(parents=True, exist_ok=True)
    for name in ZONES if args.zone == "all" else [args.zone]:
        run(name, max(4, min(args.samples,32)))
