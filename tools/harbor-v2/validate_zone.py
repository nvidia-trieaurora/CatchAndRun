"""Validate an edge-zone candidate GLB against the zone contract and budgets.

    blender --background --python-exit-code 1 --python tools/harbor-v2/validate_zone.py -- \
        --glb art-source/harbor-v2/_staging/garden-ac-candidate.glb --zone GARDEN \
        --metrics art-source/harbor-v2/_staging/garden-ac-candidate.metrics.json

Checks
  * naming: MESH_<ZONE>_*_LOD0|LOD1 render meshes plus optional COL_MOVE_<ZONE>_* prop
    colliders, harborZone extra on every node, no other COL_/MARKER_ nodes
  * budgets: LOD0 triangles / draw calls, LOD1 triangles / draw calls, payload, texture
    size, shipped collider count
  * geometry and shipped colliders stay inside the zone footprint and outside the
    declared clearance volumes; shipped colliders never overlap a procedural gameplay
    collider (they only protect props the zone introduces)
  * collider parity: the procedural collider dump is untouched (zone passes add nothing there)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
STAGING_ROOT = (ROOT / "art-source/harbor-v2/_staging").resolve()
CONTRACTS = ROOT / "tools/harbor-v2/zones/contracts"


def blender_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--zone", required=True, help="Zone id, e.g. GARDEN or CONSTRUCTION")
    parser.add_argument("--metrics", type=Path, required=True)
    return parser.parse_args(blender_args())


def blender_to_three(v: Vector) -> tuple[float, float, float]:
    return (float(v.x), float(v.z), float(-v.y))


def measure(meshes) -> dict:
    """Triangles + draw calls the client will issue: meshes sharing an ``instanceKey``
    collapse into one InstancedMesh (MapAssetLoader.collapseRepeatedMeshes)."""
    tris = 0
    draws = 0
    instance_keys: set[str] = set()
    instanced = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        tris += len(obj.data.loop_triangles)
        key = obj.get("instanceKey")
        if isinstance(key, str) and key:
            instance_keys.add(key)
            instanced += 1
            continue
        draws += max(1, len(obj.material_slots))
    return {"renderMeshes": len(meshes), "triangles": tris, "estimatedDrawCalls": draws + len(instance_keys),
            "instancedMeshes": instanced, "instanceKeys": len(instance_keys)}


def glb_images(path: Path) -> list[dict]:
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20:20 + length])
    views = js.get("bufferViews", [])
    out = []
    for image in js.get("images", []):
        out.append({"name": image.get("name"), "mimeType": image.get("mimeType"),
                    "bytes": views[image["bufferView"]]["byteLength"] if "bufferView" in image else 0})
    return out


def main() -> None:
    args = parse_args()
    glb = (args.glb if args.glb.is_absolute() else ROOT / args.glb).resolve()
    metrics_path = (args.metrics if args.metrics.is_absolute() else ROOT / args.metrics).resolve()
    if not glb.is_relative_to(STAGING_ROOT) or not metrics_path.is_relative_to(STAGING_ROOT):
        raise PermissionError("zone validation only accepts staging inputs/outputs")
    contract = json.loads((CONTRACTS / f"{args.zone.lower()}.json").read_text())

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    objects = list(bpy.context.scene.objects)
    errors: list[str] = []
    warnings: list[str] = []

    prefix = f"MESH_{args.zone}_"
    collider_prefixes = (f"COL_MOVE_{args.zone}_", f"COL_LADDER_{args.zone}_")
    collider_objects = [o for o in objects if o.name.startswith(collider_prefixes)]
    meshes = [o for o in objects if o.type == "MESH" and not o.name.startswith(collider_prefixes)]
    rig_prefixes = (f"RIG_{args.zone}_", f"SOCKET_{args.zone}_")
    rig_nodes: list[dict] = []
    for obj in objects:
        if obj.name.startswith(collider_prefixes):
            if obj.type != "MESH":
                errors.append(f"{obj.name} collider must be a mesh box")
            if obj.get("harborZone") != contract["harborZone"]:
                errors.append(f"{obj.name} harborZone={obj.get('harborZone')!r}, expected {contract['harborZone']!r}")
            if obj.name.startswith("COL_LADDER_") and obj.get("ladderApproach") not in ("+x", "-x", "+z", "-z"):
                errors.append(f"{obj.name} needs a ladderApproach extra")
            continue
        if obj.name.startswith(rig_prefixes):
            if obj.type != "EMPTY":
                errors.append(f"{obj.name} rig/socket nodes must be empties")
            if obj.get("harborZone") != contract["harborZone"]:
                errors.append(f"{obj.name} harborZone={obj.get('harborZone')!r}, expected {contract['harborZone']!r}")
            pos = blender_to_three(obj.matrix_world.translation)
            rig_nodes.append({"name": obj.name, "position": [round(v, 4) for v in pos],
                              "parent": obj.parent.name if obj.parent else None,
                              "extras": {k: obj[k] for k in obj.keys() if k not in ("harborZone", "harbor_v2_role")}})
            continue
        if obj.name.startswith(("COL_", "MARKER_", "SOCKET_", "REF_", "RIG_")):
            errors.append(f"zone pass leaked gameplay/reference node: {obj.name}")
        if obj.type == "MESH":
            if not obj.name.startswith(prefix):
                errors.append(f"{obj.name} not namespaced {prefix}*")
            if not obj.name.endswith(("_LOD0", "_LOD1")):
                errors.append(f"{obj.name} missing LOD suffix")
            if obj.get("harborZone") != contract["harborZone"]:
                errors.append(f"{obj.name} harborZone={obj.get('harborZone')!r}, expected {contract['harborZone']!r}")
            if len(obj.material_slots) != 1:
                errors.append(f"{obj.name} must have exactly one material (batched), has {len(obj.material_slots)}")

    lod0 = [o for o in meshes if o.name.endswith("_LOD0")]
    lod1 = [o for o in meshes if o.name.endswith("_LOD1")]
    m0, m1 = measure(lod0), measure(lod1)
    budgets = contract["budgets"]
    if m0["triangles"] > budgets["lod0Triangles"]:
        errors.append(f"LOD0 triangles {m0['triangles']} > {budgets['lod0Triangles']}")
    if m0["estimatedDrawCalls"] > budgets["lod0DrawCalls"]:
        errors.append(f"LOD0 draw calls {m0['estimatedDrawCalls']} > {budgets['lod0DrawCalls']}")
    if m1["triangles"] > budgets["lod1Triangles"]:
        errors.append(f"LOD1 triangles {m1['triangles']} > {budgets['lod1Triangles']}")
    if m1["estimatedDrawCalls"] > budgets["lod1DrawCalls"]:
        errors.append(f"LOD1 draw calls {m1['estimatedDrawCalls']} > {budgets['lod1DrawCalls']}")
    payload = glb.stat().st_size
    if payload > budgets["payloadBytes"]:
        errors.append(f"payload {payload} > {budgets['payloadBytes']}")
    images = glb_images(glb)
    texture_bytes = sum(i["bytes"] for i in images)
    gpu_estimate = 0
    for image in bpy.data.images:
        if image.size[0] > budgets["maxTextureSize"] or image.size[1] > budgets["maxTextureSize"]:
            errors.append(f"texture {image.name} {image.size[0]}x{image.size[1]} exceeds {budgets['maxTextureSize']}")
        gpu_estimate += int(image.size[0] * image.size[1] * 4 * 1.34)
    if gpu_estimate > budgets["gpuTextureBytes"]:
        errors.append(f"estimated GPU texture memory {gpu_estimate} > {budgets['gpuTextureBytes']}")

    # footprint + clearance volumes (Three.js coordinates)
    (fx0, fy0, fz0), (fx1, fy1, fz1) = contract["footprint"]["min"], contract["footprint"]["max"]
    clearance_hits: dict[str, int] = {}
    for obj in meshes:
        mw = obj.matrix_world
        for vertex in obj.data.vertices:
            x, y, z = blender_to_three(mw @ vertex.co)
            if not (fx0 - 0.01 <= x <= fx1 + 0.01 and fy0 - 0.01 <= y <= fy1 + 0.01 and fz0 - 0.01 <= z <= fz1 + 0.01):
                errors.append(f"{obj.name} leaves the zone footprint at ({x:.2f}, {y:.2f}, {z:.2f})")
                break
        for volume in contract.get("clearance", []):
            if any(token in obj.name for token in volume.get("ignoreNameTokens", [])):
                continue
            (cx0, cy0, cz0), (cx1, cy1, cz1) = volume["min"], volume["max"]
            hits = 0
            for vertex in obj.data.vertices:
                x, y, z = blender_to_three(mw @ vertex.co)
                if cx0 < x < cx1 and cy0 < y < cy1 and cz0 < z < cz1:
                    hits += 1
            if hits:
                clearance_hits[f"{volume['name']}:{obj.name}"] = hits
    for key, hits in clearance_hits.items():
        errors.append(f"clearance volume violated {key} ({hits} vertices)")

    # collider parity — the zone pass must leave the procedural dump untouched
    dump = ROOT / "art-source/harbor-v2/_staging/procedural-colliders.json"
    parity = None
    procedural: list[tuple[tuple[float, float, float], tuple[float, float, float]]] = []
    if dump.exists():
        data = json.loads(dump.read_text())
        parity = {"colliders": data["count"], "source": data["generatedFrom"]}
        if data["count"] != contract["expectedProceduralColliders"]:
            errors.append(f"procedural collider count {data['count']} != {contract['expectedProceduralColliders']}")
        for item in data["colliders"]:
            lo, hi = item["min"], item["max"]
            procedural.append(((lo["x"], lo["y"], lo["z"]), (hi["x"], hi["y"], hi["z"])))
    else:
        warnings.append("procedural collider dump missing; run dump_procedural_colliders.ts")

    # shipped prop colliders — world AABBs exactly as MapAssetLoader derives them
    zone_colliders: list[dict] = []
    for obj in collider_objects:
        if obj.type != "MESH":
            continue
        mw = obj.matrix_world
        points = [blender_to_three(mw @ vertex.co) for vertex in obj.data.vertices]
        lo = tuple(min(p[i] for p in points) for i in range(3))
        hi = tuple(max(p[i] for p in points) for i in range(3))
        record = {"name": obj.name, "min": [round(v, 4) for v in lo], "max": [round(v, 4) for v in hi]}
        if obj.get("ladderApproach"):
            record["ladderApproach"] = obj["ladderApproach"]
        zone_colliders.append(record)
        if not (fx0 - 0.01 <= lo[0] and hi[0] <= fx1 + 0.01 and fy0 - 0.01 <= lo[1] and hi[1] <= fy1 + 0.01
                and fz0 - 0.01 <= lo[2] and hi[2] <= fz1 + 0.01):
            errors.append(f"{obj.name} collider leaves the zone footprint")
        for volume in contract.get("clearance", []):
            (cx0, cy0, cz0), (cx1, cy1, cz1) = volume["min"], volume["max"]
            if lo[0] < cx1 and hi[0] > cx0 and lo[1] < cy1 and hi[1] > cy0 and lo[2] < cz1 and hi[2] > cz0:
                errors.append(f"{obj.name} collider intrudes clearance volume {volume['name']}")
        for plo, phi in procedural:
            overlap = 1.0
            for axis in range(3):
                overlap *= max(0.0, min(hi[axis], phi[axis]) - max(lo[axis], plo[axis]))
            # ground slabs/decks may touch the base of a prop collider; anything deeper is a duplicate
            if overlap > 0.002:
                errors.append(f"{obj.name} collider overlaps a procedural gameplay collider ({plo} -> {phi}), volume {overlap:.3f} m^3")
                break
    collider_budget = budgets.get("zoneColliders", 0)
    if len(zone_colliders) > collider_budget:
        errors.append(f"zone ships {len(zone_colliders)} colliders > budget {collider_budget}")
    rig_names = {node["name"] for node in rig_nodes}
    for required in contract.get("requiredRigNodes", []):
        if required not in rig_names:
            errors.append(f"required rig node {required} missing from the GLB")
    for node in rig_nodes:
        x, y, z = node["position"]
        if not (fx0 - 0.01 <= x <= fx1 + 0.01 and fy0 - 0.01 <= y <= fy1 + 0.01 and fz0 - 0.01 <= z <= fz1 + 0.01):
            errors.append(f"{node['name']} rig node sits outside the zone footprint at ({x:.2f}, {y:.2f}, {z:.2f})")

    metrics = {
        "asset": str(glb.relative_to(ROOT)),
        "sha256": hashlib.sha256(glb.read_bytes()).hexdigest(),
        "zone": args.zone,
        "payloadBytes": payload,
        "textureBytes": texture_bytes,
        "images": images,
        "estimatedGpuTextureBytes": gpu_estimate,
        "lod0": m0,
        "lod1": m1,
        "budgets": budgets,
        "colliderParity": parity,
        "zoneColliders": zone_colliders,
        "rigNodes": rig_nodes,
        "warnings": warnings,
        "passed": not errors,
        "errors": errors,
    }
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps(metrics, indent=2))
    print("ZONE_METRICS=" + json.dumps(metrics))
    if errors:
        raise RuntimeError("Zone validation failed: " + " | ".join(errors))


if __name__ == "__main__":
    main()
