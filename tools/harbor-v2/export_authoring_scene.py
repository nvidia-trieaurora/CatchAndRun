"""Export the open Harbor authoring scene to a guarded staging GLB."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
AUTHORING_ROOT = (ROOT / "art-source/harbor-v2").resolve()
STAGING_ROOT = (AUTHORING_ROOT / "_staging").resolve()
DEFAULT_OUTPUT = ROOT / "art-source/harbor-v2/_staging/warehouse-v2-candidate.glb"


def blender_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--image-format",
        choices=("AUTO", "JPEG", "WEBP"),
        default="WEBP",
        help=(
            "Embedded texture encoding. WEBP matches the cinematic pipeline and "
            "keeps the PBR Warehouse under the 6 MB mobile payload budget."
        ),
    )
    parser.add_argument(
        "--image-quality",
        type=int,
        default=86,
        help="Lossy quality for JPEG/WEBP textures (cinematic pipeline uses 86).",
    )
    return parser.parse_args(blender_args())


def absolute(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def main() -> None:
    args = parse_args()
    output = absolute(args.output).resolve()
    source_blend = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    if source_blend is None or source_blend.suffix.lower() != ".blend":
        raise RuntimeError("Save the authoring scene as a .blend file before export")
    if not source_blend.is_relative_to(AUTHORING_ROOT):
        raise PermissionError(
            f"Source .blend must stay inside {AUTHORING_ROOT}: {source_blend}"
        )
    if output.suffix.lower() != ".glb" or not output.is_relative_to(STAGING_ROOT):
        raise PermissionError(
            f"Candidate exports must be .glb files inside {STAGING_ROOT}: {output}"
        )

    scene = bpy.context.scene
    if not scene.get("catchAndRunAuthoring"):
        raise RuntimeError(
            "Scene is not marked as Catch and Run authoring source. "
            "Create it with bootstrap_authoring_scene.py first."
        )
    objects = list(scene.objects)
    export_objects = [
        obj
        for obj in objects
        if obj.type not in {"CAMERA", "LIGHT"}
        and all(collection.name != "PREVIEW_ONLY" for collection in obj.users_collection)
    ]
    mesh_names = {obj.name for obj in export_objects if obj.type == "MESH"}
    marker_names = {
        obj.name for obj in export_objects if obj.name.startswith("MARKER_")
    }
    lod0 = sorted(name for name in mesh_names if name.endswith("_LOD0"))
    lod1 = sorted(name for name in mesh_names if name.endswith("_LOD1"))
    colliders = sorted(name for name in mesh_names if name.startswith("COL_MOVE_"))

    errors: list[str] = []
    if scene.unit_settings.system != "METRIC" or scene.unit_settings.scale_length != 1.0:
        errors.append("scene units must be Metric with scale 1.0")
    if not lod0:
        errors.append("no _LOD0 render meshes found")
    if not lod1:
        errors.append("no _LOD1 render meshes found")
    if not colliders:
        errors.append("no COL_MOVE_* collision meshes found")
    if not marker_names:
        errors.append("no MARKER_* objects found")
    render_meshes = [
        obj for obj in export_objects
        if obj.type == "MESH" and not obj.name.startswith("COL_")
    ]
    for obj in render_meshes:
        classified = obj.name.endswith(("_LOD0", "_LOD1")) or any(
            collection.name == "RENDER_SHARED" for collection in obj.users_collection
        )
        if not classified:
            errors.append(
                f"render mesh {obj.name!r} needs an _LOD0/_LOD1 suffix or "
                "membership in RENDER_SHARED"
            )
        if obj.matrix_world.to_3x3().determinant() < 0:
            errors.append(
                f"render mesh {obj.name!r} has a negative world scale; "
                "apply/fix it before export"
            )
    if errors:
        raise RuntimeError("Authoring preflight failed: " + "; ".join(errors))

    previous_selection = {obj.name for obj in objects if obj.select_get()}
    previous_hidden = {obj.name: obj.hide_get() for obj in objects}
    previous_active = bpy.context.view_layer.objects.active
    bpy.ops.object.select_all(action="DESELECT")
    for obj in export_objects:
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
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            if obj.name in previous_selection:
                obj.select_set(True)
            obj.hide_set(previous_hidden[obj.name])
        if previous_active and previous_active.name in scene.objects:
            bpy.context.view_layer.objects.active = previous_active

    if "FINISHED" not in result or not output.is_file():
        raise RuntimeError(f"GLB export failed: {result}")

    summary = {
        "sourceBlend": str(source_blend),
        "output": str(output),
        "imageFormat": args.image_format,
        "imageQuality": args.image_quality,
        "payloadBytes": output.stat().st_size,
        "exportedObjects": len(export_objects),
        "lod0Meshes": len(lod0),
        "lod1Meshes": len(lod1),
        "collisionMeshes": len(colliders),
        "markers": len(marker_names),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
