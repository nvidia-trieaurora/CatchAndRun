"""BD — Eastern Container Yard: Harbor V2 zone builder (Blender 5.2, run inside the MCP session).

Authors ``art-source/harbor-v2/container-bd/container-bd.blend``: the old scattered
container yard east of the Warehouse re-laid as a working harbour yard with a 6 m
north-south forklift lane, two 3 m alleys, two-high container blocks along the west
and south, a single-height waterfront row, a painted loading zone with a chassis
trailer, an idle forklift, an empty-container handler, and the shop rebuilt as the
HARBOR MARKET mini-supermarket (harbor_market.py) with a clear 6.5 m forecourt.

Gameplay contract kept: shop shell colliders (3 m automatic door x 43.5..46.5 at
z -33, 2.8 m clear), roof, east-side utility boxes, yard office (51.5..58.5 x -4.5..0.5),
lamp posts, seawalls, spawn points (35,-15) (40,-20) (30,-25) (38,-10) all inside open
lanes. The shop interior boxes (gondolas, fridges, checkout, rooms) are procedural
(buildDocksideMiniMart) and dressed 1:1 here; the west side of the shop is a flat
service path (the legacy crate stair to the roof was removed on request). Container
colliders are re-authored: the zone ships COL_MOVE_CONTAINER_BD_* with the visuals and
the runtime override drops the 14 legacy COL_MOVE_CINE_CONTAINER_* + COL_MOVE_CINE_FORKLIFT
boxes (see harborZones.ts).

Coordinates are Three.js metres (x east, y up, z south). Ground: the legacy island
asphalt top is y 0.18 (players walk at y 0); paint sits at 0.19..0.21 like the legacy
road markings, the shop forecourt is a 0.25 slab continuous with the Mini Mart slab.

Usage (MCP): ``import build_container_bd as B; B.main(save=True)``
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

import zone_kit as zk

ROOT = Path(__file__).resolve().parents[3]
COLLIDER_JSON = ROOT / "art-source/harbor-v2/_staging/procedural-colliders.json"
CINEMATIC_GLB = ROOT / "client/public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb"
REFERENCE_DIR = ROOT / "art-source/harbor-v2/_staging/reference-bd"
OUTPUT_BLEND = ROOT / "art-source/harbor-v2/container-bd/container-bd.blend"

ZONE_MIN = (29.5, -1.0, -44.6)
ZONE_MAX = (62.6, 14.0, 5.5)   # roof overhang to z -44, open gate leaves to z 5.25

# ---- legacy contract (metres) --------------------------------------------------- #
GROUND = 0.18            # legacy asphalt top (players stand at y 0)
PAINT = 0.195            # centre of the paint layer (legacy markings 0.19..0.21)
SLAB_TOP = 0.25          # Mini Mart slab top = shop forecourt sidewalk
MART = ((38.0, 0.0, -43.0), (52.0, 5.5, -33.0))
MART_DOOR_X = (44.0, 46.0)
MART_ROOF = ((37.0, 5.5, -44.0), (53.0, 5.8, -32.0))
MART_CANOPY = ((37.0, 5.4, -33.0), (53.0, 5.65, -31.0))
OFFICE = ((51.5, 0.0, -4.5), (58.5, 3.2, 0.5))
LAMPS = ((50.0, -28.0), (55.0, -3.0))           # procedural lamp-post colliders (0.5 sq, 1.5 high)

# ---- new layout ----------------------------------------------------------------- #
LANE_X = (44.2, 50.2)               # main forklift lane, north-south (east of the legacy tire-stack collider)
ROAD_Z = (-25.0, -19.0)             # legacy east-west service road continues as the cross road
FORECOURT = ((34.2, -32.5), (55.8, -26.0))   # (x0, z0), (x1, z1) sidewalk envelope
ALLEY_A = (-16.51, -13.45)
ALLEY_B = (-11.01, -7.7)
WEST_BLOCK_X = (31.0, 43.19)        # 40 ft container along x
EAST_ROW_X = (58.4, 60.84)          # waterfront single row along z
FENCE_Z = 1.95
GATE_X = (43.85, 50.55)
LOADING_ZONE = ((51.1, -12.4), (58.0, -4.8))
TIRE_STACK = ((41.5, 0.0, -10.5), (44.2, 1.6, -9.5))   # procedural collider #183, dressed by the zone

C20, C40 = 6.058, 12.192
CW, CH = 2.438, 2.591

K = zk.ZoneKit("CONTAINER_BD", "container-bd", "container-bd-pbr")
_M: dict = {}


# --------------------------------------------------------------------------- #
# Materials
# --------------------------------------------------------------------------- #

def srgb_tint(rgb, *, base_mean=0.46):
    """sRGB design colour -> linear COLOR_0 multiplier for the neutral (mean 0.46) sheet."""
    out = []
    for c in rgb:
        lin = ((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92
        out.append(min(1.0, lin / base_mean))
    return tuple(out)


def materials():
    M = {}
    sheet = K.pbr("MAT_CONTAINER_STEEL", "container_neutral", vertex_tint=True)
    grime = (GROUND, 1.15, 0.68)

    def tint(name, srgb, **kw):
        return zk.TintedMaterial(sheet, srgb_tint(srgb), name, **kw)
    # four container colours, muted, weathered by the shared streak texture + grime gradient
    M["c_teal"] = tint("teal", (0.22, 0.54, 0.54), grime=grime, roof_dirt=0.35)
    M["c_red"] = tint("brick_red", (0.66, 0.24, 0.18), grime=grime, roof_dirt=0.35)
    M["c_navy"] = tint("navy", (0.27, 0.36, 0.55), grime=grime, roof_dirt=0.35)
    M["c_ochre"] = tint("faded_ochre", (0.76, 0.62, 0.34), grime=grime, roof_dirt=0.35)
    M["c_cream"] = tint("reefer_cream", (0.8, 0.79, 0.74), grime=(GROUND, 1.0, 0.6), roof_dirt=0.3)
    M["c_grey"] = tint("maintenance_grey", (0.44, 0.47, 0.48), grime=grime, roof_dirt=0.35)
    # sheet metal reused for the shop and site office cladding
    M["clad"] = tint("cladding", (0.52, 0.55, 0.57), grime=(SLAB_TOP, 1.4, 0.62), roof_dirt=0.25)
    M["clad_dark"] = tint("cladding_dark", (0.3, 0.32, 0.34), grime=(GROUND, 1.2, 0.65), roof_dirt=0.3)
    # Harbor Market: charcoal vertical cladding + clear storefront / fridge glass
    M["charcoal"] = tint("cladding_charcoal", (0.17, 0.18, 0.2), grime=(SLAB_TOP, 1.6, 0.7), roof_dirt=0.2)
    M["glass_clear"] = K.simple("MAT_GLASS_CLEAR", (0.8, 0.86, 0.88), 0.08, alpha=0.28, blended=True, double_sided=True)
    M["steel"] = K.pbr("MAT_STEEL_DARK", "steel_dark")
    M["concrete"] = K.pbr("MAT_CONCRETE_YARD", "concrete_yard")
    M["grating"] = K.pbr("MAT_GRATING", "grating", pack="construction-pbr", alpha_clip=True, double_sided=True)
    M["grass"] = K.pbr("MAT_GRASS_TUFT", "grass_tuft", pack="garden-pbr", alpha_clip=True, double_sided=True)
    M["glass"] = K.simple("MAT_GLASS_SHOP", (0.1, 0.14, 0.17), 0.05, alpha=0.62, blended=True, double_sided=True)
    M["puddle"] = K.simple("MAT_PUDDLE", (0.14, 0.17, 0.19), 0.03, alpha=0.55, blended=True)
    lights = K.palette("MAT_BD_LIGHT", {
        "warm": (1.0, 0.84, 0.58),
        "cyan": (0.35, 0.92, 1.0),
        "amber": (1.0, 0.58, 0.14),
        "lamp": (1.0, 0.9, 0.7),
        "screen": (0.35, 1.0, 0.65),
        "red": (1.0, 0.2, 0.15),
        # Harbor Market: LED ceiling panels, the warm-white sign letters, fridge interiors
        "led": (1.0, 0.97, 0.9),
        "sign": (1.0, 0.93, 0.8),
        "cool": (0.72, 0.86, 1.0),
    }, rough=0.3, emissive_strength=3.2)
    M.update(lights)
    palette = K.palette("MAT_BD_PALETTE", {
        "paint_yellow": (0.84, 0.68, 0.14),
        "paint_white": (0.82, 0.82, 0.78),
        "rubber": (0.06, 0.06, 0.065),
        "safety_red": (0.66, 0.12, 0.1),
        "machine_orange": (0.76, 0.38, 0.1),
        "machine_yellow": (0.82, 0.58, 0.1),
        "rust": (0.38, 0.19, 0.1),
        "timber": (0.48, 0.37, 0.24),
        "cardboard": (0.58, 0.44, 0.3),
        "tarp_blue": (0.14, 0.28, 0.5),
        "tarp_green": (0.24, 0.36, 0.28),
        "steel_black": (0.09, 0.1, 0.11),
        "trim": (0.2, 0.22, 0.24),
        "shelf": (0.55, 0.55, 0.5),
        "product_a": (0.75, 0.28, 0.2),
        "product_b": (0.2, 0.45, 0.75),
        "product_c": (0.85, 0.72, 0.2),
        "grey": (0.58, 0.58, 0.56),
        "bin_green": (0.18, 0.32, 0.2),
        "white": (0.8, 0.8, 0.78),
        "bike_blue": (0.18, 0.32, 0.58),
        "concrete_dark": (0.28, 0.28, 0.28),
        "rope": (0.6, 0.53, 0.38),
        "cable": (0.08, 0.08, 0.09),
        "interior": (0.62, 0.6, 0.55),
        # Harbor Market finishes + produce
        "navy": (0.08, 0.12, 0.24),
        "wall_cream": (0.78, 0.75, 0.68),
        "floor": (0.4, 0.38, 0.35),
        "ceiling": (0.86, 0.85, 0.82),
        "counter": (0.62, 0.62, 0.6),
        "apple_red": (0.72, 0.12, 0.1),
        "apple_green": (0.55, 0.7, 0.2),
        "orange": (0.95, 0.5, 0.1),
        "banana": (0.95, 0.82, 0.2),
        "lemon": (0.95, 0.9, 0.25),
        "potato": (0.6, 0.45, 0.28),
        "cabbage": (0.35, 0.55, 0.25),
        "tomato": (0.85, 0.15, 0.1),
        "melon": (0.2, 0.42, 0.2),
        "plum": (0.35, 0.15, 0.4),
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
    """Flat paint stripe lying on the asphalt (no shadow)."""
    return box_span(name, x0, x1, y - 0.006, y + 0.006, z0, z1, mat, lod=lod, tags={"castShadow": False})


def dashes(name, x0, x1, z0, z1, mat, dash=2.0, gap=3.0, along="z"):
    n = 0
    if along == "z":
        z = z0
        while z + dash <= z1 + 1e-6:
            paint(f"{name}_{n}", x0, x1, z, z + dash, mat); z += dash + gap; n += 1
    else:
        x = x0
        while x + dash <= x1 + 1e-6:
            paint(f"{name}_{n}", x, x + dash, z0, z1, mat); x += dash + gap; n += 1


def hatch(name, x0, x1, z0, z1, mat, pitch=0.9, width=0.12):
    """45-degree hatching clipped to a rectangle (loading zone / turning bay)."""
    n = 0
    c = x0 + z0 + pitch / 2
    while c < x1 + z1:
        pts = []
        for xx in (x0, x1):
            zz = c - xx
            if z0 <= zz <= z1:
                pts.append((xx, zz))
        for zz in (z0, z1):
            xx = c - zz
            if x0 < xx < x1:
                pts.append((xx, zz))
        if len(pts) >= 2:
            (ax_, az_), (bx_, bz_) = pts[0], pts[-1]
            length = math.hypot(bx_ - ax_, bz_ - az_)
            if length > 0.3:
                K.box(f"{name}_{n}", (length - 0.08, 0.012, width), ((ax_ + bx_) / 2, PAINT, (az_ + bz_) / 2), mat,
                      rot_y=math.pi / 4, tags={"castShadow": False})
                n += 1
        c += pitch


def grate(name, x, z, w, d, mat_grating, mat_dark, y=GROUND, rot_y=0.0):
    """Drain grate flush with the asphalt: dark pit + grating card + steel frame."""
    box_span(f"{name}_pit", x - w / 2, x + w / 2, y - 0.06, y + 0.002, z - d / 2, z + d / 2, mat_dark, tags={"castShadow": False})
    K.plane(f"{name}_grid", (w, d), (x, y + 0.012, z), mat_grating, normal="y", rot_y=rot_y, tags={"castShadow": False})
    box_span(f"{name}_frame_a", x - w / 2 - 0.04, x + w / 2 + 0.04, y, y + 0.018, z - d / 2 - 0.04, z - d / 2, _M["steel"], tags={"castShadow": False})
    box_span(f"{name}_frame_b", x - w / 2 - 0.04, x + w / 2 + 0.04, y, y + 0.018, z + d / 2, z + d / 2 + 0.04, _M["steel"], tags={"castShadow": False})


def weed(name, x, z, h=0.32, w=0.36, y=GROUND):
    tags = {"ambientMotion": "sway-grass", "weaponImpactKind": "foliage", "castShadow": False, "ignoreWeaponRaycast": True}
    for k, r in enumerate((0.0, math.pi / 2)):
        K.plane(f"{name}_{k}", (w, h), (x, y + h / 2, z), _M["grass"], normal="z", rot_y=r + 0.3, tags=tags)


def puddle(name, x, z, w, d):
    K.plane(name, (w, d), (x, GROUND + 0.012, z), _M["puddle"], normal="y",
            tags={"castShadow": False, "ambientMotion": "pond-ripple", "weaponImpactKind": "water", "ignoreWeaponRaycast": True})


# --------------------------------------------------------------------------- #
# Container kit
# --------------------------------------------------------------------------- #

def container(tag, x0, y0, z0, length, tint, *, along="x", doors="closed", variant="std",
              door_end="+", collide=True, lod0=True):
    """Modular ISO container. ``along`` = axis of the length; ``door_end`` = "+"/"-" end
    along that axis; ``doors``: closed | ajar (visual-only, cargo inside) | none.
    Variants: std, reefer (machinery end), maintenance (side door + window), damaged
    (dented panel + rust), flatrack (floor + end frames + drums)."""
    M = _M
    L = length
    if along == "x":
        x1, z1 = x0 + L, z0 + CW
    else:
        x1, z1 = x0 + CW, z0 + L
    y1 = y0 + CH
    if collide:
        K.collider(f"CONT_{tag}", (x0, y0, z0), (x1, y1, z1))
    if not lod0:
        return
    P = 0.14                       # corner post section
    R = 0.11                       # rail section
    steel = M["steel"]
    ax = along == "x"

    def span(nm, u0, u1, v0, v1, yy0, yy1, mat, **kw):
        # u along the length axis, v across
        if ax:
            return box_span(nm, u0, u1, yy0, yy1, v0, v1, mat, **kw)
        return box_span(nm, v0, v1, yy0, yy1, u0, u1, mat, **kw)

    u0, u1 = (x0, x1) if ax else (z0, z1)
    v0, v1 = (z0, z1) if ax else (x0, x1)
    plus = door_end == "+"
    door_u = u1 if plus else u0
    front_u = u0 if plus else u1

    if variant == "flatrack":
        span(f"{tag}_floor", u0, u1, v0, v1, y0, y0 + 0.28, tint)
        for uu in (u0, u1):
            s = 1 if uu == u0 else -1
            for vv in (v0 + P / 2, v1 - P / 2):
                span(f"{tag}_post_{uu:.1f}_{vv:.1f}", uu, uu + s * P, vv - P / 2, vv + P / 2, y0, y1, steel)
            span(f"{tag}_head_{uu:.1f}", uu, uu + s * P, v0, v1, y1 - R, y1, steel)
        for k, (du, dv) in enumerate(((0.3, 0.3), (0.3, 0.7), (0.55, 0.5))):
            cu, cv = u0 + P + 0.5 + (u1 - u0 - 2 * P - 1.0) * du, v0 + 0.35 + (v1 - v0 - 0.7) * dv
            cx, cz = (cu, cv) if ax else (cv, cu)
            K.cylinder(f"{tag}_drum_{k}", 0.29, 0.88, (cx, y0 + 0.28 + 0.44, cz), M["tarp_blue"] if k else M["rust"], segments=10)
        cu = u0 + (u1 - u0) * 0.75
        cx, cz = (cu, v0 + 1.2) if ax else (v0 + 1.2, cu)
        K.box(f"{tag}_crate", (1.1, 0.9, 1.1), (cx, y0 + 0.28 + 0.45, cz), M["timber"])
        # strap lines over the cargo
        for k in range(3):
            su = u0 + P + 0.8 + k * (u1 - u0 - 2 * P - 1.6) / 2
            a = (su, y0 + 0.28, v0 + 0.02) if ax else (v0 + 0.02, y0 + 0.28, su)
            b = (su, y0 + 1.3, (v0 + v1) / 2) if ax else ((v0 + v1) / 2, y0 + 1.3, su)
            c = (su, y0 + 0.28, v1 - 0.02) if ax else (v1 - 0.02, y0 + 0.28, su)
            bar(f"{tag}_strap_{k}_a", a, b, 0.012, M["steel_black"], w=0.05, tags={"castShadow": False, "ignoreWeaponRaycast": True})
            bar(f"{tag}_strap_{k}_b", b, c, 0.012, M["steel_black"], w=0.05, tags={"castShadow": False, "ignoreWeaponRaycast": True})
        return

    ajar = doors == "ajar"
    wall_off = 0.0 if ajar else 0.03          # side wall face offset from the frame plane
    reefer_depth = 0.42 if variant == "reefer" else 0.0
    if ajar:
        # hollow shell so the open door shows an interior with cargo
        t = 0.05
        span(f"{tag}_floor", u0, u1, v0, v1, y0, y0 + 0.12, tint)
        span(f"{tag}_roof", u0, u1, v0, v1, y1 - 0.06, y1, tint, bevel=0.015)
        span(f"{tag}_side_a", u0, u1, v0, v0 + t, y0 + 0.12, y1 - 0.06, tint)
        span(f"{tag}_side_b", u0, u1, v1 - t, v1, y0 + 0.12, y1 - 0.06, tint)
        fu0, fu1 = (front_u, front_u + t) if plus else (front_u - t, front_u)
        span(f"{tag}_front", fu0, fu1, v0, v1, y0 + 0.12, y1 - 0.06, tint)
        cu = u0 + (u1 - u0) * (0.35 if plus else 0.65)
        cx, cz = (cu, (v0 + v1) / 2) if ax else ((v0 + v1) / 2, cu)
        K.box(f"{tag}_pallet", (1.2, 0.14, 1.0), (cx, y0 + 0.12 + 0.07, cz), M["timber"])
        K.box(f"{tag}_cargo_a", (1.0, 0.8, 0.8), (cx, y0 + 0.12 + 0.14 + 0.4, cz), M["cardboard"])
        K.box(f"{tag}_cargo_b", (0.6, 0.5, 0.6), (cx + 0.1, y0 + 0.12 + 0.94 + 0.25, cz - 0.1), M["cardboard"])
    else:
        # closed body: one box slightly short of the door end (inset leaves) and of the
        # reefer unit recess; walls sit 3 cm inside the frame
        bu0 = u0 + (reefer_depth if plus else 0.04)
        bu1 = u1 - (0.04 if plus else reefer_depth)
        span(f"{tag}_body", bu0, bu1, v0 + wall_off, v1 - wall_off, y0 + 0.02, y1 - 0.02, tint, bevel=0.02)

    # corner posts + top/bottom rails (steel)
    for uu in (u0, u1):
        s = 1 if uu == u0 else -1
        for vv in (v0, v1):
            sv = 1 if vv == v0 else -1
            span(f"{tag}_post_{uu:.1f}_{vv:.1f}", uu, uu + s * P, vv, vv + sv * P, y0, y1, steel)
        span(f"{tag}_erail_t_{uu:.1f}", uu, uu + s * R, v0, v1, y1 - R, y1, steel)
        span(f"{tag}_erail_b_{uu:.1f}", uu, uu + s * R, v0, v1, y0, y0 + R, steel)
    for vv in (v0, v1):
        sv = 1 if vv == v0 else -1
        span(f"{tag}_srail_t_{vv:.1f}", u0, u1, vv, vv + sv * R, y1 - R, y1, steel)
        span(f"{tag}_srail_b_{vv:.1f}", u0, u1, vv, vv + sv * R, y0, y0 + R, steel)
        # forklift pockets on the bottom side rails (20 ft spec: 2.05 m centres)
        if L < 8:
            for pu in ((u0 + u1) / 2 - 1.025, (u0 + u1) / 2 + 1.025):
                span(f"{tag}_pocket_{vv:.1f}_{pu:.2f}", pu - 0.18, pu + 0.18, vv - sv * 0.012, vv + sv * 0.002, y0 + 0.02, y0 + R - 0.02, M["steel_black"])
        # vents at the top corners of the side walls
        for vu in (u0 + 0.35, u1 - 0.35):
            span(f"{tag}_vent_{vv:.1f}_{vu:.2f}", vu - 0.12, vu + 0.12, vv + sv * (wall_off - 0.014), vv + sv * (wall_off + 0.002), y1 - 0.42, y1 - 0.26, steel)
        # rust bleeding from the post bases onto the wall
        for uu in (u0, u1):
            s = 1 if uu == u0 else -1
            span(f"{tag}_rustbase_{uu:.1f}_{vv:.1f}", uu + s * P, uu + s * (P + 0.3), vv + sv * (wall_off - 0.004), vv + sv * (wall_off - 0.001), y0 + R, y0 + R + 0.35, M["rust"])
    # corner castings (8)
    for uu in (u0, u1):
        s = 1 if uu == u0 else -1
        for vv in (v0, v1):
            sv = 1 if vv == v0 else -1
            for yy in (y0, y1 - 0.12):
                span(f"{tag}_cast_{uu:.1f}_{vv:.1f}_{yy:.1f}", uu, uu + s * 0.19, vv, vv + sv * 0.19, yy, yy + 0.12, M["steel_black"])

    if doors in ("closed", "ajar"):
        dw = (v1 - v0 - 2 * P) / 2
        du0, du1 = (door_u - 0.06, door_u - 0.01) if plus else (door_u + 0.01, door_u + 0.06)
        face_u = du1 if plus else du0                     # outer face of the closed leaves
        out = 1 if plus else -1                           # outward direction along u
        for leaf in (0, 1):
            lv0 = v0 + P + leaf * dw
            lv1 = lv0 + dw
            if ajar and leaf == 1:
                # leaf swung 35 degrees outward around its outer hinge edge
                ang = math.radians(35.0)
                depth, width = dw * math.sin(ang), dw * math.cos(ang)
                du = door_u + out * depth / 2
                dv = lv1 - width / 2
                cx, cz = (du, dv) if ax else (dv, du)
                size = (0.05, CH - 2 * R - 0.04, dw) if ax else (dw, CH - 2 * R - 0.04, 0.05)
                K.box(f"{tag}_door_{leaf}", size, (cx, (y0 + y1) / 2, cz), tint, rot_y=(-ang if ax else ang) * out)
                continue
            span(f"{tag}_door_{leaf}", du0, du1, lv0 + 0.01, lv1 - 0.01, y0 + R, y1 - R, tint)
            span(f"{tag}_seal_{leaf}", face_u - out * 0.004, face_u + out * 0.004, lv0 + 0.005, lv1 - 0.005, y0 + R, y1 - R, M["rubber"])
            # locking bars with cams and handles
            for k in (0.3, 0.7):
                bv = lv0 + dw * k
                bu = face_u + out * 0.05
                bx, bz = (bu, bv) if ax else (bv, bu)
                K.cylinder(f"{tag}_bar_{leaf}_{k}", 0.02, CH - 2 * R - 0.3, (bx, (y0 + y1) / 2, bz), steel, segments=6)
                for yy in (y0 + R + 0.1, y1 - R - 0.16):
                    span(f"{tag}_cam_{leaf}_{k}_{yy:.1f}", face_u, face_u + out * 0.07, bv - 0.05, bv + 0.05, yy, yy + 0.06, M["steel_black"])
                hv0, hv1 = (bv - 0.02, bv + 0.28) if k < 0.5 else (bv - 0.28, bv + 0.02)
                span(f"{tag}_handle_{leaf}_{k}", face_u + out * 0.03, face_u + out * 0.06, hv0, hv1, y0 + 1.05, y0 + 1.09, steel)
            hv = lv0 if leaf == 0 else lv1
            for yy in (y0 + 0.3, y0 + 1.1, y0 + 1.9):
                span(f"{tag}_hinge_{leaf}_{yy:.1f}", door_u - 0.04, door_u + 0.04, hv - 0.04, hv + 0.04, yy, yy + 0.16, M["steel_black"])
        # rust at the door sill
        span(f"{tag}_rustdoor", face_u + out * 0.001, face_u + out * 0.005, v0 + P, v1 - P, y0 + R, y0 + R + 0.22, M["rust"])

    if variant == "reefer":
        # refrigeration unit sitting in the recess at the front end, grille bars flush with the frame
        ru0, ru1 = (front_u + 0.03, front_u + reefer_depth) if plus else (front_u - reefer_depth, front_u - 0.03)
        span(f"{tag}_reefer", ru0, ru1, v0 + 0.22, v1 - 0.22, y0 + 0.35, y1 - 0.25, M["grey"])
        face = ru0 if plus else ru1
        o = -1 if plus else 1
        for k in range(7):
            yy = y0 + 0.5 + k * 0.25
            span(f"{tag}_grille_{k}", face + o * 0.03, face + o * 0.001, v0 + 0.4, v1 - 0.4, yy, yy + 0.05, M["steel_black"])
        span(f"{tag}_reefer_box", face + o * 0.03, face + o * 0.001, v0 + 0.3, v0 + 0.95, y0 + 1.75, y0 + 2.15, M["trim"])
        span(f"{tag}_reefer_plate", face + o * 0.03, face + o * 0.001, v1 - 0.9, v1 - 0.3, y0 + 0.45, y0 + 0.6, M["paint_white"])
    elif variant == "maintenance":
        mu = u0 + (u1 - u0) * 0.35
        f0, f1 = v1 + wall_off - 0.03, v1 - wall_off + 0.035
        span(f"{tag}_mdoor", mu - 0.45, mu + 0.45, v1 - wall_off - 0.01, v1 - wall_off + 0.035, y0 + 0.15, y0 + 2.1, M["trim"])
        span(f"{tag}_mdoor_handle", mu + 0.3, mu + 0.36, v1 - wall_off + 0.035, v1 - wall_off + 0.07, y0 + 1.0, y0 + 1.1, steel)
        wu = u0 + (u1 - u0) * 0.68
        span(f"{tag}_mwin_frame", wu - 0.55, wu + 0.55, v1 - wall_off - 0.01, v1 - wall_off + 0.03, y0 + 1.15, y0 + 2.05, M["trim"])
        cx, cz = (wu, v1 - wall_off + 0.032) if ax else (v1 - wall_off + 0.032, wu)
        K.plane(f"{tag}_mwin", (1.0, 0.8), (cx, y0 + 1.6, cz), M["glass"], normal="z" if ax else "x")
        lx, lz = (wu, v1 - wall_off - 0.03) if ax else (v1 - wall_off - 0.03, wu)
        K.plane(f"{tag}_mwin_light", (0.9, 0.7), (lx, y0 + 1.6, lz), M["warm"], normal="z" if ax else "x",
                tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
        span(f"{tag}_step", mu - 0.5, mu + 0.5, v1 + 0.04, v1 + 0.42, y0, y0 + 0.16, M["steel_black"])
        span(f"{tag}_ac", mu - 0.4, mu + 0.4, v0 + 0.5, v1 - 1.2, y1, y1 + 0.5, M["grey"])
        cu, cv = mu, v1 + 0.03
        p0 = (cu, y1, cv) if ax else (cv, y1, cu)
        p1 = (cu, y0 + 2.1, cv) if ax else (cv, y0 + 2.1, cu)
        tube(f"{tag}_conduit", p0, p1, 0.02, steel)
    elif variant == "damaged":
        du = u0 + (u1 - u0) * 0.6
        span(f"{tag}_dent", du - 0.7, du + 0.7, v0 + wall_off - 0.02, v0 + wall_off + 0.06, y0 + 0.5, y0 + 1.5, M["rust"])
        span(f"{tag}_rust_run", du - 0.75, du + 0.75, v0 + wall_off - 0.006, v0 + wall_off - 0.001, y0 + R, y0 + 0.5, M["rust"])
        span(f"{tag}_buckle", du - 0.9, du - 0.2, v0 - 0.03, v0 + R, y0 + R - 0.02, y0 + R + 0.08, steel)


def stack(tag, x0, z0, length, tints, *, along="x", doors=("closed", "closed"), variants=("std", "std"),
          door_ends=("+", "+"), top_offset=0.0):
    """Two-high stack; ``top_offset`` slides the upper unit along the length axis."""
    container(f"{tag}_L", x0, 0.0, z0, length, tints[0], along=along, doors=doors[0], variant=variants[0], door_end=door_ends[0])
    if along == "x":
        container(f"{tag}_U", x0 + top_offset, CH, z0, length, tints[1], along=along, doors=doors[1], variant=variants[1], door_end=door_ends[1])
    else:
        container(f"{tag}_U", x0, CH, z0 + top_offset, length, tints[1], along=along, doors=doors[1], variant=variants[1], door_end=door_ends[1])


def chassis_trailer(tag, x, z0, length, tint, *, with_container=True):
    """Container chassis (skeletal trailer) parked along z with a 20 ft box on it."""
    M = _M
    steel = M["steel"]
    fw = 2.3
    fy = 1.05                      # frame top
    z1 = z0 + length
    for sx in (-0.5, 0.5):
        box_span(f"{tag}_beam_{sx}", x + sx - 0.07, x + sx + 0.07, fy - 0.3, fy, z0 + 0.3, z1 - 0.2, M["safety_red"])
    for k in range(5):
        zz = z0 + 0.6 + k * (length - 1.2) / 4
        box_span(f"{tag}_cross_{k}", x - fw / 2, x + fw / 2, fy - 0.12, fy, zz - 0.06, zz + 0.06, M["safety_red"])
    for zz in (z0 + 0.45, z0 + 0.45 + C20 - 0.19):
        for sx in (-CW / 2 + 0.02, CW / 2 - 0.21):
            box_span(f"{tag}_lock_{zz:.1f}_{sx:.1f}", x + sx, x + sx + 0.19, fy, fy + 0.06, zz, zz + 0.19, M["steel_black"])
    for k, zz in enumerate((z1 - 1.6, z1 - 0.7)):
        tube(f"{tag}_axle_{k}", (x - 1.05, 0.5, zz), (x + 1.05, 0.5, zz), 0.06, steel)
        for sx in (-1.0, -0.72, 0.72, 1.0):
            K.cylinder(f"{tag}_wheel_{k}_{sx}", 0.5, 0.26, (x + sx, 0.5, zz), M["rubber"], segments=14, axis="x")
            K.cylinder(f"{tag}_hub_{k}_{sx}", 0.2, 0.28, (x + sx, 0.5, zz), M["grey"], segments=10, axis="x")
        box_span(f"{tag}_guard_{k}", x - 1.2, x + 1.2, 0.95, 1.0, zz - 0.6, zz + 0.6, M["steel_black"])
    for sx in (-0.7, 0.7):
        box_span(f"{tag}_leg_{sx}", x + sx - 0.07, x + sx + 0.07, 0.12, fy - 0.3, z0 + 1.9, z0 + 2.04, steel)
        box_span(f"{tag}_foot_{sx}", x + sx - 0.14, x + sx + 0.14, 0.0, 0.12, z0 + 1.82, z0 + 2.12, M["steel_black"])
    box_span(f"{tag}_kingpin", x - 0.5, x + 0.5, fy - 0.36, fy - 0.3, z0 + 0.2, z0 + 1.4, M["steel_black"])
    box_span(f"{tag}_bumper", x - 1.15, x + 1.15, 0.45, 0.55, z1 - 0.1, z1, steel)
    for sx in (-0.9, 0.9):
        box_span(f"{tag}_tail_{sx}", x + sx - 0.08, x + sx + 0.08, 0.6, 0.72, z1 - 0.06, z1 + 0.005, M["red"], tags={"castShadow": False})
    if with_container:
        container(f"{tag}_BOX", x - CW / 2, fy + 0.06, z0 + 0.45, C20, tint, along="z", doors="closed", door_end="+", collide=False)
    K.collider(f"TRAILER_{tag}", (x - 1.2, 0.0, z0), (x + 1.2, fy + 0.06 + CH if with_container else fy, z1))


# --------------------------------------------------------------------------- #
# Yard surface: lanes, forecourt, drains, fence
# --------------------------------------------------------------------------- #

def build_yard_surface(M):
    lx0, lx1 = LANE_X
    rz0, rz1 = ROAD_Z
    # main lane: yellow edge lines, white centre dashes, stop line at the cross road
    paint("lane_edge_w", lx0, lx0 + 0.12, rz1, FENCE_Z + 0.6, M["paint_yellow"])
    paint("lane_edge_e", lx1 - 0.12, lx1, rz1, FENCE_Z + 0.6, M["paint_yellow"])
    dashes("lane_centre", (lx0 + lx1) / 2 - 0.06, (lx0 + lx1) / 2 + 0.06, rz1 + 1.0, FENCE_Z - 0.6, M["paint_white"])
    paint("lane_stop", lx0 + 0.2, lx1 - 0.2, rz1 + 0.35, rz1 + 0.75, M["paint_white"])
    # zebra across the cross road, in line with the shop entrance
    for k in range(5):
        xa = lx0 + 0.25 + k * 1.25
        paint(f"zebra_{k}", xa, xa + 0.55, rz0 + 0.2, rz1 - 0.2, M["paint_white"])
    # cross road: legacy asphalt + markings stay; add edge lines and the turning-bay hatch
    paint("road_edge_s", 31.0, 58.2, rz1 - 0.12, rz1, M["paint_yellow"])
    paint("road_edge_n", 31.0, 58.2, rz0, rz0 + 0.12, M["paint_yellow"])
    hatch("turning_bay", lx1 + 0.4, 58.0, rz0 + 0.3, rz1 - 0.3, M["paint_yellow"], pitch=1.4, width=0.1)
    # alleys: dashed edge lines so they read as routes
    for nm, (za, zb) in (("alley_a", ALLEY_A), ("alley_b", ALLEY_B)):
        dashes(f"{nm}_n", WEST_BLOCK_X[0] + 0.2, lx0 - 0.3, za + 0.05, za + 0.15, M["paint_white"], dash=1.0, gap=1.0, along="x")
        dashes(f"{nm}_s", WEST_BLOCK_X[0] + 0.2, lx0 - 0.3, zb - 0.15, zb - 0.05, M["paint_white"], dash=1.0, gap=1.0, along="x")
    # loading zone: yellow border + hatch band along the lane side + cones
    (ax0, az0), (ax1, az1) = LOADING_ZONE
    for nm, (x0, x1, z0, z1) in {"lz_n": (ax0, ax1, az0, az0 + 0.14), "lz_s": (ax0, ax1, az1 - 0.14, az1),
                                 "lz_w": (ax0, ax0 + 0.14, az0, az1), "lz_e": (ax1 - 0.14, ax1, az0, az1)}.items():
        paint(nm, x0, x1, z0, z1, M["paint_yellow"])
    hatch("lz_hatch", ax0 + 0.2, ax0 + 1.0, az0 + 0.2, az1 - 0.2, M["paint_yellow"], pitch=0.8, width=0.09)
    for k, (cx, cz) in enumerate(((51.4, -12.7), (57.7, -12.7), (51.6, -3.8), (57.7, -5.2))):
        K.cylinder(f"cone_{k}", 0.2, 0.62, (cx, GROUND + 0.31, cz), M["machine_orange"], segments=8, radius_top=0.05)
        K.cylinder(f"cone_base_{k}", 0.24, 0.04, (cx, GROUND + 0.02, cz), M["steel_black"], segments=8)
        K.cylinder(f"cone_band_{k}", 0.17, 0.08, (cx, GROUND + 0.42, cz), M["paint_white"], segments=8, radius_top=0.135)
    # NE pocket parking bay: wheel stops + bay lines
    for k, xx in enumerate((57.2, 59.4)):
        box_span(f"wheelstop_{k}", xx - 0.9, xx + 0.9, GROUND, GROUND + 0.14, -26.7, -26.52, M["concrete"], bevel=0.02)
        paint(f"wheelstop_paint_{k}", xx - 0.9, xx + 0.9, -26.7, -26.52, M["paint_yellow"], y=GROUND + 0.146)
    paint("bay_line_w", 56.1, 56.22, -32.8, -26.4, M["paint_white"])
    paint("bay_line_m", 58.3, 58.42, -32.8, -26.4, M["paint_white"])
    paint("bay_line_e", 60.5, 60.62, -32.8, -26.4, M["paint_white"])
    # drains: along the forecourt kerb gutter, the lane's east edge, alley A
    (fx0, fz0), (fx1, fz1) = FORECOURT
    for k, xx in enumerate((37.5, 41.5, 48.5, 52.5)):
        grate(f"drain_fc_{k}", xx, fz1 + 0.4, 1.2, 0.36, M["grating"], M["steel_black"])
    for k, zz in enumerate((-15.0, -8.0, -1.5)):
        grate(f"drain_lane_{k}", lx1 - 0.45, zz, 0.42, 0.62, M["grating"], M["steel_black"])
    grate("drain_alley_a", 37.0, (ALLEY_A[0] + ALLEY_A[1]) / 2, 0.6, 0.4, M["grating"], M["steel_black"])
    # puddles (wet variation only here) and worn patches
    puddle("puddle_0", 47.7, -3.5, 3.6, 1.6)
    puddle("puddle_1", 36.5, -9.2, 2.6, 1.3)
    puddle("puddle_2", 53.5, -22.2, 3.0, 1.4)
    puddle("puddle_3", 52.0, -16.5, 2.0, 1.1)
    for k, (px, pz, w, d) in enumerate(((52.0, -18.2, 1.6, 1.2), (59.6, -32.2, 1.6, 1.2), (34.0, -21.9, 2.0, 1.2))):
        box_span(f"patch_{k}", px - w / 2, px + w / 2, GROUND - 0.01, GROUND + 0.012, pz - d / 2, pz + d / 2, M["concrete_dark"], tags={"castShadow": False})
    for k, (wx, wz) in enumerate(((31.3, -18.55), (31.2, -12.0), (31.4, -5.4), (43.5, -0.5), (51.0, 1.75), (57.6, 1.3),
                                  (58.2, -5.5), (33.6, -5.1), (53.4, -18.7), (36.0, -25.8), (54.4, -25.7), (61.5, -32.8))):
        weed(f"weed_{k}", wx, wz, h=0.26 + 0.08 * (k % 3), w=0.3 + 0.06 * (k % 2))
    # west margin kerb
    box_span("west_kerb", WEST_BLOCK_X[0] - 0.4, WEST_BLOCK_X[0] - 0.22, GROUND, GROUND + 0.1, -18.9, 1.7, M["concrete"])
    # south fence east of the gate: posts + rails + mesh, one collider
    fz = FENCE_Z
    fx_a, fx_b = GATE_X[1] + 0.2, 60.6
    n = int(round((fx_b - fx_a) / 2.5))
    for i in range(n + 1):
        xx = fx_a + (fx_b - fx_a) * i / n
        bar(f"fence_post_{i}", (xx, GROUND, fz), (xx, GROUND + 2.2, fz), 0.06, M["steel"])
    bar("fence_toprail", (fx_a, GROUND + 2.18, fz), (fx_b, GROUND + 2.18, fz), 0.04, M["steel"])
    bar("fence_botrail", (fx_a, GROUND + 0.12, fz), (fx_b, GROUND + 0.12, fz), 0.04, M["steel"])
    K.plane("fence_mesh", (fx_b - fx_a, 2.0), ((fx_a + fx_b) / 2, GROUND + 1.14, fz), M["grating"], normal="z",
            tags={"castShadow": False, "ignoreWeaponRaycast": True})
    K.collider("FENCE_S", (fx_a - 0.05, 0.0, fz - 0.05), (fx_b + 0.05, 2.2, fz + 0.05))
    for k, gx in enumerate(GATE_X):
        box_span(f"gate_post_{k}", gx - 0.1, gx + 0.1, GROUND, GROUND + 2.5, fz - 0.1, fz + 0.1, M["steel"])
        K.cylinder(f"gate_cap_{k}", 0.14, 0.06, (gx, GROUND + 2.53, fz), M["steel_black"], segments=8)
        K.collider(f"GATE_POST_{k}", (gx - 0.1, 0.0, fz - 0.1), (gx + 0.1, 2.5, fz + 0.1))
    # gate leaves swung open along the lane edges (thin, visual)
    for k, (gx, s) in enumerate(((GATE_X[0], -1), (GATE_X[1], 1))):
        lx = gx + s * 0.35
        bar(f"gate_leaf_frame_{k}_a", (lx, GROUND + 0.2, fz + 0.15), (lx, GROUND + 0.2, fz + 3.3), 0.05, M["steel"])
        bar(f"gate_leaf_frame_{k}_b", (lx, GROUND + 2.0, fz + 0.15), (lx, GROUND + 2.0, fz + 3.3), 0.05, M["steel"])
        K.plane(f"gate_leaf_mesh_{k}", (3.1, 1.75), (lx, GROUND + 1.1, fz + 1.72), M["grating"], normal="x",
                tags={"castShadow": False, "ignoreWeaponRaycast": True})
    box_span("gate_sign", GATE_X[0] - 0.45, GATE_X[0] - 0.12, GROUND + 1.7, GROUND + 2.3, fz - 0.03, fz + 0.03, M["paint_white"])
    box_span("gate_sign_stripe", GATE_X[0] - 0.45, GATE_X[0] - 0.12, GROUND + 1.7, GROUND + 1.85, fz + 0.03, fz + 0.04, M["safety_red"])


# --------------------------------------------------------------------------- #
# Container blocks
# --------------------------------------------------------------------------- #

def build_container_blocks(M):
    wx0 = WEST_BLOCK_X[0]
    stack("W1", wx0, -18.95, C40, (M["c_teal"], M["c_red"]), door_ends=("+", "+"))
    stack("W2", wx0, -13.45, C40, (M["c_navy"], M["c_ochre"]), variants=("std", "damaged"), door_ends=("+", "-"))
    container("W3_L", wx0, 0.0, -7.70, C40, M["c_red"], doors="ajar", door_end="+")
    container("W3_U", wx0 + 6.13, CH, -7.70, C20, M["c_teal"], doors="closed", door_end="+")
    # south-west pocket (z -4.9..-2.46): flat-rack + maintenance container on the ground
    container("SW_FLAT", wx0, 0.0, -4.9, C20, M["c_ochre"], variant="flatrack", doors="none")
    container("SW_MAINT", 37.3, 0.0, -4.9, C20, M["c_grey"], variant="maintenance", doors="closed", door_end="+")
    # south row west of the gate: two-high 40 ft closing the yard toward the plaza
    stack("S1", wx0, -0.9, C40, (M["c_navy"], M["c_teal"]), door_ends=("-", "-"))
    # waterfront row (single height) along the seawall walkway
    ex0 = EAST_ROW_X[0]
    container("E1", ex0, 0.0, -18.5, C40, M["c_red"], along="z", doors="closed", door_end="-")
    container("E2", ex0, 0.0, -24.8, C20, M["c_cream"], along="z", variant="reefer", doors="closed", door_end="+")
    # loading zone: chassis trailer with a 20 ft box, parked along z
    chassis_trailer("T1", 53.2, -11.9, 7.3, M["c_navy"])


# --------------------------------------------------------------------------- #
# Shop (Mini Mart on its existing colliders)
# --------------------------------------------------------------------------- #

FORECOURT_PIECES = (
    # x0, x1, z0, z1 — the raised sidewalk, split around the legacy small colliders
    (42.3, 47.25, -32.49, -26.0),     # entrance strip
    (34.2, 37.65, -32.49, -26.0),     # west
    (37.65, 42.3, -31.2, -26.0),      # south of the bin/box pocket
    (47.25, 49.7, -29.55, -26.0),     # south of the legacy pallet
    (48.65, 55.8, -32.49, -29.55),    # east, north part
    (50.3, 55.8, -29.55, -26.0),      # east, south part (lamp column at 49.7..50.3 stays procedural)
)


def build_forecourt(M):
    """Raised forecourt sidewalk in front of the Harbor Market (each piece its own collider),
    curved kerb, drainage channel, four edge bollards, bench, bike rack, crates and the
    legacy small colliders dressed as bins / pallet / boxes."""
    steel = M["steel"]
    for k, (x0, x1, z0, z1) in enumerate(FORECOURT_PIECES):
        box_span(f"forecourt_slab_{k}", x0, x1, 0.0, SLAB_TOP, z0, z1, M["concrete"])
        K.collider(f"FORECOURT_{k}", (x0 + 0.005, 0.0, z0 + 0.005), (x1 - 0.005, SLAB_TOP, z1 - 0.005))
    (fx0, fz0), (fx1, fz1) = FORECOURT
    for k in range(1, int((fx1 - fx0) / 2.0) + 1):
        jx = fx0 + k * 2.0
        if jx < fx1 - 0.2:
            box_span(f"forecourt_joint_{k}", jx - 0.01, jx + 0.01, SLAB_TOP - 0.004, SLAB_TOP + 0.002, fz0, fz1, M["concrete_dark"], tags={"castShadow": False})
    # kerb: straight run + quarter-round corners + side returns
    r = 0.6
    box_span("forecourt_kerb", fx0 + r, fx1 - r, GROUND, SLAB_TOP + 0.01, fz1 - 0.02, fz1 + 0.16, M["concrete_dark"], bevel=0.01)
    for nm, (cx, arc) in {"sw": (fx0 + r, (math.pi / 2, math.pi)), "se": (fx1 - r, (0.0, math.pi / 2))}.items():
        K.torus(f"forecourt_kerb_{nm}", (cx, (GROUND + SLAB_TOP) / 2, fz1 - r), r + 0.07, 0.085, M["concrete_dark"],
                segments=8, profile=4, axis="y", arc=arc, smooth=False)
    box_span("forecourt_kerb_w", fx0 - 0.02, fx0 + 0.16, GROUND, SLAB_TOP + 0.01, fz0, fz1 - r, M["concrete_dark"], bevel=0.01)
    box_span("forecourt_kerb_e", fx1 - 0.16, fx1 + 0.02, GROUND, SLAB_TOP + 0.01, fz0, fz1 - r, M["concrete_dark"], bevel=0.01)
    # drainage channel along the kerb (two grates) + gully at the entrance strip
    for k, gx in enumerate((39.6, 51.2)):
        grate(f"forecourt_drain_{k}", gx, fz1 - 0.45, 3.0, 0.28, M["grating"], M["concrete_dark"], y=SLAB_TOP)
    # four edge bollards (colliders) at the forecourt corners / entrance flanks
    for k, bx in enumerate((36.2, 41.0, 49.0, 53.8)):
        K.cylinder(f"bollard_{k}", 0.1, 0.9, (bx, SLAB_TOP + 0.45, fz1 - 0.4), steel, segments=10)
        K.cylinder(f"bollard_cap_{k}", 0.11, 0.05, (bx, SLAB_TOP + 0.92, fz1 - 0.4), M["paint_yellow"], segments=10)
        K.cylinder(f"bollard_band_{k}", 0.105, 0.08, (bx, SLAB_TOP + 0.7, fz1 - 0.4), M["paint_white"], segments=10)
        K.collider(f"BOLLARD_{k}", (bx - 0.1, SLAB_TOP + 0.001, fz1 - 0.5), (bx + 0.1, SLAB_TOP + 0.95, fz1 - 0.3))
    # bench (timber slats on cast frames)
    for k in range(4):
        sz = -31.4 + k * 0.11
        box_span(f"bench_slat_{k}", 36.3, 38.1, SLAB_TOP + 0.42, SLAB_TOP + 0.46, sz, sz + 0.08, M["timber"], bevel=0.005)
    for k in range(3):
        sy = SLAB_TOP + 0.55 + k * 0.13
        box_span(f"bench_back_{k}", 36.3, 38.1, sy, sy + 0.08, -31.47, -31.42, M["timber"], bevel=0.005)
    for bx in (36.45, 37.95):
        box_span(f"bench_leg_{bx:.1f}", bx - 0.04, bx + 0.04, SLAB_TOP, SLAB_TOP + 0.42, -31.35, -31.0, steel)
        bar(f"bench_arm_{bx:.1f}", (bx, SLAB_TOP + 0.42, -31.45), (bx, SLAB_TOP + 0.95, -31.45), 0.04, steel)
    K.collider("BENCH", (36.3, SLAB_TOP + 0.001, -31.45), (38.1, SLAB_TOP + 0.9, -30.95))
    # bicycle rack: two inverted-U hoops + the parked bike (no collider, walk-around)
    for k, hx in enumerate((52.4, 53.3)):
        K.torus(f"bike_hoop_{k}", (hx, SLAB_TOP + 0.5, -31.6), 0.32, 0.025, steel, segments=12, profile=5, axis="x", arc=(0.0, math.pi))
        for hz in (-31.92, -31.28):
            bar(f"bike_hoop_{k}_leg_{hz:.1f}", (hx, SLAB_TOP, hz), (hx, SLAB_TOP + 0.5, hz), 0.05, steel)
    bx, bz = 52.85, -31.6
    for k, wz in enumerate((bz - 0.55, bz + 0.55)):
        K.torus(f"bike_wheel_{k}", (bx, SLAB_TOP + 0.34, wz), 0.31, 0.02, M["rubber"], segments=20, profile=5, axis="x")
        for s in range(6):
            a = math.tau * s / 6
            bar(f"bike_spoke_{k}_{s}", (bx, SLAB_TOP + 0.34, wz), (bx, SLAB_TOP + 0.34 + 0.29 * math.sin(a), wz + 0.29 * math.cos(a)), 0.006, M["grey"])
    bar("bike_frame_a", (bx, SLAB_TOP + 0.36, bz - 0.5), (bx, SLAB_TOP + 0.85, bz + 0.1), 0.03, M["bike_blue"])
    bar("bike_frame_b", (bx, SLAB_TOP + 0.85, bz + 0.1), (bx, SLAB_TOP + 0.4, bz + 0.5), 0.03, M["bike_blue"])
    bar("bike_frame_c", (bx, SLAB_TOP + 0.36, bz - 0.5), (bx, SLAB_TOP + 0.4, bz + 0.5), 0.03, M["bike_blue"])
    bar("bike_seat_post", (bx, SLAB_TOP + 0.85, bz + 0.1), (bx, SLAB_TOP + 1.02, bz + 0.05), 0.025, M["grey"])
    K.box("bike_saddle", (0.12, 0.05, 0.28), (bx, SLAB_TOP + 1.04, bz + 0.03), M["rubber"])
    bar("bike_bars", (bx - 0.25, SLAB_TOP + 1.0, bz - 0.45), (bx + 0.25, SLAB_TOP + 1.0, bz - 0.45), 0.025, M["grey"])
    K.box("fc_crate_a", (0.7, 0.55, 0.7), (35.0, SLAB_TOP + 0.28, -30.2), M["timber"])
    K.box("fc_crate_b", (0.5, 0.4, 0.5), (35.05, SLAB_TOP + 0.75, -30.15), M["cardboard"])
    # legacy small colliders in front of the shop dressed as bins / pallet / boxes
    K.cylinder("fc_bin_w", 0.24, 0.8, (42.0, 0.4, -32.0), M["steel_black"], segments=10)
    K.cylinder("fc_bin_w_lid", 0.26, 0.04, (42.0, 0.82, -32.0), M["steel_black"], segments=10)
    K.cylinder("fc_bin_e", 0.2, 0.6, (47.5, 0.3, -32.0), M["bin_green"], segments=10)
    box_span("fc_pallet", 47.4, 48.6, 0.0, 0.12, -30.4, -29.6, M["timber"])
    box_span("fc_box_a", 38.55, 39.05, 0.2, 0.6, -32.5, -32.1, M["cardboard"])
    box_span("fc_box_b", 37.7, 38.3, 0.2, 0.7, -32.25, -31.75, M["cardboard"])
    box_span("fc_box_c", 39.65, 40.35, 0.2, 0.74, -31.75, -31.25, M["timber"])


def build_shop(M):
    """Harbor Market (see harbor_market.py) + its forecourt."""
    import sys
    sys.modules.pop("harbor_market", None)
    import harbor_market
    stats = harbor_market.build(K, M)
    build_forecourt(M)
    return stats


# --------------------------------------------------------------------------- #
# Yard office (existing collider), lamps, machinery, props
# --------------------------------------------------------------------------- #

def build_office(M):
    (ox0, oy0, oz0), (ox1, oy1, oz1) = OFFICE
    steel = M["steel"]
    box_span("office_skid", ox0 + 0.1, ox1 - 0.1, 0.0, 0.22, oz0 + 0.1, oz1 - 0.1, steel)
    box_span("office_body", ox0, ox1, 0.22, oy1 - 0.12, oz0, oz1, M["clad_dark"], bevel=0.02)
    box_span("office_roof", ox0 - 0.08, ox1 + 0.08, oy1 - 0.12, oy1, oz0 - 0.08, oz1 + 0.08, M["trim"], bevel=0.02)
    for cx in (ox0, ox1):
        for cz in (oz0, oz1):
            box_span(f"office_post_{cx:.0f}_{cz:.0f}", cx - 0.06, cx + 0.06, 0.22, oy1 - 0.12, cz - 0.06, cz + 0.06, steel)
    zc = (oz0 + oz1) / 2
    K.plane("office_win", (2.4, 1.1), (ox0 - 0.012, 1.85, zc), M["glass"], normal="x")
    box_span("office_win_frame_t", ox0 - 0.03, ox0 + 0.01, 2.4, 2.46, zc - 1.25, zc + 1.25, steel)
    box_span("office_win_frame_b", ox0 - 0.03, ox0 + 0.01, 1.28, 1.34, zc - 1.25, zc + 1.25, steel)
    K.plane("office_win_light", (2.2, 1.0), (ox0 + 0.05, 1.85, zc), M["warm"], normal="x", tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    box_span("office_door", ox0 + 1.0, ox0 + 1.9, 0.3, 2.4, oz0 - 0.03, oz0 + 0.01, M["trim"])
    box_span("office_door_handle", ox0 + 1.72, ox0 + 1.8, 1.05, 1.12, oz0 - 0.07, oz0 - 0.03, steel)
    K.plane("office_door_lamp", (0.35, 0.12), (ox0 + 1.45, 2.65, oz0 - 0.03), M["lamp"], normal="z", tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    box_span("office_step", ox0 + 0.9, ox0 + 2.0, 0.0, 0.16, oz0 - 0.45, oz0 - 0.02, steel)
    box_span("office_ac", ox1, ox1 + 0.4, 1.4, 2.2, oz0 + 1.0, oz0 + 1.9, M["grey"])
    K.cylinder("office_ac_fan", 0.26, 0.04, (ox1 + 0.42, 1.8, oz0 + 1.45), M["steel_black"], segments=12, axis="x")
    tube("office_conduit", (ox1 + 0.02, 2.2, oz0 + 1.45), (ox1 + 0.02, oy1 - 0.1, oz0 + 1.45), 0.025, steel)
    box_span("office_sign", ox0 - 0.04, ox0 - 0.02, 2.6, 2.95, zc - 1.0, zc + 1.0, M["paint_white"])
    box_span("office_sign_stripe", ox0 - 0.045, ox0 - 0.04, 2.6, 2.7, zc - 1.0, zc + 1.0, M["safety_red"])
    tube("office_antenna", (ox1 - 0.4, oy1, oz1 - 0.4), (ox1 - 0.4, oy1 + 1.6, oz1 - 0.4), 0.02, steel)
    K.cylinder("office_beacon_base", 0.12, 0.08, (ox0 + 0.5, oy1 + 0.04, oz1 - 0.5), M["steel_black"], segments=8)
    K.cylinder("office_beacon", 0.09, 0.16, (ox0 + 0.5, oy1 + 0.16, oz1 - 0.5), M["amber"], segments=8, tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    K.cylinder("office_extinguisher", 0.08, 0.5, (ox0 - 0.1, 1.0, oz1 - 0.6), M["safety_red"], segments=8)
    box_span("office_ext_bracket", ox0 - 0.04, ox0, 0.9, 1.3, oz1 - 0.66, oz1 - 0.54, steel)


def build_lamps(M):
    steel = M["steel"]
    for k, (lx, lz) in enumerate(LAMPS):
        base = SLAB_TOP if k == 0 else GROUND
        box_span(f"lamp_plinth_{k}", lx - 0.25, lx + 0.25, base, base + 0.3, lz - 0.25, lz + 0.25, M["concrete"], bevel=0.02)
        tube(f"lamp_post_{k}", (lx, base + 0.3, lz), (lx, 5.6, lz), 0.08, steel, segments=10)
        tube(f"lamp_arm_{k}", (lx, 5.6, lz), (lx - 1.3, 5.9, lz), 0.05, steel)
        box_span(f"lamp_head_{k}", lx - 1.75, lx - 1.05, 5.82, 6.0, lz - 0.2, lz + 0.2, M["steel_black"], bevel=0.02)
        box_span(f"lamp_glow_{k}", lx - 1.7, lx - 1.1, 5.8, 5.83, lz - 0.16, lz + 0.16, M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    pts = [(50.0, 5.5, -28.05), (50.6, 5.1, -30.0), (51.6, 5.15, -31.9), (52.0, 5.3, -33.0)]
    for s in range(3):
        tube(f"lamp_cable_{s}", pts[s], pts[s + 1], 0.016, M["cable"], segments=5,
             tags={"castShadow": False, "ambientMotion": "hang-sway", "ignoreWeaponRaycast": True})


def _local_frame(x, z, heading):
    c, s = math.cos(heading), math.sin(heading)

    def P(dx, dy, dz):
        return (x + dx * c + dz * s, dy, z - dx * s + dz * c)

    def B(nm, size, center, mat, **kw):
        cx, cy, cz = P(*center)
        return K.box(nm, size, (cx, cy, cz), mat, rot_y=heading, **kw)

    def extents(dx0, dx1, dz0, dz1):
        pts = [P(dx, 0, dz) for dx in (dx0, dx1) for dz in (dz0, dz1)]
        xs, zs = [p[0] for p in pts], [p[2] for p in pts]
        return min(xs), max(xs), min(zs), max(zs)
    return P, B, extents


def build_forklift(M, x, z, heading):
    """Compact aged counterbalance forklift, parked (forks toward local +x)."""
    steel = M["steel"]
    body = M["machine_orange"]
    P, B, extents = _local_frame(x, z, heading)
    rot = (0, 0, heading)
    B("fk_chassis", (2.0, 0.7, 1.15), (-0.2, GROUND + 0.55, 0.0), body, bevel=0.03)
    B("fk_counterweight", (0.7, 0.9, 1.1), (-1.35, GROUND + 0.6, 0.0), M["rust"], bevel=0.03)
    B("fk_floor", (1.2, 0.08, 1.1), (-0.1, GROUND + 0.95, 0.0), M["steel_black"])
    B("fk_dash", (0.3, 0.5, 0.9), (0.45, GROUND + 1.2, 0.0), body)
    for nm, (dx, dz, r, w) in (("fl", (0.55, 0.62, 0.36, 0.28)), ("fr", (0.55, -0.62, 0.36, 0.28)), ("rl", (-1.0, 0.6, 0.3, 0.24)), ("rr", (-1.0, -0.6, 0.3, 0.24))):
        K.cylinder(f"fk_wheel_{nm}", r, w, P(dx, GROUND + r, dz), M["rubber"], segments=14, axis="z", rot=rot)
        K.cylinder(f"fk_hub_{nm}", r * 0.42, w + 0.02, P(dx, GROUND + r, dz), M["grey"], segments=8, axis="z", rot=rot)
    B("fk_seat", (0.5, 0.12, 0.55), (-0.55, GROUND + 1.05, 0.0), M["steel_black"])
    B("fk_seat_back", (0.1, 0.5, 0.55), (-0.82, GROUND + 1.35, 0.0), M["steel_black"])
    K.cylinder("fk_steer", 0.19, 0.03, P(0.15, GROUND + 1.45, 0.0), M["steel_black"], segments=12, rot=(math.radians(60), 0, heading))
    bar("fk_steer_col", P(0.35, GROUND + 1.25, 0.0), P(0.15, GROUND + 1.44, 0.0), 0.03, steel)
    for dx, dz in ((0.35, 0.5), (0.35, -0.5), (-0.95, 0.5), (-0.95, -0.5)):
        bar(f"fk_cage_{dx:.1f}_{dz:.1f}", P(dx, GROUND + 1.0, dz), P(dx, GROUND + 2.15, dz), 0.05, steel)
    B("fk_cage_roof", (1.5, 0.05, 1.15), (-0.3, GROUND + 2.17, 0.0), steel)
    for k in range(5):
        B(f"fk_cage_slat_{k}", (0.04, 0.02, 1.1), (-0.85 + k * 0.28, GROUND + 2.14, 0.0), steel)
    for dz in (-0.42, 0.42):
        B(f"fk_mast_{dz:.1f}", (0.12, 2.6, 0.1), (0.75, GROUND + 1.3, dz), steel)
        B(f"fk_mast_inner_{dz:.1f}", (0.08, 2.2, 0.06), (0.82, GROUND + 1.45, dz * 0.85), steel)
    for yy in (GROUND + 0.5, GROUND + 1.6, GROUND + 2.5):
        B(f"fk_mast_brace_{yy:.1f}", (0.1, 0.08, 0.95), (0.75, yy, 0.0), steel)
    for dz in (-0.25, 0.25):
        K.cylinder(f"fk_cyl_{dz:.1f}", 0.05, 1.7, P(0.68, GROUND + 1.1, dz), M["grey"], segments=8, rot=rot)
    B("fk_carriage", (0.08, 0.9, 1.0), (0.9, GROUND + 0.55, 0.0), steel)
    for dz in (-0.3, 0.3):
        B(f"fk_fork_{dz:.1f}", (1.1, 0.05, 0.12), (1.5, GROUND + 0.1, dz), M["steel_black"])
        B(f"fk_fork_heel_{dz:.1f}", (0.06, 0.6, 0.12), (0.93, GROUND + 0.4, dz), M["steel_black"])
    K.cylinder("fk_beacon", 0.07, 0.14, P(-0.6, GROUND + 2.27, 0.35), M["amber"], segments=8, tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    tube("fk_exhaust", P(-1.3, GROUND + 1.0, -0.4), P(-1.3, GROUND + 2.3, -0.4), 0.035, steel)
    B("fk_pallet", (1.2, 0.14, 1.0), (1.55, GROUND + 0.2, 0.0), M["timber"])
    B("fk_load", (1.0, 0.7, 0.8), (1.55, GROUND + 0.62, 0.0), M["tarp_blue"])
    x0, x1, z0, z1 = extents(-1.75, 2.1, -0.78, 0.78)
    K.collider("FORKLIFT", (x0, 0.0, z0), (x1, 2.3, z1))


def build_handler(M, x, z, heading):
    """Compact empty-container handler parked (boom toward local -x)."""
    steel = M["steel"]
    body = M["machine_yellow"]
    P, B, extents = _local_frame(x, z, heading)
    rot = (0, 0, heading)
    B("ch_chassis", (5.4, 0.8, 2.7), (-0.2, 1.15, 0.0), body, bevel=0.04)
    B("ch_counter", (1.1, 1.5, 2.4), (2.1, 1.35, 0.0), M["rust"], bevel=0.03)
    B("ch_cab", (1.6, 1.75, 1.2), (-0.4, 2.42, -0.75), M["grey"], bevel=0.03)
    K.plane("ch_cab_glass_f", (1.2, 1.3), P(-1.21, 2.5, -0.75), M["glass"], normal="x", rot_y=heading)
    K.plane("ch_cab_glass_s", (1.5, 1.3), P(-0.4, 2.5, -1.36), M["glass"], normal="z", rot_y=heading)
    B("ch_cab_roof", (1.8, 0.12, 1.4), (-0.4, 3.36, -0.75), M["steel_black"])
    K.cylinder("ch_beacon", 0.08, 0.14, P(0.3, 3.49, -0.3), M["amber"], segments=8, tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    bar("ch_boom", P(1.6, 2.2, 0.4), P(-3.2, 4.3, 0.4), 0.6, body, w=0.7)
    bar("ch_boom_inner", P(-3.0, 4.2, 0.4), P(-4.4, 4.8, 0.4), 0.45, M["grey"], w=0.55)
    bar("ch_lift_cyl", P(0.6, 1.5, 1.0), P(-1.4, 3.3, 0.7), 0.16, M["grey"])
    B("ch_spreader", (2.4, 0.35, 2.5), (-4.5, 4.35, 0.0), body)
    for sx in (-5.6, -3.4):
        for sz in (-1.2, 1.2):
            B(f"ch_twist_{sx:.0f}_{sz:.0f}", (0.2, 0.2, 0.2), (sx, 4.1, sz), M["steel_black"])
    bar("ch_spreader_link", P(-4.4, 4.8, 0.4), P(-4.5, 4.55, 0.4), 0.2, steel)
    for k, (wx, wz) in enumerate(((-1.7, -1.5), (-1.7, 1.5), (1.7, -1.5), (1.7, 1.5))):
        K.cylinder(f"ch_wheel_{k}", 0.75, 0.55, P(wx, 0.75, wz), M["rubber"], segments=16, axis="z", rot=rot)
        K.cylinder(f"ch_hub_{k}", 0.32, 0.6, P(wx, 0.75, wz), M["grey"], segments=10, axis="z", rot=rot)
    for yy in (0.5, 0.9, 1.3):
        bar(f"ch_ladder_{yy:.1f}", P(-1.15, yy, -1.4), P(-0.75, yy, -1.4), 0.03, steel)
    tube("ch_exhaust", P(1.3, 1.55, 1.0), P(1.3, 3.6, 1.0), 0.06, steel)
    x0, x1, z0, z1 = extents(-5.8, 2.7, -1.8, 1.8)
    K.collider("HANDLER", (x0, 0.0, z0), (x1, 5.0, z1))


def build_props(M):
    steel = M["steel"]

    def pallet_stack(tag, x, z, n, rot=0.0):
        for k in range(n):
            K.box(f"{tag}_{k}", (1.2, 0.14, 1.0), (x, GROUND + 0.07 + k * 0.15, z), M["timber"], rot_y=rot + (k % 2) * 0.06)
        K.collider(f"PALLETS_{tag}", (x - 0.65, 0.0, z - 0.55), (x + 0.65, GROUND + 0.15 * n, z + 0.55))
    pallet_stack("PA", 32.4, -1.6, 6, 0.1)
    pallet_stack("PB", 58.9, -27.6, 4, -0.15)
    K.box("loose_pallet_0", (1.2, 0.14, 1.0), (57.6, GROUND + 0.07, -29.9), M["timber"], rot_y=1.4)
    # cable reels (NE pocket) + one lying flat in the SW pocket
    for k, (rx, rz) in enumerate(((58.6, -30.5), (58.7, -29.0))):
        K.cylinder(f"reel_side_a_{k}", 0.7, 0.06, (rx - 0.4, GROUND + 0.7, rz), M["timber"], segments=16, axis="x")
        K.cylinder(f"reel_side_b_{k}", 0.7, 0.06, (rx + 0.4, GROUND + 0.7, rz), M["timber"], segments=16, axis="x")
        K.cylinder(f"reel_core_{k}", 0.48, 0.74, (rx, GROUND + 0.7, rz), M["cable"], segments=16, axis="x")
        K.collider(f"REEL_{k}", (rx - 0.45, 0.0, rz - 0.7), (rx + 0.45, GROUND + 1.4, rz + 0.7))
    K.cylinder("reel_flat", 0.65, 0.8, (35.6, GROUND + 0.4, -1.7), M["timber"], segments=16)
    K.cylinder("reel_flat_cable", 0.5, 0.82, (35.6, GROUND + 0.4, -1.7), M["cable"], segments=16)
    K.collider("REEL_FLAT", (34.95, 0.0, -2.35), (36.25, GROUND + 0.8, -1.05))
    # drum cluster (SW pocket) with one collider
    for k, (dx, dz, col) in enumerate(((38.3, -1.3, M["tarp_blue"]), (38.9, -1.9, M["rust"]), (38.4, -2.0, M["steel_black"]), (39.1, -1.3, M["tarp_blue"]))):
        K.cylinder(f"drum_{k}", 0.29, 0.88, (dx, GROUND + 0.44, dz), col, segments=12)
        K.cylinder(f"drum_rim_{k}", 0.3, 0.04, (dx, GROUND + 0.6, dz), M["steel_black"], segments=12)
    K.collider("DRUMS", (37.95, 0.0, -2.3), (39.45, GROUND + 0.9, -0.95))
    # tire stack dressing the legacy procedural collider #183 (three columns of five)
    (tx0, ty0, tz0), (tx1, ty1, tz1) = TIRE_STACK
    for col in range(3):
        cx = tx0 + 0.5 + col * ((tx1 - tx0 - 1.02) / 2)
        for row in range(5):
            yy = ty0 + 0.16 + row * 0.318
            zz = (tz0 + tz1) / 2 + 0.02 * ((row + col) % 2)
            K.cylinder(f"tire_{col}_{row}", 0.47, 0.3, (cx, yy, zz), M["rubber"], segments=14)
            K.cylinder(f"tire_rim_{col}_{row}", 0.25, 0.31, (cx, yy, zz), M["grey"], segments=10)
    # maintenance cage in the pocket between the gate post and the yard office
    cx0, cx1, cz0, cz1 = 50.35, 51.45, -0.6, 1.4
    for xx in (cx0, cx1):
        for zz in (cz0, cz1):
            bar(f"cage_post_{xx:.0f}_{zz:.0f}", (xx, GROUND, zz), (xx, GROUND + 2.2, zz), 0.05, steel)
    box_span("cage_floor", cx0, cx1, GROUND, GROUND + 0.08, cz0, cz1, steel)
    box_span("cage_top", cx0, cx1, GROUND + 2.15, GROUND + 2.2, cz0, cz1, steel)
    for nm, (w, cx, cz, normal) in {"w": (cz1 - cz0, cx0, (cz0 + cz1) / 2, "x"), "e": (cz1 - cz0, cx1, (cz0 + cz1) / 2, "x"),
                                    "n": (cx1 - cx0, (cx0 + cx1) / 2, cz0, "z")}.items():
        K.plane(f"cage_mesh_{nm}", (w, 2.0), (cx, GROUND + 1.12, cz), M["grating"], normal=normal, tags={"castShadow": False, "ignoreWeaponRaycast": True})
    K.box("cage_toolbox", (0.6, 0.3, 0.4), ((cx0 + cx1) / 2, GROUND + 0.23, (cz0 + cz1) / 2), M["safety_red"])
    K.collider("CAGE", (cx0 - 0.03, 0.0, cz0 - 0.03), (cx1 + 0.03, GROUND + 2.2, cz1 + 0.03))
    # safety barriers around the loading zone
    for k, (bx, bz, rot) in enumerate(((51.4, -9.7, math.pi / 2), (51.45, -5.4, math.pi / 2), (52.6, -13.6, 0.0))):
        K.box(f"barrier_{k}", (2.0, 0.55, 0.12), (bx, GROUND + 0.62, bz), M["safety_red"], rot_y=rot)
        K.box(f"barrier_stripe_{k}", (2.0, 0.12, 0.125), (bx, GROUND + 0.7, bz), M["paint_white"], rot_y=rot)
        for s in (-0.85, 0.85):
            ox, oz = (s * math.cos(rot), -s * math.sin(rot))
            K.box(f"barrier_foot_{k}_{s:.0f}", (0.2, 0.35, 0.5), (bx + ox, GROUND + 0.18, bz + oz), M["safety_red"], rot_y=rot)
        ex = [(bx + s * math.cos(rot), bz - s * math.sin(rot)) for s in (-1.0, 1.0)]
        xs, zs = [e[0] for e in ex], [e[1] for e in ex]
        K.collider(f"BARRIER_{k}", (min(xs) - 0.25, 0.0, min(zs) - 0.25), (max(xs) + 0.25, GROUND + 0.9, max(zs) + 0.25))
    # cargo net over a pallet load (loading zone), tarp-covered stack (flutters), rope coils on the walkway
    nx, nz = 56.9, -10.6
    K.box("net_load", (1.1, 0.8, 0.9), (nx, GROUND + 0.55, nz), M["cardboard"])
    for k in range(5):
        bar(f"net_line_{k}", (nx - 0.55, GROUND + 0.15, nz - 0.45 + k * 0.22), (nx + 0.55, GROUND + 0.95, nz - 0.45 + k * 0.22), 0.012, M["rope"],
            tags={"castShadow": False, "ignoreWeaponRaycast": True})
        bar(f"net_line_x_{k}", (nx - 0.55 + k * 0.27, GROUND + 0.95, nz - 0.45), (nx - 0.55 + k * 0.27, GROUND + 0.15, nz + 0.45), 0.012, M["rope"],
            tags={"castShadow": False, "ignoreWeaponRaycast": True})
    K.box("tarp_stack", (1.8, 1.1, 1.3), (41.4, GROUND + 0.55, -1.6), M["tarp_green"], bevel=0.05,
          tags={"ambientMotion": "sway-shrub", "castShadow": True})
    K.collider("TARP_STACK", (40.5, 0.0, -2.25), (42.3, GROUND + 1.1, -0.95))
    for k, (rx, rz) in enumerate(((58.0, -32.6), (61.6, -27.4))):
        K.torus(f"rope_coil_{k}", (rx, GROUND + 0.08, rz), 0.28, 0.08, M["rope"], segments=14, profile=6, axis="y")
    K.cylinder("ext_w2", 0.07, 0.45, (WEST_BLOCK_X[1] + 0.1, GROUND + 1.0, -12.9), M["safety_red"], segments=8)
    box_span("ext_w2_bracket", WEST_BLOCK_X[1], WEST_BLOCK_X[1] + 0.05, GROUND + 0.9, GROUND + 1.25, -12.96, -12.84, steel)
    K.plane("oil_stain", (2.2, 1.4), (55.3, GROUND + 0.011, -9.0), M["concrete_dark"], normal="y", tags={"castShadow": False})
    # life ring + sign on the yard office north wall (the seawall walkway stays clear)
    K.torus("office_lifering", (54.6, 1.9, OFFICE[0][2] - 0.08), 0.3, 0.06, M["machine_orange"], segments=16, profile=6, axis="z")
    box_span("office_lifering_sign", 54.45, 54.75, 2.25, 2.55, OFFICE[0][2] - 0.04, OFFICE[0][2] - 0.01, M["paint_white"])


def build_lod1(M):
    """Low tier: silhouettes and colours only."""
    def cont(tag, x0, y0, z0, L, tint, along="x"):
        if along == "x":
            box_span(tag, x0, x0 + L, y0, y0 + CH, z0, z0 + CW, tint, lod="LOD1")
        else:
            box_span(tag, x0, x0 + CW, y0, y0 + CH, z0, z0 + L, tint, lod="LOD1")
    wx0 = WEST_BLOCK_X[0]
    cont("l1_W1_L", wx0, 0, -18.95, C40, M["c_teal"]); cont("l1_W1_U", wx0, CH, -18.95, C40, M["c_red"])
    cont("l1_W2_L", wx0, 0, -13.45, C40, M["c_navy"]); cont("l1_W2_U", wx0, CH, -13.45, C40, M["c_ochre"])
    cont("l1_W3_L", wx0, 0, -7.7, C40, M["c_red"]); cont("l1_W3_U", wx0 + 6.13, CH, -7.7, C20, M["c_teal"])
    cont("l1_SW_MAINT", 37.3, 0, -4.9, C20, M["c_grey"])
    box_span("l1_SW_FLAT", wx0, wx0 + C20, 0, 0.3, -4.9, -4.9 + CW, M["c_ochre"], lod="LOD1")
    cont("l1_S1_L", wx0, 0, -0.9, C40, M["c_navy"]); cont("l1_S1_U", wx0, CH, -0.9, C40, M["c_teal"])
    cont("l1_E1", EAST_ROW_X[0], 0, -18.5, C40, M["c_red"], along="z")
    cont("l1_E2", EAST_ROW_X[0], 0, -24.8, C20, M["c_cream"], along="z")
    box_span("l1_trailer", 52.0, 54.4, 0.5, 1.05, -11.9, -4.6, M["safety_red"], lod="LOD1")
    cont("l1_T1_BOX", 53.2 - CW / 2, 1.11, -11.45, C20, M["c_navy"], along="z")
    # (the Harbor Market LOD1 lives in harbor_market.lod1)
    (fx0, fz0), (fx1, fz1) = FORECOURT
    box_span("l1_forecourt", fx0, fx1, 0, SLAB_TOP, fz0, fz1, M["concrete"], lod="LOD1")
    (ox0, oy0, oz0), (ox1, oy1, oz1) = OFFICE
    box_span("l1_office", ox0, ox1, 0, oy1, oz0, oz1, M["clad_dark"], lod="LOD1")
    K.plane("l1_office_light", (2.2, 1.0), (ox0 - 0.01, 1.85, (oz0 + oz1) / 2), M["warm"], normal="x", lod="LOD1", tags={"castShadow": False})
    box_span("l1_forklift", 54.5, 58.35, GROUND, GROUND + 2.2, -8.2, -6.6, M["machine_orange"], lod="LOD1")
    box_span("l1_handler", 54.6, 58.2, 0.5, 3.4, -18.8, -11.2, M["machine_yellow"], lod="LOD1")
    box_span("l1_handler_boom", 55.8, 57.0, 4.0, 4.8, -18.0, -12.0, M["machine_yellow"], lod="LOD1")
    box_span("l1_fence", GATE_X[1] + 0.2, 60.6, GROUND, GROUND + 2.2, FENCE_Z - 0.02, FENCE_Z + 0.02, M["steel"], lod="LOD1")
    for k, (lx, lz) in enumerate(LAMPS):
        box_span(f"l1_lamp_{k}", lx - 0.06, lx + 0.06, 0.3, 5.9, lz - 0.06, lz + 0.06, M["steel"], lod="LOD1")
    paint("l1_lane_w", LANE_X[0], LANE_X[0] + 0.12, ROAD_Z[1], FENCE_Z, M["paint_yellow"], lod="LOD1")
    paint("l1_lane_e", LANE_X[1] - 0.12, LANE_X[1], ROAD_Z[1], FENCE_Z, M["paint_yellow"], lod="LOD1")


# --------------------------------------------------------------------------- #
# References + main
# --------------------------------------------------------------------------- #

def add_references():
    count = K.import_reference_colliders(COLLIDER_JSON, (ZONE_MIN, ZONE_MAX))
    kept = K.import_reference_glb(CINEMATIC_GLB, (ZONE_MIN, ZONE_MAX)) if CINEMATIC_GLB.exists() else 0
    top = REFERENCE_DIR / "top-ortho.png"
    if top.exists():
        # concept board (not to scale): laid over the footprint for layout reading only
        K.add_reference_image(top, "REF_IMG_top_ortho", ((ZONE_MIN[0] + ZONE_MAX[0]) / 2, -0.06, -20.0), 33.0)
    return count, kept


def main(save: bool = True) -> dict:
    K.new_scene("Harbor_V2_Container_BD_Authoring")
    for name in ("CONTAINERS_STATIC", "SHOP_STATIC", "YARD_PROPS", "AMBIENT_DYNAMIC"):
        K.subcollection("RENDER_LOD0", name)
    M = materials()

    def sweep(target):
        for obj in list(K.collections["RENDER_LOD0"].objects):
            if obj.type == "MESH":
                K.link(obj, "AMBIENT_DYNAMIC" if obj.get("ambientMotion") else target)

    build_container_blocks(M); sweep("CONTAINERS_STATIC")
    shop_stats = build_shop(M); build_office(M); sweep("SHOP_STATIC")
    build_yard_surface(M); build_lamps(M)
    build_forklift(M, 56.6, -7.4, math.pi)
    build_handler(M, 56.4, -16.2, math.pi / 2)
    build_props(M); sweep("YARD_PROPS")
    build_lod1(M)
    K.project_box_uvs()
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
    stats["shop"] = shop_stats
    # shop-only budget record read by client/tests/HarborMarket.test.ts
    build_stats = ROOT / "art-source/harbor-v2/_staging/container-bd-build-stats.json"
    build_stats.parent.mkdir(parents=True, exist_ok=True)
    build_stats.write_text(json.dumps({"zone": "CONTAINER_BD", "shop": shop_stats,
                                       "lod0Batches": stats["lod0Batches"], "lod1Batches": stats["lod1Batches"]}, indent=2) + "\n")
    if save:
        OUTPUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))
        stats["saved"] = str(OUTPUT_BLEND)
    return stats


if __name__ == "__main__":
    main(save=True)
