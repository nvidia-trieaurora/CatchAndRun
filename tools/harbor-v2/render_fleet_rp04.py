"""Disposable native 4K Fleet review; not a Three.js screenshot/performance claim."""
import math
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'art-source/harbor-v2/ferris-harbor/ferris-harbor-fleet-rp04.blend'
OUT=ROOT/'docs/v2/harbor/fleet-rp04/blender'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene
for name in ('COLLISION','COLLISION_ZONE','REFERENCE','PREVIEW_ONLY','RENDER_LOD1'):
    collection=bpy.context.view_layer.layer_collection.children.get(name)
    if collection: collection.exclude=True
for obj in scene.objects:
    if obj.name.endswith('_LOD1'): obj.hide_render=True
scene.render.engine='CYCLES'
try:
    pref=bpy.context.preferences.addons['cycles'].preferences
    pref.compute_device_type='METAL'; pref.get_devices()
    if any(d.type=='METAL' for d in pref.devices):
        for d in pref.devices: d.use=d.type=='METAL'
        scene.cycles.device='GPU'
except (KeyError,TypeError,RuntimeError): pass
scene.cycles.samples=48; scene.cycles.use_denoising=True
scene.cycles.use_adaptive_sampling=True; scene.cycles.adaptive_threshold=.035
scene.cycles.max_bounces=6; scene.cycles.transparent_max_bounces=8
scene.render.resolution_x=3840; scene.render.resolution_y=2160; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'; scene.view_settings.look='None'
world=bpy.data.worlds.new('RP04_REVIEW_ONLY_WORLD'); world.use_nodes=True
env=world.node_tree.nodes.new('ShaderNodeTexEnvironment')
env.image=bpy.data.images.load(str(ROOT/'client/public/assets/environment/industrial_sunset_1k.hdr'))
world.node_tree.links.new(env.outputs['Color'],world.node_tree.nodes.get('Background').inputs['Color'])
world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.85; scene.world=world

def v(p): return Vector((p[0],-p[2],p[1]))

sun_data=bpy.data.lights.new('RP04_REVIEW_ONLY_SUN','SUN'); sun_data.energy=2.4
sun_data.color=(1,.79,.56); sun_data.angle=math.radians(2)
sun=bpy.data.objects.new(sun_data.name,sun_data); scene.collection.objects.link(sun)
sun.location=v((-55,38,-32)); sun.rotation_euler=sun.location.to_track_quat('Z','Y').to_euler()
cam_data=bpy.data.cameras.new('RP04_REVIEW_ONLY_CAMERA')
cam_data.sensor_fit='VERTICAL'; cam_data.sensor_height=24
cam_data.lens=24/(2*math.tan(math.radians(50)/2)); cam_data.clip_start=.05
cam=bpy.data.objects.new(cam_data.name,cam_data); scene.collection.objects.link(cam)
cam.location=v((11.5,3.2,44.2)); target=v((6.5,.6,50))
cam.rotation_euler=(cam.location-target).to_track_quat('Z','Y').to_euler(); scene.camera=cam
# A preview-only sea keeps the boats visually grounded. The actual game's TSL
# Gerstner/foam/hull-mask shader is reviewed separately in the browser.
bpy.ops.mesh.primitive_plane_add(size=1500,location=v((0,-.8,0)))
sea=bpy.context.object; sea.name='RP04_REVIEW_ONLY_SEA'
mat=bpy.data.materials.new('RP04_REVIEW_ONLY_SEA'); mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(.015,.085,.105,1)
bsdf.inputs['Roughness'].default_value=.20; bsdf.inputs['Metallic'].default_value=.12
noise=mat.node_tree.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=2.2
coord=mat.node_tree.nodes.new('ShaderNodeTexCoord'); mapping=mat.node_tree.nodes.new('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'
mapping.inputs[1].default_value=(.7,2.8,1)
mat.node_tree.links.new(coord.outputs['Object'],mapping.inputs[0]); mat.node_tree.links.new(mapping.outputs[0],noise.inputs['Vector'])
bump=mat.node_tree.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.22; bump.inputs['Distance'].default_value=.08
mat.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']); mat.node_tree.links.new(bump.outputs['Normal'],bsdf.inputs['Normal'])
sea.data.materials.append(mat)
scene.render.filepath=str(OUT/'workboat-cycles-3840x2160.png')
bpy.ops.render.render(write_still=True)
(OUT/'render.json').write_text(json.dumps({
    'source':str(SOURCE.relative_to(ROOT)),
    'sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'rawExportSHA256':hashlib.sha256((ROOT/'art-source/harbor-v2/_staging/fleet-rp04/ferris-harbor-candidate.glb').read_bytes()).hexdigest(),
    'image':Path(scene.render.filepath).name,
    'imageSHA256':hashlib.sha256(Path(scene.render.filepath).read_bytes()).hexdigest(),
    'resolution':[3840,2160], 'renderer':'Blender Cycles', 'samples':48,
    'scope':'Offline native asset review. Preview-only sea and lighting, not Three.js runtime water or performance proof.',
},indent=2)+'\n')
print('FLEET_RP04_RENDER='+scene.render.filepath)
