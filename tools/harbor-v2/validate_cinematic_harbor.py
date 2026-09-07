"""Validate the generated Harbor cinematic environment GLB."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
GLB_PATH = ROOT / "client/public/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb"
METRICS_PATH = ROOT / "docs/v2/harbor/harbor-cinematic-metrics.json"
REQUIRED_ZONES = {
    "base",
    "container-yard",
    "construction",
    "residential",
    "hunter-spawn",
    "dock",
    "dock-detail",
    "boats",
    "garden-detail",
    "construction-detail",
    "restored-landmarks",
    "ferris-static",
    "shared-props",
}


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def mesh_metrics(suffix: str) -> dict[str, int]:
    triangles = 0
    meshes = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.name.endswith(suffix):
            continue
        meshes += 1
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    return {"triangles": triangles, "renderMeshes": meshes, "drawCalls": meshes}


def main() -> None:
    errors: list[str] = []
    if not GLB_PATH.exists():
        raise FileNotFoundError(f"Missing generated asset: {GLB_PATH}")

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(GLB_PATH))

    lod0 = mesh_metrics("_LOD0")
    lod1 = mesh_metrics("_LOD1")
    payload = os.path.getsize(GLB_PATH)
    object_names = {obj.name for obj in bpy.context.scene.objects}
    material_names = {material.name.lower() for material in bpy.data.materials}

    for zone in REQUIRED_ZONES:
        normalized = zone.replace("-", "_")
        if not any(
            obj.get("harborZone") == zone
            or zone in obj.name.lower()
            or normalized in obj.name.lower()
            for obj in bpy.context.scene.objects
        ):
            errors.append(f"missing render zone: {zone}")

    textured_materials = 0
    for material in bpy.data.materials:
        if not material.use_nodes or not material.node_tree:
            continue
        if any(node.type == "TEX_IMAGE" for node in material.node_tree.nodes):
            textured_materials += 1

    if payload > 24 * 1024 * 1024:
        errors.append(f"unoptimized source exceeds 24 MB authoring cap: {payload}")
    if lod0["triangles"] > 400_000:
        errors.append(f"LOD0 exceeds 400k triangle cap: {lod0['triangles']}")
    if lod1["triangles"] > 180_000:
        errors.append(f"LOD1 exceeds 180k triangle cap: {lod1['triangles']}")
    if lod0["drawCalls"] > 250:
        errors.append(f"LOD0 exceeds 250 draw-call cap: {lod0['drawCalls']}")
    if lod1["drawCalls"] > 120:
        errors.append(f"LOD1 exceeds 120 draw-call cap: {lod1['drawCalls']}")
    if lod0["renderMeshes"] == 0 or lod1["renderMeshes"] == 0:
        errors.append("both LOD0 and LOD1 render sets are required")
    if textured_materials < 12:
        errors.append(
            f"expected at least 12 textured PBR materials, found {textured_materials}"
        )
    if not any("glass_warm" in name for name in material_names):
        errors.append("missing warm emissive glass material")

    metrics = {
        "asset": str(GLB_PATH.relative_to(ROOT)),
        "payloadBytes": payload,
        "lod0": lod0,
        "lod1": lod1,
        "texturedMaterials": textured_materials,
        "requiredZones": sorted(REQUIRED_ZONES),
        "passed": not errors,
        "errors": errors,
    }
    METRICS_PATH.parent.mkdir(parents=True, exist_ok=True)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    if errors:
        print("Harbor cinematic validation failed:")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)

    print("Harbor cinematic validation passed")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
