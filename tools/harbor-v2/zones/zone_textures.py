"""Poly Haven CC0 texture acquisition + game-ready derivation for zone kits.

Runs inside Blender (needs ``bpy``/``numpy``). Sources are downloaded once at
1K (Diffuse / nor_gl / arm) into ``tools/harbor-v2/textures/<pack>/<asset>/`` and
derived into ``<pack>/_derived/`` as PNG Base Color (sRGB), OpenGL Normal and
ORM (AO / roughness / metalness) at 512 px (1024 px for hero surfaces), with
roughness remapped into the art-bible band for the material.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[3]
TEXTURES = ROOT / "tools/harbor-v2/textures"
POLYHAVEN_HEADERS = {"User-Agent": "catchandrun-harbor-v2"}
MAP_FILES = {"Diffuse": "diffuse", "nor_gl": "normal", "arm": "arm"}


def download_polyhaven_set(pack: str, asset_id: str, resolution: str = "1k") -> Path:
    """Fetch Diffuse/nor_gl/arm JPGs for one Poly Haven texture asset."""
    import requests  # bundled with the Blender MCP add-on environment

    target = TEXTURES / pack / asset_id
    target.mkdir(parents=True, exist_ok=True)
    files = None
    for name, filename in MAP_FILES.items():
        out = target / f"{filename}.jpg"
        if out.exists() and out.stat().st_size > 1000:
            continue
        if files is None:
            files = requests.get(
                f"https://api.polyhaven.com/files/{asset_id}",
                headers=POLYHAVEN_HEADERS, timeout=30,
            ).json()
        if name not in files:
            raise RuntimeError(f"{asset_id} has no {name} map")
        url = files[name][resolution]["jpg"]["url"]
        for attempt in range(3):
            try:
                response = requests.get(url, headers=POLYHAVEN_HEADERS, timeout=180)
                if response.status_code == 200:
                    out.write_bytes(response.content)
                    break
            except Exception:  # noqa: BLE001 - retry transient network errors
                time.sleep(2 * (attempt + 1))
        else:
            raise RuntimeError(f"download failed: {url}")
    return target


def _load_pixels(path: Path, colorspace: str, size: int) -> np.ndarray:
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = colorspace
    if image.size[0] != size:
        image.scale(size, size)
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    bpy.data.images.remove(image)
    return pixels


def _save_png(pixels: np.ndarray, path: Path, colorspace: str) -> None:
    height, width, _ = pixels.shape
    image = bpy.data.images.new(path.stem + "_tmp", width=width, height=height, alpha=True)
    image.colorspace_settings.name = colorspace
    image.pixels = np.clip(pixels, 0.0, 1.0).ravel().tolist()
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def luminance(pixels: np.ndarray) -> np.ndarray:
    return (0.2126 * pixels[..., 0] + 0.7152 * pixels[..., 1] + 0.0722 * pixels[..., 2])[..., None]


def derive_material_set(
    pack: str,
    asset_id: str,
    name: str,
    *,
    tile_m: float,
    rough: tuple[float, float],
    metal: float | tuple[float, float] = 0.0,
    size: int = 512,
    tint: tuple[float, float, float] | None = None,
    desaturate: float = 0.0,
    brightness: float = 1.0,
    alpha_from_luminance: bool = False,
    flatten: float = 0.0,
    normal_flatten: float = 0.0,
    normal_size: int | None = None,
    orm_size: int | None = None,
    source_pack: str | None = None,
) -> dict:
    """Write <name>_base/normal/orm.png into <pack>/_derived and return the spec.

    ``flatten`` mixes the base color toward its mean (calms strong stains);
    ``normal_flatten`` mixes the normal map toward flat (0.5, 0.5, 1).
    ``source_pack`` reads the Poly Haven source from another pack's folder so a
    1K download is shared instead of copied.
    """
    source = TEXTURES / (source_pack or pack) / asset_id
    derived = TEXTURES / pack / "_derived"
    derived.mkdir(parents=True, exist_ok=True)

    base = _load_pixels(source / "diffuse.jpg", "sRGB", size)
    rgb = base[..., :3]
    if flatten > 0:
        mean = rgb.reshape(-1, 3).mean(axis=0)
        rgb = rgb * (1.0 - flatten) + mean * flatten
    if desaturate > 0:
        lum = np.repeat(luminance(base), 3, axis=-1)
        rgb = rgb * (1.0 - desaturate) + lum * desaturate
    rgb = rgb * brightness
    if tint is not None:
        rgb = rgb * np.array(tint, dtype=np.float32)
    base[..., :3] = rgb
    if alpha_from_luminance:
        base[..., 3] = np.clip(luminance(base)[..., 0] * 2.0, 0.0, 1.0)
    _save_png(base, derived / f"{name}_base.png", "sRGB")

    normal = _load_pixels(source / "normal.jpg", "Non-Color", normal_size or size)
    if normal_flatten > 0:
        flat = np.array([0.5, 0.5, 1.0], dtype=np.float32)
        normal[..., :3] = normal[..., :3] * (1.0 - normal_flatten) + flat * normal_flatten
    _save_png(normal, derived / f"{name}_normal.png", "Non-Color")

    arm = _load_pixels(source / "arm.jpg", "Non-Color", orm_size or size)
    orm = np.zeros_like(arm)
    orm[..., 3] = 1.0
    orm[..., 0] = arm[..., 0]
    orm[..., 1] = rough[0] + (rough[1] - rough[0]) * arm[..., 1]
    if isinstance(metal, tuple):
        orm[..., 2] = metal[0] + (metal[1] - metal[0]) * arm[..., 2]
    else:
        orm[..., 2] = metal
    _save_png(orm, derived / f"{name}_orm.png", "Non-Color")

    spec = {
        "source": asset_id,
        "base": f"{name}_base.png",
        "normal": f"{name}_normal.png",
        "orm": f"{name}_orm.png",
        "tile": tile_m,
        "size": size,
    }
    spec_path = derived / "spec.json"
    current = json.loads(spec_path.read_text()) if spec_path.exists() else {}
    current[name] = spec
    spec_path.write_text(json.dumps(current, indent=2))
    return spec
