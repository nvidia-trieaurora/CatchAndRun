"""Render a deterministic 4K look-development preview of Warehouse authoring."""

from __future__ import annotations

import argparse
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
AUTHORING_ROOT = (ROOT / "art-source/harbor-v2").resolve()
RENDER_ROOT = (AUTHORING_ROOT / "_staging/renders").resolve()
DEFAULT_OUTPUT = RENDER_ROOT / "warehouse-rp01-loading-facade-4k.png"
PREVIEW_PREFIX = "RP01_PREVIEW_"


def blender_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(blender_args())


def absolute(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def move_to_preview_collection(obj):
    preview = bpy.data.collections.get("PREVIEW_ONLY")
    if preview is None:
        raise RuntimeError("Missing PREVIEW_ONLY authoring collection")
    if preview not in obj.users_collection:
        preview.objects.link(obj)
    for collection in list(obj.users_collection):
        if collection != preview:
            collection.objects.unlink(obj)


def point_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def remove_old_preview():
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREVIEW_PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)
    for material in list(bpy.data.materials):
        if material.name.startswith(PREVIEW_PREFIX) and material.users == 0:
            bpy.data.materials.remove(material)


def create_asphalt_material():
    material = bpy.data.materials.new(PREVIEW_PREFIX + "WET_ASPHALT")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    noise = nodes.new("ShaderNodeTexNoise")
    ramp = nodes.new("ShaderNodeValToRGB")
    bump = nodes.new("ShaderNodeBump")
    noise.inputs["Scale"].default_value = 5.5
    noise.inputs["Detail"].default_value = 7.0
    noise.inputs["Roughness"].default_value = 0.72
    ramp.color_ramp.elements[0].color = (0.012, 0.016, 0.019, 1.0)
    ramp.color_ramp.elements[1].color = (0.075, 0.082, 0.086, 1.0)
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.035
    principled.inputs["Roughness"].default_value = 0.34
    principled.inputs["Metallic"].default_value = 0.0
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    return material


def create_horizon_material():
    material = bpy.data.materials.new(PREVIEW_PREFIX + "HORIZON")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    texture_coordinate = nodes.new("ShaderNodeTexCoord")
    separate = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.13, 0.18, 0.23, 1.0)
    ramp.color_ramp.elements[1].color = (0.018, 0.035, 0.065, 1.0)
    emission.inputs["Strength"].default_value = 0.8
    links.new(texture_coordinate.outputs["Generated"], separate.inputs["Vector"])
    links.new(separate.outputs["Z"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def add_preview_ground():
    asphalt = create_asphalt_material()
    bpy.ops.mesh.primitive_cube_add(location=(0.0, -5.0, -0.28))
    ground = bpy.context.object
    ground.name = PREVIEW_PREFIX + "GROUND"
    ground.dimensions = (82.0, 72.0, 0.30)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ground.data.materials.append(asphalt)
    move_to_preview_collection(ground)
    bevel = ground.modifiers.new("EDGE_SOFTEN", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 2

    # A disposable gradient horizon keeps the beauty render readable without
    # adding environment geometry to the authored GLB.
    bpy.ops.mesh.primitive_cube_add(location=(0.0, 34.0, 20.0))
    horizon = bpy.context.object
    horizon.name = PREVIEW_PREFIX + "HORIZON"
    horizon.dimensions = (300.0, 0.25, 80.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    horizon.data.materials.append(create_horizon_material())
    move_to_preview_collection(horizon)


def add_area(name, location, target, energy, size, color):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = PREVIEW_PREFIX + name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    point_at(light, target)
    move_to_preview_collection(light)
    return light


def add_lighting():
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new(PREVIEW_PREFIX + "WORLD")
        bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(12.0)
    sky.sun_rotation = math.radians(225.0)
    sky.altitude = 0.2
    sky.air_density = 1.15
    background.inputs["Strength"].default_value = 0.32
    links.new(sky.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])

    bpy.ops.object.light_add(type="SUN", location=(20.0, -25.0, 35.0))
    sun = bpy.context.object
    sun.name = PREVIEW_PREFIX + "SUN"
    sun.rotation_euler = (math.radians(28.0), math.radians(-18.0), math.radians(-38.0))
    sun.data.energy = 2.2
    sun.data.angle = math.radians(8.0)
    sun.data.color = (1.0, 0.72, 0.48)
    move_to_preview_collection(sun)

    add_area("SKY_FILL", (-26.0, -24.0, 24.0), (0.0, -12.0, 4.0), 1400.0, 14.0, (0.38, 0.56, 1.0))
    add_area("FACADE_KEY", (24.0, -34.0, 15.0), (5.0, -17.0, 4.0), 1900.0, 10.0, (1.0, 0.58, 0.34))
    add_area("INTERIOR_WARM", (0.0, -11.0, 5.0), (0.0, -18.0, 3.0), 2600.0, 9.0, (1.0, 0.42, 0.16))


def add_camera():
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(4.0, -14.0, 4.2))
    focus = bpy.context.object
    focus.name = PREVIEW_PREFIX + "FOCUS"
    move_to_preview_collection(focus)
    bpy.ops.object.camera_add(location=(35.0, -51.0, 14.0))
    camera = bpy.context.object
    camera.name = PREVIEW_PREFIX + "CAMERA"
    camera.data.lens = 52.0
    camera.data.sensor_width = 36.0
    point_at(camera, focus.location)
    camera.data.dof.use_dof = True
    camera.data.dof.focus_object = focus
    camera.data.dof.aperture_fstop = 8.0
    bpy.context.scene.camera = camera
    move_to_preview_collection(camera)


def configure_render(output):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 3840
    scene.render.resolution_y = 2160
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.filepath = str(output)
    scene.render.image_settings.compression = 25
    scene.render.use_file_extension = True
    scene.render.resolution_percentage = 100
    scene.view_settings.look = "AgX - Medium High Contrast"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_samples = 64


def main():
    if not bpy.app.background:
        raise RuntimeError(
            "RP01 preview rendering is disposable and must run in Blender background mode"
        )
    scene = bpy.context.scene
    source = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    if source is None or not source.is_relative_to(AUTHORING_ROOT):
        raise PermissionError(f"Open an authoring .blend inside {AUTHORING_ROOT}")
    if not scene.get("catchAndRunAuthoring"):
        raise RuntimeError("Scene is not marked as Catch and Run authoring source")
    args = parse_args()
    output = absolute(args.output).resolve()
    if output.suffix.lower() != ".png" or not output.is_relative_to(RENDER_ROOT):
        raise PermissionError(f"Preview output must be a PNG inside {RENDER_ROOT}: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    remove_old_preview()
    for obj in bpy.context.scene.objects:
        obj.hide_render = (
            obj.name.startswith("COL_")
            or obj.name.startswith("MARKER_")
            or obj.name.endswith("_LOD1")
        )
    add_preview_ground()
    add_lighting()
    add_camera()
    configure_render(output)
    bpy.ops.render.render(write_still=True)
    print("AUTHORING_RENDER=" + json.dumps({
        "output": str(output),
        "resolution": [3840, 2160],
        "engine": bpy.context.scene.render.engine,
        "realismPass": bpy.context.scene.get("warehouseRealismPass", "none"),
    }))


main()
