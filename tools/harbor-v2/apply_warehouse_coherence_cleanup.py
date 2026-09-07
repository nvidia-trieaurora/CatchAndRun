"""Remove unsupported facade placeholders and normalize authoring visibility.

The seed GLB batches meshes by material, so invalid window trim and disconnected
downspouts are removed spatially from the galvanized batch. Original mesh data
remains available until every removal validates successfully.
"""

import bpy
import bmesh
import json


GLASS_OBJECT = "MESH_WAREHOUSE_GLASS_WARM_LOD0"
GALVANIZED_OBJECT = "MESH_WAREHOUSE_GALVANIZED_LOD0"
SIDE_WINDOW_Y = (-10.0, -3.0, 5.0, 12.0)
PASS_ID = "SC01_SIDE_FACADE_COHERENCE"


def require_authoring_scene():
    scene = bpy.context.scene
    if not scene.get("catchAndRunAuthoring"):
        raise RuntimeError("Open the Catch and Run Warehouse authoring scene first")
    return scene


def require_mesh(name):
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError("Missing required batched mesh: " + name)
    return obj


def is_side_window_trim(point):
    if not 22.80 <= abs(point.x) <= 23.20:
        return False
    if not 3.00 <= point.z <= 5.40:
        return False
    for center_y in SIDE_WINDOW_Y:
        if abs(point.y - center_y) <= 1.75:
            return True
    return False


def is_disconnected_downspout(point):
    return (
        22.79 <= abs(point.x) <= 23.01
        and 16.89 <= abs(point.y) <= 17.11
        and 0.09 <= point.z <= 7.51
    )


def is_uncollidable_catwalk_stair(point):
    return (
        -19.05 <= point.x <= -16.95
        and 8.15 <= point.y <= 12.90
        and 0.08 <= point.z <= 4.00
    )


def is_invalid_galvanized_detail(point):
    return (
        is_side_window_trim(point)
        or is_disconnected_downspout(point)
        or is_uncollidable_catwalk_stair(point)
    )


def delete_invalid_galvanized_vertices(obj):
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    matrix = obj.matrix_world
    selected = [
        vertex for vertex in mesh.verts
        if is_invalid_galvanized_detail(matrix @ vertex.co)
    ]
    if selected:
        bmesh.ops.delete(mesh, geom=selected, context="VERTS")
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.validate(verbose=False)
    obj.data.update()
    return len(selected)


def count_invalid_galvanized_vertices(obj):
    matrix = obj.matrix_world
    return len([
        vertex for vertex in obj.data.vertices
        if is_invalid_galvanized_detail(matrix @ vertex.co)
    ])


def configure_authoring_visibility():
    hidden_lod1 = 0
    hidden_debug = 0
    for obj in bpy.context.scene.objects:
        if obj.name.endswith("_LOD1"):
            obj.hide_set(True)
            hidden_lod1 += 1
        elif obj.name.startswith(("COL_", "MARKER_", "SOCKET_")):
            obj.hide_set(True)
            hidden_debug += 1
    xray_disabled = 0
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.shading.show_xray = False
                xray_disabled += 1
    return {
        "hiddenLod1": hidden_lod1,
        "hiddenDebugObjects": hidden_debug,
        "xrayDisabledViewports": xray_disabled,
    }


def main():
    scene = require_authoring_scene()
    glass = bpy.data.objects.get(GLASS_OBJECT)
    if glass is not None and glass.type != "MESH":
        raise RuntimeError(GLASS_OBJECT + " must be a mesh when present")
    galvanized = require_mesh(GALVANIZED_OBJECT)
    original_mesh = galvanized.data
    working_mesh = None
    removed = {
        GLASS_OBJECT: len(glass.data.vertices) if glass is not None else 0,
    }
    try:
        working_mesh = original_mesh.copy()
        working_mesh.name = original_mesh.name + "_SC01_WORKING"
        galvanized.data = working_mesh
        removed[galvanized.name] = delete_invalid_galvanized_vertices(galvanized)
        remaining_count = count_invalid_galvanized_vertices(galvanized)
        if remaining_count:
            raise RuntimeError(
                "Unsupported facade geometry remains: " + str(remaining_count)
            )
    except Exception:
        galvanized.data = original_mesh
        if working_mesh is not None and working_mesh.users == 0:
            bpy.data.meshes.remove(working_mesh)
        raise

    if original_mesh.users == 0:
        bpy.data.meshes.remove(original_mesh)
    working_mesh.name = GALVANIZED_OBJECT + "_MESH"
    if glass is not None:
        glass_mesh = glass.data
        bpy.data.objects.remove(glass, do_unlink=True)
        if glass_mesh.users == 0:
            bpy.data.meshes.remove(glass_mesh)
    visibility = configure_authoring_visibility()
    scene["warehouseCoherencePass"] = PASS_ID
    scene["sideWindowPlaceholders"] = "removed_until_recessed_wall_openings_exist"
    scene["downspoutPlaceholders"] = "removed_until_gutter_connectors_exist"
    scene["catwalkStairPlaceholder"] = "removed_until_collision_route_exists"
    bpy.ops.object.select_all(action="DESELECT")
    print("COHERENCE_CLEANUP=" + json.dumps({
        "pass": PASS_ID,
        "removedVertices": removed,
        "remainingUnsupportedVertices": {GALVANIZED_OBJECT: remaining_count},
        "visibility": visibility,
        "collisionObjectsTouched": 0,
        "markerObjectsTouched": 0,
    }))


main()
