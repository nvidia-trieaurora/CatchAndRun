"""Export an edge-zone authoring scene (AC garden, AD construction) to staging.

    blender --background art-source/harbor-v2/garden/garden-ac.blend --python-exit-code 1 \
        --python tools/harbor-v2/export_zone_scene.py -- --output art-source/harbor-v2/_staging/garden-ac-candidate.glb

Zone passes are visual-first: the COLLISION (reference) / REFERENCE / PREVIEW_ONLY
collections are never exported and the script refuses MARKER_* nodes or colliders
outside the zone namespace. The only gameplay nodes a zone may ship are the
``COL_MOVE_<ZONE>_*`` boxes from its COLLISION_ZONE collection — movement
colliders for props the zone itself introduces (the procedural gameplay colliders
stay untouched). Textures are embedded as WebP (quality 86) like the rest of the
Harbor V2 pipeline.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
AUTHORING_ROOT = (ROOT / "art-source/harbor-v2").resolve()
STAGING_ROOT = (AUTHORING_ROOT / "_staging").resolve()
EXCLUDED_COLLECTIONS = {"COLLISION", "REFERENCE", "PREVIEW_ONLY", "MARKERS"}


def blender_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1:]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--image-format", choices=("AUTO", "JPEG", "WEBP"), default="WEBP")
    parser.add_argument("--image-quality", type=int, default=86)
    return parser.parse_args(blender_args())


def main() -> None:
    args = parse_args()
    output = (args.output if args.output.is_absolute() else ROOT / args.output).resolve()
    source = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    if source is None or not source.is_relative_to(AUTHORING_ROOT):
        raise PermissionError(f"Zone .blend must live inside {AUTHORING_ROOT}: {source}")
    if output.suffix.lower() != ".glb" or not output.is_relative_to(STAGING_ROOT):
        raise PermissionError(f"Candidate exports must be .glb files inside {STAGING_ROOT}: {output}")
    scene = bpy.context.scene
    zone_id = scene.get("catchAndRunZone")
    if not scene.get("catchAndRunAuthoring") or not zone_id:
        raise RuntimeError("Scene is not a Catch and Run zone authoring source (missing catchAndRunZone)")

    rig_prefixes = (f"RIG_{zone_id}_", f"SOCKET_{zone_id}_")
    export_objects = []
    rig_nodes = []
    for obj in scene.objects:
        if any(col.name in EXCLUDED_COLLECTIONS for col in obj.users_collection):
            continue
        if obj.type == "EMPTY" and obj.name.startswith(rig_prefixes):
            rig_nodes.append(obj)
            continue
        if obj.type != "MESH":
            continue
        export_objects.append(obj)
    errors = []
    if scene.unit_settings.system != "METRIC" or scene.unit_settings.scale_length != 1.0:
        errors.append("scene units must be Metric with scale 1.0")
    for node in rig_nodes:
        if node.parent is not None and node.parent not in rig_nodes:
            errors.append(f"{node.name} must be parented to another RIG_ node or nothing")
        if not node.get("harborZone"):
            errors.append(f"{node.name} is missing the harborZone extra")
    for obj in export_objects:
        if obj.parent is not None and obj.parent not in rig_nodes:
            errors.append(f"{obj.name} is parented to {obj.parent.name}, which is not an exported RIG_ node")
    collider_prefix = f"COL_MOVE_{zone_id}_"
    collider_prefixes = (collider_prefix, f"COL_LADDER_{zone_id}_")
    colliders = [o for o in export_objects if o.name.startswith(collider_prefixes)]
    render_objects = [o for o in export_objects if not o.name.startswith(collider_prefixes)]
    lod0 = [o for o in render_objects if o.name.endswith("_LOD0")]
    lod1 = [o for o in render_objects if o.name.endswith("_LOD1")]
    if not lod0:
        errors.append("no _LOD0 render meshes")
    if not lod1:
        errors.append("no _LOD1 render meshes")
    for obj in colliders:
        if not any(col.name == "COLLISION_ZONE" for col in obj.users_collection):
            errors.append(f"{obj.name} must live in the COLLISION_ZONE collection")
        if obj.rotation_euler[:] != (0.0, 0.0, 0.0):
            errors.append(f"{obj.name} colliders must be axis aligned (no rotation)")
        if not obj.get("harborZone"):
            errors.append(f"{obj.name} is missing the harborZone extra")
        if obj.name.startswith("COL_LADDER_") and obj.get("ladderApproach") not in ("+x", "-x", "+z", "-z"):
            errors.append(f"{obj.name} needs a ladderApproach extra (+x/-x/+z/-z)")
    for obj in render_objects:
        if obj.name.startswith(("COL_", "MARKER_", "SOCKET_", "REF_")):
            errors.append(f"zone pass must not export {obj.name} (only {collider_prefix}* / COL_LADDER_{zone_id}_* colliders are allowed)")
        if not obj.name.startswith(f"MESH_{zone_id}_"):
            errors.append(f"{obj.name} is not namespaced as MESH_{zone_id}_*")
        if not obj.name.endswith(("_LOD0", "_LOD1")):
            errors.append(f"{obj.name} needs an _LOD0/_LOD1 suffix")
        if obj.matrix_world.to_3x3().determinant() < 0:
            errors.append(f"{obj.name} has negative scale")
        if not obj.get("harborZone"):
            errors.append(f"{obj.name} is missing the harborZone extra")
    if errors:
        raise RuntimeError("Zone export preflight failed: " + "; ".join(errors))

    previous_hidden = {o.name: o.hide_get() for o in scene.objects}
    for obj in scene.objects:
        obj.select_set(False)
    for obj in export_objects + rig_nodes:
        obj.hide_set(False)
        obj.select_set(True)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        result = bpy.ops.export_scene.gltf(
            filepath=str(output),
            check_existing=False,
            export_format="GLB",
            export_apply=True,
            export_extras=True,
            export_yup=True,
            export_materials="EXPORT",
            export_image_format=args.image_format,
            export_image_quality=args.image_quality,
            export_jpeg_quality=args.image_quality,
            export_unused_images=False,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
            use_selection=True,
        )
    finally:
        for obj in scene.objects:
            obj.select_set(False)
            obj.hide_set(previous_hidden.get(obj.name, False))
    if "FINISHED" not in result or not output.is_file():
        raise RuntimeError(f"GLB export failed: {result}")
    summary = {
        "zone": zone_id,
        "sourceBlend": str(source),
        "output": str(output),
        "payloadBytes": output.stat().st_size,
        "lod0Meshes": len(lod0),
        "lod1Meshes": len(lod1),
        "zoneColliders": len(colliders),
        "rigNodes": len(rig_nodes),
        "imageFormat": args.image_format,
    }
    print("ZONE_EXPORT=" + json.dumps(summary))


if __name__ == "__main__":
    main()
