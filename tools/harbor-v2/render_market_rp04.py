"""Offline 4K authoring review, explicitly NOT a screenshot of the game renderer.

Blender background --factory-startup --python-exit-code 1 --python this.py
Uses actual RP04 meshes/PBR with Cycles bounce lighting. Does not save the scene.
"""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/harbor-v2/container-bd/container-bd-market-rp04.blend'
OUT = ROOT / 'docs/v2/harbor/market-rp04/blender'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
for name in ('COLLISION','COLLISION_ZONE','REFERENCE','PREVIEW_ONLY','RENDER_LOD1'):
    collection = bpy.context.view_layer.layer_collection.children.get(name)
    if collection:
        collection.exclude = True
scene.render.engine = 'CYCLES'
try:
    devices = bpy.context.preferences.addons['cycles'].preferences
    devices.compute_device_type = 'METAL'
    devices.get_devices()
    supported = [device for device in devices.devices if device.type == 'METAL']
    if supported:
        for device in devices.devices:
            device.use = device.type == 'METAL'
        scene.cycles.device = 'GPU'
        print('RP04_RENDER_DEVICES=' + ', '.join(device.name for device in supported))
except (KeyError, TypeError, RuntimeError):
    print('RP04_RENDER_DEVICES=CPU fallback')
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = .035
scene.cycles.max_bounces = 6
scene.cycles.transparent_max_bounces = 8
scene.render.resolution_x = 3840
scene.render.resolution_y = 2160
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'None'

world = bpy.data.worlds.new('RP04_REVIEW_ONLY_WORLD')
world.use_nodes = True
nodes, links = world.node_tree.nodes, world.node_tree.links
env = nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(str(ROOT/'client/public/assets/environment/industrial_sunset_1k.hdr'))
links.new(env.outputs['Color'],nodes.get('Background').inputs['Color'])
nodes.get('Background').inputs['Strength'].default_value = .8
scene.world = world

def convert(v):
    return Vector((v[0],-v[2],v[1]))

sun_data = bpy.data.lights.new('RP04_REVIEW_ONLY_SUN','SUN')
sun_data.energy = 2.4
sun_data.color = (1,.79,.56)
sun_data.angle = math.radians(2)
sun = bpy.data.objects.new(sun_data.name,sun_data)
scene.collection.objects.link(sun)
sun.location = convert((-55,38,-32))
sun.rotation_euler = (sun.location-convert((0,0,0))).to_track_quat('Z','Y').to_euler()
# Practical light geometry is already in the GLB. Cycles can illuminate the room
# directly from those emissive surfaces; this offline GI is not exported to Three.
camera_data = bpy.data.cameras.new('RP04_REVIEW_ONLY_CAMERA')
camera_data.sensor_fit = 'VERTICAL'
camera_data.sensor_height = 24
camera_data.lens = 24/(2*math.tan(math.radians(70)/2))
camera_data.clip_start = .05
camera = bpy.data.objects.new(camera_data.name,camera_data)
scene.collection.objects.link(camera)
camera.location = convert((45,1.85,-33.4))
target = convert((45,1.35,-42.5))
camera.rotation_euler = (camera.location-target).to_track_quat('Z','Y').to_euler()
scene.camera = camera
scene.render.filepath = str(OUT/'market-interior-cycles-3840x2160.png')
bpy.ops.render.render(write_still=True)
print('RP04_BLENDER_RENDER='+scene.render.filepath)
