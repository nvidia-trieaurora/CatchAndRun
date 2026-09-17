"""Harbor Market — the BD shop rebuilt as a realistic harbour mini-supermarket.

Called from ``build_container_bd.py`` (same Blender session, same ZoneKit ``K`` and
material dict ``M``). Everything here is authored in Three.js metres (x east, y up,
z south) on the gameplay boxes of ``buildDocksideMiniMart`` (oldHarborFortnite.ts):

* shell 38..52 × 0..5.5 × -43..-33, storefront on the +z face, 3 m automatic double
  door at x 43.5..46.5 (4 m clear header), roof slab 37..53 × 5.5..5.8 × -44..-32 and
  the 2 m entrance canopy 38..52 × 5.4..5.65 × -33..-31;
* interior fixtures exactly on their gameplay boxes: produce display (west wall),
  two double-sided gondolas, refrigerated cases (rear + right wall), checkout with
  impulse rack and cashier wall shelf, stockroom + manager room (rear-left);
* the left (west) side is a flat service path: nothing but a painted walkway, a
  drainage channel and two wall lamps above head height — no stair, ramp, landing,
  posts or colliders (contract clearance ``shop-left-side``).

Products come from one 512 px label atlas (``MAT_PRODUCT_ATLAS``, vertex-tinted for
variation) drawn procedurally by :func:`product_atlas`; fixtures reuse the yard
palette / steel / concrete materials so the shop adds only two draw calls.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

import zone_kit as zk

# ---- gameplay contract (Three.js metres) ---------------------------------------- #
MART = ((38.0, 0.0, -43.0), (52.0, 5.5, -33.0))
DOOR_X = (43.5, 46.5)
ROOF = ((37.0, 5.5, -44.0), (53.0, 5.8, -32.0))
CANOPY = ((37.0, 5.4, -33.0), (53.0, 5.65, -31.0))
SLAB = 0.25                      # interior floor / forecourt sidewalk top
GROUND = 0.18                    # legacy asphalt top (players stand at y 0)
IN_X = (38.2, 51.8)              # interior clear
IN_Z = (-42.8, -33.15)
CEIL = 4.2                       # suspended ceiling (glazing head)
BASE_TOP = SLAB + 0.45           # concrete plinth top (0.7)
FRONT = MART[1][2]               # -33.0

GONDOLAS = ((41.2, -38.95, 42.2, -35.15), (45.6, -40.35, 46.6, -35.15))   # x0, z0, x1, z1
CHECKOUT = (48.7, -37.6, 49.7, -34.4)
IMPULSE = (48.2, -37.6, 48.7, -36.4)
WALL_SHELF = (51.4, -37.4, 51.8, -35.2)
FRIDGE_REAR = (43.2, -42.8, 51.05, -42.05)
FRIDGE_RIGHT = (51.05, -42.05, 51.8, -38.05)
PRODUCE = (38.2, -39.6, 39.5, -34.6)
CRATE_STACK = (38.2, -34.5, 39.4, -33.6)
ROOMS = ((38.2, -42.8), (43.0, -40.5))
ROOM_DOORS = ((39.7, 40.6), (41.9, 42.8))
PARTITION_X = (40.8, 40.9)
ROOM_EAST_X = (42.9, 43.0)
ROOM_WALL_Z = (-40.6, -40.5)
STOCK_SHELF = (38.3, -42.75, 40.7, -42.3)
DESK = (41.0, -42.75, 42.2, -42.1)
ROOF_AC = ((47.2, 5.75, -40.55), (48.8, 6.6, -39.45))       # legacy roof AC collider
# roof access: fixed ladder on the stockroom's west wall up through a hatch in the roof
# (the procedural roof collider has the same hole; players mantle out onto the west overhang)
HATCH = (38.2, -41.9, 39.3, -40.7)                          # x0, z0, x1, z1 hole in roof + ceiling
LADDER = (38.25, -41.55, 38.55, -41.05)                     # COL_LADDER column, approach from +x
EAST_UNITS = ((-37.6, -36.8), (-36.4, -35.6))              # legacy vending colliders, x 52.35..53.25, 2 m tall
SERVICE_DOOR_Z = (-37.9, -36.9)

TEXTURES = Path(__file__).resolve().parents[1] / "textures"
FONT_CANDIDATES = (
    "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Futura.ttc",
    "/Library/Fonts/Arial Bold.ttf",
)

_K: zk.ZoneKit | None = None
_M: dict = {}
_rng = random.Random(20260908)
_stats = {"products": 0, "rowCards": 0}


def _b(name, x0, x1, y0, y1, z0, z1, mat, **kw):
    """Axis-aligned box from spans (Three.js metres)."""
    return _K.box(name, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat, **kw)


def _place(obj, collection):
    if obj is not None:
        _K.link(obj, collection)
    return obj


def _bar(name, p0, p1, t, mat, **kw):
    import build_container_bd as bd
    return bd.bar(name, p0, p1, t, mat, **kw)


def _tube(name, p0, p1, r, mat, **kw):
    import build_container_bd as bd
    return bd.tube(name, p0, p1, r, mat, **kw)


# --------------------------------------------------------------------------- #
# Product label atlas (procedural, no text) + material
# --------------------------------------------------------------------------- #

ATLAS_CELLS = [
    # name, body, label band, accent, (rough, metal), kind
    ("can_red", (0.72, 0.12, 0.10), (0.93, 0.88, 0.78), (0.15, 0.35, 0.15), (0.35, 0.0), "label"),
    ("can_navy", (0.10, 0.16, 0.36), (0.95, 0.80, 0.25), (0.72, 0.12, 0.10), (0.35, 0.0), "label"),
    ("can_green", (0.16, 0.42, 0.20), (0.92, 0.90, 0.80), (0.85, 0.55, 0.10), (0.35, 0.0), "label"),
    ("can_silver", (0.68, 0.70, 0.72), (0.20, 0.35, 0.70), (0.95, 0.95, 0.95), (0.30, 0.7), "label"),
    ("box_yellow", (0.92, 0.70, 0.12), (0.85, 0.16, 0.10), (0.98, 0.95, 0.85), (0.62, 0.0), "label"),
    ("box_blue", (0.12, 0.30, 0.70), (0.95, 0.95, 0.95), (0.90, 0.60, 0.10), (0.62, 0.0), "label"),
    ("box_kraft", (0.60, 0.45, 0.28), (0.30, 0.20, 0.12), (0.85, 0.75, 0.55), (0.70, 0.0), "label"),
    ("jar_amber", (0.75, 0.45, 0.12), (0.95, 0.90, 0.75), (0.40, 0.22, 0.08), (0.25, 0.0), "label"),
    ("bottle_orange", (0.95, 0.55, 0.12), (0.98, 0.95, 0.85), (0.25, 0.55, 0.20), (0.22, 0.0), "label"),
    ("bottle_water", (0.78, 0.86, 0.90), (0.20, 0.45, 0.80), (0.95, 0.95, 0.98), (0.20, 0.0), "label"),
    ("bottle_dark", (0.16, 0.08, 0.05), (0.80, 0.12, 0.10), (0.95, 0.90, 0.80), (0.22, 0.0), "label"),
    ("carton_milk", (0.95, 0.95, 0.93), (0.20, 0.40, 0.75), (0.90, 0.25, 0.20), (0.55, 0.0), "label"),
    ("bag_silver", (0.72, 0.72, 0.74), (0.85, 0.15, 0.12), (0.95, 0.85, 0.20), (0.40, 0.25), "label"),
    ("row_bottles", (0.10, 0.10, 0.11), None, None, (0.45, 0.0), "row_bottles"),
    ("row_cartons", (0.10, 0.10, 0.11), None, None, (0.55, 0.0), "row_cartons"),
    ("row_cans", (0.10, 0.10, 0.11), None, None, (0.40, 0.0), "row_cans"),
]
CELL = {entry[0]: index for index, entry in enumerate(ATLAS_CELLS)}
GRID = 4
CELL_PX = 128
LABEL_U = 0.78          # left part of a cell carries the label, the right strip is plain body colour
PLAIN_U = (0.84, 0.98)


def _rect(px, cx, cy, u0, u1, v0, v1, rgb):
    x0, x1 = int(cx * CELL_PX + u0 * CELL_PX), int(cx * CELL_PX + u1 * CELL_PX)
    y0, y1 = int(cy * CELL_PX + v0 * CELL_PX), int(cy * CELL_PX + v1 * CELL_PX)
    px[y0:y1, x0:x1, :3] = rgb


def _disc(px, cx, cy, u, v, r, rgb):
    import numpy as np
    x0, y0 = cx * CELL_PX, cy * CELL_PX
    yy, xx = np.mgrid[0:CELL_PX, 0:CELL_PX]
    mask = (xx - u * CELL_PX) ** 2 + (yy - v * CELL_PX) ** 2 <= (r * CELL_PX) ** 2
    cell = px[y0:y0 + CELL_PX, x0:x0 + CELL_PX, :3]
    cell[mask] = rgb


def _paint_label_cell(px, cx, cy, body, label, accent, rng):
    import numpy as np
    dark = (0.10, 0.09, 0.09)
    light = (0.95, 0.93, 0.88)
    _rect(px, cx, cy, 0, 1, 0, 1, body)
    # top / bottom rims read as can lids and carton folds
    rim = tuple(c * 0.62 for c in body)
    _rect(px, cx, cy, 0, 1, 0.0, 0.06, rim)
    _rect(px, cx, cy, 0, 1, 0.94, 1.0, rim)
    # label band with two text lines and a logo disc
    v0, v1 = 0.30, 0.72
    _rect(px, cx, cy, 0.0, LABEL_U, v0, v1, label)
    text = dark if sum(label) > 1.4 else light
    _rect(px, cx, cy, 0.30, 0.66, 0.56, 0.62, text)
    _rect(px, cx, cy, 0.30, 0.58, 0.46, 0.51, text)
    _rect(px, cx, cy, 0.30, 0.50, 0.38, 0.41, tuple(t * 0.6 + l * 0.4 for t, l in zip(text, label)))
    _disc(px, cx, cy, 0.17, 0.51, 0.09, accent)
    _disc(px, cx, cy, 0.17, 0.51, 0.05, label)
    # small barcode block low on the body
    for k in range(9):
        w = 0.008 + 0.006 * (k % 3)
        _rect(px, cx, cy, 0.12 + k * 0.03, 0.12 + k * 0.03 + w, 0.10, 0.22, light if sum(body) < 1.2 else dark)
    # paper grain
    x0, y0 = cx * CELL_PX, cy * CELL_PX
    noise = rng.standard_normal((CELL_PX, CELL_PX, 1)).astype("float32") * 0.02
    px[y0:y0 + CELL_PX, x0:x0 + CELL_PX, :3] = np.clip(px[y0:y0 + CELL_PX, x0:x0 + CELL_PX, :3] + noise, 0, 1)


def _paint_row_cell(px, cx, cy, kind, rng):
    """A row of packaged goods seen from the front (fridge / back-row cards)."""
    import numpy as np
    _rect(px, cx, cy, 0, 1, 0, 1, (0.10, 0.10, 0.11))
    _rect(px, cx, cy, 0, 1, 0.0, 0.05, (0.55, 0.56, 0.58))    # wire shelf edge
    if kind == "row_bottles":
        palette = [((0.95, 0.55, 0.12), (0.98, 0.95, 0.85)), ((0.16, 0.08, 0.05), (0.80, 0.12, 0.10)),
                   ((0.78, 0.86, 0.90), (0.20, 0.45, 0.80)), ((0.20, 0.55, 0.25), (0.95, 0.92, 0.75)),
                   ((0.80, 0.15, 0.12), (0.95, 0.93, 0.88))]
        n, w = 6, 0.15
        for k in range(n):
            body, label = palette[k % len(palette)]
            u = 0.03 + k * (0.94 / n)
            _rect(px, cx, cy, u, u + w, 0.06, 0.70, body)
            _rect(px, cx, cy, u + 0.035, u + w - 0.035, 0.70, 0.82, body)       # shoulder
            _rect(px, cx, cy, u + 0.05, u + w - 0.05, 0.82, 0.90, (0.85, 0.86, 0.88))   # cap
            _rect(px, cx, cy, u + 0.01, u + w - 0.01, 0.30, 0.55, label)
            _rect(px, cx, cy, u + 0.03, u + w - 0.03, 0.40, 0.44, (0.12, 0.1, 0.1) if sum(label) > 1.4 else (0.95, 0.93, 0.88))
    elif kind == "row_cartons":
        palette = [((0.95, 0.95, 0.93), (0.20, 0.40, 0.75)), ((0.95, 0.95, 0.93), (0.85, 0.20, 0.15)),
                   ((0.95, 0.60, 0.15), (0.98, 0.95, 0.85)), ((0.25, 0.55, 0.25), (0.95, 0.92, 0.75))]
        n, w = 6, 0.15
        for k in range(n):
            body, label = palette[k % len(palette)]
            u = 0.03 + k * (0.94 / n)
            _rect(px, cx, cy, u, u + w, 0.06, 0.78, body)
            _rect(px, cx, cy, u, u + w, 0.78, 0.86, tuple(c * 0.85 for c in body))   # gable top
            _rect(px, cx, cy, u + 0.01, u + w - 0.01, 0.30, 0.58, label)
            _rect(px, cx, cy, u + 0.03, u + w - 0.03, 0.40, 0.45, (0.12, 0.1, 0.1) if sum(label) > 1.4 else (0.95, 0.93, 0.88))
    else:  # row_cans
        palette = [((0.72, 0.12, 0.10), (0.93, 0.88, 0.78)), ((0.10, 0.16, 0.36), (0.95, 0.80, 0.25)),
                   ((0.16, 0.42, 0.20), (0.92, 0.90, 0.80)), ((0.68, 0.70, 0.72), (0.20, 0.35, 0.70))]
        n, w = 7, 0.125
        for k in range(n):
            body, label = palette[k % len(palette)]
            u = 0.03 + k * (0.94 / n)
            _rect(px, cx, cy, u, u + w, 0.06, 0.62, body)
            _rect(px, cx, cy, u, u + w, 0.62, 0.66, (0.62, 0.63, 0.65))   # lid
            _rect(px, cx, cy, u + 0.005, u + w - 0.005, 0.24, 0.48, label)
            _rect(px, cx, cy, u + 0.02, u + w - 0.02, 0.34, 0.38, (0.12, 0.1, 0.1) if sum(label) > 1.4 else (0.95, 0.93, 0.88))
    x0, y0 = cx * CELL_PX, cy * CELL_PX
    noise = rng.standard_normal((CELL_PX, CELL_PX, 1)).astype("float32") * 0.015
    px[y0:y0 + CELL_PX, x0:x0 + CELL_PX, :3] = np.clip(px[y0:y0 + CELL_PX, x0:x0 + CELL_PX, :3] + noise, 0, 1)


def product_atlas(pack: str = "container-bd-pbr") -> None:
    """Write product_atlas_{base,orm,normal}.png + spec entry into the derived texture set."""
    import numpy as np
    rng = np.random.default_rng(20260908)
    size = GRID * CELL_PX
    base = np.zeros((size, size, 4), dtype="float32"); base[..., 3] = 1.0
    orm = np.zeros((size, size, 4), dtype="float32"); orm[..., 3] = 1.0
    for index, (name, body, label, accent, (rough, metal), kind) in enumerate(ATLAS_CELLS):
        cx, cy = index % GRID, index // GRID
        if kind == "label":
            _paint_label_cell(base, cx, cy, body, label, accent, rng)
        else:
            _paint_row_cell(base, cx, cy, kind, rng)
        _rect(orm, cx, cy, 0, 1, 0, 1, (1.0, rough, metal))
    derived = TEXTURES / pack / "_derived"
    derived.mkdir(parents=True, exist_ok=True)

    def save(name, pixels, colorspace):
        path = derived / name
        image = bpy.data.images.get(f"ZONE_{name}")
        if image is not None:
            bpy.data.images.remove(image)
        image = bpy.data.images.new(f"ZONE_{name}", width=pixels.shape[1], height=pixels.shape[0], alpha=True)
        image.colorspace_settings.name = colorspace
        image.pixels = pixels.ravel().tolist()
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
        bpy.data.images.remove(image)

    save("product_atlas_base.png", base, "sRGB")
    save("product_atlas_orm.png", orm, "Non-Color")
    normal = np.zeros((8, 8, 4), dtype="float32"); normal[..., :3] = (0.5, 0.5, 1.0); normal[..., 3] = 1.0
    save("product_atlas_normal.png", normal, "Non-Color")
    spec_path = derived / "spec.json"
    spec = json.loads(spec_path.read_text()) if spec_path.exists() else {}
    spec["product_atlas"] = {
        "source": "procedural label atlas (harbor_market.product_atlas)",
        "base": "product_atlas_base.png", "normal": "product_atlas_normal.png", "orm": "product_atlas_orm.png",
        "tile": 1.0, "size": size,
    }
    spec_path.write_text(json.dumps(spec, indent=2) + "\n")


def _cell_uv(cell: int, u: float, v: float) -> tuple[float, float]:
    cx, cy = cell % GRID, cell // GRID
    return ((cx + u) / GRID, (cy + v) / GRID)


# --------------------------------------------------------------------------- #
# Low-poly product kit (bmesh, UV-mapped into the atlas)
# --------------------------------------------------------------------------- #

_FACING = {"+x": Vector((1, 0, 0)), "-x": Vector((-1, 0, 0)), "+z": Vector((0, -1, 0)), "-z": Vector((0, 1, 0))}


def _finish_product(name, bm, center, tint, collection="PRODUCT_INSTANCES"):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = zk.to_blender(center)
    _K._finish(obj, tint, "LOD0", {"castShadow": False}, 0.0, uv_locked=True)
    _place(obj, collection)
    _stats["products"] += 1
    return obj


def product_cylinder(name, center, radius, height, cell, tint, *, segments=6, radius_top=None, facing="+x"):
    """Can / jar / bottle: label wraps the side, the top cap takes the plain strip."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=radius if radius_top is None else radius_top, depth=height)
    uv = bm.loops.layers.uv.verify()
    bottom = [f for f in bm.faces if f.normal.z < -0.5]
    bmesh.ops.delete(bm, geom=bottom, context="FACES")
    for face in bm.faces:
        if face.normal.z > 0.5:
            for loop in face.loops:
                loop[uv].uv = _cell_uv(cell, 0.91, 0.5)
            continue
        # unwrap around the axis; each face is kept continuous by measuring its loops
        # from the face centre angle and shifting the whole face into 0..1.25
        ref = math.atan2(face.calc_center_median().y, face.calc_center_median().x)
        us = []
        for loop in face.loops:
            a = math.atan2(loop.vert.co.y, loop.vert.co.x)
            d = (a - ref + math.pi) % math.tau - math.pi
            us.append((ref + d) / math.tau + 0.5)
        shift = -math.floor(min(us))
        for loop, u in zip(face.loops, us):
            v = (loop.vert.co.z + height / 2) / height
            loop[uv].uv = _cell_uv(cell, (u + shift) * LABEL_U, v)
    obj = _finish_product(name, bm, center, tint)
    # rotate the label seam away from the aisle
    obj.rotation_euler = (0.0, 0.0, math.atan2(_FACING[facing].y, _FACING[facing].x) + math.pi)
    return obj


def product_box(name, center, size, cell, tint, *, facing="+x", label_faces=1):
    """Carton / box / bag: the aisle-facing side carries the label, the rest is plain."""
    sx, sy, sz = size
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)
    uv = bm.loops.layers.uv.verify()
    bottom = [f for f in bm.faces if f.normal.z < -0.5]
    bmesh.ops.delete(bm, geom=bottom, context="FACES")
    front = _FACING[facing]
    for face in bm.faces:
        n = face.normal
        is_label = n.dot(front) > 0.5 or (label_faces > 1 and n.dot(front) < -0.5)
        if is_label:
            # project the face into the label area
            right = Vector((0, 0, 1)).cross(n).normalized()
            corners = [(loop, loop.vert.co) for loop in face.loops]
            rs = [c.dot(right) for _, c in corners]; zs = [c.z for _, c in corners]
            r0, r1, z0, z1 = min(rs), max(rs), min(zs), max(zs)
            for loop, c in corners:
                u = (c.dot(right) - r0) / max(r1 - r0, 1e-6)
                v = (c.z - z0) / max(z1 - z0, 1e-6)
                loop[uv].uv = _cell_uv(cell, 0.02 + u * (LABEL_U - 0.04), 0.02 + v * 0.96)
        else:
            for loop in face.loops:
                loop[uv].uv = _cell_uv(cell, 0.91, 0.5)
    return _finish_product(name, bm, center, tint)


def row_card(name, center, size, cell, tint, *, facing="+x"):
    """One cheap box showing a whole row of goods (fridge shelves, gondola back rows).

    The aisle face is split into ~0.9 m panels so the atlas cell repeats along the
    shelf instead of stretching; the other faces take the dark shelf-edge colour."""
    sx, sy, sz = size
    hx, hy, hz = sx / 2, sz / 2, sy / 2          # Blender half extents: x, y(-z three), z(up)
    front = _FACING[facing]
    along_axis = 0 if abs(front.y) > 0.5 else 1  # panels run along Blender x when facing ±y, else along y
    along = sx if along_axis == 0 else sz
    panels = max(1, round(along / 0.9))
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()

    def vert(x, y, z):
        return bm.verts.new((x, y, z))

    # box corners: bottom (z=-hz) and top (z=+hz) rings, faces without the bottom
    c = {}
    for sxn in (-1, 1):
        for syn in (-1, 1):
            for szn in (-1, 1):
                c[(sxn, syn, szn)] = vert(sxn * hx, syn * hy, szn * hz)
    def quad(a, b, cc, d, uvs=None):
        f = bm.faces.new((a, b, cc, d))
        if uvs:
            for loop, t in zip(f.loops, uvs):
                loop[uv].uv = t
        return f
    dark = _cell_uv(cell, 0.5, 0.02)
    # top
    quad(c[(-1, -1, 1)], c[(1, -1, 1)], c[(1, 1, 1)], c[(-1, 1, 1)], [dark] * 4)
    faces_by_normal = {
        (1, 0): (c[(1, -1, -1)], c[(1, 1, -1)], c[(1, 1, 1)], c[(1, -1, 1)]),
        (-1, 0): (c[(-1, 1, -1)], c[(-1, -1, -1)], c[(-1, -1, 1)], c[(-1, 1, 1)]),
        (0, 1): (c[(1, 1, -1)], c[(-1, 1, -1)], c[(-1, 1, 1)], c[(1, 1, 1)]),
        (0, -1): (c[(-1, -1, -1)], c[(1, -1, -1)], c[(1, -1, 1)], c[(-1, -1, 1)]),
    }
    front_key = (int(round(front.x)), int(round(front.y)))
    for key, verts in faces_by_normal.items():
        if key != front_key:
            quad(*verts, uvs=[dark] * 4)
    # front face as `panels` quads, each mapped to the full label cell
    a, b, cc, d = faces_by_normal[front_key]      # bottom-left, bottom-right, top-right, top-left (viewer's order)
    prev_bottom, prev_top = a, d
    for k in range(1, panels + 1):
        t = k / panels
        if k < panels:
            nb = vert(*(Vector(a.co).lerp(Vector(b.co), t)))
            nt = vert(*(Vector(d.co).lerp(Vector(cc.co), t)))
        else:
            nb, nt = b, cc
        quad(prev_bottom, nb, nt, prev_top,
             [_cell_uv(cell, 0.01, 0.02), _cell_uv(cell, 0.99, 0.02), _cell_uv(cell, 0.99, 0.98), _cell_uv(cell, 0.01, 0.98)])
        prev_bottom, prev_top = nb, nt
    bm.normal_update()
    obj = _finish_product(name, bm, center, tint)
    _stats["rowCards"] += 1
    return obj


# --------------------------------------------------------------------------- #
# Shelf filling
# --------------------------------------------------------------------------- #

KINDS = {
    # spacing along the shelf, builder
    "can": (0.075, lambda n, c, cell, tint, facing: product_cylinder(n, c, 0.033, 0.11, cell, tint, facing=facing)),
    "jar": (0.095, lambda n, c, cell, tint, facing: product_cylinder(n, c, 0.04, 0.12, cell, tint, facing=facing)),
    "bottle": (0.09, lambda n, c, cell, tint, facing: product_cylinder(n, c, 0.036, 0.22, cell, tint, radius_top=0.018, facing=facing)),
    "cereal": (0.21, lambda n, c, cell, tint, facing: product_box(n, c, (0.19, 0.28, 0.065) if facing in ("+z", "-z") else (0.065, 0.28, 0.19), cell, tint, facing=facing)),
    "box": (0.14, lambda n, c, cell, tint, facing: product_box(n, c, (0.12, 0.17, 0.06) if facing in ("+z", "-z") else (0.06, 0.17, 0.12), cell, tint, facing=facing)),
    "bag": (0.16, lambda n, c, cell, tint, facing: product_box(n, c, (0.14, 0.21, 0.05) if facing in ("+z", "-z") else (0.05, 0.21, 0.14), cell, tint, facing=facing)),
    "carton": (0.085, lambda n, c, cell, tint, facing: product_box(n, c, (0.07, 0.2, 0.07), cell, tint, facing=facing)),
}
KIND_CELLS = {
    "can": ("can_red", "can_navy", "can_green", "can_silver"),
    "jar": ("jar_amber",),
    "bottle": ("bottle_orange", "bottle_water", "bottle_dark"),
    "cereal": ("box_yellow", "box_blue"),
    "box": ("box_kraft", "box_blue", "box_yellow"),
    "bag": ("bag_silver",),
    "carton": ("carton_milk",),
}
KIND_HEIGHT = {"can": 0.11, "jar": 0.12, "bottle": 0.22, "cereal": 0.28, "box": 0.17, "bag": 0.21, "carton": 0.2}
ROW_CARD_CELL = {"can": "row_cans", "jar": "row_cans", "bottle": "row_bottles", "cereal": "row_cartons",
                 "box": "row_cartons", "bag": "row_cartons", "carton": "row_cartons"}
_tints: list = []


def _tint():
    return _tints[_rng.randrange(len(_tints))]


def fill_shelf(tag, a0, a1, y, depth0, depth1, facing, kind, *, back_row=True, fill=0.9):
    """Line a shelf with one product kind. ``a0..a1`` runs along the shelf (x for
    shelves facing ±z, z for shelves facing ±x); ``depth0..depth1`` is the shelf depth
    coordinate with depth0 on the aisle side. A row card sits behind the front row."""
    spacing, make = KINDS[kind]
    cells = KIND_CELLS[kind]
    length = (a1 - a0) * fill
    count = max(1, int(length / spacing))
    start = (a0 + a1) / 2 - (count - 1) * spacing / 2
    front_depth = depth0 + (0.06 if depth1 > depth0 else -0.06) * 1.0
    h = KIND_HEIGHT[kind]
    cell_name = cells[_rng.randrange(len(cells))]
    cluster = 0
    # small round goods stand two deep; the second row repeats the front cluster colours
    rows = 2 if kind in ("can", "jar") else 1
    sign = 1.0 if depth1 > depth0 else -1.0
    for k in range(count):
        if cluster == 0:
            cell_name = cells[_rng.randrange(len(cells))]
            cluster = _rng.randint(3, 6)
        cluster -= 1
        a = start + k * spacing
        cell = CELL[cell_name]
        for row in range(rows):
            d = front_depth + sign * row * (spacing + 0.005)
            if facing in ("+z", "-z"):
                center = (a, y + h / 2, d)
            else:
                center = (d, y + h / 2, a)
            make(f"{tag}_{k}_{row}", center, cell, _tint(), facing)
    if back_row:
        card_depth0 = depth0 + sign * (0.16 + (rows - 1) * (spacing + 0.02))
        card_depth1 = depth1 - (0.02 if depth1 > depth0 else -0.02)
        d0, d1 = min(card_depth0, card_depth1), max(card_depth0, card_depth1)
        if d1 - d0 > 0.08:
            ch = min(0.2, h)
            cell = CELL[ROW_CARD_CELL[kind]]
            if facing in ("+z", "-z"):
                row_card(f"{tag}_row", ((a0 + a1) / 2, y + ch / 2, (d0 + d1) / 2), (length, ch, d1 - d0), cell, _tint(), facing=facing)
            else:
                row_card(f"{tag}_row", ((d0 + d1) / 2, y + ch / 2, (a0 + a1) / 2), (d1 - d0, ch, length), cell, _tint(), facing=facing)


# --------------------------------------------------------------------------- #
# Store fixture kit
# --------------------------------------------------------------------------- #

SHELF_Y = (0.42, 0.82, 1.22, 1.58)
KIND_CYCLE = ("can", "box", "cereal", "jar", "bag", "can", "bottle", "box")


def gondola(tag, x0, z0, x1, z1, M, *, endcaps=True, seed=0):
    """Double-sided grocery gondola on its gameplay box (1.0 m deep, 1.85 m tall)."""
    steel_black, shelf, trim = M["steel_black"], M["shelf"], M["trim"]
    cx = (x0 + x1) / 2
    e = 0.5 if endcaps else 0.0
    bz0, bz1 = z0 + e, z1 - e                     # body span (endcaps outside)
    F = "SHOP_FIXTURES"
    _place(_b(f"{tag}_base", x0, x1, SLAB, SLAB + 0.15, z0, z1, trim, bevel=0.01), F)
    _place(_b(f"{tag}_spine", cx - 0.03, cx + 0.03, SLAB + 0.15, SLAB + 1.6, bz0, bz1, trim), F)
    _place(_b(f"{tag}_top", x0 + 0.02, x1 - 0.02, SLAB + 1.57, SLAB + 1.6, bz0, bz1, steel_black), F)
    bays = max(1, round((bz1 - bz0) / 1.4))
    pitch = (bz1 - bz0) / bays
    for k in range(bays + 1):
        z = bz0 + k * pitch
        _place(_b(f"{tag}_upright_{k}", x0 + 0.02, x1 - 0.02, SLAB + 0.15, SLAB + 1.57, z - 0.02, z + 0.02, steel_black), F)
    for side, (sx0, sx1, facing) in enumerate(((x0 + 0.02, cx - 0.03, "-x"), (cx + 0.03, x1 - 0.02, "+x"))):
        for s, y in enumerate(SHELF_Y):
            _place(_b(f"{tag}_shelf_{side}_{s}", sx0, sx1, y - 0.03, y, bz0 + 0.03, bz1 - 0.03, shelf), F)
            lip_x = (sx0, sx0 + 0.02) if facing == "-x" else (sx1 - 0.02, sx1)
            _place(_b(f"{tag}_lip_{side}_{s}", lip_x[0], lip_x[1], y - 0.01, y + 0.035, bz0 + 0.03, bz1 - 0.03, M["white"]), F)
            for b in range(bays):
                kind = KIND_CYCLE[(s * 3 + b + side * 5 + seed) % len(KIND_CYCLE)]
                if s == len(SHELF_Y) - 1 and kind == "bottle":
                    kind = "can"
                a0, a1 = bz0 + b * pitch + 0.06, bz0 + (b + 1) * pitch - 0.06
                depth0, depth1 = (sx0 + 0.01, sx1) if facing == "-x" else (sx1 - 0.01, sx0)
                fill_shelf(f"{tag}_p{side}{s}{b}", a0, a1, y, depth0, depth1, facing, kind)
    if endcaps:
        for end, (ez0, ez1, facing) in enumerate(((z0, bz0, "-z"), (bz1, z1, "+z"))):
            _place(_b(f"{tag}_end_{end}_back", x0 + 0.02, x1 - 0.02, SLAB + 0.15, SLAB + 1.45, (ez0 + ez1) / 2 - 0.02, (ez0 + ez1) / 2 + 0.02, trim), F)
            for s, y in enumerate(SHELF_Y[:3]):
                _place(_b(f"{tag}_end_{end}_shelf_{s}", x0 + 0.03, x1 - 0.03, y - 0.03, y, ez0 + 0.02, ez1 - 0.02, shelf), F)
                kind = ("bag", "cereal", "can")[s]
                depth0, depth1 = (ez0 + 0.01, ez1 - 0.02) if facing == "-z" else (ez1 - 0.01, ez0 + 0.02)
                fill_shelf(f"{tag}_e{end}{s}", x0 + 0.08, x1 - 0.08, y, depth0, depth1, facing, kind, back_row=False, fill=0.85)


def fridge_unit(tag, x0, z0, x1, z1, y1, facing, M):
    """Reach-in refrigerated case with two glass doors, lit interior and product rows."""
    F = "SHOP_FIXTURES"
    white, trim, steel_black, glass, cool = M["white"], M["trim"], M["steel_black"], M["glass_clear"], M["cool"]
    # facing "+z": aisle at +z (rear wall units); "-x": aisle at -x (right wall units)
    if facing == "+z":
        back, front = z0, z1
        along0, along1 = x0, x1
    else:
        back, front = x1, x0
        along0, along1 = z0, z1
    inset = 0.04
    def span(name, a0, a1, y0, y1_, d0, d1, mat, **kw):
        if facing == "+z":
            return _place(_b(name, a0, a1, y0, y1_, min(d0, d1), max(d0, d1), mat, **kw), F)
        return _place(_b(name, min(d0, d1), max(d0, d1), y0, y1_, a0, a1, mat, **kw), F)
    interior_front = front - (0.12 if facing == "+z" else -0.12)
    # carcass: back, sides, bottom kick, top header
    span(f"{tag}_back", along0, along1, SLAB, y1, back, back + (0.06 if facing == "+z" else -0.06), white)
    span(f"{tag}_side_a", along0, along0 + 0.05, SLAB, y1, back, front, white)
    span(f"{tag}_side_b", along1 - 0.05, along1, SLAB, y1, back, front, white)
    span(f"{tag}_kick", along0, along1, SLAB, SLAB + 0.28, back, front, steel_black)
    span(f"{tag}_header", along0, along1, y1 - 0.22, y1, back, front, trim)
    span(f"{tag}_header_light", along0 + 0.1, along1 - 0.1, y1 - 0.2, y1 - 0.17, interior_front, interior_front + (-0.02 if facing == "+z" else 0.02), M["led"], tags={"castShadow": False})
    span(f"{tag}_floor", along0 + 0.05, along1 - 0.05, SLAB + 0.28, SLAB + 0.31, back, interior_front, white)
    # lit back panel (cool emissive) + wire shelves with row cards
    span(f"{tag}_glow", along0 + 0.06, along1 - 0.06, SLAB + 0.32, y1 - 0.22, back + (0.06 if facing == "+z" else -0.06), back + (0.075 if facing == "+z" else -0.075), cool, tags={"castShadow": False})
    depth = abs(interior_front - back) - 0.08
    for s, y in enumerate((SLAB + 0.31, SLAB + 0.75, SLAB + 1.19, SLAB + 1.55)):
        if s > 0:
            span(f"{tag}_shelf_{s}", along0 + 0.06, along1 - 0.06, y - 0.02, y, back + (0.08 if facing == "+z" else -0.08), interior_front, M["shelf"])
        cell = CELL[("row_bottles", "row_cartons", "row_bottles", "row_cans")[s]]
        ch = 0.3 if s < 3 else 0.22
        card_center_depth = (back + interior_front) / 2
        if facing == "+z":
            row_card(f"{tag}_row_{s}", ((along0 + along1) / 2, y + ch / 2, card_center_depth), (along1 - along0 - 0.16, ch, depth * 0.8), cell, _tint(), facing="+z")
        else:
            row_card(f"{tag}_row_{s}", (card_center_depth, y + ch / 2, (along0 + along1) / 2), (depth * 0.8, ch, along1 - along0 - 0.16), cell, _tint(), facing="-x")
    # two glass doors in a dark frame, handles on the aisle side
    mid = (along0 + along1) / 2
    frame_d0, frame_d1 = (interior_front, front) if facing == "+z" else (front, interior_front)
    span(f"{tag}_frame_top", along0 + 0.05, along1 - 0.05, y1 - 0.26, y1 - 0.22, frame_d0, frame_d1, trim)
    span(f"{tag}_frame_bot", along0 + 0.05, along1 - 0.05, SLAB + 0.28, SLAB + 0.34, frame_d0, frame_d1, trim)
    for k, a in enumerate((along0 + 0.05, mid, along1 - 0.09)):
        span(f"{tag}_frame_v_{k}", a, a + 0.04, SLAB + 0.28, y1 - 0.22, frame_d0, frame_d1, trim)
    for k, (a0, a1) in enumerate(((along0 + 0.09, mid), (mid + 0.04, along1 - 0.09))):
        gd = front - (0.05 if facing == "+z" else -0.05)
        if facing == "+z":
            _place(_K.plane(f"{tag}_glass_{k}", (a1 - a0, y1 - 0.26 - (SLAB + 0.34)), ((a0 + a1) / 2, (y1 - 0.26 + SLAB + 0.34) / 2, gd), glass, normal="z"), F)
            handle_a = a1 - 0.08 if k == 0 else a0 + 0.08
            _place(_b(f"{tag}_handle_{k}", handle_a - 0.015, handle_a + 0.015, SLAB + 0.9, SLAB + 1.5, gd, gd + 0.035, steel_black), F)
        else:
            _place(_K.plane(f"{tag}_glass_{k}", (a1 - a0, y1 - 0.26 - (SLAB + 0.34)), (gd, (y1 - 0.26 + SLAB + 0.34) / 2, (a0 + a1) / 2), glass, normal="x"), F)
            handle_a = a1 - 0.08 if k == 0 else a0 + 0.08
            _place(_b(f"{tag}_handle_{k}", gd - 0.035, gd, SLAB + 0.9, SLAB + 1.5, handle_a - 0.015, handle_a + 0.015, steel_black), F)


def produce_display(M):
    """Tiered timber/steel produce display along the west wall + crate stack."""
    F = "SHOP_FIXTURES"
    x0, z0, x1, z1 = PRODUCE
    timber, trim, steel_black = M["timber"], M["trim"], M["steel_black"]
    _place(_b("produce_plinth", x0, x1, SLAB, SLAB + 0.12, z0, z1, trim), F)
    _place(_b("produce_frame_low", x0 + 0.02, x1 - 0.02, SLAB + 0.12, SLAB + 0.5, z0 + 0.02, z1 - 0.02, timber, bevel=0.01), F)
    _place(_b("produce_frame_high", x0 + 0.02, x0 + 0.62, SLAB + 0.5, SLAB + 0.85, z0 + 0.02, z1 - 0.02, timber, bevel=0.01), F)
    _place(_b("produce_rail", x1 - 0.05, x1, SLAB + 0.5, SLAB + 0.56, z0, z1, steel_black), F)
    _place(_b("produce_board", x0, x0 + 0.03, SLAB + 1.4, SLAB + 2.0, z0 + 0.3, z1 - 0.3, trim), F)    # chalkboard on the wall
    _place(_b("produce_board_frame", x0 + 0.03, x0 + 0.05, SLAB + 1.38, SLAB + 2.02, z0 + 0.28, z1 - 0.28, timber), F)
    fruits = ("apple_red", "apple_green", "orange", "banana", "lemon", "potato", "cabbage", "tomato", "melon", "plum")
    n = 0
    for tier, (tx0, tx1, ty) in enumerate(((x0 + 0.64, x1 - 0.04, SLAB + 0.5), (x0 + 0.04, x0 + 0.62, SLAB + 0.85))):
        crate_w = 0.58
        count = int((z1 - z0 - 0.08) / crate_w)
        pitch = (z1 - z0 - 0.08) / count
        for k in range(count):
            cz0 = z0 + 0.04 + k * pitch + 0.02
            cz1 = cz0 + pitch - 0.04
            produce_crate(f"produce_crate_{tier}_{k}", tx0, tx1, ty, cz0, cz1, M, fruits[n % len(fruits)])
            n += 1
    # crate stack at the south end (on its own gameplay box)
    cx0, cz0, cx1, cz1 = CRATE_STACK
    for k, (y0, y1) in enumerate(((SLAB, SLAB + 0.3), (SLAB + 0.3, SLAB + 0.58))):
        _place(_b(f"produce_stack_{k}", cx0 + 0.05, cx1 - 0.05, y0, y1, cz0 + 0.05, cz1 - 0.05, timber, bevel=0.01), F)
    produce_crate("produce_stack_top", cx0 + 0.05, cx1 - 0.05, SLAB + 0.58, cz0 + 0.05, cz1 - 0.05, M, "orange")


def produce_crate(name, x0, x1, y0, z0, z1, M, fruit):
    F = "SHOP_FIXTURES"
    timber = M["timber"]
    h = 0.22
    t = 0.02
    _place(_b(f"{name}_w", x0, x0 + t, y0, y0 + h, z0, z1, timber), F)
    _place(_b(f"{name}_e", x1 - t, x1, y0, y0 + h, z0, z1, timber), F)
    _place(_b(f"{name}_n", x0, x1, y0, y0 + h, z0, z0 + t, timber), F)
    _place(_b(f"{name}_s", x0, x1, y0, y0 + h, z1 - t, z1, timber), F)
    _place(_b(f"{name}_b", x0 + t, x1 - t, y0, y0 + t, z0 + t, z1 - t, timber), F)
    # fruit heap: one flattened icosphere per crate + a few loose pieces on top
    heap = _icosphere(f"{name}_heap", ((x0 + x1) / 2, y0 + 0.16, (z0 + z1) / 2), ((x1 - x0) / 2 - 0.03, 0.11, (z1 - z0) / 2 - 0.03), M[fruit], subdivisions=2)
    _place(heap, "PRODUCT_INSTANCES")
    r = 0.045 if fruit not in ("melon", "cabbage") else 0.08
    for k in range(3 if r < 0.06 else 1):
        ox = _rng.uniform(-0.12, 0.12) * ((x1 - x0) / 0.6)
        oz = _rng.uniform(-0.12, 0.12) * ((z1 - z0) / 0.6)
        piece = _icosphere(f"{name}_piece_{k}", ((x0 + x1) / 2 + ox, y0 + 0.24 + r * 0.6, (z0 + z1) / 2 + oz), (r, r * 0.9, r), M[fruit], subdivisions=1)
        _place(piece, "PRODUCT_INSTANCES")


def _icosphere(name, center, radii, mat, *, subdivisions=1):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    rx, ry, rz = radii
    bmesh.ops.scale(bm, vec=Vector((rx, rz, ry)), verts=bm.verts)
    for f in bm.faces:
        f.smooth = True
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = zk.to_blender(center)
    _K._finish(obj, mat, "LOD0", {"castShadow": False}, 0.0)
    return obj


def checkout(M):
    F = "SHOP_FIXTURES"
    x0, z0, x1, z1 = CHECKOUT
    navy, counter, steel_black, steel, rubber, shelf = M["navy"], M["counter"], M["steel_black"], M["steel"], M["rubber"], M["shelf"]
    _place(_b("checkout_kick", x0, x1, SLAB, SLAB + 0.1, z0, z1, steel_black), F)
    _place(_b("checkout_body", x0 + 0.02, x1 - 0.02, SLAB + 0.1, SLAB + 0.84, z0 + 0.02, z1 - 0.02, navy, bevel=0.01), F)
    _place(_b("checkout_top", x0 - 0.02, x1 + 0.02, SLAB + 0.84, SLAB + 0.9, z0 - 0.02, z1 - 0.7, counter, bevel=0.01), F)
    # conveyor belt inset in the north half, steel edge trims
    _place(_b("checkout_belt", x0 + 0.2, x1 - 0.2, SLAB + 0.9, SLAB + 0.92, z0 + 0.15, z0 + 1.55, rubber), F)
    _place(_b("checkout_belt_edge_w", x0 + 0.14, x0 + 0.2, SLAB + 0.88, SLAB + 0.93, z0 + 0.1, z0 + 1.6, steel), F)
    _place(_b("checkout_belt_edge_e", x1 - 0.2, x1 - 0.14, SLAB + 0.88, SLAB + 0.93, z0 + 0.1, z0 + 1.6, steel), F)
    # scanner well + register + monitor on a post, card terminal
    _place(_b("checkout_scanner", x0 + 0.3, x1 - 0.3, SLAB + 0.9, SLAB + 0.915, z0 + 1.7, z0 + 2.0, steel_black), F)
    _place(_b("checkout_register", x1 - 0.5, x1 - 0.1, SLAB + 0.9, SLAB + 1.02, z0 + 2.05, z0 + 2.45, steel_black, bevel=0.01), F)
    _place(_b("checkout_monitor_post", x1 - 0.32, x1 - 0.28, SLAB + 1.02, SLAB + 1.32, z0 + 2.2, z0 + 2.24, steel_black), F)
    _place(_b("checkout_monitor", x1 - 0.48, x1 - 0.12, SLAB + 1.2, SLAB + 1.46, z0 + 2.18, z0 + 2.21, steel_black), F)
    _place(_b("checkout_screen", x1 - 0.46, x1 - 0.14, SLAB + 1.22, SLAB + 1.44, z0 + 2.175, z0 + 2.18, M["screen"], tags={"castShadow": False}), F)
    _place(_b("checkout_terminal", x0 + 0.12, x0 + 0.3, SLAB + 0.9, SLAB + 1.0, z0 + 2.1, z0 + 2.3, steel_black), F)
    # bagging shelf at the south end (lower), bag hooks
    _place(_b("checkout_bagging", x0 + 0.02, x1 - 0.02, SLAB + 0.7, SLAB + 0.74, z1 - 0.7, z1 - 0.02, counter), F)
    _place(_b("checkout_bag_rail", x0 + 0.15, x1 - 0.15, SLAB + 0.98, SLAB + 1.0, z1 - 0.4, z1 - 0.38, steel), F)
    # impulse rack on the customer side (west)
    ix0, iz0, ix1, iz1 = IMPULSE
    _place(_b("impulse_back", ix1 - 0.04, ix1, SLAB, SLAB + 1.2, iz0, iz1, M["trim"]), F)
    _place(_b("impulse_side_n", ix0, ix1, SLAB, SLAB + 1.2, iz0, iz0 + 0.03, M["trim"]), F)
    _place(_b("impulse_side_s", ix0, ix1, SLAB, SLAB + 1.2, iz1 - 0.03, iz1, M["trim"]), F)
    for s, y in enumerate((SLAB + 0.35, SLAB + 0.65, SLAB + 0.95)):
        _place(_b(f"impulse_shelf_{s}", ix0 + 0.02, ix1 - 0.04, y - 0.02, y, iz0 + 0.03, iz1 - 0.03, shelf), F)
        fill_shelf(f"impulse_p{s}", iz0 + 0.08, iz1 - 0.08, y, ix0 + 0.02, ix1 - 0.05, "-x", ("bag", "box", "can")[s], back_row=False)
    # cashier wall shelf (east wall) with cartons/boxes
    wx0, wz0, wx1, wz1 = WALL_SHELF
    _place(_b("wallshelf_back", wx1 - 0.03, wx1, SLAB, SLAB + 1.65, wz0, wz1, M["trim"]), F)
    for s, y in enumerate((SLAB + 0.5, SLAB + 0.9, SLAB + 1.3)):
        _place(_b(f"wallshelf_{s}", wx0, wx1 - 0.03, y - 0.02, y, wz0, wz1, shelf), F)
        fill_shelf(f"wallshelf_p{s}", wz0 + 0.05, wz1 - 0.05, y, wx0 + 0.01, wx1 - 0.04, "-x", ("box", "carton", "box")[s], back_row=False)
    # shopping baskets stacked by the counter end, anti-theft gates, entrance mat
    for k in range(3):
        basket(f"basket_{k}", (IMPULSE[0] + 0.25, SLAB + 0.02 + k * 0.07, -34.0), M)
    # anti-theft pedestals just inside the door line, flanking the 3 m doorway volume
    gz0, gz1 = -33.58, -33.2
    for gx in (DOOR_X[0] - 0.3, DOOR_X[1] + 0.15):
        _place(_b(f"gate_{gx:.1f}_base", gx, gx + 0.15, SLAB, SLAB + 0.06, gz0, gz1, steel_black), F)
        _place(_b(f"gate_{gx:.1f}_panel", gx + 0.04, gx + 0.11, SLAB + 0.06, SLAB + 1.55, gz0 + 0.04, gz1 - 0.04, M["grey"], bevel=0.01), F)
        _place(_b(f"gate_{gx:.1f}_cap", gx + 0.02, gx + 0.13, SLAB + 1.55, SLAB + 1.6, gz0 + 0.02, gz1 - 0.02, steel_black), F)
        _place(_b(f"gate_{gx:.1f}_led", gx + 0.045, gx + 0.105, SLAB + 1.45, SLAB + 1.5, gz0 + 0.06, gz1 - 0.06, M["red"], tags={"castShadow": False}), F)
    _place(_b("entrance_mat", 43.6, 46.4, SLAB + 0.001, SLAB + 0.009, -34.6, -33.2, rubber, tags={"castShadow": False}), F)


def basket(name, center, M):
    x, y, z = center
    w, d, h, t = 0.42, 0.3, 0.22, 0.012
    F = "SHOP_FIXTURES"
    _place(_b(f"{name}_b", x - w / 2, x + w / 2, y, y + t, z - d / 2, z + d / 2, M["rubber"]), F)
    _place(_b(f"{name}_w", x - w / 2, x - w / 2 + t, y, y + h, z - d / 2, z + d / 2, M["rubber"]), F)
    _place(_b(f"{name}_e", x + w / 2 - t, x + w / 2, y, y + h, z - d / 2, z + d / 2, M["rubber"]), F)
    _place(_b(f"{name}_n", x - w / 2, x + w / 2, y, y + h, z - d / 2, z - d / 2 + t, M["rubber"]), F)
    _place(_b(f"{name}_s", x - w / 2, x + w / 2, y, y + h, z + d / 2 - t, z + d / 2, M["rubber"]), F)
    _place(_b(f"{name}_handle", x - 0.02, x + 0.02, y + h, y + h + 0.16, z - 0.01, z + 0.01, M["rubber"]), F)


def rooms(M):
    """Stockroom + manager/utility room in the rear-left corner (partition walls to the roof)."""
    F = "SHOP_INTERIOR"
    wall, trim, steel, steel_black, timber = M["wall_cream"], M["trim"], M["steel"], M["steel_black"], M["timber"]
    (rx0, rz0), (rx1, rz1) = ROOMS
    wz0, wz1 = ROOM_WALL_Z
    top = MART[1][1] - 0.02
    (da0, da1), (db0, db1) = ROOM_DOORS
    ow0, ow1, oy0, oy1 = 41.0, 41.85, SLAB + 1.15, SLAB + 2.0          # office window opening
    _place(_b("room_wall_s_0", rx0, da0, SLAB, top, wz0, wz1, wall), F)
    # middle segment split around the office window so the glass is see-through
    _place(_b("room_wall_s_1a", da1, ow0, SLAB, top, wz0, wz1, wall), F)
    _place(_b("room_wall_s_1b", ow1, db0, SLAB, top, wz0, wz1, wall), F)
    _place(_b("room_wall_s_1c", ow0, ow1, SLAB, oy0, wz0, wz1, wall), F)
    _place(_b("room_wall_s_1d", ow0, ow1, oy1, top, wz0, wz1, wall), F)
    _place(_b("room_wall_s_2", db1, rx1, SLAB, top, wz0, wz1, wall), F)
    _place(_b("room_partition", PARTITION_X[0], PARTITION_X[1], SLAB, top, rz0, wz0, wall), F)
    _place(_b("room_wall_e", ROOM_EAST_X[0], ROOM_EAST_X[1], SLAB, top, rz0, wz0, wall), F)
    # door frames, open leaves swung inside against the wall, small window into the office
    for k, (d0, d1) in enumerate(ROOM_DOORS):
        _place(_b(f"room_door_head_{k}", d0 - 0.04, d1 + 0.04, SLAB + 2.1, SLAB + 2.18, wz0 - 0.01, wz1 + 0.01, steel), F)
        for jx in (d0 - 0.04, d1):
            _place(_b(f"room_door_jamb_{k}_{jx:.1f}", jx, jx + 0.04, SLAB, SLAB + 2.1, wz0 - 0.01, wz1 + 0.01, steel), F)
        # leaf: hinged at d0, swung 90 degrees into the room (lies along the wall inside)
        _place(_b(f"room_door_leaf_{k}", d0 - 0.02, d0 + 0.02, SLAB + 0.02, SLAB + 2.08, wz0 - (d1 - d0) - 0.02, wz0 - 0.02, trim), F)
        _place(_b(f"room_door_handle_{k}", d0 - 0.05, d0 + 0.05, SLAB + 1.0, SLAB + 1.03, wz0 - (d1 - d0) + 0.02, wz0 - (d1 - d0) + 0.1, steel), F)
    for fx in (ow0 - 0.04, ow1):
        _place(_b(f"office_window_jamb_{fx:.1f}", fx, fx + 0.04, oy0 - 0.04, oy1 + 0.04, wz0 - 0.01, wz1 + 0.01, steel), F)
    for fy in (oy0 - 0.04, oy1):
        _place(_b(f"office_window_rail_{fy:.1f}", ow0, ow1, fy, fy + 0.04, wz0 - 0.01, wz1 + 0.01, steel), F)
    _place(_K.plane("office_window", (ow1 - ow0, oy1 - oy0), ((ow0 + ow1) / 2, (oy0 + oy1) / 2, (wz0 + wz1) / 2), M["glass_clear"], normal="z"), F)
    # roof-access ladder on the stockroom's west wall: stiles, rungs, wall brackets, up
    # through the ceiling and roof hatch; the climb column is a COL_LADDER (approach +x)
    lx0, lz0, lx1, lz1 = LADDER
    (rx0, ry0, rz0), (rx1, ry1, rz1) = ROOF
    for sz in (lz0 + 0.02, lz1 - 0.06):
        _place(_b(f"ladder_stile_{sz:.1f}", lx0 + 0.02, lx0 + 0.06, SLAB + 0.1, ry1 + 1.0, sz, sz + 0.04, steel), F)
    for k, ly in enumerate([SLAB + 0.35 + 0.3 * i for i in range(int((ry1 + 0.9 - SLAB - 0.35) / 0.3) + 1)]):
        _place(_K.cylinder(f"ladder_rung_{k}", 0.016, lz1 - lz0 - 0.08, (lx0 + 0.04, ly, (lz0 + lz1) / 2), steel, segments=6, axis="z"), F)
    for by in (SLAB + 1.0, SLAB + 2.6, SLAB + 4.0):
        _place(_b(f"ladder_bracket_{by:.0f}", IN_X[0], lx0 + 0.02, by, by + 0.05, (lz0 + lz1) / 2 - 0.03, (lz0 + lz1) / 2 + 0.03, steel_black), F)
    # hoop at the top so the exit reads from the roof
    _place(_K.torus("ladder_hoop", (lx0 + 0.04, ry1 + 1.0, (lz0 + lz1) / 2), (lz1 - lz0) / 2 - 0.02, 0.02, steel,
                    segments=10, profile=5, axis="x", arc=(0.0, math.pi)), F)
    _K.collider("STOCK_LADDER", (lx0, SLAB, lz0), (lx1, ry1, lz1), ladder="+x")
    _place(_b("ladder_sign", IN_X[0] + 0.001, IN_X[0] + 0.006, SLAB + 1.9, SLAB + 2.1, lz1 + 0.08, lz1 + 0.38, M["paint_yellow"], tags={"castShadow": False}), F)
    # stockroom shelving (on its box) + boxes; manager desk, chair, monitor
    sx0, sz0, sx1, sz1 = STOCK_SHELF
    for ux in (sx0 + 0.02, (sx0 + sx1) / 2, sx1 - 0.06):
        for uz in (sz0 + 0.02, sz1 - 0.06):
            _place(_b(f"stock_upright_{ux:.1f}_{uz:.1f}", ux, ux + 0.04, SLAB, SLAB + 1.95, uz, uz + 0.04, steel_black), F)
    for s, y in enumerate((SLAB + 0.12, SLAB + 0.62, SLAB + 1.12, SLAB + 1.62)):
        _place(_b(f"stock_shelf_{s}", sx0, sx1, y, y + 0.03, sz0, sz1, M["shelf"]), F)
        for k in range(3):
            bx = sx0 + 0.12 + k * 0.78
            _place(_b(f"stock_box_{s}_{k}", bx, bx + 0.55 + (k % 2) * 0.1, y + 0.03, y + 0.4 - (s % 2) * 0.08, sz0 + 0.03, sz1 - 0.03, M["cardboard"], bevel=0.005), "PRODUCT_INSTANCES")
    dx0, dz0, dx1, dz1 = DESK
    _place(_b("desk_top", dx0, dx1, SLAB + 0.72, SLAB + 0.76, dz0, dz1, timber, bevel=0.005), F)
    for lx in (dx0 + 0.03, dx1 - 0.06):
        _place(_b(f"desk_leg_{lx:.1f}", lx, lx + 0.03, SLAB, SLAB + 0.72, dz0 + 0.03, dz1 - 0.03, steel_black), F)
    _place(_b("desk_monitor", dx0 + 0.4, dx0 + 0.85, SLAB + 0.9, SLAB + 1.2, dz0 + 0.1, dz0 + 0.13, steel_black), F)
    _place(_b("desk_screen", dx0 + 0.42, dx0 + 0.83, SLAB + 0.92, SLAB + 1.18, dz0 + 0.13, dz0 + 0.135, M["screen"], tags={"castShadow": False}), F)
    _place(_b("desk_monitor_foot", dx0 + 0.58, dx0 + 0.67, SLAB + 0.76, SLAB + 0.9, dz0 + 0.08, dz0 + 0.16, steel_black), F)
    _place(_b("desk_papers", dx0 + 0.1, dx0 + 0.36, SLAB + 0.76, SLAB + 0.775, dz0 + 0.15, dz0 + 0.5, M["white"], tags={"castShadow": False}), F)
    cx, cz = (dx0 + dx1) / 2, dz1 + 0.45
    _place(_b("chair_seat", cx - 0.22, cx + 0.22, SLAB + 0.44, SLAB + 0.5, cz - 0.22, cz + 0.22, trim, bevel=0.01), F)
    _place(_b("chair_back", cx - 0.2, cx + 0.2, SLAB + 0.5, SLAB + 0.95, cz + 0.18, cz + 0.23, trim, bevel=0.01), F)
    _place(_b("chair_post", cx - 0.03, cx + 0.03, SLAB + 0.1, SLAB + 0.44, cz - 0.03, cz + 0.03, steel_black), F)
    _place(_b("chair_base", cx - 0.25, cx + 0.25, SLAB + 0.04, SLAB + 0.08, cz - 0.03, cz + 0.03, steel_black), F)
    _place(_b("chair_base_b", cx - 0.03, cx + 0.03, SLAB + 0.04, SLAB + 0.08, cz - 0.25, cz + 0.25, steel_black), F)
    # fire extinguisher + sign on the office wall facing the sales floor, utility conduit along the rear wall
    ex, ez = ROOM_EAST_X[1] + 0.09, -41.4
    _place(_K.cylinder("fire_ext", 0.075, 0.5, (ex, SLAB + 1.05, ez), M["safety_red"], segments=8), F)
    _place(_K.cylinder("fire_ext_neck", 0.03, 0.08, (ex, SLAB + 1.34, ez), steel_black, segments=6), F)
    _place(_b("fire_ext_bracket", ROOM_EAST_X[1], ROOM_EAST_X[1] + 0.04, SLAB + 1.0, SLAB + 1.1, ez - 0.05, ez + 0.05, steel_black), F)
    _place(_b("fire_sign", ROOM_EAST_X[1], ROOM_EAST_X[1] + 0.005, SLAB + 1.75, SLAB + 1.95, ez - 0.1, ez + 0.1, M["safety_red"], tags={"castShadow": False}), F)
    _place(_tube("conduit_rear", (rx1 + 0.2, 3.6, IN_Z[0] + 0.05), (IN_X[1] - 0.2, 3.6, IN_Z[0] + 0.05), 0.025, steel), F)
    _place(_b("conduit_box", IN_X[1] - 0.6, IN_X[1] - 0.3, 3.4, 3.8, IN_Z[0] + 0.0, IN_Z[0] + 0.12, M["grey"]), F)
    _place(_tube("conduit_drop", (IN_X[1] - 0.45, 2.2, IN_Z[0] + 0.05), (IN_X[1] - 0.45, 3.4, IN_Z[0] + 0.05), 0.02, steel), F)


def interior_shell(M):
    """Floor, lining, dado, suspended ceiling with the LED grid."""
    F = "SHOP_INTERIOR"
    (mx0, my0, mz0), (mx1, my1, mz1) = MART
    x0, x1 = IN_X
    z0, z1 = IN_Z
    _place(_b("shop_floor", x0, x1, SLAB - 0.02, SLAB + 0.002, z0, z1, M["floor"]), F)
    # floor joints (grout lines) every 1.2 m
    k = 0
    for jx in range(int(x0 / 1.2) + 1, int(x1 / 1.2) + 1):
        if x0 + 0.1 < jx * 1.2 < x1 - 0.1:
            _place(_b(f"floor_joint_x_{k}", jx * 1.2 - 0.006, jx * 1.2 + 0.006, SLAB + 0.002, SLAB + 0.004, z0, z1, M["trim"], tags={"castShadow": False}), F); k += 1
    for jz in range(int(z0 / 1.2) - 1, int(z1 / 1.2) + 1):
        if z0 + 0.1 < jz * 1.2 < z1 - 0.1:
            _place(_b(f"floor_joint_z_{k}", x0, x1, SLAB + 0.002, SLAB + 0.004, jz * 1.2 - 0.006, jz * 1.2 + 0.006, M["trim"], tags={"castShadow": False}), F); k += 1
    # wall lining (rear / west / east) with a dark dado band, front returns beside the glazing
    _place(_b("lining_n", x0, x1, SLAB, CEIL + 0.05, z0, z0 + 0.04, M["wall_cream"]), F)
    _place(_b("lining_w", x0, x0 + 0.04, SLAB, CEIL + 0.05, z0, z1, M["wall_cream"]), F)
    _place(_b("lining_e", x1 - 0.04, x1, SLAB, CEIL + 0.05, z0, z1, M["wall_cream"]), F)
    _place(_b("lining_s_w", x0, 39.6, SLAB, CEIL + 0.05, z1 - 0.04, z1, M["wall_cream"]), F)
    _place(_b("lining_s_e", 50.4, x1, SLAB, CEIL + 0.05, z1 - 0.04, z1, M["wall_cream"]), F)
    for nm, (a0, a1, b0, b1) in {"n": (x0, x1, z0 + 0.04, z0 + 0.06), "w": (x0 + 0.04, x0 + 0.06, z0, z1), "e": (x1 - 0.06, x1 - 0.04, z0, z1)}.items():
        _place(_b(f"dado_{nm}", a0, a1, SLAB, SLAB + 0.9, b0, b1, M["trim"]), F)
    # suspended ceiling (split around the roof-hatch shaft) + 3 x 4 LED panel grid + room lights
    hx0, hz0, hx1, hz1 = HATCH
    _place(_b("ceiling_w", x0, hx0, CEIL, CEIL + 0.05, z0, z1, M["ceiling"]), F)
    _place(_b("ceiling_e", hx1, x1, CEIL, CEIL + 0.05, z0, z1, M["ceiling"]), F)
    _place(_b("ceiling_n", hx0, hx1, CEIL, CEIL + 0.05, z0, hz0, M["ceiling"]), F)
    _place(_b("ceiling_s", hx0, hx1, CEIL, CEIL + 0.05, hz1, z1, M["ceiling"]), F)
    for gx in (40.6, 45.0, 49.4):
        for gz in (-41.4, -39.0, -36.6, -34.3):
            if gz > -40.5 or gx > ROOMS[1][0]:
                _place(_b(f"led_{gx:.0f}_{gz:.0f}", gx - 0.3, gx + 0.3, CEIL - 0.012, CEIL, gz - 0.6, gz + 0.6, M["led"], tags={"castShadow": False}), F)
                _place(_b(f"led_{gx:.0f}_{gz:.0f}_frame", gx - 0.33, gx + 0.33, CEIL - 0.01, CEIL + 0.001, gz - 0.63, gz + 0.63, M["white"], tags={"castShadow": False}), F)
    for rx in (40.1, 41.9):
        _place(_b(f"led_room_{rx:.0f}", rx - 0.3, rx + 0.3, CEIL - 0.012, CEIL, -42.4, -41.6, M["led"], tags={"castShadow": False}), F)
    # window returns (inner jambs) beside the glazing so the wall reads as 0.4 m thick
    for jx in (39.6, 50.4):
        _place(_b(f"glazing_return_{jx:.0f}", jx - 0.02, jx + 0.02, SLAB, CEIL, z1, FRONT - 0.02, M["wall_cream"]), F)


# --------------------------------------------------------------------------- #
# Exterior
# --------------------------------------------------------------------------- #

def storefront(M):
    F = "SHOP_EXTERIOR"
    steel, glass, charcoal = M["steel"], M["glass_clear"], M["charcoal"]
    (mx0, my0, mz0), (mx1, my1, mz1) = MART
    dx0, dx1 = DOOR_X
    gl0, gl1 = 39.6, dx0          # fixed glazing spans
    gr0, gr1 = dx1, 50.4
    head = CEIL                    # 4.2 glazing head
    # sill on the plinth, head channel, spandrel cladding above
    for nm, (a0, a1) in (("l", (gl0, gl1)), ("r", (gr0, gr1))):
        # the sill stops at the door jamb so nothing pokes into the doorway volume
        s0, s1 = (a0 - 0.02, a1 - 0.08) if nm == "l" else (a0 + 0.08, a1 + 0.02)
        _place(_b(f"sf_sill_{nm}", s0, s1, BASE_TOP - 0.02, BASE_TOP + 0.05, FRONT - 0.05, FRONT + 0.2, M["concrete"]), F)
        _place(_b(f"sf_head_{nm}", a0 - 0.02, a1 + 0.02, head - 0.06, head + 0.02, FRONT - 0.06, FRONT + 0.14, steel), F)
        _place(_b(f"sf_transom_{nm}", a0, a1, 3.0, 3.06, FRONT - 0.04, FRONT + 0.12, steel), F)
        n = 3
        for k in range(n + 1):
            mxk = a0 + (a1 - a0) * k / n
            # the mullions next to the door stay inside the glazing span (door jambs take over)
            m0, m1 = (mxk - 0.08, mxk) if (nm == "l" and k == n) else (mxk, mxk + 0.08) if (nm == "r" and k == 0) else (mxk - 0.04, mxk + 0.04)
            _place(_b(f"sf_mullion_{nm}_{k}", m0, m1, BASE_TOP, head, FRONT - 0.05, FRONT + 0.13, steel), F)
        _place(_K.plane(f"sf_glass_{nm}", (a1 - a0 - 0.08, head - BASE_TOP - 0.1), ((a0 + a1) / 2, (head + BASE_TOP) / 2, FRONT + 0.02), glass, normal="z"), F)
    # automatic bi-parting door: jambs, operator header, transom light, leaves parked open
    for jx in (dx0 - 0.08, dx1):
        _place(_b(f"door_jamb_{jx:.1f}", jx, jx + 0.08, SLAB, 2.9, FRONT - 0.22, FRONT + 0.14, steel), F)
    _place(_b("door_header", dx0 - 0.08, dx1 + 0.08, 2.9, 3.2, FRONT - 0.25, FRONT + 0.22, M["trim"], bevel=0.01), F)
    _place(_b("door_header_light", dx0 + 0.6, dx1 - 0.6, 3.05, 3.08, FRONT + 0.22, FRONT + 0.225, M["cyan"], tags={"castShadow": False}), F)
    _place(_b("door_sensor", (dx0 + dx1) / 2 - 0.12, (dx0 + dx1) / 2 + 0.12, 2.92, 2.98, FRONT + 0.22, FRONT + 0.3, M["steel_black"]), F)
    _place(_b("door_transom_frame", dx0 - 0.08, dx1 + 0.08, 3.2, head + 0.02, FRONT - 0.06, FRONT + 0.14, steel), F)
    _place(_K.plane("door_transom_glass", (dx1 - dx0 - 0.1, head - 3.26), ((dx0 + dx1) / 2, (head + 3.2) / 2, FRONT + 0.02), glass, normal="z"), F)
    _place(_b("door_track", dx0 - 1.55, dx1 + 1.55, 2.86, 2.9, FRONT + 0.16, FRONT + 0.3, steel), F)
    _place(_b("door_threshold", dx0 - 0.1, dx1 + 0.1, SLAB, SLAB + 0.006, FRONT - 0.3, FRONT + 0.3, steel, tags={"castShadow": False}), F)
    for k, (lx0, lx1) in enumerate(((dx0 - 1.5, dx0 - 0.02), (dx1 + 0.02, dx1 + 1.5))):
        # leaf: slim frame + glass, slid fully open in front of the fixed sidelight
        _place(_b(f"door_leaf_{k}_top", lx0, lx1, 2.72, 2.84, FRONT + 0.2, FRONT + 0.26, steel), F)
        _place(_b(f"door_leaf_{k}_bot", lx0, lx1, SLAB + 0.02, SLAB + 0.14, FRONT + 0.2, FRONT + 0.26, steel), F)
        for sx in (lx0, lx1 - 0.05):
            _place(_b(f"door_leaf_{k}_stile_{sx:.1f}", sx, sx + 0.05, SLAB + 0.14, 2.72, FRONT + 0.2, FRONT + 0.26, steel), F)
        _place(_K.plane(f"door_leaf_{k}_glass", (lx1 - lx0 - 0.1, 2.72 - SLAB - 0.14), ((lx0 + lx1) / 2, (2.72 + SLAB + 0.14) / 2, FRONT + 0.23), glass, normal="z"), F)
        _place(_b(f"door_leaf_{k}_rail", lx0 + 0.1, lx1 - 0.1, SLAB + 0.95, SLAB + 0.99, FRONT + 0.26, FRONT + 0.3, M["steel_black"]), F)
    _place(_b("entrance_mat_out", dx0 + 0.1, dx1 - 0.1, SLAB + 0.001, SLAB + 0.008, FRONT + 0.32, FRONT + 1.3, M["rubber"], tags={"castShadow": False}), F)
    # restrained cyan canopy strip right above the glazing head
    _place(_b("canopy_strip", 39.4, 50.6, head + 0.1, head + 0.24, FRONT - 0.02, FRONT + 0.7, M["clad_dark"], bevel=0.01), F)
    _place(_b("canopy_strip_lip", 39.4, 50.6, head - 0.02, head + 0.1, FRONT + 0.6, FRONT + 0.7, M["trim"]), F)
    # the cyan LED line runs along the underside of the lip and wraps its front edge
    _place(_b("canopy_strip_light", 39.6, 50.4, head + 0.02, head + 0.06, FRONT + 0.46, FRONT + 0.6, M["cyan"], tags={"castShadow": False}), F)
    _place(_b("canopy_strip_light_edge", 39.6, 50.4, head + 0.0, head + 0.04, FRONT + 0.7, FRONT + 0.715, M["cyan"], tags={"castShadow": False}), F)
    for k in range(4):
        sx = 40.8 + k * 2.8
        _place(_bar(f"canopy_strip_tie_{k}", (sx, head + 0.24, FRONT + 0.62), (sx, head + 0.75, FRONT + 0.12), 0.03, steel), F)


def shell(M):
    """Foundation band, charcoal cladding, roof, parapet, canopy with the sign fascia, utilities."""
    F = "SHOP_EXTERIOR"
    (mx0, my0, mz0), (mx1, my1, mz1) = MART
    steel, concrete, charcoal, clad_dark = M["steel"], M["concrete"], M["charcoal"], M["clad_dark"]
    dx0, dx1 = DOOR_X
    wall_y1 = my1 - 0.05
    # warm weathered concrete foundation band, every face (the front band stops at the door jambs)
    _b("base_s_l", mx0 - 0.02, dx0 - 0.08, 0.0, BASE_TOP, FRONT - 0.02, FRONT + 0.16, concrete, bevel=0.02)
    _b("base_s_r", dx1 + 0.08, mx1 + 0.02, 0.0, BASE_TOP, FRONT - 0.02, FRONT + 0.16, concrete, bevel=0.02)
    _b("base_w", mx0 - 0.16, mx0 + 0.02, 0.0, BASE_TOP, mz0 - 0.16, FRONT + 0.16, concrete, bevel=0.02)
    _b("base_e", mx1 - 0.02, mx1 + 0.16, 0.0, BASE_TOP, mz0 - 0.16, FRONT + 0.16, concrete, bevel=0.02)
    _b("base_n", mx0 - 0.16, mx1 + 0.16, 0.0, BASE_TOP, mz0 - 0.16, mz0 + 0.02, concrete, bevel=0.02)
    # charcoal vertical metal cladding
    _b("clad_w", mx0 - 0.12, mx0 + 0.02, BASE_TOP, wall_y1, mz0 - 0.12, FRONT + 0.12, charcoal)
    _b("clad_e", mx1 - 0.02, mx1 + 0.12, BASE_TOP, wall_y1, mz0 - 0.12, FRONT + 0.12, charcoal)
    _b("clad_n", mx0 - 0.12, mx1 + 0.12, BASE_TOP, wall_y1, mz0 - 0.12, mz0 + 0.02, charcoal)
    _b("clad_s_l", mx0 - 0.02, 39.6, BASE_TOP, wall_y1, FRONT - 0.02, FRONT + 0.12, charcoal)
    _b("clad_s_r", 50.4, mx1 + 0.02, BASE_TOP, wall_y1, FRONT - 0.02, FRONT + 0.12, charcoal)
    _b("clad_s_top", 39.6, 50.4, CEIL + 0.02, wall_y1, FRONT - 0.02, FRONT + 0.12, charcoal)
    # corner trims + horizontal flashing line at the plinth
    for cx in (mx0 - 0.13, mx1 + 0.05):
        for cz in (mz0 - 0.13, FRONT + 0.05):
            _b(f"corner_{cx:.0f}_{cz:.0f}", cx, cx + 0.08, BASE_TOP, wall_y1, cz, cz + 0.08, M["trim"])
    _b("plinth_flashing_w", mx0 - 0.17, mx0 - 0.11, BASE_TOP, BASE_TOP + 0.04, mz0 - 0.17, FRONT + 0.17, steel)
    _b("plinth_flashing_e", mx1 + 0.11, mx1 + 0.17, BASE_TOP, BASE_TOP + 0.04, mz0 - 0.17, FRONT + 0.17, steel)
    _b("plinth_flashing_n", mx0 - 0.17, mx1 + 0.17, BASE_TOP, BASE_TOP + 0.04, mz0 - 0.17, mz0 - 0.11, steel)
    # roof slab on its collider + fascia + parapet (zone colliders, now closed on the west edge too)
    (rx0, ry0, rz0), (rx1, ry1, rz1) = ROOF
    # dark membrane roof on the collider (1 m overhang), fascia band below its edge,
    # split around the roof-access hatch above the stockroom ladder
    hx0, hz0, hx1, hz1 = HATCH
    _b("roof_w", rx0 - 0.03, hx0, ry0 - 0.22, ry1, rz0 - 0.03, rz1 + 0.03, clad_dark)
    _b("roof_e", hx1, rx1 + 0.03, ry0 - 0.22, ry1, rz0 - 0.03, rz1 + 0.03, clad_dark)
    _b("roof_n", hx0, hx1, ry0 - 0.22, ry1, rz0 - 0.03, hz0, clad_dark)
    _b("roof_s", hx0, hx1, ry0 - 0.22, ry1, hz1, rz1 + 0.03, clad_dark)
    # hatch: steel curb with a yellow safety band, lid standing open against the north edge,
    # drip lining down the shaft so the hole reads as built, not missing
    for nm, (a0, a1, b0, b1) in {"w": (hx0 - 0.08, hx0, hz0 - 0.08, hz1 + 0.08), "e": (hx1, hx1 + 0.08, hz0 - 0.08, hz1 + 0.08),
                                 "n": (hx0, hx1, hz0 - 0.08, hz0), "s": (hx0, hx1, hz1, hz1 + 0.08)}.items():
        _b(f"hatch_curb_{nm}", a0, a1, ry1, ry1 + 0.22, b0, b1, steel)
        _b(f"hatch_curb_{nm}_band", a0 - 0.002, a1 + 0.002, ry1 + 0.1, ry1 + 0.16, b0 - 0.002, b1 + 0.002, M["paint_yellow"], tags={"castShadow": False})
    _b("hatch_lid", hx0 - 0.02, hx1 + 0.02, ry1 + 0.22, ry1 + 0.22 + (hz1 - hz0), hz0 - 0.14, hz0 - 0.08, steel, bevel=0.01)
    _b("hatch_lid_handle", (hx0 + hx1) / 2 - 0.12, (hx0 + hx1) / 2 + 0.12, ry1 + 0.9, ry1 + 0.94, hz0 - 0.18, hz0 - 0.14, M["steel_black"])
    for nm, (a0, a1, b0, b1) in {"w": (hx0, hx0 + 0.02, hz0, hz1), "e": (hx1 - 0.02, hx1, hz0, hz1),
                                 "n": (hx0, hx1, hz0, hz0 + 0.02), "s": (hx0, hx1, hz1 - 0.02, hz1)}.items():
        _b(f"hatch_shaft_{nm}", a0, a1, CEIL - 0.05, ry1, b0, b1, M["trim"])
    pp = 0.15
    for nm, (x0, x1, z0, z1) in {"n": (rx0, rx1, rz0, rz0 + pp), "s": (rx0, rx1, rz1 - pp, rz1),
                                 "e": (rx1 - pp, rx1, rz0, rz1), "w": (rx0, rx0 + pp, rz0, rz1)}.items():
        _b(f"parapet_{nm}", x0, x1, ry1, ry1 + 0.5, z0, z1, concrete, bevel=0.02)
        _b(f"parapet_flashing_{nm}", x0 - 0.02, x1 + 0.02, ry1 + 0.5, ry1 + 0.56, z0 - 0.02, z1 + 0.02, steel)
        _K.collider(f"PARAPET_{nm.upper()}", (x0, ry1 + 0.001, z0), (x1, ry1 + 0.56, z1))
    # entrance canopy on the legacy canopy collider: soffit, deep fascia carrying the sign, downlights
    (cx0, cy0, cz0), (cx1, cy1, cz1) = CANOPY
    # the roof slab continues 2 m forward over the entrance on the legacy canopy collider;
    # its deep front fascia carries the sign, the soffit four warm downlights
    _b("canopy", cx0 - 0.03, cx1 + 0.03, cy0, cy1, cz0 - 0.1, cz1, clad_dark)
    _b("canopy_fascia", cx0 - 0.03, cx1 + 0.03, 4.6, ry1, cz1 - 0.1, cz1 + 0.02, clad_dark, bevel=0.01)
    _b("canopy_flashing", cx0 - 0.05, cx1 + 0.05, ry1, ry1 + 0.04, cz0 - 0.12, cz1 + 0.04, steel)
    for k in range(4):
        lx = 40.5 + k * 3.0
        _K.cylinder(f"canopy_downlight_{k}", 0.09, 0.02, (lx, cy0 - 0.01, cz1 - 0.9), M["warm"], segments=10, tags={"castShadow": False})
    sign(M)
    # gutter along the canopy front, downspouts at both front corners (tight to the wall)
    _bar("gutter", (cx0 + 0.1, cy0 + 0.02, cz1 + 0.08), (cx1 - 0.1, cy0 + 0.02, cz1 + 0.08), 0.12, steel)
    for gx in (mx0 - 0.02, mx1 + 0.02):
        _tube(f"downspout_{gx:.0f}", (gx, cy0, cz1 + 0.08), (gx, cy0 - 0.3, FRONT + 0.19), 0.045, steel)
        _tube(f"downspout_v_{gx:.0f}", (gx, cy0 - 0.3, FRONT + 0.19), (gx, 0.25, FRONT + 0.19), 0.045, steel)
        _b(f"downspout_foot_{gx:.0f}", gx - 0.07, gx + 0.07, 0.0, 0.25, FRONT + 0.12, FRONT + 0.3, steel)
    # roof equipment: condenser on the legacy roof collider, vent stack, conduit, second small unit
    (ax0, ay0, az0), (ax1, ay1, az1) = ROOF_AC
    _b("roof_ac", ax0, ax1, ay0 + 0.05, ay1, az0, az1, M["grey"], bevel=0.02)
    _b("roof_ac_feet", ax0 + 0.05, ax1 - 0.05, ry1, ay0 + 0.05, az0 + 0.05, az1 - 0.05, steel)
    for k in range(5):
        _b(f"roof_ac_fin_{k}", ax0 + 0.05, ax1 - 0.05, ay0 + 0.2 + k * 0.13, ay0 + 0.22 + k * 0.13, az1 - 0.005, az1 + 0.015, M["steel_black"])
    _K.cylinder("roof_ac_fan", 0.34, 0.05, ((ax0 + ax1) / 2, ay1 + 0.01, (az0 + az1) / 2), M["steel_black"], segments=12)
    _tube("roof_conduit", (ax1, ry1 + 0.1, -40.0), (mx1 + 0.05, ry1 + 0.1, -40.0), 0.03, steel)
    _tube("roof_vent", (50.5, ry1, -41.5), (50.5, ry1 + 1.1, -41.5), 0.12, steel)
    _K.cylinder("roof_vent_cap", 0.18, 0.06, (50.5, ry1 + 1.13, -41.5), M["steel_black"], segments=10)
    for obj in list(_K.collections["RENDER_LOD0"].objects):
        if obj.type == "MESH":
            _K.link(obj, "SHOP_EXTERIOR")


def sign(M):
    """HARBOR MARKET: real text geometry (converted to mesh) on a navy backing panel."""
    (cx0, cy0, cz0), (cx1, cy1, cz1) = CANOPY
    zf = cz1 + 0.02                                   # canopy fascia face
    _b("sign_panel", 41.2, 48.8, 4.72, 5.56, zf, zf + 0.06, M["navy"], bevel=0.01)
    _b("sign_panel_frame", 41.15, 48.85, 4.68, 5.6, zf, zf + 0.03, M["trim"])
    _b("sign_backlight", 41.3, 48.7, 4.7, 4.72, zf + 0.03, zf + 0.09, M["sign"], tags={"castShadow": False})
    curve = bpy.data.curves.new("HARBOR_MARKET_TEXT", type="FONT")
    curve.body = "HARBOR MARKET"
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                curve.font = bpy.data.fonts.load(path, check_existing=True)
                break
            except RuntimeError:
                continue
    curve.size = 0.92
    curve.extrude = 0.015
    curve.resolution_u = 3
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.space_character = 1.04
    text = bpy.data.objects.new("sign_text_curve", curve)
    bpy.context.scene.collection.objects.link(text)
    bpy.context.view_layer.update()
    # text lies in Blender XY facing +Z; the fascia faces Three.js +z = Blender -y
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(text.evaluated_get(depsgraph), depsgraph=depsgraph)
    bpy.data.objects.remove(text)
    bpy.data.curves.remove(curve)
    mesh.name = "sign_text"
    obj = bpy.data.objects.new("sign_text", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = (math.pi / 2, 0.0, 0.0)
    obj.location = zk.to_blender((45.0, 5.14, zf + 0.075))
    bpy.context.view_layer.update()
    # fit the word into the panel (7.6 m) if the font runs wide
    width = (max(v.co.x for v in mesh.vertices) - min(v.co.x for v in mesh.vertices))
    if width > 7.0:
        obj.scale = (7.0 / width, 1.0, 1.0)
    _K._finish(obj, M["sign"], "LOD0", {"castShadow": False}, 0.0)
    obj["signText"] = "HARBOR MARKET"
    _stats["signTriangles"] = sum(len(p.vertices) - 2 for p in mesh.polygons)
    _stats["signWidth"] = round(width * (obj.scale[0]), 3)


def east_side(M):
    """Service side: door with lamp, AC condenser + electrical cabinet on the legacy boxes, conduit, crates, hand cart."""
    F = "SHOP_EXTERIOR"
    (mx0, my0, mz0), (mx1, my1, mz1) = MART
    steel, steel_black, grey, trim = M["steel"], M["steel_black"], M["grey"], M["trim"]
    xe = mx1 + 0.12                                   # cladding face
    z0, z1 = SERVICE_DOOR_Z
    _place(_b("service_door_frame", xe - 0.02, xe + 0.04, SLAB, 2.4, z0 - 0.06, z1 + 0.06, steel), F)
    _place(_b("service_door", xe - 0.01, xe + 0.02, SLAB + 0.01, 2.34, z0, z1, trim, bevel=0.01), F)
    _place(_b("service_door_handle", xe + 0.02, xe + 0.07, 1.02, 1.1, z1 - 0.2, z1 - 0.1, steel), F)
    _place(_b("service_door_kick", xe + 0.02, xe + 0.025, SLAB + 0.01, SLAB + 0.3, z0 + 0.02, z1 - 0.02, steel), F)
    _place(_b("service_step", xe, xe + 0.5, GROUND, SLAB, z0 - 0.15, z1 + 0.15, M["concrete"]), F)
    _place(_b("service_lamp_arm", xe, xe + 0.28, 2.85, 2.9, (z0 + z1) / 2 - 0.02, (z0 + z1) / 2 + 0.02, steel_black), F)
    _place(_b("service_lamp", xe + 0.16, xe + 0.34, 2.72, 2.85, (z0 + z1) / 2 - 0.1, (z0 + z1) / 2 + 0.1, steel_black, bevel=0.01), F)
    _place(_K.plane("service_lamp_glow", (0.16, 0.16), (xe + 0.25, 2.715, (z0 + z1) / 2), M["lamp"], normal="y", tags={"castShadow": False}), F)
    # legacy 0.9 x 0.8 x 2.0 boxes: stacked twin condenser on a rack, electrical cabinet
    (ez0, ez1), (cz0, cz1) = EAST_UNITS
    bx0, bx1 = 52.35, 53.25
    _place(_b("cond_rack_base", bx0, bx1, 0.0, 0.1, ez0, ez1, steel_black), F)
    for k, (y0, y1) in enumerate(((0.1, 0.92), (1.06, 1.88))):
        _place(_b(f"cond_{k}", bx0 + 0.02, bx1 - 0.02, y0, y1, ez0 + 0.02, ez1 - 0.02, grey, bevel=0.02), F)
        _place(_K.cylinder(f"cond_{k}_fan", 0.3, 0.03, (bx1 - 0.005, (y0 + y1) / 2, (ez0 + ez1) / 2), steel_black, segments=12, axis="x"), F)
        _place(_K.cylinder(f"cond_{k}_hub", 0.06, 0.05, (bx1 + 0.005, (y0 + y1) / 2, (ez0 + ez1) / 2), grey, segments=8, axis="x"), F)
        for f in range(5):
            _place(_b(f"cond_{k}_fin_{f}", bx0 + 0.02, bx1 - 0.02, y0 + 0.1 + f * 0.14, y0 + 0.12 + f * 0.14, ez0 - 0.005, ez0 + 0.015, steel_black), F)
    _place(_b("cond_rack_frame", bx0, bx1, 0.92, 1.06, ez0, ez1, steel_black), F)
    _place(_b("cond_rack_top", bx0, bx1, 1.88, 2.0, ez0, ez1, steel_black), F)
    _place(_tube("cond_pipe_a", (bx0 - 0.02, 0.6, (ez0 + ez1) / 2), (xe, 0.6, (ez0 + ez1) / 2), 0.02, steel), F)
    _place(_tube("cond_pipe_b", (xe, 0.6, (ez0 + ez1) / 2), (xe, 3.2, (ez0 + ez1) / 2), 0.02, steel), F)
    _place(_b("cabinet", bx0, bx1, 0.0, 2.0, cz0, cz1, grey, bevel=0.02), F)
    _place(_b("cabinet_door", bx1, bx1 + 0.015, 0.3, 1.85, cz0 + 0.08, cz1 - 0.08, trim), F)
    _place(_b("cabinet_handle", bx1 + 0.015, bx1 + 0.045, 1.0, 1.15, cz1 - 0.16, cz1 - 0.13, steel), F)
    for k in range(4):
        _place(_b(f"cabinet_vent_{k}", bx1 + 0.015, bx1 + 0.03, 1.35 + k * 0.1, 1.38 + k * 0.1, cz0 + 0.15, cz1 - 0.15, steel_black), F)
    _place(_b("cabinet_sign", bx1 + 0.015, bx1 + 0.02, 1.55, 1.75, cz0 + 0.25, cz1 - 0.25, M["paint_yellow"], tags={"castShadow": False}), F)
    # conduit up the wall from the cabinet, meter box, wall lamp near the rear corner
    _place(_tube("conduit_e", (xe + 0.02, 2.0, (cz0 + cz1) / 2), (xe + 0.02, 5.3, (cz0 + cz1) / 2), 0.03, steel), F)
    _place(_tube("conduit_e2", (xe + 0.02, 3.2, (cz0 + cz1) / 2), (xe + 0.02, 3.2, (z0 + z1) / 2), 0.025, steel), F)
    _place(_tube("conduit_e3", (xe + 0.02, 3.2, (z0 + z1) / 2), (xe + 0.02, 2.9, (z0 + z1) / 2), 0.025, steel), F)
    _place(_b("meter_box", xe, xe + 0.12, 1.5, 1.95, cz1 + 0.35, cz1 + 0.7, grey, bevel=0.01), F)
    _place(_b("wall_lamp_e", xe, xe + 0.2, 3.5, 3.62, -41.2, -41.0, steel_black, bevel=0.01), F)
    _place(_K.plane("wall_lamp_e_glow", (0.16, 0.16), (xe + 0.1, 3.495, -41.1), M["lamp"], normal="y", tags={"castShadow": False}), F)
    # receiving: crate stack (zone collider, clear of the legacy slab that ends at x 52.5), pallet, hand cart
    crate_x0, crate_x1 = 52.6, 53.7
    for k, (y0, y1, zz0, zz1) in enumerate(((GROUND, GROUND + 0.6, -40.6, -39.5), (GROUND + 0.6, GROUND + 1.1, -40.5, -39.6))):
        _place(_b(f"crate_e_{k}", crate_x0, crate_x1 - 0.1 * k, y0, y1, zz0, zz1, M["timber"], bevel=0.02), F)
        for sx in (crate_x0 + 0.15, crate_x1 - 0.1 * k - 0.15):
            _place(_b(f"crate_e_{k}_strap_{sx:.1f}", sx - 0.03, sx + 0.03, y0, y1, zz0 - 0.01, zz1 + 0.01, steel), F)
    _K.collider("CRATES_E", (crate_x0, 0.0, -40.6), (crate_x1, GROUND + 1.1, -39.5))
    _place(_b("pallet_e", 52.6, 53.7, GROUND, GROUND + 0.12, -39.35, -38.45, M["timber"]), F)
    _place(_b("pallet_e_box_a", 52.7, 53.2, GROUND + 0.12, GROUND + 0.55, -39.25, -38.75, M["cardboard"], bevel=0.005), F)
    _place(_b("pallet_e_box_b", 53.25, 53.65, GROUND + 0.12, GROUND + 0.45, -39.2, -38.55, M["cardboard"], bevel=0.005), F)
    hand_cart(xe + 0.5, -38.15, M)


def hand_cart(x, z, M):
    """Delivery hand truck leaning against the wall (no collider: 0.4 m wide, walk-around prop)."""
    F = "SHOP_EXTERIOR"
    steel, rubber, yellow = M["steel"], M["rubber"], M["paint_yellow"]
    _place(_b("cart_plate", x - 0.25, x + 0.25, GROUND + 0.05, GROUND + 0.08, z - 0.32, z + 0.02, steel), F)
    for sx in (x - 0.2, x + 0.2):
        _place(_bar(f"cart_rail_{sx:.1f}", (sx, GROUND + 0.08, z), (sx - (0.0), GROUND + 1.25, z + 0.28), 0.03, yellow), F)
    _place(_bar("cart_handle", (x - 0.2, GROUND + 1.25, z + 0.28), (x + 0.2, GROUND + 1.25, z + 0.28), 0.03, yellow), F)
    _place(_bar("cart_cross", (x - 0.2, GROUND + 0.6, z + 0.13), (x + 0.2, GROUND + 0.6, z + 0.13), 0.025, yellow), F)
    for sx in (x - 0.24, x + 0.24):
        _place(_K.cylinder(f"cart_wheel_{sx:.1f}", 0.1, 0.05, (sx, GROUND + 0.1, z + 0.08), rubber, segments=10, axis="x"), F)


def west_side(M):
    """Flat service path: painted walkway, drainage channel and two wall lamps above head height."""
    F = "SHOP_EXTERIOR"
    (mx0, my0, mz0), (mx1, my1, mz1) = MART
    xw = mx0 - 0.12                                   # cladding face
    # concrete walkway paint band (flat, 0.19..0.21) with an edge line; drain channel grate along the wall
    _place(_b("walkway_w", 36.2, xw - 0.32, GROUND + 0.006, GROUND + 0.022, -42.5, -32.5, M["concrete_dark"], tags={"castShadow": False}), F)
    _place(_b("walkway_w_line", 36.2, 36.32, GROUND + 0.024, GROUND + 0.03, -42.5, -32.5, M["paint_white"], tags={"castShadow": False}), F)
    import build_container_bd as bd
    for k, gz in enumerate((-41.5, -38.3, -35.1)):
        bd.grate(f"drain_w_{k}", xw - 0.2, gz, 0.22, 1.6, M["grating"], M["concrete_dark"], y=GROUND)
    for obj in list(_K.collections["RENDER_LOD0"].objects):
        if obj.type == "MESH" and obj.name.startswith("drain_w_"):
            _K.link(obj, F)
    for k, lz in enumerate((-40.5, -35.5)):
        _place(_b(f"wall_lamp_w_{k}", xw - 0.18, xw, 3.5, 3.62, lz - 0.1, lz + 0.1, M["steel_black"], bevel=0.01), F)
        _place(_K.plane(f"wall_lamp_w_{k}_glow", (0.14, 0.16), (xw - 0.09, 3.495, lz), M["lamp"], normal="y", tags={"castShadow": False}), F)


# --------------------------------------------------------------------------- #
# LOD1
# --------------------------------------------------------------------------- #

def lod1(M):
    (mx0, my0, mz0), (mx1, my1, mz1) = MART
    (rx0, ry0, rz0), (rx1, ry1, rz1) = ROOF
    (cx0, cy0, cz0), (cx1, cy1, cz1) = CANOPY
    L = dict(lod="LOD1")
    _b("l1_shop_base", mx0 - 0.16, mx1 + 0.16, 0, BASE_TOP, mz0 - 0.16, mz1 + 0.16, M["concrete"], **L)
    _b("l1_shop_body_w", mx0 - 0.12, 39.6, BASE_TOP, my1 - 0.05, mz0 - 0.12, mz1 + 0.12, M["charcoal"], **L)
    _b("l1_shop_body_e", 50.4, mx1 + 0.12, BASE_TOP, my1 - 0.05, mz0 - 0.12, mz1 + 0.12, M["charcoal"], **L)
    _b("l1_shop_body_n", 39.6, 50.4, BASE_TOP, my1 - 0.05, mz0 - 0.12, mz0 + 0.4, M["charcoal"], **L)
    _b("l1_shop_body_top", 39.6, 50.4, CEIL, my1 - 0.05, mz0 - 0.12, mz1 + 0.12, M["charcoal"], **L)
    _b("l1_shop_roof", rx0, rx1, ry0, ry1 + 0.5, rz0, rz1, M["concrete"], **L)
    _b("l1_canopy", mx0, mx1, cy0, cy1, cz0 - 0.1, cz1, M["clad_dark"], **L)
    _b("l1_canopy_fascia", mx0, mx1, 4.6, ry1, cz1 - 0.1, cz1 + 0.02, M["clad_dark"], **L)
    _b("l1_sign", 41.2, 48.8, 4.72, 5.56, cz1 + 0.02, cz1 + 0.08, M["sign"], tags={"castShadow": False}, **L)
    _b("l1_canopy_light", 39.7, 50.3, CEIL + 0.02, CEIL + 0.06, FRONT + 0.38, FRONT + 0.5, M["cyan"], tags={"castShadow": False}, **L)
    _K.plane("l1_shop_glass", (10.8, CEIL - BASE_TOP), (45.0, (CEIL + BASE_TOP) / 2, FRONT + 0.02), M["glass_clear"], normal="z", **L)
    # interior readability: floor, ceiling glow, gondolas as blocks with row cards, fridges, checkout, produce
    _b("l1_floor", IN_X[0], IN_X[1], SLAB - 0.02, SLAB, IN_Z[0], IN_Z[1], M["floor"], **L)
    _b("l1_ceiling", IN_X[0], IN_X[1], CEIL, CEIL + 0.05, IN_Z[0], IN_Z[1], M["ceiling"], **L)
    _b("l1_ceiling_glow", 40.0, 50.0, CEIL - 0.01, CEIL, -41.8, -34.0, M["led"], tags={"castShadow": False}, **L)
    for k, (x0, z0, x1, z1) in enumerate(GONDOLAS):
        _b(f"l1_gondola_{k}", x0, x1, SLAB, SLAB + 1.6, z0, z1, M["trim"], **L)
        for side, (a0, a1, facing) in enumerate(((x0 - 0.001, x0 + 0.02, "-x"), (x1 - 0.02, x1 + 0.001, "+x"))):
            obj = row_card(f"l1_gondola_{k}_rows_{side}", ((a0 + a1) / 2, SLAB + 0.95, (z0 + z1) / 2), (a1 - a0, 1.1, z1 - z0 - 1.0), CELL["row_cans"], _tints[0], facing=facing)
            obj["zoneLod"] = "LOD1"; _K.link(obj, "RENDER_LOD1")
    for k, (x0, z0, x1, z1) in enumerate((FRIDGE_REAR, FRIDGE_RIGHT)):
        _b(f"l1_fridge_{k}", x0, x1, SLAB, SLAB + 2.15, z0, z1, M["white"], **L)
        facing = "+z" if k == 0 else "-x"
        if facing == "+z":
            obj = row_card(f"l1_fridge_{k}_rows", ((x0 + x1) / 2, SLAB + 1.2, z1 + 0.005), (x1 - x0 - 0.2, 1.5, 0.01), CELL["row_bottles"], _tints[0], facing=facing)
        else:
            obj = row_card(f"l1_fridge_{k}_rows", (x0 - 0.005, SLAB + 1.2, (z0 + z1) / 2), (0.01, 1.5, z1 - z0 - 0.2), CELL["row_bottles"], _tints[0], facing=facing)
        obj["zoneLod"] = "LOD1"; _K.link(obj, "RENDER_LOD1")
    cx0, cz0, cx1, cz1 = CHECKOUT
    _b("l1_checkout", cx0, cx1, SLAB, SLAB + 0.9, cz0, cz1, M["navy"], **L)
    px0, pz0, px1, pz1 = PRODUCE
    _b("l1_produce", px0, px1, SLAB, SLAB + 0.85, pz0, pz1, M["timber"], **L)
    (r0x, r0z), (r1x, r1z) = ROOMS
    _b("l1_rooms", r0x, r1x, SLAB, my1 - 0.05, r0z, r1z, M["wall_cream"], **L)


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #

def build(K: zk.ZoneKit, M: dict) -> dict:
    global _K
    _K = K
    _M.clear(); _M.update(M)
    _stats.update({"products": 0, "rowCards": 0})
    for name in ("SHOP_EXTERIOR", "SHOP_INTERIOR", "SHOP_FIXTURES", "PRODUCT_INSTANCES"):
        K.subcollection("RENDER_LOD0", name)
    product_atlas()
    atlas = K.pbr("MAT_PRODUCT_ATLAS", "product_atlas", vertex_tint=True)
    M["atlas"] = atlas
    _tints.clear()
    for k, rgb in enumerate(((1.0, 1.0, 1.0), (0.9, 0.9, 0.9), (0.96, 0.94, 0.9), (0.86, 0.88, 0.9), (0.93, 0.9, 0.86))):
        _tints.append(zk.TintedMaterial(atlas, rgb, f"product_{k}"))
    shell(M)
    storefront(M)
    east_side(M)
    west_side(M)
    interior_shell(M)
    rooms(M)
    produce_display(M)
    for k, (x0, z0, x1, z1) in enumerate(GONDOLAS):
        gondola(f"gondola_{k}", x0, z0, x1, z1, M)
    fx0, fz0, fx1, fz1 = FRIDGE_REAR
    units = 4
    pitch = (fx1 - fx0) / units
    for k in range(units):
        fridge_unit(f"fridge_r{k}", fx0 + k * pitch, fz0, fx0 + (k + 1) * pitch, fz1, SLAB + 1.9, "+z", M)
    fx0, fz0, fx1, fz1 = FRIDGE_RIGHT
    pitch = (fz1 - fz0) / 2
    for k in range(2):
        fridge_unit(f"fridge_e{k}", fx0, fz0 + k * pitch, fx1, fz0 + (k + 1) * pitch, SLAB + 1.9, "-x", M)
    checkout(M)
    lod1(M)
    # shop-only stats before batching: triangles + distinct materials per LOD
    tris = {"LOD0": 0, "LOD1": 0}
    mats = {"LOD0": set(), "LOD1": set()}
    for coll in ("SHOP_EXTERIOR", "SHOP_INTERIOR", "SHOP_FIXTURES", "PRODUCT_INSTANCES"):
        for obj in K.collections[coll].all_objects:
            if obj.type != "MESH":
                continue
            obj.data.calc_loop_triangles()
            tris["LOD0"] += len(obj.data.loop_triangles)
            if obj.material_slots and obj.material_slots[0].material:
                mats["LOD0"].add(obj.material_slots[0].material.name)
    for obj in K.collections["RENDER_LOD1"].objects:
        if obj.type == "MESH" and (obj.name.startswith("l1_shop") or obj.name.startswith("l1_gondola") or obj.name.startswith("l1_fridge")
                                    or obj.name in ("l1_canopy", "l1_canopy_fascia", "l1_sign", "l1_canopy_light", "l1_floor", "l1_ceiling",
                                                    "l1_ceiling_glow", "l1_checkout", "l1_produce", "l1_rooms")):
            obj.data.calc_loop_triangles()
            tris["LOD1"] += len(obj.data.loop_triangles)
            if obj.material_slots and obj.material_slots[0].material:
                mats["LOD1"].add(obj.material_slots[0].material.name)
    return {
        "lod0Triangles": tris["LOD0"], "lod1Triangles": tris["LOD1"],
        "lod0Materials": len(mats["LOD0"]), "lod1Materials": len(mats["LOD1"]),
        "materials": sorted(mats["LOD0"]),
        **_stats,
    }
