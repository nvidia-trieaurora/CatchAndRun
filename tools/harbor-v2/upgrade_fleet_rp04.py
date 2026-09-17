"""Fleet RP04: attached marine fittings, never a replacement collision hull.

Read the RP03 native source, preserve every original object, add one batched
High-only detail mesh per boat. No live Blender scene or production GLB writes.
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
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/harbor-v2/ferris-harbor/ferris-harbor-fleet-rp03.blend'
OUTPUT = SOURCE.with_name('ferris-harbor-fleet-rp04.blend')
STAGE = ROOT / 'art-source/harbor-v2/_staging/fleet-rp04'
sys.path[:0] = [str(ROOT/'tools/harbor-v2'), str(ROOT/'tools/harbor-v2/zones')]
import zone_kit as zk
import realism_pass as realism
from polish_harbor_fleet import scene_signature

K = zk.ZoneKit('FERRIS_HARBOR', 'ferris-harbor', 'ferris-pbr',
               dynamic_collections=('FERRIS_DYNAMIC','CABINS_DYNAMIC','BOATS_DYNAMIC'))
PALETTE = ['cab_teal','cab_brick','cab_mustard','cab_coral','cab_navy',
           'steel_black','rubber','rope','canvas_red','canvas_cream','canvas_green',
           'orange','white','crate','cable','brass','timber']
NEW = []
M = {}


def add(obj):
    NEW.append(obj)
    return obj


def box(name, lo, hi, color='steel_black', bevel=0):
    return add(K.box(name, tuple(hi[i]-lo[i] for i in range(3)),
                     tuple((hi[i]+lo[i])/2 for i in range(3)), M[color], bevel=bevel))


def bar(name, a, b, radius, color='steel_black', segments=6):
    a,b = Vector(a),Vector(b)
    d=b-a
    obj=K.cylinder(name,radius,d.length,tuple((a+b)/2),M[color],segments=segments)
    direction=Vector(zk.to_blender(d)).normalized()
    obj.rotation_euler=Vector((0,0,1)).rotation_difference(direction).to_euler()
    return add(obj)


def ring(name, center, radius, tube, color='rope', axis='y', segments=16):
    return add(K.torus(name,center,radius,tube,M[color],axis=axis,segments=segments,profile=5))


def label(name, text, center, normal, size, color='white'):
    data=bpy.data.curves.new(name,'FONT')
    data.body=text; data.size=size; data.align_x='CENTER'; data.align_y='CENTER'
    data.extrude=.001; data.resolution_u=2
    obj=bpy.data.objects.new(name,data); bpy.context.scene.collection.objects.link(obj)
    up=Vector((0,1,0)); n=Vector(normal); right=up.cross(n)
    basis=Matrix([zk.to_blender(right),zk.to_blender(up),zk.to_blender(n)]).transposed().to_4x4()
    basis.translation=Vector(zk.to_blender(center)); obj.matrix_world=basis
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    return add(K._finish(obj,M[color],'LOD0',None,0))


def window_frame(name, center, w, h, axis, side):
    """Frame and wiper overlay the existing sealed wheelhouse window, 18 mm deep.

    The wheelhouse is still a closed collision volume, not a fake enterable room.
    """
    x,y,z=center; t=.034; depth=.018
    if axis=='z':
        loz,hiz=sorted((z+side*.001,z+side*depth))
        for a,b in [((x-w/2-t,y-h/2-t,loz),(x-w/2,y+h/2+t,hiz)),
                    ((x+w/2,y-h/2-t,loz),(x+w/2+t,y+h/2+t,hiz)),
                    ((x-w/2,y-h/2-t,loz),(x+w/2,y-h/2,hiz)),
                    ((x-w/2,y+h/2,loz),(x+w/2,y+h/2+t,hiz))]:
            box(name+'_gasket',a,b,'rubber')
        bar(name+'_wiper',(x-w*.3,y-h*.48,z+side*.02),(x+w*.18,y+h*.28,z+side*.02),.009)
        # Small fasteners are attached to the gasket corners.
        for dx in (-w/2-t/2,w/2+t/2):
            for dy in (-h/2,h/2):
                bar(name+'_screw',(x+dx,y+dy,z+side*.018),(x+dx,y+dy,z+side*.023),.01,'white')
    else:
        lox,hix=sorted((x+side*.001,x+side*depth))
        for a,b in [((lox,y-h/2-t,z-w/2-t),(hix,y+h/2+t,z-w/2)),
                    ((lox,y-h/2-t,z+w/2),(hix,y+h/2+t,z+w/2+t)),
                    ((lox,y-h/2-t,z-w/2),(hix,y-h/2,z+w/2)),
                    ((lox,y+h/2,z-w/2),(hix,y+h/2+t,z+w/2))]:
            box(name+'_gasket',a,b,'rubber')
        bar(name+'_wiper',(x+side*.02,y-h*.48,z-w*.3),(x+side*.02,y+h*.28,z+w*.18),.009)


def crate_fittings(name, center, size, angle=0):
    """Plank joints/steel bands hug an existing cargo box, not new deck clutter."""
    start=len(NEW); x,y,z=center; w,h,d=size; inset=.018
    for side in (-1,1):
        zface=z+side*d/2
        loz,hiz=sorted((zface-side*.004,zface+side*inset))
        for dx in (-w*.38,w*.38):
            box(name+'_strap',(x+dx-.025,y-h/2+.015,loz),(x+dx+.025,y+h/2-.015,hiz),'steel_black')
        for dy in (-h*.35,h*.35):
            box(name+'_batten',(x-w/2+.015,y+dy-.032,loz),(x+w/2-.015,y+dy+.032,hiz),'timber',.004)
        for j in range(1,5):
            dx=-w/2+w*j/5
            box(name+'_joint',(x+dx-.002,y-h*.31,loz),(x+dx+.002,y+h*.31,hiz),'timber')
        for dx in (-w*.38,w*.38):
            for dy in (-h*.35,h*.35):
                bar(name+'_bolt',(x+dx,y+dy,zface+side*.018),(x+dx,y+dy,zface+side*.023),.014,'brass')
    for side in (-1,1):
        xface=x+side*w/2; lox,hix=sorted((xface-side*.004,xface+side*inset))
        for dy in (-h*.35,h*.35):
            box(name+'_end_batten',(lox,y+dy-.032,z-d/2+.015),(hix,y+dy+.032,z+d/2-.015),'timber',.004)
    for dx in (-w*.38,w*.38):
        box(name+'_top_band',(x+dx-.025,y+h/2-.004,z-d/2+.015),(x+dx+.025,y+h/2+.012,z+d/2-.015))
    if angle:
        # Newly-created boxes have deferred depsgraph transforms. Reading their
        # matrix_world before this update would rotate identity at world origin.
        bpy.context.view_layer.update()
        pivot=Vector(zk.to_blender(center))
        transform=Matrix.Translation(pivot)@Matrix.Rotation(angle,4,'Z')@Matrix.Translation(-pivot)
        for obj in NEW[start:]: obj.matrix_world=transform@obj.matrix_world


def cabin_seams(name, x0,x1,deck,roof,z0,z1):
    for z in (z0-.003,z1+.003):
        for x in (x0+.10,x1-.10):
            box(name+'_corner',(x-.012,deck+.05,z-.004),(x+.012,roof-.08,z+.004),'timber')
        box(name+'_drip_rail',(x0+.08,roof-.12,z-.008),(x1-.08,roof-.095,z+.008),'white')
    # Bolted roof flange and mast shoe give existing spars a real connection.
    for x in (x0+.15,x1-.15):
        for z in (z0+.08,z1-.08):
            bar(name+'_roof_bolt',(x,roof+.10,z),(x,roof+.12,z),.018,'brass')


def workboat():
    deck=-.08; x0,x1=3.8,6.4; cz=49.9
    for side in (-1,1):
        for k,x in enumerate((4.5,5.2,5.9)):
            window_frame(f'wb_s{side}_{k}',(x,deck+1.5,cz+side*1.105),.5,.55,'z',side)
        box('wb_identity',(4.15,.49,cz+side*1.106-.006),(6.03,.73,cz+side*1.106+.006),'steel_black',.006)
        label('wb_identity','HARBOR  07',(5.09,.61,cz+side*1.119),(0,0,side),.17)
    for k,z in enumerate((-.75,-.25,.25,.75)):
        window_frame(f'wb_f{k}',(x0-.005,deck+1.55,cz+z),.42,.6,'x',-1)
    cabin_seams('wb',x0,x1,deck,deck+2.1,cz-1.1,cz+1.1)
    # Door hinges/latch remain on the existing sealed aft door.
    for y in (.24,1.29):
        box('wb_hinge',(6.42,y,50.70),(6.444,y+.1,50.78),'brass',.004)
    bar('wb_handle',(6.447,.87,50.17),(6.447,.87,50.32),.015,'white')
    box('wb_mast_shoe',(4.85,2.10,49.75),(5.15,2.15,50.05),'steel_black',.01)
    for dz in (-.34,-.28,-.22,-.16,-.10,-.04,.02,.08,.14,.20,.26,.32):
        ring('wb_winch_rope',(8.4,deck+.45,cz+dz),.328,.017,axis='z')
    crate_fittings('wb_crate',(10.2,deck+.4,cz),(1.2,.8,1.2))
    for x in (3.,11.2):
        # Cleat bars already exist. Feet physically connect them to the deck.
        for dx in (-.11,.11):
            box('wb_cleat_foot',(x+dx-.026,deck,48.56),(x+dx+.026,deck+.405,48.64))
        box('wb_cleat_plate',(x-.26,deck-.005,48.48),(x+.26,deck+.012,48.72),'white')


def launch():
    deck=-.23; x0,x1=-7.1,-5.4; cz=49.4
    for k,z in enumerate((-.45,0,.45)):
        window_frame(f'ln_f{k}',(x0-.005,deck+1.3,cz+z),.38,.5,'x',-1)
    for side in (-1,1):
        window_frame('ln_side',(-6.25,deck+1.3,cz+side*.855),.9,.5,'z',side)
        label('ln_identity','TIDE  03',(-6.25,.37,cz+side*.866),(0,0,side),.16,'steel_black')
    cabin_seams('ln',x0,x1,deck,deck+1.75,cz-.85,cz+.85)
    for k,(dx,dz) in enumerate(((-2.4,-.45),(-2.4,.3),(-1.8,.45))):
        crate_fittings('ln_crate',(-8+dx,deck+.15,cz+dz),(.55,.3,.4),.1*k)
    for y in (deck+.12,deck+.62):
        ring('ln_drum_hoop',(-5.,y,50.),.283,.014,'white')


def skiff(cx,cz,bow):
    # Oar blades coincide with the original spars, placed above the bench tops.
    for a,b in [((cx+.85,-.425,cz+.12),(cx+1.22,-.425,cz+.2)),
                ((cx+1.05,-.405,cz-.03),(cx+1.42,-.405,cz-.11))]:
        bar('skiff_oar_blade',a,b,.065,'timber',segments=6)
    # Rowlock sockets on the gunwale; tiny fittings, no new walkable volume.
    for side in (-1,1):
        # The tapered stern rail does not reach z +/- .59; those sockets
        # floated 10.7 cm. The two skiffs face opposite directions.
        for x in (cx+(-.9 if bow<0 else .8),):
            ring('skiff_rowlock',(x,-.30,cz+side*.59),.042,.012,'brass',axis='x',segments=10)
    for x in (cx-1,cx+.2,cx+1.3):
        for z in (cz-.48,cz+.48):
            bar('skiff_bench_screw',(x,-.47,z),(x,-.462,z),.014,'white')
    # Rope on the existing bow coil, not a free-standing item in the footwell.
    # Radius .12 lay inside the inherited coil's hole, above the floor.
    for r in (.17,.22): ring('skiff_rope', (cx+bow*1.5,-.68,cz),r,.012)


def barge():
    for k,(dx,dz,w,d,h) in enumerate(((-4.,-.9,1.6,1.2,1.),(-4.2,1.,1.2,1.,.8),(3.8,0.,1.8,1.6,1.2),(-1.5,1.6,1.,.7,.7))):
        crate_fittings('bg_cargo',(3+dx,-.06+h/2,57.5+dz),(w,h,d),.04*k)
    for x,z in ((4.,55.7),(4.7,55.6)):
        for y in (.12,.62): ring('bg_drum_hoop',(x,y,z),.304,.017,'white')
    # Secured shallow rope coils sit on existing cargo/hatch, not walking lanes.
    for r in (.15,.20,.25): ring('bg_cargo_rope',(-1.,.955,56.6),r,.014)


def finish_boat(boat_name, build):
    NEW.clear(); build(); bpy.context.view_layer.update()
    originals=[o for o in bpy.data.objects['RIG_FERRIS_HARBOR_BOAT_'+boat_name].children
               if o.type=='MESH' and o.name.endswith('_LOD0')]
    points=[o.matrix_world@v.co for o in originals for v in o.data.vertices]
    lo=[min(p[i] for p in points)-.12 for i in range(3)]
    hi=[max(p[i] for p in points)+.12 for i in range(3)]
    original_bvh=realism.world_bvh(originals)
    contacts=[]
    for obj in NEW:
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co
            if any(p[i]<lo[i] or p[i]>hi[i] for i in range(3)):
                raise RuntimeError(f'Detail escaped original boat envelope: {boat_name}/{obj.name}: {tuple(p)}')
        if 'skiff_rowlock' in obj.name or 'skiff_rope' in obj.name:
            clearance=min(original_bvh.find_nearest(obj.matrix_world@v.co)[3] for v in obj.data.vertices)
            if clearance>.015:
                raise RuntimeError(f'Unsupported fitting: {boat_name}/{obj.name}: {clearance:.6f} m')
            contacts.append({'part':obj.name,'nearestOriginalSurfaceMeters':clearance})
    # New parts are still unparented while baking; only this boat casts local
    # contact shade, so a moving boat never receives baked shadows from the dock.
    for obj in NEW: realism.ensure_col(obj.data)
    realism.bake_contact(NEW,realism.world_bvh(originals+NEW),8)
    bm=bmesh.new(); deps=bpy.context.evaluated_depsgraph_get()
    for obj in NEW:
        mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
        mesh.transform(obj.matrix_world); bm.from_mesh(mesh); bpy.data.meshes.remove(mesh)
    name=f'MESH_FERRIS_HARBOR_RP04_{boat_name}_FITTINGS_LOD0'
    mesh=bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
    target=bpy.data.objects.new(name,mesh); bpy.context.scene.collection.objects.link(target)
    # Pass the material itself to avoid overwriting the per-part palette UVs.
    K._finish(target,bpy.data.materials['MAT_PALETTE'],'LOD0',
              {'repairPass':'RP04','boatDetailOnly':True,'castShadow':False,'uvLocked':True},0)
    root=bpy.data.objects['RIG_FERRIS_HARBOR_BOAT_'+boat_name]
    K.attach(target,root,'BOATS_DYNAMIC')
    count=len(NEW)
    for obj in NEW: bpy.data.objects.remove(obj,do_unlink=True)
    mesh.calc_loop_triangles(); NEW.clear()
    return {'boat':boat_name,'parts':count,'triangles':len(mesh.loop_triangles),'batch':name,'contactChecks':contacts}


def main():
    STAGE.mkdir(parents=True,exist_ok=True)
    source_sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE)); K.bind_existing_scene(); bpy.context.view_layer.update()
    original=scene_signature()
    for i,color in enumerate(PALETTE):
        M[color]=zk.PaletteSwatch(bpy.data.materials['MAT_PALETTE'],(i%5+.5)/5,(i//5+.5)/5,color)
    results=[finish_boat('WORKBOAT',workboat),finish_boat('LAUNCH',launch),
             finish_boat('SKIFF_RED',lambda:skiff(-15.,48.6,-1)),
             finish_boat('SKIFF_GREEN',lambda:skiff(18.,48.7,1)),finish_boat('BARGE',barge)]
    bpy.context.view_layer.update(); after=scene_signature()
    changed=[name for name,data in original.items() if after.get(name)!=data]
    if changed: raise RuntimeError('Original geometry/rig/collider modified: '+','.join(changed))
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest()!=source_sha: raise RuntimeError('Source overwritten')
    bpy.context.scene['fleetDetailPass']='RP04: sealed wheelhouse joinery, cargo hardware, rig-attached fittings'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    sys.argv=['export','--','--output',str(STAGE/'ferris-harbor-candidate.glb')]
    runpy.run_path(str(ROOT/'tools/harbor-v2/export_zone_scene.py'),run_name='__main__')
    report={'source':str(SOURCE.relative_to(ROOT)),'sourceSHA256':source_sha,'sourcePreserved':True,
            'output':str(OUTPUT.relative_to(ROOT)),'originalObjectsUnchanged':len(original),
            'addedDrawsHigh':5,'addedDrawsLow':0,'newTextures':0,'boats':results,
            'scope':'Cosmetic fittings only; original sealed wheelhouses/decks/cargo and their colliders remain authoritative.'}
    (STAGE/'authoring-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('FLEET_RP04='+json.dumps(report))


if __name__=='__main__': main()
