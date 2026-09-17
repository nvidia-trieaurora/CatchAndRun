"""Native Blender rescue maintenance quay, with matching simplified movement boxes.

Run Blender --background --python this_file [-- --render]. Authoring stays in
Three.js metres. Existing watchtower legs/platform/ladder retain their positions.
"""
from pathlib import Path
import json
import math
import runpy
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).parent))
import zone_kit as zk

K = zk.ZoneKit("RESCUE_QUAY", "rescue-quay", "container-bd-pbr")
COLLIDERS = []


def box(name, size, pos, mat, lod, collision=False, bevel=0.015):
    obj = K.box(name, size, pos, mat, lod=lod, bevel=bevel if lod == "LOD0" else 0)
    if collision and lod == "LOD0":
        lo = tuple(p - s / 2 for p, s in zip(pos, size))
        hi = tuple(p + s / 2 for p, s in zip(pos, size))
        key = f"{name}_{len(COLLIDERS):02}"
        K.collider(key, lo, hi)
        COLLIDERS.append({"name": key, "min": lo, "max": hi})
    return obj


def tube(name, a, b, radius, mat, lod):
    a, b = Vector(a), Vector(b)
    obj = K.cylinder(name, radius, (b-a).length, tuple((a+b)/2), mat,
                     segments=24 if lod == "LOD0" else 8, lod=lod)
    for poly in obj.data.polygons:
        poly.use_smooth = abs(poly.normal.z) < .8
    obj.rotation_euler = Vector((0, 0, 1)).rotation_difference(Vector(zk.to_blender(b-a))).to_euler()
    return obj


def text(name, words, pos, size, mat, lod, ground=False):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = words
    curve.align_x = "CENTER"
    curve.size = size
    curve.extrude = 0.002
    curve.resolution_u = 3
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = zk.to_blender(pos)
    if not ground:
        obj.rotation_euler = (math.pi / 2, 0, 0)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    K._finish(obj, mat, lod, {"castShadow": False}, 0)


def build(lod, M):
    # Low relief slab avoids changing ground navigation; modular seams and drainage.
    box("apron", (27, .24, 22), (46.5, .12, 23), M["concrete"], lod, True, bevel=0)
    for x in (33, 39, 45, 51, 57, 60):
        box("expansion", (.025, .004, 22), (x, .242, 23), M["dark"], lod, bevel=0)
    for z in (12, 18, 24, 30, 34):
        box("expansion", (27, .004, .025), (46.5, .242, z), M["dark"], lod, bevel=0)
    for z in (13.2, 25):
        box("bay_line", (9, .008, .09), (54.5, .25, z), M["white"], lod, bevel=0)
    for x in (50, 59):
        box("bay_line", (.09, .008, 11.8), (x, .25, 19.1), M["yellow"], lod, bevel=0)
    box("drain", (.3, .009, 18), (60, .25, 23), M["dark"], lod, bevel=0)
    if lod == "LOD0":
        for i in range(72):
            box("drain_bar", (.32, .015, .035), (60, .26, 14+i*.25), M["steel"], lod, bevel=0)
    text("apron_paint", "RESCUE  /  02", (54.5, .255, 15.8), .62, M["white"], lod, True)

    # Existing climbable watchtower re-skinned as a port rescue lookout.
    for dx in (-1.5, 1.5):
        for dz in (-1.5, 1.5):
            box("tower_leg", (.25, 6, .25), (40+dx, 3, 30+dz), M["steel"], lod)
            box("tower_foot", (.6, .1, .6), (40+dx, .29, 30+dz), M["concrete"], lod)
    box("tower_deck", (4, .15, 4), (40, 6, 30), M["steel"], lod)
    for z in (28, 32):
        box("tower_guard", (4, 1, .12), (40, 6.6, z), M["teal"], lod)
    box("tower_guard", (.12, 1, 4), (38, 6.6, 30), M["teal"], lod)
    # East side leaves the existing ladder entry open.
    for z in (28.5, 31.5):
        box("tower_entry_guard", (.12, 1, 1), (42, 6.6, z), M["teal"], lod, True)
    for x in (38.1, 41.9):
        for z in (28.1, 31.9):
            box("tower_cabin_post", (.12, 1.4, .12), (x, 7.4, z), M["steel"], lod, True)
    box("tower_roof", (4.6, .16, 4.6), (40, 8.14, 30), M["steel"], lod, True)
    for z in (27.8, 32.2):
        box("roof_fascia", (4.6, .22, .08), (40, 8.03, z), M["orange"], lod)
    for i in range(15):
        box("ladder_rung", (.6, .04, .04), (41.8, .2+i*.4, 30), M["yellow"], lod)
    for z in (29.72, 30.28):
        tube("ladder_stile", (41.8, .1, z), (41.8, 7.1, z), .035, M["steel"], lod)
    text("tower_sign", "PORT RESCUE", (40, 6.42, 32.07), .3, M["white"], lod)
    tube("aerial", (39, 8.22, 30), (39, 10.2, 30), .024, M["steel"], lod)
    for h in (8.8, 9.4):
        tube("aerial_cross", (38.65,h,30),(39.35,h,30),.012,M["steel"],lod)

    # Open rescue craft workshop. Walkway along x43..49 stays unobstructed.
    for x in (50.2, 58.8):
        for z in (17, 23.8):
            box("workshop_post", (.18, 3.7, .18), (x, 1.95, z), M["steel"], lod, True)
            box("workshop_baseplate", (.42,.1,.42), (x,.29,z), M["steel"], lod)
    box("workshop_roof", (9.4,.16,7.6), (54.5,3.88,20.4), M["teal"], lod, True)
    box("workshop_back", (8.6,2.7,.15), (54.5,1.45,23.8), M["teal"], lod, True)
    for z in (16.65,24.15):
        box("workshop_fascia", (9.4,.32,.1),(54.5,3.78,z),M["steel"],lod)
    for x in (50.2,58.8):
        for z, dz in ((17,1),(23.8,-1)):
            tube("knee_brace",(x,2.8,z),(x,3.78,z+dz*.8),.045,M["steel"],lod)
    if lod == "LOD0":
        for i in range(38):
            box("roof_seam", (.035,.035,7.6),(49.86+i*.25,3.977,20.4),M["steel"],lod,bevel=0)
        for i in range(34):
            box("back_rib", (.045,2.7,.045),(50.35+i*.25,1.45,23.69),M["steel"],lod,bevel=0)
    text("workshop_sign","MARINE RESCUE  /  SERVICE BAY",(54.5,3.64,24.22),.31,M["white"],lod)
    for x in (51.2,57.8):
        box("light_housing",(1.1,.12,.25),(x,3.72,20),M["steel"],lod)
        box("LIGHT_strip",(.92,.02,.15),(x,3.648,20),M["light"],lod,bevel=0)
    # Cabinets and workbench have corresponding movement volumes.
    for x in (51,52.05):
        box("locker",(.85,1.9,.6),(x,1.05,23.36),M["orange"],lod,True,bevel=.035)
        box("locker_handle",(.035,.22,.06),(x+.26,1.1,23.03),M["steel"],lod)
        for h in (1.6,1.68,1.76):
            box("locker_louvre",(.6,.025,.03),(x,h,23.04),M["dark"],lod,bevel=0)
    box("bench",(3.4,.9,.7),(56.7,.55,23.3),M["steel"],lod,True)
    box("bench_top",(3.5,.06,.8),(56.7,1.03,23.3),M["wood"],lod)
    for x in (55.4,57):
        box("tool_case",(.65,.25,.36),(x,1.18,23.2),M["orange"],lod)

    # Rigid inflatable rescue craft on a steel maintenance cradle, no floating parts.
    for z in (18.4,21.7):
        box("cradle",(2.5,.3,.25),(54.5,.25,z),M["steel"],lod,True)
        for x in (53.65,55.35):
            box("cradle_pad",(.22,.45,.3),(x,.51,z),M["dark"],lod)
    verts=[(53.7,.55,18),(55.3,.55,18),(55.15,.55,21.7),(54.5,.55,22.4),(53.85,.55,21.7),
           (53.45,.88,18),(55.55,.88,18),(55.4,.88,21.7),(54.5,.88,22.7),(53.6,.88,21.7)]
    K.mesh("rib_hull",verts,[(4,3,2,1,0),(5,6,7,8,9),(0,1,6,5),(1,2,7,6),(2,3,8,7),(3,4,9,8),(4,0,5,9)],M["steel"],lod=lod)
    box("rib_deck",(1.45,.12,3.35),(54.5,.92,19.75),M["dark"],lod,True)
    for x in (53.45,55.55):
        tube("inflatable_sponson",(x,1.12,18),(x,1.12,21.5),.29,M["orange"],lod)
        tube("inflatable_bow",(x,1.12,21.5),(54.5,1.12,22.45),.29,M["orange"],lod)
        tube("grab_rope",(x,1.43,18.3),(x,1.43,21.3),.02,M["dark"],lod)
        if lod == "LOD0":
            for z in (18.5,19.5,20.5):
                K.torus("tube_band",(x,1.12,z),.294,.018,M["dark"],segments=12,profile=4,axis="z",lod=lod)
    box("helm",(.55,.65,.5),(54.5,1.3,20.5),M["white"],lod,True)
    K.torus("steering_wheel",(54.5,1.53,20.19),.19,.025,M["dark"],segments=24 if lod=="LOD0" else 12,profile=6,axis="z",lod=lod)
    for angle in (0,2.094,4.189):
        tube("wheel_spoke",(54.5,1.53,20.19),(54.5+.17*math.cos(angle),1.53+.17*math.sin(angle),20.19),.012,M["steel"],lod)
    box("helm_screen",(.32,.18,.04),(54.5,1.65,20.23),M["dark"],lod)
    box("seat",(.7,.3,.5),(54.5,1.2,19.3),M["dark"],lod)
    box("outboard",(.5,.9,.55),(54.5,.78,17.7),M["dark"],lod,True,bevel=.08)
    box("motor_trim",(.52,.04,.58),(54.5,.95,17.7),M["white"],lod)
    text("motor_lettering","R02",(54.5,.99,17.411),.12,M["white"],lod)
    tube("prop_shaft",(54.5,.35,17.7),(54.5,.35,17.4),.07,M["steel"],lod)
    for x in (53.4,55.6):
        if lod == "LOD0":
            K.collider("rib_tube_"+str(x),(x-.29,.6,18),(x+.29,1.41,21.6))
    # Low mooring equipment rack; heavy equipment is clear of the main lane.
    for x in (34.2,36.8):
        box("rack_post",(.1,1.5,.1),(x,.85,20),M["steel"],lod,True)
    box("rack_rail",(2.7,.1,.1),(35.5,1.6,20),M["steel"],lod,True)
    for x in (34.6,35.5,36.4):
        K.torus("lifebuoy",(x,1.05,20.02),.35,.07,M["orange"],segments=24 if lod=="LOD0" else 12,profile=6,axis="z",lod=lod)
    for x in (34,37):
        box("mooring_bollard_base",(.7,.12,.7),(x,.3,16),M["concrete"],lod)
        box("mooring_bollard",(.26,.7,.26),(x,.5,16),M["steel"],lod,True)
        tube("bollard_horn",(x-.3,.75,16),(x+.3,.75,16),.085,M["steel"],lod)


def main():
    K.new_scene("Harbor_Rescue_Quay_Authoring")
    M={"steel":K.pbr("MAT_RQ_STEEL","steel_dark",normal_strength=.45),
       "concrete":K.pbr("MAT_RQ_CONCRETE","concrete_yard",normal_strength=.35),
       "wood":K.pbr("MAT_RQ_WOOD","wood_weathered",pack="garden-pbr",normal_strength=.4)}
    sheet=K.pbr("MAT_RQ_SHEET","container_neutral",vertex_tint=True,normal_strength=.4)
    M["teal"]=zk.TintedMaterial(sheet,(.14,.27,.29),"rescue_teal",grime=(.1,1,.72))
    M["orange"]=K.simple("MAT_RQ_ORANGE",(.65,.19,.055),.65,.1)
    M["white"]=K.simple("MAT_RQ_SIGN",(.82,.79,.67),.8)
    M["yellow"]=K.simple("MAT_RQ_SAFETY",(.65,.44,.09),.7)
    M["dark"]=K.simple("MAT_RQ_RUBBER",(.022,.028,.03),.83)
    M["light"]=K.simple("MAT_RQ_LIGHT",(.9,.86,.72),.5,emissive=(1,.86,.65),emissive_strength=1.3)
    for lod in ("LOD0","LOD1"):
        build(lod,M)
    bpy.context.view_layer.update()
    K.project_box_uvs()
    for lod in ("LOD0","LOD1"):
        K.batch_by_material(lod)
    for obj in K.collections["RENDER_LOD1"].objects:
        obj.hide_set(True)
    out=ROOT/"art-source/harbor-v2/rescue-quay/rescue-quay.blend"
    out.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    stage=ROOT/"art-source/harbor-v2/_staging/rescue-quay-candidate.glb"
    sys.argv=["export_zone_scene.py","--","--output",str(stage)]
    runpy.run_path(str(ROOT/"tools/harbor-v2/export_zone_scene.py"),run_name="__main__")
    (stage.with_suffix(".colliders.json")).write_text(json.dumps(COLLIDERS,indent=2))


if __name__ == "__main__":
    main()
