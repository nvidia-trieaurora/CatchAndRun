"""AC — Waterfront Residential Garden zone builder (Blender 5.2, run via MCP).

Authors ``art-source/harbor-v2/garden/garden-ac.blend`` from scratch: the harbor
worker house (10 x 8 m, two floors, porch, balcony, walkable gable roof,
chimney, interior), the octagonal koi pond with its four planter boxes, bridge,
rock island, lanterns, benches, paths, lawn, trees, shrubs and lamp posts.

Every visual respects the procedural movement colliders dumped by
``tools/harbor-v2/dump_procedural_colliders.ts`` (imported as locked reference
volumes) — this is a visual pass, no collider or marker is exported.

Coordinates in this file are Three.js world meters (x, y-up, z).
"""

from __future__ import annotations

import importlib
import math
import sys
from pathlib import Path

import bpy

ZONES = Path(__file__).resolve().parent if "__file__" in globals() else Path(
    "/Users/tlle/Documents/PersonalProject/CatchAndRun/tools/harbor-v2/zones"
)
if str(ZONES) not in sys.path:
    sys.path.insert(0, str(ZONES))
import zone_kit as zk  # noqa: E402

importlib.reload(zk)

ROOT = zk.ROOT
BLEND_PATH = ROOT / "art-source/harbor-v2/garden/garden-ac.blend"
COLLIDER_JSON = ROOT / "art-source/harbor-v2/_staging/procedural-colliders.json"
CINEMATIC_GLB = ROOT / "client/public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb"
REFERENCE_DIR = Path("/Users/tlle/.cursor/projects/Users-tlle-Documents-PersonalProject/assets")

# Zone footprint (Three.js): west seawall to the Ferris platform edge.
ZONE_MIN = (-55.0, -1.0, 12.0)
ZONE_MAX = (-17.5, 20.0, 47.5)

# House contract (from oldHarborFortnite.ts buildBackyardHouse)
HX, HZ = -35.0, 22.0
HW, HD = 10.0, 8.0
W = 0.5
F = 5.0
BASE1 = 0.35
BASE2 = F + BASE1            # 5.35
DECK_Y = F * 2 + BASE1       # 10.35 roof deck / 2F ceiling
ROOF_RIDGE_Y = 13.65
ROOF_EAVE_Y = 10.95
ROOF_HALF_RUN = 5.0          # ridge z=22 -> eaves z=17/27
ROOF_HALF_W = 6.15           # x -41.15 .. -28.85
CH_X, CH_Z = HX + HW / 2 - 1.5, HZ - HD / 2 + 1.0   # chimney centre (-31.5, 19)
CH_W, CH_T, CH_TOP = 1.2, 0.15, DECK_Y + 2.5

K = zk.ZoneKit("GARDEN", "residential", "garden-pbr")


def materials():
    M = {}
    M["plaster"] = K.pbr("MAT_PLASTER_OLD", "plaster_old")
    M["plaster_in"] = K.pbr("MAT_PLASTER_INTERIOR", "plaster_interior")
    M["roof"] = K.pbr("MAT_ROOF_METAL_DARK", "roof_metal_dark")
    M["wood"] = K.pbr("MAT_WOOD_WEATHERED", "wood_weathered")
    M["wood_in"] = K.pbr("MAT_WOOD_INTERIOR", "wood_interior")
    M["brick"] = K.pbr("MAT_BRICK", "brick")
    M["concrete"] = K.pbr("MAT_BASE_CONCRETE", "concrete")
    M["lawn"] = K.pbr("MAT_BASE_LAWN", "lawn")
    M["paving"] = K.pbr("MAT_BASE_STONE_PAVING", "stone_paving")
    M["rock"] = K.pbr("MAT_ROCK", "rock")
    M["soil"] = K.pbr("MAT_BASE_SOIL", "soil")
    M["bark"] = K.pbr("MAT_BARK", "bark")
    M["leaf"] = K.pbr("MAT_LEAF_CLUSTER", "leaf_cluster", alpha_clip=True, double_sided=True)
    M["leaf_light"] = M["leaf"]   # atlas column picks the lighter cluster
    M["grass"] = K.pbr("MAT_GRASS_TUFT", "grass_tuft", alpha_clip=True, double_sided=True)
    M["reed"] = K.pbr("MAT_REED", "reed", alpha_clip=True, double_sided=True)
    M["glass"] = K.simple("MAT_GLASS_WARM", (0.55, 0.62, 0.66), 0.08, alpha=0.5,
                          emissive=(1.0, 0.72, 0.42), emissive_strength=1.4, blended=True,
                          double_sided=True)
    M["lamp"] = K.simple("MAT_LAMP_WARM", (1.0, 0.86, 0.62), 0.4,
                         emissive=(1.0, 0.76, 0.46), emissive_strength=2.6)
    M["fire"] = M["lamp"]   # hearth glow shares the warm emissive batch
    M["water"] = K.simple("MAT_POND_WATER", (0.07, 0.19, 0.21), 0.05, alpha=0.76, blended=True)
    M["steel"] = K.simple("MAT_STEEL_DARK", (0.07, 0.075, 0.08), 0.45, 0.8)
    # One flat-colour palette material for every small untextured prop (sofa,
    # linen, appliances, flowers...) so interior clutter costs a single draw call.
    palette = K.palette("MAT_PALETTE", {
        "fabric": (0.15, 0.2, 0.38),
        "fabric_warm": (0.62, 0.42, 0.28),
        "matte": (0.045, 0.045, 0.05),
        "white": (0.74, 0.75, 0.73),
        "linen": (0.82, 0.8, 0.74),
        "flower_pink": (0.9, 0.42, 0.55),
        "flower_yellow": (0.92, 0.72, 0.18),
        "stem": (0.2, 0.36, 0.14),
        "lily": (0.16, 0.36, 0.14),
        "rubber": (0.06, 0.06, 0.065),
    })
    for key in ("fabric", "fabric_warm", "matte", "white", "linen", "flower_pink", "flower_yellow", "stem", "lily", "rubber"):
        M[key] = palette[key]
    _M.clear()
    _M.update(M)
    return M


# --------------------------------------------------------------------------- #
# House
# --------------------------------------------------------------------------- #

def box_span(name, x0, x1, y0, y1, z0, z1, mat, **kw):
    return K.box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat, **kw)


def window_glazed(name, cx, cy, cz, w, h, facing, M, frame_depth=0.12):
    """Glazed window with frame, sill and 2x2 muntins on a solid wall face.

    facing: "+z" / "-z" / "+x" / "-x" — direction the window faces outward.
    """
    fw = 0.09
    axis_x = facing in ("+x", "-x")
    sign = 1 if facing in ("+x", "+z") else -1
    depth = frame_depth
    def rect(px, py, pz, sx, sy, sz, mat, tags=None):
        return K.box(f"{name}_{mat.name}_{K.rng.random():.4f}", (sx, sy, sz), (px, py, pz), mat, tags=tags)
    d = sign * 0.02
    # frame
    if axis_x:
        rect(cx + d, cy + h / 2 - fw / 2, cz, depth, fw, w, M["wood"])
        rect(cx + d, cy - h / 2 + fw / 2, cz, depth, fw, w, M["wood"])
        rect(cx + d, cy, cz - w / 2 + fw / 2, depth, h, fw, M["wood"])
        rect(cx + d, cy, cz + w / 2 - fw / 2, depth, h, fw, M["wood"])
        rect(cx + d, cy, cz, 0.03, 0.05, w - 2 * fw, M["wood"])      # horizontal muntin
        rect(cx + d, cy, cz, 0.03, h - 2 * fw, 0.05, M["wood"])      # vertical muntin
        rect(cx + sign * 0.1, cy - h / 2 - 0.03, cz, 0.22, 0.06, w + 0.2, M["concrete"])  # sill
        K.plane(f"{name}_glass", (w - 2 * fw, h - 2 * fw), (cx - sign * 0.02, cy, cz), M["glass"],
                normal="x")
    else:
        rect(cx, cy + h / 2 - fw / 2, cz + d, w, fw, depth, M["wood"])
        rect(cx, cy - h / 2 + fw / 2, cz + d, w, fw, depth, M["wood"])
        rect(cx - w / 2 + fw / 2, cy, cz + d, fw, h, depth, M["wood"])
        rect(cx + w / 2 - fw / 2, cy, cz + d, fw, h, depth, M["wood"])
        rect(cx, cy, cz + d, w - 2 * fw, 0.05, 0.03, M["wood"])
        rect(cx, cy, cz + d, 0.05, h - 2 * fw, 0.03, M["wood"])
        rect(cx, cy - h / 2 - 0.03, cz + sign * 0.1, w + 0.2, 0.06, 0.22, M["concrete"])
        K.plane(f"{name}_glass", (w - 2 * fw, h - 2 * fw), (cx, cy, cz - sign * 0.02), M["glass"],
                normal="z")


def open_window_band(name, x_wall, z0, z1, y0, y1, outward_sign, M):
    """5 m x 2 m collision-open side window: frame + sill only.

    The opening is a jump route for Hunters and Props (the procedural wall colliders
    leave it open), so nothing may stand inside the band: no mullions, no glass, and
    the shutters hang folded back against the exterior wall beside the opening.
    """
    fw = 0.1
    depth = W + 0.06
    box_span(f"{name}_head", x_wall - depth / 2, x_wall + depth / 2, y1, y1 + fw, z0, z1, M["wood"])
    box_span(f"{name}_sill", x_wall - depth / 2, x_wall + depth / 2, y0 - fw, y0, z0, z1, M["wood"])
    box_span(f"{name}_jamb0", x_wall - depth / 2, x_wall + depth / 2, y0, y1, z0 - fw, z0, M["wood"])
    box_span(f"{name}_jamb1", x_wall - depth / 2, x_wall + depth / 2, y0, y1, z1, z1 + fw, M["wood"])
    # worn sill board on the room side so the jump-out reads as a low ledge
    box_span(f"{name}_ledge", x_wall - outward_sign * (depth / 2 + 0.08), x_wall - outward_sign * depth / 2, y0 - fw, y0 + 0.02, z0 - fw, z1 + fw, M["wood_in"])
    # shutters folded back flat against the exterior wall, outside the opening
    sx = x_wall + outward_sign * (W / 2 + 0.03)
    shutter_w = 0.62
    for k, (za, zb) in enumerate(((z0 - fw - shutter_w - 0.02, z0 - fw - 0.02), (z1 + fw + 0.02, z1 + fw + 0.02 + shutter_w))):
        box_span(f"{name}_shutter{k}", sx - 0.02, sx + 0.02, y0 + 0.05, y1 - 0.05, za, zb, M["wood"])
        for s in range(4):
            sy = y0 + 0.25 + s * (y1 - y0 - 0.5) / 3
            box_span(f"{name}_shutter{k}_slat{s}", sx + outward_sign * 0.02, sx + outward_sign * 0.035, sy - 0.03, sy + 0.03, za + 0.04, zb - 0.04, M["wood"])


def build_house(M):
    x0, x1 = HX - HW / 2, HX + HW / 2           # -40 .. -30
    z0, z1 = HZ - HD / 2, HZ + HD / 2           # 18 .. 26

    # Foundation plinth (visible ring) and interior floors
    box_span("house_plinth", x0 - 1, x1 + 1, 0.0, 0.5, z0 - 1, z1 + 1, M["concrete"], bevel=0.03)
    box_span("floor_1f", x0, x1, 0.42, 0.5, z0, z1, M["wood_in"])
    # 2F floor split around stair void (x -40..-38, z 18..23) and chimney hole
    chx0, chx1, chz0, chz1 = CH_X - 0.7, CH_X + 0.7, CH_Z - 0.7, CH_Z + 0.7
    box_span("floor_2f_a", -38.0, chx0, BASE2, BASE2 + 0.2, z0, z1, M["wood_in"])
    box_span("floor_2f_b", chx1, x1, BASE2, BASE2 + 0.2, z0, z1, M["wood_in"])
    box_span("floor_2f_c", chx0, chx1, BASE2, BASE2 + 0.2, z0, chz0, M["wood_in"])
    box_span("floor_2f_d", chx0, chx1, BASE2, BASE2 + 0.2, chz1, z1, M["wood_in"])
    box_span("floor_2f_landing", x0, -38.0, BASE2, BASE2 + 0.2, 23.0, z1, M["wood_in"])
    # ceiling under the roof deck, split around the chimney flue so the shaft stays open
    box_span("ceiling_2f_a", x0, chx0, DECK_Y - 0.08, DECK_Y, z0, z1, M["plaster_in"])
    box_span("ceiling_2f_b", chx1, x1, DECK_Y - 0.08, DECK_Y, z0, z1, M["plaster_in"])
    box_span("ceiling_2f_c", chx0, chx1, DECK_Y - 0.08, DECK_Y, z0, chz0, M["plaster_in"])
    box_span("ceiling_2f_d", chx0, chx1, DECK_Y - 0.08, DECK_Y, chz1, z1, M["plaster_in"])
    # interior lining (painted plaster) on the inside faces of the walls, both floors
    li = 0.03
    for (ya, yb) in ((BASE1, BASE2), (BASE2 + 0.2, DECK_Y - 0.08)):
        box_span(f"lining_back_{ya}", x0 + W / 2, x1 - W / 2, ya, yb, z0 + W / 2, z0 + W / 2 + li, M["plaster_in"])
        # side walls: keep the open window bands open
        for xw, sgn in ((x0, 1), (x1, -1)):
            xa = xw + sgn * W / 2
            xb = xa + sgn * li
            lo, hi = (min(xa, xb), max(xa, xb))
            band_lo, band_hi = (1.35, 3.35) if ya < 4 else (6.35, 8.35)
            box_span(f"lining_side_{xw}_{ya}_a", lo, hi, ya, band_lo, z0 + W / 2, z1 - W / 2, M["plaster_in"])
            box_span(f"lining_side_{xw}_{ya}_b", lo, hi, band_hi, yb, z0 + W / 2, z1 - W / 2, M["plaster_in"])
            box_span(f"lining_side_{xw}_{ya}_c", lo, hi, band_lo, band_hi, z0 + W / 2, 19.5, M["plaster_in"])
            box_span(f"lining_side_{xw}_{ya}_d", lo, hi, band_lo, band_hi, 24.5, z1 - W / 2, M["plaster_in"])
    # front wall lining around door (1F) and loggia (2F)
    box_span("lining_front_1L", x0 + W / 2, -36.5, BASE1, BASE2, z1 - W / 2 - li, z1 - W / 2, M["plaster_in"])
    box_span("lining_front_1R", -33.5, x1 - W / 2, BASE1, BASE2, z1 - W / 2 - li, z1 - W / 2, M["plaster_in"])
    box_span("lining_front_1H", -36.5, -33.5, 3.15, BASE2, z1 - W / 2 - li, z1 - W / 2, M["plaster_in"])
    box_span("lining_front_2L", x0 + W / 2, -37.5, BASE2 + 0.2, DECK_Y - 0.08, z1 - W / 2 - li, z1 - W / 2, M["plaster_in"])
    box_span("lining_front_2R", -32.5, x1 - W / 2, BASE2 + 0.2, DECK_Y - 0.08, z1 - W / 2 - li, z1 - W / 2, M["plaster_in"])
    box_span("lining_front_2H", -37.5, -32.5, 9.7, DECK_Y - 0.08, z1 - W / 2 - li, z1 - W / 2, M["plaster_in"])
    # skirting boards
    for (ya) in (0.5, BASE2 + 0.2):
        box_span(f"skirting_back_{ya}", x0 + W / 2, x1 - W / 2, ya, ya + 0.12, z0 + W / 2 + li, z0 + W / 2 + li + 0.02, M["wood_in"])

    # ---- walls (both floors as continuous plaster) ----
    top = DECK_Y
    # back wall (solid)
    box_span("wall_back", x0 - W / 2, x1 + W / 2, BASE1, top, z0 - W / 2, z0 + W / 2, M["plaster"])
    # side walls with 5 m open bands (1F 1.35-3.35, 2F 6.35-8.35 at z 19.5..24.5)
    for xw, name in ((x0, "wall_left"), (x1, "wall_right")):
        xa, xb = xw - W / 2, xw + W / 2
        box_span(f"{name}_below1", xa, xb, BASE1, 1.35, z0, z1, M["plaster"])
        box_span(f"{name}_pillar1a", xa, xb, 1.35, 3.35, z0, 19.5, M["plaster"])
        box_span(f"{name}_pillar1b", xa, xb, 1.35, 3.35, 24.5, z1, M["plaster"])
        box_span(f"{name}_mid", xa, xb, 3.35, 6.35, z0, z1, M["plaster"])
        box_span(f"{name}_pillar2a", xa, xb, 6.35, 8.35, z0, 19.5, M["plaster"])
        box_span(f"{name}_pillar2b", xa, xb, 6.35, 8.35, 24.5, z1, M["plaster"])
        box_span(f"{name}_above2", xa, xb, 8.35, top, z0, z1, M["plaster"])
        sign = -1 if xw == x0 else 1
        open_window_band(f"{name}_win1", xw, 19.5, 24.5, 1.35, 3.35, sign, M)
        open_window_band(f"{name}_win2", xw, 19.5, 24.5, 6.35, 8.35, sign, M)
        # gable triangle above the deck
        gx = xw
        verts = [(gx - W / 2, top, z0 - 1.0), (gx - W / 2, top, z1 + 1.0), (gx - W / 2, ROOF_RIDGE_Y - 0.14, HZ),
                 (gx + W / 2, top, z0 - 1.0), (gx + W / 2, top, z1 + 1.0), (gx + W / 2, ROOF_RIDGE_Y - 0.14, HZ)]
        K.mesh(f"{name}_gable", verts, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], M["plaster"])
        # small gable window
        window_glazed(f"{name}_gablewin", gx, 11.6, HZ, 0.9, 1.1, "-x" if sign < 0 else "+x", M)
    # front wall 1F: solid parts + door header; 2F: solid parts + loggia lintel
    zf0, zf1 = z1 - W / 2, z1 + W / 2
    box_span("wall_front_1L", x0 - W / 2, -36.5, BASE1, BASE2, zf0, zf1, M["plaster"])
    box_span("wall_front_1R", -33.5, x1 + W / 2, BASE1, BASE2, zf0, zf1, M["plaster"])
    box_span("wall_front_1H", -36.5, -33.5, 3.15, BASE2, zf0, zf1, M["plaster"])
    box_span("wall_front_2L", x0 - W / 2, -37.5, BASE2, top, zf0, zf1, M["plaster"])
    box_span("wall_front_2R", -32.5, x1 + W / 2, BASE2, top, zf0, zf1, M["plaster"])
    box_span("wall_front_2H", -37.5, -32.5, 9.7, top, zf0, zf1, M["plaster"])
    # front windows on solid parts
    for (cx, cy) in ((-38.3, 2.2), (-31.7, 2.2), (-38.7, 7.4), (-31.3, 7.4)):
        window_glazed(f"front_win_{cx}_{cy}", cx, cy, z1, 1.1, 1.5, "+z", M)
    # back wall windows
    for (cx, cy) in ((-38.0, 2.3), (-35.0, 2.3), (-33.8, 7.4), (-37.0, 7.4)):
        window_glazed(f"back_win_{cx}_{cy}", cx, cy, z0, 1.1, 1.5, "-z", M)

    # ---- front door (3 m opening, double leaf swung inward) ----
    fw = 0.12
    box_span("door_jamb_l", -36.5 - fw, -36.5, BASE1, 3.15, zf0 - 0.02, zf1 + 0.02, M["wood"])
    box_span("door_jamb_r", -33.5, -33.5 + fw, BASE1, 3.15, zf0 - 0.02, zf1 + 0.02, M["wood"])
    box_span("door_head", -36.5 - fw, -33.5 + fw, 3.15, 3.15 + fw, zf0 - 0.02, zf1 + 0.02, M["wood"])
    box_span("door_leaf_l", -36.45, -36.4, BASE1 + 0.02, 3.1, zf0 - 1.45, zf0 - 0.02, M["wood"], bevel=0.01)
    box_span("door_leaf_r", -33.6, -33.55, BASE1 + 0.02, 3.1, zf0 - 1.45, zf0 - 0.02, M["wood"], bevel=0.01)
    box_span("door_threshold", -36.5, -33.5, 0.35, 0.5, zf0 - 0.05, zf1 + 0.05, M["concrete"])

    # ---- 2F loggia (5 m x 4.35 m opening) ----
    # the whole 5 m x 4.35 m opening is collision-open: only a lintel and the
    # jambs get timber, so the visual never suggests a blocked bay
    box_span("loggia_lintel", -37.6, -32.4, 9.55, 9.7, zf0 - 0.04, zf1 + 0.04, M["wood"])
    box_span("loggia_jamb_l", -37.6, -37.5, BASE2, 9.55, zf0 - 0.04, zf1 + 0.04, M["wood"])
    box_span("loggia_jamb_r", -32.5, -32.4, BASE2, 9.55, zf0 - 0.04, zf1 + 0.04, M["wood"])
    # French doors swung outward onto the balcony, against the wall
    box_span("french_l", -37.45, -36.4, BASE2 + 0.02, 7.6, zf1 + 0.02, zf1 + 0.06, M["wood"])
    box_span("french_r", -33.6, -32.55, BASE2 + 0.02, 7.6, zf1 + 0.02, zf1 + 0.06, M["wood"])
    for px in (-36.92, -33.08):
        K.plane(f"french_glass_{px}", (0.7, 1.6), (px, 6.7, zf1 + 0.065), M["glass"], normal="z")

    # ---- balcony (deck 5 x 1.8, rail to 6.75) ----
    bd_z0, bd_z1 = z1, z1 + 1.8
    box_span("balcony_deck", -37.5, -32.5, BASE2, BASE2 + 0.2, bd_z0, bd_z1, M["wood"])
    for i in range(6):
        jx = -37.4 + i * 0.98
        box_span(f"balcony_joist_{i}", jx - 0.04, jx + 0.04, BASE2 - 0.16, BASE2, bd_z0, bd_z1, M["wood"])
    box_span("balcony_fascia", -37.5, -32.5, BASE2 - 0.16, BASE2, bd_z1 - 0.04, bd_z1, M["wood"])
    box_span("balcony_rail_top", -37.6, -32.4, 6.7, 6.78, bd_z1 - 0.12, bd_z1 - 0.04, M["wood"])
    box_span("balcony_rail_mid", -37.6, -32.4, 6.05, 6.1, bd_z1 - 0.11, bd_z1 - 0.05, M["wood"])
    for i in range(7):
        px = -37.5 + i * (5.0 / 6)
        box_span(f"balcony_post_{i}", px - 0.045, px + 0.045, BASE2 + 0.2, 6.75, bd_z1 - 0.13, bd_z1 - 0.03, M["wood"])
    for sx in (-37.55, -32.45):
        box_span(f"balcony_siderail_{sx}", sx - 0.04, sx + 0.04, 6.7, 6.78, bd_z0, bd_z1 - 0.04, M["wood"])
        for k in range(3):
            pz = bd_z0 + 0.3 + k * 0.6
            box_span(f"balcony_sidepost_{sx}_{k}", sx - 0.035, sx + 0.035, BASE2 + 0.2, 6.7, pz - 0.035, pz + 0.035, M["wood"])
    # brackets under the balcony
    for px in (-37.2, -35.0, -32.8):
        K.mesh(f"balcony_brace_{px}", [(px - 0.05, BASE2 - 0.2, z1 + 0.3), (px + 0.05, BASE2 - 0.2, z1 + 0.3),
                                        (px + 0.05, BASE2 - 0.2, bd_z1 - 0.1), (px - 0.05, BASE2 - 0.2, bd_z1 - 0.1),
                                        (px - 0.05, BASE2 - 1.1, z1 + 0.3), (px + 0.05, BASE2 - 1.1, z1 + 0.3)],
               [(0, 1, 2, 3), (4, 5, 1, 0), (2, 1, 5), (3, 2, 5, 4), (0, 3, 4)], M["wood"])

    # ---- roof: two slabs, ridge cap, fascia, gutters, downspouts ----
    t = 0.14

    def roof_y(z):
        return ROOF_EAVE_Y + (ROOF_RIDGE_Y - ROOF_EAVE_Y) * (1.0 - abs(z - HZ) / ROOF_HALF_RUN)

    def slab_piece(name, xa, xb, za, zb, side):
        # sloped slab piece between two z stations (top surface follows the pitch)
        v = [(xa, roof_y(za), za), (xb, roof_y(za), za), (xb, roof_y(zb), zb), (xa, roof_y(zb), zb)]
        vb = [(x, y - t, z) for (x, y, z) in v]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        if (zb - za) * side > 0:
            faces = [tuple(reversed(f)) for f in faces]
        K.mesh(name, v + vb, faces, M["roof"], force_recalc=True)

    # chimney flue footprint (outer brick faces) leaves a hole in the back slope
    fx0, fx1 = CH_X - CH_W / 2 - CH_T, CH_X + CH_W / 2 + CH_T
    fz0, fz1 = CH_Z - CH_W / 2 - CH_T, CH_Z + CH_W / 2 + CH_T
    for side in (-1, 1):
        ze = HZ + side * ROOF_HALF_RUN
        zr = HZ
        if side == 1:
            slab_piece(f"roof_slab_{side}", HX - ROOF_HALF_W, HX + ROOF_HALF_W, zr, ze, side)
        else:
            slab_piece(f"roof_slab_{side}_w", HX - ROOF_HALF_W, fx0, zr, ze, side)
            slab_piece(f"roof_slab_{side}_e", fx1, HX + ROOF_HALF_W, zr, ze, side)
            slab_piece(f"roof_slab_{side}_ridge", fx0, fx1, zr, fz1, side)
            slab_piece(f"roof_slab_{side}_eave", fx0, fx1, fz0, ze, side)
        # fascia + gutter at the eave
        box_span(f"roof_fascia_{side}", HX - ROOF_HALF_W, HX + ROOF_HALF_W, ROOF_EAVE_Y - 0.36, ROOF_EAVE_Y - 0.1,
                 ze - 0.08 if side == 1 else ze - 0.02, ze + 0.02 if side == 1 else ze + 0.08, M["wood"])
        box_span(f"roof_gutter_{side}", HX - ROOF_HALF_W, HX + ROOF_HALF_W, ROOF_EAVE_Y - 0.3, ROOF_EAVE_Y - 0.14,
                 ze + 0.02 if side == 1 else ze - 0.16, ze + 0.16 if side == 1 else ze - 0.02, M["steel"])
        # downspouts at both ends
        for dx in (HX - ROOF_HALF_W + 0.35, HX + ROOF_HALF_W - 0.35):
            zd = ze + (0.2 if side == 1 else -0.2)
            K.cylinder(f"downspout_{side}_{dx}", 0.05, ROOF_EAVE_Y - 0.4, (dx, (ROOF_EAVE_Y - 0.4) / 2, zd), M["steel"], segments=8)
            K.cylinder(f"downspout_elbow_{side}_{dx}", 0.05, 0.5, (dx, ROOF_EAVE_Y - 0.28, zd - (0.2 if side == 1 else -0.2) / 2), M["steel"], segments=8, axis="z")
    box_span("roof_ridge_cap", HX - ROOF_HALF_W - 0.05, HX + ROOF_HALF_W + 0.05, ROOF_RIDGE_Y - 0.06, ROOF_RIDGE_Y + 0.08, HZ - 0.22, HZ + 0.22, M["steel"])
    # seam-line battens (standing seams every 0.6 m) as thin strips on both slopes
    for side in (-1, 1):
        for i in range(21):
            sx = HX - ROOF_HALF_W + 0.3 + i * 0.6
            zr, ze = HZ, HZ + side * ROOF_HALF_RUN
            # seams crossing the flue are split around it (the back slope has the hole)
            spans = [(zr, ze)]
            if side == -1 and fx0 < sx < fx1:
                spans = [(zr, fz1), (fz0, ze)]
            for k, (za, zb) in enumerate(spans):
                v = [(sx - 0.02, roof_y(za) + 0.025, za), (sx + 0.02, roof_y(za) + 0.025, za),
                     (sx + 0.02, roof_y(zb) + 0.025, zb), (sx - 0.02, roof_y(zb) + 0.025, zb)]
                faces = [(0, 1, 2, 3)] if side == 1 else [(3, 2, 1, 0)]
                K.mesh(f"roof_seam_{side}_{i}_{k}", v, faces, M["steel"], tags={"castShadow": False})

    # ---- chimney (brick shaft with open hearth) ----
    cx0, cx1 = CH_X - CH_W / 2 - CH_T, CH_X + CH_W / 2 + CH_T
    cz0, cz1 = CH_Z - CH_W / 2 - CH_T, CH_Z + CH_W / 2 + CH_T
    mantel_y = BASE1 + 2.0
    box_span("chimney_back", cx0, cx1, BASE1, CH_TOP, cz0, cz0 + CH_T, M["brick"])
    box_span("chimney_left", cx0, cx0 + CH_T, BASE1, CH_TOP, cz0, cz1, M["brick"])
    box_span("chimney_right", cx1 - CH_T, cx1, BASE1, CH_TOP, cz0, cz1, M["brick"])
    box_span("chimney_front_upper", cx0, cx1, mantel_y, CH_TOP, cz1 - CH_T, cz1, M["brick"])
    # OPEN flue: the shaft is a gameplay drop (roof -> hearth), so the top is a concrete
    # rim around the 1.2 x 1.2 opening (no cap, no pot) and the inside is lined with
    # soot-dark faces that point into the shaft (a box's own faces point outward).
    ix0, ix1, iz0, iz1 = cx0 + CH_T, cx1 - CH_T, cz0 + CH_T, cz1 - CH_T
    rim = 0.12
    for nm, (rx0, rx1, rz0, rz1) in {"n": (cx0 - rim, cx1 + rim, cz0 - rim, cz0 + CH_T), "s": (cx0 - rim, cx1 + rim, cz1 - CH_T, cz1 + rim),
                                     "w": (cx0 - rim, cx0 + CH_T, cz0 - rim, cz1 + rim), "e": (cx1 - CH_T, cx1 + rim, cz0 - rim, cz1 + rim)}.items():
        box_span(f"chimney_rim_{nm}", rx0, rx1, CH_TOP, CH_TOP + 0.14, rz0, rz1, M["concrete"], bevel=0.02)
    soot = 0.012
    box_span("chimney_soot_back", ix0, ix1, BASE1, CH_TOP - 0.02, iz0, iz0 + soot, M["matte"])
    box_span("chimney_soot_left", ix0, ix0 + soot, BASE1, CH_TOP - 0.02, iz0, iz1, M["matte"])
    box_span("chimney_soot_right", ix1 - soot, ix1, BASE1, CH_TOP - 0.02, iz0, iz1, M["matte"])
    box_span("chimney_soot_front", ix0, ix1, mantel_y, CH_TOP - 0.02, iz1 - soot, iz1, M["matte"])
    # hearth
    box_span("hearth_stone", cx0 - 0.3, cx1 + 0.3, BASE1, BASE1 + 0.06, cz1 - 0.05, cz1 + 0.5, M["concrete"])
    box_span("mantel_shelf", cx0 - 0.3, cx1 + 0.3, mantel_y, mantel_y + 0.12, cz1 - 0.1, cz1 + 0.35, M["wood_in"], bevel=0.015)
    box_span("fire_glow", CH_X - 0.3, CH_X + 0.3, BASE1 + 0.15, BASE1 + 0.5, CH_Z - 0.2, CH_Z + 0.3, M["fire"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    K.cylinder("fire_log_0", 0.06, 0.6, (CH_X - 0.05, BASE1 + 0.12, CH_Z + 0.1), M["bark"], segments=7, axis="x")
    K.cylinder("fire_log_1", 0.05, 0.5, (CH_X + 0.1, BASE1 + 0.2, CH_Z - 0.05), M["bark"], segments=7, axis="x", rot=(0, 0, 0.35))

    # ---- porch: deck boards, joists, posts, beam, braces, roof, steps ----
    pz0, pz1 = z1, z1 + 2.5
    board_w = 0.23
    n = int(11.5 / board_w)
    for i in range(n):
        bx = -40.75 + i * board_w
        box_span(f"porch_board_{i}", bx + 0.006, bx + board_w - 0.006, 0.31, 0.35, pz0, pz1, M["wood"])
    for jz in (pz0 + 0.15, pz0 + 1.2, pz1 - 0.15):
        box_span(f"porch_joist_{jz}", -40.75, -29.25, 0.16, 0.31, jz - 0.05, jz + 0.05, M["wood"])
    box_span("porch_rim", -40.75, -29.25, 0.12, 0.35, pz1 - 0.04, pz1 + 0.02, M["wood"])
    for px in (-40.5, -35.0, -29.5):
        box_span(f"porch_pier_{px}", px - 0.2, px + 0.2, 0.0, 0.16, pz1 - 0.35, pz1 + 0.05, M["concrete"])
    for px in (-39.5, -35.0, -30.5):
        box_span(f"porch_post_base_{px}", px - 0.18, px + 0.18, 0.0, 0.42, 28.02, 28.38, M["concrete"], bevel=0.02)
        box_span(f"porch_post_{px}", px - 0.125, px + 0.125, 0.42, 3.15, 28.075, 28.325, M["wood"], bevel=0.012)
        # knee braces
        for s in (-1, 1):
            K.mesh(f"porch_brace_{px}_{s}", [(px + s * 0.125, 2.3, 28.1), (px + s * 0.125, 2.3, 28.3), (px + s * 0.125, 2.42, 28.3), (px + s * 0.125, 2.42, 28.1),
                                            (px + s * 0.75, 3.0, 28.1), (px + s * 0.75, 3.0, 28.3), (px + s * 0.75, 3.1, 28.3), (px + s * 0.75, 3.1, 28.1)],
                   [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M["wood"])
    box_span("porch_beam", -41.0, -29.0, 3.0, 3.15, 28.05, 28.35, M["wood"], bevel=0.012)
    # porch roof: rafters + metal sheet sloping from 3.35 at the wall to 3.15 at the edge
    for i in range(12):
        rx = -40.9 + i * (11.9 / 11)
        K.mesh(f"porch_rafter_{i}", [(rx - 0.04, 3.2, z1), (rx + 0.04, 3.2, z1), (rx + 0.04, 3.3, z1), (rx - 0.04, 3.3, z1),
                                    (rx - 0.04, 3.0, 28.8), (rx + 0.04, 3.0, 28.8), (rx + 0.04, 3.1, 28.8), (rx - 0.04, 3.1, 28.8)],
               [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M["wood"])
    v = [(-41.0, 3.35, z1), (-29.0, 3.35, z1), (-29.0, 3.15, 28.85), (-41.0, 3.15, 28.85)]
    vb = [(x, y - 0.05, z) for (x, y, z) in v]
    K.mesh("porch_roof_sheet", v + vb, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M["roof"])
    box_span("porch_roof_gutter", -41.0, -29.0, 3.02, 3.16, 28.85, 28.98, M["steel"])
    # steps (collider: x -36.5..-33.5, z 28.5..29, y 0.075..0.225)
    box_span("porch_step", -36.5, -33.5, 0.0, 0.225, 28.5, 29.0, M["concrete"], bevel=0.02)
    # porch lamp by the door
    K.box("porch_lamp_bracket", (0.06, 0.06, 0.28), (-36.9, 2.55, z1 + 0.14), M["steel"])
    K.box("porch_lamp_body", (0.22, 0.32, 0.22), (-36.9, 2.35, z1 + 0.3), M["steel"], bevel=0.01)
    K.box("porch_lamp_glass", (0.16, 0.22, 0.16), (-36.9, 2.35, z1 + 0.3), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})

    # ---- interior stairs along the left wall ----
    stair_x = -38.9
    tread_w = 1.4
    rise = F / 16
    for i in range(16):
        y_top = BASE1 + (i + 1) * rise
        zc = 18.8 + i * 0.3
        box_span(f"stair_tread_{i}", stair_x - tread_w / 2, stair_x + tread_w / 2, y_top - 0.045, y_top, zc - 0.17, zc + 0.15, M["wood_in"])
        box_span(f"stair_riser_{i}", stair_x - tread_w / 2 + 0.02, stair_x + tread_w / 2 - 0.02, y_top - rise, y_top - 0.045, zc - 0.17, zc - 0.13, M["wood_in"])
    # stringers
    for sx in (stair_x - tread_w / 2 - 0.03, stair_x + tread_w / 2 + 0.03):
        K.mesh(f"stair_stringer_{sx}", [(sx - 0.03, BASE1, 18.6), (sx + 0.03, BASE1, 18.6), (sx + 0.03, BASE1 + 0.35, 18.6), (sx - 0.03, BASE1 + 0.35, 18.6),
                                        (sx - 0.03, BASE2 - 0.35, 23.6), (sx + 0.03, BASE2 - 0.35, 23.6), (sx + 0.03, BASE2, 23.6), (sx - 0.03, BASE2, 23.6)],
               [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M["wood_in"])
    # transition landing plate
    box_span("stair_landing_plate", stair_x - tread_w / 2, stair_x + tread_w / 2, BASE2 - 0.05, BASE2, 23.3, 23.6, M["wood_in"])
    # room-side handrail
    rail_x = stair_x + tread_w / 2 + 0.04
    for k in range(6):
        zc = 18.9 + k * 0.9
        y_step = BASE1 + ((zc - 18.8) / 0.3 + 1) * rise
        box_span(f"stair_baluster_{k}", rail_x - 0.025, rail_x + 0.025, y_step, y_step + 0.9, zc - 0.025, zc + 0.025, M["wood_in"])
    K.mesh("stair_handrail", [(rail_x - 0.03, BASE1 + rise + 0.9, 18.85), (rail_x + 0.03, BASE1 + rise + 0.9, 18.85), (rail_x + 0.03, BASE1 + rise + 0.96, 18.85), (rail_x - 0.03, BASE1 + rise + 0.96, 18.85),
                              (rail_x - 0.03, BASE2 + 0.9, 23.5), (rail_x + 0.03, BASE2 + 0.9, 23.5), (rail_x + 0.03, BASE2 + 0.96, 23.5), (rail_x - 0.03, BASE2 + 0.96, 23.5)],
           [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], M["wood_in"])
    # 2F guard rail around the stair void (x -38 edge, z 18..23) and landing edge
    box_span("void_rail_top", -38.02, -37.94, BASE2 + 0.2, BASE2 + 1.05, 18.0, 23.0, M["wood_in"])
    for k in range(6):
        zc = 18.2 + k * 0.9
        box_span(f"void_post_{k}", -38.02, -37.94, BASE2 + 0.2, BASE2 + 1.0, zc - 0.03, zc + 0.03, M["wood_in"])


def build_interior(M):
    hx, hz = HX, HZ
    f2 = BASE2
    def b(name, size, pos, mat, bevel=0.0, tags=None):
        # interior clutter stays un-bevelled: it is rarely seen up close and
        # the bevel modifier quadruples its triangle count
        return K.box(name, size, pos, mat, bevel=0.0, tags=tags)
    # living room
    sx, sz = hx - 1.5, hz - HD / 2 + 1.5
    b("sofa_base", (2.5, 0.45, 0.9), (sx, 0.58, sz), M["fabric"])
    b("sofa_back", (2.5, 0.6, 0.12), (sx, 0.95, sz - 0.42), M["fabric"])
    b("sofa_arm_l", (0.12, 0.4, 0.9), (sx - 1.25, 0.75, sz), M["fabric"])
    b("sofa_arm_r", (0.12, 0.4, 0.9), (sx + 1.25, 0.75, sz), M["fabric"])
    b("pillow_0", (0.3, 0.25, 0.25), (sx - 0.8, 0.92, sz + 0.15), M["fabric_warm"])
    b("pillow_1", (0.3, 0.25, 0.25), (sx + 0.8, 0.92, sz + 0.15), M["linen"])
    b("coffee_table", (1.0, 0.06, 0.5), (sx, 0.58, sz + 1.2), M["wood_in"])
    for dx, dz in ((-0.4, -0.2), (0.4, -0.2), (-0.4, 0.2), (0.4, 0.2)):
        b(f"coffee_leg_{dx}_{dz}", (0.06, 0.2, 0.06), (sx + dx, 0.45, sz + 1.2 + dz), M["wood_in"], bevel=0)
    b("rug", (3.0, 0.02, 3.0), (sx, 0.51, sz + 0.8), M["fabric_warm"], bevel=0, tags={"castShadow": False})
    b("tv_stand", (1.5, 0.5, 0.4), (sx, 0.6, sz + 2.8), M["wood_in"])
    b("tv", (1.4, 0.8, 0.06), (sx, 1.55, sz + 2.7), M["matte"])
    # bookshelf in the right-front corner (collider x -30.65..-30.25, z 24.6..25.7), clear of the window band
    shelf_x, shelf_z = hx + HW / 2 - 0.45, hz + HD / 2 - 0.85
    b("bookshelf", (0.4, 1.8, 1.1), (shelf_x, 1.25, shelf_z), M["wood_in"])
    for k in range(3):
        b(f"bookshelf_plank_{k}", (0.36, 0.03, 1.04), (shelf_x - 0.02, 0.62 + k * 0.5, shelf_z), M["wood_in"], bevel=0)
    for i, (w, h, mat) in enumerate(((0.3, 0.25, "fabric_warm"), (0.25, 0.3, "fabric"), (0.35, 0.25, "linen"))):
        b(f"book_{i}", (0.18, h, w), (shelf_x - 0.06, 0.78 + (i == 2) * 0.5, shelf_z - 0.35 + i * 0.3), M[mat], bevel=0)
    K.cylinder("floor_lamp_pole", 0.03, 1.6, (sx + 1.6, 1.15, sz - 0.2), M["steel"], segments=8)
    b("floor_lamp_shade", (0.35, 0.25, 0.35), (sx + 1.6, 2.0, sz - 0.2), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    # kitchen
    kx, kz = hx - HW / 2 + 2.5, hz + 1.5
    b("fridge", (0.8, 2.0, 0.7), (kx - 1.0, 1.35, kz + 1.5), M["white"], bevel=0.015)
    b("fridge_handle_u", (0.04, 0.5, 0.04), (kx - 0.7, 1.8, kz + 1.14), M["steel"], bevel=0)
    b("fridge_handle_l", (0.04, 0.4, 0.04), (kx - 0.7, 0.8, kz + 1.14), M["steel"], bevel=0)
    b("counter", (2.0, 0.9, 0.6), (kx, 0.8, kz + 1.5), M["wood_in"])
    b("counter_top", (2.0, 0.06, 0.65), (kx, 1.28, kz + 1.5), M["linen"])
    b("sink", (0.5, 0.05, 0.35), (kx + 0.3, 1.29, kz + 1.5), M["steel"], bevel=0)
    K.cylinder("faucet", 0.02, 0.25, (kx + 0.3, 1.43, kz + 1.75), M["steel"], segments=6)
    b("stove", (0.6, 0.04, 0.55), (kx - 0.5, 1.29, kz + 1.5), M["matte"], bevel=0)
    b("upper_cabinets", (2.0, 0.7, 0.35), (kx, 2.5, kz + 1.65), M["wood_in"])
    K.cylinder("pot", 0.12, 0.15, (kx - 0.5, 1.38, kz + 1.5), M["steel"], segments=10)
    # dining
    dx, dz = hx + 2.0, hz + 2.2
    b("dining_table", (1.6, 0.06, 0.9), (dx, 1.1, dz), M["wood_in"])
    for ox, oz in ((-0.7, -0.35), (0.7, -0.35), (-0.7, 0.35), (0.7, 0.35)):
        b(f"dining_leg_{ox}_{oz}", (0.06, 0.72, 0.06), (dx + ox, 0.72, dz + oz), M["wood_in"], bevel=0)
    for ox, oz, back in ((-0.4, -0.7, -0.9), (0.4, -0.7, -0.9), (-0.4, 0.7, 0.9), (0.4, 0.7, 0.9)):
        b(f"chair_seat_{ox}_{oz}", (0.4, 0.06, 0.4), (dx + ox, 0.8, dz + oz), M["wood_in"], bevel=0)
        b(f"chair_back_{ox}_{oz}", (0.4, 0.8, 0.06), (dx + ox, 1.1, dz + back), M["wood_in"], bevel=0)
        for lx, lz in ((-0.17, -0.17), (0.17, -0.17), (-0.17, 0.17), (0.17, 0.17)):
            b(f"chair_leg_{ox}_{oz}_{lx}_{lz}", (0.04, 0.44, 0.04), (dx + ox + lx, 0.58, dz + oz + lz), M["wood_in"], bevel=0)
    # entryway
    K.cylinder("coat_rack", 0.04, 1.8, (hx - 1.2, 1.25, hz + HD / 2 - 0.5), M["steel"], segments=8)
    b("coat_rack_top", (0.5, 0.04, 0.04), (hx - 1.2, 2.15, hz + HD / 2 - 0.5), M["steel"], bevel=0)
    b("shoe_rack", (0.8, 0.3, 0.3), (hx + 1.0, 0.5, hz + HD / 2 - 0.5), M["wood_in"])
    b("welcome_mat", (1.2, 0.02, 0.6), (hx, 0.51, hz + HD / 2 - 0.4), M["fabric_warm"], bevel=0, tags={"castShadow": False})
    b("ac_unit", (1.0, 0.35, 0.25), (hx + HW / 2 - 0.15 - 0.25, 3.8, hz - 1.0), M["white"])
    b("plant_pot_1f", (0.3, 0.3, 0.3), (hx - HW / 2 + 0.5, 0.65, hz + 1.0), M["fabric_warm"])
    # 2F bedroom
    bx = hx - 0.5
    b("bed", (2.2, 0.4, 1.8), (bx, f2 + 0.2, hz - 1.0), M["linen"])
    b("headboard", (2.2, 0.7, 0.15), (bx, f2 + 0.35, hz - 1.9), M["wood_in"])
    b("footboard", (2.2, 0.4, 0.1), (bx, f2 + 0.2, hz - 0.1), M["wood_in"])
    b("blanket", (2.0, 0.06, 1.3), (bx, f2 + 0.45, hz - 0.7), M["fabric"], bevel=0)
    b("pillow_bed_0", (0.5, 0.08, 0.35), (bx, f2 + 0.45, hz - 1.6), M["linen"], bevel=0)
    b("pillow_bed_1", (0.45, 0.08, 0.3), (bx + 0.6, f2 + 0.45, hz - 1.6), M["linen"], bevel=0)
    for side in (-1.5, 1.5):
        b(f"bedside_{side}", (0.45, 0.45, 0.45), (bx + side, f2 + 0.22, hz - 1.0), M["wood_in"])
    K.cylinder("bedside_lamp_pole", 0.03, 0.3, (bx + 1.5, f2 + 0.6, hz - 1.0), M["steel"], segments=6)
    b("bedside_lamp_shade", (0.2, 0.18, 0.2), (bx + 1.5, f2 + 0.85, hz - 1.0), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    b("bed_rug", (1.8, 0.02, 0.8), (bx, f2 + 0.21, hz + 0.5), M["fabric_warm"], bevel=0, tags={"castShadow": False})
    # study
    b("desk", (1.5, 0.06, 0.6), (hx + 1.5, f2 + 0.75, hz + HD / 2 - 0.7), M["wood_in"])
    for ox in (-0.7, 0.7):
        b(f"desk_side_{ox}", (0.06, 0.75, 0.55), (hx + 1.5 + ox, f2 + 0.38, hz + HD / 2 - 0.7), M["wood_in"], bevel=0)
    b("desk_chair", (0.45, 0.06, 0.45), (hx + 1.5, f2 + 0.55, hz + HD / 2 - 1.5), M["matte"], bevel=0)
    K.cylinder("desk_chair_pole", 0.03, 0.2, (hx + 1.5, f2 + 0.42, hz + HD / 2 - 1.5), M["steel"], segments=6)
    b("monitor", (0.6, 0.4, 0.04), (hx + 1.5, f2 + 1.15, hz + HD / 2 - 0.55), M["matte"], bevel=0)
    b("monitor_stand", (0.15, 0.2, 0.15), (hx + 1.5, f2 + 0.88, hz + HD / 2 - 0.6), M["matte"], bevel=0)
    # wardrobe & dresser
    b("wardrobe", (1.2, 2.4, 0.55), (hx - 0.5, f2 + 1.2, hz - HD / 2 + 0.65), M["wood_in"])
    b("dresser", (0.9, 0.8, 0.45), (hx + 0.8, f2 + 0.4, hz - HD / 2 + 0.6), M["wood_in"])
    b("mirror_frame", (0.8, 1.0, 0.06), (hx + 0.8, f2 + 1.5, hz - HD / 2 + 0.28), M["wood_in"], bevel=0)
    b("mirror", (0.7, 0.9, 0.02), (hx + 0.8, f2 + 1.5, hz - HD / 2 + 0.32), M["glass"], bevel=0, tags={"castShadow": False})
    b("plant_pot_2f", (0.25, 0.25, 0.25), (hx - HW / 2 + 1.0, f2 + 0.12, hz + 1.5), M["fabric_warm"])
    b("laundry_basket", (0.5, 0.5, 0.4), (hx - HW / 2 + 0.7, f2 + 0.25, hz - HD / 2 + 0.6), M["linen"])
    b("ceiling_light_2f", (0.5, 0.08, 0.5), (hx + 1.5, f2 + F - 0.14, hz), M["lamp"], bevel=0, tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    b("ceiling_light_1f", (0.6, 0.08, 0.6), (hx + 1.0, BASE1 + F - 0.14, hz), M["lamp"], bevel=0, tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    for (px, py) in ((hx - 2, 2.4), (hx - 1, F + 2.4)):
        b(f"photo_frame_{py}", (0.9, 0.7, 0.05), (px, py, hz - HD / 2 + 0.28), M["wood_in"], bevel=0)
        b(f"photo_{py}", (0.75, 0.55, 0.02), (px, py, hz - HD / 2 + 0.31), M["fabric"], bevel=0, tags={"castShadow": False})


# --------------------------------------------------------------------------- #
# Garden, vegetation, lamps, grounds
# --------------------------------------------------------------------------- #

GX, GZ = -48.0, 38.0


def rock(name, center, radius, height, M, seed=0, lod="LOD0"):
    """Low-poly boulder: jittered icosphere scaled to radius/height."""
    import bmesh
    from mathutils import Vector
    rng = K.rng
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for v in bm.verts:
        j = 1.0 + rng.uniform(-0.22, 0.22)
        v.co = Vector((v.co.x * radius * j, v.co.y * radius * j * rng.uniform(0.85, 1.15), max(v.co.z, -0.35) * height * j))
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = zk.to_blender(center)
    obj.rotation_euler = (0, 0, rng.uniform(0, math.tau))
    for poly in mesh.polygons:
        poly.use_smooth = False
    return K._finish(obj, M["rock"], lod, None, 0.0)


LEAF_ATLAS_COLUMNS = 2


def card_cluster(name, center, radii, count, size, mats, tags, lod="LOD0", tilt=0.9, atlas_columns=LEAF_ATLAS_COLUMNS):
    """Randomly oriented alpha cards inside an ellipsoid (canopy / shrub).

    Cards alternate between the atlas columns of the leaf texture so one material
    still yields two looks (darker / lighter clusters).
    """
    rng = K.rng
    cx, cy, cz = center
    rx, ry, rz = radii
    for i in range(count):
        # sample inside ellipsoid
        while True:
            u, v, w = rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1)
            if u * u + v * v + w * w <= 1.0:
                break
        px, py, pz = cx + u * rx * 0.75, cy + v * ry * 0.7, cz + w * rz * 0.75
        yaw = rng.uniform(0, math.tau)
        pitch = rng.uniform(-tilt, tilt)
        s = size * rng.uniform(0.8, 1.25)
        # build a quad in local space, rotate, translate
        hw = s / 2
        local = [(-hw, -hw, 0), (hw, -hw, 0), (hw, hw, 0), (-hw, hw, 0)]
        cy_, sy_ = math.cos(yaw), math.sin(yaw)
        cp, sp = math.cos(pitch), math.sin(pitch)
        verts = []
        for (a, b, c) in local:
            # rotate about x by pitch then about y by yaw
            b2, c2 = b * cp - c * sp, b * sp + c * cp
            a3, c3 = a * cy_ + c2 * sy_, -a * sy_ + c2 * cy_
            verts.append((px + a3, py + b2, pz + c3))
        col = i % atlas_columns
        u0, u1 = col / atlas_columns, (col + 1) / atlas_columns
        K.mesh(f"{name}_card{i}", verts, [(0, 1, 2, 3)], mats[i % len(mats)], lod=lod,
               tags=tags, uvs=[(u0, 0), (u1, 0), (u1, 1), (u0, 1)])


def tree(name, x, z, scale, M, lod="LOD0"):
    rng = K.rng
    th = 3.4 * scale
    K.cylinder(f"{name}_trunk", 0.24 * scale, th, (x, th / 2, z), M["bark"], segments=8, radius_top=0.13 * scale, lod=lod)
    if lod == "LOD0":
        # short primary branches fanning out of the trunk top, staying inside the canopy
        for b in range(3):
            ang = b * 2.1 + rng.uniform(-0.3, 0.3)
            bl = 1.0 * scale
            bx, bz = x + math.cos(ang) * bl * 0.3, z + math.sin(ang) * bl * 0.3
            branch = K.cylinder(f"{name}_branch{b}", 0.06 * scale, bl, (bx, th + bl * 0.3, bz), M["bark"],
                                segments=5, radius_top=0.03 * scale, lod=lod)
            # Blender: tilt about the horizontal axis perpendicular to the branch direction.
            # direction in Blender xy = (cos a, sin(-a)) since three z -> blender -y
            branch.rotation_euler = (math.sin(-ang) * -0.75, math.cos(ang) * 0.75, 0.0)
    canopy_c = (x, th + 0.9 * scale, z)
    radii = (1.9 * scale, 1.5 * scale, 1.9 * scale)
    tags = {"weaponImpactKind": "foliage", "ambientMotion": "sway-canopy", "ignoreWeaponRaycast": False}
    if lod == "LOD0":
        card_cluster(f"{name}_canopy", canopy_c, radii, 14, 2.1 * scale, [M["leaf"], M["leaf_light"]], tags, lod=lod)
    else:
        # two crossed vertical cards
        hw, hh = 1.9 * scale, 1.6 * scale
        cx, cy, cz = canopy_c
        for k, (dx, dz) in enumerate(((1, 0), (0, 1))):
            verts = [(cx - dx * hw, cy - hh, cz - dz * hw), (cx + dx * hw, cy - hh, cz + dz * hw),
                     (cx + dx * hw, cy + hh, cz + dz * hw), (cx - dx * hw, cy + hh, cz - dz * hw)]
            K.mesh(f"{name}_lod1card{k}", verts, [(0, 1, 2, 3)], M["leaf"], lod=lod, tags=tags,
                   uvs=[(0, 0), (1 / LEAF_ATLAS_COLUMNS, 0), (1 / LEAF_ATLAS_COLUMNS, 1), (0, 1)])


def shrub(name, x, z, r, M, mats=None):
    # single leaf material for shrubs -> one batch for every shrub in the zone
    tags = {"weaponImpactKind": "foliage", "ambientMotion": "sway-canopy"}
    card_cluster(name, (x, r * 0.55, z), (r, r * 0.6, r), 7, r * 1.15, mats or [M["leaf_light"]], tags, tilt=0.7)


def tuft(name, x, z, size, M, mat=None, base_y=0.12):
    """Two crossed vertical grass cards."""
    motion = "sway-reed" if (mat is not None and mat.name == "MAT_REED") else "sway-grass"
    tags = {"weaponImpactKind": "foliage", "ambientMotion": motion, "ignoreWeaponRaycast": True}
    rng = K.rng
    yaw = rng.uniform(0, math.pi)
    mat = mat or M["grass"]
    for k in range(2):
        a = yaw + k * math.pi / 2
        dx, dz = math.cos(a) * size / 2, math.sin(a) * size / 2
        verts = [(x - dx, base_y, z - dz), (x + dx, base_y, z + dz), (x + dx, base_y + size * 0.85, z + dz), (x - dx, base_y + size * 0.85, z - dz)]
        K.mesh(f"{name}_{k}", verts, [(0, 1, 2, 3)], mat, tags=tags, uvs=[(0, 0), (1, 0), (1, 1), (0, 1)])


def blossom(name, x, y, z, mat, r=0.09):
    """Tiny six-sided blossom (stem + flattened head) instead of a raw cube."""
    K.cylinder(f"{name}_stem", 0.012, 0.16, (x, y - 0.1, z), _M["stem"], segments=4)
    K.cylinder(f"{name}_head", r, 0.05, (x, y, z), mat, segments=6, radius_top=r * 0.55, tags={"castShadow": False})


_M: dict = {}


def stone_lantern(name, x, z, M):
    box_span(f"{name}_base", x - 0.2, x + 0.2, 0.0, 0.2, z - 0.2, z + 0.2, M["rock"], bevel=0.02)
    box_span(f"{name}_shaft", x - 0.09, x + 0.09, 0.2, 1.0, z - 0.09, z + 0.09, M["rock"])
    box_span(f"{name}_collar", x - 0.16, x + 0.16, 1.0, 1.06, z - 0.16, z + 0.16, M["rock"])
    box_span(f"{name}_house", x - 0.2, x + 0.2, 1.06, 1.36, z - 0.2, z + 0.2, M["rock"])
    K.box(f"{name}_glow", (0.3, 0.2, 0.3), (x, 1.21, z), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    box_span(f"{name}_roof", x - 0.29, x + 0.29, 1.36, 1.46, z - 0.29, z + 0.29, M["rock"], bevel=0.03)
    box_span(f"{name}_finial", x - 0.08, x + 0.08, 1.46, 1.6, z - 0.08, z + 0.08, M["rock"])


def lamp_post(name, x, z, M, lod="LOD0"):
    box_span(f"{name}_base", x - 0.25, x + 0.25, 0.0, 0.32, z - 0.25, z + 0.25, M["concrete"], bevel=0.02, lod=lod)
    K.cylinder(f"{name}_post", 0.06, 3.0, (x, 0.32 + 1.5, z), M["steel"], segments=8, radius_top=0.045, lod=lod)
    if lod == "LOD0":
        K.box(f"{name}_arm", (0.08, 0.08, 0.5), (x, 3.3, z + 0.22), M["steel"])
        K.box(f"{name}_head", (0.34, 0.12, 0.34), (x, 3.42, z + 0.4), M["steel"], bevel=0.01)
        K.box(f"{name}_glass", (0.26, 0.3, 0.26), (x, 3.22, z + 0.4), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
        K.box(f"{name}_cap", (0.38, 0.05, 0.38), (x, 3.5, z + 0.4), M["steel"])


def octagon(cx, cz, apothem):
    r = apothem / math.cos(math.pi / 8)
    return [(cx + r * math.cos(math.pi / 8 + k * math.pi / 4), cz + r * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)]


def build_garden(M):
    # ground: lawn (matches old base lawn footprint) + garden square top 0.18
    box_span("lawn_main", -55.0, -25.0, 0.0, 0.12, 18.5, 43.5, M["lawn"], tags={"castShadow": False})
    box_span("lawn_ferris_edge", -25.0, -17.6, 0.0, 0.12, 24.0, 43.5, M["lawn"], tags={"castShadow": False})
    box_span("garden_ground", GX - 7, GX + 7, 0.0, 0.18, GZ - 7, GZ + 7, M["lawn"], tags={"castShadow": False})
    # low stone curb around the raised garden square so the 6 cm step reads as designed
    for (xa, xb, za, zb) in ((GX - 7.1, GX + 7.1, GZ - 7.1, GZ - 6.9), (GX - 7.1, GX + 7.1, GZ + 6.9, GZ + 7.1),
                             (GX - 7.1, GX - 6.9, GZ - 7.1, GZ + 7.1), (GX + 6.9, GX + 7.1, GZ - 7.1, GZ + 7.1)):
        box_span(f"garden_curb_{xa}_{za}", xa, xb, 0.0, 0.22, za, zb, M["paving"], bevel=0.015)
    # stone apron around the pond (octagon ring 3.5..4.6 apothem) as flat polygon at 0.19
    outer = octagon(GX, GZ, 4.6); inner = octagon(GX, GZ, 3.5)
    verts = [(x, 0.19, z) for (x, z) in outer] + [(x, 0.19, z) for (x, z) in inner]
    faces = [(k, (k + 1) % 8, 8 + (k + 1) % 8, 8 + k) for k in range(8)]
    K.mesh("pond_apron", verts, faces, M["paving"], tags={"castShadow": False})

    # ---- octagonal pond (collider 7 x 7 x 0.4) ----
    outer = octagon(GX, GZ, 3.5); inner = octagon(GX, GZ, 3.0)
    top_o = [(x, 0.4, z) for (x, z) in outer]; top_i = [(x, 0.4, z) for (x, z) in inner]
    bot_o = [(x, 0.0, z) for (x, z) in outer]; bot_i = [(x, 0.26, z) for (x, z) in inner]
    verts = top_o + top_i + bot_o + bot_i
    faces = []
    for k in range(8):
        k2 = (k + 1) % 8
        faces.append((k, k2, 8 + k2, 8 + k))              # top ring
        faces.append((16 + k2, 16 + k, k, k2))            # outer side
        faces.append((8 + k, 8 + k2, 24 + k2, 24 + k))    # inner side (down to water bed)
    K.mesh("pond_coping", verts, faces, M["rock"], bevel=0.03)
    water_v = [(x, 0.3, z) for (x, z) in octagon(GX, GZ, 3.02)]
    K.mesh("pond_water", water_v, [tuple(range(8))], M["water"],
           tags={"weaponImpactKind": "water", "ambientMotion": "pond-ripple", "castShadow": False})
    bed_v = [(x, 0.26, z) for (x, z) in octagon(GX, GZ, 3.02)]
    K.mesh("pond_bed", bed_v, [tuple(range(8))], M["soil"], tags={"castShadow": False})
    # corner planter boxes (triangular prisms filling the 7 x 7 corners)
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = GX + sx * 3.5, GZ + sz * 3.5
            a = (cx - sx * 2.35, cz); b = (cx, cz - sz * 2.35)
            tri = [(cx, cz), a, b]
            if (sx * sz) > 0:
                tri = [(cx, cz), b, a]
            v0 = [(x, 0.0, z) for (x, z) in tri]; v1 = [(x, 0.42, z) for (x, z) in tri]
            name = f"planter_{sx}_{sz}"
            K.mesh(name, v0 + v1, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], M["wood"], bevel=0.02)
            # rim boards
            for (p, q) in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
                mx, mz = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
                L = math.hypot(q[0] - p[0], q[1] - p[1]); ang = math.atan2(-(q[1] - p[1]), q[0] - p[0])
                K.box(f"{name}_rim_{mx:.2f}_{mz:.2f}", (L + 0.08, 0.05, 0.16), (mx, 0.445, mz), M["wood"], rot_y=ang)
            # soil + planting
            s0 = [(cx + (x - cx) * 0.8, 0.36, cz + (z - cz) * 0.8) for (x, z) in tri]
            K.mesh(f"{name}_soil", s0, [(0, 1, 2)], M["soil"], tags={"castShadow": False})
            for i in range(4):
                t = K.rng.uniform(0.25, 0.75); u = K.rng.uniform(0.2, 0.6)
                px = cx + (a[0] - cx) * t * u + (b[0] - cx) * (1 - t) * u
                pz = cz + (a[1] - cz) * t * u + (b[1] - cz) * (1 - t) * u
                tuft(f"{name}_tuft{i}", px, pz, 0.55, M, base_y=0.38)
                blossom(f"{name}_flower{i}", px + 0.15, 0.66, pz - 0.1, M["flower_yellow" if (i + sx) % 2 else "flower_pink"])
    # lily pads + lotus
    for i, ang in enumerate((0.3, 1.5, 2.8, 4.2, 5.5, 0.9, 3.6)):
        r = 1.2 + (i % 3) * 0.55
        px, pz = GX + math.cos(ang) * r, GZ + math.sin(ang) * r
        pad = K.cylinder(f"lily_pad_{i}", 0.24 + (i % 2) * 0.06, 0.02, (px, 0.31, pz), M["lily"], segments=10,
                         tags={"castShadow": False, "ambientMotion": "lily-bob", "weaponImpactKind": "water"})
        if i in (1, 4):
            K.cylinder(f"lotus_{i}", 0.1, 0.1, (px + 0.1, 0.37, pz), M["flower_pink"], segments=6, radius_top=0.035,
                       tags={"castShadow": False, "weaponImpactKind": "water", "ambientMotion": "lily-bob"})
    # rock island — colliders: base 2.4 x 2.4 (0.1..0.6), main 1 x 1 to 2.4 m, second to 1.9, third to 1.5.
    # Read as a stone pagoda lantern (tō) on a rock mound with a bonsai pine and a standing stone.
    hx_, hz_ = GX + 0.5, GZ
    rock("island_base", (hx_, 0.22, hz_), 1.15, 0.42, M)
    for i, (dx, dz, r, h) in enumerate(((0.55, 0.55, 0.32, 0.22), (-0.6, -0.4, 0.3, 0.2), (0.15, -0.7, 0.26, 0.18), (-0.5, 0.5, 0.24, 0.16))):
        rock(f"island_rock_{i}", (hx_ + dx, 0.56, hz_ + dz), r, h, M)
    px, pz = hx_, hz_ - 0.1
    box_span("pagoda_plinth", px - 0.42, px + 0.42, 0.55, 0.75, pz - 0.42, pz + 0.42, M["rock"], bevel=0.02)
    box_span("pagoda_shaft", px - 0.16, px + 0.16, 0.75, 1.25, pz - 0.16, pz + 0.16, M["rock"])
    box_span("pagoda_house_1", px - 0.3, px + 0.3, 1.25, 1.55, pz - 0.3, pz + 0.3, M["rock"])
    K.box("pagoda_glow_1", (0.42, 0.2, 0.42), (px, 1.4, pz), M["lamp"], tags={"castShadow": False, "ambientMotion": "lamp-flicker"})
    box_span("pagoda_roof_1", px - 0.45, px + 0.45, 1.55, 1.68, pz - 0.45, pz + 0.45, M["rock"], bevel=0.03)
    box_span("pagoda_shaft_2", px - 0.12, px + 0.12, 1.68, 1.9, pz - 0.12, pz + 0.12, M["rock"])
    box_span("pagoda_house_2", px - 0.22, px + 0.22, 1.9, 2.12, pz - 0.22, pz + 0.22, M["rock"])
    box_span("pagoda_roof_2", px - 0.36, px + 0.36, 2.12, 2.24, pz - 0.36, pz + 0.36, M["rock"], bevel=0.03)
    box_span("pagoda_finial", px - 0.06, px + 0.06, 2.24, 2.4, pz - 0.06, pz + 0.06, M["rock"])
    # bonsai pine on the second peak spot (to 1.9 m) and standing stone on the third (to 1.5 m)
    K.cylinder("bonsai_trunk", 0.06, 1.15, (hx_ + 0.4, 0.55 + 0.575, hz_ + 0.25), M["bark"], segments=6, radius_top=0.035)
    card_cluster("bonsai_pine", (hx_ + 0.4, 1.55, hz_ + 0.25), (0.42, 0.3, 0.42), 6, 0.5, [M["leaf_light"]],
                 {"weaponImpactKind": "foliage", "ambientMotion": "sway-canopy"}, tilt=0.5)
    rock("island_standing_stone", (hx_ - 0.35, 0.72, hz_ + 0.15), 0.24, 0.78, M)
    # raised herb bed (collider 4.3 x 4.3 x 0.3)
    bx0, bx1, bz0, bz1 = -45.65, -41.35, 34.35, 38.65
    for (xa, xb, za, zb) in ((bx0, bx1, bz0, bz0 + 0.12), (bx0, bx1, bz1 - 0.12, bz1), (bx0, bx0 + 0.12, bz0, bz1), (bx1 - 0.12, bx1, bz0, bz1)):
        box_span(f"herb_bed_side_{xa}_{za}", xa, xb, 0.0, 0.3, za, zb, M["wood"], bevel=0.015)
    box_span("herb_bed_soil", bx0 + 0.1, bx1 - 0.1, 0.0, 0.26, bz0 + 0.1, bz1 - 0.1, M["soil"], tags={"castShadow": False})
    for i in range(9):
        px = bx0 + 0.5 + (i % 3) * 1.6 + K.rng.uniform(-0.2, 0.2)
        pz = bz0 + 0.5 + (i // 3) * 1.6 + K.rng.uniform(-0.2, 0.2)
        tuft(f"herb_tuft_{i}", px, pz, 0.6, M, mat=M["grass"] if i % 3 else M["reed"], base_y=0.27)
        if i % 2:
            blossom(f"herb_flower_{i}", px + 0.2, 0.56, pz + 0.15, M["flower_yellow"])
    # bridge over the west side of the pond (collider x -50.2..-49, z 34.75..41.25, y 0.3..0.55)
    for i in range(int(6.5 / 0.16)):
        z = 34.75 + i * 0.16
        box_span(f"bridge_plank_{i}", -50.2, -49.0, 0.5, 0.55, z + 0.005, z + 0.155, M["wood"])
    for sx in (-50.15, -49.05):
        box_span(f"bridge_stringer_{sx}", sx - 0.05, sx + 0.05, 0.36, 0.5, 34.75, 41.25, M["wood"])
        for k in range(6):
            pz = 35.15 + k * 1.18
            box_span(f"bridge_post_{sx}_{k}", sx - 0.035, sx + 0.035, 0.55, 1.03, pz - 0.035, pz + 0.035, M["wood"])
        box_span(f"bridge_rail_{sx}", sx - 0.03, sx + 0.03, 0.99, 1.05, 35.0, 41.0, M["wood"])
    for pz in (36.4, 39.6):
        for sx in (-50.05, -49.15):
            K.cylinder(f"bridge_pile_{sx}_{pz}", 0.06, 0.4, (sx, 0.18, pz), M["wood"], segments=6)
    # stone lanterns (colliders at (-44, 34.5), (-52.5, 41.5))
    stone_lantern("lantern_e", -44.0, 34.5, M)
    stone_lantern("lantern_w", -52.5, 41.5, M)
    # stone bench (collider x -45..-43, z 41.725..42.275, y 0.44..0.56)
    box_span("bench_seat", -45.0, -43.0, 0.44, 0.56, 41.725, 42.275, M["rock"], bevel=0.015)
    box_span("bench_leg_0", -44.9, -44.55, 0.0, 0.44, 41.75, 42.25, M["rock"])
    box_span("bench_leg_1", -43.45, -43.1, 0.0, 0.44, 41.75, 42.25, M["rock"])
    # stepping stones: garden south row + curved path porch -> pond
    for i in range(5):
        K.cylinder(f"step_stone_s_{i}", 0.36, 0.06, (GX + 6.5 - i * 2.5, 0.21, GZ + 5.5), M["paving"], segments=7, tags={"castShadow": False})
    path = [(-35.0, 29.6), (-36.2, 30.6), (-37.6, 31.4), (-39.1, 32.1), (-40.6, 32.9), (-42.0, 33.9), (-43.3, 35.0), (-44.4, 36.3)]
    for i, (px, pz) in enumerate(path):
        K.cylinder(f"step_stone_p_{i}", 0.34 + (i % 2) * 0.05, 0.05, (px, 0.145 if pz < 31 else 0.205, pz), M["paving"], segments=7, tags={"castShadow": False})
    # reeds / bamboo clusters (no colliders in gameplay)
    for i, (x, z, h) in enumerate(((-42.5, 36.0, 2.6), (-42.2, 36.6, 2.9), (-42.7, 37.1, 2.4), (-53.5, 40.0, 2.4), (-53.2, 40.5, 2.7))):
        for k in range(2):
            a = K.rng.uniform(0, math.pi) + k * math.pi / 2
            dx, dz = math.cos(a) * 0.55, math.sin(a) * 0.55
            verts = [(x - dx, 0.18, z - dz), (x + dx, 0.18, z + dz), (x + dx, 0.18 + h, z + dz), (x - dx, 0.18 + h, z - dz)]
            K.mesh(f"reed_{i}_{k}", verts, [(0, 1, 2, 3)], M["reed"], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)],
                   tags={"weaponImpactKind": "foliage", "ambientMotion": "sway-reed", "ignoreWeaponRaycast": True})
    # decorative boulders (visual only, kept low and off routes)
    for i, (x, z, r, h) in enumerate(((-44.2, 33.8, 0.45, 0.3), (-51.6, 34.2, 0.5, 0.36), (-46.0, 43.2, 0.4, 0.26),
                                      (-53.6, 34.8, 0.7, 0.45), (-42.6, 43.3, 0.5, 0.32), (-53.3, 28.6, 0.6, 0.42),
                                      (-27.2, 42.5, 0.55, 0.36), (-29.4, 31.2, 0.42, 0.28))):
        rock(f"boulder_{i}", (x, h * 0.35, z), r, h, M)
    # shrubs around the house and garden
    for i, (x, z, r) in enumerate(((-41.2, 19.0, 0.75), (-41.4, 24.6, 0.7), (-28.8, 19.6, 0.7), (-28.6, 24.0, 0.75),
                                   (-37.2, 30.4, 0.6), (-31.4, 30.2, 0.65), (-53.4, 36.6, 0.8), (-52.8, 43.6, 0.7),
                                   (-41.6, 40.9, 0.7), (-26.5, 28.0, 0.8), (-22.0, 42.0, 0.9), (-44.8, 44.2, 0.6))):
        shrub(f"shrub_{i}", x, z, r, M)
    # grass tufts along lawn edges and the pond apron
    rng = K.rng
    for i in range(38):
        ang = rng.uniform(0, math.tau); r = rng.uniform(4.9, 6.6)
        px, pz = GX + math.cos(ang) * r, GZ + math.sin(ang) * r
        if abs(px - GX) > 6.8 or abs(pz - GZ) > 6.8:
            continue
        tuft(f"tuft_pond_{i}", px, pz, rng.uniform(0.4, 0.65), M, base_y=0.18)
    for i in range(30):
        x = rng.uniform(-54.5, -25.5); z = rng.choice([rng.uniform(18.7, 19.6), rng.uniform(42.6, 43.4)])
        if -41.5 < x < -28.5 and z < 20:  # keep the back of the house clear
            continue
        tuft(f"tuft_edge_{i}", x, z, rng.uniform(0.35, 0.6), M)
    # flower bed in front of the porch (south of the deck edge, clear of the walkway)
    box_span("front_bed_soil", -41.0, -37.2, 0.12, 0.2, 29.2, 29.9, M["soil"], tags={"castShadow": False})
    box_span("front_bed_edge", -41.0, -37.2, 0.12, 0.26, 29.9, 29.98, M["rock"])
    for i in range(6):
        px = -40.7 + i * 0.65
        blossom(f"front_bed_flower_{i}", px, 0.42, 29.5, M["flower_pink" if i % 2 else "flower_yellow"])
        tuft(f"front_bed_tuft_{i}", px + 0.2, 29.55, 0.4, M, base_y=0.2)
    # firewood stack against the west wall, garden tools
    for row in range(3):
        for k in range(5):
            K.cylinder(f"firewood_{row}_{k}", 0.09, 0.7, (-40.8, 0.6 + row * 0.19, 19.2 + k * 0.19 + (row % 2) * 0.09), M["bark"], segments=6, axis="x")
    box_span("wheelbarrow_body", -29.2, -28.3, 0.35, 0.75, 30.6, 31.4, M["steel"], bevel=0.02)
    K.cylinder("wheelbarrow_wheel", 0.22, 0.06, (-28.25, 0.24, 31.5), M["matte"], segments=10, axis="x")
    box_span("wheelbarrow_handle_0", -29.9, -29.2, 0.5, 0.55, 30.7, 30.75, M["wood"])
    box_span("wheelbarrow_handle_1", -29.9, -29.2, 0.5, 0.55, 31.25, 31.3, M["wood"])
    # lamp posts on the procedural collider spots
    for i, (x, z) in enumerate(((-30.0, 15.0), (-25.0, 22.0), (-50.0, 18.0), (-46.0, 28.0), (-20.0, 28.0))):
        lamp_post(f"lamp_{i}", x, z, M)
    # trees (cinematic positions + porch tree)
    for i, (x, z, s) in enumerate(((-52.0, 29.0, 1.0), (-49.0, 24.0, 1.2), (-24.0, 31.0, 0.9), (-21.0, 39.0, 1.05), (-36.5, 31.5, 1.0), (-27.5, 37.0, 0.85))):
        tree(f"tree_{i}", x, z, s, M)


def build_lod1(M):
    x0, x1, z0, z1 = HX - HW / 2, HX + HW / 2, HZ - HD / 2, HZ + HD / 2
    box_span("l1_plinth", x0 - 1, x1 + 1, 0.0, 0.5, z0 - 1, z1 + 1, M["concrete"], lod="LOD1")
    box_span("l1_wall_back", x0 - W / 2, x1 + W / 2, BASE1, DECK_Y, z0 - W / 2, z0 + W / 2, M["plaster"], lod="LOD1")
    box_span("l1_wall_left", x0 - W / 2, x0 + W / 2, BASE1, DECK_Y, z0, z1, M["plaster"], lod="LOD1")
    box_span("l1_wall_right", x1 - W / 2, x1 + W / 2, BASE1, DECK_Y, z0, z1, M["plaster"], lod="LOD1")
    box_span("l1_wall_front_l", x0 - W / 2, -36.5, BASE1, DECK_Y, z1 - W / 2, z1 + W / 2, M["plaster"], lod="LOD1")
    box_span("l1_wall_front_r", -33.5, x1 + W / 2, BASE1, DECK_Y, z1 - W / 2, z1 + W / 2, M["plaster"], lod="LOD1")
    box_span("l1_wall_front_h", -36.5, -33.5, 3.15, DECK_Y, z1 - W / 2, z1 + W / 2, M["plaster"], lod="LOD1")
    for xw in (x0, x1):
        verts = [(xw - W / 2, DECK_Y, z0 - 1), (xw - W / 2, DECK_Y, z1 + 1), (xw - W / 2, ROOF_RIDGE_Y - 0.14, HZ),
                 (xw + W / 2, DECK_Y, z0 - 1), (xw + W / 2, DECK_Y, z1 + 1), (xw + W / 2, ROOF_RIDGE_Y - 0.14, HZ)]
        K.mesh(f"l1_gable_{xw}", verts, [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], M["plaster"], lod="LOD1")
    for side in (-1, 1):
        ze = HZ + side * ROOF_HALF_RUN
        v = [(HX - ROOF_HALF_W, ROOF_RIDGE_Y, HZ), (HX + ROOF_HALF_W, ROOF_RIDGE_Y, HZ), (HX + ROOF_HALF_W, ROOF_EAVE_Y, ze), (HX - ROOF_HALF_W, ROOF_EAVE_Y, ze)]
        vb = [(x, y - 0.14, z) for (x, y, z) in v]
        faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        if side == -1:
            faces = [tuple(reversed(f)) for f in faces]
        K.mesh(f"l1_roof_{side}", v + vb, faces, M["roof"], lod="LOD1")
    box_span("l1_porch_deck", -40.75, -29.25, 0.15, 0.35, z1, z1 + 2.5, M["wood"], lod="LOD1")
    box_span("l1_porch_roof", -41.0, -29.0, 3.15, 3.35, z1, 28.85, M["roof"], lod="LOD1")
    for px in (-39.5, -35.0, -30.5):
        box_span(f"l1_porch_post_{px}", px - 0.125, px + 0.125, 0.35, 3.15, 28.075, 28.325, M["wood"], lod="LOD1")
    box_span("l1_balcony", -37.5, -32.5, BASE2, BASE2 + 0.2, z1, z1 + 1.8, M["wood"], lod="LOD1")
    box_span("l1_chimney", CH_X - 0.75, CH_X + 0.75, BASE1, CH_TOP, CH_Z - 0.75, CH_Z + 0.75, M["brick"], lod="LOD1")
    box_span("l1_lawn", -55.0, -17.6, 0.0, 0.12, 18.5, 43.5, M["lawn"], lod="LOD1", tags={"castShadow": False})
    box_span("l1_garden_ground", GX - 7, GX + 7, 0.0, 0.18, GZ - 7, GZ + 7, M["lawn"], lod="LOD1", tags={"castShadow": False})
    outer = octagon(GX, GZ, 3.5); inner = octagon(GX, GZ, 3.0)
    verts = [(x, 0.4, z) for (x, z) in outer] + [(x, 0.4, z) for (x, z) in inner] + [(x, 0.0, z) for (x, z) in outer]
    faces = [(k, (k + 1) % 8, 8 + (k + 1) % 8, 8 + k) for k in range(8)] + [(16 + (k + 1) % 8, 16 + k, k, (k + 1) % 8) for k in range(8)]
    K.mesh("l1_pond_coping", verts, faces, M["rock"], lod="LOD1")
    K.mesh("l1_pond_water", [(x, 0.3, z) for (x, z) in octagon(GX, GZ, 3.02)], [tuple(range(8))], M["water"], lod="LOD1",
           tags={"weaponImpactKind": "water", "castShadow": False})
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = GX + sx * 3.5, GZ + sz * 3.5
            tri = [(cx, cz), (cx - sx * 2.35, cz), (cx, cz - sz * 2.35)]
            if sx * sz > 0:
                tri = [tri[0], tri[2], tri[1]]
            v0 = [(x, 0.0, z) for (x, z) in tri]; v1 = [(x, 0.42, z) for (x, z) in tri]
            K.mesh(f"l1_planter_{sx}_{sz}", v0 + v1, [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)], M["wood"], lod="LOD1")
    box_span("l1_bridge", -50.2, -49.0, 0.43, 0.55, 34.75, 41.25, M["wood"], lod="LOD1")
    box_span("l1_herb_bed", -45.65, -41.35, 0.0, 0.3, 34.35, 38.65, M["wood"], lod="LOD1")
    rock("l1_island", (GX + 0.5, 0.9, GZ), 0.9, 1.5, M, lod="LOD1")
    for i, (x, z) in enumerate(((-30.0, 15.0), (-25.0, 22.0), (-50.0, 18.0), (-46.0, 28.0), (-20.0, 28.0))):
        lamp_post(f"l1_lamp_{i}", x, z, M, lod="LOD1")
    for i, (x, z, s) in enumerate(((-52.0, 29.0, 1.0), (-49.0, 24.0, 1.2), (-24.0, 31.0, 0.9), (-21.0, 39.0, 1.05), (-36.5, 31.5, 1.0), (-27.5, 37.0, 0.85))):
        tree(f"l1_tree_{i}", x, z, s, M, lod="LOD1")


def add_references():
    count = K.import_reference_colliders(COLLIDER_JSON, (ZONE_MIN, ZONE_MAX))
    kept = K.import_reference_glb(CINEMATIC_GLB, (ZONE_MIN, ZONE_MAX)) if CINEMATIC_GLB.exists() else 0
    top = REFERENCE_DIR / "harbor-v2-residential-garden-top-orthographic.png"
    if top.exists():
        # reference top view: image up = +x (east), image right = +z (south); scaled to the zone
        K.add_reference_image(top, "REF_IMG_top_ortho", (-36.5, -0.05, 30.0), 38.0, rotation_z=-math.pi / 2)
    return count, kept


def main(save: bool = True) -> dict:
    K.new_scene("Harbor_V2_Garden_AC_Authoring")
    M = materials()
    build_house(M)
    build_interior(M)
    build_garden(M)
    build_lod1(M)
    K.project_box_uvs()
    lod0 = K.batch_by_material("LOD0")
    lod1 = K.batch_by_material("LOD1")
    for obj in K.collections["RENDER_LOD1"].objects:
        obj.hide_set(True)
    refs = add_references()
    for obj in K.collections["COLLISION"].objects:
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
