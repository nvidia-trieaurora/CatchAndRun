"""Approved Market art pass: native Blender, unchanged gameplay volumes.

Run prepare_market_rp04.mjs first, then Blender --background --python this.py.
Reads RP03, saves a sibling RP04 blend and staging GLB. Never promotes production.
Outside-market geometry, UVs, colours and material bindings are hash protected.
"""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path
import runpy
import sys
import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / 'tools/harbor-v2'), str(ROOT / 'tools/harbor-v2/zones')]
import upgrade_harbor_market as base
import realism_pass as realism
import zone_kit as zk

SOURCE = ROOT / 'art-source/harbor-v2/container-bd/container-bd-market-rp03.blend'
OUTPUT = SOURCE.with_name('container-bd-market-rp04.blend')
STAGING = ROOT / 'art-source/harbor-v2/_staging/market-rp04'
TEX = ROOT / 'tools/harbor-v2/textures/market-rp04/_derived'
K, NEW = base.K, base.NEW


def outside_signature():
    rows = []
    for obj in realism.render_meshes():
        if obj in NEW:
            continue
        uv = obj.data.uv_layers.active
        col = obj.data.color_attributes.get('Col')
        for face in obj.data.polygons:
            points = [zk.to_three(obj.matrix_world @ obj.data.vertices[i].co) for i in face.vertices]
            if base.inside(points, base.SHOP):
                continue
            mat = obj.material_slots[face.material_index].material
            rows.append((obj.name, tuple(round(v, 6) for p in points for v in p), mat.name,
                         tuple(round(v, 6) for li in face.loop_indices for v in uv.data[li].uv) if uv else (),
                         tuple(round(v, 6) for li in face.loop_indices for v in col.data[li].color) if col else ()))
    return hashlib.sha256(repr(sorted(rows)).encode()).hexdigest(), len(rows)


def project_face(obj, face, tile, timber=False):
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    n = obj.matrix_world.to_3x3() @ face.normal
    axis = max(range(3), key=lambda i: abs(n[i]))
    for li in face.loop_indices:
        p = obj.matrix_world @ obj.data.vertices[obj.data.loops[li].vertex_index].co
        # Blender Y = -Three Z. Wood grain follows the vertical V axis.
        uv.data[li].uv = ((p.y if axis == 0 else p.x) / tile, (p.y if axis == 2 else p.z) / tile)


def upgrade_surfaces():
    mats = {name: K.pbr('MAT_MARKET_RP04_' + name.upper(), name, pack='market-rp04', normal_strength=.4, vertex_tint=True)
            for name in ('limestone', 'plaster', 'oak')}
    for mat in mats.values():
        # The procedural authoring helper's generic property must not misattribute these textures.
        if 'polyhavenSource' in mat:
            del mat['polyhavenSource']
        mat['artSource'] = 'Original CatchAndRun RP04 procedural material'
    counts = {}
    ceiling_vertices = {}
    for obj in list(realism.render_meshes()):
        if obj.parent or obj.get('ambientMotion') or obj.get('instanceKey'):
            continue
        mesh = obj.data
        uv = mesh.uv_layers.active
        if not uv:
            continue
        for face in mesh.polygons:
            if obj.material_slots[face.material_index].material.name != 'MAT_BD_PALETTE':
                continue
            points = [zk.to_three(obj.matrix_world @ mesh.vertices[i].co) for i in face.vertices]
            if not base.inside(points, base.SHOP):
                continue
            coord = uv.data[face.loop_start].uv
            idx = min(6, max(0, int(coord.y*7))) * 7 + min(6, max(0, int(coord.x*7)))
            semantic = base.PALETTE[idx] if idx < len(base.PALETTE) else ''
            if semantic == 'ceiling':
                # A 12 mm recessed panel lets the T-grid and real slotted vents
                # sit on the existing physical underside without coplanar faces.
                ceiling_vertices.setdefault(obj, set()).update(face.vertices)
            name = {'floor':'limestone', 'ceiling':'plaster', 'wall_cream':'plaster', 'timber':'oak', 'counter':'oak'}.get(semantic)
            # Existing floor joints are geometry, not an added coplanar decal.
            is_grout = semantic == 'trim' and all(.249 <= p[1] <= .255 for p in points)
            if not name and not is_grout:
                continue
            if is_grout:
                # Reuse a neutral palette cell instead of another material draw.
                grey = base.PALETTE.index('grey')
                for li in face.loop_indices:
                    uv.data[li].uv = ((grey % 7 + .5)/7, (grey // 7 + .5)/7)
                continue
            mat = mats[name]
            if mat.name not in mesh.materials:
                mesh.materials.append(mat)
            face.material_index = mesh.materials.find(mat.name)
            if name:
                project_face(obj, face, 2.4 if name == 'limestone' else 1.2, name == 'oak')
            counts[mat.name] = counts.get(mat.name, 0) + 1
    for obj, indices in ceiling_vertices.items():
        inverse = obj.matrix_world.inverted()
        for index in indices:
            point = obj.matrix_world @ obj.data.vertices[index].co
            if abs(point.z - 4.2) < .0001:
                point.z = 4.212
                obj.data.vertices[index].co = inverse @ point
    if counts.get('MAT_MARKET_RP04_LIMESTONE', 0) < 6 or counts.get('MAT_MARKET_RP04_PLASTER', 0) < 20:
        raise RuntimeError('Expected original palette-mapped market floor/walls not found')
    product = bpy.data.materials['MAT_PRODUCT_ATLAS']
    for obj in realism.render_meshes():
        if any(s.material == product for s in obj.material_slots) and not base.inside([zk.to_three(obj.matrix_world @ v.co) for v in obj.data.vertices], base.SHOP):
            raise RuntimeError('Product atlas unexpectedly shared outside market')
    replaced = 0
    for node in product.node_tree.nodes:
        if node.type == 'TEX_IMAGE' and node.image and 'product_atlas_base' in node.image.name:
            node.image = bpy.data.images.load(str(TEX / 'product_atlas_base.png'), check_existing=True)
            node.interpolation = 'Linear'
            replaced += 1
    if replaced != 1:
        raise RuntimeError('Product atlas base colour not found')
    return mats, counts


def split_material_batches():
    """One draw/material/LOD, while preserving original outside-mesh identity.

    Split only newly retextured shop faces out of the shared yard palette mesh.
    New detail is subsequently batched into these same material meshes.
    """
    for obj in list(realism.render_meshes()):
        materials = list(obj.data.materials)
        if len(materials) < 2:
            continue
        if materials[0].name != 'MAT_BD_PALETTE':
            raise RuntimeError('Unexpected multi-material source batch')
        lod = obj.get('zoneLod')
        for index, mat in enumerate(materials[1:],1):
            bm = bmesh.new(); bm.from_mesh(obj.data)
            bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index != index],context='FACES')
            bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
            for face in bm.faces:
                face.material_index = 0
            name = f'MESH_CONTAINER_BD_RP04_{mat.name.removeprefix("MAT_")}_{lod}'
            mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
            child = bpy.data.objects.new(name,mesh); bpy.context.scene.collection.objects.link(child)
            child.matrix_world = obj.matrix_world.copy()
            K._finish(child,mat,lod,{'repairPass':'RP04'},0)
        bm = bmesh.new(); bm.from_mesh(obj.data)
        bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index != 0],context='FACES')
        bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
        bm.to_mesh(obj.data); bm.free()
        obj.data.materials.clear(); obj.data.materials.append(materials[0])


def architecture(mats, lod):
    M = base.materials()
    white = M['white']
    metal = M['steel']
    # Wall mounted identity and department names have a physical backboard.
    base.box('rp04_cold_backboard', (43.25,2.78,-42.755),(51.45,3.8,-42.70),M['navy'],lod,bevel=.016)
    base.label('rp04_interior_wordmark','HARBOR  MARKET',(47.35,3.40,-42.688),.43,7.2,M['white'],lod)
    base.label('rp04_interior_subtitle','COLD DRINKS   /   DAILY PROVISIONS',(47.35,3.04,-42.688),.13,6.8,M['paint_white'],lod)
    # Backboard standoffs connect to the lined wall, not floating in the aisle.
    for x in (43.35,47.3,51.3):
        base.box('rp04_sign_standoff',(x,2.87,-42.79),(x+.045,3.7,-42.72),metal,lod)
    # Shallow ceramic skirting at the base of the existing wall lining.
    for lo,hi in [((43.02,.255,-42.765),(51.7,.39,-42.75)),((51.745,.255,-42.7),(51.76,.39,-33.3))]:
        base.box('rp04_skirting',lo,hi,white,lod)
    # Ceiling T-grid and supply grilles remain outside the hatch and head volume.
    for x in (39.4,41.8,44.2,46.6,49.0,51.4):
        base.box('rp04_ceiling_tee',(x,4.2,-42.7),(x+.018,4.223,-33.25),white,lod)
    for z in (-42,-40.8,-39.6,-38.4,-37.2,-36,-34.8,-33.6):
        base.box('rp04_ceiling_tee',(39.4,4.2,z),(51.75,4.223,z+.018),white,lod)
    if lod == 'LOD0':
        for x,z in ((43.4,-38.4),(47.6,-40.5),(47.6,-34.8)):
            # Four frame rails and separated blades, not a solid overlaid box.
            for lo, hi in [((x-.26,4.2,z-.22),(x-.225,4.232,z+.22)),
                           ((x+.225,4.2,z-.22),(x+.26,4.232,z+.22)),
                           ((x-.225,4.2,z-.22),(x+.225,4.232,z-.185)),
                           ((x-.225,4.2,z+.185),(x+.225,4.232,z+.22))]:
                base.box('rp04_vent_frame',lo,hi,white,lod)
            base.box('rp04_vent_recess',(x-.225,4.210,z-.185),(x+.225,4.22,z+.185),M['navy'],lod)
            for j in range(7):
                base.box('rp04_vent_louvre',(x-.22,4.2,z-.16+j*.05),(x+.22,4.208,z-.147+j*.05),metal,lod)
        # Timber produce slats are behind existing fixture volume and attached to lining.
        for j in range(29):
            z=-39.55+j*.17
            base.box('rp04_produce_wall_batten',(38.242,1.43,z),(38.27,2.22,z+.075),mats['oak'],lod,bevel=.003)
        # Recessed shelf edging inserts: texture-free, batched, within shelf boundary.
        for x in (41.205,42.177,45.605,46.577):
            for z in (-38.5,-37.55,-36.6,-35.65):
                for y in (.80,1.20,1.56):
                    base.box('rp04_price_ticket',(x,y,z),(x+.014,y+.047,z+.14),M['paint_white'],lod)
        # Checkout timber board joints are thin insets inside the counter footprint.
        for y in (.40,.58,.76,.94):
            base.box('rp04_counter_reveal',(49.688,y,-37.5),(49.7,y+.012,-34.5),metal,lod)
    # Grouping is the same on Low; no new full-height volume or physical obstruction.


def main():
    STAGING.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    K.bind_existing_scene()
    bpy.context.view_layer.update()
    protected, outside = realism.protected_signature(), outside_signature()
    mats, counts = upgrade_surfaces()
    split_material_batches()
    for lod in ('LOD0','LOD1'):
        architecture(mats,lod)
    for obj in NEW:
        obj['repairPass']='RP04'
        obj['castShadow']=False
    if outside_signature() != outside:
        raise RuntimeError('Outside-market geometry/UV/colour/material changed before batching')
    # Existing helper bakes local contact and batches new objects by material.
    base.finish_new()
    bpy.context.view_layer.update()
    if realism.protected_signature() != protected:
        raise RuntimeError('Gameplay collision/rig/reference changed')
    if outside_signature() != outside:
        raise RuntimeError('Outside-market geometry/UV/colour/material changed during batching')
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != source_hash:
        raise RuntimeError('Source blend was modified')
    bpy.context.scene['harborMarketArtPass']='RP04: approved material/packaging/ceiling pass, unchanged gameplay volumes'
    bpy.context.scene['harborMarketRP04SourceSHA256']=source_hash
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    sys.argv=['export','--','--output',str(STAGING/'container-bd-candidate.glb')]
    runpy.run_path(str(ROOT/'tools/harbor-v2/export_zone_scene.py'),run_name='__main__')
    report={'source':str(SOURCE.relative_to(ROOT)),'sourceSHA256':source_hash,'blend':str(OUTPUT.relative_to(ROOT)),
            'sourcePreserved':True,'protectedNodesUnchanged':len(protected),'outsideFaceCount':outside[1],
            'outsideRenderSHA256':outside[0],'retexturedFaces':counts,'newColliders':0,
            'conceptReferences':['02-market-exterior.png','03-market-interior.png'],
            'limitations':['Native scene is not the same lighting renderer as Three.js; browser review remains mandatory.']}
    (STAGING/'authoring-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('MARKET_RP04='+json.dumps(report))


if __name__ == '__main__':
    main()
