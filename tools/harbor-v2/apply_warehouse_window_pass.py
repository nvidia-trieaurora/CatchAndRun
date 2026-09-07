"""Add recessed industrial windows to the intact Warehouse side facade.

The original seed used flat emissive plates on both side walls. Those plates
were removed by SC01 because several crossed the east loading opening. This
pass rebuilds four believable window assemblies only on the uninterrupted
west wall, keeping every gameplay opening, collider, and marker unchanged.
"""

from __future__ import annotations

import json

import bpy


PASS_ID = "SC03_RECESSED_SIDE_WINDOWS"
COLLECTION_NAME = "RENDER_LOD0"
GLASS_NAME = "MESH_WAREHOUSE_SC03_WINDOW_GLASS_LOD0"
FRAME_NAME = "MESH_WAREHOUSE_SC03_WINDOW_FRAME_LOD0"
WINDOW_Y = (-10.0, -3.0, 5.0, 12.0)
WINDOW_Z = 4.25


def require_authoring_scene() -> bpy.types.Scene:
    scene = bpy.context.scene
    if not scene.get("catchAndRunAuthoring"):
        raise RuntimeError("Open the Catch and Run warehouse authoring scene first")
    if scene.unit_settings.system != "METRIC" or scene.unit_settings.scale_length != 1.0:
        raise RuntimeError("Warehouse authoring requires Metric units at scale 1.0")
    return scene


def require_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        raise RuntimeError("Missing authoring collection: " + name)
    return collection


def window_glass_material() -> bpy.types.Material:
    material = bpy.data.materials.get("MAT_WINDOW_GLASS")
    if material is None:
        material = bpy.data.materials.new("MAT_WINDOW_GLASS")
    material.use_nodes = True
    node = material.node_tree.nodes.get("Principled BSDF")
    if node is None:
        raise RuntimeError("MAT_WINDOW_GLASS needs a Principled BSDF node")
    node.inputs["Base Color"].default_value = (0.018, 0.055, 0.085, 1.0)
    node.inputs["Metallic"].default_value = 0.22
    node.inputs["Roughness"].default_value = 0.14
    if "IOR" in node.inputs:
        node.inputs["IOR"].default_value = 1.45
    if "Transmission Weight" in node.inputs:
        node.inputs["Transmission Weight"].default_value = 0.08
    return material


def window_frame_material() -> bpy.types.Material:
    material = bpy.data.materials.get("MAT_WINDOW_FRAME")
    if material is None:
        material = bpy.data.materials.new("MAT_WINDOW_FRAME")
    material.use_nodes = True
    node = material.node_tree.nodes.get("Principled BSDF")
    if node is None:
        raise RuntimeError("MAT_WINDOW_FRAME needs a Principled BSDF node")
    node.inputs["Base Color"].default_value = (0.34, 0.40, 0.43, 1.0)
    node.inputs["Metallic"].default_value = 0.72
    node.inputs["Roughness"].default_value = 0.31
    return material


def append_box(
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, int, int, int]],
    center: tuple[float, float, float],
    dimensions: tuple[float, float, float],
) -> None:
    cx, cy, cz = center
    hx, hy, hz = (value / 2 for value in dimensions)
    offset = len(vertices)
    vertices.extend((
        (cx - hx, cy - hy, cz - hz),
        (cx + hx, cy - hy, cz - hz),
        (cx + hx, cy + hy, cz - hz),
        (cx - hx, cy + hy, cz - hz),
        (cx - hx, cy - hy, cz + hz),
        (cx + hx, cy - hy, cz + hz),
        (cx + hx, cy + hy, cz + hz),
        (cx - hx, cy + hy, cz + hz),
    ))
    faces.extend(tuple(offset + index for index in face) for face in (
        (0, 3, 2, 1),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ))


def build_batch(
    name: str,
    boxes: list[tuple[tuple[float, float, float], tuple[float, float, float]]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    impact_kind: str,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    for center, dimensions in boxes:
        append_box(vertices, faces, center, dimensions)
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj["harbor_v2_role"] = "render_mesh"
    obj["harborZone"] = "warehouse"
    obj["gameplayRole"] = "decorative"
    obj["weaponImpactKind"] = impact_kind
    obj["ignoreWeaponRaycast"] = True
    obj["windowPass"] = PASS_ID
    return obj


def remove_owned_object(name: str) -> None:
    obj = bpy.data.objects.get(name)
    if obj is None:
        return
    mesh = obj.data if obj.type == "MESH" else None
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh is not None and mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def main() -> None:
    scene = require_authoring_scene()
    collection = require_collection(COLLECTION_NAME)
    protected_before = sorted(
        obj.name for obj in bpy.data.objects
        if obj.name.startswith(("COL_", "MARKER_", "SOCKET_"))
    )
    remove_owned_object(GLASS_NAME)
    remove_owned_object(FRAME_NAME)

    glass_boxes = []
    frame_boxes = []
    for center_y in WINDOW_Y:
        # Negative X is the uninterrupted west wall. Glass sits slightly
        # behind the projecting galvanized reveal to create readable depth.
        glass_boxes.append(((-23.055, center_y, WINDOW_Z), (0.09, 3.12, 1.82)))
        frame_boxes.extend((
            ((-23.12, center_y - 1.66, WINDOW_Z), (0.24, 0.18, 2.34)),
            ((-23.12, center_y + 1.66, WINDOW_Z), (0.24, 0.18, 2.34)),
            ((-23.12, center_y, WINDOW_Z - 1.08), (0.24, 3.50, 0.18)),
            ((-23.12, center_y, WINDOW_Z + 1.08), (0.24, 3.50, 0.18)),
            ((-23.14, center_y, WINDOW_Z), (0.28, 0.12, 2.00)),
        ))

    build_batch(
        GLASS_NAME,
        glass_boxes,
        window_glass_material(),
        collection,
        "glass",
    )
    build_batch(
        FRAME_NAME,
        frame_boxes,
        window_frame_material(),
        collection,
        "solid",
    )
    protected_after = sorted(
        obj.name for obj in bpy.data.objects
        if obj.name.startswith(("COL_", "MARKER_", "SOCKET_"))
    )
    if protected_after != protected_before:
        raise RuntimeError("Window pass changed protected gameplay objects")
    scene["warehouseWindowPass"] = PASS_ID
    scene["sideWindowPlaceholders"] = "replaced_with_recessed_west_facade_windows"
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print("WINDOW_PASS=" + json.dumps({
        "pass": PASS_ID,
        "windows": len(WINDOW_Y),
        "objects": [GLASS_NAME, FRAME_NAME],
        "collisionObjectsTouched": 0,
        "markerObjectsTouched": 0,
        "saved": bpy.data.filepath,
    }))


main()
