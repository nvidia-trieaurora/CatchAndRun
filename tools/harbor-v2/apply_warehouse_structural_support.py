"""Add a visual-only structural support pass to the Warehouse authoring scene.

SC02 makes the two exterior stairs and the suspended interior platform read as
supported construction while preserving every gameplay collider and marker. It
also replaces the legacy, roof-buried skylight batch with three correctly
pitched units above the roof surface.

The pass is deterministic and idempotent: geometry is built under a staging
prefix, validated, and only then replaces objects owned by SC02. The legacy
roof-glass object is removed only after its material contract and the complete
staged replacement have both validated.
"""

import bpy
import json
import math
from mathutils import Euler, Matrix, Vector


PASS_ID = "SC02_STRUCTURAL_SUPPORT"
PASS_PREFIX = "MESH_WAREHOUSE_SC02_"
STAGING_PREFIX = "MESH_WAREHOUSE_STAGING_SC02_"
COLLECTION_NAME = "RENDER_LOD0"
LEGACY_ROOF_GLASS = "MESH_WAREHOUSE_ROOF_GLASS_LOD0"
EXPECTED_MATERIALS = (
    "MAT_CONCRETE",
    "MAT_GALVANIZED",
    "MAT_SAFETY_YELLOW",
    "MAT_STEEL_NAVY",
    "MAT_ROOF_GLASS",
)
STAIR_SIDES = ("WEST", "EAST")
STEP_COUNT = 21


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


def require_material(name):
    material = bpy.data.materials.get(name)
    if material is None:
        raise RuntimeError("Missing seed material: " + name)
    return material


def require_mesh(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError("Missing required mesh: " + name)
    return obj


def world_center(obj):
    return obj.matrix_world.translation.copy()


def close_enough(actual, expected, tolerance=0.06):
    return abs(actual - expected) <= tolerance


def audit_protected_objects():
    return sorted(
        obj.name
        for obj in bpy.data.objects
        if obj.name.startswith(("COL_", "MARKER_", "SOCKET_"))
    )


def require_stair_contract(side):
    steps = []
    for index in range(STEP_COUNT):
        obj = require_mesh("COL_MOVE_EXT_STAIR_" + side + "_" + f"{index:02}")
        dimensions = obj.dimensions
        if not (
            close_enough(dimensions.x, 3.0)
            and close_enough(dimensions.y, 1.4)
            and close_enough(dimensions.z, 0.4)
        ):
            raise RuntimeError("Unexpected exterior-stair collider dimensions: " + obj.name)
        steps.append({
            "center": world_center(obj),
            "dimensions": dimensions.copy(),
        })

    landing = require_mesh("COL_MOVE_EXT_STAIR_LANDING_" + side)
    landing_dimensions = landing.dimensions
    if not (
        close_enough(landing_dimensions.x, 7.0)
        and close_enough(landing_dimensions.y, 1.9)
        and close_enough(landing_dimensions.z, 0.2)
    ):
        raise RuntimeError("Unexpected exterior-stair landing collider: " + landing.name)
    return {
        "side": side,
        "steps": steps,
        "landing": {
            "center": world_center(landing),
            "dimensions": landing_dimensions.copy(),
        },
    }


def require_suspended_platform_contract():
    collider = require_mesh("COL_MOVE_SUSPENDED")
    dimensions = collider.dimensions
    if not (
        close_enough(dimensions.x, 8.0)
        and close_enough(dimensions.y, 4.0)
        and close_enough(dimensions.z, 0.24)
    ):
        raise RuntimeError("Unexpected suspended-platform collider dimensions")
    return {
        "center": world_center(collider),
        "dimensions": dimensions.copy(),
    }


def audit_legacy_roof_glass():
    obj = bpy.data.objects.get(LEGACY_ROOF_GLASS)
    if obj is None:
        return None
    if obj.type != "MESH":
        raise RuntimeError(LEGACY_ROOF_GLASS + " must be a mesh")
    material_names = [material.name if material is not None else None for material in obj.data.materials]
    if material_names != ["MAT_ROOF_GLASS"]:
        raise RuntimeError(
            LEGACY_ROOF_GLASS + " material contract changed: " + str(material_names)
        )
    if obj.data.users != 1:
        raise RuntimeError(LEGACY_ROOF_GLASS + " mesh data is unexpectedly shared")
    if obj.get("harbor_v2_role") != "render_mesh":
        raise RuntimeError(LEGACY_ROOF_GLASS + " is not tagged as a render mesh")
    return obj


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
    half_x = dimensions[0] * 0.5
    half_y = dimensions[1] * 0.5
    half_z = dimensions[2] * 0.5
    local = [
        (-half_x, -half_y, -half_z),
        (half_x, -half_y, -half_z),
        (half_x, half_y, -half_z),
        (-half_x, half_y, -half_z),
        (-half_x, -half_y, half_z),
        (half_x, -half_y, half_z),
        (half_x, half_y, half_z),
        (-half_x, half_y, half_z),
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


def add_box_between(material_name, start, end, cross_x, cross_y=None):
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    if direction.length <= 0.0001:
        raise RuntimeError("Cannot create a zero-length structural beam")
    midpoint = (start_vector + end_vector) * 0.5
    rotation = direction.to_track_quat("Z", "Y").to_euler()
    second_cross = cross_y if cross_y is not None else cross_x
    add_box(
        material_name,
        midpoint,
        (cross_x, second_cross, direction.length),
        tuple(rotation),
    )


def add_cylinder_between(material_name, start, end, radius, segments=10):
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    if direction.length <= 0.0001:
        raise RuntimeError("Cannot create a zero-length rail")
    midpoint = (start_vector + end_vector) * 0.5
    matrix = (
        Matrix.Translation(midpoint)
        @ direction.to_track_quat("Z", "Y").to_matrix().to_4x4()
    )
    batch = get_batch(material_name)
    offset = len(batch["vertices"])
    half = direction.length * 0.5
    local = []
    for z_value in (-half, half):
        for index in range(segments):
            angle = math.tau * index / segments
            local.append((radius * math.cos(angle), radius * math.sin(angle), z_value))
    batch["vertices"].extend([transformed(matrix, point) for point in local])
    batch["faces"].append(tuple(offset + index for index in reversed(range(segments))))
    batch["faces"].append(tuple(offset + segments + index for index in range(segments)))
    for index in range(segments):
        next_index = (index + 1) % segments
        batch["faces"].append((
            offset + index,
            offset + next_index,
            offset + segments + next_index,
            offset + segments + index,
        ))


def add_vertical_post(material_name, x, y, bottom, top, width):
    if top <= bottom:
        raise RuntimeError("Structural post has no positive height")
    add_box(material_name, (x, y, (bottom + top) * 0.5), (width, width, top - bottom))


def add_stair_supports(contract):
    steps = contract["steps"]
    landing = contract["landing"]
    stair_x = steps[0]["center"].x
    stair_width = steps[0]["dimensions"].x

    # Three continuous stringers carry both outer tread edges and the center.
    for x_offset in (-1.22, 0.0, 1.22):
        first = steps[0]
        last = steps[-1]
        first_bottom = first["center"].z - first["dimensions"].z * 0.5
        last_bottom = last["center"].z - last["dimensions"].z * 0.5
        add_box_between(
            "MAT_STEEL_NAVY",
            (stair_x + x_offset, first["center"].y, max(0.10, first_bottom - 0.10)),
            (stair_x + x_offset, last["center"].y, last_bottom - 0.10),
            0.16,
            0.24,
        )

    # Four portal-like bents transfer the flight load into visible footings.
    for index in (5, 10, 15, 20):
        step = steps[index]
        center = step["center"]
        underside = center.z - step["dimensions"].z * 0.5
        crossbeam_z = underside - 0.10
        add_box(
            "MAT_GALVANIZED",
            (stair_x, center.y, crossbeam_z),
            (stair_width + 0.30, 0.22, 0.20),
        )
        for x_offset in (-1.20, 1.20):
            post_x = stair_x + x_offset
            add_box(
                "MAT_CONCRETE",
                (post_x, center.y, 0.08),
                (0.48, 0.54, 0.16),
            )
            add_vertical_post(
                "MAT_GALVANIZED",
                post_x,
                center.y,
                0.16,
                underside - 0.20,
                0.16,
            )

    # Existing seed posts occur every fourth tread; fill the missing bays.
    rail_x_offsets = (-stair_width * 0.5 + 0.05, stair_width * 0.5 - 0.05)
    for index, step in enumerate(steps):
        if index % 4 == 0:
            continue
        center = step["center"]
        for x_offset in rail_x_offsets:
            add_vertical_post(
                "MAT_SAFETY_YELLOW",
                stair_x + x_offset,
                center.y,
                center.z,
                center.z + 1.30,
                0.07,
            )

    # The original continuous rail is low. A second rail at 1.08 m above the
    # treads makes that seed rail read correctly as the intermediate rail.
    first = steps[0]
    last = steps[-1]
    first_top = first["center"].z + first["dimensions"].z * 0.5
    last_top = last["center"].z + last["dimensions"].z * 0.5
    for x_offset in rail_x_offsets:
        add_cylinder_between(
            "MAT_SAFETY_YELLOW",
            (stair_x + x_offset, first["center"].y, first_top + 1.08),
            (stair_x + x_offset, last["center"].y, last_top + 1.08),
            0.05,
            10,
        )

    add_landing_supports(contract)


def add_landing_supports(contract):
    steps = contract["steps"]
    landing = contract["landing"]
    center = landing["center"]
    dimensions = landing["dimensions"]
    deck_bottom = center.z - dimensions.z * 0.5
    beam_z = deck_bottom - 0.12

    for y_offset in (-dimensions.y * 0.38, dimensions.y * 0.38):
        add_box(
            "MAT_STEEL_NAVY",
            (center.x, center.y + y_offset, beam_z),
            (dimensions.x, 0.20, 0.24),
        )
    for x_offset in (-dimensions.x * 0.46, dimensions.x * 0.46):
        add_box(
            "MAT_STEEL_NAVY",
            (center.x + x_offset, center.y, beam_z),
            (0.20, dimensions.y, 0.24),
        )

    side_sign = 1.0 if steps[0]["center"].x > 0.0 else -1.0
    outside_x = center.x + side_sign * (dimensions.x * 0.5 - 0.25)
    for y_offset in (-dimensions.y * 0.38, dimensions.y * 0.38):
        post_y = center.y + y_offset
        add_box(
            "MAT_CONCRETE",
            (outside_x, post_y, 0.10),
            (0.56, 0.56, 0.20),
        )
        add_vertical_post(
            "MAT_GALVANIZED",
            outside_x,
            post_y,
            0.20,
            deck_bottom - 0.24,
            0.20,
        )

    approach_direction = center.y - steps[-2]["center"].y
    far_y = center.y + (dimensions.y * 0.5 if approach_direction > 0.0 else -dimensions.y * 0.5)
    outside_edge_x = center.x + side_sign * dimensions.x * 0.5
    wall_edge_x = side_sign * 22.90
    deck_top = center.z + dimensions.z * 0.5
    top_z = deck_top + 1.08
    mid_z = deck_top + 0.55

    for rail_z, radius in ((top_z, 0.05), (mid_z, 0.04)):
        add_cylinder_between(
            "MAT_SAFETY_YELLOW",
            (outside_edge_x, center.y - dimensions.y * 0.5, rail_z),
            (outside_edge_x, center.y + dimensions.y * 0.5, rail_z),
            radius,
            10,
        )
        add_cylinder_between(
            "MAT_SAFETY_YELLOW",
            (outside_edge_x, far_y, rail_z),
            (wall_edge_x, far_y, rail_z),
            radius,
            10,
        )

    landing_posts = (
        (outside_edge_x, center.y - dimensions.y * 0.5),
        (outside_edge_x, center.y + dimensions.y * 0.5),
        ((outside_edge_x + wall_edge_x) * 0.5, far_y),
        (wall_edge_x, far_y),
    )
    for post_x, post_y in landing_posts:
        add_vertical_post(
            "MAT_SAFETY_YELLOW",
            post_x,
            post_y,
            deck_top,
            top_z,
            0.07,
        )


def add_suspended_platform_supports(contract):
    center = contract["center"]
    dimensions = contract["dimensions"]
    min_x = center.x - dimensions.x * 0.5
    max_x = center.x + dimensions.x * 0.5
    min_y = center.y - dimensions.y * 0.5
    max_y = center.y + dimensions.y * 0.5
    deck_bottom = center.z - dimensions.z * 0.5
    deck_top = center.z + dimensions.z * 0.5
    inset = 0.25

    # Roof cross-beams align with four hanger rods; under-deck edge channels
    # make the suspended load path readable from below.
    for beam_y in (min_y + inset, max_y - inset):
        # The platform sits under the back roof plane, whose underside falls
        # away from the ridge at four degrees. Each beam therefore terminates
        # at its own roof height instead of floating on one horizontal datum.
        hanger_top = 9.14 - beam_y * math.tan(math.radians(4.0))
        add_box(
            "MAT_STEEL_NAVY",
            (center.x, beam_y, hanger_top),
            (dimensions.x + 0.30, 0.18, 0.22),
        )
        add_box(
            "MAT_STEEL_NAVY",
            (center.x, beam_y, deck_bottom - 0.10),
            (dimensions.x + 0.15, 0.18, 0.20),
        )
        for hanger_x in (min_x + inset, max_x - inset):
            add_cylinder_between(
                "MAT_GALVANIZED",
                (hanger_x, beam_y, deck_top),
                (hanger_x, beam_y, hanger_top - 0.11),
                0.045,
                8,
            )

    for beam_x in (min_x + inset, max_x - inset):
        add_box(
            "MAT_STEEL_NAVY",
            (beam_x, center.y, deck_bottom - 0.10),
            (0.18, dimensions.y + 0.15, 0.20),
        )

    edge_min_x = min_x + 0.05
    edge_max_x = max_x - 0.05
    edge_min_y = min_y + 0.05
    edge_max_y = max_y - 0.05
    top_z = deck_top + 1.08
    mid_z = deck_top + 0.55
    gap_half = 0.70

    for rail_z, radius in ((top_z, 0.05), (mid_z, 0.04)):
        for rail_y in (edge_min_y, edge_max_y):
            add_cylinder_between(
                "MAT_SAFETY_YELLOW",
                (edge_min_x, rail_y, rail_z),
                (edge_max_x, rail_y, rail_z),
                radius,
                10,
            )
        for rail_x in (edge_min_x, edge_max_x):
            add_cylinder_between(
                "MAT_SAFETY_YELLOW",
                (rail_x, edge_min_y, rail_z),
                (rail_x, center.y - gap_half, rail_z),
                radius,
                10,
            )
            add_cylinder_between(
                "MAT_SAFETY_YELLOW",
                (rail_x, center.y + gap_half, rail_z),
                (rail_x, edge_max_y, rail_z),
                radius,
                10,
            )

    guard_post_positions = []
    for rail_y in (edge_min_y, edge_max_y):
        for post_x in (edge_min_x, center.x - 2.0, center.x, center.x + 2.0, edge_max_x):
            guard_post_positions.append((post_x, rail_y))
    for rail_x in (edge_min_x, edge_max_x):
        guard_post_positions.append((rail_x, center.y - gap_half))
        guard_post_positions.append((rail_x, center.y + gap_half))
    for post_x, post_y in guard_post_positions:
        add_vertical_post(
            "MAT_SAFETY_YELLOW",
            post_x,
            post_y,
            deck_top,
            top_z,
            0.07,
        )


def add_skylight(center, pitch):
    rotation = (pitch, 0.0, 0.0)
    transform = Matrix.Translation(Vector(center)) @ Euler(rotation, "XYZ").to_matrix().to_4x4()
    add_box("MAT_ROOF_GLASS", center, (5.5, 2.2, 0.14), rotation)

    # A raised curb makes the pane's attachment to the standing-seam roof
    # explicit and protects all four glass edges.
    for local_y in (-1.14, 1.14):
        frame_center = transformed(transform, (0.0, local_y, -0.01))
        add_box("MAT_GALVANIZED", frame_center, (5.72, 0.12, 0.18), rotation)
    for local_x in (-2.80, 2.80):
        frame_center = transformed(transform, (local_x, 0.0, -0.01))
        add_box("MAT_GALVANIZED", frame_center, (0.12, 2.38, 0.18), rotation)


def add_corrected_skylights():
    add_skylight((-12.0, -6.0, 9.07), math.radians(4.0))
    add_skylight((0.0, -2.0, 9.35), math.radians(4.0))
    add_skylight((12.0, 5.0, 9.14), math.radians(-4.0))


def create_batch_object(collection, material_name, data, prefix):
    suffix = material_name.removeprefix("MAT_")
    name = prefix + suffix + "_LOD0"
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(data["vertices"], [], data["faces"])
    mesh.validate(verbose=False)
    mesh.update()
    if len(mesh.vertices) == 0 or len(mesh.polygons) == 0:
        bpy.data.meshes.remove(mesh)
        raise RuntimeError("Empty SC02 material batch: " + material_name)

    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(require_material(material_name))
    obj["harbor_v2_role"] = "render_mesh"
    obj["harborZone"] = "warehouse"
    obj["gameplayRole"] = "decorative"
    obj["weaponImpactKind"] = "solid"
    obj["ignoreWeaponRaycast"] = True
    obj["structuralSupportPass"] = PASS_ID

    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.cube_project(cube_size=2.0, correct_aspect=True)
    finally:
        if obj.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

    bevel = obj.modifiers.new("SC02_EDGE_BEVEL", "BEVEL")
    bevel.width = 0.008 if material_name != "MAT_ROOF_GLASS" else 0.018
    bevel.segments = 1
    bevel.limit_method = "ANGLE"
    return obj


def validate_staged_objects(created):
    material_names = sorted(material_name for material_name, _obj in created)
    if material_names != sorted(EXPECTED_MATERIALS):
        raise RuntimeError("Incomplete SC02 material batches: " + str(material_names))
    for material_name, obj in created:
        if not obj.name.startswith(STAGING_PREFIX):
            raise RuntimeError("SC02 object escaped staging: " + obj.name)
        if len(obj.data.materials) != 1 or obj.data.materials[0].name != material_name:
            raise RuntimeError("SC02 material mismatch: " + obj.name)
        if obj.get("harbor_v2_role") != "render_mesh":
            raise RuntimeError("SC02 role mismatch: " + obj.name)


def remove_legacy_roof_glass(obj):
    if obj is None:
        return False
    mesh = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh.users == 0:
        bpy.data.meshes.remove(mesh)
    return True


def main():
    batches.clear()
    scene = require_authoring_scene()
    collection = require_collection(COLLECTION_NAME)
    for material_name in EXPECTED_MATERIALS:
        require_material(material_name)
    stair_contracts = [require_stair_contract(side) for side in STAIR_SIDES]
    platform_contract = require_suspended_platform_contract()
    legacy_roof_glass = audit_legacy_roof_glass()
    protected_before = audit_protected_objects()

    remove_objects_with_prefix(STAGING_PREFIX)
    for contract in stair_contracts:
        add_stair_supports(contract)
    add_suspended_platform_supports(platform_contract)
    add_corrected_skylights()

    created = []
    try:
        for material_name, data in batches.items():
            obj = create_batch_object(collection, material_name, data, STAGING_PREFIX)
            created.append((material_name, obj))
        validate_staged_objects(created)
    except Exception:
        remove_objects_with_prefix(STAGING_PREFIX)
        raise

    removed_previous = remove_objects_with_prefix(PASS_PREFIX)
    finalized = []
    for material_name, obj in created:
        suffix = material_name.removeprefix("MAT_")
        obj.name = PASS_PREFIX + suffix + "_LOD0"
        obj.data.name = obj.name + "_MESH"
        finalized.append(obj)

    if sorted(obj.name for obj in finalized) != sorted(
        PASS_PREFIX + material_name.removeprefix("MAT_") + "_LOD0"
        for material_name in EXPECTED_MATERIALS
    ):
        raise RuntimeError("Final SC02 object contract is incomplete")

    removed_legacy = remove_legacy_roof_glass(legacy_roof_glass)
    protected_after = audit_protected_objects()
    if protected_after != protected_before:
        raise RuntimeError("A collider, marker, or socket changed during SC02")

    scene["warehouseStructuralSupportPass"] = PASS_ID
    scene["warehouseSkylightSource"] = "rebuilt_above_roof_surface"
    bpy.ops.object.select_all(action="DESELECT")
    triangle_count = 0
    for obj in finalized:
        obj.data.calc_loop_triangles()
        triangle_count += len(obj.data.loop_triangles)
    print("STRUCTURAL_SUPPORT_PASS=" + json.dumps({
        "pass": PASS_ID,
        "removedPreviousObjects": removed_previous,
        "removedLegacyRoofGlass": removed_legacy,
        "createdObjects": sorted(obj.name for obj in finalized),
        "baseTrianglesBeforeModifiers": triangle_count,
        "protectedObjectCount": len(protected_after),
        "collisionObjectsTouched": 0,
        "markerObjectsTouched": 0,
    }))


main()
