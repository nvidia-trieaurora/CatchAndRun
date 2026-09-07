"""Replace the obscured loading-bay label with a readable shared-LOD sign."""

from __future__ import annotations

import json

import bpy


PASS_ID = "SC04_LOADING_BAY_SIGN"
COLLECTION_NAME = "RENDER_SHARED"
OWNED_PREFIX = "MESH_WAREHOUSE_SC04_SIGN_"


def require_authoring_scene() -> bpy.types.Scene:
    scene = bpy.context.scene
    if not scene.get("catchAndRunAuthoring"):
        raise RuntimeError("Open the Catch and Run warehouse authoring scene first")
    if scene.unit_settings.system != "METRIC" or scene.unit_settings.scale_length != 1.0:
        raise RuntimeError("Warehouse authoring requires Metric units at scale 1.0")
    return scene


def require_collection() -> bpy.types.Collection:
    collection = bpy.data.collections.get(COLLECTION_NAME)
    if collection is None:
        raise RuntimeError("Missing authoring collection: " + COLLECTION_NAME)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    if collection not in obj.users_collection:
        collection.objects.link(obj)
    for current in list(obj.users_collection):
        if current != collection:
            current.objects.unlink(obj)


def material(name: str, color: tuple[float, float, float, float], metallic: float, roughness: float, emission: float = 0.0) -> bpy.types.Material:
    result = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    result.use_nodes = True
    node = result.node_tree.nodes.get("Principled BSDF")
    if node is None:
        raise RuntimeError(name + " needs a Principled BSDF node")
    node.inputs["Base Color"].default_value = color
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    if emission > 0:
        emission_input = node.inputs.get("Emission Color") or node.inputs.get("Emission")
        if emission_input is not None:
            emission_input.default_value = color
        strength_input = node.inputs.get("Emission Strength")
        if strength_input is not None:
            strength_input.default_value = emission
    return result


def tag(obj: bpy.types.Object) -> None:
    obj["harbor_v2_role"] = "render_mesh"
    obj["harborZone"] = "warehouse"
    obj["gameplayRole"] = "decorative"
    obj["weaponImpactKind"] = "solid"
    obj["ignoreWeaponRaycast"] = True
    obj["signPass"] = PASS_ID


def add_box(name: str, center: tuple[float, float, float], dimensions: tuple[float, float, float], mat: bpy.types.Material, collection: bpy.types.Collection) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("SignEdgeSoftening", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 1
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    tag(obj)
    move_to_collection(obj, collection)
    return obj


def main() -> None:
    scene = require_authoring_scene()
    collection = require_collection()
    protected_before = sorted(
        obj.name for obj in bpy.data.objects
        if obj.name.startswith(("COL_", "MARKER_", "SOCKET_"))
    )
    for obj in list(bpy.data.objects):
        if obj.name.startswith(OWNED_PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)

    backing = material("MAT_SIGN_BACKING", (0.012, 0.025, 0.038, 1), 0.68, 0.28)
    frame = material("MAT_SIGN_FRAME", (0.38, 0.45, 0.49, 1), 0.82, 0.22)
    letters = material("MAT_SIGN_LETTERS", (1.0, 0.68, 0.16, 1), 0.18, 0.24, 1.8)

    add_box(OWNED_PREFIX + "BACKING", (0, -18.24, 7.65), (10.8, 0.18, 1.65), backing, collection)
    frame_parts = []
    for suffix, center, dimensions in (
        ("FRAME_TOP", (0, -18.35, 8.51), (11.05, 0.08, 0.09)),
        ("FRAME_BOTTOM", (0, -18.35, 6.79), (11.05, 0.08, 0.09)),
        ("FRAME_LEFT", (-5.48, -18.35, 7.65), (0.09, 0.08, 1.8)),
        ("FRAME_RIGHT", (5.48, -18.35, 7.65), (0.09, 0.08, 1.8)),
    ):
        frame_parts.append(add_box(OWNED_PREFIX + suffix, center, dimensions, frame, collection))
    bpy.ops.object.select_all(action="DESELECT")
    for part in frame_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = frame_parts[0]
    bpy.ops.object.join()
    frame_parts[0].name = OWNED_PREFIX + "FRAME"

    bpy.ops.object.text_add(location=(0, -18.37, 7.62), rotation=(1.57079632679, 0, 0))
    text_obj = bpy.context.object
    text_obj.name = OWNED_PREFIX + "LETTERS"
    text_obj.data.body = "OLD HARBOR"
    text_obj.data.align_x = "CENTER"
    text_obj.data.align_y = "CENTER"
    text_obj.data.size = 1.08
    text_obj.data.extrude = 0.025
    # Keep the readable silhouette crisp: curve beveling multiplies this short
    # label into ~9k triangles with no visible benefit at gameplay distance.
    text_obj.data.bevel_depth = 0.0
    text_obj.data.resolution_u = 2
    text_obj.data.materials.append(letters)
    bpy.context.view_layer.objects.active = text_obj
    text_obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    tag(text_obj)
    move_to_collection(text_obj, collection)

    protected_after = sorted(
        obj.name for obj in bpy.data.objects
        if obj.name.startswith(("COL_", "MARKER_", "SOCKET_"))
    )
    if protected_after != protected_before:
        raise RuntimeError("Sign pass changed protected gameplay objects")
    scene["warehouseSignPass"] = PASS_ID
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
    print("SIGN_PASS=" + json.dumps({
        "pass": PASS_ID,
        "objects": sorted(obj.name for obj in bpy.data.objects if obj.name.startswith(OWNED_PREFIX)),
        "collisionObjectsTouched": 0,
        "saved": bpy.data.filepath,
    }))


main()
