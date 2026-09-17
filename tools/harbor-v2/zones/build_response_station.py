"""Native Blender Hunter deployment station: exact existing shell and gate footprint.

Run with /Applications/Blender.app/Contents/MacOS/Blender --background
--python-exit-code 1 --python tools/harbor-v2/zones/build_response_station.py
Then export with export_zone_scene.py to the staging candidate. Never overwrites
the original map or any other Blender source. Coordinates are Three.js metres.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zone_kit as zk

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "art-source/harbor-v2/response-station/response-station.blend"
STAGING = ROOT / "art-source/harbor-v2/_staging/response-station"
K = zk.ZoneKit("RESPONSE_STATION", "hunter-spawn", "response-station-pbr")
M = {}
LOD = "LOD0"
GATES = []


def box(name, bounds, material, bevel=0.0, tags=None):
    x0, x1, y0, y1, z0, z1 = bounds
    return K.box(name, (x1-x0, y1-y0, z1-z0),
                 ((x0+x1)/2, (y0+y1)/2, (z0+z1)/2), material,
                 lod=LOD, bevel=bevel if LOD == "LOD0" else 0, tags=tags)


def text(name, label, center, size, width, material, facing="east"):
    curve = bpy.data.curves.new(name + "_CURVE", "FONT")
    curve.body = label
    for path in ("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf",
                 "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        if Path(path).exists():
            curve.font = bpy.data.fonts.load(path, check_existing=True)
            break
    curve.size = size
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.extrude = 0.003
    curve.resolution_u = 2
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph), depsgraph=depsgraph)
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(curve)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = zk.to_blender(center)
    obj.rotation_euler = (math.pi/2, 0, math.pi/2 if facing == "east" else 0)
    actual = max(v.co.x for v in mesh.vertices)-min(v.co.x for v in mesh.vertices)
    obj.scale.x = min(1, width/max(actual, .001))
    K._finish(obj, material, LOD, {"castShadow": False}, 0)
    return obj


def materials():
    sheet = K.pbr("MAT_RS_SHEET", "container_neutral", pack="container-bd-pbr",
                  normal_strength=.35, vertex_tint=True)
    M["navy"] = zk.TintedMaterial(sheet, (.055, .12, .17), "marine_navy", grime=(.1, 1.5, .78))
    M["silver"] = zk.TintedMaterial(sheet, (.83, .86, .82), "pale_aluminium", grime=(.1, 1.5, .8))
    M["orange_sheet"] = zk.TintedMaterial(sheet, (.90, .20, .045), "coastguard_orange")
    M["steel"] = K.pbr("MAT_RS_STEEL", "steel_dark", pack="container-bd-pbr", normal_strength=.4)
    M["concrete"] = K.pbr("MAT_RS_CONCRETE", "concrete_yard", pack="container-bd-pbr", normal_strength=.45)
    M["glass"] = K.simple("MAT_RS_GLASS", (.65, .77, .80), .10, .05,
                           alpha=.17, blended=True, double_sided=True)
    M.update(K.palette("MAT_RS_PALETTE", {
        "white": (.8, .82, .77), "orange": (.94, .28, .07),
        "black": (.065, .08, .085), "rubber": (.035, .04, .04),
        "grey": (.42, .48, .49), "navy_flat": (.10, .17, .21),
        "yellow": (.88, .71, .16), "red": (.65, .06, .025),
        "cyan": (.3, .72, .79), "sea": (.12, .32, .36),
    }, rough=.63, metal=.12))
    M.update(K.palette("MAT_RS_LED", {
        "warm_light": (.95, .80, .58), "cool_light": (.57, .85, .9),
        "status_green": (.21, .78, .43), "screen": (.10, .45, .53),
    }, rough=.34, emissive_strength=1.8, grid=2))


def shell():
    # Cinematic asphalt reaches y=.12: a 4cm overlay on the legacy .10 floor
    # exposes this finished deck and receives a matching runtime floor collider.
    box("floor", (-49,-35,0,.14,-7,7), M["concrete"])
    box("roof_slab", (-49.5,-34.5,5,5.4,-7.5,7.5), M["steel"], .035)
    # Quiet aggregate roofing avoids corrugated normal-map moire at grazing views.
    box("roof_membrane", (-49.44,-34.56,5.400,5.412,-7.44,7.44), M["concrete"])
    # Glazed side walls: continuous real panes with mullions; no invisible cutout.
    for side in (-1, 1):
        z0,z1 = sorted((side*6.875,side*7.125))
        box(f"side_base_{side}", (-49,-35,.1,1.35,z0,z1), M["navy"], .016)
        box(f"side_header_{side}", (-49,-35,3.35,5,z0,z1), M["silver"], .016)
        box(f"side_glass_{side}", (-48.875,-35.125,1.35,3.35,side*7-.018,side*7+.018), M["glass"])
        box(f"side_orange_{side}", (-48.93,-35.06,3.42,3.55,side*7.142-.01,side*7.142+.01), M["orange_sheet"])
        for y in (1.35,3.35):
            box("window_rail", (-49,-35,y-.045,y+.045,z0-.01,z1+.01), M["steel"], .012)
        for x in (-49,-46.2,-43.4,-40.6,-37.8,-35):
            box("structural_side_post", (x-.06,x+.06,.1,5,z0-.014,z1+.014), M["steel"], .015)
        if LOD == "LOD0":
            for i in range(28):
                x=-48.8+i*.49
                box("side_panel_joint", (x-.005,x+.005,.17,1.30,side*7.129-.002,side*7.129+.002), M["black"])
    box("back_lower", (-49.125,-48.875,.1,1.35,-7,7), M["navy"], .016)
    box("back_header", (-49.125,-48.875,3.35,5,-7,7), M["silver"], .016)
    box("back_glass", (-49.018,-48.982,1.35,3.35,-6.9,6.9), M["glass"])
    for z in (-7,-4.2,-1.4,1.4,4.2,7):
        box("back_mullion", (-49.14,-48.86,.1,5,z-.06,z+.06), M["steel"], .015)
    for y in (1.35,3.35):
        box("back_rail", (-49.14,-48.86,y-.045,y+.045,-7,7), M["steel"])
    # Roof fascia readable from the east gate, above the access opening.
    box("identity_fascia", (-34.56,-34.46,5.02,5.40,-7.1,7.1), M["navy"])
    text("station_title", "HARBOR RESPONSE", (-34.443,5.205,0), .34,8.5,M["white"])
    text("station_number", "H-01", (-34.442,5.205,5.8), .24,1.05,M["orange"])
    # Continuous roof seams and rain drainage stay shallow above the roof slab.
    for z in range(-6,7,2):
        box("roof_seam", (-49.4,-34.6,5.412,5.429,z-.017,z+.017), M["steel"])
    for side in (-1,1):
        z=side*7.42
        box("eave_edge", (-49.4,-34.6,5.3,5.43,z-.027,z+.027), M["steel"])
        K.cylinder("downpipe",.065,4.9,(-48.72,2.55,side*7.18),M["steel"],segments=8,lod=LOD)
    if LOD == "LOD0":
        for z in (-4,4):
            box("flush_roof_grille",(-47,-45,5.415,5.43,z-.65,z+.65),M["black"])
            for i in range(15):
                x=-46.96+i*.137
                box("grille_fin",(x,x+.025,5.43,5.445,z-.6,z+.6),M["grey"])
    # Horizontal lights are fixtures, no runtime light objects.
    for z in (-5.7,0,5.7):
        box("gate_downlight_case",(-34.95,-34.6,4.88,5.015,z-.55,z+.55),M["steel"],.02)
        box("gate_downlight",(-34.92,-34.63,4.87,4.886,z-.5,z+.5),M["warm_light"])


def interior():
    # Shallow fixtures hug the walls; the 12+ metre central floor remains empty.
    for side in (-1,1):
        z=side*6.98
        for x in (-47.9,-46.95,-46,-45.05):
            box("flush_locker", (x-.43,x+.43,.16,1.27,z-.10,z+.10),M["silver"],.018)
            box("locker_inset", (x-.39,x+.39,.22,1.20,z-side*.114-.005,z-side*.114+.005),M["navy_flat"])
            box("locker_handle", (x+.24,x+.29,.64,.78,z-side*.13-.012,z-side*.13+.012),M["white"],.008)
            if LOD == "LOD0":
                for y in (.96,1.03,1.1):
                    box("locker_vent",(x-.23,x+.23,y,y+.016,z-side*.121-.004,z-side*.121+.004),M["black"])
        # Low panels sit beneath real glazing, never seal the view.
        for x in (-42.5,-41.4,-40.3):
            box("service_hatch",(x-.45,x+.45,.23,1.14,z-.10,z+.10),M["grey"],.018)
    box("status_panel_back",(-48.855,-48.70,3.62,4.76,-2.7,2.7),M["black"],.025)
    text("interior_status", "RESPONSE UNIT / READY",(-48.68,4.45,0),.33,4.6,M["white"])
    text("interior_subtitle", "RESCUE  .  OBSERVE  .  SECURE",(-48.68,3.98,0),.16,4.6,M["cyan"])
    # Flat incident chart and first-aid markings, no decorative blocking volumes.
    for z in (-5,5):
        box("incident_chart_back",(-48.86,-48.72,3.75,4.72,z-.7,z+.7),M["navy_flat"],.012)
        box("incident_screen",(-48.70,-48.68,3.85,4.63,z-.59,z+.59),M["screen"])
        if LOD == "LOD0":
            for n in range(5):
                box("chart_line",(-48.67,-48.659,4.0+n*.11,4.012+n*.11,z-.43,z+.26-(n%3)*.1),M["cool_light"])
    # Painted deployment lane and side bay identifiers.
    for z in (-2.3,2.3):
        box("lane_stripe",(-48.65,-35.12,.145,.15,z-.035,z+.035),M["white"])
    for x in (-45,-42,-39):
        K.mesh("deployment_arrow",[(x-.55,.152,-.4),(x-.55,.152,.4),(x+.25,.152,0)],[(0,1,2)],M["orange"],lod=LOD)
    for z in (-6,6):
        box("floor_safety_stripe",(-48.5,-35.3,.145,.15,z-.05,z+.05),M["orange"])
    for z in (-4.6,4.6):
        box("ceiling_light_track",(-48.4,-35.6,4.83,4.99,z-.085,z+.085),M["steel"])
        box("ceiling_diffuser",(-48.2,-35.8,4.82,4.834,z-.055,z+.055),M["cool_light"])
    if LOD == "LOD0":
        for x in (-47.5,-44.5,-41.5,-38.5):
            box("ceiling_rib",(x-.045,x+.045,4.75,4.98,-6.8,6.8),M["steel"],.01)
            for z in (-6.7,6.7):
                K.cylinder("ceiling_anchor",.065,.04,(x,4.73,z),M["orange"],segments=8,lod=LOD)


def gate():
    before = set(bpy.data.objects)
    # A single-material merged object is required by setHunterGateOpen().
    box("gate_back",(-35.105,-34.895,0,5,-7,7),M["navy_flat"])
    for i in range(16 if LOD == "LOD0" else 8):
        step=5/(16 if LOD == "LOD0" else 8)
        y=i*step
        box("gate_fold",(-34.889,-34.876,y+.015,y+.047,-6.94,6.94),M["grey"])
    for z in (-6.8,0,6.8):
        box("gate_stile",(-34.89,-34.875,.05,4.95,z-.026,z+.026),M["black"])
    for z in (-5.7,5.7):
        box("gate_safety_mark",(-34.888,-34.875,.2,1.15,z-.18,z+.18),M["orange"])
    box("gate_identity_panel",(-34.89,-34.875,2.18,3.48,-3.35,3.35),M["black"])
    text("gate_identity", "HUNTER DEPLOYMENT",(-34.869,2.98,0),.48,6.0,M["white"])
    text("gate_warning", "AUTOMATIC RELEASE / STAND CLEAR",(-34.869,2.48,0),.17,6.0,M["orange"])
    objects = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object
    obj.name=f"MESH_RESPONSE_STATION_HUNTER_GATE_{LOD}"
    bpy.context.view_layer.update()
    # The local +Y of exported glTF points up. Collapse the shutter around its
    # upper edge while releasing, then hide it; the source remains fully closed.
    pivot=Matrix.Translation(Vector(zk.to_blender((-35,5,0))))
    obj.data.transform(pivot.inverted() @ obj.matrix_world)
    obj.matrix_world=pivot
    # Palette is shared by all joined geometry; Blender join deduplicates slots.
    assert len(obj.data.materials)==1, "Gate must export as one Mesh, not a Group"
    obj["gameplayRole"]="hunterGate"
    obj["harborZone"]="hunter-spawn"
    obj["zoneLod"]=LOD
    obj["weaponImpactKind"]="solid"
    obj["gateClosedPosition"]=[-35,5,0]
    obj["gateMotion"]="roller"
    obj["gateTopY"]=5
    GATES.append(obj.name)


def main():
    global LOD
    K.new_scene("Harbor_Hunter_Response_Station")
    materials()
    for LOD in ("LOD0","LOD1"):
        shell()
        interior()
        gate()
    bpy.context.view_layer.update()
    K.project_box_uvs()
    for lod in ("LOD0","LOD1"):
        K.batch_by_material(lod,keep_separate=set(GATES))
    K.apply_all_modifiers()
    bpy.context.scene["stationContract"]="Existing 14x14m shell, 5m clear gate; finished floor top .14m gets runtime overlay collider"
    bpy.context.scene["spawnClearance"]="Hunter (-36,0.1,0), gate east x=-35, lane |z|<2.3"
    SOURCE.parent.mkdir(parents=True,exist_ok=True)
    STAGING.mkdir(parents=True,exist_ok=True)
    for image in bpy.data.images:
        if image.source == "FILE":
            image.pack()
    stats=K.stats()
    stats["gateNames"]=GATES
    stats["source"]=str(SOURCE)
    stats["newColliders"]=0
    for lod in ("LOD0","LOD1"):
        assert stats[f"RENDER_{lod}"]["drawCalls"]<=25
    (STAGING/"build-metrics.json").write_text(json.dumps(stats,indent=2))
    # Opening the authoring source must not show two overlapping LOD shells.
    for obj in K.collections["RENDER_LOD1"].objects:
        obj.hide_set(True)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                area.spaces.active.shading.type="MATERIAL"
                region=area.spaces.active.region_3d
                region.view_location=Vector(zk.to_blender((-42,2.4,0)))
                region.view_distance=30
                region.view_rotation=Vector(zk.to_blender((19,7.1,17))).to_track_quat("Z","Y")
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    print("RESPONSE_STATION_BUILD="+json.dumps(stats))


if __name__=="__main__":
    main()
