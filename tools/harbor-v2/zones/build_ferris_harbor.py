"""Ferris Harbor District — Harbor V2 zone builder (Blender 5.2, run inside the MCP session).

Authors ``art-source/harbor-v2/ferris-harbor/ferris-harbor.blend``: an industrial
seaside Ferris wheel with a convincing drive train, a working timber/concrete pier
with mooring hardware, a unified boat fleet and the mooring sockets the runtime
ropes attach to. Every gameplay volume is inherited: the procedural platform,
A-frame legs and the 40 dynamic cabin colliders (``buildFerrisWheel``), the
boardwalk / pier kerb / seawall (``buildHarborEdge``) and the cinematic ticket-booth
colliders. The wheel keeps hub (-10, 12, 34), ring radius 8, mount radius 8.5 and
eight 1.8 x 2.2 x 1.4 cabins so GameManager's collider update and platform carry
keep working unchanged.

Rig hierarchy exported as glTF nodes (the client animates the empties):

    RIG_FERRIS_HARBOR_WHEEL_ROOT            rotates about z (world) — rims, spokes, hub, bulbs, yokes
      RIG_FERRIS_HARBOR_MOUNT_<i>           on the mount radius, rotates with the wheel
        RIG_FERRIS_HARBOR_CABIN_<i>         counter-rotated so the cabin hangs upright
    RIG_FERRIS_HARBOR_BOAT_<ID>             ambientMotion "boat-<id>" (heave / pitch / roll)
      SOCKET_FERRIS_HARBOR_MOOR_<ID>_<n>_BOAT
    SOCKET_FERRIS_HARBOR_MOOR_<ID>_<n>_DOCK  static rope anchors (cleats)

Usage (MCP): ``import build_ferris_harbor as F; F.main(save=True)``
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

import zone_kit as zk

ROOT = Path(__file__).resolve().parents[3]
COLLIDER_JSON = ROOT / "art-source/harbor-v2/_staging/procedural-colliders.json"
CINEMATIC_GLB = ROOT / "client/public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb"
REFERENCE_DIR = Path("/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets")
OUTPUT_BLEND = ROOT / "art-source/harbor-v2/ferris-harbor/ferris-harbor.blend"

ZONE_MIN = (-24.0, -3.5, 26.5)
ZONE_MAX = (32.5, 24.0, 63.0)

# gameplay contract (do not change without changing GameManager / buildFerrisWheel)
HUB = (-10.0, 12.0, 34.0)
RING_R = 8.0
MOUNT_R = 8.5
RIM_Z = 1.8            # rims at hub z +- 1.8
N_CABINS = 8
CAB_W, CAB_H, CAB_D = 1.8, 2.2, 1.4
PLATFORM = ((-17.0, 0.0, 29.0), (-3.0, 0.35, 39.0))
BOARDWALK_TOP = 0.18
KERB_Z = (41.8, 42.2)
SEAWALL = ((-55.0, 0.0, 46.55), (63.0, 0.9, 47.45))
WATER_Y = -0.8
DECK_Y = 10.3          # hub maintenance platform top 10.42

K = zk.ZoneKit("FERRIS_HARBOR", "ferris-harbor", "ferris-pbr",
               dynamic_collections=("FERRIS_DYNAMIC", "CABINS_DYNAMIC", "BOATS_DYNAMIC"))
_M: dict = {}


# --------------------------------------------------------------------------- #
# Materials
# --------------------------------------------------------------------------- #

def materials():
    M = {}
    M["navy"] = K.pbr("MAT_STEEL_NAVY_WEATHERED", "steel_navy_weathered")
    M["rust_red"] = K.pbr("MAT_RUST_RED_PAINT", "rust_red_paint")
    M["hull_navy"] = K.pbr("MAT_HULL_NAVY", "hull_navy")
    M["cream"] = K.pbr("MAT_HULL_CREAM", "hull_cream")
    M["deck"] = K.pbr("MAT_DECK_TIMBER", "deck_timber")
    M["plank_green"] = K.pbr("MAT_PLANK_GREEN", "plank_green")
    M["plank_red"] = K.pbr("MAT_PLANK_RED", "plank_red")
    M["machine"] = K.pbr("MAT_MACHINE_GREEN", "machine_green")
    M["concrete"] = K.pbr("MAT_BASE_CONCRETE_SEAWALL", "concrete_seawall")
    M["galv"] = K.pbr("MAT_GALVANIZED", "galvanized")
    M["rust"] = K.pbr("MAT_RUST_DARK", "rust_dark")
    M["glass"] = K.simple("MAT_GLASS_CABIN", (0.55, 0.66, 0.72), 0.08, alpha=0.42, blended=True, double_sided=True)
    # wheelhouse / booth panes sit 5 mm in front of a painted wall, so they need a
    # dark tint to read as glass over an unlit interior instead of a white patch
    M["glass_dark"] = K.simple("MAT_GLASS_BOAT", (0.08, 0.12, 0.15), 0.05, alpha=0.88, blended=True, double_sided=True)
    M["water_wet"] = K.simple("MAT_PUDDLE", (0.14, 0.17, 0.19), 0.03, alpha=0.55, blended=True)
    # every light in the district shares one emissive swatch material: bulbs, lamps,
    # cabin lights, navigation lights (the "LIGHT_" token also switches shadows off)
    lights = K.palette("MAT_LIGHT_UNIT", {
        "bulb": (1.0, 0.82, 0.5),
        "lamp": (1.0, 0.9, 0.7),
        "nav_red": (0.95, 0.12, 0.1),
        "nav_green": (0.1, 0.85, 0.35),
        "nav_white": (1.0, 0.97, 0.9),
        "nav_amber": (1.0, 0.7, 0.25),
    }, rough=0.3, emissive_strength=3.5)
    for key, swatch in lights.items():
        M[key] = swatch
    palette = K.palette("MAT_PALETTE", {
        # muted cabin panels (five variations of one modular cabin)
        "cab_teal": (0.24, 0.5, 0.5),
        "cab_brick": (0.6, 0.25, 0.2),
        "cab_mustard": (0.72, 0.58, 0.2),
        "cab_coral": (0.78, 0.48, 0.42),
        "cab_navy": (0.2, 0.28, 0.45),
        "steel_black": (0.09, 0.1, 0.11),
        "rubber": (0.06, 0.06, 0.065),
        "rope": (0.62, 0.55, 0.4),
        "canvas_red": (0.6, 0.2, 0.16),
        "canvas_cream": (0.85, 0.82, 0.72),
        "canvas_green": (0.25, 0.4, 0.3),
        "orange": (0.85, 0.36, 0.1),
        "white": (0.82, 0.82, 0.8),
        "crate": (0.52, 0.42, 0.28),
        "cable": (0.08, 0.08, 0.09),
        "brass": (0.55, 0.45, 0.2),
        "timber": (0.45, 0.36, 0.26),
    }, rough=0.75, grid=5)
    for key, swatch in palette.items():
        M[key] = swatch
    _M.clear(); _M.update(M)
    return M


# --------------------------------------------------------------------------- #
# Primitive helpers (Three.js meters)
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


def guardrail(name, p0, p1, mat_post, mat_rail, *, height=1.1, mid=0.6, post_gap=2.5, post_t=0.06, rail_t=0.04, lod="LOD0"):
    a, b = Vector(p0), Vector(p1)
    length = (b - a).length
    n = max(1, int(round(length / post_gap)))
    for i in range(n + 1):
        p = a.lerp(b, i / n)
        bar(f"{name}_post_{i}", (p.x, p.y, p.z), (p.x, p.y + height, p.z), post_t, mat_post, lod=lod)
    for k, h in enumerate((height, mid)):
        bar(f"{name}_rail_{k}", (a.x, a.y + h, a.z), (b.x, b.y + h, b.z), rail_t, mat_rail, lod=lod)


def collect(objs: list, parent, collection: str):
    for obj in objs:
        if obj is not None:
            K.attach(obj, parent, collection)


# --------------------------------------------------------------------------- #
# Ferris wheel — static structure (A-frames, footings, bearings, drive, platform)
# --------------------------------------------------------------------------- #

def build_ferris_static(M):
    hx, hy, hz = HUB
    (px0, py0, pz0), (px1, py1, pz1) = PLATFORM
    # concrete platform on the procedural collider (top 0.35) with a kerb and expansion joints
    box_span("fw_platform", px0, px1, 0.0, 0.35, pz0, pz1, M["concrete"], bevel=0.02)
    for x in (px0 + 3.5, px0 + 7.0, px0 + 10.5):
        box_span(f"fw_joint_{x}", x - 0.015, x + 0.015, 0.35, 0.355, pz0, pz1, M["steel_black"], tags={"castShadow": False})
    # queue rail around the north edge of the platform (leaves lanes free)
    guardrail("fw_queue", (px0 + 0.3, 0.35, pz0 + 0.3), (px1 - 0.3, 0.35, pz0 + 0.3), M["steel_black"], M["steel_black"], height=0.9, mid=0.45, post_gap=2.0)
    # A-frames: two frames at hz +- 2.2, legs from the footings to the bearing housings
    leg_base_dx, leg_top_dx = 3.0, 0.9
    for side_z in (-2.2, 2.2):
        z = hz + side_z
        for side_x in (-1, 1):
            x0 = hx + side_x * leg_base_dx
            x1 = hx + side_x * leg_top_dx
            # I-section leg: web + two flanges (navy weathered steel)
            bar(f"fw_leg_web_{side_z}_{side_x}", (x0, 0.85, z), (x1, hy - 0.35, z), 0.3, M["navy"], w=0.06)
            for dz in (-0.17, 0.17):
                bar(f"fw_leg_flange_{side_z}_{side_x}_{dz}", (x0, 0.85, z + dz), (x1, hy - 0.35, z + dz), 0.32, M["navy"], w=0.05)
            # concrete footing + base plate + anchor bolts
            box_span(f"fw_footing_{side_z}_{side_x}", x0 - 0.7, x0 + 0.7, 0.35, 0.8, z - 0.45, z + 0.45, M["concrete"], bevel=0.02)
            box_span(f"fw_baseplate_{side_z}_{side_x}", x0 - 0.45, x0 + 0.45, 0.8, 0.86, z - 0.4, z + 0.4, M["galv"])
            for (bx, bz) in ((-0.32, -0.28), (0.32, -0.28), (-0.32, 0.28), (0.32, 0.28)):
                K.cylinder(f"fw_bolt_{side_z}_{side_x}_{bx}_{bz}", 0.035, 0.09, (x0 + bx, 0.9, z + bz), M["rust"], segments=6)
        # low tie beam between the two legs of one frame + diagonal knee braces
        y_tie = 2.6
        t = (y_tie - 0.85) / (hy - 0.35 - 0.85)
        xa = hx - leg_base_dx + t * (leg_base_dx - leg_top_dx)
        xb = hx + leg_base_dx - t * (leg_base_dx - leg_top_dx)
        bar(f"fw_tie_{side_z}", (xa, y_tie, z), (xb, y_tie, z), 0.22, M["navy"], w=0.14)
        for xx in (xa + 0.6, xb - 0.6):
            bar(f"fw_knee_{side_z}_{xx}", (xx, y_tie, z), (hx + (1 if xx > hx else -1) * (leg_base_dx * 0.55), 0.85, z), 0.08, M["navy"])
        # bearing housing on the apex: pedestal + split housing + cap bolts
        box_span(f"fw_pedestal_{side_z}", hx - 0.7, hx + 0.7, hy - 0.42, hy - 0.05, z - 0.28, z + 0.28, M["navy"], bevel=0.02)
        K.cylinder(f"fw_bearing_{side_z}", 0.62, 0.5, (hx, hy, z), M["steel_black"], segments=16, axis="z")
        box_span(f"fw_bearing_cap_{side_z}", hx - 0.5, hx + 0.5, hy + 0.3, hy + 0.62, z - 0.26, z + 0.26, M["steel_black"], bevel=0.02)
        for (bx, bz) in ((-0.36, -0.15), (0.36, -0.15), (-0.36, 0.15), (0.36, 0.15)):
            K.cylinder(f"fw_bearing_bolt_{side_z}_{bx}_{bz}", 0.04, 0.08, (hx + bx, hy + 0.66, z + bz), M["rust"], segments=6)
    # axle (static, rust-red) through both bearings; the hub sleeve rotates around it
    K.cylinder("fw_axle", 0.34, 5.6, (hx, hy, hz), M["rust_red"], segments=16, axis="z")
    for side_z in (-2.85, 2.85):
        K.cylinder(f"fw_axle_end_{side_z}", 0.4, 0.18, (hx, hy, hz + side_z), M["steel_black"], segments=16, axis="z")
    # longitudinal beams tying the two A-frames at the apex
    for dx in (-0.55, 0.55):
        bar(f"fw_apex_beam_{dx}", (hx + dx, hy - 0.3, hz - 2.2), (hx + dx, hy - 0.3, hz + 2.2), 0.16, M["navy"], w=0.12)
    build_hub_platform(M)


def build_hub_platform(M):
    """Maintenance platform between the rims, drive train on its west end, ladder + landing outside the wheel."""
    hx, hy, hz = HUB
    top = DECK_Y + 0.12
    # main platform inside the spoke planes (z +- 1.66) with grating deck
    box_span("fw_deck", hx - 2.6, hx + 2.6, DECK_Y, top, hz - 1.66, hz + 1.66, M["galv"], tags={"castShadow": False})
    K.collider("hub_deck", (hx - 2.6, DECK_Y, hz - 1.66), (hx + 2.6, top, hz + 1.66))
    for z in (hz - 1.66, hz + 1.66):
        bar(f"fw_deck_edge_{z}", (hx - 2.6, DECK_Y - 0.08, z), (hx + 2.6, DECK_Y - 0.08, z), 0.16, M["navy"], w=0.08)
    # support brackets from the legs (outside the rims) to the deck edge, and hangers
    for side_z in (-1, 1):
        for dx in (-1.1, 1.1):
            bar(f"fw_deck_bracket_{side_z}_{dx}", (hx + dx, DECK_Y - 0.1, hz + side_z * 2.2), (hx + dx, DECK_Y - 0.1, hz + side_z * 1.66), 0.14, M["navy"])
            bar(f"fw_deck_brace_{side_z}_{dx}", (hx + dx * 1.3, DECK_Y - 1.4, hz + side_z * 2.2), (hx + dx, DECK_Y - 0.12, hz + side_z * 1.7), 0.07, M["navy"])
    # guard rails on the long edges (short edges are the wheel plane, left open with a chain)
    for z in (hz - 1.66, hz + 1.66):
        guardrail(f"fw_deck_rail_{z}", (hx - 2.6, top, z), (hx + 2.6, top, z), M["galv"], M["galv"], height=1.0, mid=0.5, post_gap=1.3, post_t=0.04, rail_t=0.03)
    K.collider("hub_deck_rail_n", (hx - 2.6, top, hz - 1.7), (hx + 2.6, top + 1.05, hz - 1.62))
    K.collider("hub_deck_rail_s", (hx - 2.6, top, hz + 1.62), (hx + 2.6, top + 1.05, hz + 1.7))
    # drive train on the west end: motor, coupling, gearbox, brake, pinion + guard cage
    mx = hx - 1.9
    K.cylinder("fw_motor", 0.32, 0.9, (mx, top + 0.42, hz - 0.5), M["machine"], segments=14, axis="x")
    for i in range(6):
        K.cylinder(f"fw_motor_fin_{i}", 0.35, 0.03, (mx - 0.35 + i * 0.14, top + 0.42, hz - 0.5), M["machine"], segments=14, axis="x")
    box_span("fw_motor_base", mx - 0.5, mx + 0.5, top, top + 0.1, hz - 0.85, hz - 0.15, M["steel_black"])
    K.cylinder("fw_motor_box", 0.14, 0.25, (mx - 0.1, top + 0.8, hz - 0.5), M["steel_black"], segments=8)
    K.cylinder("fw_coupling", 0.12, 0.3, (mx + 0.6, top + 0.42, hz - 0.5), M["rust_red"], segments=10, axis="x")
    box_span("fw_gearbox", mx + 0.75, mx + 1.35, top + 0.05, top + 0.85, hz - 0.85, hz - 0.15, M["rust_red"], bevel=0.02)
    for i in range(5):
        box_span(f"fw_gearbox_rib_{i}", mx + 0.78, mx + 1.32, top + 0.15 + i * 0.14, top + 0.17 + i * 0.14, hz - 0.87, hz - 0.13, M["rust_red"])
    K.cylinder("fw_brake_housing", 0.28, 0.28, (mx + 1.05, top + 0.45, hz + 0.35), M["steel_black"], segments=14, axis="z")
    K.cylinder("fw_brake_disc", 0.42, 0.05, (mx + 1.05, top + 0.45, hz + 0.55), M["galv"], segments=16, axis="z")
    # output shaft up to the drive pinion that meshes with the hub ring gear
    tube("fw_drive_shaft", (mx + 1.05, top + 0.85, hz - 0.5), (hx - 0.9, hy - 0.95, hz - 0.5), 0.05, M["steel_black"], segments=8)
    K.cylinder("fw_pinion", 0.28, 0.14, (hx - 0.86, hy - 0.9, hz - 0.5), M["steel_black"], segments=16, axis="z")
    # guard cage over the drive (mesh cage: thin bars)
    for x in (mx - 0.6, mx + 1.4):
        for z in (hz - 0.95, hz - 0.05):
            bar(f"fw_guard_post_{x}_{z}", (x, top, z), (x, top + 1.1, z), 0.03, M["galv"])
    for y in (top + 0.55, top + 1.1):
        bar(f"fw_guard_rail_a_{y}", (mx - 0.6, y, hz - 0.95), (mx + 1.4, y, hz - 0.95), 0.03, M["galv"])
        bar(f"fw_guard_rail_b_{y}", (mx - 0.6, y, hz - 0.05), (mx + 1.4, y, hz - 0.05), 0.03, M["galv"])
        bar(f"fw_guard_rail_c_{y}", (mx - 0.6, y, hz - 0.95), (mx - 0.6, y, hz - 0.05), 0.03, M["galv"])
    K.collider("hub_drive", (mx - 0.6, top, hz - 0.95), (mx + 1.4, top + 1.1, hz - 0.05))
    # control cabinet + cable conduit down the north-west leg to the platform
    box_span("fw_cabinet", hx - 2.2, hx - 1.5, 0.35, 1.55, hz - 3.15, hz - 2.7, M["machine"], bevel=0.02)
    K.collider("control_cabinet", (hx - 2.2, 0.35, hz - 3.15), (hx - 1.5, 1.55, hz - 2.7))
    tube("fw_conduit_0", (hx - 1.85, 1.55, hz - 2.9), (hx - 1.85, top + 0.3, hz - 2.9), 0.03, M["steel_black"], segments=6)
    tube("fw_conduit_1", (hx - 1.85, top + 0.3, hz - 2.9), (mx, top + 0.3, hz - 1.0), 0.03, M["steel_black"], segments=6)
    # landing outside the north spoke plane + vertical caged ladder from the platform.
    # 1.0 m wide so it clears the (oversized) A-frame leg AABBs at x -10.56 / -9.44.
    lz0, lz1 = hz - 3.0, hz - 1.9
    lw = 0.5
    box_span("fw_landing", hx - lw, hx + lw, DECK_Y, top, lz0, lz1, M["galv"], tags={"castShadow": False})
    K.collider("hub_landing", (hx - lw, DECK_Y, lz0), (hx + lw, top, lz1))
    guardrail("fw_landing_rail_w", (hx - lw + 0.03, top, lz0), (hx - lw + 0.03, top, lz1), M["galv"], M["galv"], height=1.0, mid=0.5, post_gap=1.2, post_t=0.04, rail_t=0.03)
    guardrail("fw_landing_rail_e", (hx + lw - 0.03, top, lz0), (hx + lw - 0.03, top, lz1), M["galv"], M["galv"], height=1.0, mid=0.5, post_gap=1.2, post_t=0.04, rail_t=0.03)
    K.collider("hub_landing_rail_w", (hx - lw, top, lz0), (hx - lw + 0.06, top + 1.05, lz1))
    K.collider("hub_landing_rail_e", (hx + lw - 0.06, top, lz0), (hx + lw, top + 1.05, lz1))
    lad_z = lz0 - 0.16
    for i in range(int((DECK_Y - 0.6) / 0.3) + 1):
        y = 0.6 + i * 0.3
        if y > DECK_Y - 0.05:
            break
        tube(f"fw_rung_{i}", (hx - 0.25, y, lad_z), (hx + 0.25, y, lad_z), 0.016, M["galv"], segments=6)
    for dx in (-0.28, 0.28):
        bar(f"fw_ladder_rail_{dx}", (hx + dx, 0.35, lad_z), (hx + dx, top + 1.0, lad_z), 0.04, M["galv"])
    for k in range(3):
        y = 3.2 + k * 2.6
        for (a, b) in (((hx - 0.28, lad_z), (hx - 0.28, lad_z - 0.6)), ((hx - 0.28, lad_z - 0.6), (hx + 0.28, lad_z - 0.6)), ((hx + 0.28, lad_z - 0.6), (hx + 0.28, lad_z))):
            bar(f"fw_hoop_{k}_{a}", (a[0], y, a[1]), (b[0], y, b[1]), 0.03, M["galv"])
    K.collider("hub_ladder", (hx - 0.3, 0.35, lad_z - 0.15), (hx + 0.3, top + 0.1, lad_z + 0.15), ladder="-z")


# --------------------------------------------------------------------------- #
# Ferris wheel — dynamic wheel and cabins
# --------------------------------------------------------------------------- #

def build_ferris_dynamic(M):
    hx, hy, hz = HUB
    root = K.rig("WHEEL_ROOT", HUB, collection="FERRIS_DYNAMIC", tags={"dynamicWeaponRaycast": True, "ferrisRole": "wheel"})
    parts = []
    # hub sleeve on the axle, flanges where the spokes attach, ring gear for the pinion
    parts.append(K.cylinder("fw_hub", 0.55, 4.4, HUB, M["rust_red"], segments=20, axis="z"))
    for zf in (-RIM_Z, RIM_Z):
        parts.append(K.cylinder(f"fw_hub_flange_{zf}", 0.95, 0.14, (hx, hy, hz + zf), M["rust_red"], segments=24, axis="z"))
        parts.append(K.torus(f"fw_hub_ring_{zf}", (hx, hy, hz + zf), 0.98, 0.05, M["steel_black"], segments=24, profile=5))
    parts.append(K.cylinder("fw_ring_gear", 1.12, 0.12, (hx, hy, hz - 0.5), M["steel_black"], segments=32, axis="z"))
    # two rims + inner truss ring per side, cross bracing between the rims
    for zf in (-RIM_Z, RIM_Z):
        parts.append(K.torus(f"fw_rim_{zf}", (hx, hy, hz + zf), RING_R, 0.13, M["navy"], segments=64, profile=7))
        parts.append(K.torus(f"fw_rim_inner_{zf}", (hx, hy, hz + zf), RING_R - 0.7, 0.06, M["navy"], segments=64, profile=5))
        for i in range(32):
            a = math.tau * i / 32
            b = math.tau * (i + 0.5) / 32
            parts.append(bar(f"fw_truss_{zf}_{i}", (hx + math.cos(a) * (RING_R - 0.7), hy + math.sin(a) * (RING_R - 0.7), hz + zf),
                             (hx + math.cos(b) * RING_R, hy + math.sin(b) * RING_R, hz + zf), 0.04, M["navy"]))
            parts.append(bar(f"fw_truss2_{zf}_{i}", (hx + math.cos(b) * RING_R, hy + math.sin(b) * RING_R, hz + zf),
                             (hx + math.cos(math.tau * (i + 1) / 32) * (RING_R - 0.7), hy + math.sin(math.tau * (i + 1) / 32) * (RING_R - 0.7), hz + zf), 0.04, M["navy"]))
    # spokes: 16 per side from the hub flange to the inner truss ring (tensioned rods)
    for zf in (-RIM_Z, RIM_Z):
        for i in range(16):
            a = math.tau * i / 16 + math.tau / 32
            parts.append(bar(f"fw_spoke_{zf}_{i}", (hx + math.cos(a) * 0.95, hy + math.sin(a) * 0.95, hz + zf),
                             (hx + math.cos(a) * (RING_R - 0.72), hy + math.sin(a) * (RING_R - 0.72), hz + zf), 0.05, M["galv"]))
    # rim cross-bracing (zig-zag between the two rims) + hanger crossbars at the mounts
    for i in range(32):
        a = math.tau * i / 32
        b = math.tau * (i + 1) / 32
        za, zb = (-RIM_Z, RIM_Z) if i % 2 == 0 else (RIM_Z, -RIM_Z)
        parts.append(bar(f"fw_xbrace_{i}", (hx + math.cos(a) * RING_R, hy + math.sin(a) * RING_R, hz + za),
                         (hx + math.cos(b) * RING_R, hy + math.sin(b) * RING_R, hz + zb), 0.04, M["navy"]))
    # perimeter bulbs: 36 per rim on the outside face
    for zf in (-RIM_Z - 0.15, RIM_Z + 0.15):
        for i in range(36):
            a = math.tau * i / 36
            parts.append(K.cylinder(f"fw_bulb_{zf}_{i}", 0.06, 0.12, (hx + math.cos(a) * RING_R, hy + math.sin(a) * RING_R, hz + zf), M["bulb"], segments=6, radius_top=0.035, axis="z",
                                    tags={"castShadow": False, "ambientMotion": "lamp-flicker"}))
    # cabin hangers rotate exactly with the wheel, so they live in the root's batches:
    # crossbar between the rims at the mount angle + two yoke arms down to the side pivots
    colors = ["cab_teal", "cab_brick", "cab_mustard", "cab_coral", "cab_navy", "cab_teal", "cab_brick", "cab_mustard"]
    for i in range(N_CABINS):
        a = math.tau * i / N_CABINS
        cx = hx + math.cos(a) * MOUNT_R
        cy = hy + math.sin(a) * MOUNT_R
        rx, ry = hx + math.cos(a) * RING_R, hy + math.sin(a) * RING_R
        parts.append(bar(f"fw_yoke_bar_{i}", (rx, ry, hz - RIM_Z), (rx, ry, hz + RIM_Z), 0.1, M["navy"]))
        for sz in (-1, 1):
            parts.append(bar(f"fw_yoke_arm_{i}_{sz}", (rx, ry, hz + sz * RIM_Z), (cx, cy, hz + sz * (CAB_D / 2 + 0.12)), 0.08, M["navy"], w=0.14))
            parts.append(K.cylinder(f"fw_yoke_pin_{i}_{sz}", 0.09, 0.14, (cx, cy, hz + sz * (CAB_D / 2 + 0.07)), M["navy"], segments=10, axis="z"))
    collect(parts, root, "FERRIS_DYNAMIC")

    # cabins: mount (rotates with wheel, carries the pivot) -> pivot (counter-rotated) -> cabin body
    for i in range(N_CABINS):
        a = math.tau * i / N_CABINS
        cx = hx + math.cos(a) * MOUNT_R
        cy = hy + math.sin(a) * MOUNT_R
        mount = K.rig(f"MOUNT_{i}", (cx, cy, hz), parent=root, collection="CABINS_DYNAMIC", tags={"ferrisRole": "mount", "cabinIndex": i})
        pivot = K.rig(f"CABIN_{i}", (cx, cy, hz), parent=mount, collection="CABINS_DYNAMIC",
                      tags={"ferrisRole": "cabin", "cabinIndex": i, "counterRotate": True})
        collect(build_cabin(M, i, (cx, cy, hz), M[colors[i]]), pivot, "CABINS_DYNAMIC")


def build_cabin(M, index, center, panel):
    """Modular gondola: steel frame, lower panels, glazing, small roof, open front doorway, bench."""
    cx, cy, cz = center
    hw, hh, hd = CAB_W / 2, CAB_H / 2, CAB_D / 2
    parts = []
    tag = f"cab{index}"
    # floor + skirt (thick floor, matches the collider slab)
    parts.append(box_span(f"{tag}_floor", cx - hw, cx + hw, cy - hh - 0.05, cy - hh + 0.15, cz - hd, cz + hd, M["steel_black"], bevel=0.01))
    parts.append(box_span(f"{tag}_floor_deck", cx - hw + 0.08, cx + hw - 0.08, cy - hh + 0.15, cy - hh + 0.18, cz - hd + 0.08, cz + hd - 0.08, M["timber"]))
    # corner posts + top/bottom rails
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(box_span(f"{tag}_post_{sx}_{sz}", cx + sx * hw - (0.06 if sx > 0 else 0), cx + sx * hw + (0.06 if sx < 0 else 0),
                                  cy - hh + 0.15, cy + hh - 0.05, cz + sz * hd - (0.06 if sz > 0 else 0), cz + sz * hd + (0.06 if sz < 0 else 0), M["steel_black"]))
    for y0, y1 in ((cy - hh + 0.15, cy - hh + 0.2), (cy - 0.15, cy - 0.1), (cy + hh - 0.1, cy + hh - 0.05)):
        parts.append(box_span(f"{tag}_rail_b_{y0}", cx - hw, cx + hw, y0, y1, cz - hd, cz - hd + 0.05, M["steel_black"]))
        for sx in (-1, 1):
            parts.append(box_span(f"{tag}_rail_s_{sx}_{y0}", cx + sx * hw - (0.05 if sx > 0 else 0), cx + sx * hw + (0.05 if sx < 0 else 0), y0, y1, cz - hd, cz + hd, M["steel_black"]))
    # lower panels (coloured) on back + sides, upper glazing with a mullion
    parts.append(box_span(f"{tag}_panel_b", cx - hw + 0.06, cx + hw - 0.06, cy - hh + 0.2, cy - 0.15, cz - hd + 0.01, cz - hd + 0.04, panel, bevel=0.01))
    parts.append(K.plane(f"{tag}_glass_b", (CAB_W - 0.12, hh - 0.0), (cx, cy + hh / 2 - 0.05, cz - hd + 0.025), M["glass"], normal="z"))
    parts.append(box_span(f"{tag}_mullion_b", cx - 0.02, cx + 0.02, cy - 0.1, cy + hh - 0.1, cz - hd + 0.01, cz - hd + 0.04, M["steel_black"]))
    for sx in (-1, 1):
        x_in = cx + sx * (hw - 0.025)
        parts.append(box_span(f"{tag}_panel_s_{sx}", x_in - 0.015, x_in + 0.015, cy - hh + 0.2, cy - 0.15, cz - hd + 0.06, cz + hd - 0.06, panel, bevel=0.01))
        parts.append(K.plane(f"{tag}_glass_s_{sx}", (CAB_D - 0.12, hh), (x_in, cy + hh / 2 - 0.05, cz), M["glass"], normal="x"))
        parts.append(box_span(f"{tag}_mullion_s_{sx}", x_in - 0.02, x_in + 0.02, cy - 0.1, cy + hh - 0.1, cz - 0.02, cz + 0.02, M["steel_black"]))
    # front: open doorway (gameplay entry) framed by a low half-gate swung open against the side
    parts.append(box_span(f"{tag}_front_sill", cx - hw, cx + hw, cy - hh + 0.15, cy - hh + 0.22, cz + hd - 0.05, cz + hd, M["steel_black"]))
    parts.append(box_span(f"{tag}_front_head", cx - hw, cx + hw, cy + hh - 0.1, cy + hh - 0.05, cz + hd - 0.05, cz + hd, M["steel_black"]))
    parts.append(box_span(f"{tag}_gate", cx + hw - 0.1, cx + hw - 0.07, cy - hh + 0.25, cy - 0.2, cz - hd + 0.4, cz + hd - 0.1, panel))
    # roof: shallow pitched cap with a light and drip edge
    parts.append(box_span(f"{tag}_roof", cx - hw - 0.08, cx + hw + 0.08, cy + hh - 0.05, cy + hh + 0.06, cz - hd - 0.08, cz + hd + 0.08, M["steel_black"], bevel=0.02))
    parts.append(K.mesh(f"{tag}_roof_cap", [(cx - hw - 0.04, cy + hh + 0.06, cz - hd - 0.04), (cx + hw + 0.04, cy + hh + 0.06, cz - hd - 0.04),
                                            (cx + hw + 0.04, cy + hh + 0.06, cz + hd + 0.04), (cx - hw - 0.04, cy + hh + 0.06, cz + hd + 0.04),
                                            (cx - hw * 0.5, cy + hh + 0.22, cz), (cx + hw * 0.5, cy + hh + 0.22, cz)],
                        [(0, 1, 5, 4), (1, 2, 5), (2, 3, 4, 5), (3, 0, 4)], panel, force_recalc=True))
    parts.append(K.box(f"{tag}_light", (0.16, 0.08, 0.16), (cx, cy + hh - 0.14, cz), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"}))
    # pivot bosses on the sides at mid-height, grab rail + bench inside
    for sx in (-1, 1):
        parts.append(K.cylinder(f"{tag}_boss_{sx}", 0.12, 0.08, (cx + sx * (hw + 0.04), cy, cz), M["steel_black"], segments=12, axis="x"))
    parts.append(bar(f"{tag}_grab", (cx - hw + 0.1, cy - 0.05, cz - hd + 0.09), (cx + hw - 0.1, cy - 0.05, cz - hd + 0.09), 0.03, M["steel_black"]))
    parts.append(box_span(f"{tag}_bench", cx - hw + 0.12, cx + hw - 0.12, cy - hh + 0.5, cy - hh + 0.56, cz - hd + 0.1, cz - hd + 0.5, M["timber"]))
    parts.append(box_span(f"{tag}_bench_leg", cx - hw + 0.14, cx + hw - 0.14, cy - hh + 0.18, cy - hh + 0.5, cz - hd + 0.12, cz - hd + 0.16, M["steel_black"]))
    return parts


# --------------------------------------------------------------------------- #
# Working pier
# --------------------------------------------------------------------------- #

def build_pier(M):
    x0, x1 = -20.0, 32.0
    deck_x1 = 51.0   # the legacy deck is one 72 m slab, so the timber replaces it end to end
    # timber boardwalk (planks 0.12..0.18 on joists) replacing the carved legacy deck
    for k, z in enumerate(range(34, 42)):
        box_span(f"pier_plank_{k}", x0, deck_x1, 0.12, BOARDWALK_TOP, z + 0.03, z + 0.97, M["deck"])
        box_span(f"pier_joist_{k}", x0, deck_x1, 0.02, 0.12, z + 0.45, z + 0.55, M["steel_black"])
    # heavy kerb timber on the pier edge (collider 0..0.5) with steel edge plate
    box_span("pier_kerb", x0, deck_x1, BOARDWALK_TOP, 0.5, KERB_Z[0], KERB_Z[1], M["deck"], bevel=0.02)
    box_span("pier_kerb_plate", x0, deck_x1, 0.44, 0.5, KERB_Z[1] - 0.06, KERB_Z[1] + 0.01, M["galv"])
    # concrete promenade z 42.2..46.55 : thin worn slab with drainage channel and wet patches
    box_span("prom_slab", -22.0, x1, 0.0, 0.06, KERB_Z[1], SEAWALL[0][2], M["concrete"], tags={"castShadow": False})
    for k, x in enumerate(range(-20, 32, 4)):
        box_span(f"prom_joint_{k}", x - 0.01, x + 0.01, 0.06, 0.062, KERB_Z[1], SEAWALL[0][2], M["steel_black"], tags={"castShadow": False})
    box_span("prom_drain", -21.5, x1, 0.06, 0.07, 44.3, 44.6, M["steel_black"], tags={"castShadow": False})
    for k, x in enumerate((-14.0, 2.0, 18.0)):
        box_span(f"prom_grate_{k}", x - 0.45, x + 0.45, 0.06, 0.075, 44.2, 44.7, M["galv"], tags={"castShadow": False})
    for k, (x, z, w, d) in enumerate(((-9.0, 45.4, 3.2, 1.2), (6.5, 43.6, 4.0, 1.4), (24.0, 45.0, 2.6, 1.0))):
        K.plane(f"prom_wet_{k}", (w, d), (x, 0.068, z), M["water_wet"], tags={"castShadow": False, "ambientMotion": "pond-ripple", "weaponImpactKind": "water"})
    # seawall: the legacy parapet (collider 0..0.9) and its steel rail + posts at z 47
    # stay (they run the whole island); this pass adds a concrete capping, mooring
    # hardware on the seaward edge of the cap, piles/fenders on the water face.
    sz0, sz1 = SEAWALL[0][2], SEAWALL[1][2]
    box_span("seawall_cap", -22.0, x1, 0.9, 0.96, sz0 - 0.05, sz1 + 0.05, M["concrete"], bevel=0.02)
    # facing panels over the legacy parapet inside the district: that mesh is one
    # island-wide box whose UVs streak at promenade range, and carving it would drop
    # the parapet everywhere. The panels sit 5 mm off the wall (no coplanar faces),
    # under the cap overhang, from the promenade slab / below the waterline to the cap.
    box_span("seawall_face_land", -22.0, x1, 0.06, 0.9, sz0 - 0.04, sz0 - 0.005, M["concrete"], bevel=0.01)
    box_span("seawall_face_sea", -22.0, x1, WATER_Y - 0.45, 0.9, sz1 + 0.005, sz1 + 0.04, M["concrete"], bevel=0.01)
    # pier piles at the water face, rubber tire fenders between them
    for k, x in enumerate(range(-20, 33, 4)):
        K.cylinder(f"pile_{k}", 0.22, 3.0, (x, 0.3, sz1 + 0.25), M["deck"], segments=10, tags={"instanceKey": "fh-pile"})
        K.cylinder(f"pile_cap_{k}", 0.25, 0.08, (x, 1.82, sz1 + 0.25), M["steel_black"], segments=10, tags={"instanceKey": "fh-pile-cap"})
    for k, x in enumerate(range(-18, 33, 4)):
        K.torus(f"fender_{k}", (x, 0.15, sz1 + 0.32), 0.42, 0.14, M["rubber"], segments=16, profile=6, axis="z", tags={"instanceKey": "fh-fender"})
        tube(f"fender_chain_{k}", (x, 0.55, sz1 + 0.25), (x, 0.95, sz1 - 0.1), 0.02, M["steel_black"], segments=5)
    # mooring cleats + bitts on the seaward edge of the cap (clear of the rail at z 47)
    cz = 47.28
    for k, x in enumerate((-15.0, -8.0, 0.0, 9.0, 16.0, 25.0)):
        box_span(f"cleat_base_{k}", x - 0.25, x + 0.25, 0.96, 1.02, cz - 0.16, cz + 0.16, M["steel_black"], tags={"instanceKey": "fh-cleat"})
        bar(f"cleat_horn_{k}", (x - 0.32, 1.12, cz), (x + 0.32, 1.12, cz), 0.1, M["steel_black"], tags={"instanceKey": "fh-cleat-horn"})
        box_span(f"cleat_stem_{k}", x - 0.08, x + 0.08, 1.02, 1.12, cz - 0.08, cz + 0.08, M["steel_black"])
        K.rig(f"SOCKET_MOOR_DOCK_{k}", (x, 1.15, cz), collection="SOCKETS", tags={"socketRole": "mooring-dock"})
    for k, x in enumerate((-20.0, -4.5, 11.5, 26.5)):
        K.cylinder(f"bollard_{k}", 0.15, 0.55, (x, 1.235, cz), M["steel_black"], segments=12, radius_top=0.13, tags={"instanceKey": "fh-bollard"})
        K.cylinder(f"bollard_cap_{k}", 0.16, 0.1, (x, 1.56, cz), M["steel_black"], segments=12, radius_top=0.08, tags={"instanceKey": "fh-bollard-cap"})
        K.collider(f"bollard_{k}", (x - 0.16, 0.96, cz - 0.16), (x + 0.16, 1.62, cz + 0.16))
    # safety ladders down the wall into the water (hooks pass between the two legacy rails)
    for k, x in enumerate((-8.0, 20.0)):
        for i in range(9):
            tube(f"sladder_rung_{k}_{i}", (x - 0.22, -1.2 + i * 0.3, sz1 + 0.12), (x + 0.22, -1.2 + i * 0.3, sz1 + 0.12), 0.016, M["galv"], segments=6)
        for dx in (-0.25, 0.25):
            bar(f"sladder_rail_{k}_{dx}", (x + dx, -1.4, sz1 + 0.12), (x + dx, 1.3, sz1 + 0.12), 0.035, M["galv"])
            bar(f"sladder_hook_{k}_{dx}", (x + dx, 1.3, sz1 + 0.12), (x + dx, 1.3, sz1 - 0.3), 0.035, M["galv"])
        # life ring on a post at the land side of the promenade so it never fights the rail
        px = x + 1.6
        bar(f"lifering_post_{k}", (px, 0.06, 42.9), (px, 2.2, 42.9), 0.06, M["steel_black"])
        K.torus(f"lifering_{k}", (px, 1.95, 42.83), 0.3, 0.06, M["orange"], segments=16, profile=6, axis="z")
        box_span(f"lifering_sign_{k}", px - 0.2, px + 0.2, 2.2, 2.5, 42.88, 42.92, M["white"])
        K.collider(f"lifering_post_{k}", (px - 0.06, 0.06, 42.84), (px + 0.06, 2.5, 42.96))
    # bollard-and-rope chain along the land side of the promenade (pier kerb)
    for k, x in enumerate(range(-19, 33, 3)):
        K.cylinder(f"kerb_bollard_{k}", 0.09, 0.55, (x, 0.5 + 0.275, 42.0), M["steel_black"], segments=8, tags={"instanceKey": "fh-kerb-bollard"})
        K.cylinder(f"kerb_bollard_cap_{k}", 0.1, 0.05, (x, 1.075, 42.0), M["brass"], segments=8, tags={"instanceKey": "fh-kerb-bollard-cap"})
    for k, x in enumerate(range(-19, 30, 3)):
        # slack rope between kerb bollards (three straight segments approximating the sag)
        pts = [(x, 1.0, 42.0), (x + 1.0, 0.86, 42.0), (x + 2.0, 0.86, 42.0), (x + 3.0, 1.0, 42.0)]
        for s in range(3):
            tube(f"kerb_rope_{k}_{s}", pts[s], pts[s + 1], 0.018, M["rope"], segments=5, tags={"castShadow": False})
    # harbor lamps on the promenade (warm), spaced with the legacy ones at z 31
    for k, x in enumerate((-16.0, -4.0, 8.0, 20.0, 30.0)):
        bar(f"hlamp_post_{k}", (x, 0.06, 42.7), (x, 4.6, 42.7), 0.1, M["steel_black"])
        bar(f"hlamp_arm_{k}", (x, 4.6, 42.7), (x, 4.9, 43.4), 0.05, M["steel_black"])
        K.cylinder(f"hlamp_shade_{k}", 0.3, 0.22, (x, 4.85, 43.45), M["steel_black"], segments=10, radius_top=0.08)
        K.cylinder(f"hlamp_glow_{k}", 0.16, 0.06, (x, 4.74, 43.45), M["lamp"], segments=8, tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
        K.collider(f"harbor_lamp_{k}", (x - 0.06, 0.06, 42.64), (x + 0.06, 4.6, 42.76))
    build_pier_dressing(M)


def build_pier_dressing(M):
    """Market tables, fish crates, nets, reels, kiosk, ticket booth — kept off the movement lanes."""
    # market: four tables with benches and restrained umbrellas on the north half of the boardwalk
    umbrella = ["canvas_red", "canvas_cream", "canvas_green", "canvas_cream"]
    for k, x in enumerate((5.0, 13.0, 21.0, 29.0)):
        z = 36.0
        box_span(f"mkt_table_{k}", x - 0.9, x + 0.9, 0.78, 0.84, z - 0.6, z + 0.6, M["deck"], bevel=0.01)
        for dx in (-0.75, 0.75):
            bar(f"mkt_table_leg_{k}_{dx}", (x + dx, BOARDWALK_TOP, z), (x + dx, 0.78, z), 0.06, M["steel_black"])
            bar(f"mkt_table_foot_{k}_{dx}", (x + dx, BOARDWALK_TOP + 0.02, z - 0.45), (x + dx, BOARDWALK_TOP + 0.02, z + 0.45), 0.04, M["steel_black"])
        for dz in (-1.05, 1.05):
            box_span(f"mkt_bench_{k}_{dz}", x - 0.8, x + 0.8, 0.44, 0.49, z + dz - 0.18, z + dz + 0.18, M["deck"])
            for dx in (-0.65, 0.65):
                bar(f"mkt_bench_leg_{k}_{dz}_{dx}", (x + dx, BOARDWALK_TOP, z + dz), (x + dx, 0.44, z + dz), 0.05, M["steel_black"])
        K.collider(f"market_table_{k}", (x - 0.9, BOARDWALK_TOP, z - 0.6), (x + 0.9, 0.84, z + 0.6))
        K.collider(f"market_bench_n_{k}", (x - 0.8, BOARDWALK_TOP, z - 1.23), (x + 0.8, 0.49, z - 0.87))
        K.collider(f"market_bench_s_{k}", (x - 0.8, BOARDWALK_TOP, z + 0.87), (x + 0.8, 0.49, z + 1.23))
        bar(f"mkt_pole_{k}", (x, 0.84, z), (x, 2.75, z), 0.05, M["steel_black"])
        # umbrella canopy: shallow cone, muted canvas, slight tilt variation
        K.cylinder(f"mkt_umbrella_{k}", 1.35, 0.35, (x, 2.62, z), M[umbrella[k]], segments=10, radius_top=0.05,
                   rot=(0.0, 0.0, 0.05 * (k % 2)), tags={"castShadow": False})
    # fish crates (stacks) + net drying rack near the wheel platform's east edge
    # clutter sits on the middle strip of the boardwalk (z ~38.4), between the market
    # tables and the free lane along the pier edge
    for k, (x, z, n) in enumerate(((-1.0, 38.3, 3), (0.2, 38.3, 2), (14.5, 38.5, 2), (-19.0, 38.4, 3))):
        for i in range(n):
            K.box(f"crate_{k}_{i}", (0.6, 0.3, 0.4), (x, BOARDWALK_TOP + 0.15 + i * 0.3, z), M["crate"], bevel=0.01, rot_y=0.08 * (i % 2), tags={"instanceKey": "fh-fish-crate"})
        K.collider(f"crates_{k}", (x - 0.32, BOARDWALK_TOP, z - 0.22), (x + 0.32, BOARDWALK_TOP + 0.3 * n, z + 0.22))
    nx, nz = 8.5, 38.4
    for x in (nx, nx + 3.0):
        bar(f"net_post_{x}", (x, BOARDWALK_TOP, nz), (x, 2.6, nz), 0.06, M["deck"])
    bar("net_beam", (nx, 2.6, nz), (nx + 3.0, 2.6, nz), 0.05, M["deck"])
    for i in range(7):
        x = nx + 0.25 + i * 0.42
        tube(f"net_line_{i}", (x, 0.5 + 0.1 * (i % 3), nz), (x, 2.6, nz), 0.008, M["rope"], segments=4, tags={"castShadow": False})
    tube("net_line_h0", (nx + 0.2, 1.2, nz), (nx + 2.8, 1.35, nz), 0.008, M["rope"], segments=4, tags={"castShadow": False})
    tube("net_line_h1", (nx + 0.2, 1.9, nz), (nx + 2.8, 1.75, nz), 0.008, M["rope"], segments=4, tags={"castShadow": False})
    # cable reel + rope coils on the boardwalk / promenade
    K.cylinder("reel", 0.55, 0.6, (24.5, BOARDWALK_TOP + 0.55, 38.6), M["deck"], segments=14, axis="x")
    K.cylinder("reel_hub", 0.3, 0.7, (24.5, BOARDWALK_TOP + 0.55, 38.6), M["cable"], segments=12, axis="x")
    K.collider("cable_reel", (24.15, BOARDWALK_TOP, 38.05), (24.85, BOARDWALK_TOP + 1.1, 39.15))
    for k, (x, z) in enumerate(((-12.5, 38.6), (3.0, 38.7), (17.5, 46.2))):
        K.torus(f"rope_coil_{k}", (x, (0.06 if z > 43 else BOARDWALK_TOP) + 0.06, z), 0.28, 0.07, M["rope"], segments=14, profile=5, axis="y", tags={"instanceKey": "fh-rope-coil"})
    # maintenance kiosk east of the wheel platform (small equipment shed)
    kx0, kx1, kz0, kz1 = -2.6, -0.2, 29.6, 32.0
    box_span("kiosk_body", kx0, kx1, 0.0, 2.5, kz0, kz1, M["navy"], bevel=0.02)
    box_span("kiosk_roof", kx0 - 0.15, kx1 + 0.15, 2.5, 2.62, kz0 - 0.15, kz1 + 0.15, M["steel_black"], bevel=0.02)
    box_span("kiosk_door", kx1 - 0.02, kx1 + 0.02, 0.05, 2.1, kz0 + 0.6, kz0 + 1.5, M["galv"])
    box_span("kiosk_sign", kx0 + 0.4, kx1 - 0.4, 1.9, 2.3, kz1, kz1 + 0.03, M["white"])
    K.collider("kiosk", (kx0, 0.0, kz0), (kx1, 2.62, kz1))
    # ticket booth on the cinematic colliders (x -20.9..-16.1, z 29.5..32.9, front counter at z 32.7)
    bx0, bx1, bz0, bz1 = -20.9, -16.1, 29.5, 32.9
    box_span("booth_base", bx0, bx1, 0.0, 0.2, bz0, bz1, M["concrete"])
    box_span("booth_back", bx0, bx1, 0.2, 3.3, bz0, bz0 + 0.2, M["navy"])
    box_span("booth_left", bx0, bx0 + 0.3, 0.2, 3.3, bz0, bz1, M["navy"])
    box_span("booth_right", bx1 - 0.3, bx1, 0.2, 3.3, bz0, bz1, M["navy"])
    box_span("booth_front_l", bx0, -19.5, 0.2, 3.3, bz1 - 0.2, bz1, M["navy"])
    box_span("booth_front_r", -17.5, bx1, 0.2, 3.3, bz1 - 0.2, bz1, M["navy"])
    box_span("booth_counter", -19.5, -17.5, 0.2, 1.1, bz1 - 0.2, bz1 + 0.15, M["deck"], bevel=0.01)
    box_span("booth_header", -19.5, -17.5, 2.7, 3.3, bz1 - 0.2, bz1, M["navy"])
    K.plane("booth_glass", (2.0, 1.55), (-18.5, 1.9, bz1 - 0.1), M["glass_dark"], normal="z")
    box_span("booth_roof", bx0 - 0.2, bx1 + 0.2, 3.3, 3.5, bz0 - 0.2, bz1 + 0.4, M["steel_black"], bevel=0.02)
    box_span("booth_sign", bx0 + 0.2, bx1 - 0.2, 3.55, 4.15, bz1 + 0.1, bz1 + 0.16, M["cab_brick"], bevel=0.01)
    box_span("booth_sign_text", bx0 + 0.5, bx1 - 0.5, 3.75, 3.95, bz1 + 0.16, bz1 + 0.175, M["white"], tags={"castShadow": False})
    for k, x in enumerate((-20.3, -19.0, -17.9, -16.6)):
        K.cylinder(f"booth_bulb_{k}", 0.05, 0.1, (x, 4.25, bz1 + 0.13), M["bulb"], segments=6, radius_top=0.03, tags={"castShadow": False, "ambientMotion": "lamp-flicker"})


# --------------------------------------------------------------------------- #
# Boat fleet (dynamic groups; origin at the waterline centre)
# --------------------------------------------------------------------------- #

def hull_shell(tag, cx, cz, length, beam, depth, mat, *, bow_dir=-1, freeboard=0.55, sheer=0.15, stern_flat=0.6, keel=0.35, lod="LOD0"):
    """Simple V-bow hull: deck outline lofted down to a keel line; returns the mesh object.

    ``bow_dir`` -1 points the bow toward -x. Waterline is y = WATER_Y; the deck edge
    sits at WATER_Y + freeboard (+ sheer at the bow). ``keel`` is the bottom half-beam
    as a fraction of the top one (1.0 for a boot-top band that hugs the side)."""
    n = 9
    top = []
    bottom = []
    for i in range(n + 1):
        t = i / n                      # 0 stern .. 1 bow
        x = cx - bow_dir * (length / 2) + bow_dir * t * length
        # half-beam: full amidships, narrowing to a point at the bow, flat at the stern
        hb = beam / 2 * (1.0 if t < 0.45 else max(0.02, math.cos((t - 0.45) / 0.55 * math.pi / 2) ** 0.75))
        if t < 0.06:
            hb = beam / 2 * stern_flat + (beam / 2) * (1 - stern_flat) * (t / 0.06)
        y_top = WATER_Y + freeboard + sheer * max(0.0, (t - 0.5)) * 2
        y_bot = WATER_Y - depth * (1.0 if t < 0.6 else max(0.25, 1 - (t - 0.6) / 0.4))
        top.append(((x, y_top, cz - hb), (x, y_top, cz + hb)))
        bottom.append(((x, y_bot, cz - hb * keel), (x, y_bot, cz + hb * keel)))
    verts = []
    for i in range(n + 1):
        verts.extend([top[i][0], top[i][1], bottom[i][1], bottom[i][0]])   # 4 per station
    faces = []
    for i in range(n):
        a, b = i * 4, (i + 1) * 4
        faces.append((a + 0, b + 0, b + 3, a + 3))   # port side
        faces.append((a + 1, a + 2, b + 2, b + 1))   # starboard side
        faces.append((a + 3, b + 3, b + 2, a + 2))   # bottom
    faces.append((0, 3, 2, 1))                       # stern transom
    faces.append((n * 4 + 0, n * 4 + 1, n * 4 + 2, n * 4 + 3))  # bow cap
    return K.mesh(f"{tag}_hull", verts, faces, mat, lod=lod, force_recalc=True, smooth=True)


def boat_root(boat_id, center, extra_tags=None):
    tags = {"ambientMotion": f"boat-{boat_id}", "boatMoored": True, "dynamicWeaponRaycast": True}
    if extra_tags:
        tags.update(extra_tags)
    return K.rig(f"BOAT_{boat_id.upper()}", center, collection="BOATS_DYNAMIC", tags=tags)


def build_workboat(M):
    """Hero workboat: navy hull, cream wheelhouse, red/white waterline, moored to the seawall."""
    cx, cz = 7.0, 49.9
    L, B = 10.0, 3.2
    root = boat_root("workboat", (cx, WATER_Y, cz), {"boatLength": L})
    p = []
    p.append(hull_shell("wb", cx, cz, L, B, 0.9, M["hull_navy"], freeboard=0.75, sheer=0.35))
    # white boot-top stripe just above the water and the red antifouling below it
    p.append(hull_shell("wb_stripe", cx, cz, L + 0.02, B + 0.04, -0.2, M["white"], freeboard=0.34, sheer=0.0, keel=1.0))
    p.append(hull_shell("wb_anti", cx, cz, L + 0.03, B + 0.06, 0.92, M["rust_red"], freeboard=0.2, sheer=0.0, keel=0.36))
    deck_y = WATER_Y + 0.72
    p.append(box_span("wb_deck", cx - 4.6, cx + 4.7, deck_y - 0.06, deck_y, cz - 1.45, cz + 1.45, M["deck"]))
    p.append(box_span("wb_bulwark_p", cx - 4.6, cx + 4.7, deck_y, deck_y + 0.35, cz - 1.55, cz - 1.45, M["hull_navy"]))
    p.append(box_span("wb_bulwark_s", cx - 4.6, cx + 4.7, deck_y, deck_y + 0.35, cz + 1.45, cz + 1.55, M["hull_navy"]))
    # wheelhouse forward of amidships (bow toward -x), sloped front windows, roof, door aft
    wx0, wx1 = cx - 3.2, cx - 0.6
    p.append(box_span("wb_house", wx0, wx1, deck_y, deck_y + 2.1, cz - 1.1, cz + 1.1, M["cream"], bevel=0.02))
    p.append(K.mesh("wb_house_slope", [(wx0, deck_y + 1.2, cz - 1.1), (wx0, deck_y + 1.2, cz + 1.1), (wx0 + 0.35, deck_y + 2.1, cz + 1.1), (wx0 + 0.35, deck_y + 2.1, cz - 1.1)],
                    [(0, 1, 2, 3)], M["glass_dark"]))
    for k, z in enumerate((-0.75, -0.25, 0.25, 0.75)):
        p.append(K.plane(f"wb_win_f_{k}", (0.42, 0.6), (wx0 - 0.005, deck_y + 1.55, cz + z), M["glass_dark"], normal="x"))
    for sz in (-1, 1):
        for k, x in enumerate((wx0 + 0.7, wx0 + 1.4, wx0 + 2.1)):
            p.append(K.plane(f"wb_win_s_{sz}_{k}", (0.5, 0.55), (x, deck_y + 1.5, cz + sz * 1.105), M["glass_dark"], normal="z"))
    p.append(box_span("wb_house_roof", wx0 - 0.1, wx1 + 0.1, deck_y + 2.1, deck_y + 2.2, cz - 1.2, cz + 1.2, M["steel_black"], bevel=0.02))
    p.append(box_span("wb_door", wx1 - 0.01, wx1 + 0.02, deck_y + 0.05, deck_y + 1.85, cz + 0.2, cz + 0.9, M["hull_navy"]))
    # mast, radar, nav lights, exhaust, horn
    p.append(bar("wb_mast", (wx0 + 1.2, deck_y + 2.2, cz), (wx0 + 1.2, deck_y + 4.6, cz), 0.08, M["galv"]))
    p.append(bar("wb_mast_yard", (wx0 + 1.2, deck_y + 4.0, cz - 0.7), (wx0 + 1.2, deck_y + 4.0, cz + 0.7), 0.04, M["galv"]))
    p.append(K.cylinder("wb_radar", 0.26, 0.16, (wx0 + 1.2, deck_y + 2.45, cz), M["white"], segments=12))
    p.append(box_span("wb_radar_arm", wx0 + 0.75, wx0 + 1.65, deck_y + 2.6, deck_y + 2.7, cz - 0.06, cz + 0.06, M["white"]))
    p.append(K.box("wb_nav_p", (0.12, 0.12, 0.12), (wx0 + 1.2, deck_y + 4.05, cz - 0.75), M["nav_red"], tags={"castShadow": False}))
    p.append(K.box("wb_nav_s", (0.12, 0.12, 0.12), (wx0 + 1.2, deck_y + 4.05, cz + 0.75), M["nav_green"], tags={"castShadow": False}))
    p.append(K.box("wb_nav_top", (0.12, 0.14, 0.12), (wx0 + 1.2, deck_y + 4.68, cz), M["nav_white"], tags={"castShadow": False}))
    p.append(K.cylinder("wb_exhaust", 0.11, 1.5, (wx1 - 0.35, deck_y + 2.7, cz - 0.6), M["steel_black"], segments=8))
    p.append(K.cylinder("wb_exhaust_cap", 0.14, 0.08, (wx1 - 0.35, deck_y + 3.48, cz - 0.6), M["steel_black"], segments=8))
    # aft working deck: winch, rail, life ring, deck cargo, cleats, tire fenders
    p.append(K.cylinder("wb_winch_drum", 0.32, 0.9, (cx + 1.4, deck_y + 0.45, cz), M["rust_red"], segments=12, axis="z"))
    p.append(box_span("wb_winch_frame", cx + 1.0, cx + 1.8, deck_y, deck_y + 0.5, cz - 0.55, cz - 0.45, M["steel_black"]))
    p.append(box_span("wb_winch_frame2", cx + 1.0, cx + 1.8, deck_y, deck_y + 0.5, cz + 0.45, cz + 0.55, M["steel_black"]))
    p.append(box_span("wb_cargo", cx + 2.6, cx + 3.8, deck_y, deck_y + 0.8, cz - 0.6, cz + 0.6, M["crate"], bevel=0.02))
    for sz in (-1, 1):
        for k in range(4):
            x = cx - 0.4 + k * 1.5
            p.append(bar(f"wb_rail_post_{sz}_{k}", (x, deck_y + 0.35, cz + sz * 1.5), (x, deck_y + 1.15, cz + sz * 1.5), 0.04, M["galv"]))
        p.append(bar(f"wb_rail_{sz}", (cx - 0.4, deck_y + 1.15, cz + sz * 1.5), (cx + 4.1, deck_y + 1.15, cz + sz * 1.5), 0.035, M["galv"]))
        for k, x in enumerate((cx - 2.0, cx + 1.0, cx + 3.5)):
            p.append(K.torus(f"wb_tire_{sz}_{k}", (x, WATER_Y + 0.45, cz + sz * (B / 2 + 0.05)), 0.3, 0.1, M["rubber"], segments=12, profile=5, axis="z"))
            p.append(tube(f"wb_tire_rope_{sz}_{k}", (x, WATER_Y + 0.75, cz + sz * (B / 2 + 0.05)), (x, deck_y + 0.3, cz + sz * 1.5), 0.012, M["rope"], segments=4, tags={"castShadow": False}))
    p.append(K.torus("wb_life_ring", (wx1 + 0.05, deck_y + 1.3, cz + 1.12), 0.28, 0.06, M["orange"], segments=14, profile=5, axis="z"))
    for k, x in enumerate((cx - 4.0, cx + 4.2)):
        p.append(bar(f"wb_cleat_{k}", (x - 0.2, deck_y + 0.42, cz - 1.3), (x + 0.2, deck_y + 0.42, cz - 1.3), 0.07, M["steel_black"]))
    p.append(box_span("wb_bow_cap", cx - 4.85, cx - 4.55, deck_y - 0.05, deck_y + 0.4, cz - 0.25, cz + 0.25, M["steel_black"]))
    p.append(K.cylinder("wb_prop_guard", 0.35, 0.06, (cx + 5.05, WATER_Y - 0.45, cz), M["rust"], segments=12, axis="x"))
    collect(p, root, "BOATS_DYNAMIC")
    # mooring sockets on the boat (bow + stern cleats)
    K.rig("SOCKET_MOOR_WORKBOAT_0_BOAT", (cx - 4.0, deck_y + 0.45, cz - 1.3), parent=root, collection="BOATS_DYNAMIC", tags={"socketRole": "mooring-boat", "dock": "SOCKET_FERRIS_HARBOR_MOOR_DOCK_2"})
    K.rig("SOCKET_MOOR_WORKBOAT_1_BOAT", (cx + 4.2, deck_y + 0.45, cz - 1.3), parent=root, collection="BOATS_DYNAMIC", tags={"socketRole": "mooring-boat", "dock": "SOCKET_FERRIS_HARBOR_MOOR_DOCK_3"})


def build_launch(M):
    """Compact fishing launch: small wheelhouse aft, net crane, crates and buoys on the working deck."""
    cx, cz = -8.0, 49.4
    L, B = 7.0, 2.4
    root = boat_root("launch", (cx, WATER_Y, cz), {"boatLength": L})
    p = []
    p.append(hull_shell("ln", cx, cz, L, B, 0.7, M["hull_navy"], freeboard=0.6, sheer=0.25))
    p.append(hull_shell("ln_stripe", cx, cz, L + 0.02, B + 0.04, -0.14, M["white"], freeboard=0.26, sheer=0.0, keel=1.0))
    p.append(hull_shell("ln_anti", cx, cz, L + 0.03, B + 0.06, 0.72, M["rust_red"], freeboard=0.14, sheer=0.0, keel=0.36))
    deck_y = WATER_Y + 0.57
    p.append(box_span("ln_deck", cx - 3.2, cx + 3.3, deck_y - 0.05, deck_y, cz - 1.05, cz + 1.05, M["deck"]))
    hx0, hx1 = cx + 0.9, cx + 2.6
    p.append(box_span("ln_house", hx0, hx1, deck_y, deck_y + 1.75, cz - 0.85, cz + 0.85, M["cream"], bevel=0.02))
    p.append(box_span("ln_house_roof", hx0 - 0.1, hx1 + 0.1, deck_y + 1.75, deck_y + 1.85, cz - 0.95, cz + 0.95, M["hull_navy"], bevel=0.02))
    for k, z in enumerate((-0.45, 0.0, 0.45)):
        p.append(K.plane(f"ln_win_f_{k}", (0.38, 0.5), (hx0 - 0.005, deck_y + 1.3, cz + z), M["glass_dark"], normal="x"))
    for sz in (-1, 1):
        p.append(K.plane(f"ln_win_s_{sz}", (0.9, 0.5), (hx0 + 0.85, deck_y + 1.3, cz + sz * 0.855), M["glass_dark"], normal="z"))
    p.append(bar("ln_mast", (hx1 - 0.3, deck_y + 1.85, cz), (hx1 - 0.3, deck_y + 3.6, cz), 0.06, M["galv"]))
    p.append(K.box("ln_nav_top", (0.1, 0.12, 0.1), (hx1 - 0.3, deck_y + 3.66, cz), M["nav_white"], tags={"castShadow": False}))
    p.append(K.box("ln_nav_p", (0.1, 0.1, 0.1), (hx0 + 0.2, deck_y + 1.9, cz - 0.9), M["nav_red"], tags={"castShadow": False}))
    p.append(K.box("ln_nav_s", (0.1, 0.1, 0.1), (hx0 + 0.2, deck_y + 1.9, cz + 0.9), M["nav_green"], tags={"castShadow": False}))
    # net crane (A-frame gantry over the fore deck) with block and hook
    gx = cx - 1.4
    for sz in (-1, 1):
        p.append(bar(f"ln_gantry_leg_{sz}", (gx + 0.5, deck_y, cz + sz * 0.9), (gx, deck_y + 2.4, cz + sz * 0.45), 0.07, M["machine"]))
    p.append(bar("ln_gantry_beam", (gx, deck_y + 2.4, cz - 0.5), (gx, deck_y + 2.4, cz + 0.5), 0.07, M["machine"]))
    p.append(bar("ln_gantry_boom", (gx, deck_y + 2.4, cz), (gx - 1.6, deck_y + 2.0, cz), 0.06, M["machine"]))
    p.append(tube("ln_hoist", (gx - 1.6, deck_y + 2.0, cz), (gx - 1.6, deck_y + 0.9, cz), 0.012, M["cable"], segments=4, tags={"castShadow": False}))
    p.append(K.box("ln_hook", (0.12, 0.2, 0.06), (gx - 1.6, deck_y + 0.8, cz), M["steel_black"]))
    for k, (dx, dz) in enumerate(((-2.4, -0.45), (-2.4, 0.3), (-1.8, 0.45))):
        p.append(K.box(f"ln_crate_{k}", (0.55, 0.3, 0.4), (cx + dx, deck_y + 0.15, cz + dz), M["crate"], bevel=0.01, rot_y=0.1 * k))
    for k, dx in enumerate((-0.4, 0.1)):
        p.append(K.cylinder(f"ln_buoy_{k}", 0.22, 0.4, (cx + dx, deck_y + 0.22, cz - 0.7), M["orange"], segments=10, radius_top=0.15))
    p.append(K.cylinder("ln_barrel", 0.28, 0.75, (hx1 + 0.4, deck_y + 0.37, cz + 0.6), M["hull_navy"], segments=12))
    for sz in (-1, 1):
        p.append(bar(f"ln_rail_{sz}", (cx - 3.0, deck_y + 0.75, cz + sz * 1.05), (hx0 - 0.1, deck_y + 0.75, cz + sz * 1.05), 0.03, M["galv"]))
        for k in range(4):
            x = cx - 3.0 + k * 1.25
            p.append(bar(f"ln_rail_post_{sz}_{k}", (x, deck_y, cz + sz * 1.05), (x, deck_y + 0.75, cz + sz * 1.05), 0.03, M["galv"]))
        for k, x in enumerate((cx - 1.5, cx + 1.5)):
            p.append(K.torus(f"ln_tire_{sz}_{k}", (x, WATER_Y + 0.35, cz + sz * (B / 2 + 0.04)), 0.26, 0.09, M["rubber"], segments=12, profile=5, axis="z"))
    p.append(K.torus("ln_life_ring", (hx1 + 0.04, deck_y + 1.1, cz - 0.6), 0.24, 0.05, M["orange"], segments=12, profile=5, axis="x"))
    p.append(bar("ln_cleat_0", (cx - 2.8, deck_y + 0.08, cz - 0.95), (cx - 2.4, deck_y + 0.08, cz - 0.95), 0.06, M["steel_black"]))
    p.append(bar("ln_cleat_1", (cx + 2.9, deck_y + 0.08, cz - 0.95), (cx + 3.2, deck_y + 0.08, cz - 0.95), 0.06, M["steel_black"]))
    collect(p, root, "BOATS_DYNAMIC")
    K.rig("SOCKET_MOOR_LAUNCH_0_BOAT", (cx - 2.6, deck_y + 0.1, cz - 0.95), parent=root, collection="BOATS_DYNAMIC", tags={"socketRole": "mooring-boat", "dock": "SOCKET_FERRIS_HARBOR_MOOR_DOCK_1"})
    K.rig("SOCKET_MOOR_LAUNCH_1_BOAT", (cx + 3.0, deck_y + 0.1, cz - 0.95), parent=root, collection="BOATS_DYNAMIC", tags={"socketRole": "mooring-boat", "dock": "SOCKET_FERRIS_HARBOR_MOOR_DOCK_2"})


def build_skiff(M, boat_id, cx, cz, hull_mat, bow_dir, dock_socket):
    """Timber skiff with benches, gunwales, oars, rope coil and a compact outboard."""
    L, B = 4.2, 1.5
    root = boat_root(boat_id, (cx, WATER_Y, cz), {"boatLength": L})
    p = []
    p.append(hull_shell(boat_id, cx, cz, L, B, 0.45, hull_mat, bow_dir=bow_dir, freeboard=0.42, sheer=0.18, stern_flat=0.75))
    p.append(hull_shell(f"{boat_id}_gunwale", cx, cz, L + 0.04, B + 0.06, 0.02, M["deck"], bow_dir=bow_dir, freeboard=0.46, sheer=0.18, stern_flat=0.75))
    floor_y = WATER_Y + 0.05
    p.append(box_span(f"{boat_id}_floor", cx - L / 2 + 0.6, cx + L / 2 - 0.5, floor_y, floor_y + 0.03, cz - 0.45, cz + 0.45, M["deck"]))
    for k, x in enumerate((cx - 1.0, cx + 0.2, cx + 1.3)):
        p.append(box_span(f"{boat_id}_bench_{k}", x - 0.12, x + 0.12, WATER_Y + 0.28, WATER_Y + 0.33, cz - 0.62, cz + 0.62, M["deck"]))
    for k in range(4):
        x = cx - 1.5 + k * 1.0
        p.append(box_span(f"{boat_id}_rib_{k}", x - 0.02, x + 0.02, WATER_Y - 0.35, WATER_Y + 0.4, cz - 0.02, cz + 0.02, M["deck"]))
    # oars laid across the benches, rope coil in the bow, outboard on the transom
    p.append(bar(f"{boat_id}_oar_0", (cx - 1.4, WATER_Y + 0.36, cz - 0.4), (cx + 1.2, WATER_Y + 0.36, cz + 0.2), 0.035, M["deck"]))
    p.append(bar(f"{boat_id}_oar_1", (cx - 1.2, WATER_Y + 0.38, cz + 0.45), (cx + 1.4, WATER_Y + 0.38, cz - 0.1), 0.035, M["deck"]))
    p.append(K.torus(f"{boat_id}_coil", (cx + bow_dir * 1.5, WATER_Y + 0.12, cz), 0.2, 0.05, M["rope"], segments=12, profile=5, axis="y"))
    stern_x = cx - bow_dir * (L / 2)
    ob_x = stern_x - bow_dir * 0.12   # hangs just outside the transom
    p.append(K.box(f"{boat_id}_outboard", (0.35, 0.45, 0.28), (ob_x, WATER_Y + 0.55, cz), M["steel_black"], bevel=0.02))
    p.append(box_span(f"{boat_id}_outboard_leg", ob_x - 0.06, ob_x + 0.06, WATER_Y - 0.45, WATER_Y + 0.35, cz - 0.05, cz + 0.05, M["steel_black"]))
    collect(p, root, "BOATS_DYNAMIC")
    bow_x = cx + bow_dir * (L / 2 - 0.2)
    K.rig(f"SOCKET_MOOR_{boat_id.upper()}_0_BOAT", (bow_x, WATER_Y + 0.45, cz - 0.3), parent=root, collection="BOATS_DYNAMIC", tags={"socketRole": "mooring-boat", "dock": dock_socket})


def build_barge(M):
    """Cargo barge anchored offshore: low rectangular hull, deck cargo, rails, mooring bitts."""
    cx, cz = 3.0, 57.5
    L, B = 12.0, 4.6
    root = boat_root("barge", (cx, WATER_Y, cz), {"boatLength": L, "boatMoored": False})
    p = []
    fb = 0.7
    p.append(box_span("bg_hull", cx - L / 2, cx + L / 2, WATER_Y - 0.9, WATER_Y + fb, cz - B / 2, cz + B / 2, M["hull_navy"], bevel=0.04))
    p.append(box_span("bg_stripe", cx - L / 2 - 0.01, cx + L / 2 + 0.01, WATER_Y + 0.05, WATER_Y + 0.17, cz - B / 2 - 0.01, cz + B / 2 + 0.01, M["white"]))
    p.append(K.mesh("bg_rake_bow", [(cx + L / 2, WATER_Y + fb, cz - B / 2), (cx + L / 2, WATER_Y + fb, cz + B / 2), (cx + L / 2 + 1.2, WATER_Y - 0.1, cz + B / 2), (cx + L / 2 + 1.2, WATER_Y - 0.1, cz - B / 2),
                                    (cx + L / 2, WATER_Y - 0.9, cz - B / 2), (cx + L / 2, WATER_Y - 0.9, cz + B / 2)],
                    [(0, 1, 2, 3), (3, 2, 5, 4), (0, 3, 4), (1, 5, 2)], M["hull_navy"], force_recalc=True))
    deck_y = WATER_Y + fb
    p.append(box_span("bg_deck", cx - L / 2 + 0.1, cx + L / 2 - 0.1, deck_y, deck_y + 0.04, cz - B / 2 + 0.1, cz + B / 2 - 0.1, M["deck"]))
    p.append(box_span("bg_hatch", cx - 1.5, cx + 2.5, deck_y + 0.04, deck_y + 0.3, cz - 1.3, cz + 1.3, M["steel_black"], bevel=0.02))
    for k, (dx, dz, sx, sz, h) in enumerate(((-4.0, -0.9, 1.6, 1.2, 1.0), (-4.2, 1.0, 1.2, 1.0, 0.8), (3.8, 0.0, 1.8, 1.6, 1.2), (-1.5, 1.6, 1.0, 0.7, 0.7))):
        p.append(K.box(f"bg_cargo_{k}", (sx, h, sz), (cx + dx, deck_y + 0.04 + h / 2, cz + dz), M["crate"] if k % 2 == 0 else M["hull_navy"], bevel=0.02, rot_y=0.04 * k))
    p.append(K.cylinder("bg_drum_0", 0.3, 0.9, (cx + 1.0, deck_y + 0.49, cz - 1.8), M["rust_red"], segments=12))
    p.append(K.cylinder("bg_drum_1", 0.3, 0.9, (cx + 1.7, deck_y + 0.49, cz - 1.9), M["hull_navy"], segments=12))
    for sz in (-1, 1):
        p.append(bar(f"bg_rail_{sz}", (cx - L / 2 + 0.3, deck_y + 0.9, cz + sz * (B / 2 - 0.15)), (cx + L / 2 - 0.3, deck_y + 0.9, cz + sz * (B / 2 - 0.15)), 0.04, M["galv"]))
        for k in range(6):
            x = cx - L / 2 + 0.3 + k * ((L - 0.6) / 5)
            p.append(bar(f"bg_rail_post_{sz}_{k}", (x, deck_y, cz + sz * (B / 2 - 0.15)), (x, deck_y + 0.9, cz + sz * (B / 2 - 0.15)), 0.04, M["galv"]))
        for k, x in enumerate((cx - 4.5, cx - 1.0, cx + 2.5, cx + 5.0)):
            p.append(K.torus(f"bg_tire_{sz}_{k}", (x, WATER_Y + 0.4, cz + sz * (B / 2 + 0.06)), 0.32, 0.11, M["rubber"], segments=12, profile=5, axis="z"))
    for k, (dx, dz) in enumerate(((-5.4, -1.8), (-5.4, 1.8), (5.4, -1.8), (5.4, 1.8))):
        p.append(K.cylinder(f"bg_bitt_{k}", 0.13, 0.55, (cx + dx, deck_y + 0.3, cz + dz), M["steel_black"], segments=10))
        p.append(bar(f"bg_bitt_bar_{k}", (cx + dx - 0.25, deck_y + 0.5, cz + dz), (cx + dx + 0.25, deck_y + 0.5, cz + dz), 0.06, M["steel_black"]))
    p.append(K.box("bg_nav", (0.12, 0.14, 0.12), (cx - L / 2 + 0.4, deck_y + 1.4, cz), M["nav_amber"], tags={"castShadow": False}))
    p.append(bar("bg_nav_post", (cx - L / 2 + 0.4, deck_y, cz), (cx - L / 2 + 0.4, deck_y + 1.35, cz), 0.05, M["galv"]))
    collect(p, root, "BOATS_DYNAMIC")


def build_buoys(M):
    for k, (x, z) in enumerate(((-6.0, 52.5), (14.0, 54.0), (24.0, 51.0), (-16.0, 55.5))):
        root = K.rig(f"BUOY_{k}", (x, WATER_Y, z), collection="BOATS_DYNAMIC", tags={"ambientMotion": f"buoy-{k}"})
        p = [K.cylinder(f"buoy_{k}", 0.38, 0.7, (x, WATER_Y + 0.15, z), M["orange"] if k % 2 == 0 else M["white"], segments=12, radius_top=0.28),
             K.cylinder(f"buoy_band_{k}", 0.39, 0.12, (x, WATER_Y + 0.2, z), M["steel_black"], segments=12, radius_top=0.375),
             bar(f"buoy_mast_{k}", (x, WATER_Y + 0.5, z), (x, WATER_Y + 1.3, z), 0.04, M["steel_black"]),
             K.box(f"buoy_light_{k}", (0.12, 0.12, 0.12), (x, WATER_Y + 1.36, z), M["nav_amber"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})]
        collect(p, root, "BOATS_DYNAMIC")


# --------------------------------------------------------------------------- #
# LOD1
# --------------------------------------------------------------------------- #

def build_lod1(M):
    hx, hy, hz = HUB
    (px0, py0, pz0), (px1, py1, pz1) = PLATFORM
    box_span("l1_platform", px0, px1, 0.0, 0.35, pz0, pz1, M["concrete"], lod="LOD1")
    for side_z in (-2.2, 2.2):
        for side_x in (-1, 1):
            bar(f"l1_leg_{side_z}_{side_x}", (hx + side_x * 3.0, 0.85, hz + side_z), (hx + side_x * 0.9, hy - 0.35, hz + side_z), 0.36, M["navy"], lod="LOD1")
        box_span(f"l1_bearing_{side_z}", hx - 0.6, hx + 0.6, hy - 0.5, hy + 0.6, hz + side_z - 0.3, hz + side_z + 0.3, M["steel_black"], lod="LOD1")
    K.cylinder("l1_axle", 0.34, 5.6, HUB, M["rust_red"], segments=10, axis="z", lod="LOD1")
    box_span("l1_deck", hx - 2.6, hx + 2.6, DECK_Y, DECK_Y + 0.12, hz - 1.66, hz + 1.66, M["galv"], lod="LOD1")
    box_span("l1_landing", hx - 1.0, hx + 1.0, DECK_Y, DECK_Y + 0.12, hz - 3.0, hz - 1.9, M["galv"], lod="LOD1")
    box_span("l1_cabinet", hx - 2.2, hx - 1.5, 0.35, 1.55, hz - 3.15, hz - 2.7, M["machine"], lod="LOD1")
    # pier / promenade (the legacy seawall + rail stay at every tier)
    box_span("l1_boardwalk", -20.0, 51.0, 0.12, BOARDWALK_TOP, 34.0, 42.0, M["deck"], lod="LOD1")
    box_span("l1_kerb", -20.0, 51.0, BOARDWALK_TOP, 0.5, KERB_Z[0], KERB_Z[1], M["deck"], lod="LOD1")
    box_span("l1_prom", -22.0, 32.0, 0.0, 0.06, KERB_Z[1], SEAWALL[0][2], M["concrete"], lod="LOD1")
    box_span("l1_seawall_cap", -22.0, 32.0, 0.9, 0.96, SEAWALL[0][2] - 0.05, SEAWALL[1][2] + 0.05, M["concrete"], lod="LOD1")
    box_span("l1_seawall_face_land", -22.0, 32.0, 0.06, 0.9, SEAWALL[0][2] - 0.04, SEAWALL[0][2] - 0.005, M["concrete"], lod="LOD1")
    for k, x in enumerate(range(-20, 33, 4)):
        box_span(f"l1_pile_{k}", x - 0.2, x + 0.2, -1.2, 1.8, SEAWALL[1][2] + 0.05, SEAWALL[1][2] + 0.45, M["deck"], lod="LOD1")
    for k, x in enumerate((5.0, 13.0, 21.0, 29.0)):
        box_span(f"l1_table_{k}", x - 0.9, x + 0.9, 0.78, 0.84, 35.4, 36.6, M["deck"], lod="LOD1")
        K.cylinder(f"l1_umbrella_{k}", 1.35, 0.35, (x, 2.62, 36.0), M["canvas_cream"], segments=8, radius_top=0.05, lod="LOD1")
    box_span("l1_kiosk", -2.6, -0.2, 0.0, 2.62, 29.6, 32.0, M["navy"], lod="LOD1")
    box_span("l1_booth", -20.9, -16.1, 0.0, 3.5, 29.5, 32.9, M["navy"], lod="LOD1")
    for k, x in enumerate((-16.0, -4.0, 8.0, 20.0, 30.0)):
        box_span(f"l1_lamp_{k}", x - 0.05, x + 0.05, 0.06, 4.9, 42.65, 42.75, M["steel_black"], lod="LOD1")


def build_lod1_dynamic(M):
    """Low-tier wheel and boats: same rig nodes, simple silhouettes."""
    hx, hy, hz = HUB
    root = bpy.data.objects["RIG_FERRIS_HARBOR_WHEEL_ROOT"]
    parts = [K.cylinder("l1_hub", 0.6, 4.4, HUB, M["rust_red"], segments=10, axis="z", lod="LOD1")]
    for zf in (-RIM_Z, RIM_Z):
        parts.append(K.torus(f"l1_rim_{zf}", (hx, hy, hz + zf), RING_R, 0.14, M["navy"], segments=32, profile=4, axis="z", lod="LOD1"))
        for i in range(8):
            a = math.tau * i / 8
            parts.append(bar(f"l1_spoke_{zf}_{i}", (hx + math.cos(a) * 0.9, hy + math.sin(a) * 0.9, hz + zf), (hx + math.cos(a) * (RING_R - 0.15), hy + math.sin(a) * (RING_R - 0.15), hz + zf), 0.08, M["galv"], lod="LOD1"))
    colors = ["cab_teal", "cab_brick", "cab_mustard", "cab_coral", "cab_navy", "cab_teal", "cab_brick", "cab_mustard"]
    for i in range(N_CABINS):
        a = math.tau * i / N_CABINS
        cx = hx + math.cos(a) * MOUNT_R
        cy = hy + math.sin(a) * MOUNT_R
        rx, ry = hx + math.cos(a) * RING_R, hy + math.sin(a) * RING_R
        parts.append(bar(f"l1_yoke_{i}", (rx, ry, hz - RIM_Z), (rx, ry, hz + RIM_Z), 0.1, M["navy"], lod="LOD1"))
        pivot = bpy.data.objects[f"RIG_FERRIS_HARBOR_CABIN_{i}"]
        collect([box_span(f"l1_cab_{i}", cx - CAB_W / 2, cx + CAB_W / 2, cy - CAB_H / 2, cy + CAB_H / 2 + 0.1, hz - CAB_D / 2, hz + CAB_D / 2, M[colors[i]], lod="LOD1")], pivot, "CABINS_DYNAMIC")
    collect(parts, root, "FERRIS_DYNAMIC")
    for boat, (cx, cz, L, B, h) in {"WORKBOAT": (7.0, 49.9, 10.0, 3.2, 0.75), "LAUNCH": (-8.0, 49.4, 7.0, 2.4, 0.6),
                                    "SKIFF_RED": (-15.0, 48.6, 4.2, 1.5, 0.42), "SKIFF_GREEN": (18.0, 48.7, 4.2, 1.5, 0.42), "BARGE": (3.0, 57.5, 12.0, 4.6, 0.7)}.items():
        root = bpy.data.objects[f"RIG_FERRIS_HARBOR_BOAT_{boat}"]
        mat = M["hull_navy"] if boat not in ("SKIFF_RED", "SKIFF_GREEN") else (M["plank_red"] if boat == "SKIFF_RED" else M["plank_green"])
        parts = [box_span(f"l1_{boat}_hull", cx - L / 2, cx + L / 2, WATER_Y - 0.6, WATER_Y + h, cz - B / 2, cz + B / 2, mat, lod="LOD1", bevel=0.05)]
        if boat in ("WORKBOAT", "LAUNCH"):
            parts.append(box_span(f"l1_{boat}_house", cx - 1.2, cx + 1.4, WATER_Y + h, WATER_Y + h + 1.9, cz - 0.9, cz + 0.9, M["cream"], lod="LOD1"))
        collect(parts, root, "BOATS_DYNAMIC")


# --------------------------------------------------------------------------- #
# References + main
# --------------------------------------------------------------------------- #

def add_references():
    count = K.import_reference_colliders(COLLIDER_JSON, (ZONE_MIN, ZONE_MAX))
    kept = K.import_reference_glb(CINEMATIC_GLB, (ZONE_MIN, ZONE_MAX)) if CINEMATIC_GLB.exists() else 0
    top = REFERENCE_DIR / "harbor-v2-ferris-harbor-top-orthographic.png"
    if top.exists():
        # image up = +x (east), right = +z (south); 52 m of x across the 1536 px height
        K.add_reference_image(top, "REF_IMG_top_ortho", (0.0, -0.06, 44.0), 52.0, rotation_z=-math.pi / 2)
    return count, kept


def main(save: bool = True) -> dict:
    K.new_scene("Harbor_V2_Ferris_Harbor_Authoring")
    K.subcollection("RENDER_LOD0", "FERRIS_STATIC")
    K.subcollection("RENDER_LOD0", "DOCK_STATIC")
    M = materials()
    build_ferris_static(M)
    for obj in list(K.collections["RENDER_LOD0"].objects):
        if obj.type == "MESH":
            K.link(obj, "FERRIS_STATIC")
    build_pier(M)
    for obj in list(K.collections["RENDER_LOD0"].objects):
        if obj.type == "MESH":
            K.link(obj, "DOCK_STATIC")
    build_ferris_dynamic(M)
    build_workboat(M)
    build_launch(M)
    build_skiff(M, "skiff_red", -15.0, 48.6, M["plank_red"], -1, "SOCKET_FERRIS_HARBOR_MOOR_DOCK_0")
    build_skiff(M, "skiff_green", 18.0, 48.7, M["plank_green"], 1, "SOCKET_FERRIS_HARBOR_MOOR_DOCK_4")
    build_barge(M)
    build_buoys(M)
    build_lod1(M)
    build_lod1_dynamic(M)
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
        OUTPUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND))
        stats["saved"] = str(OUTPUT_BLEND)
    return stats


if __name__ == "__main__":
    main(save=True)
