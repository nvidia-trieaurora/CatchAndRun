"""AB — Harbor Operations & Repair Lane: Harbor V2 zone builder (Blender 5.2, MCP or CLI).

Authors ``art-source/harbor-v2/operations-ab/operations-ab.blend``: the strip between the
AD construction site (x -23.4) and the BD container yard (x 29.5), from the north seawall
(z -43.45) to the Warehouse's north wall (z -18). The legacy east-west service road
(z -25..-19) becomes the inspection lane; the old Dockside Bar boxes become the HARBOR
OPERATIONS building (control office + workshop, playable interior, roof deck via the
existing spiral stair); the Warehouse gets a service facade; the seawall pockets get
the pump house, davit and rescue gear.

Gameplay contract kept (procedural boxes, buildDocksideCafeBar): building shell -9..9 ×
0..7 × -43..-29 with the two 3 m front openings (x -5..-2 personnel door, x 2..5 roller
bay, 5 m clear), the west side door (z -37..-35, 3.5 m clear), interior furniture boxes
(dressed 1:1), spiral stair + roof deck + parapets, front deck 0..0.22 (z -28..-24),
bollards, seawall. The cinematic ``COL_MOVE_CINE_BAR_*`` duplicates (which also sealed the
west side door) are dropped by the runtime override. The lane z -24..-19.4 is a contract
clearance volume — nothing solid goes there.

Coordinates are Three.js metres (x east, y up, z south). Ground: asphalt top y 0.18
(players stand at y 0), paint at 0.19..0.21, concrete promenade north of z -38.

Usage (MCP): ``import build_operations_ab as B; B.main(save=True)``
CLI: ``blender --background --python-exit-code 1 --python-expr "import sys; sys.path.insert(0,'tools/harbor-v2/zones'); import build_operations_ab as B; B.main()"``
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))   # `blender --background --python <this file>`
import zone_kit as zk  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
COLLIDER_JSON = ROOT / "art-source/harbor-v2/_staging/procedural-colliders.json"
CINEMATIC_GLB = ROOT / "client/public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb"
REFERENCE_DIR = ROOT / "art-source/harbor-v2/_staging/reference/operations-ab"
OUTPUT_BLEND = ROOT / "art-source/harbor-v2/operations-ab/operations-ab.blend"
BUILD_STATS = ROOT / "art-source/harbor-v2/_staging/operations-ab-build-stats.json"

ZONE_MIN = (-23.3, -1.5, -46.0)          # z reaches over the water for the davit hook
ZONE_MAX = (29.45, 12.0, -18.0)

# ---- legacy contract (metres) --------------------------------------------------- #
GROUND = 0.18
PAINT = 0.195
DECK = 0.22                          # front apron slab (procedural 0..0.22, z -28..-24)
LANE_Z = (-25.0, -19.0)              # legacy east-west service road
WAREHOUSE_WALL_Z = -18.0             # Warehouse north wall face (warehouse.glb COL_MOVE_WALL_BACK)
BX0, BX1 = -9.0, 9.0                 # building shell
BZ0, BZ1 = -43.0, -29.0
BH = 7.0                             # wall top / roof slab bottom
ROOF_TOP = 7.3
IX0, IX1 = -8.8, 8.8                 # interior clear
IZ0, IZ1 = -40.8, -29.15
DOOR_W = (-5.0, -2.0)                # personnel entrance opening (front)
DOOR_E = (2.0, 5.0)                  # roller bay opening (front)
SIDE_DOOR_Z = (-37.0, -35.0)         # west wall opening, 3.5 m clear
SPIRAL = (6.0, -38.0, 1.8, 18, math.pi * 2.2)   # x, z, radius, steps, total angle
HOLE_R = 2.3
PARTITION_X = (-1.5, -1.42)          # glazed office / workshop partition
PARTITION_END_Z = -34.4              # partial partition: open front hall south of this line
NORTH_WINDOWS = ((-8.2, -5.0), (-4.2, -1.0), (0.4, 3.6))   # ocean-facing control windows (x spans)
SEAWALL_Z = -43.45
PROM = 0.0                           # concrete promenade surface north of the asphalt (z < -38)

K = zk.ZoneKit("OPERATIONS_AB", "operations-ab", "operations-ab-pbr")
_M: dict = {}
_stats = {"rotors": 0}


# --------------------------------------------------------------------------- #
# Materials
# --------------------------------------------------------------------------- #

def srgb_tint(rgb, *, base_mean=0.46):
    out = []
    for c in rgb:
        lin = ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
        out.append(min(1.0, lin / base_mean))
    return tuple(out)


def materials():
    M = {}
    sheet = K.pbr("MAT_AB_SHEET", "container_neutral", pack="container-bd-pbr", vertex_tint=True)

    def tint(name, srgb, **kw):
        return zk.TintedMaterial(sheet, srgb_tint(srgb), name, **kw)
    M["navy"] = tint("cladding_navy", (0.14, 0.18, 0.28), grime=(0.25, 1.6, 0.66), roof_dirt=0.25)
    M["navy_dark"] = tint("cladding_navy_dark", (0.09, 0.11, 0.17), grime=(GROUND, 1.2, 0.7), roof_dirt=0.3)
    M["clad_grey"] = tint("cladding_grey", (0.44, 0.46, 0.48), grime=(GROUND, 1.2, 0.62), roof_dirt=0.3)
    M["rust_box"] = tint("rust_box", (0.42, 0.24, 0.14), grime=(GROUND, 1.0, 0.7), roof_dirt=0.4)
    M["steel"] = K.pbr("MAT_STEEL_DARK", "steel_dark", pack="container-bd-pbr")
    M["concrete"] = K.pbr("MAT_CONCRETE_YARD", "concrete_yard", pack="container-bd-pbr")
    M["grating"] = K.pbr("MAT_GRATING", "grating", pack="construction-pbr", alpha_clip=True, double_sided=True)
    M["glass"] = K.simple("MAT_GLASS_CLEAR", (0.8, 0.86, 0.88), 0.08, alpha=0.28, blended=True, double_sided=True)
    M["puddle"] = K.simple("MAT_PUDDLE", (0.14, 0.17, 0.19), 0.03, alpha=0.55, blended=True)
    # isolated emissives so the ambient pulses never touch the shared lamp palette
    M["status"] = K.simple("MAT_AB_STATUS", (0.2, 0.7, 0.85), 0.3, emissive=(0.35, 0.92, 1.0), emissive_strength=3.0)
    M["beacon"] = K.simple("MAT_AB_BEACON", (0.8, 0.45, 0.1), 0.3, emissive=(1.0, 0.55, 0.12), emissive_strength=3.4)
    M["steam"] = K.simple("MAT_AB_STEAM", (0.8, 0.82, 0.85), 0.9, alpha=0.18, blended=True, double_sided=True)
    lights = K.palette("MAT_AB_LIGHT", {
        "warm": (1.0, 0.84, 0.58),
        "lamp": (1.0, 0.9, 0.7),
        "cyan": (0.35, 0.92, 1.0),
        "amber": (1.0, 0.58, 0.14),
        "screen": (0.35, 0.75, 1.0),
        "screen_dim": (0.2, 0.42, 0.6),
        "red": (1.0, 0.2, 0.15),
        "green": (0.35, 1.0, 0.55),
        "led": (1.0, 0.97, 0.9),
        "white_cool": (0.85, 0.92, 1.0),
    }, rough=0.3, emissive_strength=3.0)
    M.update(lights)
    palette = K.palette("MAT_AB_PALETTE", {
        "paint_yellow": (0.84, 0.68, 0.14),
        "paint_white": (0.82, 0.82, 0.78),
        "paint_red": (0.7, 0.14, 0.1),
        "rubber": (0.06, 0.06, 0.065),
        "safety_red": (0.66, 0.12, 0.1),
        "safety_yellow": (0.9, 0.72, 0.12),
        "orange": (0.78, 0.36, 0.08),
        "rust": (0.38, 0.19, 0.1),
        "timber": (0.48, 0.37, 0.24),
        "cardboard": (0.58, 0.44, 0.3),
        "steel_black": (0.09, 0.1, 0.11),
        "trim": (0.2, 0.22, 0.24),
        "grey": (0.58, 0.58, 0.56),
        "grey_dark": (0.34, 0.35, 0.36),
        "white": (0.82, 0.82, 0.8),
        "wall": (0.72, 0.72, 0.7),
        "wall_dado": (0.16, 0.2, 0.3),
        "floor": (0.36, 0.35, 0.33),
        "floor_shop": (0.3, 0.3, 0.3),
        "concrete_dark": (0.28, 0.28, 0.28),
        "cable": (0.08, 0.08, 0.09),
        "brass": (0.72, 0.55, 0.25),
        "bin_blue": (0.16, 0.32, 0.62),
        "bin_red": (0.72, 0.16, 0.12),
        "bin_yellow": (0.88, 0.7, 0.16),
        "bin_green": (0.2, 0.5, 0.26),
        "buoy_orange": (0.9, 0.4, 0.1),
        "buoy_red": (0.75, 0.15, 0.12),
        "hose": (0.55, 0.15, 0.1),
        "hose_yellow": (0.8, 0.65, 0.2),
        "navy_paint": (0.1, 0.14, 0.24),
        "green_machine": (0.2, 0.34, 0.24),
        "blue_machine": (0.14, 0.3, 0.55),
        "chart_sea": (0.55, 0.68, 0.72),
        "chart_land": (0.78, 0.74, 0.62),
        "paper": (0.86, 0.84, 0.78),
        "cork": (0.62, 0.48, 0.3),
        "seat": (0.14, 0.15, 0.17),
        "propeller": (0.6, 0.5, 0.3),
        "pipe_red": (0.55, 0.12, 0.1),
        "canvas": (0.42, 0.44, 0.4),
        "tarp": (0.14, 0.28, 0.5),
    }, rough=0.78, grid=7)
    M.update(palette)
    _M.clear(); _M.update(M)
    return M


# --------------------------------------------------------------------------- #
# Primitive helpers (Three.js metres)
# --------------------------------------------------------------------------- #

def box_span(name, x0, x1, y0, y1, z0, z1, mat, **kw):
    return K.box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat, **kw)


def bar(name, p0, p1, t, mat, lod="LOD0", tags=None, w=None):
    a, b = Vector(p0), Vector(p1)
    d = b - a
    length = d.length
    if length < 1e-6:
        return None
    d.normalize()
    up = Vector((0, 1, 0)) if abs(d.y) < 0.99 else Vector((1, 0, 0))
    s = d.cross(up).normalized()
    u = s.cross(d).normalized()
    w = w or t
    hs, hu = s * (w / 2), u * (t / 2)
    corners = [a - hs - hu, a + hs - hu, a + hs + hu, a - hs + hu, b - hs - hu, b + hs - hu, b + hs + hu, b - hs + hu]
    verts = [tuple(c) for c in corners]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return K.mesh(name, verts, faces, mat, lod=lod, tags=tags)


def tube(name, p0, p1, r, mat, segments=6, lod="LOD0", tags=None):
    a, b = Vector(p0), Vector(p1)
    d = b - a
    center = (a + b) / 2
    obj = K.cylinder(name, r, d.length, tuple(center), mat, segments=segments, lod=lod, tags=tags)
    d_bl = Vector(zk.to_blender(tuple(d))).normalized()
    obj.rotation_euler = Vector((0, 0, 1)).rotation_difference(d_bl).to_euler()
    return obj


def paint(name, x0, x1, z0, z1, mat, y=PAINT, lod="LOD0"):
    return box_span(name, x0, x1, y - 0.006, y + 0.006, z0, z1, mat, lod=lod, tags={"castShadow": False})


def grate(name, x, z, w, d, y=GROUND, rot_y=0.0):
    M = _M
    box_span(f"{name}_pit", x - w / 2, x + w / 2, y - 0.06, y + 0.002, z - d / 2, z + d / 2, M["concrete_dark"], tags={"castShadow": False})
    K.plane(f"{name}_grid", (w, d), (x, y + 0.012, z), M["grating"], normal="y", rot_y=rot_y, tags={"castShadow": False})
    box_span(f"{name}_frame_a", x - w / 2 - 0.04, x + w / 2 + 0.04, y, y + 0.018, z - d / 2 - 0.04, z - d / 2, M["steel"], tags={"castShadow": False})
    box_span(f"{name}_frame_b", x - w / 2 - 0.04, x + w / 2 + 0.04, y, y + 0.018, z + d / 2, z + d / 2 + 0.04, M["steel"], tags={"castShadow": False})


def puddle(name, x, z, w, d, y=GROUND):
    K.plane(name, (w, d), (x, y + 0.012, z), _M["puddle"], normal="y",
            tags={"castShadow": False, "ambientMotion": "pond-ripple", "weaponImpactKind": "water", "ignoreWeaponRaycast": True})


def sweep(target):
    """Move every mesh still sitting directly in RENDER_LOD0 into a sub-collection."""
    for obj in list(K.collections["RENDER_LOD0"].objects):
        if obj.type == "MESH":
            K.link(obj, "AMBIENT_DYNAMIC" if obj.get("ambientMotion") else target)


def text_mesh(name, text, size, center, mat, *, max_width, tags=None):
    """Real text geometry (converted to mesh, background-safe) facing Three.js +z."""
    curve = bpy.data.curves.new(f"{name}_CURVE", type="FONT")
    curve.body = text
    for path in ("/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf",
                 "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf"):
        if Path(path).exists():
            try:
                curve.font = bpy.data.fonts.load(path, check_existing=True)
                break
            except RuntimeError:
                continue
    curve.size = size
    curve.extrude = 0.015
    curve.resolution_u = 3
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.space_character = 1.04
    tmp = bpy.data.objects.new(f"{name}_tmp", curve)
    bpy.context.scene.collection.objects.link(tmp)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(tmp.evaluated_get(depsgraph), depsgraph=depsgraph)
    bpy.data.objects.remove(tmp)
    bpy.data.curves.remove(curve)
    mesh.name = name
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = (math.pi / 2, 0.0, 0.0)
    obj.location = zk.to_blender(center)
    bpy.context.view_layer.update()
    width = max(v.co.x for v in mesh.vertices) - min(v.co.x for v in mesh.vertices)
    if width > max_width:
        obj.scale = (max_width / width, 1.0, 1.0)
    K._finish(obj, mat, "LOD0", tags or {"castShadow": False}, 0.0)
    obj["signText"] = text
    _stats["signTriangles"] = sum(len(p.vertices) - 2 for p in mesh.polygons)
    _stats["signWidth"] = round(min(width, max_width), 3)
    return obj


def rotor(name, center, radius, blades, mat, *, axis="z", rpm=18.0):
    """Fan rotor: one mesh, origin at the hub, spun at runtime (ambientMotion=spin)."""
    verts, faces = [], []
    for b in range(blades):
        a = math.tau * b / blades
        ta, tb = a - 0.22, a + 0.22
        base = len(verts)
        pts = [(0.12 * math.cos(ta), 0.12 * math.sin(ta)), (radius * math.cos(a - 0.08), radius * math.sin(a - 0.08)),
               (radius * math.cos(a + 0.08), radius * math.sin(a + 0.08)), (0.12 * math.cos(tb), 0.12 * math.sin(tb))]
        for u, v in pts:
            # blade in the local plane perpendicular to the spin axis, slight twist thickness
            if axis == "z":
                verts.append((u, v, 0.0))
            elif axis == "y":
                verts.append((u, 0.0, v))
            else:
                verts.append((0.0, u, v))
        faces.append((base, base + 1, base + 2, base + 3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([zk.to_blender(v) for v in verts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = zk.to_blender(center)
    # same-key rotors collapse into one InstancedMesh at runtime, so the key carries the
    # geometry variant (axis + blade count) — every instance must share the same mesh
    K._finish(obj, mat, "LOD0", {"castShadow": False, "ambientMotion": "spin", "spinAxis": axis, "spinRpm": rpm,
                                  "ignoreWeaponRaycast": True, "instanceKey": f"ab-rotor-{axis}{blades}"}, 0.0)
    K.link(obj, "AMBIENT_DYNAMIC")
    _stats["rotors"] += 1
    return obj


# --------------------------------------------------------------------------- #
# Inspection lane (paint, weighbridge, drains, kerbs, wheel stops, bollards)
# --------------------------------------------------------------------------- #

LANE_X = (-23.2, 29.4)
WEIGHBRIDGE = (12.0, 18.0, -23.6, -20.4)       # x0, x1, z0, z1 recessed plate
INSPECTION_BAYS = ((-14.0, -9.5), (-4.0, 0.5), (5.0, 9.5), (20.0, 24.5))   # x spans, south half of the lane


def build_lane(M):
    z0, z1 = LANE_Z
    x0, x1 = LANE_X
    yellow, white = M["paint_yellow"], M["paint_white"]
    # edge lines (yellow) and dashed centre line (white), replacing the carved legacy dashes
    paint("lane_edge_n", x0, x1, z0 + 0.05, z0 + 0.17, yellow)
    paint("lane_edge_s", x0, x1, z1 - 0.17, z1 - 0.05, yellow)
    cz = (z0 + z1) / 2
    x = x0 + 1.0
    n = 0
    while x + 2.0 <= x1 - 0.5:
        if not (WEIGHBRIDGE[0] - 0.4 < x < WEIGHBRIDGE[1] + 0.4):
            paint(f"lane_centre_{n}", x, x + 2.0, cz - 0.06, cz + 0.06, white); n += 1
        x += 3.5
    # inspection rectangles (south half), numbered by tick marks instead of text
    for k, (bx0, bx1) in enumerate(INSPECTION_BAYS):
        for nm, (a0, a1, b0, b1) in {"n": (bx0, bx1, cz + 0.4, cz + 0.5), "s": (bx0, bx1, z1 - 0.7, z1 - 0.6),
                                     "w": (bx0, bx0 + 0.1, cz + 0.4, z1 - 0.6), "e": (bx1 - 0.1, bx1, cz + 0.4, z1 - 0.6)}.items():
            paint(f"bay_{k}_{nm}", a0, a1, b0, b1, yellow)
        for t in range(k + 1):
            paint(f"bay_{k}_tick_{t}", bx0 + 0.3 + t * 0.25, bx0 + 0.42 + t * 0.25, z1 - 1.3, z1 - 0.9, white)
        # wheel stop on the kerb-side edge strip of each bay (z -19.38..-19.23: outside the 5 m clear lane)
        box_span(f"wheelstop_{k}", (bx0 + bx1) / 2 - 0.8, (bx0 + bx1) / 2 + 0.8, GROUND, GROUND + 0.14, z1 - 0.38, z1 - 0.23, M["rubber"], bevel=0.02)
        for s in range(3):
            sx = (bx0 + bx1) / 2 - 0.6 + s * 0.6
            box_span(f"wheelstop_{k}_stripe_{s}", sx - 0.12, sx + 0.12, GROUND + 0.001, GROUND + 0.141, z1 - 0.382, z1 - 0.228, yellow, tags={"castShadow": False})
    # recessed weighbridge: steel deck 5 mm above the asphalt inside a flush frame + dark gap
    wx0, wx1, wz0, wz1 = WEIGHBRIDGE
    box_span("weighbridge_gap", wx0 - 0.08, wx1 + 0.08, GROUND - 0.02, GROUND + 0.004, wz0 - 0.08, wz1 + 0.08, M["steel_black"], tags={"castShadow": False})
    box_span("weighbridge_frame", wx0 - 0.14, wx1 + 0.14, GROUND, GROUND + 0.022, wz0 - 0.14, wz1 + 0.14, M["steel"], tags={"castShadow": False})
    box_span("weighbridge_deck", wx0, wx1, GROUND - 0.01, GROUND + 0.012, wz0, wz1, M["grey_dark"], tags={"castShadow": False})
    for k in range(5):
        px = wx0 + 0.6 + k * 1.2
        paint(f"weighbridge_seam_{k}", px - 0.01, px + 0.01, wz0 + 0.05, wz1 - 0.05, M["steel_black"], y=GROUND + 0.013)
    paint("weighbridge_hatch_n", wx0 - 0.5, wx1 + 0.5, wz0 - 0.45, wz0 - 0.3, yellow)
    paint("weighbridge_hatch_s", wx0 - 0.5, wx1 + 0.5, wz1 + 0.3, wz1 + 0.45, yellow)
    # weighbridge control cabinet on the Warehouse apron (behind the kerb, between roller door 2 and the pallets)
    cx0, cx1, cz0, cz1 = 15.9, 16.4, WAREHOUSE_WALL_Z - 0.75, WAREHOUSE_WALL_Z - 0.25
    box_span("weighbridge_cabinet", cx0, cx1, GROUND, GROUND + 1.3, cz0, cz1, M["grey"], bevel=0.01)
    box_span("weighbridge_cabinet_panel", cx0 + 0.1, cx1 - 0.1, GROUND + 0.6, GROUND + 1.1, cz0 - 0.02, cz0, M["trim"])
    K.plane("weighbridge_cabinet_led", (0.12, 0.05), ((cx0 + cx1) / 2, GROUND + 1.15, cz0 - 0.01), M["green"], normal="z", tags={"castShadow": False})
    tube("weighbridge_cabinet_conduit", ((cx0 + cx1) / 2, GROUND + 1.3, WAREHOUSE_WALL_Z - 0.22), ((cx0 + cx1) / 2, 5.28, WAREHOUSE_WALL_Z - 0.22), 0.02, M["steel"], segments=6)
    K.collider("WEIGH_CABINET", (cx0, 0.0, cz0), (cx1, GROUND + 1.3, cz1))
    # drainage channels along both edges: grates every 6 m on the lane side of the kerbs
    for k, gx in enumerate(range(-20, 28, 6)):
        # the building's front deck (0.22 slab, z -28..-24) covers the north edge there
        if not (BX0 - 1 < gx < BX1 + 1):
            grate(f"drain_n_{k}", gx, z0 + 0.45, 0.9, 0.28, rot_y=math.pi / 2)
        grate(f"drain_s_{k}", gx + 3, z1 - 0.45, 0.9, 0.28, rot_y=math.pi / 2)
    # kerbs: north edge outside the building frontage, south edge in front of the Warehouse
    # apron (gaps at the roller doors x -17.5..-14.5, -3.5..-0.5, 12.5..15.5)
    # (the kerb stops short of both turning spaces, x -18 / 22.5, so vehicles can swing onto the yard)
    box_span("kerb_nw", -18.0, BX0 - 0.3, GROUND, GROUND + 0.13, z0 - 0.15, z0 - 0.02, M["concrete_dark"], bevel=0.01)
    box_span("kerb_ne", BX1 + 0.3, 22.5, GROUND, GROUND + 0.13, z0 - 0.15, z0 - 0.02, M["concrete_dark"], bevel=0.01)
    door_gaps = ((-17.6, -14.4), (-3.6, -0.4), (12.4, 15.6))
    cursor = x0
    for k, (g0, g1) in enumerate(door_gaps + ((x1, x1),)):
        if g0 > cursor:
            box_span(f"kerb_s_{k}", cursor, g0, GROUND, GROUND + 0.13, z1 + 0.02, z1 + 0.15, M["concrete_dark"], bevel=0.01)
        cursor = g1
    # steel bollards at the lane corners and beside the two cross routes — all outside the
    # turning spaces (turn-west z ≥ -26, turn-east z ≥ -27) and the cross-route volumes (x ±11.2)
    for k, (bx, bz) in enumerate(((-22.4, -26.4), (-22.4, z1 + 0.5), (28.6, -27.4), (28.6, z1 + 0.5),
                                  (-11.5, z0 - 0.5), (11.4, z0 - 0.5))):
        K.cylinder(f"bollard_{k}", 0.1, 0.9, (bx, GROUND + 0.45, bz), M["steel"], segments=10)
        K.cylinder(f"bollard_{k}_cap", 0.11, 0.05, (bx, GROUND + 0.92, bz), yellow, segments=10)
        K.cylinder(f"bollard_{k}_band", 0.105, 0.08, (bx, GROUND + 0.7, bz), M["steel_black"], segments=10)
        K.collider(f"BOLLARD_{k}", (bx - 0.1, 0.0, bz - 0.1), (bx + 0.1, GROUND + 0.95, bz + 0.1))
    # turning spaces: hatched corners at both lane ends
    for k, (hx0, hx1) in enumerate(((x0 + 0.3, x0 + 3.3), (x1 - 3.3, x1 - 0.3))):
        for s in range(4):
            paint(f"turn_{k}_{s}", hx0 + s * 0.75, hx0 + s * 0.75 + 0.12, z0 + 0.4, z1 - 0.4, yellow)
    # puddles near the drains + the weighbridge
    puddle("puddle_a", -6.5, z0 + 1.2, 2.6, 1.4)
    puddle("puddle_b", 20.5, z1 - 1.0, 2.0, 1.2)
    puddle("puddle_c", 3.0, z1 - 0.9, 1.6, 1.0)
    sweep("LANE")


# --------------------------------------------------------------------------- #
# Operations building — exterior on the legacy boxes
# --------------------------------------------------------------------------- #

def build_building_exterior(M):
    navy, steel, concrete = M["navy"], M["steel"], M["concrete"]
    base_h = 0.9
    x0, x1, z0, z1 = BX0, BX1, BZ0, BZ1
    # warm concrete base band + navy vertical cladding on every face; the 2.2 m thick legacy
    # back "wall" (z -43..-40.8) reads as a solid plant annex on the seawall
    for nm, (a0, a1, b0, b1) in {"w": (x0 - 0.16, x0 + 0.02, z0 - 0.16, z1 + 0.16), "e": (x1 - 0.02, x1 + 0.16, z0 - 0.16, z1 + 0.16),
                                 "n": (x0 - 0.16, x1 + 0.16, z0 - 0.16, z0 + 0.02)}.items():
        box_span(f"base_{nm}", a0, a1, 0.0, base_h, b0, b1, concrete, bevel=0.02)
    box_span("base_s_l", x0 - 0.16, DOOR_W[0] - 0.1, 0.0, base_h, z1 - 0.02, z1 + 0.16, concrete, bevel=0.02)
    box_span("base_s_m", DOOR_W[1] + 0.1, DOOR_E[0] - 0.1, 0.0, base_h, z1 - 0.02, z1 + 0.16, concrete, bevel=0.02)
    box_span("base_s_r", DOOR_E[1] + 0.1, x1 + 0.16, 0.0, base_h, z1 - 0.02, z1 + 0.16, concrete, bevel=0.02)
    wall_top = BH - 0.02
    # west wall with the side door opening (z -37..-35, 3.5 m)
    sz0, sz1 = SIDE_DOOR_Z
    box_span("clad_w_a", x0 - 0.12, x0 + 0.02, base_h, wall_top, z0 - 0.12, sz0 - 0.1, navy)
    box_span("clad_w_b", x0 - 0.12, x0 + 0.02, base_h, wall_top, sz1 + 0.1, z1 + 0.12, navy)
    box_span("clad_w_head", x0 - 0.12, x0 + 0.02, 3.5, wall_top, sz0 - 0.1, sz1 + 0.1, navy)
    box_span("clad_e", x1 - 0.02, x1 + 0.12, base_h, wall_top, z0 - 0.12, z1 + 0.12, navy)
    # north (ocean) face: cladding split around the three control-window openings so the
    # lit control-room recesses behind the glass read from the seawall
    box_span("clad_n_low", x0 - 0.12, x1 + 0.12, base_h, 1.3, z0 - 0.12, z0 + 0.02, navy)
    box_span("clad_n_high", x0 - 0.12, x1 + 0.12, 2.9, wall_top, z0 - 0.12, z0 + 0.02, navy)
    piers = ((x0 - 0.12, NORTH_WINDOWS[0][0] - 0.05), (NORTH_WINDOWS[0][1] + 0.05, NORTH_WINDOWS[1][0] - 0.05),
             (NORTH_WINDOWS[1][1] + 0.05, NORTH_WINDOWS[2][0] - 0.05), (NORTH_WINDOWS[2][1] + 0.05, x1 + 0.12))
    for k, (p0, p1) in enumerate(piers):
        box_span(f"clad_n_pier_{k}", p0, p1, 1.3, 2.9, z0 - 0.12, z0 + 0.02, navy)
    # front: cladding piers, the two 3 m openings, window bands either side
    box_span("clad_s_l", x0 - 0.02, DOOR_W[0] - 0.1, base_h, wall_top, z1 - 0.02, z1 + 0.12, navy)
    box_span("clad_s_m", DOOR_W[1] + 0.1, DOOR_E[0] - 0.1, base_h, wall_top, z1 - 0.02, z1 + 0.12, navy)
    box_span("clad_s_r", DOOR_E[1] + 0.1, x1 + 0.02, base_h, wall_top, z1 - 0.02, z1 + 0.12, navy)
    box_span("clad_s_head_w", DOOR_W[0] - 0.1, DOOR_W[1] + 0.1, 5.0, wall_top, z1 - 0.02, z1 + 0.12, navy)
    box_span("clad_s_head_e", DOOR_E[0] - 0.1, DOOR_E[1] + 0.1, 5.0, wall_top, z1 - 0.02, z1 + 0.12, navy)
    # corner trims, plinth flashing, horizontal cladding joint at 3.6 m
    for cx in (x0 - 0.14, x1 + 0.06):
        for cz in (z0 - 0.14, z1 + 0.06):
            box_span(f"corner_{cx:.0f}_{cz:.0f}", cx, cx + 0.08, base_h, wall_top, cz, cz + 0.08, M["trim"])
    for nm, (a0, a1, b0, b1) in {"w": (x0 - 0.17, x0 - 0.11, z0 - 0.17, z1 + 0.17), "e": (x1 + 0.11, x1 + 0.17, z0 - 0.17, z1 + 0.17),
                                 "n": (x0 - 0.17, x1 + 0.17, z0 - 0.17, z0 - 0.11), "s": (x0 - 0.17, x1 + 0.17, z1 + 0.11, z1 + 0.17)}.items():
        box_span(f"plinth_flash_{nm}", a0, a1, base_h, base_h + 0.04, b0, b1, steel)
    window_bands(M)
    front_openings(M)
    roof_and_parapets(M)
    rooftop_equipment(M)
    exterior_fixtures(M)
    sweep("OPERATIONS_BUILDING")


def window_bands(M):
    """Control-room glazing: front-west band, west band, and the ocean-facing north band."""
    steel, glass = M["steel"], M["glass"]
    z1, x0 = BZ1, BX0
    def band(nm, a0, a1, y0, y1, plane_center, normal, frame_spans):
        # frame: sill, head, mullions; glass plane just inside the cladding face
        for k, (m0, m1) in enumerate(frame_spans):
            if normal == "z":
                box_span(f"win_{nm}_mullion_{k}", m0, m1, y0, y1, plane_center[2] - 0.06, plane_center[2] + 0.08, steel)
            else:
                box_span(f"win_{nm}_mullion_{k}", plane_center[0] - 0.08, plane_center[0] + 0.06, y0, y1, m0, m1, steel)
        if normal == "z":
            box_span(f"win_{nm}_sill", a0 - 0.04, a1 + 0.04, y0 - 0.06, y0 + 0.02, plane_center[2] - 0.06, plane_center[2] + 0.14, steel)
            box_span(f"win_{nm}_head", a0 - 0.04, a1 + 0.04, y1 - 0.02, y1 + 0.06, plane_center[2] - 0.06, plane_center[2] + 0.1, steel)
            K.plane(f"win_{nm}_glass", (a1 - a0, y1 - y0), ((a0 + a1) / 2, (y0 + y1) / 2, plane_center[2]), glass, normal="z")
        else:
            box_span(f"win_{nm}_sill", plane_center[0] - 0.14, plane_center[0] + 0.06, y0 - 0.06, y0 + 0.02, a0 - 0.04, a1 + 0.04, steel)
            box_span(f"win_{nm}_head", plane_center[0] - 0.1, plane_center[0] + 0.06, y1 - 0.02, y1 + 0.06, a0 - 0.04, a1 + 0.04, steel)
            K.plane(f"win_{nm}_glass", (a1 - a0, y1 - y0), (plane_center[0], (y0 + y1) / 2, (a0 + a1) / 2), glass, normal="x")
    # front-west office band (x -8.4..-5.6) — visible from the lane with the desks behind it
    band("front_w", -8.4, -5.6, 1.1, 2.7, (0, 0, z1 + 0.04), "z", [(-8.44, -8.36), (-7.04, -6.96), (-5.64, -5.56)])
    # front-east workshop clerestory (x 5.6..8.4) high band
    band("front_e", 5.6, 8.4, 3.2, 4.4, (0, 0, z1 + 0.04), "z", [(5.56, 5.64), (6.96, 7.04), (8.36, 8.44)])
    # west wall office band (z -40.2..-37.6), south of the plant annex, north of the side door
    band("west", -40.2, -37.6, 1.1, 2.7, (x0 - 0.04, 0, 0), "x", [(-40.24, -40.16), (-38.94, -38.86), (-37.64, -37.56)])
    # north (ocean) band on the annex face: control windows looking over the seawall, each with
    # a lit 0.7 m control-room recess (the legacy annex behind them is a solid collider block)
    for k, (a0, a1) in enumerate(NORTH_WINDOWS):
        for jx in (a0 - 0.05, a1):
            box_span(f"win_north_{k}_jamb_{jx:.1f}", jx, jx + 0.05, 1.35, 2.85, BZ0 - 0.14, BZ0 - 0.1, steel)
        box_span(f"win_north_{k}_head", a0 - 0.05, a1 + 0.05, 2.85, 2.9, BZ0 - 0.14, BZ0 - 0.1, steel)
        K.plane(f"win_north_{k}_glass", (a1 - a0, 1.4), ((a0 + a1) / 2, 2.1, BZ0 - 0.13), glass, normal="z")
        box_span(f"win_north_{k}_sill", a0 - 0.08, a1 + 0.08, 1.3, 1.36, BZ0 - 0.2, BZ0 - 0.1, steel)
        rz0, rz1 = BZ0 - 0.1, BZ0 + 0.6                         # recess depth into the annex
        box_span(f"win_north_{k}_room_back", a0, a1, 1.36, 2.85, rz1, rz1 + 0.04, M["wall"])
        box_span(f"win_north_{k}_room_l", a0 - 0.04, a0, 1.36, 2.85, rz0, rz1 + 0.04, M["wall"])
        box_span(f"win_north_{k}_room_r", a1, a1 + 0.04, 1.36, 2.85, rz0, rz1 + 0.04, M["wall"])
        box_span(f"win_north_{k}_room_top", a0 - 0.04, a1 + 0.04, 2.85, 2.89, rz0, rz1 + 0.04, M["wall"])
        box_span(f"win_north_{k}_room_floor", a0 - 0.04, a1 + 0.04, 1.32, 1.36, rz0, rz1 + 0.04, M["grey_dark"])
        box_span(f"win_north_{k}_room_led", a0 + 0.3, a1 - 0.3, 2.83, 2.85, rz0 + 0.3, rz0 + 0.4, M["led"], tags={"castShadow": False})
        box_span(f"win_north_{k}_console", a0 + 0.15, a1 - 0.15, 1.36, 1.75, rz1 - 0.45, rz1, M["grey_dark"], bevel=0.01)
        for s, sx in enumerate((a0 + 0.55, (a0 + a1) / 2, a1 - 0.55)):
            box_span(f"win_north_{k}_screen_{s}_body", sx - 0.28, sx + 0.28, 1.78, 2.14, rz1 - 0.08, rz1 - 0.05, M["steel_black"])
            K.plane(f"win_north_{k}_screen_{s}", (0.5, 0.3), (sx, 1.96, rz1 - 0.085), M["screen"] if (s + k) % 2 else M["screen_dim"], normal="z", rot_y=math.pi, tags={"castShadow": False})


def front_openings(M):
    """Personnel entrance (x -5..-2, glazed portal, doors open) and roller bay (x 2..5, shutter rolled up)."""
    steel, glass, trim = M["steel"], M["glass"], M["trim"]
    z1 = BZ1
    dw0, dw1 = DOOR_W
    # portal frame + open double doors folded against the jambs; transom light above 2.9
    for jx in (dw0, dw1 - 0.1):
        box_span(f"entry_jamb_{jx:.1f}", jx, jx + 0.1, 0.25, 4.9, z1 - 0.3, z1 + 0.14, steel)
    box_span("entry_transom_rail", dw0, dw1, 2.9, 3.0, z1 - 0.3, z1 + 0.14, steel)
    K.plane("entry_transom_glass", (dw1 - dw0 - 0.2, 1.85), ((dw0 + dw1) / 2, 3.95, z1 + 0.02), glass, normal="z")
    box_span("entry_head", dw0 - 0.1, dw1 + 0.1, 4.9, 5.02, z1 - 0.3, z1 + 0.16, trim)
    for k, (lx0, lx1) in enumerate(((dw0 + 0.1, dw0 + 0.16), (dw1 - 0.16, dw1 - 0.1))):
        # leaves swung 90 degrees outward, flat against the piers outside the opening
        box_span(f"entry_leaf_{k}", lx0 - (0.0 if k else 0.0), lx1, 0.27, 2.85, z1 + 0.14, z1 + 1.44, steel)
        K.plane(f"entry_leaf_{k}_glass", (1.1, 1.6), ((lx0 + lx1) / 2, 1.75, z1 + 0.8), glass, normal="x")
        box_span(f"entry_leaf_{k}_pull", lx0 - 0.03, lx1 + 0.03, 0.95, 1.35, z1 + 1.2, z1 + 1.26, M["steel_black"])
    box_span("entry_mat", dw0 + 0.25, dw1 - 0.25, 0.25, 0.258, z1 - 0.1, z1 + 1.1, M["rubber"], tags={"castShadow": False})
    box_span("entry_lamp_a", dw0 - 0.5, dw0 - 0.2, 3.4, 3.55, z1 + 0.12, z1 + 0.42, M["steel_black"], bevel=0.01)
    K.plane("entry_lamp_a_glow", (0.24, 0.24), (dw0 - 0.35, 3.395, z1 + 0.27), M["lamp"], normal="y", tags={"castShadow": False})
    box_span("entry_lamp_b", dw1 + 0.2, dw1 + 0.5, 3.4, 3.55, z1 + 0.12, z1 + 0.42, M["steel_black"], bevel=0.01)
    K.plane("entry_lamp_b_glow", (0.24, 0.24), (dw1 + 0.35, 3.395, z1 + 0.27), M["lamp"], normal="y", tags={"castShadow": False})
    # roller bay: guides, rolled-up curtain drum in a hood at 4.5..5.0, threshold, bumpers
    de0, de1 = DOOR_E
    for gx in (de0, de1 - 0.12):
        box_span(f"bay_guide_{gx:.1f}", gx, gx + 0.12, 0.25, 4.5, z1 - 0.32, z1 + 0.14, steel)
    box_span("bay_hood", de0 - 0.15, de1 + 0.15, 4.5, 5.0, z1 - 0.34, z1 + 0.3, M["clad_grey"], bevel=0.02)
    K.cylinder("bay_drum", 0.19, de1 - de0 - 0.1, ((de0 + de1) / 2, 4.74, z1 - 0.02), M["steel_black"], segments=12, axis="x")
    for k in range(9):
        # the last slats of the rolled curtain hanging below the drum
        box_span(f"bay_slat_{k}", de0 + 0.14, de1 - 0.14, 4.5 - (k + 1) * 0.055, 4.5 - k * 0.055, z1 - 0.06, z1 - 0.02, M["clad_grey"] if k % 2 else M["grey_dark"])
    box_span("bay_threshold", de0 - 0.1, de1 + 0.1, 0.25, 0.258, z1 - 0.34, z1 + 0.14, steel, tags={"castShadow": False})
    for bx in (de0 - 0.35, de1 + 0.35):
        K.cylinder(f"bay_bumper_{bx:.1f}", 0.09, 0.9, (bx, 0.67, z1 + 0.35), M["safety_yellow"], segments=10)
        K.cylinder(f"bay_bumper_{bx:.1f}_band", 0.095, 0.15, (bx, 0.6, z1 + 0.35), M["steel_black"], segments=10)
    box_span("bay_lamp", (de0 + de1) / 2 - 0.25, (de0 + de1) / 2 + 0.25, 5.1, 5.25, z1 + 0.12, z1 + 0.45, M["steel_black"], bevel=0.01)
    K.plane("bay_lamp_glow", (0.4, 0.28), ((de0 + de1) / 2, 5.095, z1 + 0.28), M["lamp"], normal="y", tags={"castShadow": False})
    # restrained cyan status light strip above the office windows + the sign lightbox lives on the parapet
    box_span("status_housing", -8.6, -5.4, 2.98, 3.1, z1 + 0.1, z1 + 0.2, M["steel_black"])
    box_span("status_strip", -8.5, -5.5, 3.0, 3.06, z1 + 0.2, z1 + 0.215, M["status"], tags={"castShadow": False, "ambientMotion": "status-pulse"})
    # west side door: open steel door with hood, lamp and a small drainage grate
    sz0, sz1 = SIDE_DOOR_Z
    x0 = BX0
    box_span("side_frame_a", x0 - 0.16, x0 + 0.1, 0.25, 3.5, sz0 - 0.1, sz0, M["steel"])
    box_span("side_frame_b", x0 - 0.16, x0 + 0.1, 0.25, 3.5, sz1, sz1 + 0.1, M["steel"])
    box_span("side_head", x0 - 0.16, x0 + 0.1, 3.4, 3.52, sz0 - 0.1, sz1 + 0.1, M["steel"])
    box_span("side_leaf", x0 - 0.22, x0 - 0.18, 0.27, 3.3, sz1 - 1.9, sz1 + 0.0, M["trim"], bevel=0.01)   # swung open along the wall
    box_span("side_hood", x0 - 0.9, x0 - 0.1, 3.6, 3.7, sz0 - 0.4, sz1 + 0.4, M["clad_grey"], bevel=0.01)
    for hz in (sz0 - 0.3, sz1 + 0.3):
        bar(f"side_hood_strut_{hz:.0f}", (x0 - 0.85, 3.6, hz), (x0 - 0.1, 4.3, hz), 0.05, M["steel"])
    K.plane("side_lamp_glow", (0.3, 0.16), (x0 - 0.5, 3.595, (sz0 + sz1) / 2), M["lamp"], normal="y", tags={"castShadow": False})
    grate("side_drain", x0 - 0.7, (sz0 + sz1) / 2, 0.5, 1.6)
    # instanced fixtures hung on the cladding: wall lamps with warm glow
    for k, (lx, lz, nrm) in enumerate(((x0 - 0.1, -41.5, "-x"), (x0 - 0.1, -31.0, "-x"), (BX1 + 0.1, -40.0, "+x"), (BX1 + 0.1, -31.5, "+x"))):
        dx = -0.22 if nrm == "-x" else 0.22
        box_span(f"wall_lamp_{k}", min(lx, lx + dx), max(lx, lx + dx), 3.6, 3.72, lz - 0.1, lz + 0.1, M["steel_black"], bevel=0.01)
        K.plane(f"wall_lamp_{k}_glow", (0.16, 0.16), (lx + dx / 2, 3.595, lz), M["lamp"], normal="y", tags={"castShadow": False})


def roof_and_parapets(M):
    """Roof deck 7..7.3 (legacy slabs, square stair hole 3.7..8.3 × -40.3..-35.7), 1.1 m parapets
    on the front/left/right rails, open back edge (legacy: no rail), plant annex step."""
    steel, navy_dark, concrete = M["steel"], M["navy_dark"], M["concrete"]
    sx, sz, _r, _n, _a = SPIRAL
    hx0, hx1, hz0, hz1 = sx - HOLE_R, sx + HOLE_R, sz - HOLE_R, sz + HOLE_R
    rz0, rz1 = BZ0 + 1.5, BZ1 + 0.5          # -41.5 .. -28.5 (legacy roof colliders)
    rx0, rx1 = BX0 - 0.5, BX1 + 0.5
    # membrane roof in four panels around the stair hole
    box_span("roof_w", rx0, hx0, BH, ROOF_TOP, rz0, rz1, navy_dark)
    box_span("roof_e", hx1, rx1, BH, ROOF_TOP, rz0, rz1, navy_dark)
    box_span("roof_n", hx0, hx1, BH, ROOF_TOP, rz0, hz0, navy_dark)
    box_span("roof_s", hx0, hx1, BH, ROOF_TOP, hz1, rz1, navy_dark)
    box_span("roof_fascia_s", rx0 - 0.03, rx1 + 0.03, BH - 0.3, ROOF_TOP + 0.02, rz1 - 0.03, rz1 + 0.03, M["clad_grey"])
    for nm, (a0, a1) in {"w": (rx0 - 0.03, rx0 + 0.03), "e": (rx1 - 0.03, rx1 + 0.03)}.items():
        box_span(f"roof_fascia_{nm}", a0, a1, BH - 0.3, ROOF_TOP + 0.02, rz0 - 0.03, rz1 + 0.03, M["clad_grey"])
    # stair hole trim + hatch-style kerb and the legacy railing ring (six posts, top rail)
    for nm, (a0, a1, b0, b1) in {"w": (hx0 - 0.1, hx0, hz0 - 0.1, hz1 + 0.1), "e": (hx1, hx1 + 0.1, hz0 - 0.1, hz1 + 0.1),
                                 "n": (hx0, hx1, hz0 - 0.1, hz0), "s": (hx0, hx1, hz1, hz1 + 0.1)}.items():
        box_span(f"hole_kerb_{nm}", a0, a1, ROOF_TOP, ROOF_TOP + 0.12, b0, b1, steel)
        box_span(f"hole_kerb_{nm}_band", a0 - 0.002, a1 + 0.002, ROOF_TOP + 0.05, ROOF_TOP + 0.09, b0 - 0.002, b1 + 0.002, M["paint_yellow"], tags={"castShadow": False})
    ring_r = HOLE_R + 0.15
    pts = [(sx + math.cos(math.tau * i / 6) * ring_r, sz + math.sin(math.tau * i / 6) * ring_r) for i in range(6)]
    for i, (px, pz) in enumerate(pts):
        K.cylinder(f"hole_rail_post_{i}", 0.035, 1.0, (px, BH + 0.5 + 0.3, pz), steel, segments=6)
        qx, qz = pts[(i + 1) % 6]
        tube(f"hole_rail_top_{i}", (px, BH + 1.3, pz), (qx, BH + 1.3, qz), 0.03, steel)
        tube(f"hole_rail_mid_{i}", (px, BH + 0.85, pz), (qx, BH + 0.85, qz), 0.02, steel)
    # parapets 1.1 m on the legacy rail boxes: front (z -29.15..-28.85) and both sides (x ±9)
    box_span("parapet_s", BX0, BX1, BH, BH + 1.1, BZ1 - 0.15, BZ1 + 0.15, concrete, bevel=0.02)
    box_span("parapet_w", BX0 - 0.15, BX0 + 0.15, BH, BH + 1.1, rz0 + 0.5, BZ1, concrete, bevel=0.02)
    box_span("parapet_e", BX1 - 0.15, BX1 + 0.15, BH, BH + 1.1, rz0 + 0.5, BZ1, concrete, bevel=0.02)
    for nm, (a0, a1, b0, b1) in {"s": (BX0 - 0.02, BX1 + 0.02, BZ1 - 0.17, BZ1 + 0.17), "w": (BX0 - 0.17, BX0 + 0.17, rz0 + 0.48, BZ1),
                                 "e": (BX1 - 0.17, BX1 + 0.17, rz0 + 0.48, BZ1)}.items():
        box_span(f"parapet_cap_{nm}", a0, a1, BH + 1.1, BH + 1.16, b0, b1, steel)
    # open back edge: the legacy deck stops at z -41.5 with no rail — a drainage gutter and a
    # warning stripe mark the drop to the plant annex (wall top 7.0) and the sea behind it
    box_span("roof_gutter_n", rx0, rx1, BH + 0.24, BH + 0.32, rz0, rz0 + 0.18, steel)
    paint("roof_edge_stripe", rx0 + 0.2, rx1 - 0.2, rz0 + 0.2, rz0 + 0.5, M["paint_yellow"], y=ROOF_TOP + 0.006)
    box_span("annex_roof", BX0 - 0.12, BX1 + 0.12, BH - 0.05, BH, BZ0 - 0.12, rz0, M["clad_grey"])
    for k in range(4):
        px = BX0 + 2.2 + k * 4.5
        box_span(f"annex_skylight_{k}", px, px + 1.4, BH, BH + 0.22, BZ0 + 0.35, rz0 - 0.35, M["grey_dark"], bevel=0.02)
        K.plane(f"annex_skylight_{k}_glass", (1.2, 0.8), (px + 0.7, BH + 0.225, (BZ0 + rz0) / 2), M["glass"], normal="y")
    # gutter along the front fascia and two downspouts at the front corners
    tube("gutter_s", (rx0 + 0.1, BH - 0.35, rz1 + 0.12), (rx1 - 0.1, BH - 0.35, rz1 + 0.12), 0.06, steel)
    for gx in (BX0 - 0.02, BX1 + 0.02):
        tube(f"downspout_{gx:.0f}", (gx, BH - 0.4, rz1 + 0.1), (gx, 0.3, BZ1 + 0.2), 0.045, steel)
        box_span(f"downspout_foot_{gx:.0f}", gx - 0.07, gx + 0.07, 0.0, 0.3, BZ1 + 0.12, BZ1 + 0.3, steel)
    # sign lightbox straddling the front parapet, face toward the lane (+z); it encloses the
    # legacy rooftop counter box (-0.55..4.55 × 7.25..8.4 × -29.45..-28.55)
    box_span("sign_box_body", -4.6, 8.6, BH + 0.35, BH + 1.45, BZ1 - 0.46, BZ1 + 0.44, M["steel_black"], bevel=0.01)
    box_span("sign_box_face", -4.6, 8.6, BH + 0.35, BH + 1.45, BZ1 + 0.44, BZ1 + 0.5, M["navy_paint"])
    box_span("sign_box_frame", -4.65, 8.65, BH + 0.32, BH + 1.48, BZ1 + 0.5, BZ1 + 0.52, M["trim"])
    box_span("sign_backlight", -4.5, 8.5, BH + 0.36, BH + 0.38, BZ1 + 0.42, BZ1 + 0.5, M["led"], tags={"castShadow": False})
    text_mesh("sign_text", "HARBOR OPERATIONS", 0.72, (2.0, BH + 0.9, BZ1 + 0.53), M["led"], max_width=12.2)
    for k in range(4):
        sx_ = -3.9 + k * 3.7
        bar(f"sign_brace_{k}", (sx_, BH + 1.45, BZ1 - 0.4), (sx_, ROOF_TOP, BZ1 - 1.3), 0.04, steel)


def rooftop_equipment(M):
    """Dress the legacy roof-deck boxes: condensers, vent fan cowl (spinning rotor), cable
    skids, equipment boxes, vent stacks, antenna mast."""
    steel, steel_black, grey = M["steel"], M["steel_black"], M["grey"]
    ry = BH + 0.25
    # 424 / 425: AC condensers (1.1 cubes, 7.25..8.04)
    for k, (cx0, cx1, cz0, cz1) in enumerate(((-2.55, -1.45, -37.55, -36.45), (0.45, 1.55, -33.55, -32.45))):
        box_span(f"roof_cond_{k}_feet", cx0 + 0.1, cx1 - 0.1, ry, ry + 0.08, cz0 + 0.1, cz1 - 0.1, steel_black)
        box_span(f"roof_cond_{k}", cx0, cx1, ry + 0.08, ry + 0.79, cz0, cz1, grey, bevel=0.02)
        for f in range(6):
            box_span(f"roof_cond_{k}_fin_{f}", cx0 + 0.05, cx1 - 0.05, ry + 0.16 + f * 0.1, ry + 0.18 + f * 0.1, cz1 - 0.005, cz1 + 0.012, steel_black)
        K.cylinder(f"roof_cond_{k}_fan", 0.36, 0.03, ((cx0 + cx1) / 2, ry + 0.8, (cz0 + cz1) / 2), steel_black, segments=12)
        tube(f"roof_cond_{k}_pipe", ((cx0 + cx1) / 2, ry + 0.4, cz0), ((cx0 + cx1) / 2, ry + 0.4, cz0 - 0.9), 0.025, steel)
    # 420: round vent cowl with a spinning rotor (was the fire pit, cylinder r 0.4 at -5.7,-32.5)
    vx, vz = -5.7, -32.5
    K.cylinder("roof_vent_cowl", 0.4, 0.3, (vx, ry + 0.15, vz), grey, segments=16)
    K.cylinder("roof_vent_ring", 0.42, 0.05, (vx, ry + 0.3, vz), steel_black, segments=16)
    K.cylinder("roof_vent_stack", 0.34, 0.5, (vx, ry + 0.55, vz), M["clad_grey"], segments=16)
    K.cylinder("roof_vent_hood", 0.46, 0.06, (vx, ry + 0.86, vz), steel_black, segments=16)
    for k in range(4):
        a = math.tau * k / 4
        bar(f"roof_vent_leg_{k}", (vx + math.cos(a) * 0.3, ry + 0.8, vz + math.sin(a) * 0.3), (vx + math.cos(a) * 0.42, ry + 0.86, vz + math.sin(a) * 0.42), 0.02, steel_black)
    rotor("roof_vent_rotor", (vx, ry + 0.82, vz), 0.3, 5, M["grey_dark"], axis="y", rpm=24.0)
    # 418 / 419: L-shaped sofa -> cable tray skid and pipe skid (0.35 tall)
    box_span("roof_skid_a", -7.95, -4.45, ry, ry + 0.12, -35.6, -34.8, steel_black)
    for k in range(3):
        tube(f"roof_skid_a_pipe_{k}", (-7.9, ry + 0.24, -35.45 + k * 0.25), (-4.5, ry + 0.24, -35.45 + k * 0.25), 0.055, steel)
    box_span("roof_skid_a_rail", -7.95, -4.45, ry + 0.32, ry + 0.35, -35.6, -34.8, M["safety_yellow"])
    box_span("roof_skid_b", -8.6, -7.8, ry, ry + 0.35, -35.1, -32.9, M["clad_grey"], bevel=0.02)
    for k in range(3):
        box_span(f"roof_skid_b_vent_{k}", -8.62, -8.6, ry + 0.08 + k * 0.08, ry + 0.11 + k * 0.08, -35.0, -33.0, steel_black)
    # 421 / 422: lounge chairs -> equipment boxes (0.7 × 0.3 × 0.7 at z -31.85..-31.15)
    for k, cx in enumerate((-6.85, -5.25)):
        box_span(f"roof_box_{k}", cx, cx + 0.7, ry, ry + 0.3, -31.85, -31.15, M["rust_box"], bevel=0.02)
        box_span(f"roof_box_{k}_lid", cx - 0.02, cx + 0.72, ry + 0.3, ry + 0.33, -31.87, -31.13, steel_black)
    # 427 / 428 vent stacks, 426 antenna mast base at the front edge (mast has no collider above)
    for k, (cx, cz, r, h) in enumerate(((-7.7, -37.2, 0.22, 0.5), (7.7, -34.0, 0.11, 0.3))):
        K.cylinder(f"roof_stack_{k}", r, h, (cx, ry + h / 2, cz), steel, segments=10)
        K.cylinder(f"roof_stack_{k}_cap", r + 0.05, 0.05, (cx, ry + h + 0.03, cz), steel_black, segments=10)
    # antenna mast on the sign box (the small legacy box 426 sits inside the sign body)
    mast_y0 = BH + 1.45
    K.cylinder("mast_base", 0.15, 0.2, (4.2, mast_y0 + 0.1, BZ1 - 0.05), steel, segments=8)
    tube("mast", (4.2, mast_y0 + 0.2, BZ1 - 0.05), (4.2, mast_y0 + 3.2, BZ1 - 0.05), 0.04, steel)
    for k, hy in enumerate((mast_y0 + 1.9, mast_y0 + 2.6, mast_y0 + 3.1)):
        bar(f"mast_yagi_{k}", (3.7, hy, BZ1 - 0.05), (4.7, hy, BZ1 - 0.05), 0.02, steel_black)
    K.cylinder("mast_beacon", 0.06, 0.12, (4.2, mast_y0 + 3.26, BZ1 - 0.05), M["beacon"], segments=8, tags={"castShadow": False, "ambientMotion": "beacon-flash"})
    # cable tray from the condensers to the annex + conduit down the west parapet
    tube("roof_conduit", (-2.0, ry + 0.1, -37.6), (-2.0, ry + 0.1, -41.3), 0.03, steel)
    tube("roof_conduit_b", (1.0, ry + 0.1, -33.6), (1.0, ry + 0.1, -41.3), 0.03, steel)
    # steam from the annex vent (visual-only cards, sway)
    for k in range(3):
        K.plane(f"steam_{k}", (0.9 + k * 0.3, 1.2 + k * 0.4), (-7.7, ry + 1.0 + k * 0.55, -37.2), M["steam"], normal="z", rot_y=k * 1.1,
                tags={"castShadow": False, "ambientMotion": "sway-shrub", "ignoreWeaponRaycast": True})


def exterior_fixtures(M):
    """East wall: extractor fan with spinning rotor, conduit; front: wall-mounted condenser."""
    steel, steel_black, grey = M["steel"], M["steel_black"], M["grey"]
    x1 = BX1
    # extractor fan housing on the east wall (workshop), rotor spins about the wall normal (x)
    box_span("ext_fan_housing", x1 + 0.12, x1 + 0.42, 3.4, 4.3, -38.75, -37.85, grey, bevel=0.02)
    K.cylinder("ext_fan_ring", 0.42, 0.06, (x1 + 0.45, 3.85, -38.3), steel_black, segments=16, axis="x")
    rotor("ext_fan_rotor", (x1 + 0.47, 3.85, -38.3), 0.34, 6, M["grey_dark"], axis="x", rpm=40.0)
    for k in range(5):
        box_span(f"ext_fan_guard_{k}", x1 + 0.48, x1 + 0.5, 3.45 + k * 0.2, 3.47 + k * 0.2, -38.7, -37.9, steel_black)
    tube("conduit_e", (x1 + 0.14, 2.2, -36.0), (x1 + 0.14, 5.8, -36.0), 0.03, steel)
    tube("conduit_e2", (x1 + 0.14, 5.8, -36.0), (x1 + 0.14, 5.8, -38.3), 0.03, steel)
    box_span("meter_box_e", x1 + 0.12, x1 + 0.28, 1.4, 1.9, -36.3, -35.7, grey, bevel=0.01)
    # wall-mounted condenser on the front (east pier) with bracket, like the reference
    box_span("front_cond_bracket", 6.2, 7.4, 3.9, 3.95, BZ1 + 0.12, BZ1 + 0.55, steel_black)
    box_span("front_cond", 6.2, 7.4, 3.95, 4.7, BZ1 + 0.12, BZ1 + 0.55, grey, bevel=0.02)
    K.cylinder("front_cond_fan", 0.3, 0.03, (6.8, 4.325, BZ1 + 0.57), steel_black, segments=12, axis="z")
    for f in range(4):
        box_span(f"front_cond_fin_{f}", 6.25, 7.35, 4.05 + f * 0.14, 4.07 + f * 0.14, BZ1 + 0.55, BZ1 + 0.565, steel_black)
    tube("front_cond_pipe", (6.8, 3.9, BZ1 + 0.3), (6.8, 2.0, BZ1 + 0.3), 0.02, steel)


# --------------------------------------------------------------------------- #
# Interior — control office (west) + workshop (east) on the legacy furniture boxes
# --------------------------------------------------------------------------- #

FLOOR = 0.25


def build_interior(M):
    interior_shell(M)
    office(M)
    workshop(M)
    spiral_stair(M)
    sweep("OPERATIONS_INTERIOR")


def interior_shell(M):
    x0, x1, z0, z1 = IX0, IX1, IZ0, IZ1
    wall, dado, steel = M["wall"], M["wall_dado"], M["steel"]
    px0, px1 = PARTITION_X
    # floors: sealed concrete in the office, darker epoxy in the workshop, expansion joints
    box_span("floor_office", x0, px0, FLOOR - 0.02, FLOOR + 0.002, z0, z1, M["floor"])
    box_span("floor_shop", px1, x1, FLOOR - 0.02, FLOOR + 0.002, z0, z1, M["floor_shop"])
    for k, jz in enumerate((-38.6, -36.0, -33.4, -30.8)):
        paint(f"floor_joint_{k}", x0, x1, jz - 0.006, jz + 0.006, M["trim"], y=FLOOR + 0.003)
    paint("floor_route", px1 + 0.2, px1 + 0.32, z0 + 0.3, z1 - 0.2, M["paint_yellow"], y=FLOOR + 0.004)   # roller route edge line
    paint("floor_route_b", 1.9, 2.02, z0 + 0.3, z1 - 0.2, M["paint_yellow"], y=FLOOR + 0.004)
    # linings: painted wall with dark dado; the legacy 7 m walls are the shell colliders
    box_span("lining_n", x0, x1, FLOOR, BH, z0, z0 + 0.04, wall)
    box_span("lining_w_a", x0, x0 + 0.04, FLOOR, BH, z0, SIDE_DOOR_Z[0], wall)
    box_span("lining_w_b", x0, x0 + 0.04, FLOOR, BH, SIDE_DOOR_Z[1], z1, wall)
    box_span("lining_w_head", x0, x0 + 0.04, 3.5, BH, SIDE_DOOR_Z[0], SIDE_DOOR_Z[1], wall)
    box_span("lining_e", x1 - 0.04, x1, FLOOR, BH, z0, z1, wall)
    box_span("lining_s_a", x0, DOOR_W[0], FLOOR, BH, z1 - 0.04, z1, wall)
    box_span("lining_s_b", DOOR_W[1], DOOR_E[0], FLOOR, BH, z1 - 0.04, z1, wall)
    box_span("lining_s_c", DOOR_E[1], x1, FLOOR, BH, z1 - 0.04, z1, wall)
    box_span("lining_s_head_w", DOOR_W[0], DOOR_W[1], 5.0, BH, z1 - 0.04, z1, wall)
    box_span("lining_s_head_e", DOOR_E[0], DOOR_E[1], 5.0, BH, z1 - 0.04, z1, wall)
    for nm, (a0, a1, b0, b1) in {"n": (x0, x1, z0 + 0.04, z0 + 0.06), "w": (x0 + 0.04, x0 + 0.06, z0, z1), "e": (x1 - 0.06, x1 - 0.04, z0, z1)}.items():
        box_span(f"dado_{nm}", a0, a1, FLOOR, FLOOR + 1.0, b0, b1, dado)
    # exposed roof structure: purlins under the deck, a lower suspended light rail at 4.3 in the office
    for k, bz in enumerate((-39.6, -37.0, -34.4, -31.8)):
        box_span(f"beam_{k}", x0, x1, BH - 0.45, BH - 0.05, bz - 0.12, bz + 0.12, steel)
    for k, bx in enumerate((-6.0, -1.0, 4.0)):
        box_span(f"purlin_{k}", bx - 0.05, bx + 0.05, BH - 0.25, BH - 0.05, z0, z1, steel)
    # partial glazed partition office/workshop: base cabinet band 0..1.0, glass 1.0..2.6, panel
    # above, door opening z -36.3..-35.3; it stops at z -34.4 so the front hall (z -34.4..-29.15)
    # is one shared space and the loop office ↔ partition door ↔ workshop ↔ hall stays ≥ 1.9 m wide
    dz0, dz1 = -36.3, -35.3
    pz_end = PARTITION_END_Z
    for nm, (a0, a1) in {"n": (z0, dz0), "s": (dz1, pz_end)}.items():
        box_span(f"part_base_{nm}", px0, px1, FLOOR, FLOOR + 1.0, a0, a1, M["navy_paint"])
        K.plane(f"part_glass_{nm}", (a1 - a0, 1.6), ((px0 + px1) / 2, FLOOR + 1.8, (a0 + a1) / 2), M["glass"], normal="x")
        box_span(f"part_head_{nm}", px0 - 0.02, px1 + 0.02, FLOOR + 2.6, FLOOR + 2.7, a0, a1, steel)
        box_span(f"part_upper_{nm}", px0, px1, FLOOR + 2.7, BH - 0.45, a0, a1, wall)
        box_span(f"part_rail_{nm}", px0 - 0.02, px1 + 0.02, FLOOR + 1.0, FLOOR + 1.06, a0, a1, steel)
    for jz in (dz0 - 0.06, dz1):
        box_span(f"part_jamb_{jz:.1f}", px0 - 0.03, px1 + 0.03, FLOOR, FLOOR + 2.15, jz, jz + 0.06, steel)
    box_span("part_door_head", px0 - 0.03, px1 + 0.03, FLOOR + 2.15, FLOOR + 2.7, dz0 - 0.06, dz1 + 0.06, wall)
    # sliding door leaf parked open on the office side of the south panel (track above)
    box_span("part_door_leaf", px0 - 0.06, px0 - 0.02, FLOOR + 0.02, FLOOR + 2.1, dz1 + 0.02, dz1 + 0.9, M["trim"])
    K.plane("part_door_glass", (0.5, 0.8), (px0 - 0.065, FLOOR + 1.5, dz1 + 0.46), M["glass"], normal="x")
    box_span("part_door_track", px0 - 0.08, px0, FLOOR + 2.1, FLOOR + 2.16, dz0 - 0.06, dz1 + 0.96, steel)
    # end post of the partial partition
    box_span("part_end_post", px0 - 0.03, px1 + 0.03, FLOOR, BH - 0.45, pz_end, pz_end + 0.06, steel)
    # LED panels: office 2 x 3 at 4.3 on hangers, workshop 2 x 3 tube fixtures at 4.6
    for gx in (-6.6, -3.4):
        for gz in (-39.2, -36.4, -33.6, -30.8):
            box_span(f"led_office_{gx:.0f}_{gz:.0f}", gx - 0.3, gx + 0.3, 4.3, 4.34, gz - 0.6, gz + 0.6, M["led"], tags={"castShadow": False})
            box_span(f"led_office_{gx:.0f}_{gz:.0f}_frame", gx - 0.33, gx + 0.33, 4.34, 4.38, gz - 0.63, gz + 0.63, M["white"], tags={"castShadow": False})
            for hx in (gx - 0.25, gx + 0.25):
                tube(f"led_office_{gx:.0f}_{gz:.0f}_hang_{hx:.1f}", (hx, 4.38, gz), (hx, BH - 0.45, gz), 0.01, steel)
    for gx in (1.0, 3.8, 7.0):
        for gz in (-39.5, -35.5, -31.5):
            box_span(f"led_shop_{gx:.0f}_{gz:.0f}_body", gx - 0.08, gx + 0.08, 4.6, 4.7, gz - 0.75, gz + 0.75, M["steel_black"])
            box_span(f"led_shop_{gx:.0f}_{gz:.0f}", gx - 0.06, gx + 0.06, 4.58, 4.6, gz - 0.72, gz + 0.72, M["white_cool"], tags={"castShadow": False})
            for hz in (gz - 0.6, gz + 0.6):
                tube(f"led_shop_{gx:.0f}_{gz:.0f}_hang_{hz:.0f}", (gx, 4.7, hz), (gx, BH - 0.45, hz), 0.01, steel)
    # exposed duct along the north wall and down into the plant annex
    tube("duct_n", (x0 + 0.5, BH - 0.8, z0 + 0.45), (x1 - 0.5, BH - 0.8, z0 + 0.45), 0.22, M["clad_grey"], segments=12)
    for k, dx in enumerate((-6.0, 2.0)):
        box_span(f"duct_diffuser_{k}", dx - 0.4, dx + 0.4, BH - 1.02, BH - 0.8, z0 + 0.1, z0 + 0.8, M["grey"])
    # emergency phone and notice board next to the personnel door, fire hose reel in the shop
    box_span("emergency_phone", -6.4, -6.0, FLOOR + 1.1, FLOOR + 1.45, z1 - 0.16, z1 - 0.04, M["safety_red"], bevel=0.01)
    box_span("emergency_phone_handset", -6.35, -6.05, FLOOR + 1.45, FLOOR + 1.52, z1 - 0.15, z1 - 0.05, M["steel_black"])
    box_span("notice_board", -8.2, -6.8, FLOOR + 1.2, FLOOR + 2.1, z1 - 0.07, z1 - 0.04, M["cork"])
    for k in range(5):
        box_span(f"notice_{k}", -8.1 + k * 0.27, -7.9 + k * 0.27, FLOOR + 1.35 + (k % 2) * 0.3, FLOOR + 1.62 + (k % 2) * 0.3, z1 - 0.075, z1 - 0.07, M["paper"], tags={"castShadow": False})


def office(M):
    """Control office (x -8.8..-1.5) on the legacy DJ booth / table / chair / crate boxes."""
    steel, steel_black, timber = M["steel"], M["steel_black"], M["timber"]
    desk_top = M["grey"]
    # 369: main control desk 2.1 × 0.9 (x -7.05..-4.95, z -38.45..-37.55), 370/371 racks flanking it
    box_span("ctrl_desk_top", -7.05, -4.95, FLOOR + 0.72, FLOOR + 0.78, -38.45, -37.55, desk_top, bevel=0.005)
    box_span("ctrl_desk_modesty", -7.0, -5.0, FLOOR + 0.1, FLOOR + 0.72, -38.42, -38.35, M["navy_paint"])
    for lx in (-7.02, -4.98 - 0.04):
        box_span(f"ctrl_desk_leg_{lx:.1f}", lx, lx + 0.04, FLOOR, FLOOR + 0.72, -38.42, -37.58, steel_black)
    box_span("ctrl_desk_riser", -6.95, -5.05, FLOOR + 0.78, FLOOR + 0.95, -38.45, -38.3, M["trim"])
    for k, mx in enumerate((-6.75, -6.05, -5.35)):
        box_span(f"ctrl_monitor_{k}", mx - 0.3, mx + 0.3, FLOOR + 0.95, FLOOR + 1.38, -38.42, -38.39, steel_black)
        K.plane(f"ctrl_screen_{k}", (0.56, 0.38), (mx, FLOOR + 1.165, -38.385), M["screen"] if k != 1 else M["screen_dim"], normal="z", tags={"castShadow": False})
        # abstract CCTV split: two darker quads on the centre screen
    for k, (sx0, sx1) in enumerate(((-6.32, -6.08), (-6.02, -5.78))):
        K.plane(f"ctrl_cctv_{k}", (0.22, 0.14), ((sx0 + sx1) / 2, FLOOR + 1.1, -38.38), M["screen_dim"], normal="z", tags={"castShadow": False})
    box_span("ctrl_keyboard", -6.4, -5.9, FLOOR + 0.78, FLOOR + 0.8, -37.95, -37.8, steel_black)
    box_span("ctrl_radio", -5.3, -4.98, FLOOR + 0.78, FLOOR + 0.98, -38.1, -37.75, M["grey_dark"], bevel=0.01)
    tube("ctrl_radio_antenna", (-5.1, FLOOR + 0.98, -38.0), (-5.1, FLOOR + 1.4, -38.0), 0.006, steel_black)
    K.plane("ctrl_radio_led", (0.08, 0.03), (-5.14, FLOOR + 0.9, -37.745), M["green"], normal="z", tags={"castShadow": False})
    box_span("ctrl_mug", -6.9, -6.82, FLOOR + 0.78, FLOOR + 0.88, -37.75, -37.67, M["white"])
    for k, rx in enumerate((-7.75, -4.75)):   # 370/371: equipment racks 0.5 × 0.8 tall × 0.4
        box_span(f"rack_{k}", rx - 0.25, rx + 0.25, FLOOR, FLOOR + 0.8, -38.2, -37.8, M["grey_dark"], bevel=0.01)
        for s in range(4):
            box_span(f"rack_{k}_unit_{s}", rx - 0.22, rx + 0.22, FLOOR + 0.1 + s * 0.17, FLOOR + 0.24 + s * 0.17, -37.8, -37.785, M["steel_black"])
            K.plane(f"rack_{k}_led_{s}", (0.03, 0.02), (rx + 0.17, FLOOR + 0.17 + s * 0.17, -37.78), M["green"] if s % 2 else M["amber"], normal="z", tags={"castShadow": False})
    # 351: second control desk 1.3 × 0.9 (x -4.65..-3.35, z -37.95..-37.05) with radios/chart plotter; chairs 352/353
    box_span("desk2_top", -4.65, -3.35, FLOOR + 0.72, FLOOR + 0.78, -37.95, -37.05, desk_top, bevel=0.005)
    for lx in (-4.62, -3.42):
        box_span(f"desk2_leg_{lx:.1f}", lx, lx + 0.04, FLOOR, FLOOR + 0.72, -37.92, -37.08, steel_black)
    box_span("desk2_monitor", -4.3, -3.7, FLOOR + 0.82, FLOOR + 1.2, -37.9, -37.87, steel_black)
    K.plane("desk2_screen", (0.54, 0.32), (-4.0, FLOOR + 1.01, -37.865), M["screen"], normal="z", tags={"castShadow": False})
    box_span("desk2_monitor_foot", -4.05, -3.95, FLOOR + 0.78, FLOOR + 0.82, -37.88, -37.7, steel_black)
    box_span("desk2_radio", -4.6, -4.35, FLOOR + 0.78, FLOOR + 0.92, -37.6, -37.3, M["grey_dark"], bevel=0.01)
    tube("desk2_radio_antenna", (-4.45, FLOOR + 0.92, -37.45), (-4.45, FLOOR + 1.3, -37.45), 0.006, steel_black)
    box_span("desk2_papers", -3.75, -3.45, FLOOR + 0.78, FLOOR + 0.795, -37.5, -37.2, M["paper"], tags={"castShadow": False})
    for k, cx in enumerate((-4.8, -3.2)):   # chairs on the legacy seat plates (seat 0.55..0.61)
        office_chair(f"chair_a_{k}", cx, -37.5, M)
    # 357: filing cabinet / plan chest 1.3 × 0.9 × 0.8 (x -4.65..-3.35, z -33.95..-33.05); chairs 358/359 -> stools
    box_span("plan_chest", -4.65, -3.35, FLOOR, FLOOR + 0.8, -33.95, -33.05, M["grey"], bevel=0.01)
    for d in range(4):
        box_span(f"plan_chest_drawer_{d}", -4.6, -3.4, FLOOR + 0.08 + d * 0.18, FLOOR + 0.22 + d * 0.18, -33.06, -33.05, M["grey_dark"])
        box_span(f"plan_chest_handle_{d}", -4.15, -3.85, FLOOR + 0.14 + d * 0.18, FLOOR + 0.16 + d * 0.18, -33.05, -33.03, steel_black)
    box_span("plan_chest_top_chart", -4.55, -3.45, FLOOR + 0.8, FLOOR + 0.81, -33.9, -33.1, M["chart_sea"], tags={"castShadow": False})
    for k, cx in enumerate((-4.8, -3.2)):
        stool(f"stool_a_{k}", cx, -33.5, M)
    # 363/364 NW corner: radio/server rack stack; 365: UPS box
    box_span("server_rack", -7.85, -7.15, FLOOR, 0.94, -40.35, -39.65, M["grey_dark"], bevel=0.01)
    for s in range(4):
        box_span(f"server_rack_unit_{s}", -7.8, -7.2, FLOOR + 0.08 + s * 0.16, FLOOR + 0.2 + s * 0.16, -39.65, -39.64, M["steel_black"])
        K.plane(f"server_rack_led_{s}", (0.04, 0.02), (-7.28, FLOOR + 0.14 + s * 0.16, -39.635), M["green"], normal="z", tags={"castShadow": False})
    box_span("server_rack_top", -7.75, -7.25, 0.94, 1.44, -40.25, -39.75, M["grey_dark"], bevel=0.01)
    K.plane("server_rack_top_screen", (0.4, 0.3), (-7.5, 1.2, -39.745), M["screen_dim"], normal="z", tags={"castShadow": False})
    box_span("ups_box", -7.75, -7.25, FLOOR, 0.64, -39.17, -38.83, M["steel_black"], bevel=0.01)
    K.plane("ups_led", (0.05, 0.02), (-7.5, 0.55, -38.825), M["amber"], normal="z", tags={"castShadow": False})
    # 368: fire extinguisher stand at the entrance (x -4.62..-4.38, z -29.72..-29.48, 0.24..0.64)
    K.cylinder("fire_ext_office", 0.08, 0.36, (-4.5, FLOOR + 0.2, -29.6), M["safety_red"], segments=8)
    K.cylinder("fire_ext_office_neck", 0.03, 0.06, (-4.5, FLOOR + 0.41, -29.6), steel_black, segments=6)
    box_span("fire_ext_stand", -4.6, -4.4, FLOOR, FLOOR + 0.02, -29.7, -29.5, steel_black)
    # wall dressing: harbor chart (no text) on the west wall, lockers along the west wall south of the side door
    wx = IX0 + 0.06
    box_span("chart_frame", wx, wx + 0.03, FLOOR + 1.2, FLOOR + 2.3, -33.9, -32.3, M["trim"])
    box_span("chart_sea", wx + 0.03, wx + 0.035, FLOOR + 1.25, FLOOR + 2.25, -33.85, -32.35, M["chart_sea"], tags={"castShadow": False})
    for k, (a0, a1, b0, b1) in enumerate(((-33.8, -33.2, 1.3, 1.7), (-33.5, -32.6, 1.75, 2.15), (-33.1, -32.45, 1.28, 1.55))):
        box_span(f"chart_land_{k}", wx + 0.035, wx + 0.04, FLOOR + b0, FLOOR + b1, a0, a1, M["chart_land"], tags={"castShadow": False})
    for k in range(4):
        paint_x = wx + 0.041
        box_span(f"chart_grid_{k}", paint_x, paint_x + 0.002, FLOOR + 1.25, FLOOR + 2.25, -33.7 + k * 0.4, -33.69 + k * 0.4, M["trim"], tags={"castShadow": False})
    lockers("office_locker", wx, FLOOR, -32.0, -30.2, M, facing="+x")
    K.collider("OFFICE_LOCKERS", (IX0, FLOOR, -32.0), (IX0 + 0.55, FLOOR + 1.9, -30.2))
    # coat + small side table near the door, printer
    box_span("side_table", -8.6, -8.0, FLOOR + 0.72, FLOOR + 0.76, -30.0, -29.4, timber, bevel=0.005)
    for lx, lz in ((-8.57, -29.97), (-8.05, -29.97), (-8.57, -29.45), (-8.05, -29.45)):
        box_span(f"side_table_leg_{lx:.1f}_{lz:.1f}", lx, lx + 0.03, FLOOR, FLOOR + 0.72, lz, lz + 0.03, steel_black)
    box_span("printer", -8.55, -8.05, FLOOR + 0.76, FLOOR + 1.0, -29.95, -29.5, M["grey"], bevel=0.01)


def office_chair(name, cx, cz, M):
    """Office chair whose seat sits on the legacy seat plate (0.55..0.61)."""
    steel_black, seat = M["steel_black"], M["seat"]
    box_span(f"{name}_seat", cx - 0.22, cx + 0.22, 0.55, 0.61, cz - 0.22, cz + 0.22, seat, bevel=0.01)
    box_span(f"{name}_back", cx - 0.2, cx + 0.2, 0.61, 1.05, cz - 0.24, cz - 0.19, seat, bevel=0.01)
    K.cylinder(f"{name}_post", 0.03, 0.4, (cx, 0.35, cz), steel_black, segments=6)
    for k in range(5):
        a = math.tau * k / 5
        bar(f"{name}_leg_{k}", (cx, 0.16, cz), (cx + math.cos(a) * 0.27, 0.08, cz + math.sin(a) * 0.27), 0.025, steel_black)


def stool(name, cx, cz, M):
    box_span(f"{name}_seat", cx - 0.17, cx + 0.17, 0.55, 0.61, cz - 0.17, cz + 0.17, M["seat"], bevel=0.01)
    K.cylinder(f"{name}_post", 0.025, 0.31, (cx, 0.395, cz), M["steel_black"], segments=6)
    K.cylinder(f"{name}_foot", 0.16, 0.03, (cx, FLOOR + 0.015, cz), M["steel_black"], segments=8)


def lockers(name, x_wall, y0, z0, z1, M, *, facing="+x", count=None):
    """Row of 0.45 m steel lockers against a wall (x_wall = wall face), doors toward `facing`."""
    steel_black = M["steel_black"]
    depth = 0.5
    count = count or max(1, int((z1 - z0) / 0.45))
    pitch = (z1 - z0) / count
    x0, x1 = (x_wall, x_wall + depth) if facing == "+x" else (x_wall - depth, x_wall)
    box_span(f"{name}_body", x0, x1, y0, y0 + 1.9, z0, z1, M["grey_dark"], bevel=0.01)
    door_x = (x1 - 0.005, x1 + 0.005) if facing == "+x" else (x0 - 0.005, x0 + 0.005)
    for k in range(count):
        dz0, dz1 = z0 + k * pitch + 0.02, z0 + (k + 1) * pitch - 0.02
        box_span(f"{name}_door_{k}", door_x[0], door_x[1], y0 + 0.05, y0 + 1.85, dz0, dz1, M["navy_paint"])
        for v in range(3):
            box_span(f"{name}_vent_{k}_{v}", door_x[0] - 0.002 + (0.004 if facing == "+x" else 0), door_x[1] + (0.006 if facing == "+x" else -0.006), y0 + 1.5 + v * 0.08, y0 + 1.52 + v * 0.08, dz0 + 0.1, dz1 - 0.1, steel_black)
        hx = door_x[1] + 0.02 if facing == "+x" else door_x[0] - 0.02
        box_span(f"{name}_handle_{k}", min(hx, hx + 0.02), max(hx, hx + 0.02), y0 + 1.0, y0 + 1.12, dz1 - 0.1, dz1 - 0.07, steel_black)


def workshop(M):
    """Workshop (x -1.42..8.8) on the legacy bar / shelf / table boxes + new solids with zone colliders."""
    steel, steel_black, timber = M["steel"], M["steel_black"], M["timber"]
    # 348: long workbench 1.1 × 5.1 (x 3.45..4.55, z -39.55..-34.45): frame, top at 0.95, rail + pegboard back to 1.3
    box_span("bench_frame", 3.5, 4.5, FLOOR, FLOOR + 0.1, -39.5, -34.5, steel_black)
    for lz in (-39.5, -37.0, -34.6):
        for lx in (3.5, 4.44):
            box_span(f"bench_leg_{lx:.1f}_{lz:.0f}", lx, lx + 0.06, FLOOR + 0.1, 0.9, lz, lz + 0.06, steel_black)
    box_span("bench_shelf", 3.52, 4.48, FLOOR + 0.2, FLOOR + 0.23, -39.5, -34.5, M["grey_dark"])
    box_span("bench_top", 3.45, 4.55, 0.9, 0.98, -39.55, -34.45, timber, bevel=0.005)
    box_span("bench_rail", 4.5, 4.55, 0.98, 1.3, -39.55, -34.45, M["navy_paint"])          # back rail toward the stair side
    for k in range(6):
        box_span(f"bench_rail_hook_{k}", 4.47, 4.5, 1.1, 1.14, -39.3 + k * 0.85, -39.26 + k * 0.85, steel_black)
    # vise, tools, parts on the bench
    box_span("vise_base", 3.6, 3.9, 0.98, 1.06, -35.4, -35.1, steel_black)
    box_span("vise_jaw_a", 3.62, 3.88, 1.06, 1.2, -35.36, -35.28, M["grey_dark"])
    box_span("vise_jaw_b", 3.62, 3.88, 1.06, 1.2, -35.22, -35.14, M["grey_dark"])
    tube("vise_handle", (3.75, 1.12, -35.55), (3.75, 1.12, -35.05), 0.012, steel)
    box_span("bench_toolbox", 3.6, 4.1, 0.98, 1.2, -38.9, -38.6, M["safety_red"], bevel=0.01)
    box_span("bench_grinder", 3.7, 4.0, 0.98, 1.16, -37.6, -37.3, M["green_machine"], bevel=0.01)
    K.cylinder("bench_grinder_wheel", 0.09, 0.03, (3.85, 1.14, -37.28), M["grey"], segments=10, axis="z")
    for k in range(5):
        box_span(f"bench_part_{k}", 3.6 + (k % 2) * 0.4, 3.85 + (k % 2) * 0.4, 0.98, 1.03 + (k % 3) * 0.03, -36.9 + k * 0.28, -36.72 + k * 0.28, M["brass"] if k % 2 else M["grey"])
    # 349: parts counter 3.1 × 1.05 (x 0.45..3.55, z -35..-33.95): steel counter with drawers + bins on top
    box_span("counter_body", 0.5, 3.5, FLOOR, 1.05, -34.95, -34.0, M["grey_dark"], bevel=0.01)
    box_span("counter_top", 0.45, 3.55, 1.05, 1.1, -35.0, -33.95, M["grey"], bevel=0.005)
    for d in range(4):
        box_span(f"counter_drawer_{d}", 0.6 + d * 0.72, 1.2 + d * 0.72, FLOOR + 0.35, FLOOR + 0.7, -33.96, -33.95, M["trim"])
        box_span(f"counter_handle_{d}", 0.8 + d * 0.72, 1.0 + d * 0.72, FLOOR + 0.5, FLOOR + 0.53, -33.95, -33.93, steel_black)
    for k, col in enumerate(("bin_blue", "bin_red", "bin_yellow", "bin_green", "bin_blue")):
        box_span(f"counter_bin_{k}", 0.65 + k * 0.55, 1.05 + k * 0.55, 1.1, 1.3, -34.9, -34.5, M[col], bevel=0.01)
    # 350: back shelving 4 × 0.5 × 2.3 (x 4..8, z -40.75..-40.25) with colour-coded bins; pegboard above the bench
    for ux in (4.02, 6.0, 7.94):
        for uz in (-40.73, -40.31):
            box_span(f"shelf_upright_{ux:.1f}_{uz:.1f}", ux, ux + 0.04, FLOOR, 2.5, uz, uz + 0.04, steel_black)
    for s_, y in enumerate((FLOOR + 0.12, FLOOR + 0.7, FLOOR + 1.28, FLOOR + 1.86)):
        box_span(f"shelf_{s_}", 4.0, 8.0, y, y + 0.03, -40.75, -40.25, M["grey"])
        for b in range(6):
            col = ("bin_blue", "bin_red", "bin_yellow", "bin_green")[(b + s_) % 4]
            box_span(f"shelf_bin_{s_}_{b}", 4.15 + b * 0.63, 4.65 + b * 0.63, y + 0.03, y + 0.3, -40.72, -40.32, M[col], bevel=0.01)
    box_span("shelf_top", 4.0, 8.0, 2.47, 2.5, -40.75, -40.25, M["grey"])
    pegboard(M, 2.0, 3.4, -40.79, 1.6, 2.9, count=14)
    # 366: compressor (x 3.3..3.7, z -33.7..-33.3, 0.24..0.69) — small vertical tank unit
    K.cylinder("compressor_tank", 0.17, 0.32, (3.5, FLOOR + 0.18, -33.5), M["blue_machine"], segments=12)
    box_span("compressor_head", 3.38, 3.62, FLOOR + 0.34, FLOOR + 0.44, -33.62, -33.38, steel_black, bevel=0.01)
    tube("compressor_pipe", (3.5, FLOOR + 0.44, -33.5), (3.5, 1.3, -33.5), 0.015, steel)
    # 367: paint bucket (x 6.35..6.65, z -39.95..-39.65)
    K.cylinder("bucket", 0.15, 0.25, (6.5, FLOOR + 0.125, -39.8), M["grey"], segments=10)
    # 354 / 360: workshop tables 1.3 × 0.9 × 0.8 (x -0.65..0.65) — layout table + parts table; stools 355/356/361/362
    for k, (tz0, tz1) in enumerate(((-37.95, -37.05), (-33.95, -33.05))):
        box_span(f"shop_table_{k}_top", -0.65, 0.65, FLOOR + 0.72, FLOOR + 0.8, tz0, tz1, timber, bevel=0.005)
        for lx, lz in ((-0.62, tz0 + 0.03), (0.58, tz0 + 0.03), (-0.62, tz1 - 0.07), (0.58, tz1 - 0.07)):
            box_span(f"shop_table_{k}_leg_{lx:.1f}_{lz:.1f}", lx, lx + 0.04, FLOOR, FLOOR + 0.72, lz, lz + 0.04, steel_black)
        for cx in (-0.8, 0.8):
            stool(f"shop_stool_{k}_{cx:.0f}", cx, (tz0 + tz1) / 2, M)
    box_span("table_drawing", -0.5, 0.4, FLOOR + 0.8, FLOOR + 0.805, -37.8, -37.2, M["paper"], tags={"castShadow": False})
    for k in range(3):
        K.cylinder(f"table_part_{k}", 0.08 + k * 0.02, 0.06, (-0.35 + k * 0.35, FLOOR + 0.83, -33.5), M["brass"] if k else M["grey"], segments=10)
    # new solids with zone colliders (all outside the legacy boxes, circulation ≥ 1.5 m kept)
    # welding cart against the east wall (roller route x 4.55..7.9 stays 3.3 m wide)
    welding_cart(M, 8.35, -33.0)
    K.collider("WELDING_CART", (7.9, FLOOR, -33.5), (8.8, FLOOR + 1.1, -32.5))
    box_span("hose_reel_mount", IX1 - 0.04, IX1, FLOOR + 1.0, FLOOR + 1.6, -34.9, -34.3, steel_black)
    K.cylinder("hose_reel", 0.32, 0.18, (IX1 - 0.2, FLOOR + 1.3, -34.6), M["hose_yellow"], segments=14, axis="x")
    K.cylinder("hose_reel_hub", 0.08, 0.24, (IX1 - 0.2, FLOOR + 1.3, -34.6), steel_black, segments=8, axis="x")
    pallet_with_propeller(M, 8.1, -31.4)                     # against the east wall, route x 4.65..7.0 clear
    K.collider("PROP_PALLET", (7.45, FLOOR, -32.0), (8.75, FLOOR + 1.05, -30.8))
    # spare pump on a pallet in the NW corner of the workshop bay (partition / north wall)
    box_span("spare_pump", -1.0, -0.2, FLOOR, FLOOR + 0.5, -40.5, -39.7, M["blue_machine"], bevel=0.02)
    K.cylinder("spare_pump_motor", 0.22, 0.6, (-0.6, FLOOR + 0.55, -40.1), M["grey"], segments=12, axis="x")
    K.cylinder("spare_pump_flange", 0.28, 0.06, (-0.27, FLOOR + 0.55, -40.1), steel_black, segments=12, axis="x")
    box_span("spare_pump_pallet", -1.2, 0.0, FLOOR, FLOOR + 0.12, -40.7, -39.5, timber)
    K.collider("SPARE_PUMP", (-1.2, FLOOR, -40.7), (0.0, FLOOR + 0.85, -39.5))
    box_span("tool_chest", 7.9, 8.7, FLOOR, FLOOR + 0.95, -40.2, -39.6, M["safety_red"], bevel=0.02)
    for d in range(4):
        box_span(f"tool_chest_drawer_{d}", 7.95, 8.65, FLOOR + 0.12 + d * 0.2, FLOOR + 0.28 + d * 0.2, -39.61, -39.6, M["trim"])
    K.collider("TOOL_CHEST", (7.9, FLOOR, -40.2), (8.7, FLOOR + 0.95, -39.6))
    # small loose items (no colliders)
    for k in range(3):
        K.cylinder(f"gas_bottle_{k}", 0.11, 1.2, (8.55, FLOOR + 0.6, -37.4 + k * 0.28), M["green_machine"] if k else M["grey"], segments=10)
        K.cylinder(f"gas_bottle_{k}_cap", 0.05, 0.1, (8.55, FLOOR + 1.25, -37.4 + k * 0.28), M["brass"], segments=8)
    box_span("gas_bottle_chain", 8.4, 8.7, FLOOR + 0.95, FLOOR + 0.98, -37.6, -36.75, steel_black)
    box_span("floor_drain_frame", 2.4, 3.0, FLOOR + 0.001, FLOOR + 0.006, -36.7, -36.1, steel_black, tags={"castShadow": False})
    K.plane("floor_drain_grid", (0.5, 0.5), (2.7, FLOOR + 0.008, -36.4), M["grating"], normal="y", tags={"castShadow": False})
    # fire extinguisher + first-aid on the partition's shop side, wall clock-less notice
    K.cylinder("fire_ext_shop", 0.08, 0.5, (PARTITION_X[1] + 0.14, FLOOR + 0.9, -39.0), M["safety_red"], segments=8)
    box_span("fire_ext_shop_bracket", PARTITION_X[1], PARTITION_X[1] + 0.06, FLOOR + 0.9, FLOOR + 1.0, -39.05, -38.95, steel_black)
    box_span("first_aid", PARTITION_X[1], PARTITION_X[1] + 0.08, FLOOR + 1.3, FLOOR + 1.6, -38.6, -38.2, M["white"], bevel=0.01)
    box_span("first_aid_cross_a", PARTITION_X[1] + 0.08, PARTITION_X[1] + 0.085, FLOOR + 1.38, FLOOR + 1.52, -38.43, -38.37, M["safety_red"], tags={"castShadow": False})
    box_span("first_aid_cross_b", PARTITION_X[1] + 0.08, PARTITION_X[1] + 0.085, FLOOR + 1.42, FLOOR + 1.48, -38.52, -38.28, M["safety_red"], tags={"castShadow": False})


def pegboard(M, x0, x1, z_wall, y0, y1, *, count=12):
    """Pegboard on the north wall with hanging tool silhouettes."""
    box_span("pegboard", x0, x1, y0, y1, z_wall, z_wall + 0.03, M["cardboard"])
    rng = [(0.07, 0.32), (0.05, 0.45), (0.1, 0.2), (0.06, 0.38), (0.12, 0.26)]
    for k in range(count):
        w, h = rng[k % len(rng)]
        tx = x0 + 0.12 + (k % 7) * ((x1 - x0 - 0.24) / 6)
        ty = y1 - 0.25 - (k // 7) * 0.62
        box_span(f"peg_tool_{k}_shaft", tx - 0.012, tx + 0.012, ty - h, ty, z_wall + 0.03, z_wall + 0.06, M["steel_black"])
        box_span(f"peg_tool_{k}_head", tx - w / 2, tx + w / 2, ty - h, ty - h + 0.06, z_wall + 0.03, z_wall + 0.065, M["grey"] if k % 3 else M["safety_red"])


def welding_cart(M, cx, cz):
    steel_black = M["steel_black"]
    box_span("weld_cart_bed", cx - 0.4, cx + 0.4, FLOOR + 0.16, FLOOR + 0.2, cz - 0.45, cz + 0.45, steel_black)
    box_span("weld_cart_machine", cx - 0.3, cx + 0.3, FLOOR + 0.2, FLOOR + 0.62, cz - 0.05, cz + 0.4, M["blue_machine"], bevel=0.02)
    K.plane("weld_cart_dial", (0.12, 0.08), (cx - 0.31, FLOOR + 0.5, cz + 0.18), M["amber"], normal="x", tags={"castShadow": False})
    K.cylinder("weld_cart_bottle", 0.12, 0.85, (cx + 0.05, FLOOR + 0.62, cz - 0.28), M["grey"], segments=10)
    K.cylinder("weld_cart_bottle_cap", 0.05, 0.1, (cx + 0.05, FLOOR + 1.09, cz - 0.28), M["brass"], segments=8)
    for wx in (cx - 0.38, cx + 0.38):
        K.cylinder(f"weld_cart_wheel_{wx:.1f}", 0.1, 0.05, (wx, FLOOR + 0.1, cz + 0.35), M["rubber"], segments=10, axis="x")
    bar("weld_cart_handle_a", (cx - 0.35, FLOOR + 0.2, cz - 0.45), (cx - 0.35, FLOOR + 0.95, cz - 0.6), 0.025, steel_black)
    bar("weld_cart_handle_b", (cx + 0.35, FLOOR + 0.2, cz - 0.45), (cx + 0.35, FLOOR + 0.95, cz - 0.6), 0.025, steel_black)
    bar("weld_cart_handle_c", (cx - 0.35, FLOOR + 0.95, cz - 0.6), (cx + 0.35, FLOOR + 0.95, cz - 0.6), 0.025, steel_black)
    # cable coiled on the handle + torch
    K.torus("weld_cart_cable", (cx + 0.2, FLOOR + 0.8, cz - 0.62), 0.14, 0.015, M["cable"], segments=10, profile=4, axis="z")


def pallet_with_propeller(M, cx, cz):
    """Spare boat propeller (3 blades) resting on a pallet."""
    box_span("prop_pallet", cx - 0.6, cx + 0.6, FLOOR, FLOOR + 0.12, cz - 0.5, cz + 0.5, M["timber"])
    for k in range(3):
        box_span(f"prop_pallet_slat_{k}", cx - 0.6, cx + 0.6, FLOOR + 0.12, FLOOR + 0.14, cz - 0.45 + k * 0.4, cz - 0.3 + k * 0.4, M["timber"])
    K.cylinder("prop_hub", 0.14, 0.3, (cx, FLOOR + 0.3, cz), M["propeller"], segments=12, axis="z")
    for k in range(3):
        a = math.tau * k / 3
        verts = [(cx + math.cos(a) * 0.12, FLOOR + 0.3, cz), (cx + math.cos(a + 0.5) * 0.55, FLOOR + 0.62, cz + 0.05),
                 (cx + math.cos(a - 0.15) * 0.62, FLOOR + 0.42, cz - 0.05), (cx + math.cos(a - 0.5) * 0.4, FLOOR + 0.2, cz + 0.02)]
        # blades stand in the x-y plane (propeller leaning against the hub axis z)
        pts = []
        for i, (vx, vy, vz) in enumerate(verts):
            ang = a + (-0.2, 0.35, 0.0, -0.45)[i]
            r = (0.12, 0.6, 0.62, 0.42)[i]
            pts.append((cx + math.cos(ang) * r, FLOOR + 0.3 + math.sin(ang) * r, cz + (0.0, 0.06, -0.04, 0.02)[i]))
        K.mesh(f"prop_blade_{k}", pts, [(0, 1, 2, 3)], M["propeller"], force_recalc=False)
    box_span("prop_strap", cx - 0.62, cx + 0.62, FLOOR + 0.14, FLOOR + 0.17, cz - 0.02, cz + 0.02, M["safety_yellow"])
    box_span("prop_tag", cx + 0.3, cx + 0.45, FLOOR + 0.17, FLOOR + 0.25, cz + 0.3, cz + 0.31, M["paper"], tags={"castShadow": False})


def spiral_stair(M):
    """The legacy interior spiral stair (18 wedge steps to the roof deck) + pole + handrail."""
    steel, steel_black = M["steel"], M["steel_black"]
    sx, sz, r, steps, total = SPIRAL
    rise = BH / steps
    K.cylinder("spiral_pole", 0.1, BH + 0.5, (sx, BH / 2 + 0.1, sz), steel_black, segments=12)
    prev = None
    for i in range(steps):
        angle = (i / steps) * total - math.pi / 2
        sy = 0.3 + (i + 1) * rise
        cx, cz = sx + math.cos(angle) * r * 0.5, sz + math.sin(angle) * r * 0.5
        K.box(f"spiral_step_{i}", (r, 0.08, 0.7), (cx, sy, cz), M["grey_dark"], rot_y=-angle, bevel=0.01)
        K.box(f"spiral_step_{i}_nose", (r - 0.1, 0.02, 0.06), (sx + math.cos(angle) * r * 0.5 - math.sin(angle) * 0.33, sy + 0.05, sz + math.sin(angle) * r * 0.5 + math.cos(angle) * 0.33), M["safety_yellow"], rot_y=-angle, tags={"castShadow": False})
        px, pz = sx + math.cos(angle) * (r + 0.1), sz + math.sin(angle) * (r + 0.1)
        post_top = sy + 0.9
        if post_top <= BH + 0.1:
            h = min(0.9, BH - sy + 0.05)
            K.cylinder(f"spiral_post_{i}", 0.025, h, (px, sy + h / 2, pz), steel_black, segments=6)
            if prev is not None:
                tube(f"spiral_rail_{i}", prev, (px, sy + h, pz), 0.02, steel)
            prev = (px, sy + h, pz)
        else:
            prev = None
    # landing lip where the stair meets the deck + anti-slip stripe on the deck edge
    box_span("spiral_landing", sx + HOLE_R - 0.4, sx + HOLE_R + 0.1, BH, ROOF_TOP, sz - 0.6, sz + 0.6, steel)


# --------------------------------------------------------------------------- #
# Front apron (legacy deck 0..0.22, z -28..-24) and its machinery boxes
# --------------------------------------------------------------------------- #

def build_apron(M):
    steel, steel_black = M["steel"], M["steel_black"]
    x0, x1, z0, z1 = BX0, BX1, -28.0, -24.0
    box_span("apron_slab", x0, x1, 0.0, DECK, z0, z1, M["concrete"])
    box_span("apron_edge_paint", x0, x1, DECK, DECK + 0.006, z1 - 0.3, z1, M["paint_yellow"], tags={"castShadow": False})
    for k in range(9):
        paint(f"apron_hatch_{k}", x0 + 0.3 + k * 2.0, x0 + 0.42 + k * 2.0, z1 - 0.3, z1, M["steel_black"], y=DECK + 0.007)
    for k, jx in enumerate((-6.0, -3.0, 0.0, 3.0, 6.0)):
        paint(f"apron_joint_{k}", jx - 0.01, jx + 0.01, z0, z1, M["concrete_dark"], y=DECK + 0.004)
    # wheel stops along the lane-side edge of the apron (the 0.22 step), clear of both door approaches
    for k, wx in enumerate((-7.3, 7.3)):
        box_span(f"apron_wheelstop_{k}", wx - 0.8, wx + 0.8, DECK, DECK + 0.14, z1 - 0.6, z1 - 0.45, M["rubber"], bevel=0.02)
        for s_ in range(3):
            box_span(f"apron_wheelstop_{k}_stripe_{s_}", wx - 0.6 + s_ * 0.6 - 0.12, wx - 0.6 + s_ * 0.6 + 0.12, DECK + 0.001, DECK + 0.141, z1 - 0.602, z1 - 0.448, M["paint_yellow"], tags={"castShadow": False})
    # legacy machine boxes 1 × 0.7 × 1 (0.2..0.9): portable generator, welding trolley, tool chest
    generator(M, -5.5, -26.0)
    welding_trolley(M, 0.0, -26.0)
    box_span("apron_toolchest", 5.0, 6.0, DECK, 0.9, -26.5, -25.5, M["safety_red"], bevel=0.02)
    for d in range(3):
        box_span(f"apron_toolchest_drawer_{d}", 5.08, 5.92, DECK + 0.1 + d * 0.2, DECK + 0.26 + d * 0.2, -25.5, -25.49, M["trim"])
    box_span("apron_toolchest_lid", 4.97, 6.03, 0.9, 0.93, -26.53, -25.47, steel_black)
    # legacy seat plates (0.69..0.75) around each machine: drums by the generator, gas bottles by
    # the welder, small crates by the tool chest — tops flush with the plates
    for (px, pz) in ((-6.3, -26.0), (-4.7, -26.0), (-5.5, -26.8), (-5.5, -25.2)):
        drum(M, px, pz, 0.75)
    for k, (px, pz) in enumerate(((-0.8, -26.0), (0.8, -26.0), (0.0, -26.8), (0.0, -25.2))):
        K.cylinder(f"apron_gas_{k}", 0.15, 0.53, (px, DECK + 0.265, pz), M["grey"] if k % 2 else M["green_machine"], segments=10)
        K.cylinder(f"apron_gas_{k}_shoulder", 0.11, 0.06, (px, DECK + 0.56, pz), M["grey_dark"], segments=10)
        K.cylinder(f"apron_gas_{k}_valve", 0.04, 0.13, (px, DECK + 0.65, pz), M["brass"], segments=8)
    for k, (px, pz) in enumerate(((4.7, -26.0), (6.3, -26.0), (5.5, -26.8), (5.5, -25.2))):   # legacy plates 4.53..4.88 / 6.12..6.47 / 5.33..5.67
        box_span(f"apron_crate_{k}", px - 0.175, px + 0.175, DECK, 0.75, pz - 0.175, pz + 0.175, M["timber"] if k % 2 else M["cardboard"], bevel=0.01)
    # legacy bollards (x ±8.5 0.5 m tall, x 3 0.6 m tall)
    for k, (bx, bz, h) in enumerate(((-8.5, -24.5, 0.5), (8.5, -24.5, 0.5), (3.0, -24.2, 0.6))):
        K.cylinder(f"apron_bollard_{k}", 0.12, h - 0.1, (bx, 0.1 + (h - 0.1) / 2, bz), steel, segments=10)
        K.cylinder(f"apron_bollard_{k}_cap", 0.13, 0.06, (bx, h - 0.03, bz), M["paint_yellow"], segments=10)
    # utility cart bay with the parked utility cart (idle amber light) at the apron's west end
    paint("cart_bay_a", -8.8, -6.6, -27.98, -27.88, M["paint_white"], y=DECK + 0.006)
    paint("cart_bay_b", -8.8, -6.6, -26.5, -26.4, M["paint_white"], y=DECK + 0.006)
    paint("cart_bay_c", -8.8, -8.7, -27.98, -26.4, M["paint_white"], y=DECK + 0.006)
    utility_cart(M, -7.7, -27.25)
    K.collider("UTILITY_CART", (-8.15, DECK, -27.95), (-7.25, DECK + 1.0, -26.55))
    sweep("YARD_PROPS")


def drum(M, cx, cz, top):
    K.cylinder(f"drum_{cx:.1f}_{cz:.1f}", 0.29, top - DECK, (cx, (DECK + top) / 2, cz), M["blue_machine"] if int(cx * 10) % 2 else M["rust"], segments=12)
    for ry in (DECK + 0.25, top - 0.22):
        K.cylinder(f"drum_{cx:.1f}_{cz:.1f}_ring_{ry:.1f}", 0.3, 0.04, (cx, ry, cz), M["steel_black"], segments=12)


def generator(M, cx, cz):
    box_span("gen_frame", cx - 0.5, cx + 0.5, DECK, DECK + 0.08, cz - 0.5, cz + 0.5, M["steel_black"])
    box_span("gen_body", cx - 0.45, cx + 0.45, DECK + 0.08, 0.78, cz - 0.42, cz + 0.42, M["safety_red"], bevel=0.02)
    box_span("gen_top", cx - 0.47, cx + 0.47, 0.78, 0.86, cz - 0.44, cz + 0.44, M["steel_black"], bevel=0.01)
    box_span("gen_panel", cx - 0.2, cx + 0.2, DECK + 0.35, DECK + 0.6, cz + 0.42, cz + 0.44, M["grey_dark"])
    K.plane("gen_panel_light", (0.06, 0.06), (cx + 0.12, DECK + 0.52, cz + 0.445), M["green"], normal="z", tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    for k in range(4):
        box_span(f"gen_vent_{k}", cx - 0.45, cx - 0.44, DECK + 0.25 + k * 0.1, DECK + 0.29 + k * 0.1, cz - 0.3, cz + 0.3, M["steel_black"])
    tube("gen_exhaust", (cx + 0.3, 0.86, cz - 0.3), (cx + 0.3, 1.05, cz - 0.3), 0.03, M["steel"])
    for wx in (cx - 0.4, cx + 0.4):
        K.cylinder(f"gen_wheel_{wx:.1f}", 0.09, 0.06, (wx, DECK + 0.09, cz - 0.4), M["rubber"], segments=10, axis="x")
    bar("gen_handle", (cx - 0.45, DECK + 0.3, cz + 0.5), (cx + 0.45, DECK + 0.3, cz + 0.5), 0.025, M["steel"])


def welding_trolley(M, cx, cz):
    steel_black = M["steel_black"]
    box_span("trolley_bed", cx - 0.5, cx + 0.5, DECK + 0.18, DECK + 0.22, cz - 0.5, cz + 0.5, steel_black)
    box_span("trolley_machine", cx - 0.35, cx + 0.35, DECK + 0.22, 0.75, cz - 0.1, cz + 0.45, M["blue_machine"], bevel=0.02)
    K.plane("trolley_dial", (0.14, 0.1), (cx, DECK + 0.6, cz + 0.455), M["amber"], normal="z", tags={"castShadow": False})
    K.cylinder("trolley_bottle", 0.13, 0.62, (cx, DECK + 0.53, cz - 0.3), M["grey"], segments=10)
    K.cylinder("trolley_bottle_cap", 0.05, 0.08, (cx, DECK + 0.88, cz - 0.3), M["brass"], segments=8)
    for wx in (cx - 0.45, cx + 0.45):
        K.cylinder(f"trolley_wheel_{wx:.1f}", 0.1, 0.05, (wx, DECK + 0.1, cz + 0.4), M["rubber"], segments=10, axis="x")
    bar("trolley_handle_a", (cx - 0.4, DECK + 0.22, cz - 0.5), (cx - 0.4, 0.88, cz - 0.62), 0.025, steel_black)
    bar("trolley_handle_b", (cx + 0.4, DECK + 0.22, cz - 0.5), (cx + 0.4, 0.88, cz - 0.62), 0.025, steel_black)
    bar("trolley_handle_c", (cx - 0.4, 0.88, cz - 0.62), (cx + 0.4, 0.88, cz - 0.62), 0.025, steel_black)
    K.torus("trolley_cable", (cx + 0.25, 0.7, cz - 0.64), 0.12, 0.014, M["cable"], segments=10, profile=4, axis="z")


def utility_cart(M, cx, cz, base=DECK):
    steel_black = M["steel_black"]
    box_span(f"ucart_{cx:.0f}_bed", cx - 0.45, cx + 0.45, base + 0.28, base + 0.33, cz - 0.7, cz + 0.7, M["grey"])
    box_span(f"ucart_{cx:.0f}_rail_a", cx - 0.45, cx - 0.42, base + 0.33, base + 0.55, cz - 0.7, cz + 0.7, steel_black)
    box_span(f"ucart_{cx:.0f}_rail_b", cx + 0.42, cx + 0.45, base + 0.33, base + 0.55, cz - 0.7, cz + 0.7, steel_black)
    box_span(f"ucart_{cx:.0f}_rail_c", cx - 0.45, cx + 0.45, base + 0.33, base + 0.55, cz - 0.7, cz - 0.67, steel_black)
    box_span(f"ucart_{cx:.0f}_crate", cx - 0.3, cx + 0.3, base + 0.33, base + 0.7, cz - 0.3, cz + 0.3, M["cardboard"], bevel=0.01)
    for wx in (cx - 0.38, cx + 0.38):
        for wz in (cz - 0.45, cz + 0.45):
            K.cylinder(f"ucart_{cx:.0f}_wheel_{wx:.1f}_{wz:.1f}", 0.12, 0.06, (wx, base + 0.12, wz), M["rubber"], segments=10, axis="x")
    bar(f"ucart_{cx:.0f}_handle_a", (cx - 0.4, base + 0.33, cz + 0.68), (cx - 0.4, base + 1.0, cz + 0.85), 0.025, steel_black)
    bar(f"ucart_{cx:.0f}_handle_b", (cx + 0.4, base + 0.33, cz + 0.68), (cx + 0.4, base + 1.0, cz + 0.85), 0.025, steel_black)
    bar(f"ucart_{cx:.0f}_handle_c", (cx - 0.4, base + 1.0, cz + 0.85), (cx + 0.4, base + 1.0, cz + 0.85), 0.025, steel_black)
    box_span(f"ucart_{cx:.0f}_lamp", cx - 0.06, cx + 0.06, base + 0.55, base + 0.62, cz - 0.72, cz - 0.66, steel_black)
    K.plane(f"ucart_{cx:.0f}_lamp_glow", (0.1, 0.05), (cx, base + 0.585, cz - 0.725), M["amber"], normal="z", tags={"castShadow": False, "ambientMotion": "lamp-flicker"})


# --------------------------------------------------------------------------- #
# Warehouse service wall (north facade of warehouse.glb, apron z -19..-18)
# --------------------------------------------------------------------------- #

ROLLER_DOORS = ((-17.5, -14.5), (-3.5, -0.5), (12.5, 15.5))     # closed, 3 m wide, 4 m tall
WALL = WAREHOUSE_WALL_Z                                          # -18.0 (wall face, fixtures hang on -z side)


def build_service_wall(M):
    steel, steel_black, grey = M["steel"], M["steel_black"], M["grey"]
    wz = WALL
    # closed roller doors: recessed frame, slats, header hood; steel canopy on cantilever brackets
    for k, (d0, d1) in enumerate(ROLLER_DOORS):
        box_span(f"rd_{k}_frame_l", d0 - 0.14, d0, 0.0, 4.15, wz - 0.16, wz, steel)
        box_span(f"rd_{k}_frame_r", d1, d1 + 0.14, 0.0, 4.15, wz - 0.16, wz, steel)
        box_span(f"rd_{k}_head", d0 - 0.14, d1 + 0.14, 4.0, 4.5, wz - 0.4, wz, M["clad_grey"], bevel=0.02)
        for s_ in range(20):
            y0 = 0.2 + s_ * 0.19
            box_span(f"rd_{k}_slat_{s_}", d0 + 0.02, d1 - 0.02, y0, y0 + 0.17, wz - 0.1, wz - 0.05, M["grey_dark"] if s_ % 2 else M["clad_grey"])
        box_span(f"rd_{k}_bottom_rail", d0, d1, 0.0, 0.2, wz - 0.12, wz - 0.04, steel_black)
        box_span(f"rd_{k}_threshold", d0 - 0.3, d1 + 0.3, GROUND, GROUND + 0.02, wz - 0.9, wz, M["concrete_dark"], tags={"castShadow": False})
        paint(f"rd_{k}_hatch_a", d0 - 0.3, d1 + 0.3, wz - 0.95, wz - 0.85, M["paint_yellow"])
        # canopy: corrugated sheet 2.4 m out at 4.6..4.75, two cantilever brackets with knee braces
        box_span(f"rd_{k}_canopy", d0 - 0.6, d1 + 0.6, 4.62, 4.72, wz - 2.4, wz - 0.4, M["clad_grey"])
        box_span(f"rd_{k}_canopy_lip", d0 - 0.6, d1 + 0.6, 4.5, 4.62, wz - 2.4, wz - 2.3, steel)
        for bx in (d0 - 0.45, d1 + 0.45):
            box_span(f"rd_{k}_bracket_{bx:.1f}", bx - 0.04, bx + 0.04, 4.52, 4.62, wz - 2.35, wz, steel)
            bar(f"rd_{k}_brace_{bx:.1f}", (bx, 4.55, wz - 2.2), (bx, 5.7, wz - 0.02), 0.05, steel)
            box_span(f"rd_{k}_plate_{bx:.1f}", bx - 0.1, bx + 0.1, 5.6, 5.85, wz - 0.06, wz, steel_black)
        for lx in (d0 + 0.5, d1 - 0.5):
            box_span(f"rd_{k}_lamp_{lx:.1f}", lx - 0.2, lx + 0.2, 4.48, 4.62, wz - 1.8, wz - 1.4, steel_black, bevel=0.01)
            K.plane(f"rd_{k}_lamp_{lx:.1f}_glow", (0.34, 0.3), (lx, 4.475, wz - 1.6), M["lamp"], normal="y", tags={"castShadow": False})
        box_span(f"rd_{k}_number", (d0 + d1) / 2 - 0.25, (d0 + d1) / 2 + 0.25, 4.6, 4.9, wz - 0.42, wz - 0.4, M["safety_yellow"], tags={"castShadow": False})
    # utility pipes: two red risers with a horizontal run at 6.2 m on brackets every 3 m
    for k, rx in enumerate((-20.5, 9.5)):
        tube(f"riser_{k}", (rx, 0.3, wz - 0.22), (rx, 7.6, wz - 0.22), 0.09, M["pipe_red"], segments=10)
        tube(f"riser_{k}_b", (rx + 0.35, 0.3, wz - 0.22), (rx + 0.35, 7.6, wz - 0.22), 0.06, M["pipe_red"], segments=8)
        for by in (1.2, 3.6, 6.0):
            box_span(f"riser_{k}_clamp_{by:.0f}", rx - 0.16, rx + 0.5, by, by + 0.08, wz - 0.32, wz, steel)
    tube("pipe_run", (-20.5, 6.2, wz - 0.22), (29.0, 6.2, wz - 0.22), 0.06, M["pipe_red"], segments=8)
    for k, bx in enumerate(range(-19, 29, 3)):
        box_span(f"pipe_run_bracket_{k}", bx - 0.04, bx + 0.04, 6.1, 6.3, wz - 0.32, wz, steel)
    # cable tray at 5.3 m with hangers, dropping into electrical panels
    box_span("cable_tray", -22.0, 28.5, 5.28, 5.34, wz - 0.55, wz - 0.25, steel)
    for k in range(6):
        box_span(f"cable_tray_rail_{k}", -22.0, 28.5, 5.34, 5.4, wz - 0.55 + k * 0.05, wz - 0.54 + k * 0.05, steel_black)
    for k, hx in enumerate(range(-21, 29, 2)):
        box_span(f"cable_hanger_{k}", hx - 0.03, hx + 0.03, 5.4, 5.75, wz - 0.4, wz - 0.34, steel)
        box_span(f"cable_hanger_{k}_arm", hx - 0.03, hx + 0.03, 5.7, 5.75, wz - 0.4, wz, steel)
    for k in range(3):
        tube(f"cable_{k}", (-21.5, 5.32 + k * 0.02, wz - 0.5 + k * 0.04), (28.0, 5.32 + k * 0.02, wz - 0.5 + k * 0.04), 0.02, M["cable"], segments=5,
             tags={"ambientMotion": "sway-reed", "ignoreWeaponRaycast": True, "castShadow": False})
    # downpipes at both ends of the AB frontage
    for k, dx in enumerate((-22.6, 28.6)):
        tube(f"wh_downpipe_{k}", (dx, 0.35, wz - 0.16), (dx, 7.8, wz - 0.16), 0.05, steel)
        box_span(f"wh_downpipe_{k}_foot", dx - 0.08, dx + 0.08, 0.0, 0.35, wz - 0.3, wz, steel)
    # fire hose cabinet, electrical panels, tool lockers, transformer enclosure (with safety curb + colliders)
    box_span("fire_cabinet", -10.6, -9.8, 0.9, 1.9, wz - 0.32, wz, M["safety_red"], bevel=0.01)
    box_span("fire_cabinet_glass", -10.5, -9.9, 1.05, 1.75, wz - 0.33, wz - 0.32, M["white"])
    box_span("fire_cabinet_stand", -10.5, -9.9, 0.0, 0.9, wz - 0.2, wz - 0.1, steel_black)
    K.torus("fire_hose_coil", (-10.2, 1.4, wz - 0.36), 0.22, 0.05, M["hose"], segments=12, profile=5, axis="z")
    for k, px in enumerate((10.0, 10.8, 11.6)):
        box_span(f"panel_{k}", px, px + 0.7, 1.0, 2.2, wz - 0.28, wz, grey, bevel=0.01)
        box_span(f"panel_{k}_door", px + 0.05, px + 0.65, 1.1, 2.1, wz - 0.285, wz - 0.28, M["grey_dark"])
        K.plane(f"panel_{k}_led", (0.06, 0.03), (px + 0.55, 2.0, wz - 0.29), M["green"] if k else M["amber"], normal="z", tags={"castShadow": False})
        box_span(f"panel_{k}_sign", px + 0.25, px + 0.45, 1.6, 1.8, wz - 0.29, wz - 0.285, M["safety_yellow"], tags={"castShadow": False})
    lockers_x("wh_locker", wz, GROUND, 6.0, 7.8, M, count=4)
    K.collider("WH_LOCKERS", (6.0, 0.0, wz - 0.5), (7.8, GROUND + 1.9, wz))
    transformer(M, 20.0, wz)
    # safety curb between the apron and the lane, broken at the roller doors (kerb_s_* in build_lane)
    # maintenance workbench + spare-parts pallets against the wall (colliders)
    box_span("wh_bench_top", -8.0, -6.0, 0.9, 0.98, wz - 0.7, wz - 0.05, M["timber"], bevel=0.005)
    for lx in (-7.95, -6.09):
        for lz in (wz - 0.66, wz - 0.12):
            box_span(f"wh_bench_leg_{lx:.1f}_{lz:.1f}", lx, lx + 0.06, 0.0, 0.9, lz, lz + 0.06, steel_black)
    box_span("wh_bench_shelf", -7.9, -6.1, 0.3, 0.33, wz - 0.65, wz - 0.1, M["grey_dark"])
    box_span("wh_bench_vise", -7.6, -7.3, 0.98, 1.16, wz - 0.5, wz - 0.25, steel_black)
    box_span("wh_bench_parts", -6.9, -6.3, 0.98, 1.1, wz - 0.55, wz - 0.2, M["brass"], bevel=0.01)
    K.collider("WH_BENCH", (-8.0, 0.0, wz - 0.7), (-6.0, 0.98, wz - 0.05))
    for k, px in enumerate((16.6, 18.0)):
        box_span(f"wh_pallet_{k}", px, px + 1.2, GROUND, GROUND + 0.12, wz - 1.0, wz - 0.05, M["timber"])
        box_span(f"wh_pallet_{k}_crate", px + 0.1, px + 1.1, GROUND + 0.12, GROUND + 0.6 + k * 0.2, wz - 0.9, wz - 0.15, M["cardboard"] if k else M["timber"], bevel=0.01)
        box_span(f"wh_pallet_{k}_strap", px + 0.5, px + 0.7, GROUND + 0.12, GROUND + 0.61 + k * 0.2, wz - 0.92, wz - 0.13, M["safety_yellow"])
    K.collider("WH_PALLETS", (16.6, 0.0, wz - 1.0), (19.2, GROUND + 0.8, wz - 0.05))
    # wall lamps between fixtures
    for k, lx in enumerate((-21.5, -12.0, 4.0, 24.0)):
        box_span(f"wh_lamp_{k}_arm", lx - 0.03, lx + 0.03, 4.9, 4.95, wz - 0.5, wz, steel_black)
        box_span(f"wh_lamp_{k}", lx - 0.16, lx + 0.16, 4.78, 4.9, wz - 0.6, wz - 0.3, steel_black, bevel=0.01)
        K.plane(f"wh_lamp_{k}_glow", (0.26, 0.24), (lx, 4.775, wz - 0.45), M["lamp"], normal="y", tags={"castShadow": False})
    sweep("WAREHOUSE_SERVICE_WALL")


def transformer(M, cx, wz):
    steel, steel_black = M["steel"], M["steel_black"]
    x0, x1, z0, z1 = cx, cx + 1.4, wz - 1.2, wz - 0.05
    box_span("tx_plinth", x0 - 0.1, x1 + 0.1, 0.0, GROUND + 0.1, z0 - 0.1, z1, M["concrete"])
    box_span("tx_body", x0, x1, GROUND + 0.1, GROUND + 1.6, z0, z1, M["grey_dark"], bevel=0.02)
    box_span("tx_roof", x0 - 0.04, x1 + 0.04, GROUND + 1.6, GROUND + 1.7, z0 - 0.04, z1 + 0.02, M["clad_grey"], bevel=0.02)
    for k in range(6):
        box_span(f"tx_fin_{k}", x0 + 0.1, x1 - 0.1, GROUND + 0.35 + k * 0.18, GROUND + 0.37 + k * 0.18, z0 - 0.02, z0, steel_black)
    box_span("tx_door", x0 + 0.15, x0 + 0.65, GROUND + 0.25, GROUND + 1.45, z0 - 0.005, z0, M["trim"])
    box_span("tx_warning", x0 + 0.85, x1 - 0.15, GROUND + 0.9, GROUND + 1.2, z0 - 0.006, z0, M["safety_yellow"], tags={"castShadow": False})
    for k in range(3):
        K.cylinder(f"tx_bushing_{k}", 0.05, 0.3, (x0 + 0.35 + k * 0.35, GROUND + 1.85, (z0 + z1) / 2), M["grey"], segments=8)
    tube("tx_feed", (x1 - 0.2, GROUND + 1.7, z1), (x1 - 0.2, 5.28, z1 + 0.02), 0.03, steel)
    # yellow guard posts + chain in front (visual), enclosure collider
    for k, gx in enumerate((x0 - 0.3, x1 + 0.3)):
        K.cylinder(f"tx_guard_{k}", 0.05, 1.0, (gx, GROUND + 0.5, z0 - 0.13), M["safety_yellow"], segments=8)
    tube("tx_chain", (x0 - 0.3, GROUND + 0.95, z0 - 0.13), (x1 + 0.3, GROUND + 0.9, z0 - 0.13), 0.012, steel_black)
    K.collider("TRANSFORMER", (x0 - 0.1, 0.0, z0 - 0.1), (x1 + 0.1, GROUND + 1.7, z1))


def lockers_x(name, z_wall, y0, x0, x1, M, *, count=4):
    """Row of lockers against a wall at z = z_wall (wall face toward -z), doors facing -z."""
    steel_black = M["steel_black"]
    depth = 0.5
    pitch = (x1 - x0) / count
    z0, z1 = z_wall - depth, z_wall
    box_span(f"{name}_body", x0, x1, y0, y0 + 1.9, z0, z1, M["grey_dark"], bevel=0.01)
    for k in range(count):
        dx0, dx1 = x0 + k * pitch + 0.02, x0 + (k + 1) * pitch - 0.02
        box_span(f"{name}_door_{k}", dx0, dx1, y0 + 0.05, y0 + 1.85, z0 - 0.005, z0 + 0.005, M["navy_paint"])
        for v in range(3):
            box_span(f"{name}_vent_{k}_{v}", dx0 + 0.1, dx1 - 0.1, y0 + 1.5 + v * 0.08, y0 + 1.52 + v * 0.08, z0 - 0.011, z0 - 0.005, steel_black)
        box_span(f"{name}_handle_{k}", dx1 - 0.1, dx1 - 0.07, y0 + 1.0, y0 + 1.12, z0 - 0.04, z0 - 0.01, steel_black)


# --------------------------------------------------------------------------- #
# Seawall service areas: west pocket (pump house, manifold, davit) + east pocket (checkpoint)
# --------------------------------------------------------------------------- #

PUMP_HOUSE = ((-20.6, -42.4), (-17.6, -39.9))     # (x0, z0), (x1, z1) 3 × 2.5 m, 0.05 m off the seawall collider
CHECKPOINT = ((25.6, -29.7), (27.8, -27.5))       # booth footprint (south of the turn-east space z ≥ -27)
SEA_PATH_W = (-39.65, -38.45)                     # west pedestrian path z-range (south of pump house + manifold)
SEA_PATH_E = (-41.4, -40.2)                       # east pedestrian path z-range (south of the racks)


def build_seawall_service(M):
    steel, steel_black, concrete = M["steel"], M["steel_black"], M["concrete"]
    cap_y = 0.9                                     # legacy seawall cap top (collider z -43.45..-42.55)
    # pedestrian paths (1.2 m painted strips): west along the service pocket (south of pump house
    # and manifold) into the cross-west route / side door; east from the cross-east route past
    # the racks to the utility cart bay
    (wa, wb), (ea, eb) = SEA_PATH_W, SEA_PATH_E
    paint("sea_path_edge_a", -22.8, -9.6, wa - 0.05, wa + 0.05, M["paint_white"], y=PROM + 0.008)
    paint("sea_path_edge_b", -22.8, -9.6, wb - 0.05, wb + 0.05, M["paint_white"], y=PROM + 0.008)
    # link lines into the cross-west route: promenade part (y 0) then the asphalt part (y 0.18)
    paint("sea_path_link_a", -10.8, -10.7, wb, -38.0, M["paint_white"], y=PROM + 0.008)
    paint("sea_path_link_a2", -10.8, -10.7, -38.0, -35.0, M["paint_white"])
    paint("sea_path_link_b", -9.6, -9.5, wb, -38.0, M["paint_white"], y=PROM + 0.008)
    paint("sea_path_link_b2", -9.6, -9.5, -38.0, -37.4, M["paint_white"])
    paint("sea_path_edge_c", 9.6, 21.8, ea - 0.05, ea + 0.05, M["paint_white"], y=PROM + 0.008)
    paint("sea_path_edge_d", 9.6, 21.8, eb - 0.05, eb + 0.05, M["paint_white"], y=PROM + 0.008)
    # pump house 3 × 2.5 × 3.1: navy cladding, concrete base, door, lamp, vent, roof with flashing
    (px0, pz0), (px1, pz1) = PUMP_HOUSE
    box_span("pump_base", px0 - 0.1, px1 + 0.1, 0.0, 0.5, pz0 - 0.1, pz1 + 0.1, concrete, bevel=0.02)
    box_span("pump_walls", px0, px1, 0.5, 3.0, pz0, pz1, M["navy"])
    box_span("pump_roof", px0 - 0.15, px1 + 0.15, 3.0, 3.16, pz0 - 0.15, pz1 + 0.15, M["navy_dark"], bevel=0.02)
    box_span("pump_roof_flash", px0 - 0.17, px1 + 0.17, 3.16, 3.2, pz0 - 0.17, pz1 + 0.17, steel)
    box_span("pump_door", px1 + 0.001, px1 + 0.04, 0.5, 2.6, pz1 - 1.75, pz1 - 0.8, M["trim"], bevel=0.01)
    box_span("pump_door_frame", px1 + 0.0, px1 + 0.05, 0.5, 2.68, pz1 - 1.82, pz1 - 0.73, steel)
    box_span("pump_door_handle", px1 + 0.04, px1 + 0.08, 1.45, 1.55, pz1 - 1.05, pz1 - 0.95, steel_black)
    for k in range(3):
        box_span(f"pump_door_vent_{k}", px1 + 0.04, px1 + 0.05, 0.9 + k * 0.1, 0.93 + k * 0.1, pz1 - 1.6, pz1 - 0.95, steel_black)
    box_span("pump_lamp", px1 + 0.02, px1 + 0.3, 2.85, 2.97, pz1 - 1.4, pz1 - 1.15, steel_black, bevel=0.01)
    K.plane("pump_lamp_glow", (0.22, 0.2), (px1 + 0.16, 2.845, pz1 - 1.275), M["lamp"], normal="y", tags={"castShadow": False})
    box_span("pump_vent", px0 + 0.4, px0 + 1.2, 2.2, 2.7, pz1 + 0.0, pz1 + 0.06, M["grey"])
    for k in range(4):
        box_span(f"pump_vent_louvre_{k}", px0 + 0.45, px0 + 1.15, 2.28 + k * 0.1, 2.31 + k * 0.1, pz1 + 0.06, pz1 + 0.08, steel_black)
    K.cylinder("pump_stack", 0.1, 0.9, (px0 + 0.5, 3.6, pz0 + 0.5), steel, segments=8)
    K.plane("pump_status", (0.1, 0.1), (px1 + 0.01, 2.4, pz1 - 0.4), M["status"], normal="x", tags={"castShadow": False, "ambientMotion": "status-pulse"})
    K.collider("PUMP_HOUSE", (px0 - 0.1, 0.0, pz0 - 0.1), (px1 + 0.1, 3.2, pz1 + 0.1))
    # pipe manifold on a plinth east of the pump house: header pipe, three risers with valves, gauges
    mx0, mx1, mz = -16.9, -13.3, -41.6
    box_span("manifold_plinth", mx0, mx1, PROM, PROM + 0.25, mz - 0.55, mz + 0.55, concrete, bevel=0.02)
    tube("manifold_header", (mx0 + 0.2, PROM + 0.75, mz), (mx1 - 0.2, PROM + 0.75, mz), 0.16, M["pipe_red"], segments=12)
    tube("manifold_feed", (mx0 + 0.2, PROM + 0.75, mz), (px1 + 0.05, PROM + 0.75, mz), 0.12, M["pipe_red"], segments=10)
    for k, rx in enumerate((mx0 + 0.7, mx0 + 1.8, mx0 + 2.9)):
        tube(f"manifold_riser_{k}", (rx, PROM + 0.75, mz), (rx, PROM + 1.55, mz), 0.09, steel, segments=8)
        K.cylinder(f"manifold_valve_{k}", 0.2, 0.06, (rx, PROM + 1.6, mz), M["safety_red"], segments=10)
        tube(f"manifold_valve_{k}_stem", (rx, PROM + 1.55, mz), (rx, PROM + 1.72, mz), 0.025, steel_black)
        tube(f"manifold_branch_{k}", (rx, PROM + 1.15, mz), (rx, PROM + 1.15, mz - 0.9), 0.06, steel, segments=8)
        tube(f"manifold_drop_{k}", (rx, PROM + 1.15, mz - 0.9), (rx, PROM + 0.2, mz - 0.9), 0.06, steel, segments=8)
        K.cylinder(f"manifold_gauge_{k}", 0.06, 0.03, (rx + 0.25, PROM + 1.0, mz + 0.16), M["white"], segments=8, axis="z")
    for k, rx in enumerate((mx0 + 0.45, mx1 - 0.45)):
        box_span(f"manifold_support_{k}", rx - 0.05, rx + 0.05, PROM + 0.25, PROM + 0.62, mz - 0.05, mz + 0.05, steel)
    K.collider("MANIFOLD", (mx0, 0.0, mz - 0.55), (mx1, PROM + 1.72, mz + 0.55))
    # compressor skid east of the manifold, between the pocket and the cross-west route
    box_span("sea_compressor_skid", -13.2, -12.0, PROM, PROM + 0.1, -41.0, -40.2, steel_black)
    K.cylinder("sea_compressor_tank", 0.28, 1.0, (-12.6, PROM + 0.4, -40.6), M["blue_machine"], segments=12, axis="x")
    box_span("sea_compressor_motor", -12.95, -12.45, PROM + 0.68, PROM + 1.05, -40.8, -40.4, M["grey_dark"], bevel=0.02)
    K.cylinder("sea_compressor_filter", 0.08, 0.15, (-12.7, PROM + 1.12, -40.6), M["grey"], segments=8)
    K.collider("SEA_COMPRESSOR", (-13.2, 0.0, -41.0), (-12.0, PROM + 1.15, -40.2))
    # emergency rescue cabinet, life rings on the rail, coiled hoses, seawall lights
    box_span("rescue_cabinet", -12.6, -11.8, PROM, PROM + 1.9, -42.45, -42.05, M["safety_red"], bevel=0.02)
    box_span("rescue_cabinet_door", -12.5, -11.9, PROM + 0.2, PROM + 1.7, -42.05, -42.045, M["paint_red"])
    box_span("rescue_cabinet_sign", -12.35, -12.05, PROM + 1.25, PROM + 1.55, -42.045, -42.04, M["white"], tags={"castShadow": False})
    box_span("rescue_cabinet_stand", -12.5, -11.9, 0.0, PROM, -42.4, -42.1, steel_black)
    K.collider("RESCUE_CABINET", (-12.6, 0.0, -42.45), (-11.8, PROM + 1.9, -42.05))
    for k, lx in enumerate((-16.0, -10.5, 14.0, 22.0)):
        K.torus(f"life_ring_{k}", (lx, 1.55, -42.6), 0.3, 0.07, M["buoy_orange"], segments=14, profile=6, axis="z")
        box_span(f"life_ring_{k}_bracket", lx - 0.03, lx + 0.03, 1.25, 1.9, -42.62, -42.56, steel_black)
    for k, (hx, hz) in enumerate(((-13.6, -42.35), (15.0, -42.35))):
        box_span(f"hose_bracket_{k}", hx - 0.04, hx + 0.04, 0.9, 1.5, hz - 0.25, hz + 0.25, steel_black)
        K.torus(f"hose_coil_{k}", (hx, 1.2, hz), 0.3, 0.06, M["hose_yellow"] if k else M["hose"], segments=14, profile=6, axis="x")
        K.torus(f"hose_coil_{k}_b", (hx + 0.12, 1.2, hz), 0.28, 0.05, M["hose_yellow"] if k else M["hose"], segments=14, profile=6, axis="x")
    for k, lx in enumerate((-21.5, -14.0, 10.2, 21.5)):
        tube(f"sea_light_{k}_post", (lx, PROM, -42.25), (lx, 3.4, -42.25), 0.05, steel)
        box_span(f"sea_light_{k}_head", lx - 0.22, lx + 0.22, 3.3, 3.48, -42.5, -42.1, steel_black, bevel=0.02)
        K.plane(f"sea_light_{k}_glow", (0.36, 0.32), (lx, 3.295, -42.3), M["lamp"], normal="y", tags={"castShadow": False})
    # drain outfall through the seawall face (visual, below the cap)
    K.cylinder("outfall_pipe", 0.22, 0.5, (-14.0, 0.25, -43.5), M["concrete_dark"], segments=12, axis="z")
    K.cylinder("outfall_grille", 0.19, 0.02, (-14.0, 0.25, -43.76), steel_black, segments=12, axis="z")
    davit(M, -22.3, -42.9)
    # east pocket: buoy rack, tyre rack, maintenance crates, generator, checkpoint booth + barrier
    buoy_rack(M, 12.4, -41.98)     # z -42.48..-41.48: clear of the seawall collider and the east path
    tyre_rack(M, 17.0, -42.05)
    for k, (cx, cz, sx, sy, sz) in enumerate(((22.6, -41.4, 1.2, 0.9, 1.0), (23.9, -41.5, 0.9, 0.7, 0.8), (22.7, -40.2, 0.8, 0.6, 0.8))):
        box_span(f"maint_crate_{k}", cx - sx / 2, cx + sx / 2, PROM, PROM + sy, cz - sz / 2, cz + sz / 2, M["timber"] if k % 2 else M["tarp"], bevel=0.02)
        for bx in (cx - sx / 2 + 0.12, cx + sx / 2 - 0.15):
            box_span(f"maint_crate_{k}_strap_{bx:.1f}", bx, bx + 0.03, PROM, PROM + sy + 0.005, cz - sz / 2 - 0.005, cz + sz / 2 + 0.005, steel)
    K.collider("MAINT_CRATES", (22.0, 0.0, -42.0), (24.4, PROM + 0.9, -39.8))
    box_span("east_pallet", 25.6, 26.8, PROM, PROM + 0.12, -41.6, -40.6, M["timber"])
    K.cylinder("east_pallet_drum", 0.29, 0.85, (26.2, PROM + 0.545, -41.1), M["rust"], segments=12)
    checkpoint(M)
    utility_cart(M, 27.2, -40.5, base=PROM)
    sweep("SEAWALL_SERVICE")


def davit(M, cx, cz):
    """Small service davit on the seawall cap: foundation, rotating post, supported boom, pulley,
    cable, hook out over the water (visual-only sway on the hook)."""
    steel, steel_black = M["steel"], M["steel_black"]
    K.cylinder("davit_foundation", 0.45, 0.35, (cx, 0.9 + 0.175, cz), M["concrete"], segments=12)
    K.cylinder("davit_base_ring", 0.32, 0.12, (cx, 1.31, cz), steel_black, segments=12)
    tube("davit_post", (cx, 1.35, cz), (cx, 4.3, cz), 0.11, M["safety_yellow"], segments=10)
    K.cylinder("davit_bearing", 0.18, 0.2, (cx, 4.35, cz), steel_black, segments=12)
    # boom toward the water (-z), braced by a tie rod from the post top; pulley at the tip
    tube("davit_boom", (cx, 4.3, cz), (cx, 4.9, cz - 2.4), 0.07, M["safety_yellow"], segments=8)
    tube("davit_tie", (cx, 5.3, cz), (cx, 4.9, cz - 2.3), 0.02, steel)
    tube("davit_post_top", (cx, 4.3, cz), (cx, 5.35, cz), 0.06, M["safety_yellow"], segments=8)
    tube("davit_knee", (cx, 3.6, cz), (cx, 4.6, cz - 1.2), 0.035, steel)
    K.cylinder("davit_pulley", 0.14, 0.08, (cx, 4.85, cz - 2.45), steel_black, segments=12, axis="x")
    K.cylinder("davit_winch", 0.16, 0.3, (cx + 0.3, 2.2, cz), steel_black, segments=10, axis="x")
    box_span("davit_winch_frame", cx + 0.1, cx + 0.5, 1.9, 2.5, cz - 0.2, cz + 0.2, steel)
    box_span("davit_control", cx - 0.35, cx - 0.1, 1.5, 1.9, cz - 0.15, cz + 0.15, M["grey"], bevel=0.01)
    K.plane("davit_control_led", (0.06, 0.03), (cx - 0.36, 1.8, cz), M["green"], normal="x", tags={"castShadow": False})
    # cable from the pulley down 1.8 m to the hook block — davit-sway pendulum (pivot y 4.85)
    sway = {"ambientMotion": "davit-sway", "ignoreWeaponRaycast": True, "castShadow": False}
    tube("davit_cable", (cx, 4.8, cz - 2.5), (cx, 3.0, cz - 2.5), 0.012, M["cable"], segments=5, tags=sway)
    box_span("davit_block", cx - 0.06, cx + 0.06, 2.75, 3.0, cz - 2.56, cz - 2.44, steel_black, tags=sway)
    K.torus("davit_hook", (cx, 2.6, cz - 2.5), 0.11, 0.025, steel, segments=10, profile=5, axis="x", arc=(math.pi * 0.15, math.pi * 1.55), tags=sway)
    K.collider("DAVIT", (cx - 0.45, cap_y_min(), cz - 0.45), (cx + 0.5, 4.4, cz + 0.45))


def cap_y_min():
    return 0.9 + 0.001    # colliders sit on the legacy seawall cap (0..0.9), never overlapping it


def buoy_rack(M, cx, cz):
    steel, steel_black = M["steel"], M["steel_black"]
    x0, x1, z0, z1 = cx - 1.3, cx + 1.3, cz - 0.5, cz + 0.5
    for ux in (x0, x1 - 0.05):
        for uz in (z0, z1 - 0.05):
            box_span(f"buoy_rack_post_{ux:.1f}_{uz:.1f}", ux, ux + 0.05, PROM, PROM + 1.5, uz, uz + 0.05, steel)
    for y in (PROM + 0.15, PROM + 0.85):
        for zz in (z0, z1 - 0.04):
            box_span(f"buoy_rack_rail_{y:.1f}_{zz:.1f}", x0, x1, y, y + 0.04, zz, zz + 0.04, steel)
    box_span("buoy_rack_top", x0, x1, PROM + 1.46, PROM + 1.5, z0, z1, steel_black)
    for k in range(4):
        bx = x0 + 0.4 + k * 0.6
        col = M["buoy_orange"] if k % 2 else M["buoy_red"]
        K.cylinder(f"buoy_{k}", 0.24, 0.5, (bx, PROM + 0.55, cz), col, segments=12, axis="x")
        K.cylinder(f"buoy_{k}_cone_a", 0.24, 0.16, (bx, PROM + 0.55, cz - 0.33), col, segments=12, radius_top=0.08, axis="x")
        K.cylinder(f"buoy_{k}_cone_b", 0.24, 0.16, (bx, PROM + 0.55, cz + 0.33), col, segments=12, radius_top=0.08, axis="x")
        K.cylinder(f"buoy_{k}_top", 0.2, 0.36, (bx, PROM + 1.15, cz), col, segments=12, axis="x")
    K.collider("BUOY_RACK", (x0, 0.0, z0), (x1, PROM + 1.5, z1))


def tyre_rack(M, cx, cz):
    steel, rubber = M["steel"], M["rubber"]
    x0, x1 = cx - 1.0, cx + 1.0
    for ux in (x0, x1 - 0.05):
        box_span(f"tyre_rack_post_{ux:.1f}", ux, ux + 0.05, PROM, PROM + 1.4, cz - 0.05, cz + 0.05, steel)
    for y in (PROM + 0.5, PROM + 1.36):
        box_span(f"tyre_rack_rail_{y:.1f}", x0, x1, y, y + 0.04, cz - 0.05, cz + 0.05, steel)
    for k in range(6):
        K.torus(f"tyre_{k}", (x0 + 0.25 + k * 0.3, PROM + 0.9, cz), 0.3, 0.1, rubber, segments=14, profile=6, axis="x")
    K.collider("TYRE_RACK", (x0, 0.0, cz - 0.45), (x1, PROM + 1.4, cz + 0.45))


def checkpoint(M):
    """Checkpoint booth at the far (BD) end of the lane: booth beside the lane, raised barrier
    arm (open), beacon, bollards — the lane itself stays clear."""
    steel, steel_black = M["steel"], M["steel_black"]
    (bx0, bz0), (bx1, bz1) = CHECKPOINT
    box_span("cp_base", bx0 - 0.1, bx1 + 0.1, 0.0, 0.3, bz0 - 0.1, bz1 + 0.1, M["concrete"], bevel=0.02)
    box_span("cp_walls", bx0, bx1, 0.3, 1.2, bz0, bz1, M["navy"])
    for nm, (a0, a1, b0, b1, normal) in {"s": (bx0 + 0.1, bx1 - 0.1, bz1 - 0.02, bz1 + 0.04, "z"), "w": (bx0 - 0.04, bx0 + 0.02, bz0 + 0.1, bz1 - 0.1, "x"),
                                         "e": (bx1 - 0.02, bx1 + 0.04, bz0 + 0.1, bz1 - 0.1, "x")}.items():
        if normal == "z":
            box_span(f"cp_sill_{nm}", a0 - 0.05, a1 + 0.05, 1.2, 1.26, b0, b1, steel)
            K.plane(f"cp_glass_{nm}", (a1 - a0, 1.0), ((a0 + a1) / 2, 1.76, (b0 + b1) / 2), M["glass"], normal="z")
            box_span(f"cp_head_{nm}", a0 - 0.05, a1 + 0.05, 2.26, 2.32, b0, b1, steel)
        else:
            box_span(f"cp_sill_{nm}", a0, a1, 1.2, 1.26, b0 - 0.05, b1 + 0.05, steel)
            K.plane(f"cp_glass_{nm}", (b1 - b0, 1.0), ((a0 + a1) / 2, 1.76, (b0 + b1) / 2), M["glass"], normal="x")
            box_span(f"cp_head_{nm}", a0, a1, 2.26, 2.32, b0 - 0.05, b1 + 0.05, steel)
    for cx_ in (bx0, bx1 - 0.08):
        for cz_ in (bz0, bz1 - 0.08):
            box_span(f"cp_post_{cx_:.1f}_{cz_:.1f}", cx_, cx_ + 0.08, 1.2, 2.32, cz_, cz_ + 0.08, steel)
    box_span("cp_wall_n", bx0, bx1, 1.2, 2.32, bz0, bz0 + 0.08, M["navy"])
    box_span("cp_door", bx0 + 0.02, bx0 + 0.06, 0.32, 2.2, bz0 + 0.3, bz0 + 1.1, M["trim"])   # door in the north wall
    box_span("cp_roof", bx0 - 0.3, bx1 + 0.3, 2.32, 2.5, bz0 - 0.3, bz1 + 0.3, M["navy_dark"], bevel=0.02)
    box_span("cp_roof_flash", bx0 - 0.32, bx1 + 0.32, 2.5, 2.54, bz0 - 0.32, bz1 + 0.32, steel)
    box_span("cp_desk", bx0 + 0.15, bx1 - 0.15, 0.95, 1.0, bz1 - 0.6, bz1 - 0.1, M["grey"])
    box_span("cp_monitor", bx0 + 0.7, bx1 - 0.7, 1.0, 1.3, bz1 - 0.5, bz1 - 0.47, steel_black)
    K.plane("cp_screen", (0.7, 0.26), ((bx0 + bx1) / 2, 1.15, bz1 - 0.465), M["screen"], normal="z", tags={"castShadow": False})
    K.plane("cp_ceiling_light", (1.4, 0.5), ((bx0 + bx1) / 2, 2.31, (bz0 + bz1) / 2), M["led"], normal="y", tags={"castShadow": False})
    K.cylinder("cp_beacon_base", 0.1, 0.1, ((bx0 + bx1) / 2, 2.59, bz1 - 0.3), steel_black, segments=8)
    K.cylinder("cp_beacon", 0.08, 0.16, ((bx0 + bx1) / 2, 2.72, bz1 - 0.3), M["beacon"], segments=8, tags={"castShadow": False, "ambientMotion": "beacon-flash"})
    K.collider("CHECKPOINT_BOOTH", (bx0 - 0.1, 0.0, bz0 - 0.1), (bx1 + 0.1, 2.54, bz1 + 0.1))
    # barrier arm: pedestal on the Warehouse apron behind the kerb, arm raised (open) — never a blocker
    ax, az = bx1 - 0.2, WAREHOUSE_WALL_Z - 0.65
    box_span("cp_barrier_pedestal", ax - 0.2, ax + 0.2, GROUND, GROUND + 1.0, az - 0.2, az + 0.2, M["safety_yellow"], bevel=0.02)
    box_span("cp_barrier_pedestal_top", ax - 0.22, ax + 0.22, GROUND + 1.0, GROUND + 1.06, az - 0.22, az + 0.22, steel_black)
    tube("cp_barrier_arm", (ax, GROUND + 1.05, az), (ax, GROUND + 4.6, az - 0.35), 0.05, M["paint_white"], segments=6)
    for k in range(4):
        y0 = GROUND + 1.5 + k * 0.8
        tube(f"cp_barrier_stripe_{k}", (ax, y0, az - (y0 - GROUND - 1.05) / 3.55 * 0.35), (ax, y0 + 0.35, az - (y0 + 0.35 - GROUND - 1.05) / 3.55 * 0.35), 0.052, M["safety_red"], segments=6)
    K.collider("CP_BARRIER_PEDESTAL", (ax - 0.2, 0.0, az - 0.2), (ax + 0.2, GROUND + 1.06, az + 0.2))
    K.cylinder("cp_bollard_a", 0.1, 0.9, (bx0 - 0.7, GROUND + 0.45, bz1 - 0.3), steel, segments=10)
    K.cylinder("cp_bollard_a_cap", 0.11, 0.05, (bx0 - 0.7, GROUND + 0.92, bz1 - 0.3), M["paint_yellow"], segments=10)
    K.collider("CP_BOLLARD", (bx0 - 0.8, 0.0, bz1 - 0.4), (bx0 - 0.6, GROUND + 0.95, bz1 - 0.2))


# --------------------------------------------------------------------------- #
# LOD1, references, main
# --------------------------------------------------------------------------- #

def build_lod1(M):
    L = dict(lod="LOD1")
    # Operations building silhouette + sign + glazing + roof deck items as blocks
    box_span("l1_base", BX0 - 0.16, BX1 + 0.16, 0.0, 0.9, BZ0 - 0.16, BZ1 + 0.16, M["concrete"], **L)
    box_span("l1_walls", BX0 - 0.12, BX1 + 0.12, 0.9, BH - 0.02, BZ0 - 0.12, BZ1 + 0.12, M["navy"], **L)
    box_span("l1_roof", BX0 - 0.5, BX1 + 0.5, BH - 0.3, ROOF_TOP, BZ0 + 1.5, BZ1 + 0.5, M["navy_dark"], **L)
    box_span("l1_annex_roof", BX0 - 0.12, BX1 + 0.12, BH - 0.05, BH, BZ0 - 0.12, BZ0 + 1.5, M["clad_grey"], **L)
    box_span("l1_parapet_s", BX0, BX1, BH, BH + 1.1, BZ1 - 0.15, BZ1 + 0.15, M["concrete"], **L)
    box_span("l1_sign", -4.6, 8.6, BH + 0.35, BH + 1.45, BZ1 - 0.46, BZ1 + 0.5, M["steel_black"], **L)
    box_span("l1_sign_face", -4.4, 8.4, BH + 0.45, BH + 1.35, BZ1 + 0.5, BZ1 + 0.52, M["led"], tags={"castShadow": False}, **L)
    K.plane("l1_glass_front", (2.8, 1.6), (-7.0, 1.9, BZ1 + 0.04), M["glass"], normal="z", **L)
    K.plane("l1_glass_north", (8.6, 1.4), (-2.3, 2.1, BZ0 - 0.13), M["glass"], normal="z", **L)
    box_span("l1_status", -8.5, -5.5, 3.0, 3.06, BZ1 + 0.2, BZ1 + 0.215, M["status"], tags={"castShadow": False}, **L)
    for k, (cx0, cx1, cz0, cz1) in enumerate(((-2.55, -1.45, -37.55, -36.45), (0.45, 1.55, -33.55, -32.45))):
        box_span(f"l1_cond_{k}", cx0, cx1, BH + 0.25, BH + 1.04, cz0, cz1, M["grey"], **L)
    box_span("l1_apron", BX0, BX1, 0.0, DECK, -28.0, -24.0, M["concrete"], **L)
    # lane readability: edge lines + weighbridge frame
    paint("l1_lane_edge_n", LANE_X[0], LANE_X[1], LANE_Z[0] + 0.05, LANE_Z[0] + 0.17, M["paint_yellow"], lod="LOD1")
    paint("l1_lane_edge_s", LANE_X[0], LANE_X[1], LANE_Z[1] - 0.17, LANE_Z[1] - 0.05, M["paint_yellow"], lod="LOD1")
    wx0, wx1, wz0, wz1 = WEIGHBRIDGE
    box_span("l1_weighbridge", wx0 - 0.14, wx1 + 0.14, GROUND, GROUND + 0.02, wz0 - 0.14, wz1 + 0.14, M["steel"], tags={"castShadow": False}, **L)
    # service wall canopies + roller doors, transformer, pump house, checkpoint, racks
    for k, (d0, d1) in enumerate(ROLLER_DOORS):
        box_span(f"l1_rd_{k}", d0, d1, 0.0, 4.5, WALL - 0.1, WALL, M["clad_grey"], **L)
        box_span(f"l1_canopy_{k}", d0 - 0.6, d1 + 0.6, 4.5, 4.72, WALL - 2.4, WALL - 0.4, M["clad_grey"], **L)
    box_span("l1_transformer", 20.0, 21.4, 0.0, GROUND + 1.7, WALL - 1.2, WALL - 0.05, M["grey_dark"], **L)
    (px0, pz0), (px1, pz1) = PUMP_HOUSE
    box_span("l1_pump", px0, px1, 0.0, 3.16, pz0, pz1, M["navy"], **L)
    (cx0, cz0), (cx1, cz1) = CHECKPOINT
    box_span("l1_checkpoint", cx0, cx1, 0.0, 2.5, cz0, cz1, M["navy"], **L)
    box_span("l1_buoy_rack", 11.1, 13.7, 0.0, 1.5, -42.48, -41.48, M["buoy_orange"], **L)
    box_span("l1_tyre_rack", 16.0, 18.0, 0.0, 1.4, -42.5, -41.6, M["rubber"], **L)
    tube("l1_davit_post", (-22.3, 1.35, -42.9), (-22.3, 5.35, -42.9), 0.11, M["safety_yellow"], lod="LOD1")
    tube("l1_davit_boom", (-22.3, 4.3, -42.9), (-22.3, 4.9, -45.3), 0.07, M["safety_yellow"], lod="LOD1")


def add_references():
    count = K.import_reference_colliders(COLLIDER_JSON, (ZONE_MIN, ZONE_MAX))
    kept = K.import_reference_glb(CINEMATIC_GLB, (ZONE_MIN, ZONE_MAX)) if CINEMATIC_GLB.exists() else 0
    top = REFERENCE_DIR / "top-orthographic.png"
    if top.exists():
        # concept board (not to scale): laid over the strip for layout reading only
        K.add_reference_image(top, "REF_IMG_top_ortho", ((ZONE_MIN[0] + ZONE_MAX[0]) / 2, -0.06, -31.0), 52.7)
    return count, kept


def main(save: bool = True) -> dict:
    K.new_scene("Harbor_V2_Operations_AB_Authoring")
    for name in ("LANE", "OPERATIONS_BUILDING", "OPERATIONS_INTERIOR", "WAREHOUSE_SERVICE_WALL", "SEAWALL_SERVICE", "YARD_PROPS", "AMBIENT_DYNAMIC"):
        K.subcollection("RENDER_LOD0", name)
    M = materials()
    _stats.update({"rotors": 0})
    build_lane(M)
    build_building_exterior(M)
    build_interior(M)
    build_apron(M)
    build_service_wall(M)
    build_seawall_service(M)
    build_lod1(M)
    K.project_box_uvs()
    # per-collection triangle counts before batching (handoff metrics)
    per_collection = {}
    for name in ("LANE", "OPERATIONS_BUILDING", "OPERATIONS_INTERIOR", "WAREHOUSE_SERVICE_WALL", "SEAWALL_SERVICE", "YARD_PROPS", "AMBIENT_DYNAMIC"):
        tris = 0
        for obj in K.collections[name].all_objects:
            if obj.type == "MESH":
                obj.data.calc_loop_triangles(); tris += len(obj.data.loop_triangles)
        per_collection[name] = tris
    lod0 = K.batch_by_material("LOD0")
    lod1 = K.batch_by_material("LOD1")
    for obj in K.collections["RENDER_LOD1"].objects:
        obj.hide_set(True)
    refs = add_references()
    for name in ("COLLISION", "REFERENCE"):
        for obj in K.collections[name].objects:
            obj.hide_set(True)
    stats = K.stats()
    stats["references"] = {"colliders": refs[0], "cinematicObjects": refs[1]}
    stats["lod0Batches"] = [o.name for o in lod0]
    stats["lod1Batches"] = [o.name for o in lod1]
    stats["zoneColliders"] = len(K.collections["COLLISION_ZONE"].objects)
    stats["perCollection"] = per_collection
    stats["detail"] = dict(_stats)
    BUILD_STATS.parent.mkdir(parents=True, exist_ok=True)
    BUILD_STATS.write_text(json.dumps({"zone": "OPERATIONS_AB", "perCollection": per_collection, "detail": dict(_stats),
                                       "lod0Batches": stats["lod0Batches"], "lod1Batches": stats["lod1Batches"]}, indent=2) + "\n")
    if save:
        OUTPUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))
        stats["saved"] = str(OUTPUT_BLEND)
    return stats


if __name__ == "__main__":
    main(save=True)
