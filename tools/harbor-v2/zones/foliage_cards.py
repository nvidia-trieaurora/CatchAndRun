"""Procedural alpha-card foliage textures (leaf clusters, grass tufts, reeds).

Generated with numpy inside Blender so the zone kits have CC0-clean, repo-owned
cutout textures. They are intentionally soft and stylized; a photo/AI-painted
replacement can be dropped into ``<pack>/_derived`` under the same file names.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
TEXTURES = ROOT / "tools/harbor-v2/textures"


def _save(pixels: np.ndarray, path: Path, colorspace: str) -> None:
    h, w, _ = pixels.shape
    img = bpy.data.images.new(path.stem + "_tmp", width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels = np.clip(pixels, 0, 1).ravel().tolist()
    img.filepath_raw = str(path)
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def _hsv(h: float, s: float, v: float) -> tuple[float, float, float]:
    i = int(h * 6) % 6
    f = h * 6 - math.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    return [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i]


def _ellipse_mask(size: int, cx: float, cy: float, rx: float, ry: float, angle: float, soft: float = 1.5):
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    dx, dy = xs - cx, ys - cy
    ca, sa = math.cos(angle), math.sin(angle)
    u = (dx * ca + dy * sa) / rx
    v = (-dx * sa + dy * ca) / ry
    d = np.sqrt(u * u + v * v)
    mask = np.clip((1.0 - d) * (rx / soft), 0, 1)
    return mask, u, v


def leaf_atlas(pack: str, name: str = "leaf_cluster", size: int = 512,
               variants=((7, (0.22, 0.34)), (13, (0.18, 0.28)))) -> dict:
    """Horizontal atlas of leaf clusters (one material, several looks)."""
    tiles = [leaf_cluster_pixels(size, seed, hue) for seed, hue in variants]
    base = np.concatenate([t[0] for t in tiles], axis=1)
    normal = np.concatenate([t[1] for t in tiles], axis=1)
    orm = np.concatenate([t[2] for t in tiles], axis=1)
    spec = _write(pack, name, base, normal, orm, tile=1.0)
    spec["atlasColumns"] = len(variants)
    return spec


def leaf_cluster(pack: str, name: str = "leaf_cluster", size: int = 512, seed: int = 7,
                 hue: tuple[float, float] = (0.22, 0.34), leaves: int = 70) -> dict:
    base, normal, orm = leaf_cluster_pixels(size, seed, hue, leaves)
    return _write(pack, name, base, normal, orm, tile=1.0)


def leaf_cluster_pixels(size: int, seed: int, hue: tuple[float, float], leaves: int = 70):
    rng = random.Random(seed)
    rgb = np.zeros((size, size, 3), np.float32)
    alpha = np.zeros((size, size), np.float32)
    nrm = np.zeros((size, size, 3), np.float32)
    nrm[..., 2] = 1.0
    ao = np.ones((size, size), np.float32)
    center = size / 2
    for i in range(leaves):
        # leaves crowd toward the card center, longer ones at the rim
        r = rng.random() ** 0.6 * size * 0.42
        a = rng.random() * math.tau
        cx, cy = center + math.cos(a) * r, center + math.sin(a) * r
        length = rng.uniform(34, 78)
        width = length * rng.uniform(0.38, 0.55)
        angle = a + rng.uniform(-0.6, 0.6) + math.pi / 2
        mask, u, v = _ellipse_mask(size, cx, cy, length, width, angle, soft=2.0)
        if mask.max() <= 0:
            continue
        h = rng.uniform(*hue)
        sat = rng.uniform(0.42, 0.62)
        val = rng.uniform(0.30, 0.60)
        col = np.array(_hsv(h, sat, val), np.float32)
        tip = np.array(_hsv(h + 0.02, sat * 0.85, min(val + 0.22, 0.95)), np.float32)
        grad = np.clip((u + 1) / 2, 0, 1)[..., None]
        leaf_rgb = col * (1 - grad) + tip * grad
        midrib = np.exp(-(v * width / 1.6) ** 2)[..., None] * 0.22
        leaf_rgb = leaf_rgb * (1 - midrib) + leaf_rgb * 0.55 * midrib
        m = mask[..., None]
        rgb = rgb * (1 - m) + leaf_rgb * m
        alpha = np.maximum(alpha, mask)
        # slight per-leaf normal tilt so clusters do not shade flat
        tilt = np.array([rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), 1.0], np.float32)
        tilt /= np.linalg.norm(tilt)
        nrm = nrm * (1 - m) + tilt * m
        ao = ao * (1 - mask) + (0.72 + 0.28 * grad[..., 0]) * mask
    # fill transparent area with an average green to avoid dark fringes when filtered
    fill = rgb[alpha > 0.5].mean(axis=0) if (alpha > 0.5).any() else np.array([0.2, 0.35, 0.15])
    a3 = alpha[..., None]
    rgb = rgb * a3 + fill * (1 - a3)
    base = np.concatenate([rgb, alpha[..., None]], axis=-1)
    normal = np.concatenate([nrm * 0.5 + 0.5, np.ones((size, size, 1), np.float32)], axis=-1)
    orm = np.stack([ao, np.full((size, size), 0.68, np.float32), np.zeros((size, size), np.float32), np.ones((size, size), np.float32)], axis=-1)
    return base, normal, orm


def blade_card(pack: str, name: str = "grass_tuft", size: int = 512, seed: int = 11,
               blades: int = 46, hue: tuple[float, float] = (0.20, 0.30), tip_brown: float = 0.0,
               max_height: float = 0.95, width_px: float = 9.0) -> dict:
    rng = random.Random(seed)
    rgb = np.zeros((size, size, 3), np.float32)
    alpha = np.zeros((size, size), np.float32)
    ao = np.ones((size, size), np.float32)
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    for _ in range(blades):
        x0 = size / 2 + rng.uniform(-size * 0.28, size * 0.28)
        height = size * rng.uniform(0.45, max_height)
        lean = rng.uniform(-0.55, 0.55)
        curve = rng.uniform(-0.35, 0.35)
        col = np.array(_hsv(rng.uniform(*hue), rng.uniform(0.45, 0.65), rng.uniform(0.32, 0.62)), np.float32)
        t = np.clip(ys / height, 0, 1)             # 0 at bottom row 0? image row 0 is bottom in Blender
        cx = x0 + lean * ys + curve * (ys ** 2) / height
        w = width_px * (1 - t) + 1.0
        dist = np.abs(xs - cx)
        mask = np.clip((w - dist) / 1.2, 0, 1) * (ys < height)
        if tip_brown > 0:
            brown = np.array([0.42, 0.30, 0.16], np.float32)
            k = np.clip((t - (1 - tip_brown)) / max(tip_brown, 1e-3), 0, 1)[..., None]
            blade_rgb = col * (1 - k) + brown * k
        else:
            blade_rgb = col * (0.75 + 0.25 * t)[..., None]
        m = mask[..., None]
        rgb = rgb * (1 - m) + blade_rgb * m
        alpha = np.maximum(alpha, mask)
        ao = ao * (1 - mask) + (0.6 + 0.4 * t) * mask
    fill = rgb[alpha > 0.5].mean(axis=0) if (alpha > 0.5).any() else np.array([0.25, 0.35, 0.12])
    a3 = alpha[..., None]
    rgb = rgb * a3 + fill * (1 - a3)
    base = np.concatenate([rgb, alpha[..., None]], axis=-1)
    normal = np.zeros((size, size, 4), np.float32); normal[..., 0] = 0.5; normal[..., 1] = 0.5; normal[..., 2] = 1.0; normal[..., 3] = 1.0
    orm = np.stack([ao, np.full((size, size), 0.72, np.float32), np.zeros((size, size), np.float32), np.ones((size, size), np.float32)], axis=-1)
    return _write(pack, name, base, normal, orm, tile=1.0)


def grating_tile(pack: str, name: str = "grating", size: int = 256, bars: int = 8, bar_px: int = 6,
                 rough: float = 0.55, metal: float = 0.85) -> dict:
    """Alpha-cutout steel grating tile (bars along both axes, open cells)."""
    ys, xs = np.mgrid[0:size, 0:size]
    pitch = size // bars
    bar_x = (xs % pitch) < bar_px
    bar_y = (ys % pitch) < bar_px
    mask = (bar_x | bar_y).astype(np.float32)
    shade = 0.32 + 0.08 * np.sin(xs * 0.15) * np.cos(ys * 0.11)
    rgb = np.stack([shade * 0.92, shade * 0.95, shade], axis=-1).astype(np.float32)
    base = np.concatenate([rgb, mask[..., None]], axis=-1)
    normal = np.zeros((size, size, 4), np.float32); normal[..., 0] = 0.5; normal[..., 1] = 0.5; normal[..., 2] = 1.0; normal[..., 3] = 1.0
    orm = np.stack([np.ones((size, size), np.float32), np.full((size, size), rough, np.float32),
                    np.full((size, size), metal, np.float32), np.ones((size, size), np.float32)], axis=-1)
    return _write(pack, name, base, normal, orm, tile=0.5)


def _write(pack: str, name: str, base, normal, orm, tile: float) -> dict:
    derived = TEXTURES / pack / "_derived"
    derived.mkdir(parents=True, exist_ok=True)
    _save(base, derived / f"{name}_base.png", "sRGB")
    # data maps of cutout cards carry little detail: ship them at quarter size
    _save(normal[::4, ::4], derived / f"{name}_normal.png", "Non-Color")
    _save(orm[::4, ::4], derived / f"{name}_orm.png", "Non-Color")
    spec = {"source": "procedural (foliage_cards.py)", "base": f"{name}_base.png",
            "normal": f"{name}_normal.png", "orm": f"{name}_orm.png", "tile": tile, "size": base.shape[0]}
    spec_path = derived / "spec.json"
    current = json.loads(spec_path.read_text()) if spec_path.exists() else {}
    current[name] = spec
    spec_path.write_text(json.dumps(current, indent=2))
    return spec
