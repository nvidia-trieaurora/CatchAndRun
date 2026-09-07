"""Apply the first non-destructive realism pass to the open Warehouse scene.

This script is designed to be sent through Blender MCP. It only creates
visual LOD0 geometry in ``RENDER_LOD0`` and never edits collision or marker
objects. Running it again replaces the previous RP01 objects deterministically.
"""

import bpy
import json
import math
from mathutils import Euler, Matrix, Vector


PASS_PREFIX = "MESH_WAREHOUSE_RP01_"
STAGING_PREFIX = "MESH_WAREHOUSE_STAGING_RP01_"
COLLECTION_NAME = "RENDER_LOD0"
PASS_ID = "RP01_LOADING_FACADE"
PITCH = math.radians(4.0)


def require_authoring_scene():
    scene = bpy.context.scene
    if not scene.get("catchAndRunAuthoring"):
        raise RuntimeError("Open the bootstrapped Catch and Run authoring scene first")
    if scene.unit_settings.system != "METRIC" or scene.unit_settings.scale_length != 1.0:
        raise RuntimeError("Warehouse authoring requires Metric units at scale 1.0")
    return scene


def require_collection(name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        raise RuntimeError("Missing authoring collection: " + name)
    return collection


def remove_objects_with_prefix(prefix):
    removed = 0
    for obj in list(bpy.data.objects):
        if obj.name.startswith(prefix):
            mesh = obj.data if obj.type == "MESH" else None
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh is not None and mesh.users == 0:
                bpy.data.meshes.remove(mesh)
            removed += 1
    return removed


def require_material(name):
    material = bpy.data.materials.get(name)
    if material is None:
        raise RuntimeError("Missing seed material: " + name)
    return material


def ensure_rubber_material():
    material = bpy.data.materials.get("MAT_RUBBER_DARK")
    created = material is None
    if material is None:
        material = bpy.data.materials.new("MAT_RUBBER_DARK")
    material_users = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and material.name in obj.data.materials
    ]
    pass_owned = created or material.get("realismPassOwner") == PASS_ID or (
        material_users
        and all(
            obj.name.startswith((PASS_PREFIX, STAGING_PREFIX))
            for obj in material_users
        )
    )
    if not pass_owned:
        return material
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.inputs["Base Color"].default_value = (0.012, 0.016, 0.018, 1.0)
    principled.inputs["Metallic"].default_value = 0.0
    principled.inputs["Roughness"].default_value = 0.82
    principled.inputs["IOR"].default_value = 1.47
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    material["realismPassOwner"] = PASS_ID
    return material


batches = {}


def get_batch(material_name):
    if material_name not in batches:
        batches[material_name] = {"vertices": [], "faces": []}
    return batches[material_name]


def transformed(matrix, point):
    value = matrix @ Vector(point)
    return (float(value.x), float(value.y), float(value.z))


def add_box(material_name, center, dimensions, rotation=(0.0, 0.0, 0.0)):
    batch = get_batch(material_name)
    hx, hy, hz = (dimensions[0] * 0.5, dimensions[1] * 0.5, dimensions[2] * 0.5)
    local = [
        (-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
        (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz),
    ]
    matrix = Matrix.Translation(Vector(center)) @ Euler(rotation, "XYZ").to_matrix().to_4x4()
    offset = len(batch["vertices"])
    batch["vertices"].extend([transformed(matrix, point) for point in local])
    batch["faces"].extend([
        (offset + 0, offset + 3, offset + 2, offset + 1),
        (offset + 4, offset + 5, offset + 6, offset + 7),
        (offset + 0, offset + 1, offset + 5, offset + 4),
        (offset + 1, offset + 2, offset + 6, offset + 5),
        (offset + 2, offset + 3, offset + 7, offset + 6),
        (offset + 3, offset + 0, offset + 4, offset + 7),
    ])


def add_cylinder(
    material_name,
    center,
    radius,
    depth,
    segments=12,
    rotation=(0.0, 0.0, 0.0),
):
    batch = get_batch(material_name)
    matrix = Matrix.Translation(Vector(center)) @ Euler(rotation, "XYZ").to_matrix().to_4x4()
    offset = len(batch["vertices"])
    half = depth * 0.5
    local = []
    for z in (-half, half):
        for index in range(segments):
            angle = math.tau * index / segments
            local.append((radius * math.cos(angle), radius * math.sin(angle), z))
    batch["vertices"].extend([transformed(matrix, point) for point in local])
    batch["faces"].append(tuple(offset + index for index in reversed(range(segments))))
    batch["faces"].append(tuple(offset + segments + index for index in range(segments)))
    for index in range(segments):
        nxt = (index + 1) % segments
        batch["faces"].append((
            offset + index,
            offset + nxt,
            offset + segments + nxt,
            offset + segments + index,
        ))


def add_beam_between(material_name, start, end, thickness):
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    midpoint = (start_vector + end_vector) * 0.5
    rotation = direction.to_track_quat("Z", "Y").to_euler()
    add_box(
        material_name,
        midpoint,
        (thickness, thickness, direction.length),
        tuple(rotation),
    )


def add_front_i_column(x, height=6.55):
    center_z = 1.3 + height * 0.5
    add_box("MAT_GALVANIZED", (x, -18.08, center_z), (0.10, 0.36, height))
    add_box("MAT_GALVANIZED", (x, -18.24, center_z), (0.42, 0.07, height))
    add_box("MAT_GALVANIZED", (x, -17.92, center_z), (0.42, 0.07, height))
    add_box("MAT_GALVANIZED", (x, -18.08, 1.345), (0.58, 0.48, 0.09))


def add_front_i_header(center_x, width, z):
    add_box("MAT_GALVANIZED", (center_x, -18.08, z), (width, 0.10, 0.44))
    add_box("MAT_GALVANIZED", (center_x, -18.24, z), (width, 0.07, 0.72))
    add_box("MAT_GALVANIZED", (center_x, -17.92, z), (width, 0.07, 0.72))


def add_corrugated_front_ribs():
    spacing = 0.381
    x = -22.45
    while x <= 22.45:
        if x < -9.9 or x > 9.9:
            add_box("MAT_CORRUGATED_RED", (x, -17.965, 4.65), (0.055, 0.07, 6.55))
        else:
            add_box("MAT_CORRUGATED_RED", (x, -17.965, 7.23), (0.055, 0.07, 1.42))
        x += spacing


def add_loading_portal():
    for x in (-9.65, 9.65):
        add_front_i_column(x, 5.1)
        for bolt_x in (x - 0.19, x + 0.19):
            for bolt_y in (-18.23, -17.93):
                add_cylinder("MAT_GALVANIZED", (bolt_x, bolt_y, 1.43), 0.032, 0.10, 10)
    # Keep the entire visual header at/above the authoritative 6.4 m opening.
    add_front_i_header(0.0, 19.65, 6.78)

    # A fully-open two-leaf maritime bifold door. Both leaves fold above the
    # gameplay opening and remain outside the movement volume.
    add_box("MAT_STEEL_NAVY", (0.0, -18.72, 6.64), (18.75, 1.22, 0.10), (math.radians(-4), 0.0, 0.0))
    add_box("MAT_CORRUGATED_RED", (0.0, -19.52, 6.77), (18.75, 1.12, 0.09), (math.radians(7), 0.0, 0.0))
    add_cylinder("MAT_GALVANIZED", (0.0, -18.15, 6.52), 0.075, 18.7, 16, (0.0, math.radians(90), 0.0))
    add_cylinder("MAT_GALVANIZED", (0.0, -19.08, 6.72), 0.055, 18.7, 12, (0.0, math.radians(90), 0.0))
    for x in (-8.85, 8.85):
        add_box("MAT_STEEL_NAVY", (x, -18.30, 6.92), (0.52, 0.34, 0.44))
        add_cylinder("MAT_GALVANIZED", (x, -18.49, 6.92), 0.12, 0.08, 14, (math.radians(90), 0.0, 0.0))

    for x in (-6.2, 0.0, 6.2):
        add_beam_between("MAT_GALVANIZED", (x, -18.00, 6.48), (x, -19.86, 6.12), 0.10)
        add_beam_between("MAT_GALVANIZED", (x, -19.86, 6.12), (x, -19.86, 6.63), 0.08)


def add_foundation_and_safety_detail():
    add_box("MAT_GALVANIZED", (-16.35, -18.02, 1.31), (13.1, 0.12, 0.12))
    add_box("MAT_GALVANIZED", (16.35, -18.02, 1.31), (13.1, 0.12, 0.12))
    for x in (-20.0, -16.0, -12.0, 12.0, 16.0, 20.0):
        add_box("MAT_RUBBER_DARK", (x, -18.055, 0.65), (0.035, 0.045, 1.18))
    for x in (-22.0, -18.0, -14.0, 14.0, 18.0, 22.0):
        add_front_i_column(x)

    # Dock bumpers and striped protective faces stay outside the clear opening.
    for x in (-8.55, 8.55):
        add_box("MAT_RUBBER_DARK", (x, -18.19, 0.72), (0.38, 0.22, 0.82))
        add_box("MAT_SAFETY_YELLOW", (x, -18.32, 1.20), (0.44, 0.08, 0.09))


def roof_surface_z(y):
    return 8.05 + (y + 18.0) * math.tan(PITCH)


def add_front_roof_detail():
    # 762 mm cladding coverage split into half-profile seams. This reads as a
    # believable standing-seam roof without modeling every small corrugation.
    x = -22.48
    while x <= 22.48:
        add_box("MAT_GALVANIZED", (x, -9.0, 8.820), (0.045, 18.35, 0.055), (PITCH, 0.0, 0.0))
        x += 0.762

    add_box("MAT_GALVANIZED", (0.0, -18.28, 8.03), (47.15, 0.16, 0.30))
    add_box("MAT_STEEL_NAVY", (0.0, -18.40, 7.89), (47.2, 0.08, 0.18))
    for x in range(-22, 23, 2):
        add_box("MAT_GALVANIZED", (float(x), -18.35, 7.94), (0.08, 0.25, 0.30))

    for row_y in (-15.0, -9.0, -3.0):
        z = roof_surface_z(row_y) + 0.162
        for x in range(-22, 23, 2):
            add_cylinder("MAT_GALVANIZED", (float(x), row_y, z), 0.032, 0.045, 10)


def add_gable_corner_readability():
    # Short diagonal braces at both front corners make the load path readable
    # in wide shots without changing the wall or roof silhouette.
    for x, direction in ((-22.25, 1.0), (22.25, -1.0)):
        add_beam_between(
            "MAT_STEEL_NAVY",
            (x, -18.12, 7.72),
            (x + direction * 2.2, -18.12, 6.15),
            0.12,
        )
        add_box("MAT_GALVANIZED", (x, -18.14, 7.85), (0.48, 0.10, 0.36))


def create_batch_object(collection, material_name, data, prefix):
    suffix = material_name.removeprefix("MAT_")
    name = prefix + suffix + "_LOD0"
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(data["vertices"], [], data["faces"])
    mesh.validate(verbose=False)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(require_material(material_name))
    obj["harbor_v2_role"] = "render_mesh"
    obj["harborZone"] = "warehouse"
    obj["gameplayRole"] = "decorative"
    obj["weaponImpactKind"] = "solid"
    obj["ignoreWeaponRaycast"] = True
    obj["realismPass"] = PASS_ID

    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    if material_name != "MAT_RUBBER_DARK":
        try:
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.cube_project(cube_size=2.0, correct_aspect=True)
        finally:
            if obj.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

    bevel = obj.modifiers.new("RP01_EDGE_BEVEL", "BEVEL")
    bevel.width = 0.008 if material_name != "MAT_RUBBER_DARK" else 0.015
    bevel.segments = 1
    bevel.limit_method = "ANGLE"
    return obj


def main():
    batches.clear()
    scene = require_authoring_scene()
    collection = require_collection(COLLECTION_NAME)
    for material_name in (
        "MAT_CORRUGATED_RED",
        "MAT_GALVANIZED",
        "MAT_STEEL_NAVY",
        "MAT_SAFETY_YELLOW",
    ):
        require_material(material_name)
    ensure_rubber_material()
    remove_objects_with_prefix(STAGING_PREFIX)

    # Build all geometry in Python memory before replacing a previous pass.
    add_corrugated_front_ribs()
    add_foundation_and_safety_detail()
    add_loading_portal()
    add_front_roof_detail()
    add_gable_corner_readability()

    created = []
    try:
        for material_name, data in batches.items():
            obj = create_batch_object(collection, material_name, data, STAGING_PREFIX)
            created.append((material_name, obj))
    except Exception:
        remove_objects_with_prefix(STAGING_PREFIX)
        raise

    removed = remove_objects_with_prefix(PASS_PREFIX)
    finalized = []
    for material_name, obj in created:
        suffix = material_name.removeprefix("MAT_")
        obj.name = PASS_PREFIX + suffix + "_LOD0"
        obj.data.name = obj.name + "_MESH"
        finalized.append(obj)

    scene["warehouseRealismPass"] = PASS_ID
    scene["warehouseRealismReference"] = "maritime pre-engineered steel warehouse"
    scene["warehouseRealismGridMeters"] = 4.0
    bpy.ops.object.select_all(action="DESELECT")
    triangles = 0
    for obj in finalized:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    print("REALISM_PASS=" + json.dumps({
        "pass": PASS_ID,
        "removedObjects": removed,
        "createdObjects": [obj.name for obj in finalized],
        "baseTrianglesBeforeModifiers": triangles,
        "collisionObjectsTouched": 0,
        "markerObjectsTouched": 0,
    }))


main()
