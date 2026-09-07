"""Validate the exported Harbor V2 Warehouse GLB against production budgets."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GLB_PATH = ROOT / "client" / "public" / "assets" / "maps" / "harbor-v2" / "warehouse.glb"
DEFAULT_METRICS_PATH = ROOT / "docs" / "v2" / "harbor" / "warehouse-v2-metrics.json"
DEFAULT_MANIFEST_PATH = ROOT / "client" / "public" / "assets" / "maps" / "harbor-v2" / "warehouse.manifest.json"
STAGING_ROOT = (ROOT / "art-source/harbor-v2/_staging").resolve()
TRANSFORM_TOLERANCE_METERS = 0.001
RP01_EXPECTED_NAMES = {
    "MESH_WAREHOUSE_RP01_CORRUGATED_RED_LOD0",
    "MESH_WAREHOUSE_RP01_GALVANIZED_LOD0",
    "MESH_WAREHOUSE_RP01_RUBBER_DARK_LOD0",
    "MESH_WAREHOUSE_RP01_SAFETY_YELLOW_LOD0",
    "MESH_WAREHOUSE_RP01_STEEL_NAVY_LOD0",
}
RP01_EXPECTED_EXTRAS = {
    "harbor_v2_role": "render_mesh",
    "harborZone": "warehouse",
    "gameplayRole": "decorative",
    "ignoreWeaponRaycast": True,
    "realismPass": "RP01_LOADING_FACADE",
}
SC02_EXPECTED_MATERIALS = {
    "MESH_WAREHOUSE_SC02_CONCRETE_LOD0": "MAT_CONCRETE",
    "MESH_WAREHOUSE_SC02_GALVANIZED_LOD0": "MAT_GALVANIZED",
    "MESH_WAREHOUSE_SC02_ROOF_GLASS_LOD0": "MAT_ROOF_GLASS",
    "MESH_WAREHOUSE_SC02_SAFETY_YELLOW_LOD0": "MAT_SAFETY_YELLOW",
    "MESH_WAREHOUSE_SC02_STEEL_NAVY_LOD0": "MAT_STEEL_NAVY",
}
SC02_EXPECTED_EXTRAS = {
    "harbor_v2_role": "render_mesh",
    "harborZone": "warehouse",
    "gameplayRole": "decorative",
    "weaponImpactKind": "solid",
    "ignoreWeaponRaycast": True,
    "structuralSupportPass": "SC02_STRUCTURAL_SUPPORT",
}
SIDE_WINDOW_Y = (-10.0, -3.0, 5.0, 12.0)


def measure(meshes):
    triangles = 0
    draw_calls = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        draw_calls += max(1, len(obj.material_slots))
    return {
        "renderMeshes": len(meshes),
        "triangles": triangles,
        "estimatedDrawCalls": draw_calls,
    }


def blender_args() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", type=Path, default=DEFAULT_GLB_PATH)
    parser.add_argument("--metrics", type=Path, default=DEFAULT_METRICS_PATH)
    parser.add_argument(
        "--require-rp01",
        action="store_true",
        help="Require the complete RP01 loading-facade vertical slice.",
    )
    parser.add_argument(
        "--require-structural-support",
        action="store_true",
        help="Reject known pasted-on facade and disconnected drainage geometry.",
    )
    parser.add_argument(
        "--require-sc02",
        action="store_true",
        help="Require the complete SC02 structural-support and skylight pass.",
    )
    parser.add_argument(
        "--require-sign",
        action="store_true",
        help="Require the unobscured SC04 loading-bay sign shared by all LODs.",
    )
    return parser.parse_args(blender_args())


def absolute(path: Path) -> Path:
    return path if path.is_absolute() else ROOT / path


def blender_to_three(vector: Vector) -> dict[str, float]:
    """Convert Blender's Z-up coordinates to the runtime glTF/Three.js Y-up contract."""
    return {"x": float(vector.x), "y": float(vector.z), "z": float(-vector.y)}


def world_aabb(obj: bpy.types.Object) -> tuple[dict[str, float], dict[str, float]]:
    points = [blender_to_three(obj.matrix_world @ Vector(corner)) for corner in obj.bound_box]
    return (
        {axis: min(point[axis] for point in points) for axis in ("x", "y", "z")},
        {axis: max(point[axis] for point in points) for axis in ("x", "y", "z")},
    )


def compare_vector(
    label: str,
    actual: dict[str, float],
    expected: dict[str, float],
    errors: list[str],
) -> None:
    mismatches = [
        f"{axis}={actual[axis]:.4f} (expected {float(expected[axis]):.4f})"
        for axis in ("x", "y", "z")
        if abs(actual[axis] - float(expected[axis])) > TRANSFORM_TOLERANCE_METERS
    ]
    if mismatches:
        errors.append(f"{label} changed: {', '.join(mismatches)}")


def is_side_window_placeholder(point: Vector) -> bool:
    if not 22.80 <= abs(point.x) <= 23.20:
        return False
    if not 3.00 <= point.z <= 5.40:
        return False
    return any(abs(point.y - center_y) <= 1.75 for center_y in SIDE_WINDOW_Y)


def is_disconnected_downspout(point: Vector) -> bool:
    return (
        22.79 <= abs(point.x) <= 23.01
        and 16.89 <= abs(point.y) <= 17.11
        and 0.09 <= point.z <= 7.51
    )


def is_uncollidable_catwalk_stair(point: Vector) -> bool:
    return (
        -19.05 <= point.x <= -16.95
        and 8.15 <= point.y <= 12.90
        and 0.08 <= point.z <= 4.00
    )


def main():
    args = parse_args()
    glb_path = absolute(args.glb).resolve()
    metrics_path = absolute(args.metrics).resolve()
    if not glb_path.is_file():
        raise FileNotFoundError(f"Warehouse GLB does not exist: {glb_path}")
    if glb_path != DEFAULT_GLB_PATH.resolve() and (
        glb_path.suffix.lower() != ".glb" or not glb_path.is_relative_to(STAGING_ROOT)
    ):
        raise PermissionError(
            f"Custom validation input must be a staging GLB inside {STAGING_ROOT}: {glb_path}"
        )
    if metrics_path != DEFAULT_METRICS_PATH.resolve() and (
        metrics_path.suffix.lower() != ".json"
        or not metrics_path.is_relative_to(STAGING_ROOT)
    ):
        raise PermissionError(
            f"Custom metrics output must be JSON inside {STAGING_ROOT}: {metrics_path}"
        )
    manifest = json.loads(DEFAULT_MANIFEST_PATH.read_text(encoding="utf-8"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    objects = list(bpy.context.scene.objects)
    render_meshes = [
        obj for obj in objects
        if obj.type == "MESH" and not obj.name.startswith("COL_")
    ]
    collision_names = {
        obj.name for obj in objects
        if obj.type == "MESH" and obj.name.startswith("COL_MOVE_")
    }
    marker_names = {
        obj.name for obj in objects
        if obj.name.startswith("MARKER_")
    }

    lod0_meshes = [obj for obj in render_meshes if obj.name.endswith("_LOD0")]
    lod1_meshes = [obj for obj in render_meshes if obj.name.endswith("_LOD1")]
    shared_meshes = [
        obj for obj in render_meshes
        if not obj.name.endswith(("_LOD0", "_LOD1"))
    ]
    lod0_metrics = measure(lod0_meshes + shared_meshes)
    lod1_metrics = measure(lod1_meshes + shared_meshes)

    payload_bytes = glb_path.stat().st_size
    errors: list[str] = []
    facade_coherence_materials = {"MAT_GLASS_WARM", "MAT_GALVANIZED"}
    facade_coherence_violations: dict[str, dict[str, int]] = {}
    if args.require_structural_support:
        for obj in render_meshes:
            material_names = {
                slot.material.name for slot in obj.material_slots if slot.material is not None
            }
            if not material_names.intersection(facade_coherence_materials):
                continue
            window_vertices = 0
            downspout_vertices = 0
            catwalk_stair_vertices = 0
            for vertex in obj.data.vertices:
                point = obj.matrix_world @ vertex.co
                if is_side_window_placeholder(point):
                    window_vertices += 1
                if is_disconnected_downspout(point):
                    downspout_vertices += 1
                if is_uncollidable_catwalk_stair(point):
                    catwalk_stair_vertices += 1
            if window_vertices or downspout_vertices or catwalk_stair_vertices:
                facade_coherence_violations[obj.name] = {
                    "sideWindowVertices": window_vertices,
                    "downspoutVertices": downspout_vertices,
                    "uncollidableCatwalkStairVertices": catwalk_stair_vertices,
                }
        if facade_coherence_violations:
            details = ", ".join(
                f"{name} ({counts['sideWindowVertices']} window, "
                f"{counts['downspoutVertices']} downspout, "
                f"{counts['uncollidableCatwalkStairVertices']} catwalk-stair vertices)"
                for name, counts in sorted(facade_coherence_violations.items())
            )
            errors.append(
                "unsupported facade placeholders remain: "
                + details
            )
    forbidden_authoring_nodes = sorted(
        obj.name for obj in objects
        if obj.name.startswith(("MESH_WAREHOUSE_STAGING_RP01_", "RP01_PREVIEW_"))
    )
    if forbidden_authoring_nodes:
        errors.append(
            "staging/preview nodes leaked into GLB: "
            + ", ".join(forbidden_authoring_nodes)
        )

    if args.require_sign:
        sign_names = {
            obj.name for obj in render_meshes
            if obj.name.startswith("MESH_WAREHOUSE_SC04_SIGN_")
        }
        expected_sign_names = {
            "MESH_WAREHOUSE_SC04_SIGN_BACKING",
            "MESH_WAREHOUSE_SC04_SIGN_FRAME",
            "MESH_WAREHOUSE_SC04_SIGN_LETTERS",
        }
        missing = sorted(expected_sign_names - sign_names)
        if missing:
            errors.append("missing SC04 sign nodes: " + ", ".join(missing))
        backing = next((obj for obj in render_meshes if obj.name == "MESH_WAREHOUSE_SC04_SIGN_BACKING"), None)
        if backing is not None:
            minimum, maximum = world_aabb(backing)
            if minimum["y"] < 6.75 or maximum["y"] < 8.45:
                errors.append("SC04 sign is not fully raised above the loading canopy")

    rp01_objects = {
        obj.name: obj for obj in objects
        if obj.name.startswith("MESH_WAREHOUSE_RP01_")
    }
    rp01_metrics = measure([
        obj for obj in rp01_objects.values() if obj.type == "MESH"
    ])
    if args.require_rp01:
        missing_rp01 = sorted(RP01_EXPECTED_NAMES - set(rp01_objects))
        unexpected_rp01 = sorted(set(rp01_objects) - RP01_EXPECTED_NAMES)
        if missing_rp01:
            errors.append("missing RP01 nodes: " + ", ".join(missing_rp01))
        if unexpected_rp01:
            errors.append("unexpected RP01 nodes: " + ", ".join(unexpected_rp01))
        for name in sorted(RP01_EXPECTED_NAMES & set(rp01_objects)):
            obj = rp01_objects[name]
            if obj.type != "MESH":
                errors.append(f"{name} must be a MESH, found {obj.type}")
                continue
            if len(obj.material_slots) != 1:
                errors.append(
                    f"{name} must have exactly one material slot, "
                    f"found {len(obj.material_slots)}"
                )
            for key, expected in RP01_EXPECTED_EXTRAS.items():
                actual = obj.get(key)
                if actual != expected:
                    errors.append(
                        f"{name} extra {key!r} is {actual!r}, expected {expected!r}"
                    )
        if rp01_metrics["triangles"] > 22000:
            errors.append(
                "RP01 triangle budget exceeded: "
                f"{rp01_metrics['triangles']} > 22000"
            )
        if rp01_metrics["estimatedDrawCalls"] > 5:
            errors.append(
                "RP01 draw-call budget exceeded: "
                f"{rp01_metrics['estimatedDrawCalls']} > 5"
            )
    sc02_objects = {
        obj.name: obj for obj in objects
        if obj.name.startswith("MESH_WAREHOUSE_SC02_")
    }
    sc02_metrics = measure([
        obj for obj in sc02_objects.values() if obj.type == "MESH"
    ])
    if args.require_sc02:
        expected_names = set(SC02_EXPECTED_MATERIALS)
        missing_sc02 = sorted(expected_names - set(sc02_objects))
        unexpected_sc02 = sorted(set(sc02_objects) - expected_names)
        if missing_sc02:
            errors.append("missing SC02 nodes: " + ", ".join(missing_sc02))
        if unexpected_sc02:
            errors.append("unexpected SC02 nodes: " + ", ".join(unexpected_sc02))
        if bpy.data.objects.get("MESH_WAREHOUSE_ROOF_GLASS_LOD0") is not None:
            errors.append("legacy buried skylight batch remains after SC02")
        for name in sorted(expected_names & set(sc02_objects)):
            obj = sc02_objects[name]
            if obj.type != "MESH":
                errors.append(f"{name} must be a MESH, found {obj.type}")
                continue
            materials = [
                slot.material.name
                for slot in obj.material_slots
                if slot.material is not None
            ]
            expected_material = SC02_EXPECTED_MATERIALS[name]
            if materials != [expected_material]:
                errors.append(
                    f"{name} materials are {materials!r}, "
                    f"expected [{expected_material!r}]"
                )
            for key, expected in SC02_EXPECTED_EXTRAS.items():
                actual = obj.get(key)
                if actual != expected:
                    errors.append(
                        f"{name} extra {key!r} is {actual!r}, expected {expected!r}"
                    )
        roof_glass = sc02_objects.get("MESH_WAREHOUSE_SC02_ROOF_GLASS_LOD0")
        if roof_glass is not None and roof_glass.type == "MESH":
            min_roof_glass_z = min(
                (roof_glass.matrix_world @ vertex.co).z
                for vertex in roof_glass.data.vertices
            )
            if min_roof_glass_z < 8.88:
                errors.append(
                    "SC02 roof glass remains buried below the roof surface: "
                    f"min z={min_roof_glass_z:.4f}"
                )
        if sc02_metrics["triangles"] > 12000:
            errors.append(
                "SC02 triangle budget exceeded: "
                f"{sc02_metrics['triangles']} > 12000"
            )
        if sc02_metrics["estimatedDrawCalls"] > 5:
            errors.append(
                "SC02 draw-call budget exceeded: "
                f"{sc02_metrics['estimatedDrawCalls']} > 5"
            )
    collision_contract = {item["name"]: item for item in manifest["collisions"]}
    marker_contract = {item["name"]: item for item in manifest["markers"]}
    missing_markers = sorted(set(marker_contract) - marker_names)
    missing_colliders = sorted(set(collision_contract) - collision_names)
    if missing_markers:
        errors.append(f"missing markers: {', '.join(missing_markers)}")
    if missing_colliders:
        errors.append(f"missing colliders: {', '.join(missing_colliders)}")
    unexpected_colliders = sorted(collision_names - set(collision_contract))
    unexpected_markers = sorted(marker_names - set(marker_contract))
    if unexpected_colliders:
        errors.append(f"unexpected colliders: {', '.join(unexpected_colliders)}")
    if unexpected_markers:
        errors.append(f"unexpected markers: {', '.join(unexpected_markers)}")
    for name, expected in collision_contract.items():
        obj = bpy.data.objects.get(name)
        if obj is None or obj.type != "MESH":
            continue
        actual_min, actual_max = world_aabb(obj)
        compare_vector(f"{name} min", actual_min, expected["min"], errors)
        compare_vector(f"{name} max", actual_max, expected["max"], errors)
    for name, expected in marker_contract.items():
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        if obj.type != "EMPTY":
            errors.append(f"{name} must be an EMPTY, found {obj.type}")
        compare_vector(
            f"{name} position",
            blender_to_three(obj.matrix_world.translation),
            expected["position"],
            errors,
        )
    roof_colliders = {
        name for name in collision_names
        if name.startswith("COL_MOVE_ROOF_")
    }
    if len(roof_colliders) != 12:
        errors.append(f"expected 12 stepped roof colliders, found {len(roof_colliders)}")
    exterior_stair_colliders = {
        name for name in collision_names
        if name.startswith("COL_MOVE_EXT_STAIR_")
    }
    if len(exterior_stair_colliders) != 44:
        errors.append(
            "expected 42 exterior steps and 2 roof landings, "
            f"found {len(exterior_stair_colliders)}",
        )
    if not lod0_meshes:
        errors.append("missing LOD0 render meshes")
    if not lod1_meshes:
        errors.append("missing LOD1 render meshes")
    if lod0_metrics["triangles"] > 120000:
        errors.append(f"desktop triangle budget exceeded: {lod0_metrics['triangles']} > 120000")
    if lod0_metrics["estimatedDrawCalls"] > 100:
        errors.append(
            "desktop draw-call budget exceeded: "
            f"{lod0_metrics['estimatedDrawCalls']} > 100",
        )
    if lod1_metrics["triangles"] > 60000:
        errors.append(f"mobile triangle budget exceeded: {lod1_metrics['triangles']} > 60000")
    if lod1_metrics["estimatedDrawCalls"] > 60:
        errors.append(
            "mobile draw-call budget exceeded: "
            f"{lod1_metrics['estimatedDrawCalls']} > 60",
        )
    if payload_bytes > 6 * 1024 * 1024:
        errors.append(f"mobile payload budget exceeded: {payload_bytes} bytes")

    metrics = {
        "asset": str(glb_path.relative_to(ROOT)),
        "payloadBytes": payload_bytes,
        "lod0": lod0_metrics,
        "lod1": lod1_metrics,
        "sharedRender": measure(shared_meshes),
        "rp01": rp01_metrics,
        "rp01Required": args.require_rp01,
        "sc02": sc02_metrics,
        "sc02Required": args.require_sc02,
        "structuralSupportRequired": args.require_structural_support,
        "facadeCoherenceViolations": facade_coherence_violations,
        "collisionMeshes": len(collision_names),
        "markers": len(marker_names),
        "transformToleranceMeters": TRANSFORM_TOLERANCE_METERS,
        "desktopBudgets": {
            "triangles": 120000,
            "drawCalls": 100,
        },
        "mobileBudgets": {
            "triangles": 60000,
            "drawCalls": 60,
            "payloadBytes": 6 * 1024 * 1024,
        },
        "passed": not errors,
        "errors": errors,
    }
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    if errors:
        # Blender treats SystemExit from a Python script as a clean shutdown in
        # some versions. Raise so --python-exit-code reliably fails CI/preflight.
        raise RuntimeError("Warehouse validation failed: " + " | ".join(errors))


if __name__ == "__main__":
    main()
