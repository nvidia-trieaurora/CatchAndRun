"""Create an isolated Harbor V2 Blender authoring file from an existing GLB.

This command never changes the runtime GLB. It imports that asset into a new
`.blend`, sorts objects into authoring collections, and refuses to overwrite an
existing source file unless `--force` is supplied explicitly.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
AUTHORING_ROOT = (ROOT / "art-source/harbor-v2").resolve()
DEFAULT_SOURCE = ROOT / "client/public/assets/maps/harbor-v2/warehouse.glb"
DEFAULT_OUTPUT = ROOT / "art-source/harbor-v2/warehouse/warehouse-v2.blend"

COLLECTION_NAMES = (
    "RENDER_LOD0",
    "RENDER_LOD1",
    "RENDER_SHARED",
    "COLLISION",
    "MARKERS",
    "SOCKETS",
    "REFERENCE",
    "PREVIEW_ONLY",
)


def blender_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Allow replacing an existing authoring .blend file.",
    )
    return parser.parse_args(blender_args())


def absolute(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def collection_for(obj: bpy.types.Object) -> str:
    name = obj.name
    if name.startswith("COL_"):
        return "COLLISION"
    if name.startswith("MARKER_"):
        return "MARKERS"
    if name.startswith("SOCKET_"):
        return "SOCKETS"
    if name.endswith("_LOD0"):
        return "RENDER_LOD0"
    if name.endswith("_LOD1"):
        return "RENDER_LOD1"
    if obj.type == "MESH":
        return "RENDER_SHARED"
    return "REFERENCE"


def move_to_collection(
    obj: bpy.types.Object,
    target: bpy.types.Collection,
) -> None:
    if target.objects.get(obj.name) is None:
        target.objects.link(obj)
    for current in tuple(obj.users_collection):
        if current != target:
            current.objects.unlink(obj)


def main() -> None:
    args = parse_args()
    source = absolute(args.source).resolve()
    output = absolute(args.output).resolve()

    if not source.is_file():
        raise FileNotFoundError(f"Source GLB does not exist: {source}")
    if source.suffix.lower() != ".glb":
        raise ValueError(f"Authoring bootstrap source must be a .glb file: {source}")
    if output.suffix.lower() != ".blend":
        raise ValueError(f"Authoring output must be a .blend file: {output}")
    if not output.is_relative_to(AUTHORING_ROOT):
        raise PermissionError(
            f"Authoring output must stay inside {AUTHORING_ROOT}: {output}"
        )
    if source == output:
        raise ValueError("Source and output must be different files")
    if output.exists() and not args.force:
        raise FileExistsError(
            f"Refusing to overwrite authoring source: {output}. "
            "Use --force only after making a checkpoint."
        )

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    result = bpy.ops.import_scene.gltf(filepath=str(source))
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender could not import {source}: {result}")

    scene = bpy.context.scene
    scene.name = "Harbor_V2_Warehouse_Authoring"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    scene["catchAndRunAuthoring"] = True
    scene["sourceGlb"] = str(source.relative_to(ROOT))
    scene["coordinateContract"] = "Blender Z-up meters; glTF export Y-up"

    collections: dict[str, bpy.types.Collection] = {}
    for name in COLLECTION_NAMES:
        collection = bpy.data.collections.new(name)
        scene.collection.children.link(collection)
        collections[name] = collection

    counts = {name: 0 for name in COLLECTION_NAMES}
    for obj in tuple(scene.objects):
        target_name = collection_for(obj)
        move_to_collection(obj, collections[target_name])
        counts[target_name] += 1

        if target_name == "COLLISION":
            obj.display_type = "WIRE"
            obj.show_in_front = True
            obj.hide_render = True
            obj.hide_set(True)
        elif target_name in {"MARKERS", "SOCKETS"} and obj.type == "EMPTY":
            obj.empty_display_size = max(obj.empty_display_size, 0.35)
            obj.show_in_front = True
            obj.hide_set(True)
        elif target_name == "RENDER_LOD1":
            # Keep the authoring viewport on one visual tier. Showing LOD0 and
            # LOD1 together creates coplanar z-fighting and ghost silhouettes.
            obj.hide_set(True)

    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = None
    bpy.ops.wm.save_as_mainfile(filepath=str(output), check_existing=False)
    summary = {
        "source": str(source),
        "output": str(output),
        "objects": len(scene.objects),
        "collections": counts,
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
