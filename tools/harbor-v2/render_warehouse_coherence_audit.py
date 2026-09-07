"""Render deterministic exterior, interior, and roof Warehouse geometry audits.

The audit scene is disposable: this script only runs in Blender background mode,
adds neutral lighting/cameras in memory, writes PNGs under ``_staging/renders``,
and never saves the opened ``.blend`` file.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
AUTHORING_ROOT = (ROOT / "art-source/harbor-v2").resolve()
RENDER_ROOT = (AUTHORING_ROOT / "_staging/renders").resolve()
DEFAULT_EAST_OUTPUT = RENDER_ROOT / "warehouse-sc01-east.png"
DEFAULT_WEST_OUTPUT = RENDER_ROOT / "warehouse-sc01-west.png"
DEFAULT_INTERIOR_OUTPUT = RENDER_ROOT / "warehouse-sc02-interior.png"
DEFAULT_ROOF_OUTPUT = RENDER_ROOT / "warehouse-sc02-roof.png"
AUDIT_PREFIX = "WAREHOUSE_AUDIT_"
LEGACY_AUDIT_PREFIX = "SC01_AUDIT_"
AUDIT_COLLECTION = "PREVIEW_ONLY"
RESOLUTION = (2560, 1440)


def blender_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--east-output", type=Path, default=DEFAULT_EAST_OUTPUT)
    parser.add_argument("--west-output", type=Path, default=DEFAULT_WEST_OUTPUT)
    parser.add_argument("--interior-output", type=Path, default=DEFAULT_INTERIOR_OUTPUT)
    parser.add_argument("--roof-output", type=Path, default=DEFAULT_ROOF_OUTPUT)
    return parser.parse_args(blender_args())


def absolute(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def validated_output(path: Path) -> Path:
    output = absolute(path).resolve()
    if output.suffix.lower() != ".png" or not output.is_relative_to(RENDER_ROOT):
        raise PermissionError(
            f"Audit output must be a PNG inside {RENDER_ROOT}: {output}"
        )
    return output


def move_to_audit_collection(obj: bpy.types.Object) -> None:
    collection = bpy.data.collections.get(AUDIT_COLLECTION)
    if collection is None:
        raise RuntimeError(f"Missing authoring collection: {AUDIT_COLLECTION}")
    if collection.objects.get(obj.name) is None:
        collection.objects.link(obj)
    for current in tuple(obj.users_collection):
        if current != collection:
            current.objects.unlink(obj)


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def remove_old_audit_objects() -> None:
    for obj in tuple(bpy.data.objects):
        if obj.name.startswith((AUDIT_PREFIX, LEGACY_AUDIT_PREFIX)):
            bpy.data.objects.remove(obj, do_unlink=True)
    for material in tuple(bpy.data.materials):
        if (
            material.name.startswith((AUDIT_PREFIX, LEGACY_AUDIT_PREFIX))
            and material.users == 0
        ):
            bpy.data.materials.remove(material)


def isolate_render_geometry() -> dict[str, int]:
    """Hide helpers and the alternate LOD so the audit cannot show ghost geometry."""
    masked = {
        "lod1": 0,
        "collider": 0,
        "marker": 0,
        "socket": 0,
        "existing_preview": 0,
        "existing_light": 0,
    }
    preview = bpy.data.collections.get(AUDIT_COLLECTION)
    preview_objects = set(preview.objects) if preview is not None else set()

    for obj in bpy.context.scene.objects:
        category = None
        if obj.name.endswith("_LOD1"):
            category = "lod1"
        elif obj.name.startswith("COL_"):
            category = "collider"
        elif obj.name.startswith("MARKER_"):
            category = "marker"
        elif obj.name.startswith("SOCKET_"):
            category = "socket"
        elif obj in preview_objects:
            category = "existing_preview"
        elif obj.type == "LIGHT":
            category = "existing_light"

        if category is not None:
            obj.hide_render = True
            masked[category] += 1

    return masked


def create_material(
    name: str,
    base_color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(AUDIT_PREFIX + name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("Blender did not create a Principled BSDF node")
    principled.inputs["Base Color"].default_value = base_color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return material


def add_ground() -> None:
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 0.0, -0.22))
    ground = bpy.context.object
    ground.name = AUDIT_PREFIX + "GROUND"
    ground.dimensions = (108.0, 92.0, 0.30)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ground.data.materials.append(
        create_material("GROUND_MAT", (0.055, 0.062, 0.067, 1.0), 0.78)
    )
    ground.hide_render = False
    move_to_audit_collection(ground)
    bevel = ground.modifiers.new("EDGE_SOFTEN", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 2


def add_area(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
) -> None:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = AUDIT_PREFIX + name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    point_at(light, target)
    light.hide_render = False
    move_to_audit_collection(light)


def add_lighting() -> None:
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new(AUDIT_PREFIX + "WORLD")
        bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(24.0)
    sky.sun_rotation = math.radians(218.0)
    sky.altitude = 0.2
    sky.air_density = 1.1
    background.inputs["Strength"].default_value = 0.30
    links.new(sky.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])

    bpy.ops.object.light_add(type="SUN", location=(0.0, -24.0, 34.0))
    sun = bpy.context.object
    sun.name = AUDIT_PREFIX + "SUN"
    sun.rotation_euler = (
        math.radians(30.0),
        math.radians(-16.0),
        math.radians(-34.0),
    )
    sun.data.energy = 1.8
    sun.data.angle = math.radians(7.0)
    sun.data.color = (1.0, 0.78, 0.60)
    sun.hide_render = False
    move_to_audit_collection(sun)

    # Symmetric side keys make both stair runs readable without changing the
    # warehouse materials or adding light objects to the saved source file.
    add_area(
        "EAST_KEY",
        (42.0, -12.0, 24.0),
        (23.0, 0.0, 4.2),
        1650.0,
        13.0,
        (0.72, 0.84, 1.0),
    )
    add_area(
        "WEST_KEY",
        (-42.0, 12.0, 24.0),
        (-23.0, 0.0, 4.2),
        1650.0,
        13.0,
        (0.72, 0.84, 1.0),
    )
    add_area(
        "TOP_FILL",
        (0.0, 0.0, 32.0),
        (0.0, 0.0, 2.0),
        1250.0,
        18.0,
        (1.0, 0.88, 0.72),
    )


def add_interior_lighting() -> None:
    """Light the suspended route from inside without relying on roof light leaks."""
    add_area(
        "INTERIOR_PLATFORM_KEY",
        (14.0, -0.5, 7.4),
        (6.0, 6.0, 5.9),
        1250.0,
        5.0,
        (1.0, 0.70, 0.46),
    )
    add_area(
        "INTERIOR_PLATFORM_RIM",
        (-1.0, 10.0, 8.2),
        (6.0, 6.0, 6.3),
        1050.0,
        4.0,
        (0.48, 0.68, 1.0),
    )


def add_camera() -> bpy.types.Object:
    bpy.ops.object.camera_add(location=(56.0, -36.0, 18.0))
    camera = bpy.context.object
    camera.name = AUDIT_PREFIX + "CAMERA"
    camera.data.lens = 50.0
    camera.data.sensor_width = 36.0
    camera.data.dof.use_dof = False
    camera.hide_render = False
    move_to_audit_collection(camera)
    bpy.context.scene.camera = camera
    return camera


def configure_render() -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RESOLUTION[0]
    scene.render.resolution_y = RESOLUTION[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 25
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_samples = 64


def render_view(
    camera: bpy.types.Object,
    output: Path,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    lens: float,
) -> dict[str, object]:
    camera.location = location
    camera.data.lens = lens
    point_at(camera, target)
    scene = bpy.context.scene
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    if not output.is_file() or output.stat().st_size == 0:
        raise RuntimeError(f"Blender did not write the audit render: {output}")
    return {
        "output": str(output),
        "bytes": output.stat().st_size,
        "camera": list(location),
        "target": list(target),
        "lens": lens,
    }


def main() -> None:
    if not bpy.app.background:
        raise RuntimeError(
            "Warehouse geometry audits are disposable and require Blender background mode"
        )

    source = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    if source is None or not source.is_relative_to(AUTHORING_ROOT):
        raise PermissionError(f"Open an authoring .blend inside {AUTHORING_ROOT}")
    scene = bpy.context.scene
    if not scene.get("catchAndRunAuthoring"):
        raise RuntimeError("Scene is not marked as Catch and Run authoring source")

    args = parse_args()
    east_output = validated_output(args.east_output)
    west_output = validated_output(args.west_output)
    interior_output = validated_output(args.interior_output)
    roof_output = validated_output(args.roof_output)
    outputs = (east_output, west_output, interior_output, roof_output)
    if len(set(outputs)) != len(outputs):
        raise ValueError("Each Warehouse audit view needs a different output file")
    for output in outputs:
        output.parent.mkdir(parents=True, exist_ok=True)

    remove_old_audit_objects()
    masked = isolate_render_geometry()
    add_ground()
    add_lighting()
    camera = add_camera()
    configure_render()

    views = [
        render_view(
            camera,
            east_output,
            (56.0, -36.0, 18.0),
            (24.0, 0.0, 4.3),
            50.0,
        ),
        render_view(
            camera,
            west_output,
            (-56.0, 36.0, 18.0),
            (-24.0, 0.0, 4.3),
            50.0,
        ),
    ]
    add_interior_lighting()
    views.append(
        render_view(
            camera,
            interior_output,
            (17.0, -5.0, 4.2),
            (6.0, 6.0, 6.3),
            38.0,
        )
    )
    views.append(
        render_view(
            camera,
            roof_output,
            (50.0, -46.0, 38.0),
            (0.0, 0.0, 8.4),
            45.0,
        )
    )
    print(
        "COHERENCE_AUDIT="
        + json.dumps(
            {
                "source": str(source),
                "resolution": list(RESOLUTION),
                "engine": scene.render.engine,
                "masked": masked,
                "coherencePass": scene.get("warehouseCoherencePass", "none"),
                "structuralSupportPass": scene.get(
                    "warehouseStructuralSupportPass", "none"
                ),
                "views": views,
                "sourceSaved": False,
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
