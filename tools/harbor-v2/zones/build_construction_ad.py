"""AD — Waterfront Construction Site zone builder (Blender 5.2, run via MCP).

Authors ``art-source/harbor-v2/construction/construction-ad.blend``: the concrete
slab, the in-progress three-storey concrete/steel frame on the nine cinematic
column colliders, the climbable scaffold tower + secondary scaffold + bridge,
the 6 x 5 x 6 m steel building frame with plywood deck and tarp roof, the silo
with ladder cage and service platform, the north-west access scaffold, the
lattice tower crane, the floodlight mast, the site gate, and every collider'd
prop (cement bags, pallets, pipes, drums, mixer, generator, forklift, rebar,
tyres, wheelbarrow, toolbox) plus visual clutter, work lights and puddles.

Every visual respects the procedural + cinematic movement colliders (imported as
locked reference volumes). Visual pass: no collider or marker is exported.
Coordinates are Three.js world meters (x, y-up, z).
"""

from __future__ import annotations

import importlib
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ZONES = Path(__file__).resolve().parent if "__file__" in globals() else Path(
    "/Users/tlle/Documents/PersonalProject/CatchAndRun/tools/harbor-v2/zones"
)
if str(ZONES) not in sys.path:
    sys.path.insert(0, str(ZONES))
import zone_kit as zk  # noqa: E402

importlib.reload(zk)

ROOT = zk.ROOT
BLEND_PATH = ROOT / "art-source/harbor-v2/construction/construction-ad.blend"
COLLIDER_JSON = ROOT / "art-source/harbor-v2/_staging/procedural-colliders.json"
CINEMATIC_GLB = ROOT / "client/public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb"
REFERENCE_DIR = Path("/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets")

ZONE_MIN = (-56.0, -1.0, -44.0)
ZONE_MAX = (-23.5, 30.0, -7.5)

CX, CZ = -35.0, -22.0          # slab centre
K = zk.ZoneKit("CONSTRUCTION", "construction", "construction-pbr")
_M: dict = {}


def materials():
    M = {}
    M["slab"] = K.pbr("MAT_BASE_CONCRETE_SLAB", "concrete_slab")
    # cast-in-place concrete (columns, pours, plinths): 512 px / 2 m tile, less flattened
    # than the garden pack's 256 px version so the frame reads as concrete up close
    M["concrete"] = K.pbr("MAT_CONCRETE", "concrete_cast")
    M["steel_red"] = K.pbr("MAT_STEEL_RED", "steel_red")
    M["galv"] = K.pbr("MAT_GALVANIZED", "MAT_GALVANIZED", pack="warehouse-pbr")
    M["yellow"] = K.pbr("MAT_SAFETY_YELLOW", "MAT_SAFETY_YELLOW", pack="warehouse-pbr")
    M["navy"] = K.pbr("MAT_STEEL_NAVY", "MAT_STEEL_NAVY", pack="warehouse-pbr")
    M["wood"] = K.pbr("MAT_WOOD_WEATHERED", "wood_weathered", pack="garden-pbr")
    M["plywood"] = K.pbr("MAT_PLYWOOD", "wood_interior", pack="garden-pbr")
    M["brick"] = K.pbr("MAT_BRICK", "brick", pack="garden-pbr")
    M["roof_dark"] = K.pbr("MAT_ROOF_METAL_DARK", "roof_metal_dark", pack="garden-pbr")
    M["rust"] = K.pbr("MAT_RUST_DARK", "rust_dark")
    M["tarp"] = K.pbr("MAT_TARP_BLUE", "tarp_blue")
    M["grating"] = K.pbr("MAT_GRATING", "grating", alpha_clip=True, double_sided=True)
    M["soil"] = K.pbr("MAT_BASE_SOIL", "soil", pack="garden-pbr")
    M["lamp"] = K.simple("MAT_WORK_LIGHT", (1.0, 0.95, 0.85), 0.3, emissive=(1.0, 0.92, 0.75), emissive_strength=3.5)
    M["water"] = K.simple("MAT_PUDDLE", (0.16, 0.2, 0.22), 0.04, alpha=0.62, blended=True)
    M["glass"] = K.simple("MAT_GLASS_TINT", (0.3, 0.38, 0.42), 0.1, alpha=0.6, blended=True, double_sided=True)
    palette = K.palette("MAT_PALETTE", {
        "orange": (0.85, 0.36, 0.08),
        "hazard": (0.9, 0.72, 0.12),
        "cement": (0.72, 0.68, 0.6),
        "white": (0.82, 0.82, 0.8),
        "rubber": (0.05, 0.05, 0.055),
        "tarp_green": (0.2, 0.36, 0.24),
        "red": (0.62, 0.12, 0.1),
        "steel_dark": (0.12, 0.13, 0.14),
        "cable": (0.08, 0.08, 0.09),
        "concrete_dark": (0.4, 0.4, 0.39),
        "hook": (0.55, 0.5, 0.15),
        "sign_blue": (0.1, 0.25, 0.6),
    })
    for key, swatch in palette.items():
        M[key] = swatch
    _M.clear(); _M.update(M)
    return M


def box_span(name, x0, x1, y0, y1, z0, z1, mat, **kw):
    return K.box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat, **kw)


def bar(name, p0, p1, t, mat, lod="LOD0", tags=None, w=None):
    """Square (or t x w) bar between two Three.js points."""
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
    """Cylinder between two points (scaffold tubes, pipes, cables)."""
    a, b = Vector(p0), Vector(p1)
    d = b - a
    length = d.length
    center = (a + b) / 2
    obj = K.cylinder(name, r, length, tuple(center), mat, segments=segments, lod=lod, tags=tags)
    # orient: default axis is Three.js y (Blender z); rotate so it aligns with d
    d_bl = Vector(zk.to_blender(tuple(d))).normalized()
    obj.rotation_euler = Vector((0, 0, 1)).rotation_difference(d_bl).to_euler()
    return obj


# --------------------------------------------------------------------------- #
# Ground + frame
# --------------------------------------------------------------------------- #

def build_ground(M):
    box_span("slab", CX - 11, CX + 11, 0.0, 0.2, CZ - 11, CZ + 11, M["slab"], tags={"castShadow": False})
    # expansion joints (dark grooves) every 5.5 m
    for k in range(1, 4):
        x = CX - 11 + k * 5.5
        box_span(f"joint_x_{k}", x - 0.02, x + 0.02, 0.2, 0.205, CZ - 11, CZ + 11, M["concrete_dark"], tags={"castShadow": False})
        z = CZ - 11 + k * 5.5
        box_span(f"joint_z_{k}", CX - 11, CX + 11, 0.2, 0.205, z - 0.02, z + 0.02, M["concrete_dark"], tags={"castShadow": False})
    # dirt patches + puddles
    box_span("dirt_0", CX - 5, CX - 1, 0.2, 0.215, CZ + 0.5, CZ + 3.5, M["soil"], tags={"castShadow": False})
    box_span("dirt_1", CX + 2.5, CX + 5.5, 0.2, 0.215, CZ - 5, CZ - 3, M["soil"], tags={"castShadow": False})
    K.plane("puddle_0", (2.0, 1.5), (CX + 2, 0.212, CZ - 1), M["water"], tags={"weaponImpactKind": "water", "castShadow": False, "ambientMotion": "pond-ripple"})
    K.plane("puddle_1", (1.6, 1.1), (CX - 6.5, 0.212, CZ - 7), M["water"], tags={"weaponImpactKind": "water", "castShadow": False, "ambientMotion": "pond-ripple"})
    # slab edge curb
    for (xa, xb, za, zb) in ((CX - 11.15, CX + 11.15, CZ - 11.15, CZ - 10.95), (CX - 11.15, CX + 11.15, CZ + 10.95, CZ + 11.15),
                             (CX - 11.15, CX - 10.95, CZ - 11.15, CZ + 11.15), (CX + 10.95, CX + 11.15, CZ - 11.15, CZ + 11.15)):
        box_span(f"curb_{xa}_{za}", xa, xb, 0.0, 0.24, za, zb, M["concrete"], bevel=0.015)


def ibeam(name, x0, x1, y, z, M, depth=0.34, flange=0.3, web=0.03):
    """Red steel I-beam along x centred on height y."""
    box_span(f"{name}_top", x0, x1, y + depth / 2 - 0.02, y + depth / 2, z - flange / 2, z + flange / 2, M["steel_red"])
    box_span(f"{name}_bot", x0, x1, y - depth / 2, y - depth / 2 + 0.02, z - flange / 2, z + flange / 2, M["steel_red"])
    box_span(f"{name}_web", x0, x1, y - depth / 2 + 0.02, y + depth / 2 - 0.02, z - web / 2, z + web / 2, M["steel_red"])
    # stiffeners every 2 m
    n = int((x1 - x0) / 2.0)
    for k in range(1, n):
        sx = x0 + k * 2.0
        box_span(f"{name}_stiff_{k}", sx - 0.01, sx + 0.01, y - depth / 2 + 0.02, y + depth / 2 - 0.02, z - flange / 2 + 0.02, z + flange / 2 - 0.02, M["steel_red"])


def gusset(name, x, y, z, M, side=1):
    """Column connection plate + bolts on the beam end (side = +1 east face, -1 west)."""
    px = x + side * 0.24
    box_span(f"{name}_plate", px - 0.02, px + 0.02, y - 0.24, y + 0.24, z - 0.2, z + 0.2, M["steel_red"])
    for (dy, dz) in ((-0.15, -0.12), (-0.15, 0.12), (0.15, -0.12), (0.15, 0.12)):
        K.cylinder(f"{name}_bolt_{dy}_{dz}", 0.02, 0.05, (px + side * 0.035, y + dy, z + dz), M["steel_dark"], segments=6, axis="x")


def build_frame(M):
    """Nine cinematic column colliders (0.42 sq, 8.5 m) + red beams + partial pours."""
    cols = [(x, z) for x in (-42.0, -36.0, -30.0) for z in (-29.0, -22.0, -15.0)]
    for (x, z) in cols:
        box_span(f"col_{x}_{z}", x - 0.21, x + 0.21, 0.2, 8.5, z - 0.21, z + 0.21, M["concrete"], bevel=0.015)
        box_span(f"col_foot_{x}_{z}", x - 0.32, x + 0.32, 0.2, 0.34, z - 0.32, z + 0.32, M["concrete"])
        # exposed rebar at the top
        for (dx, dz) in ((-0.12, -0.12), (0.12, -0.12), (-0.12, 0.12), (0.12, 0.12)):
            K.cylinder(f"rebar_{x}_{z}_{dx}_{dz}", 0.016, 0.9, (x + dx, 8.5 + 0.45, z + dz), M["rust"], segments=5)
        # rebar ties
        for k in range(3):
            box_span(f"rebar_tie_{x}_{z}_{k}", x - 0.13, x + 0.13, 8.62 + k * 0.28, 8.64 + k * 0.28, z - 0.13, z + 0.13, M["rust"])
    # beams on the z=-29 and z=-22 rows at two levels (z=-15 row stays un-beamed:
    # the 6 x 5 x 6 shoring frame and its tarp roof occupy that bay)
    for z in (-29.0, -22.0):
        for y in (3.4, 6.5):
            ibeam(f"beam_{z}_{y}_w", -41.79, -36.21, y, z, M)
            ibeam(f"beam_{z}_{y}_e", -35.79, -30.21, y, z, M)
            gusset(f"gus_{z}_{y}_a", -42.0, y, z, M, +1)
            gusset(f"gus_{z}_{y}_b", -36.0, y, z, M, -1)
            gusset(f"gus_{z}_{y}_c", -36.0, y, z, M, +1)
            gusset(f"gus_{z}_{y}_d", -30.0, y, z, M, -1)
    # cross braces on the north row (safety yellow flats)
    for (xa, xb) in ((-41.79, -36.21), (-35.79, -30.21)):
        bar("brace_n_0_" + str(xa), (xa, 0.4, -29.0), (xb, 3.2, -29.0), 0.08, M["yellow"], w=0.16)
        bar("brace_n_1_" + str(xa), (xb, 0.4, -29.0), (xa, 3.2, -29.0), 0.08, M["yellow"], w=0.16)
    # partial pours in the south-east bay (x -33..-30.2, z -21.8..-15.2), both levels
    for (y0, y1) in ((3.2, 3.5), (6.4, 6.7)):
        box_span(f"pour_{y0}", -33.0, -30.2, y0, y1, -21.8, -15.2, M["concrete"])
        # edge formwork boards + props on the west edge of the pour
        box_span(f"form_{y0}", -33.06, -33.0, y0 - 0.05, y1 + 0.05, -21.8, -15.2, M["plywood"])
        for k in range(4):
            zk_ = -21.4 + k * 1.8
            box_span(f"form_waler_{y0}_{k}", -33.12, -33.06, y0 - 0.02, y1 + 0.02, zk_ - 0.04, zk_ + 0.04, M["wood"])
        # rebar mesh sticking out west of the pour
        for k in range(7):
            zr = -21.5 + k * 0.9
            K.cylinder(f"pour_rebar_{y0}_{k}", 0.012, 0.9, (-33.5, y1 - 0.06, zr), M["rust"], segments=4, axis="x")
    # shoring props under the level-1 pour
    for (px, pz) in ((-32.5, -21.0), (-30.7, -21.0), (-32.5, -16.0), (-30.7, -16.0), (-31.6, -18.5)):
        K.cylinder(f"shore_{px}_{pz}", 0.045, 3.0, (px, 0.2 + 1.5, pz), M["yellow"], segments=6)
        box_span(f"shore_head_{px}_{pz}", px - 0.12, px + 0.12, 3.12, 3.2, pz - 0.12, pz + 0.12, M["steel_dark"])
        box_span(f"shore_base_{px}_{pz}", px - 0.12, px + 0.12, 0.2, 0.26, pz - 0.12, pz + 0.12, M["steel_dark"])


# --------------------------------------------------------------------------- #
# Scaffolds, shoring frame, silo, access scaffold
# --------------------------------------------------------------------------- #

def scaffold_tube(name, p0, p1, M, r=0.03):
    return tube(name, p0, p1, r, M["yellow"], segments=6)


def deck(name, x0, x1, y_top, z0, z1, M, planks=True, thickness=0.06):
    if planks:
        w = 0.22
        n = max(1, int((z1 - z0) / w))
        for i in range(n):
            z = z0 + i * w
            box_span(f"{name}_plank_{i}", x0, x1, y_top - thickness, y_top, z + 0.005, min(z + w - 0.005, z1), M["wood"])
    else:
        box_span(name, x0, x1, y_top - thickness, y_top, z0, z1, M["grating"], tags={"castShadow": False})
        # grating support angles
        box_span(f"{name}_angle_0", x0, x1, y_top - thickness - 0.05, y_top - thickness, z0, z0 + 0.05, M["galv"])
        box_span(f"{name}_angle_1", x0, x1, y_top - thickness - 0.05, y_top - thickness, z1 - 0.05, z1, M["galv"])


def guardrail(name, p0, p1, y_base, M, height=1.0, mid=0.5, toe=True, posts=3):
    a, b = Vector(p0), Vector(p1)
    scaffold_tube(f"{name}_top", (a.x, y_base + height, a.z), (b.x, y_base + height, b.z), M)
    scaffold_tube(f"{name}_mid", (a.x, y_base + mid, a.z), (b.x, y_base + mid, b.z), M)
    for k in range(posts):
        t = k / max(posts - 1, 1)
        p = a.lerp(b, t)
        scaffold_tube(f"{name}_post_{k}", (p.x, y_base, p.z), (p.x, y_base + height, p.z), M)
    if toe:
        bar(f"{name}_toe", (a.x, y_base + 0.08, a.z), (b.x, y_base + 0.08, b.z), 0.15, M["wood"], w=0.03)


def build_scaffold_tower(M):
    tx, tz, tw, td = -39.0, -25.0, 4.0, 3.0
    floors = [0.0, 2.5, 5.0, 7.2]
    corners = [(tx - tw / 2, tz - td / 2), (tx - tw / 2, tz + td / 2), (tx + tw / 2, tz - td / 2), (tx + tw / 2, tz + td / 2)]
    for i, (x, z) in enumerate(corners):
        scaffold_tube(f"tower_up_{i}", (x, 0.2, z), (x, 7.4, z), M, r=0.045)
        box_span(f"tower_base_{i}", x - 0.12, x + 0.12, 0.2, 0.26, z - 0.12, z + 0.12, M["steel_dark"])
        for y in (2.5, 5.0, 7.2):
            K.cylinder(f"tower_coupler_{i}_{y}", 0.07, 0.12, (x, y - 0.2, z), M["steel_dark"], segments=6)
    for f, y in enumerate(floors[1:], start=1):
        # ledgers / transoms under the deck
        for (x0, z0, x1, z1) in ((tx - tw / 2, tz - td / 2, tx + tw / 2, tz - td / 2), (tx - tw / 2, tz + td / 2, tx + tw / 2, tz + td / 2),
                                 (tx - tw / 2, tz - td / 2, tx - tw / 2, tz + td / 2), (tx + tw / 2, tz - td / 2, tx + tw / 2, tz + td / 2)):
            scaffold_tube(f"tower_ledger_{f}_{x0}_{z0}", (x0, y - 0.16, z0), (x1, y - 0.16, z1), M)
        deck(f"tower_deck_{f}", tx - tw / 2 - 0.15, tx + tw / 2 + 0.15, y + 0.05, tz - td / 2 - 0.15, tz + td / 2 + 0.15, M)
        open_side = -1 if f % 2 == 0 else 1
        if open_side != 1:
            guardrail(f"tower_rail_n_{f}", (tx - tw / 2, y, tz - td / 2), (tx + tw / 2, y, tz - td / 2), y + 0.05, M)
        if open_side != -1:
            guardrail(f"tower_rail_s_{f}", (tx - tw / 2, y, tz + td / 2), (tx + tw / 2, y, tz + td / 2), y + 0.05, M)
        guardrail(f"tower_rail_w_{f}", (tx - tw / 2, y, tz - td / 2), (tx - tw / 2, y, tz + td / 2), y + 0.05, M, posts=2, toe=False)
        guardrail(f"tower_rail_e_{f}", (tx + tw / 2, y, tz - td / 2), (tx + tw / 2, y, tz + td / 2), y + 0.05, M, posts=2, toe=False)
    # diagonal braces on the x faces
    for x in (tx - tw / 2, tx + tw / 2):
        for (y0, y1) in ((0.3, 2.4), (2.6, 4.9), (5.1, 7.1)):
            scaffold_tube(f"tower_diag_{x}_{y0}", (x, y0, tz - td / 2), (x, y1, tz + td / 2), M, r=0.022)
    # stairs (colliders: 7 steps per flight, 1.2 wide, flights at z -22.9 (f0,f2) and -27.1 (f1))
    stair_w = 1.2
    for f in range(3):
        y0, y1 = floors[f], floors[f + 1]
        rise = (y1 - y0) / 7
        sz = tz + td / 2 + 0.6 if f % 2 == 0 else tz - td / 2 - 0.6
        step_w = (tw - 0.6) / 7 + 0.15
        for s in range(7):
            sy = y0 + (s + 1) * rise
            sx = tx - tw / 2 + 0.3 + (s / 6) * (tw - 0.6)
            box_span(f"tower_step_{f}_{s}", sx - step_w / 2, sx + step_w / 2, sy - 0.05, sy, sz - stair_w / 2, sz + stair_w / 2, M["wood"])
            box_span(f"tower_riser_{f}_{s}", sx - step_w / 2 + 0.02, sx - step_w / 2 + 0.04, sy - rise, sy - 0.05, sz - stair_w / 2 + 0.02, sz + stair_w / 2 - 0.02, M["wood"])
        # stringers under the flight and a handrail on the outer edge
        for zz in (sz - stair_w / 2 - 0.03, sz + stair_w / 2 + 0.03):
            bar(f"tower_stringer_{f}_{zz}", (tx - tw / 2 + 0.0, y0 + 0.15, zz), (tx + tw / 2, y1 - 0.05, zz), 0.28, M["wood"], w=0.05)
        outer = sz + (stair_w / 2 + 0.1) * (1 if f % 2 == 0 else -1)
        scaffold_tube(f"tower_stair_rail_{f}", (tx - tw / 2 + 0.2, y0 + 1.0, outer), (tx + tw / 2 - 0.2, y1 + 1.0, outer), M)
        for k in range(3):
            t = 0.1 + 0.4 * k
            px = tx - tw / 2 + 0.2 + t * (tw - 0.4)
            py0 = y0 + t * (y1 - y0)
            scaffold_tube(f"tower_stair_post_{f}_{k}", (px, py0 + 0.05, outer), (px, py0 + 1.0, outer), M)


def build_secondary_scaffold(M):
    sx, sz, sw, sd = -31.0, -26.0, 3.5, 2.5
    corners = [(sx - sw / 2, sz - sd / 2), (sx - sw / 2, sz + sd / 2), (sx + sw / 2, sz - sd / 2), (sx + sw / 2, sz + sd / 2)]
    for i, (x, z) in enumerate(corners):
        scaffold_tube(f"sec_up_{i}", (x, 0.2, z), (x, 5.2, z), M, r=0.045)
        box_span(f"sec_base_{i}", x - 0.12, x + 0.12, 0.2, 0.26, z - 0.12, z + 0.12, M["steel_dark"])
    for y in (2.5, 5.0):
        for (x0, z0, x1, z1) in ((sx - sw / 2, sz - sd / 2, sx + sw / 2, sz - sd / 2), (sx - sw / 2, sz + sd / 2, sx + sw / 2, sz + sd / 2),
                                 (sx - sw / 2, sz - sd / 2, sx - sw / 2, sz + sd / 2), (sx + sw / 2, sz - sd / 2, sx + sw / 2, sz + sd / 2)):
            scaffold_tube(f"sec_ledger_{y}_{x0}_{z0}", (x0, y - 0.16, z0), (x1, y - 0.16, z1), M)
        deck(f"sec_deck_{y}", sx - sw / 2 - 0.15, sx + sw / 2 + 0.15, y + 0.05, sz - sd / 2 - 0.15, sz + sd / 2 + 0.15, M)
    guardrail("sec_rail_n", (sx - sw / 2, 5.0, sz - sd / 2), (sx + sw / 2, 5.0, sz - sd / 2), 5.05, M)
    guardrail("sec_rail_s", (sx - sw / 2, 5.0, sz + sd / 2), (sx + sw / 2, 5.0, sz + sd / 2), 5.05, M)
    guardrail("sec_rail_e", (sx + sw / 2, 5.0, sz - sd / 2), (sx + sw / 2, 5.0, sz + sd / 2), 5.05, M, posts=2, toe=False)
    for x in (sx - sw / 2, sx + sw / 2):
        scaffold_tube(f"sec_diag_{x}", (x, 0.3, sz - sd / 2), (x, 4.9, sz + sd / 2), M, r=0.022)
    # bridge to the tower at 5.0 (collider x -37..-32.75, z -26.1..-24.9, top 5.1)
    deck("bridge_deck", -37.0, -32.75, 5.1, -26.1, -24.9, M, planks=False)
    for z in (-26.1, -24.9):
        scaffold_tube(f"bridge_stringer_{z}", (-37.0, 4.98, z), (-32.75, 4.98, z), M, r=0.04)
        guardrail(f"bridge_rail_{z}", (-37.0, 5.1, z), (-32.75, 5.1, z), 5.1, M, posts=3, toe=False)
    # ladder on the south face at x -31 (13 step colliders to 5.0)
    for i in range(12):
        y = 0.4 + i * 0.4
        scaffold_tube(f"sec_ladder_rung_{i}", (sx - 0.25, y, sz + sd / 2 + 0.15), (sx + 0.25, y, sz + sd / 2 + 0.15), M, r=0.018)
    for dx in (-0.28, 0.28):
        scaffold_tube(f"sec_ladder_rail_{dx}", (sx + dx, 0.2, sz + sd / 2 + 0.15), (sx + dx, 5.3, sz + sd / 2 + 0.15), M, r=0.024)


def build_shoring_frame(M):
    bx, bz, bw, bd, bh = -37.0, -17.0, 6.0, 5.0, 6.0
    t = 0.25
    for (dx, dz) in ((-bw / 2, -bd / 2), (bw / 2, -bd / 2), (-bw / 2, bd / 2), (bw / 2, bd / 2)):
        x, z = bx + dx, bz + dz
        # H column: two flanges + web, galvanized steel
        box_span(f"hcol_fa_{x}_{z}", x - t / 2, x + t / 2, 0.2, bh, z - t / 2, z - t / 2 + 0.03, M["galv"])
        box_span(f"hcol_fb_{x}_{z}", x - t / 2, x + t / 2, 0.2, bh, z + t / 2 - 0.03, z + t / 2, M["galv"])
        box_span(f"hcol_web_{x}_{z}", x - 0.015, x + 0.015, 0.2, bh, z - t / 2 + 0.03, z + t / 2 - 0.03, M["galv"])
        box_span(f"hcol_plate_{x}_{z}", x - 0.22, x + 0.22, 0.2, 0.24, z - 0.22, z + 0.22, M["steel_dark"])
        for (ex, ez) in ((-0.07, -0.07), (0.07, -0.07), (-0.07, 0.07), (0.07, 0.07)):
            K.cylinder(f"hcol_rebar_{x}_{z}_{ex}_{ez}", 0.014, 1.5, (x + ex, bh + 0.75, z + ez), M["rust"], segments=4)
    # top and mid beams (steel)
    for z in (bz - bd / 2, bz + bd / 2):
        box_span(f"frame_top_{z}", bx - bw / 2 - t / 2, bx + bw / 2 + t / 2, bh - t, bh, z - t / 2, z + t / 2, M["navy"])
        box_span(f"frame_mid_{z}", bx - bw / 2 - t / 2, bx + bw / 2 + t / 2, 3.0 - t / 2, 3.0 + t / 2, z - t / 2, z + t / 2, M["navy"])
    for x in (bx - bw / 2, bx + bw / 2):
        box_span(f"frame_top_x_{x}", x - t / 2, x + t / 2, bh - t, bh, bz - bd / 2, bz + bd / 2, M["navy"])
    # 2F plywood deck halves (colliders 2.95..3.15) with joists
    for (x0, x1) in ((bx - bw / 2 + 0.25, bx - 0.5), (bx + 0.5, bx + bw / 2 - 0.25)):
        box_span(f"ply_{x0}", x0, x1, 3.05, 3.15, bz - bd / 2 + 0.25, bz + bd / 2 - 0.25, M["plywood"])
        for k in range(4):
            jz = bz - bd / 2 + 0.6 + k * 1.2
            box_span(f"ply_joist_{x0}_{k}", x0, x1, 2.87, 3.05, jz - 0.04, jz + 0.04, M["wood"])
    # stairs: 8 steps 1 m wide along x=-37 from z -15 to -19, rising to 3.0
    for s in range(8):
        sy = (s + 1) * 0.375
        sz = bz + bd / 2 - 0.5 - (s / 7) * (bd - 1.0)
        box_span(f"frame_step_{s}", bx - 0.5, bx + 0.5, sy - 0.05, sy, sz - 0.25, sz + 0.25, M["wood"])
        box_span(f"frame_riser_{s}", bx - 0.48, bx + 0.48, sy - 0.375, sy - 0.05, sz + 0.23, sz + 0.25, M["wood"])
    bar("frame_stair_rail", (bx + 0.6, 1.3, bz + bd / 2 - 0.4), (bx + 0.6, 3.9, bz - bd / 2 + 0.6), 0.04, M["navy"])
    for k in range(3):
        t_ = k / 2
        pz = bz + bd / 2 - 0.4 - t_ * (bd - 1.0)
        py = 0.4 + t_ * 2.6
        bar(f"frame_stair_post_{k}", (bx + 0.6, py, pz), (bx + 0.6, py + 0.9, pz), 0.035, M["navy"])
    # tarp roof at 6.0..6.15 (collider), blue tarp over purlins, tied with ropes
    box_span("tarp", bx - bw * 0.15, bx + bw * 0.45 + 0.15, 6.0, 6.12, bz - bd / 2 - 0.15, bz + bd / 2 + 0.15, M["tarp"], tags={"ambientMotion": "sway-shrub"})
    for k in range(4):
        px = bx - bw * 0.15 + 0.3 + k * 1.1
        box_span(f"tarp_purlin_{k}", px - 0.04, px + 0.04, 5.92, 6.0, bz - bd / 2, bz + bd / 2, M["wood"])
    for k in range(5):
        pz = bz - bd / 2 - 0.15 + k * 1.3
        tube(f"tarp_rope_{k}", (bx - bw * 0.15, 6.05, pz), (bx + bw * 0.45 + 0.15, 6.05, pz), 0.012, M["cable"], segments=4)
    # warning sign on the front
    box_span("frame_sign_board", bx - 0.8, bx + 0.8, 4.0, 5.0, bz + bd / 2 + 0.03, bz + bd / 2 + 0.07, M["hazard"])
    box_span("frame_sign_inner", bx - 0.7, bx + 0.7, 4.1, 4.9, bz + bd / 2 + 0.07, bz + bd / 2 + 0.085, M["white"])
    # printed text lines (dark bars) so the board reads as signage instead of a blank card
    for k, (hw, yc) in enumerate(((0.55, 4.72), (0.42, 4.5), (0.5, 4.3))):
        box_span(f"frame_sign_text_{k}", bx - hw, bx + hw, yc - 0.045, yc + 0.045, bz + bd / 2 + 0.085, bz + bd / 2 + 0.092, M["steel_dark"], tags={"castShadow": False})


def build_silo(M):
    sx, sz = -48.0, -22.0
    # plinth + legs (inside the 4.4 x 4.4 x 8 collider)
    box_span("silo_plinth", sx - 2.2, sx + 2.2, 0.0, 0.6, sz - 2.2, sz + 2.2, M["concrete"], bevel=0.02)
    for (dx, dz) in ((-1.75, -1.75), (1.75, -1.75), (-1.75, 1.75), (1.75, 1.75)):
        box_span(f"silo_leg_{dx}_{dz}", sx + dx - 0.16, sx + dx + 0.16, 0.6, 2.7, sz + dz - 0.16, sz + dz + 0.16, M["galv"])
        bar(f"silo_leg_brace_{dx}_{dz}", (sx + dx, 0.7, sz + dz), (sx + dx * 0.3, 2.5, sz + dz * 0.3), 0.06, M["galv"])
    # mesh skirt around the leg bay: the gameplay collider is the full 4.4 x 4.4 x 8 box,
    # so the space under the hopper must read as fenced off rather than walkable
    y0, y1 = 0.6, 2.7
    e = 2.2
    for name, quad, rail in (
        # east face is split around the ladder cage (z -22.7 .. -21.3 stays open)
        ("silo_skirt_e0", [(sx + e, y0, sz - e), (sx + e, y0, sz - 0.7), (sx + e, y1, sz - 0.7), (sx + e, y1, sz - e)], ((sx + e, sz - e), (sx + e, sz - 0.7))),
        ("silo_skirt_e1", [(sx + e, y0, sz + 0.7), (sx + e, y0, sz + e), (sx + e, y1, sz + e), (sx + e, y1, sz + 0.7)], ((sx + e, sz + 0.7), (sx + e, sz + e))),
        ("silo_skirt_w", [(sx - e, y0, sz + e), (sx - e, y0, sz - e), (sx - e, y1, sz - e), (sx - e, y1, sz + e)], ((sx - e, sz - e), (sx - e, sz + e))),
        ("silo_skirt_n", [(sx - e, y0, sz - e), (sx + e, y0, sz - e), (sx + e, y1, sz - e), (sx - e, y1, sz - e)], ((sx - e, sz - e), (sx + e, sz - e))),
        ("silo_skirt_s", [(sx + e, y0, sz + e), (sx - e, y0, sz + e), (sx - e, y1, sz + e), (sx + e, y1, sz + e)], ((sx - e, sz + e), (sx + e, sz + e))),
    ):
        K.mesh(name, quad, [(0, 1, 2, 3)], M["grating"], tags={"castShadow": False})
        (ax, az), (bx, bz) = rail
        for ry in (y0, (y0 + y1) / 2, y1):
            bar(f"{name}_rail_{ry}", (ax, ry, az), (bx, ry, bz), 0.05, M["galv"])
    K.cylinder("silo_hopper", 0.55, 1.5, (sx, 1.75, sz), M["galv"], segments=20, radius_top=2.1)
    # galvanized steel shell with dark seam bands (a concrete-textured cylinder read as a tank)
    K.cylinder("silo_body", 2.15, 5.0, (sx, 5.0, sz), M["galv"], segments=24)
    K.cylinder("silo_band_0", 2.19, 0.1, (sx, 3.4, sz), M["steel_dark"], segments=24)
    K.cylinder("silo_band_1", 2.19, 0.1, (sx, 5.6, sz), M["steel_dark"], segments=24)
    K.cylinder("silo_band_2", 2.19, 0.1, (sx, 7.45, sz), M["steel_dark"], segments=24)
    K.cylinder("silo_cap", 2.15, 0.5, (sx, 7.75, sz), M["galv"], segments=24, radius_top=1.4)
    # low inspection hatch instead of a vent: the whole 5 x 5 top is a walkable collider
    K.cylinder("silo_hatch", 0.45, 0.08, (sx - 1.6, 8.22, sz + 1.6), M["galv"], segments=12)
    # service platform 5 x 5 at 8.03..8.18 (grating) with rails and toe boards
    deck("silo_platform", sx - 2.5, sx + 2.5, 8.18, sz - 2.5, sz + 2.5, M, planks=False, thickness=0.12)
    for (p0, p1) in (((sx - 2.5, 8.18, sz - 2.5), (sx + 2.5, 8.18, sz - 2.5)), ((sx - 2.5, 8.18, sz + 2.5), (sx + 2.5, 8.18, sz + 2.5)),
                     ((sx - 2.5, 8.18, sz - 2.5), (sx - 2.5, 8.18, sz + 2.5)), ((sx + 2.5, 8.18, sz + 2.5), (sx + 2.5, 8.18, sz + 0.45))):
        guardrail(f"silo_rail_{p0[0]}_{p0[2]}_{p1[2]}", p0, p1, 8.18, M, height=0.95, mid=0.5, posts=3)
    guardrail("silo_rail_e_gap", (sx + 2.5, 8.18, sz - 2.5), (sx + 2.5, 8.18, sz - 0.45), 8.18, M, height=0.95, posts=2)
    # ladder with safety cage on the east face (step colliders x -46.3..-45.7, z -22.15..-21.85)
    for i in range(20):
        y = 0.2 + i * 0.4
        scaffold_tube(f"silo_rung_{i}", (-46.25, y, sz - 0.25), (-46.25, y, sz + 0.25), M, r=0.016)
    for dz in (-0.28, 0.28):
        bar(f"silo_ladder_rail_{dz}", (-46.22, 0.0, sz + dz), (-46.22, 9.1, sz + dz), 0.05, M["yellow"])
    for k in range(6):
        y = 2.4 + k * 1.1
        hoop = K.cylinder(f"silo_cage_{k}", 0.42, 0.05, (-46.0, y, sz), M["yellow"], segments=12, radius_top=0.42)
        hoop["castShadow"] = False
    for dz in (-0.36, 0.0, 0.36):
        bar(f"silo_cage_bar_{dz}", (-45.62 + (0.2 if dz == 0 else 0.0), 2.4, sz + dz), (-45.62 + (0.2 if dz == 0 else 0.0), 8.0, sz + dz), 0.03, M["yellow"])
    # planks leaning against the silo (visual, at the old procedural spot)
    bar("lean_plank_0", (-45.6, 0.3, -25.0), (-46.2, 3.2, -24.9), 0.04, M["wood"], w=0.15)
    bar("lean_plank_1", (-45.6, 0.3, -24.7), (-46.15, 3.0, -24.5), 0.04, M["wood"], w=0.15)


def build_access_scaffold(M):
    """North-west 4 m scaffold with top platform and west ladder (colliders 148-160)."""
    nx, nz = -45.0, -30.0
    for x in (nx - 2.0, nx + 2.0):
        box_span(f"acc_post_{x}", x - 0.1, x + 0.1, 0.0, 4.0, nz - 0.1, nz + 0.1, M["yellow"])
        box_span(f"acc_foot_{x}", x - 0.2, x + 0.2, 0.0, 0.06, nz - 0.2, nz + 0.2, M["steel_dark"])
    box_span("acc_beam", nx - 2.1, nx + 2.1, 3.85, 4.0, nz - 0.075, nz + 0.075, M["yellow"])
    deck("acc_platform", nx - 2.25, nx + 2.25, 4.17, nz - 1.0, nz + 1.0, M, planks=False, thickness=0.12)
    for z in (nz - 1.0, nz + 1.0):
        bar(f"acc_bearer_{z}", (nx - 2.25, 3.95, z), (nx + 2.25, 3.95, z), 0.1, M["yellow"])
    for (dx, dz) in ((-1.9, -0.7), (1.9, -0.7), (-1.9, 0.7), (1.9, 0.7)):
        bar(f"acc_outrigger_{dx}_{dz}", (nx + dx * 0.55, 3.85, nz), (nx + dx, 3.95, nz + dz), 0.05, M["yellow"])
    guardrail("acc_rail_n", (nx - 2.25, 4.17, nz - 1.0), (nx + 2.25, 4.17, nz - 1.0), 4.17, M, posts=3)
    guardrail("acc_rail_s", (nx - 2.25, 4.17, nz + 1.0), (nx + 2.25, 4.17, nz + 1.0), 4.17, M, posts=3)
    guardrail("acc_rail_e", (nx + 2.25, 4.17, nz - 1.0), (nx + 2.25, 4.17, nz + 1.0), 4.17, M, posts=2, toe=False)
    # west ladder (step colliders on x -47.2..-46.8)
    for i in range(10):
        y = 0.2 + i * 0.4
        scaffold_tube(f"acc_rung_{i}", (nx - 2.0 - 0.28, y, nz - 0.25), (nx - 2.0 - 0.28, y, nz + 0.25), M, r=0.016)
    for dz in (-0.28, 0.28):
        bar(f"acc_ladder_rail_{dz}", (nx - 2.28, 0.0, nz + dz), (nx - 2.28, 4.3, nz + dz), 0.04, M["yellow"])
    # cargo-net rope lines between the posts
    for i in range(1, 4):
        tube(f"acc_net_v_{i}", (nx - 2.0 + i, 0.3, nz), (nx - 2.0 + i, 3.85, nz), 0.012, M["cable"], segments=4)
    for i in range(4):
        tube(f"acc_net_h_{i}", (nx - 1.9, 0.5 + i * 0.85, nz), (nx + 1.9, 0.5 + i * 0.85, nz), 0.012, M["cable"], segments=4)


# --------------------------------------------------------------------------- #
# Crane, floodlight mast, gate, props, clutter
# --------------------------------------------------------------------------- #

def lattice_mast(name, cx, cz, half, y0, y1, M, mat_key="yellow", bay=1.5, leg=0.12,
                 door_face=None, door_bays=0):
    """Square lattice mast. Faces: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x).

    ``door_face``/``door_bays`` leave the lowest bays of one face without bracing so
    a player can walk into the mast (the rung closing the door acts as its header).
    """
    corners = [(cx - half, cz - half), (cx + half, cz - half), (cx + half, cz + half), (cx - half, cz + half)]
    for i, (x, z) in enumerate(corners):
        box_span(f"{name}_leg_{i}", x - leg / 2, x + leg / 2, y0, y1, z - leg / 2, z + leg / 2, M[mat_key])
    y = y0 + bay
    k = 0
    while y < y1 - 0.2:
        for i in range(4):
            a = corners[i]; b = corners[(i + 1) % 4]
            in_door = i == door_face and k < door_bays
            if in_door:
                if k == door_bays - 1:
                    bar(f"{name}_rung_{k}_{i}", (a[0], y, a[1]), (b[0], y, b[1]), leg * 0.6, M[mat_key])
                continue
            bar(f"{name}_rung_{k}_{i}", (a[0], y, a[1]), (b[0], y, b[1]), leg * 0.6, M[mat_key])
            # alternating diagonals per face
            if k % 2 == 0:
                bar(f"{name}_diag_{k}_{i}", (a[0], y - bay, a[1]), (b[0], y, b[1]), leg * 0.45, M[mat_key])
            else:
                bar(f"{name}_diag_{k}_{i}", (b[0], y - bay, b[1]), (a[0], y, a[1]), leg * 0.45, M[mat_key])
        y += bay
        k += 1


def build_crane(M):
    mx, mz = -48.0, -31.0
    top = 25.6
    box_span("crane_pad", mx - 1.7, mx + 1.7, 0.0, 0.12, mz - 1.7, mz + 1.7, M["concrete"])
    for (dx, dz) in ((-1.3, -1.3), (1.3, -1.3), (-1.3, 1.3), (1.3, 1.3)):
        K.cylinder(f"crane_anchor_{dx}_{dz}", 0.06, 0.2, (mx + dx, 0.2, mz + dz), M["steel_dark"], segments=6)
    # ---- climbable mast: hollow lattice with a door on the south face, an interior
    # caged ladder and a viewing ring under the slewing unit (real tower cranes are
    # climbed inside the mast). Bays are 1.6 m; the door takes the two lowest bays.
    half, leg = 0.6, 0.14
    outer = half + leg / 2               # 0.67: outer face of the legs
    inner = half - leg / 2               # 0.53: inner face of the legs
    deck_y = 24.15                       # viewing ring top 24.27: eye level stays under the slewing unit
    lattice_mast("crane_mast", mx, mz, half, 0.12, top, M, bay=1.6, leg=leg, door_face=2, door_bays=2)
    door_top = 0.12 + 2 * 1.6            # 3.32: the closing rung is the header
    # door frame + kick plate so the opening reads as an entrance, not missing bracing
    for x in (mx - inner, mx + inner):
        box_span(f"crane_door_jamb_{x}", x - 0.04, x + 0.04, 0.12, door_top, mz + inner - 0.08, mz + inner, M["steel_dark"])
    box_span("crane_door_sill", mx - inner, mx + inner, 0.12, 0.2, mz + inner - 0.08, mz + inner, M["steel_dark"])
    box_span("crane_door_sign", mx - 0.35, mx + 0.35, door_top + 0.12, door_top + 0.52, mz + outer, mz + outer + 0.03, M["hazard"])
    box_span("crane_door_sign_text", mx - 0.28, mx + 0.28, door_top + 0.28, door_top + 0.36, mz + outer + 0.03, mz + outer + 0.04, M["steel_dark"], tags={"castShadow": False})
    # interior ladder on the north inner face: rungs every 0.3 m, two rails, hoops
    lz = mz - inner + 0.15               # rung centre line, 0.15 inside the north wall
    for i in range(int((deck_y - 0.4) / 0.3) + 1):
        y = 0.4 + i * 0.3
        if y > deck_y - 0.05:
            break
        scaffold_tube(f"crane_rung_{i}", (mx - 0.25, y, lz), (mx + 0.25, y, lz), M, r=0.016)
    for dx in (-0.28, 0.28):
        bar(f"crane_ladder_rail_{dx}", (mx + dx, 0.12, lz), (mx + dx, deck_y + 0.9, lz), 0.04, M["galv"])
    # (no cage hoops: the mast bracing is the cage and the shaft is only 1.06 m wide)
    # colliders: legs to the slewing ring, thin walls to the ring (south wall starts
    # above the door), the ladder column (climbed from +z, i.e. from inside), the pad
    # only west of x -47.3 so it never touches the access scaffold's west ladder
    for i, (x, z) in enumerate(((mx - half, mz - half), (mx + half, mz - half), (mx + half, mz + half), (mx - half, mz + half))):
        K.collider(f"crane_leg_{i}", (x - leg / 2, 0.12, z - leg / 2), (x + leg / 2, top, z + leg / 2))
    wall = 0.08
    K.collider("crane_wall_n", (mx - outer, 0.12, mz - outer), (mx + outer, deck_y, mz - outer + wall))
    K.collider("crane_wall_s", (mx - outer, door_top, mz + outer - wall), (mx + outer, deck_y, mz + outer))
    K.collider("crane_wall_w", (mx - outer, 0.12, mz - outer), (mx - outer + wall, deck_y, mz + outer))
    K.collider("crane_wall_e", (mx + outer - wall, 0.12, mz - outer), (mx + outer, deck_y, mz + outer))
    K.collider("crane_ladder", (mx - 0.3, 0.12, mz - inner), (mx + 0.3, deck_y + 0.1, mz - inner + 0.3), ladder="+z")
    K.collider("crane_pad", (mx - 1.7, 0.0, mz - 1.7), (-47.3, 0.12, mz + 1.7))
    # ---- viewing ring 3.6 x 3.6 around the mast at 24.3: grating strips, toe boards,
    # yellow rails, brackets down to the legs. Players mantle out of the shaft onto the
    # north strip and can jump onto the turntable / walk the jib from there.
    r_out = 1.8
    strips = {
        "n": (mx - r_out, mx + r_out, mz - r_out, mz - outer),
        "s": (mx - r_out, mx + r_out, mz + outer, mz + r_out),
        "w": (mx - r_out, mx - outer, mz - outer, mz + outer),
        "e": (mx + outer, mx + r_out, mz - outer, mz + outer),
    }
    for key, (x0, x1, z0, z1) in strips.items():
        box_span(f"crane_deck_{key}", x0, x1, deck_y, deck_y + 0.12, z0, z1, M["grating"], tags={"castShadow": False})
        K.collider(f"crane_deck_{key}", (x0, deck_y, z0), (x1, deck_y + 0.12, z1))
    rail_y = deck_y + 0.12
    perimeter = [((mx - r_out, mz - r_out), (mx + r_out, mz - r_out)), ((mx + r_out, mz - r_out), (mx + r_out, mz + r_out)),
                 ((mx + r_out, mz + r_out), (mx - r_out, mz + r_out)), ((mx - r_out, mz + r_out), (mx - r_out, mz - r_out))]
    for idx, ((ax, az), (bx, bz)) in enumerate(perimeter):
        for t in (0.0, 0.5, 1.0):
            px, pz = ax + (bx - ax) * t, az + (bz - az) * t
            bar(f"crane_deck_post_{idx}_{t}", (px, rail_y, pz), (px, rail_y + 1.05, pz), 0.05, M["yellow"])
        for ry in (0.5, 1.05):
            bar(f"crane_deck_rail_{idx}_{ry}", (ax, rail_y + ry, az), (bx, rail_y + ry, bz), 0.04, M["yellow"])
        bar(f"crane_deck_toe_{idx}", (ax, rail_y + 0.08, az), (bx, rail_y + 0.08, bz), 0.15, M["steel_dark"], w=0.03)
    for (dx, dz) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        bar(f"crane_deck_bracket_{dx}_{dz}", (mx + dx * half, deck_y - 1.6, mz + dz * half), (mx + dx * (r_out - 0.1), deck_y - 0.02, mz + dz * (r_out - 0.1)), 0.06, M["yellow"])
        bar(f"crane_deck_beam_{dx}_{dz}", (mx + dx * half, deck_y - 0.02, mz + dz * half), (mx + dx * (r_out - 0.05), deck_y - 0.02, mz + dz * (r_out - 0.05)), 0.08, M["yellow"])
    # ship ladder from the south strip up to the slewing deck (the only way onto the
    # turntable / jib catwalk: 2.23 m is out of jump range). Six treads 0.372 m rise,
    # 0.2 m deep, running north toward the mast on the west half of the strip so it
    # stays clear of the cab shell above the east half.
    sl_x0, sl_x1 = mx - 1.5, mx - 0.7
    tread_top0 = deck_y + 0.12
    for k in range(1, 7):
        y1 = tread_top0 + k * (top + 0.9 - tread_top0) / 6
        z1 = mz + r_out - 0.15 - (k - 1) * 0.2
        z0 = z1 - 0.2
        box_span(f"crane_ship_step_{k}", sl_x0, sl_x1, y1 - 0.05, y1, z0, z1, M["galv"])
        box_span(f"crane_ship_riser_{k}", sl_x0 + 0.02, sl_x1 - 0.02, y1 - (top + 0.9 - tread_top0) / 6, y1 - 0.05, z1 - 0.02, z1, M["steel_dark"])
        K.collider(f"crane_ship_step_{k}", (sl_x0, deck_y, z0), (sl_x1, y1, z1))
    for x in (sl_x0 - 0.03, sl_x1 + 0.03):
        bar(f"crane_ship_rail_{x}", (x, tread_top0 + 0.9, mz + r_out - 0.15), (x, top + 0.9 + 0.9, mz + r_out - 0.15 - 1.2), 0.035, M["yellow"])
        for k in (0, 3, 6):
            zc = mz + r_out - 0.15 - k * 0.2
            yc = tread_top0 + k * (top + 0.9 - tread_top0) / 6
            bar(f"crane_ship_post_{x}_{k}", (x, yc, zc), (x, yc + 0.9, zc), 0.03, M["yellow"])
    # slewing ring + cab
    K.cylinder("crane_slew", 0.9, 0.5, (mx, top + 0.25, mz), M["steel_dark"], segments=16)
    box_span("crane_turntable", mx - 1.0, mx + 1.0, top + 0.5, top + 0.9, mz - 1.0, mz + 1.0, M["yellow"])
    box_span("crane_cab", mx + 0.5, mx + 2.2, top + 0.9, top + 2.9, mz + 0.7, mz + 2.1, M["orange"], bevel=0.02)
    K.plane("crane_cab_glass", (1.6, 1.4), (mx + 1.35, top + 2.0, mz + 2.12), M["glass"], normal="z")
    K.plane("crane_cab_glass_f", (1.3, 1.4), (mx + 2.22, top + 2.0, mz + 1.4), M["glass"], normal="x")
    # apex + tie bars
    apex_y = top + 6.0
    for (dx, dz) in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
        bar(f"crane_apex_{dx}_{dz}", (mx + dx, top + 0.9, mz + dz), (mx, apex_y, mz), 0.09, M["yellow"])
    # jib: two chords + diagonals from x -47.5 to -21, at y top+1.0 (bottom) / top+2.0 (top)
    jib_y0, jib_y1 = top + 1.0, top + 2.0
    jx0, jx1 = mx + 0.5, -21.0
    for z in (mz - 0.45, mz + 0.45):
        box_span(f"crane_jib_chord_b_{z}", jx0, jx1, jib_y0 - 0.06, jib_y0 + 0.06, z - 0.06, z + 0.06, M["yellow"])
    box_span("crane_jib_chord_t", jx0, jx1 - 1.5, jib_y1 - 0.06, jib_y1 + 0.06, mz - 0.06, mz + 0.06, M["yellow"])
    n = int((jx1 - jx0) / 1.8)
    for k in range(n):
        x = jx0 + k * 1.8
        for z in (mz - 0.45, mz + 0.45):
            bar(f"crane_jib_diag_{k}_{z}", (x, jib_y0, z), (x + 0.9, jib_y1, mz), 0.05, M["yellow"])
            bar(f"crane_jib_diag2_{k}_{z}", (x + 0.9, jib_y1, mz), (x + 1.8, jib_y0, z), 0.05, M["yellow"])
        bar(f"crane_jib_cross_{k}", (x, jib_y0, mz - 0.45), (x, jib_y0, mz + 0.45), 0.05, M["yellow"])
    # jib tie cables from apex
    for tx in (jx0 + 9.0, jx1 - 2.0):
        tube(f"crane_tie_{tx}", (mx, apex_y, mz), (tx, jib_y1, mz), 0.02, M["cable"], segments=4)
    # counter-jib + counterweights
    cj0, cj1 = mx - 0.5, mx - 7.5
    for z in (mz - 0.45, mz + 0.45):
        box_span(f"crane_cj_chord_{z}", cj1, cj0, jib_y0 - 0.06, jib_y0 + 0.06, z - 0.06, z + 0.06, M["yellow"])
    box_span("crane_cj_deck", cj1, cj0, jib_y0 + 0.06, jib_y0 + 0.1, mz - 0.5, mz + 0.5, M["galv"])
    tube("crane_cj_tie", (mx, apex_y, mz), (cj1 + 0.5, jib_y0 + 0.1, mz), 0.02, M["cable"], segments=4)
    for k in range(3):
        box_span(f"crane_counterweight_{k}", cj1 + 0.3 + k * 1.1, cj1 + 1.2 + k * 1.1, jib_y0 - 1.2, jib_y0 - 0.1, mz - 0.55, mz + 0.55, M["concrete"], bevel=0.02)
    # trolley + hoist cable + hook block (visual; hook stays far above player clearance)
    trolley_x = -23.5
    box_span("crane_trolley", trolley_x - 0.5, trolley_x + 0.5, jib_y0 - 0.45, jib_y0 - 0.1, mz - 0.5, mz + 0.5, M["steel_dark"])
    hook_y = 14.2
    for dz in (-0.12, 0.12):
        tube(f"crane_hoist_{dz}", (trolley_x, jib_y0 - 0.45, mz + dz), (trolley_x, hook_y + 0.6, mz + dz), 0.015, M["cable"], segments=4,
             tags={"ambientMotion": "hang-sway"})
    box_span("crane_hook_block", trolley_x - 0.22, trolley_x + 0.22, hook_y + 0.05, hook_y + 0.65, mz - 0.18, mz + 0.18, M["steel_dark"],
             tags={"ambientMotion": "hang-sway"})
    K.cylinder("crane_hook", 0.12, 0.5, (trolley_x, hook_y - 0.25, mz), M["hook"], segments=8, radius_top=0.05, tags={"ambientMotion": "hang-sway"})
    # ---- walkable top: slewing unit (colliders trimmed to the mast footprint so the
    # 0.2-0.3 m overhang never clips heads on the viewing ring), a grating catwalk
    # along the jib with handrail lines, the counter-jib deck and the cab shell.
    K.collider("crane_slew_ring", (mx - outer, top, mz - outer), (mx + outer, top + 0.5, mz + outer))
    K.collider("crane_turntable", (mx - outer, top + 0.5, mz - outer), (mx + outer, top + 0.9, mz + outer))
    K.collider("crane_cab", (mx + 0.5, top + 0.9, mz + 0.7), (mx + 2.2, top + 2.9, mz + 2.1))
    walk_z0, walk_z1 = mz - 0.39, mz + 0.39
    K.mesh("crane_jib_walk", [(jx0, jib_y0, walk_z0), (jx1 - 0.5, jib_y0, walk_z0), (jx1 - 0.5, jib_y0, walk_z1), (jx0, jib_y0, walk_z1)],
           [(0, 1, 2, 3)], M["grating"], tags={"castShadow": False})
    K.collider("crane_jib_walk", (jx0, jib_y0 - 0.06, mz - 0.45), (jx1 - 0.5, jib_y0 + 0.06, mz + 0.45))
    n_posts = int((jx1 - 0.5 - jx0) / 3.6)
    for k in range(n_posts + 1):
        x = jx0 + 0.3 + k * 3.6
        for z in (mz - 0.45, mz + 0.45):
            bar(f"crane_walk_post_{k}_{z}", (x, jib_y0, z), (x, jib_y0 + 1.0, z), 0.03, M["galv"])
    for z in (mz - 0.45, mz + 0.45):
        tube(f"crane_walk_line_{z}", (jx0 + 0.3, jib_y0 + 1.0, z), (jx0 + 0.3 + n_posts * 3.6, jib_y0 + 1.0, z), 0.012, M["cable"], segments=4)
    K.collider("crane_cj_deck", (cj1, jib_y0 + 0.06, mz - 0.5), (cj0, jib_y0 + 0.1, mz + 0.5))


def build_floodlight_mast(M):
    """Procedural crane-mast collider (0.6 sq, 10 m at -27,-30) read as a floodlight mast."""
    fx, fz = -27.0, -30.0
    box_span("flood_base", fx - 0.5, fx + 0.5, 0.2, 0.5, fz - 0.5, fz + 0.5, M["concrete"], bevel=0.02)
    lattice_mast("flood_mast", fx, fz, 0.26, 0.5, 9.6, M, mat_key="galv", bay=1.2, leg=0.07)
    box_span("flood_head", fx - 0.7, fx + 0.7, 9.6, 9.75, fz - 0.7, fz + 0.7, M["galv"])
    for (dx, dz) in ((-0.5, -0.5), (0.5, -0.5), (-0.5, 0.5), (0.5, 0.5)):
        box_span(f"flood_lamp_{dx}_{dz}", fx + dx - 0.22, fx + dx + 0.22, 9.75, 10.05, fz + dz - 0.16, fz + dz + 0.16, M["steel_dark"])
        K.box(f"flood_glass_{dx}_{dz}", (0.36, 0.06, 0.26), (fx + dx, 9.74, fz + dz), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})


def build_gate(M):
    gx, gz = -28.0, -15.0
    for side in (-1, 1):
        px = gx + side * 2.0
        box_span(f"gate_pier_{side}", px - 0.4, px + 0.4, 0.2, 4.0, gz - 0.6, gz + 0.6, M["brick"], bevel=0.015)
        box_span(f"gate_pier_cap_{side}", px - 0.5, px + 0.5, 4.0, 4.15, gz - 0.7, gz + 0.7, M["concrete"], bevel=0.015)
        box_span(f"gate_pier_base_{side}", px - 0.5, px + 0.5, 0.2, 0.5, gz - 0.7, gz + 0.7, M["concrete"])
    box_span("gate_header", gx - 2.5, gx + 2.5, 4.15, 4.95, gz - 0.55, gz + 0.55, M["navy"], bevel=0.01)
    box_span("gate_sign", gx - 1.6, gx + 1.6, 4.3, 4.85, gz + 0.56, gz + 0.6, M["hazard"])
    box_span("gate_sign_stripe", gx - 1.6, gx + 1.6, 4.3, 4.4, gz + 0.6, gz + 0.61, M["steel_dark"])
    for side in (-1, 1):
        K.box(f"gate_lamp_{side}", (0.3, 0.2, 0.3), (gx + side * 2.0, 4.3, gz), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})


def build_props(M):
    # cement bag stack (collider x -30.35..-27.4, z -16.2..-15.8, 0.7 tall)
    for row in range(3):
        for col in range(4 - row):
            K.box(f"cement_{row}_{col}", (0.72, 0.2, 0.42), (-30.0 + col * 0.75 + row * 0.15, 0.3 + row * 0.2, -16.0), M["cement"], bevel=0.02,
                  rot_y=(0.06 if (row + col) % 2 else -0.05))
    # pallets (colliders at (-43,-15) and (-41.6,-15))
    for px in (-43.0, -41.6):
        for k in range(3):
            box_span(f"pallet_board_{px}_{k}", px - 0.6, px + 0.6, 0.29, 0.32, -15.4 + k * 0.32, -15.4 + k * 0.32 + 0.24, M["wood"])
        for k in range(3):
            bx = px - 0.55 + k * 0.5
            box_span(f"pallet_bearer_{px}_{k}", bx - 0.05, bx + 0.05, 0.2, 0.29, -15.4, -14.6, M["wood"])
    # second pallet stacked at -43
    for k in range(3):
        box_span(f"pallet2_board_{k}", -43.6, -42.4, 0.41, 0.44, -15.4 + k * 0.32, -15.4 + k * 0.32 + 0.24, M["wood"])
    # pipe bundle (collider x -29.75..-26.25, z -20.15..-19.75, 0.8 tall)
    for i in range(4):
        tube(f"pipe_{i}", (-29.75, 0.3 + i * 0.17, -19.95 + (i % 2) * 0.1), (-26.25, 0.3 + i * 0.17, -19.95 + (i % 2) * 0.1), 0.08, M["galv"], segments=10)
    for zk_ in (-28.9, -27.1):
        box_span(f"pipe_chock_{zk_}", zk_ - 0.06, zk_ + 0.06, 0.2, 0.3, -20.15, -19.75, M["wood"])
    # drums (colliders at (-43,-27), (-42.4,-27.1), (-42.7,-26.45))
    for i, (dx, dz, lid) in enumerate(((-43.0, -27.0, "red"), (-42.4, -27.1, "hazard"), (-42.7, -26.45, "sign_blue"))):
        K.cylinder(f"drum_{i}", 0.25, 0.9, (dx, 0.65, dz), M["steel_dark"], segments=12)
        K.cylinder(f"drum_lid_{i}", 0.22, 0.03, (dx, 1.115, dz), M[lid], segments=12)
        for y in (0.45, 0.85):
            K.cylinder(f"drum_ring_{i}_{y}", 0.265, 0.03, (dx, y, dz), M["steel_dark"], segments=12)
    # tarp-covered pile (collider x -34.6..-31.4, z -15..-13, 1 tall)
    box_span("tarp_pile", -34.55, -31.45, 0.2, 1.15, -14.95, -13.05, M["tarp_green"], bevel=0.12)
    for x in (-33.8, -32.2):
        tube(f"tarp_pile_rope_{x}", (x, 1.2, -15.05), (x, 1.2, -12.95), 0.012, M["cable"], segments=4)
    # concrete mixer (colliders (-42.6..-41.4, .15-.55) and drum (-42.5..-41.5, .5-1.4))
    box_span("mixer_frame", -42.55, -41.45, 0.35, 0.55, -20.35, -19.65, M["steel_dark"], bevel=0.01)
    mixer_drum = K.cylinder("mixer_drum", 0.45, 0.9, (-42.0, 0.95, -20.0), M["orange"], segments=14, radius_top=0.3)
    mixer_drum.rotation_euler = (0.0, math.radians(35), 0.0)
    K.cylinder("mixer_wheel_0", 0.2, 0.1, (-42.5, 0.4, -20.5), M["rubber"], segments=10, axis="z")
    K.cylinder("mixer_wheel_1", 0.2, 0.1, (-42.5, 0.4, -19.5), M["rubber"], segments=10, axis="z")
    bar("mixer_handle", (-41.3, 0.9, -20.0), (-40.7, 0.6, -20.0), 0.04, M["yellow"])
    # generator (collider (-29.5..-28.5, .15-.95, -28.35..-27.65))
    box_span("generator", -29.5, -28.5, 0.2, 0.95, -28.35, -27.65, M["orange"], bevel=0.02)
    box_span("generator_panel", -28.52, -28.48, 0.5, 0.85, -28.15, -27.85, M["steel_dark"])
    K.cylinder("generator_exhaust", 0.04, 0.5, (-29.3, 1.15, -28.0), M["steel_dark"], segments=6)
    # forklift (collider (-32.6..-31.4, .15-.75, -29.4..-28.6))
    box_span("forklift_body", -32.6, -31.4, 0.3, 0.75, -29.4, -28.6, M["yellow"], bevel=0.02)
    box_span("forklift_roof", -32.5, -31.5, 1.5, 1.56, -29.35, -28.65, M["yellow"])
    for (mx_, mz_) in ((-32.55, -29.35), (-32.55, -28.65), (-31.45, -29.35), (-31.45, -28.65)):
        box_span(f"forklift_post_{mx_}_{mz_}", mx_ - 0.03, mx_ + 0.03, 0.75, 1.5, mz_ - 0.03, mz_ + 0.03, M["steel_dark"])
    for mz_ in (-29.3, -28.7):
        box_span(f"forklift_mast_{mz_}", -31.5, -31.42, 0.3, 1.9, mz_ - 0.04, mz_ + 0.04, M["steel_dark"])
        box_span(f"forklift_fork_{mz_}", -31.42, -30.6, 0.28, 0.32, mz_ - 0.03, mz_ + 0.03, M["steel_dark"])
    for (wx, wz) in ((-32.4, -29.45), (-32.4, -28.55), (-31.6, -29.45), (-31.6, -28.55)):
        K.cylinder(f"forklift_wheel_{wx}_{wz}", 0.16, 0.14, (wx, 0.36, wz), M["rubber"], segments=10, axis="z")
    box_span("forklift_seat", -32.35, -32.05, 0.75, 1.0, -29.15, -28.85, M["steel_dark"])
    # rebar bundle (collider x -46..-42, z -21.7..-21.3, 0.4 tall)
    for i in range(8):
        tube(f"rebar_bundle_{i}", (-46.0, 0.24 + i * 0.045, -21.5 + (i % 3) * 0.05 - 0.05), (-42.0, 0.24 + i * 0.045, -21.5 + (i % 3) * 0.05 - 0.05), 0.016, M["rust"], segments=5)
    for x in (-45.2, -42.8):
        box_span(f"rebar_bundle_chock_{x}", x - 0.06, x + 0.06, 0.2, 0.26, -21.7, -21.3, M["wood"])
    # tyre stack (collider (-27.35..-26.65, .01-.15, -15.35..-14.65))
    for k in range(3):
        K.cylinder(f"tyre_{k}", 0.35, 0.15, (-27.0 + (0.1 if k == 2 else 0), 0.275 + k * 0.15, -15.0), M["rubber"], segments=14)
    # wheelbarrow (collider (-34.35..-33.65, .25-.55, -25.25..-24.75))
    box_span("wheelbarrow_tray", -34.35, -33.65, 0.3, 0.55, -25.25, -24.75, M["steel_dark"], bevel=0.03)
    K.cylinder("wheelbarrow_wheel", 0.15, 0.08, (-33.5, 0.35, -25.0), M["rubber"], segments=10, axis="z")
    for dz in (-0.3, 0.3):
        box_span(f"wheelbarrow_handle_{dz}", -34.85, -34.35, 0.5, 0.54, -25.0 + dz - 0.02, -25.0 + dz + 0.02, M["wood"])
    # toolbox (collider (-40.25..-39.75, .1-.34, -19.12..-18.88))
    box_span("toolbox", -40.25, -39.75, 0.2, 0.42, -19.12, -18.88, M["red"], bevel=0.01)
    box_span("toolbox_lid", -40.25, -39.75, 0.42, 0.44, -19.3, -19.1, M["red"])
    # lamp posts on collider spots (-38,-28) and (-51,-8)
    for (lx, lz) in ((-38.0, -28.0), (-51.0, -8.0)):
        base_y = 0.2 if abs(lx - CX) < 11 and abs(lz - CZ) < 11 else 0.0
        box_span(f"sitelamp_base_{lx}", lx - 0.25, lx + 0.25, base_y, base_y + 0.32, lz - 0.25, lz + 0.25, M["concrete"], bevel=0.02)
        K.cylinder(f"sitelamp_post_{lx}", 0.06, 3.0, (lx, base_y + 0.32 + 1.5, lz), M["steel_dark"], segments=8, radius_top=0.045)
        K.box(f"sitelamp_arm_{lx}", (0.08, 0.08, 0.5), (lx, base_y + 3.3, lz + 0.22), M["steel_dark"])
        K.box(f"sitelamp_head_{lx}", (0.34, 0.12, 0.34), (lx, base_y + 3.42, lz + 0.4), M["steel_dark"], bevel=0.01)
        K.box(f"sitelamp_glass_{lx}", (0.26, 0.3, 0.26), (lx, base_y + 3.22, lz + 0.4), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})


def build_clutter(M):
    # cones
    for (cx_, cz_) in ((-44.0, -30.0), (-42.0, -31.0), (-26.0, -19.0), (-28.0, -24.0), (-38.0, -31.0), (-34.0, -13.0)):
        K.cylinder(f"cone_{cx_}_{cz_}", 0.14, 0.55, (cx_, 0.2 + 0.275, cz_), M["orange"], segments=8, radius_top=0.03)
        box_span(f"cone_base_{cx_}_{cz_}", cx_ - 0.15, cx_ + 0.15, 0.2, 0.23, cz_ - 0.15, cz_ + 0.15, M["orange"])
        K.cylinder(f"cone_band_{cx_}_{cz_}", 0.1, 0.06, (cx_, 0.5, cz_), M["white"], segments=8, radius_top=0.085)
    # hard hats
    for (hx_, hz_) in ((-41.0, -14.0), (-27.0, -25.0), (-37.0, -18.0)):
        K.cylinder(f"hardhat_{hx_}", 0.16, 0.12, (hx_, 0.26, hz_), M["hazard"], segments=10, radius_top=0.09)
    # hazard tape barriers along the west and east edges of the slab
    for (tx, z0, z1) in ((-45.0, -30.0, -24.0), (-25.0, -27.0, -17.0), (-24.0, -32.5, -28.0)):
        for z in (z0, z1):
            K.cylinder(f"tape_post_{tx}_{z}", 0.03, 0.9, (tx, 0.65, z), M["steel_dark"], segments=6)
            box_span(f"tape_post_base_{tx}_{z}", tx - 0.15, tx + 0.15, 0.2, 0.24, z - 0.15, z + 0.15, M["steel_dark"])
        for y in (0.75, 0.55):
            box_span(f"tape_{tx}_{y}", tx - 0.015, tx + 0.015, y - 0.03, y + 0.03, z0, z1, M["hazard"], tags={"castShadow": False})
    # warning signs
    for (sx_, sz_) in ((-39.0, -32.5), (-30.0, -32.6)):
        K.cylinder(f"sign_post_{sx_}", 0.03, 1.8, (sx_, 1.1, sz_), M["steel_dark"], segments=6)
        box_span(f"sign_{sx_}", sx_ - 0.3, sx_ + 0.3, 1.55, 2.05, sz_ - 0.02, sz_ + 0.02, M["hazard"])
        box_span(f"sign_inner_{sx_}", sx_ - 0.25, sx_ + 0.25, 1.6, 2.0, sz_ + 0.02, sz_ + 0.03, M["white"])
    # work-light tripods (emissive heads)
    for (lx, lz, yaw) in ((-44.0, -28.0, 0.7), (-26.0, -28.0, 2.4), (-44.0, -14.0, -0.6), (-26.0, -17.2, 3.6)):
        for k in range(3):
            a = yaw + k * math.tau / 3
            bar(f"tripod_leg_{lx}_{lz}_{k}", (lx + math.cos(a) * 0.45, 0.2, lz + math.sin(a) * 0.45), (lx, 1.7, lz), 0.03, M["steel_dark"])
        K.cylinder(f"tripod_mast_{lx}_{lz}", 0.025, 0.6, (lx, 1.95, lz), M["steel_dark"], segments=6)
        box_span(f"tripod_head_{lx}_{lz}", lx - 0.22, lx + 0.22, 2.1, 2.4, lz - 0.09, lz + 0.09, M["steel_dark"], bevel=0.01)
        K.box(f"tripod_glass_{lx}_{lz}", (0.36, 0.22, 0.04), (lx, 2.25, lz + 0.1), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    # formwork stacks (solid: players jump onto them, so each ships a collider that
    # wraps the rotated stack; both stay clear of the tarp pile and forklift colliders)
    for (fx, fz, rot) in ((-26.6, -28.0, 0.05), (-31.0, -12.2, -0.08)):
        K.box(f"formwork_{fx}", (3.2, 0.7, 1.15), (fx, 0.55, fz), M["plywood"], rot_y=rot, bevel=0.02)
        for strap in (-0.9, 0.9):
            K.box(f"formwork_strap_{fx}_{strap}", (0.12, 0.74, 1.18), (fx + strap, 0.56, fz), M["galv"], rot_y=rot)
        hx = 1.6 * math.cos(rot) + 0.59 * abs(math.sin(rot))
        hz = 0.59 * math.cos(rot) + 1.6 * abs(math.sin(rot))
        K.collider(f"formwork_{int(round(-fx))}", (fx - hx, 0.2, fz - hz), (fx + hx, 0.93, fz + hz))
    # rebar cages stored off the corridors (two under the shelter, two on the east/north edges)
    for (cx_, cz_) in ((-45.4, -12.5), (-43.6, -12.5), (-29.0, -12.5), (-25.2, -32.2)):
        for (dx, dz) in ((-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2)):
            K.cylinder(f"cage_bar_{cx_}_{dx}_{dz}", 0.016, 2.2, (cx_ + dx, 1.3, cz_ + dz), M["rust"], segments=4)
        for y in (0.6, 1.3, 2.0):
            for (a, b) in (((-0.2, -0.2), (0.2, -0.2)), ((0.2, -0.2), (0.2, 0.2)), ((0.2, 0.2), (-0.2, 0.2)), ((-0.2, 0.2), (-0.2, -0.2))):
                bar(f"cage_ring_{cx_}_{y}_{a}", (cx_ + a[0], y, cz_ + a[1]), (cx_ + b[0], y, cz_ + b[1]), 0.012, M["rust"])
        K.collider(f"rebar_cage_{int(round(-cx_ * 10))}_{int(round(-cz_ * 10))}", (cx_ - 0.24, 0.2, cz_ - 0.24), (cx_ + 0.24, 2.4, cz_ + 0.24))
    # cable reel (solid) + bucket
    K.cylinder("cable_reel", 0.62, 0.7, (-44.5, 0.82, -12.0), M["wood"], segments=14, axis="x")
    K.cylinder("cable_reel_hub", 0.3, 0.8, (-44.5, 0.82, -12.0), M["cable"], segments=12, axis="x")
    K.collider("cable_reel", (-44.9, 0.2, -12.62), (-44.1, 1.44, -11.38))
    K.cylinder("bucket", 0.14, 0.3, (-34.5, 0.35, -17.0), M["orange"], segments=8, radius_top=0.12)
    # open-sided material shelter in the south-west corner (no walls: the corner has no
    # building collider). It stops short of the frame column at (-42, -15) so the roof
    # never pierces the concrete; posts and roof ship their own colliders.
    sx0, sx1, sz0, sz1 = -46.0, -42.6, -15.9, -11.7
    for (px, pz) in ((sx0 + 0.15, sz0 + 0.15), (sx1 - 0.15, sz0 + 0.15), (sx0 + 0.15, sz1 - 0.15), (sx1 - 0.15, sz1 - 0.15)):
        box_span(f"shelter_post_{px}_{pz}", px - 0.07, px + 0.07, 0.2, 3.1, pz - 0.07, pz + 0.07, M["galv"])
        box_span(f"shelter_foot_{px}_{pz}", px - 0.15, px + 0.15, 0.2, 0.26, pz - 0.15, pz + 0.15, M["steel_dark"])
        K.collider(f"shelter_post_{int(round(-px * 100))}_{int(round(-pz * 100))}", (px - 0.08, 0.2, pz - 0.08), (px + 0.08, 3.1, pz + 0.08))
    for pz in (sz0 + 0.15, sz1 - 0.15):
        box_span(f"shelter_beam_{pz}", sx0, sx1, 3.0, 3.12, pz - 0.06, pz + 0.06, M["galv"])
    for k in range(3):
        px = sx0 + 0.45 + k * 1.25
        box_span(f"shelter_purlin_{k}", px - 0.04, px + 0.04, 3.12, 3.2, sz0, sz1, M["galv"])
    v = [(sx0 - 0.3, 3.36, sz0 - 0.3), (sx1 + 0.3, 3.36, sz0 - 0.3), (sx1 + 0.3, 3.2, sz1 + 0.3), (sx0 - 0.3, 3.2, sz1 + 0.3)]
    vb = [(x, y - 0.04, z) for (x, y, z) in v]
    K.mesh("shelter_roof", v + vb, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M["roof_dark"])
    K.collider("shelter_roof", (sx0 - 0.3, 3.0, sz0 - 0.3), (sx1 + 0.3, 3.36, sz1 + 0.3))
    K.box("shelter_lamp", (0.3, 0.12, 0.3), (-44.3, 2.94, -13.8), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    # cement bag pallet under the shelter (visual, low)
    for k in range(4):
        K.box(f"shelter_bag_{k}", (0.7, 0.2, 0.42), (-44.9 + (k % 2) * 0.75, 0.32 + (k // 2) * 0.2, -13.0), M["cement"], bevel=0.02, rot_y=0.05 * (k % 2))


def build_lod1(M):
    box_span("l1_slab", CX - 11, CX + 11, 0.0, 0.2, CZ - 11, CZ + 11, M["slab"], lod="LOD1", tags={"castShadow": False})
    for x in (-42.0, -36.0, -30.0):
        for z in (-29.0, -22.0, -15.0):
            box_span(f"l1_col_{x}_{z}", x - 0.21, x + 0.21, 0.2, 8.5, z - 0.21, z + 0.21, M["concrete"], lod="LOD1")
    for z in (-29.0, -22.0):
        for y in (3.4, 6.5):
            box_span(f"l1_beam_{z}_{y}", -41.79, -30.21, y - 0.17, y + 0.17, z - 0.15, z + 0.15, M["steel_red"], lod="LOD1")
    for (y0, y1) in ((3.2, 3.5), (6.4, 6.7)):
        box_span(f"l1_pour_{y0}", -33.0, -30.2, y0, y1, -21.8, -15.2, M["concrete"], lod="LOD1")
    # scaffold tower + secondary + bridge as simple decks and posts
    for (x, z) in ((-41.0, -26.5), (-41.0, -23.5), (-37.0, -26.5), (-37.0, -23.5)):
        box_span(f"l1_tup_{x}_{z}", x - 0.05, x + 0.05, 0.2, 7.4, z - 0.05, z + 0.05, M["yellow"], lod="LOD1")
    for y in (2.55, 5.05, 7.25):
        box_span(f"l1_tdeck_{y}", -41.15, -36.85, y - 0.06, y, -26.65, -23.35, M["wood"], lod="LOD1")
    for (x, z) in ((-32.75, -27.25), (-32.75, -24.75), (-29.25, -27.25), (-29.25, -24.75)):
        box_span(f"l1_sup_{x}_{z}", x - 0.05, x + 0.05, 0.2, 5.2, z - 0.05, z + 0.05, M["yellow"], lod="LOD1")
    for y in (2.55, 5.05):
        box_span(f"l1_sdeck_{y}", -32.9, -29.1, y - 0.06, y, -27.4, -24.6, M["wood"], lod="LOD1")
    box_span("l1_bridge", -37.0, -32.75, 5.04, 5.1, -26.1, -24.9, M["galv"], lod="LOD1")
    # shoring frame
    for (x, z) in ((-40.0, -19.5), (-40.0, -14.5), (-34.0, -19.5), (-34.0, -14.5)):
        box_span(f"l1_hcol_{x}_{z}", x - 0.125, x + 0.125, 0.2, 6.0, z - 0.125, z + 0.125, M["galv"], lod="LOD1")
    box_span("l1_ply", -39.75, -34.25, 3.05, 3.15, -19.25, -14.75, M["plywood"], lod="LOD1")
    box_span("l1_tarp", -37.9, -34.15, 6.0, 6.12, -19.65, -14.35, M["tarp"], lod="LOD1")
    # silo
    box_span("l1_silo_plinth", -50.2, -45.8, 0.0, 0.6, -24.2, -19.8, M["concrete"], lod="LOD1")
    K.cylinder("l1_silo_body", 2.15, 7.4, (-48.0, 4.3, -22.0), M["galv"], segments=12, lod="LOD1")
    box_span("l1_silo_platform", -50.5, -45.5, 8.06, 8.18, -24.5, -19.5, M["galv"], lod="LOD1")
    # access scaffold, crane, floodlight, gate, shelter
    box_span("l1_acc_platform", -47.25, -42.75, 4.05, 4.17, -31.0, -29.0, M["galv"], lod="LOD1")
    for x in (-47.0, -43.0):
        box_span(f"l1_acc_post_{x}", x - 0.1, x + 0.1, 0.0, 4.0, -30.1, -29.9, M["yellow"], lod="LOD1")
    box_span("l1_crane_mast", -48.6, -47.4, 0.12, 26.5, -31.6, -30.4, M["yellow"], lod="LOD1")
    box_span("l1_crane_deck", -49.8, -46.2, 24.3, 24.42, -32.8, -29.2, M["galv"], lod="LOD1")
    box_span("l1_crane_jib", -47.5, -21.0, 26.6, 27.6, -31.45, -30.55, M["yellow"], lod="LOD1")
    box_span("l1_crane_cj", -55.5, -48.5, 26.6, 27.6, -31.45, -30.55, M["yellow"], lod="LOD1")
    box_span("l1_flood_mast", -27.26, -26.74, 0.2, 9.75, -30.26, -29.74, M["galv"], lod="LOD1")
    for side in (-1, 1):
        box_span(f"l1_gate_pier_{side}", -28.0 + side * 2.0 - 0.4, -28.0 + side * 2.0 + 0.4, 0.2, 4.15, -15.6, -14.4, M["brick"], lod="LOD1")
    box_span("l1_gate_header", -30.5, -25.5, 4.15, 4.95, -15.55, -14.45, M["navy"], lod="LOD1")
    box_span("l1_shelter_roof", -46.3, -42.3, 3.2, 3.36, -16.2, -11.4, M["roof_dark"], lod="LOD1")


def add_references():
    count = K.import_reference_colliders(COLLIDER_JSON, (ZONE_MIN, ZONE_MAX))
    kept = K.import_reference_glb(CINEMATIC_GLB, (ZONE_MIN, ZONE_MAX)) if CINEMATIC_GLB.exists() else 0
    top = REFERENCE_DIR / "harbor-v2-construction-top-orthographic.png"
    if top.exists():
        K.add_reference_image(top, "REF_IMG_top_ortho", (-36.0, -0.05, -22.0), 36.0, rotation_z=-math.pi / 2)
    return count, kept


def main(save: bool = True) -> dict:
    K.new_scene("Harbor_V2_Construction_AD_Authoring")
    M = materials()
    build_ground(M)
    build_frame(M)
    build_scaffold_tower(M)
    build_secondary_scaffold(M)
    build_shoring_frame(M)
    build_silo(M)
    build_access_scaffold(M)
    build_crane(M)
    build_floodlight_mast(M)
    build_gate(M)
    build_props(M)
    build_clutter(M)
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
    if save:
        BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
        stats["saved"] = str(BLEND_PATH)
    return stats
