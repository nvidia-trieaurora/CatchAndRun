"""Disposable Eevee preview renders for zone authoring scenes (never saved).

Usage inside Blender::

    import preview_render; preview_render.render_views(out_dir, [(name, eye, target, lens), ...])

Eye/target are Three.js coordinates. Uses the game's Industrial Sunset HDRI plus a
warm low sun so materials read like the runtime. Temporary objects are removed and
the scene settings restored afterwards.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
HDR = ROOT / "client/public/assets/environment/industrial_sunset_1k.hdr"


def _to_blender(v):
    x, y, z = v
    return Vector((x, -z, y))


def render_views(out_dir: Path, views, resolution=(1280, 720), hide_collections=("COLLISION", "REFERENCE", "PREVIEW_ONLY", "RENDER_LOD1")) -> list[Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    prev = {
        "cam": scene.camera, "world": scene.world, "engine": scene.render.engine,
        "res": (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage),
        "fp": scene.render.filepath, "vt": scene.view_settings.view_transform, "look": scene.view_settings.look,
        "exclude": {},
    }
    for name in hide_collections:
        layer_collection = view_layer.layer_collection.children.get(name)
        if layer_collection is not None:
            prev["exclude"][name] = layer_collection.exclude
            layer_collection.exclude = True

    world = bpy.data.worlds.new("TMP_PREVIEW_WORLD")
    world.use_nodes = True
    tree = world.node_tree
    for node in list(tree.nodes):
        tree.nodes.remove(node)
    env = tree.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(HDR), check_existing=True)
    background = tree.nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = 1.0
    output = tree.nodes.new("ShaderNodeOutputWorld")
    tree.links.new(env.outputs["Color"], background.inputs["Color"])
    tree.links.new(background.outputs["Background"], output.inputs["Surface"])
    scene.world = world

    sun_data = bpy.data.lights.new("TMP_PREVIEW_SUN", "SUN")
    sun_data.energy = 3.0
    sun_data.color = (1.0, 0.79, 0.51)
    sun_data.angle = math.radians(2)
    sun = bpy.data.objects.new("TMP_PREVIEW_SUN", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(62), 0, math.radians(-140))
    cam_data = bpy.data.cameras.new("TMP_PREVIEW_CAM")
    cam = bpy.data.objects.new("TMP_PREVIEW_CAM", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"

    outputs = []
    try:
        for name, eye, target, lens in views:
            cam_data.lens = lens
            e, t = _to_blender(eye), _to_blender(target)
            cam.location = e
            cam.rotation_euler = (e - t).to_track_quat("Z", "Y").to_euler()
            path = out_dir / f"{name}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            outputs.append(path)
    finally:
        bpy.data.objects.remove(cam)
        bpy.data.objects.remove(sun)
        bpy.data.cameras.remove(cam_data)
        bpy.data.lights.remove(sun_data)
        scene.world = prev["world"]
        bpy.data.worlds.remove(world)
        scene.camera = prev["cam"]
        scene.render.engine = prev["engine"]
        scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = prev["res"]
        scene.render.filepath = prev["fp"]
        scene.view_settings.view_transform = prev["vt"]
        scene.view_settings.look = prev["look"]
        for name, exclude in prev["exclude"].items():
            view_layer.layer_collection.children[name].exclude = exclude
    return outputs
