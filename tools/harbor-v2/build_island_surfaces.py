"""Re-author only the island's six ground/kè surface batches in native Blender.
Reads exact existing world geometry from island_surfaces.mjs --prepare. Keeps
every vertex and triangle, replacing stretched UVs with a metric box projection.
Saves a new editable .blend; exports only these surfaces plus flush road drains.
"""
from pathlib import Path
import json
import sys
import bpy

ROOT = Path(__file__).resolve().parents[2]
STAGING = ROOT / 'art-source/harbor-v2/_staging/island-surfaces'
sys.path.insert(0, str(ROOT / 'tools/harbor-v2/zones'))
from zone_kit import to_blender


def material(name):
    m = bpy.data.materials.new('RP03_' + name)
    m.use_nodes = True
    tree = m.node_tree
    bsdf = tree.nodes.get('Principled BSDF')
    folder = ROOT / 'tools/harbor-v2/textures' / ('asphalt_02' if name == 'asphalt' else 'concrete')
    textures = {}
    for key, filename in [('base', 'diffuse.jpg'), ('normal', 'normal.jpg'), ('orm', 'arm.jpg')]:
        image = bpy.data.images.load(str(folder / filename), check_existing=True)
        image.colorspace_settings.name = 'sRGB' if key == 'base' else 'Non-Color'
        image.pack()
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        textures[key] = tex
    tree.links.new(textures['base'].outputs['Color'], bsdf.inputs['Base Color'])
    normal = tree.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .25 if name == 'asphalt' else .18
    tree.links.new(textures['normal'].outputs['Color'], normal.inputs['Color'])
    tree.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    separate = tree.nodes.new('ShaderNodeSeparateColor')
    tree.links.new(textures['orm'].outputs['Color'], separate.inputs['Color'])
    tree.links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    bsdf.inputs['Metallic'].default_value = 0
    return m


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    lods = {}
    for lod in (0, 1):
        c = bpy.data.collections.new(f'RENDER_LOD{lod}')
        scene.collection.children.link(c)
        lods[lod] = c
    mats = {name: material(name) for name in ('asphalt', 'concrete', 'concrete_warm')}
    source = json.loads((STAGING / 'source.json').read_text())
    for entry in source['surfaces']:
        mesh = bpy.data.meshes.new(entry['name'])
        indices = entry['indices']
        mesh.from_pydata([to_blender(p) for p in entry['positions']], [], [indices[i:i+3] for i in range(0, len(indices), 3)])
        mesh.update()
        obj = bpy.data.objects.new(entry['name'], mesh)
        lods[int(entry['name'][-1])].objects.link(obj)
        mesh.materials.append(mats[entry['material']])
        for k, v in entry['extras'].items():
            obj[k] = v
        tile = 3.0 if entry['material'] == 'asphalt' else 2.5
        obj['surfaceTileMeters'] = tile
        obj['surfaceAuthoring'] = 'Blender RP03 metric UV'
        uv = mesh.uv_layers.new(name='UVMap')
        for face in mesh.polygons:
            axis = max(range(3), key=lambda i: abs(face.normal[i]))
            axes = ((1, 2), (0, 2), (0, 1))[axis]
            for li in face.loop_indices:
                p = mesh.vertices[mesh.loops[li].vertex_index].co
                uv.data[li].uv = (p[axes[0]] / tile, p[axes[1]] / tile)
    # Narrow recessed grate fixtures along the east service road: real bars,
    # shallow enough to remain on the existing road collider, joined to one draw.
    drainmat = bpy.data.materials.new('RP03_DRAIN_IRON')
    drainmat.use_nodes = True
    bsdf = drainmat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (.042, .051, .053, 1)
    bsdf.inputs['Metallic'].default_value = .5
    bsdf.inputs['Roughness'].default_value = .78
    for lod in (0, 1):
        parts = []
        for z in (-16, -3, 10, 31):
            for x in (24.9, 31.1):
                # Backplate plus end/cross bars, 2–8 mm above the existing tarmac.
                specs = [(x, .188, z, .34, .006, 1.15)]
                for sign in (-1, 1):
                    specs.append((x + sign*.17, .193, z, .023, .006, 1.18))
                for i in range(10 if lod == 0 else 5):
                    dz = -.53 + i*1.06/(9 if lod == 0 else 4)
                    specs.append((x, .196, z + dz, .34, .005, .025))
                for px, py, pz, sx, sy, sz in specs:
                    bpy.ops.mesh.primitive_cube_add(size=1, location=to_blender((px, py, pz)))
                    obj = bpy.context.object
                    obj.dimensions = (sx, sz, sy)
                    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
                    for c in list(obj.users_collection): c.objects.unlink(obj)
                    lods[lod].objects.link(obj)
                    obj.data.materials.append(drainmat)
                    parts.append(obj)
        bpy.ops.object.select_all(action='DESELECT')
        for obj in parts: obj.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()
        obj = bpy.context.object
        obj.name = f'MESH_ISLAND_DRAIN_GRATES_LOD{lod}'
        obj['harborZone'] = 'base'
        obj['castShadow'] = False
        obj['ignoreWeaponRaycast'] = True
    target = ROOT / 'art-source/harbor-v2/island/island-surfaces-rp03.blend'
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(target))
    bpy.ops.export_scene.gltf(filepath=str(STAGING / 'island-surfaces-candidate.glb'), export_format='GLB',
        export_extras=True, export_cameras=False, export_lights=False, export_yup=True, export_apply=True)
    # Both LODs export, but the editable source opens without overlapping surfaces.
    for obj in lods[1].objects: obj.hide_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(target))


if __name__ == '__main__': main()
