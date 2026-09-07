"""Build the authored Harbor V2 environment as a production GLB.

The scene is assembled from modular kit functions in Blender, never from
runtime Three.js primitives. Coordinates accepted by helpers are Three.js
Y-up coordinates and converted to Blender Z-up at authoring time.
"""

from __future__ import annotations

import json
import math
import os
import random
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "client/public/assets/maps/harbor-v2/cinematic"
DOCS_DIR = ROOT / "docs/v2/harbor"
GLB_PATH = OUT_DIR / "harbor-cinematic.glb"
MANIFEST_PATH = OUT_DIR / "harbor-cinematic.manifest.json"
PREVIEW_PATH = DOCS_DIR / "harbor-cinematic-preview.png"
DOCK_PREVIEW_PATH = DOCS_DIR / "harbor-dock-preview.png"
FLEET_PREVIEW_PATH = DOCS_DIR / "harbor-fleet-preview.png"
TEXTURE_DIR = ROOT / "tools/harbor-v2/textures"
SEED = 20260906

random.seed(SEED)

PBR_SOURCE_BY_MATERIAL = {
    "concrete": "concrete",
    "concrete_warm": "concrete",
    "asphalt": "asphalt_02",
    "wood": "wood_planks",
    "rust": "rusty_corrugated_iron",
}


def reset_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def to_blender_position(position: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = position
    return (x, -z, y)


def create_generated_image(
    name: str,
    base: tuple[float, float, float],
    roughness: float,
    metalness: float,
    kind: str,
    size: int = 64,
) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            grain = (
                math.sin(x * 0.71 + y * 0.17)
                + math.cos(y * 0.43 - x * 0.09)
            ) * 0.025
            stain = 0.0
            if (x * 7 + y * 13) % 53 < 3:
                stain = -0.06
            if kind == "base":
                pixels.extend(
                    (
                        max(0.0, min(1.0, base[0] + grain + stain)),
                        max(0.0, min(1.0, base[1] + grain * 0.75 + stain * 0.65)),
                        max(0.0, min(1.0, base[2] + grain * 0.5 + stain * 0.35)),
                        1.0,
                    )
                )
            elif kind == "normal":
                nx = math.sin(x * 0.38 + y * 0.11) * 0.07
                ny = math.cos(y * 0.34 - x * 0.13) * 0.07
                pixels.extend((0.5 + nx, 0.5 + ny, 0.995, 1.0))
            else:
                rough_noise = max(0.05, min(1.0, roughness + grain * 2.0))
                pixels.extend((0.92, rough_noise, metalness, 1.0))
    image.pixels = pixels
    image.pack()
    return image


def create_pbr_material(
    name: str,
    color_hex: int,
    roughness: float,
    metalness: float,
    emission_hex: int | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputMaterial")
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    base_rgb = (
        ((color_hex >> 16) & 255) / 255.0,
        ((color_hex >> 8) & 255) / 255.0,
        (color_hex & 255) / 255.0,
    )
    texture_set = PBR_SOURCE_BY_MATERIAL.get(name)
    if texture_set and (TEXTURE_DIR / texture_set / "diffuse.jpg").exists():
        base_image = bpy.data.images.load(
            str(TEXTURE_DIR / texture_set / "diffuse.jpg"),
            check_existing=True,
        )
        normal_image = bpy.data.images.load(
            str(TEXTURE_DIR / texture_set / "normal.jpg"),
            check_existing=True,
        )
        orm_image = bpy.data.images.load(
            str(TEXTURE_DIR / texture_set / "arm.jpg"),
            check_existing=True,
        )
        for image in (base_image, normal_image, orm_image):
            if image.size[0] > 512 or image.size[1] > 512:
                image.scale(512, 512)
            image.pack()
        normal_image.colorspace_settings.name = "Non-Color"
        orm_image.colorspace_settings.name = "Non-Color"
        texture_coordinates = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (3.0, 3.0, 3.0)
        links.new(texture_coordinates.outputs["UV"], mapping.inputs["Vector"])
    else:
        base_image = create_generated_image(
            f"{name}_BaseColor", base_rgb, roughness, metalness, "base"
        )
        normal_image = create_generated_image(
            f"{name}_Normal", (0.5, 0.5, 1.0), roughness, metalness, "normal"
        )
        orm_image = create_generated_image(
            f"{name}_ORM", base_rgb, roughness, metalness, "orm"
        )
        normal_image.colorspace_settings.name = "Non-Color"
        orm_image.colorspace_settings.name = "Non-Color"
        mapping = None

    base_node = nodes.new("ShaderNodeTexImage")
    base_node.image = base_image
    base_node.interpolation = "Linear"
    if mapping:
        links.new(mapping.outputs["Vector"], base_node.inputs["Vector"])
    links.new(base_node.outputs["Color"], principled.inputs["Base Color"])

    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.image = normal_image
    if mapping:
        links.new(mapping.outputs["Vector"], normal_tex.inputs["Vector"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.65 if texture_set else 0.32
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

    orm_tex = nodes.new("ShaderNodeTexImage")
    orm_tex.image = orm_image
    if mapping:
        links.new(mapping.outputs["Vector"], orm_tex.inputs["Vector"])
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm_tex.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], principled.inputs["Roughness"])
    links.new(separate.outputs["Blue"], principled.inputs["Metallic"])

    if emission_hex is not None:
        emission_rgb = (
            ((emission_hex >> 16) & 255) / 255.0,
            ((emission_hex >> 8) & 255) / 255.0,
            (emission_hex & 255) / 255.0,
            1.0,
        )
        principled.inputs["Emission Color"].default_value = emission_rgb
        principled.inputs["Emission Strength"].default_value = emission_strength
    return material


MATERIALS: dict[str, bpy.types.Material] = {}
CINEMATIC_COLLISION_SPECS: list[dict[str, object]] = []

CONTAINER_LAYOUTS = [
    ((38, 0, -8), "container_red", 0),
    ((38, 0, -12.5), "container_navy", 0),
    ((40, 2.6, -8), "container_teal", 0),
    ((47, 0, -4), "container_teal", math.pi / 2),
    ((31, 0, -18), "container_red", 0.08),
    ((39, 0, -19), "container_navy", 0),
    ((47, 0, -19), "container_teal", 0),
    ((43, 2.6, -19), "container_red", 0),
    ((55, 0, -13), "container_navy", math.pi / 2),
    ((55, 2.6, -13), "container_teal", math.pi / 2),
    ((29, 0, -28), "container_teal", 0.05),
    ((36, 0, -28), "container_red", -0.04),
    ((50, 0, -28), "container_navy", 0),
    ((50, 2.6, -28), "container_red", 0),
]


def build_materials() -> None:
    definitions = {
        "concrete": (0x77746E, 0.86, 0.02, None, 0.0),
        "concrete_warm": (0x9A8F80, 0.82, 0.02, None, 0.0),
        "asphalt": (0x252A2D, 0.94, 0.01, None, 0.0),
        "steel_navy": (0x1C2D35, 0.5, 0.72, None, 0.0),
        "steel_galvanized": (0x6A7375, 0.48, 0.68, None, 0.0),
        "rust": (0x8B4328, 0.72, 0.32, None, 0.0),
        "container_teal": (0x245B5C, 0.67, 0.28, None, 0.0),
        "container_red": (0x74372E, 0.69, 0.28, None, 0.0),
        "container_navy": (0x263D50, 0.62, 0.36, None, 0.0),
        "wood": (0x594331, 0.88, 0.02, None, 0.0),
        "plaster": (0xA79B88, 0.87, 0.01, None, 0.0),
        "roof": (0x2F3437, 0.76, 0.24, None, 0.0),
        "foliage": (0x334B32, 0.93, 0.0, None, 0.0),
        "foliage_light": (0x536044, 0.91, 0.0, None, 0.0),
        "safety": (0xC28A24, 0.63, 0.14, None, 0.0),
        "road_marking": (0xC6B98A, 0.78, 0.01, None, 0.0),
        "glass_warm": (0x5C4B38, 0.26, 0.08, 0xFFB45E, 1.25),
        "neon_cyan": (0x18474D, 0.3, 0.08, 0x41E8E0, 2.2),
        "neon_violet": (0x32263E, 0.3, 0.08, 0xB777FF, 2.0),
        "rubber": (0x151719, 0.9, 0.0, None, 0.0),
        "puddle": (0x243D48, 0.08, 0.18, None, 0.0),
        "boat_blue": (0x163746, 0.48, 0.22, None, 0.0),
        "boat_red": (0x6E2F26, 0.56, 0.18, None, 0.0),
        "boat_green": (0x24564E, 0.58, 0.16, None, 0.0),
        "glass_cool": (0x183E48, 0.16, 0.08, 0x3A8793, 0.35),
        "rope_beige": (0x8A7452, 0.92, 0.0, None, 0.0),
        "nav_red": (0x501714, 0.24, 0.04, 0xFF3B30, 2.2),
        "nav_green": (0x123D25, 0.24, 0.04, 0x37D66B, 2.2),
    }
    for name, values in definitions.items():
        MATERIALS[name] = create_pbr_material(name, *values)


def assign_zone(obj: bpy.types.Object, zone: str) -> bpy.types.Object:
    obj["harborZone"] = zone
    return obj


def mark_instance(obj: bpy.types.Object, key: str) -> bpy.types.Object:
    obj["instanceKey"] = key
    return obj


def mark_motion(obj: bpy.types.Object, key: str) -> bpy.types.Object:
    obj["ambientMotion"] = key
    return obj


def add_box(
    name: str,
    dimensions: tuple[float, float, float],
    position: tuple[float, float, float],
    material: str,
    zone: str,
    bevel: float = 0.04,
    rotation_y: float = 0.0,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=to_blender_position(position))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (dimensions[0], dimensions[2], dimensions[1])
    obj.rotation_euler[2] = -rotation_y
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        modifier = obj.modifiers.new("EdgeBevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(MATERIALS[material])
    return assign_zone(obj, zone)


def add_cylinder(
    name: str,
    radius: float,
    height: float,
    position: tuple[float, float, float],
    material: str,
    zone: str,
    vertices: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=height,
        location=to_blender_position(position),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(MATERIALS[material])
    return assign_zone(obj, zone)


def add_cone(
    name: str,
    radius: float,
    height: float,
    position: tuple[float, float, float],
    material: str,
    zone: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(
        vertices=10,
        radius1=radius,
        radius2=radius * 0.12,
        depth=height,
        location=to_blender_position(position),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(MATERIALS[material])
    return assign_zone(obj, zone)


def add_torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    position: tuple[float, float, float],
    material: str,
    zone: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=16,
        minor_segments=8,
        location=to_blender_position(position),
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(MATERIALS[material])
    return assign_zone(obj, zone)


def add_collision(
    name: str,
    dimensions: tuple[float, float, float],
    position: tuple[float, float, float],
    zone: str,
) -> bpy.types.Object:
    obj = add_box(name, dimensions, position, "concrete", zone, bevel=0)
    obj.display_type = "WIRE"
    obj.hide_render = True
    x, y, z = position
    width, height, depth = dimensions
    CINEMATIC_COLLISION_SPECS.append({
        "name": name,
        "min": {
            "x": x - width / 2,
            "y": y - height / 2,
            "z": z - depth / 2,
        },
        "max": {
            "x": x + width / 2,
            "y": y + height / 2,
            "z": z + depth / 2,
        },
    })
    return obj


def add_beam_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    thickness: float,
    material: str,
    zone: str,
) -> bpy.types.Object:
    start_blender = Vector(to_blender_position(start))
    end_blender = Vector(to_blender_position(end))
    direction = end_blender - start_blender
    midpoint = (start_blender + end_blender) * 0.5
    bpy.ops.mesh.primitive_cube_add(location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (thickness, thickness, direction.length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(MATERIALS[material])
    return assign_zone(obj, zone)


def add_custom_mesh(
    name: str,
    vertices_three: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: str,
    zone: str,
    bevel_width: float = 0.0,
) -> bpy.types.Object:
    vertices = [to_blender_position(vertex) for vertex in vertices_three]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(MATERIALS[material])

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.03)
    bpy.ops.object.mode_set(mode="OBJECT")
    if bevel_width > 0:
        bevel = obj.modifiers.new("CustomBevel", "BEVEL")
        bevel.width = bevel_width
        bevel.segments = 2
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return assign_zone(obj, zone)


def rotate_offset(
    origin: tuple[float, float, float],
    offset: tuple[float, float, float],
    rotation_y: float,
) -> tuple[float, float, float]:
    x, y, z = origin
    ox, oy, oz = offset
    return (
        x + ox * math.cos(rotation_y) + oz * math.sin(rotation_y),
        y + oy,
        z - ox * math.sin(rotation_y) + oz * math.cos(rotation_y),
    )


def add_gable_roof(
    name: str,
    width: float,
    depth: float,
    rise: float,
    position: tuple[float, float, float],
    zone: str,
) -> bpy.types.Object:
    x0, y0, z0 = position
    vertices_three = [
        (-width / 2, 0, -depth / 2),
        (width / 2, 0, -depth / 2),
        (-width / 2, 0, depth / 2),
        (width / 2, 0, depth / 2),
        (-width / 2, rise, 0),
        (width / 2, rise, 0),
    ]
    vertices = [
        to_blender_position((x0 + x, y0 + y, z0 + z))
        for x, y, z in vertices_three
    ]
    faces = [
        (0, 1, 3, 2),
        (0, 4, 5, 1),
        (2, 3, 5, 4),
        (0, 2, 4),
        (1, 5, 3),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(MATERIALS["roof"])
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.03)
    bpy.ops.object.mode_set(mode="OBJECT")
    bevel = obj.modifiers.new("RoofBevel", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    return assign_zone(obj, zone)


def build_base() -> None:
    zone = "base"
    add_box("MESH_BASE_ISLAND", (118, 1.6, 90), (4, -0.8, 2), "concrete", zone, 0.16)
    add_box("MESH_BASE_ASPHALT", (105, 0.12, 76), (7, 0.06, 0), "asphalt", zone, 0.02)
    add_box("MESH_BASE_RESIDENTIAL_SOIL", (30, 0.16, 25), (-40, 0.12, 31), "foliage", zone, 0.04)
    add_box("MESH_BASE_DOCK", (72, 0.3, 9), (15, 0.22, 38), "wood", zone, 0.03)

    for name, dims, pos in (
        ("MESH_SEAWALL_N", (119, 2.2, 0.8), (4, -0.3, -43)),
        ("MESH_SEAWALL_S", (119, 2.2, 0.8), (4, -0.3, 47)),
        ("MESH_SEAWALL_W", (0.8, 2.2, 90), (-55, -0.3, 2)),
        ("MESH_SEAWALL_E", (0.8, 2.2, 90), (63, -0.3, 2)),
    ):
        add_box(name, dims, pos, "concrete_warm", zone, 0.08)

    for x in range(-52, 64, 5):
        for z in (-43, 47):
            mark_instance(
                add_cylinder(f"MESH_RAIL_POST_{x}_{z}", 0.045, 1.25, (x, 1.2, z), "steel_navy", zone, 8),
                "seawall-rail-post",
            )
    for z in range(-40, 48, 5):
        for x in (-55, 63):
            mark_instance(
                add_cylinder(f"MESH_RAIL_POST_{x}_{z}", 0.045, 1.25, (x, 1.2, z), "steel_navy", zone, 8),
                "seawall-rail-post",
            )
    for y in (1.0, 1.55):
        add_box(f"MESH_RAIL_N_{y}", (117, 0.06, 0.06), (4, y, -43), "steel_navy", zone, 0.015)
        add_box(f"MESH_RAIL_S_{y}", (117, 0.06, 0.06), (4, y, 47), "steel_navy", zone, 0.015)
        add_box(f"MESH_RAIL_W_{y}", (0.06, 0.06, 88), (-55, y, 2), "steel_navy", zone, 0.015)
        add_box(f"MESH_RAIL_E_{y}", (0.06, 0.06, 88), (63, y, 2), "steel_navy", zone, 0.015)

    # Road loop and crossings.
    add_box("MESH_ROAD_EAST", (7, 0.05, 70), (28, 0.16, 2), "asphalt", zone, 0)
    add_box("MESH_ROAD_NORTH", (92, 0.05, 7), (7, 0.16, -23), "asphalt", zone, 0)
    add_box("MESH_ROAD_SOUTH", (88, 0.05, 7), (6, 0.16, 24), "asphalt", zone, 0)
    for x in range(-35, 48, 7):
        add_box(f"MESH_LANE_N_{x}", (3.2, 0.018, 0.16), (x, 0.2, -23), "road_marking", zone, 0)
    for z in range(-18, 39, 7):
        add_box(f"MESH_LANE_E_{z}", (0.16, 0.018, 3.2), (28, 0.2, z), "road_marking", zone, 0)
    for i in range(8):
        add_box(f"MESH_CROSSWALK_{i}", (0.65, 0.02, 4), (-6 + i * 1.45, 0.21, 21), "road_marking", zone, 0)


def add_container(
    index: int,
    position: tuple[float, float, float],
    material: str,
    rotation_y: float = 0.0,
) -> None:
    zone = "container-yard"
    x, y, z = position
    add_box(f"MESH_CONTAINER_BODY_{index}", (6.2, 2.5, 2.4), (x, y + 1.25, z), material, zone, 0.07, rotation_y)
    for rib in range(9):
        offset = -2.75 + rib * 0.69
        if abs(rotation_y) < 0.1:
            rib_pos = (x + offset, y + 1.25, z)
            rib_dims = (0.055, 2.25, 2.44)
        else:
            rib_pos = (x, y + 1.25, z + offset)
            rib_dims = (2.44, 2.25, 0.055)
        add_box(f"MESH_CONTAINER_RIB_{index}_{rib}", rib_dims, rib_pos, "steel_navy", zone, 0.01)
    add_box(f"MESH_CONTAINER_TOP_{index}", (6.32, 0.1, 2.52), (x, y + 2.52, z), "steel_galvanized", zone, 0.02, rotation_y)
    # Door seam, locking rods and ID plate make the end read as a shipping
    # container rather than a ribbed rectangular block.
    door_end = rotate_offset(position, (3.13, 1.25, 0), rotation_y)
    add_box(f"MESH_CONTAINER_DOOR_SEAM_{index}", (0.07, 2.28, 0.055), door_end, "steel_navy", zone, 0.008, rotation_y)
    for side in (-0.58, 0.58):
        add_box(
            f"MESH_CONTAINER_LOCK_ROD_{index}_{side:+}",
            (0.09, 2.05, 0.055),
            rotate_offset(position, (3.17, 1.25, side), rotation_y),
            "steel_galvanized", zone, 0.008, rotation_y,
        )
    add_box(
        f"MESH_CONTAINER_ID_PLATE_{index}", (0.045, 0.34, 0.55),
        rotate_offset(position, (3.19, 0.62, -0.55), rotation_y),
        "safety", zone, 0.012, rotation_y,
    )


def build_container_yard() -> None:
    for index, (position, material, rotation) in enumerate(CONTAINER_LAYOUTS):
        add_container(index, position, material, rotation)

    add_box("MESH_YARD_OFFICE", (7, 3.2, 5), (55, 1.6, -2), "steel_navy", "container-yard", 0.12)
    add_box("MESH_YARD_OFFICE_WINDOW", (4.5, 1.3, 0.08), (55, 1.9, 0.54), "glass_warm", "container-yard", 0.015)
    add_box("MESH_FORKLIFT_BODY", (1.8, 0.7, 1.3), (49, 0.5, -5), "safety", "container-yard", 0.1)
    add_box("MESH_FORKLIFT_CAB", (1.3, 1.5, 1.1), (49, 1.45, -5), "steel_navy", "container-yard", 0.05)
    for x in (48.35, 49.65):
        add_cylinder(f"MESH_FORKLIFT_WHEEL_{x}", 0.34, 0.25, (x, 0.35, -5.65), "rubber", "container-yard", 12)

    # Operational clutter is concentrated along edges so the driving lane and
    # Hunter route stay readable. These objects are batched by material/zone.
    for index, (x, z, rotation) in enumerate(((25, -8, 0.08), (25, -12, -0.12), (58, -24, 0.04))):
        add_box(f"MESH_YARD_PALLET_{index}", (1.5, 0.16, 1.15), (x, 0.08, z), "wood", "container-yard", 0.02, rotation)
        add_box(f"MESH_YARD_CARGO_{index}", (1.18, 0.72, 0.92), (x, 0.52, z), "concrete_warm", "container-yard", 0.045, rotation)
    for index, (x, z) in enumerate(((26, -4), (43, -26), (58, -7))):
        reel = add_cylinder(f"MESH_YARD_CABLE_REEL_{index}", 0.62, 0.72, (x, 0.62, z), "wood", "container-yard", 14)
        reel.rotation_euler[1] = math.pi / 2
        add_cylinder(f"MESH_YARD_CABLE_HUB_{index}", 0.25, 0.82, (x, 0.62, z), "rubber", "container-yard", 12).rotation_euler[1] = math.pi / 2
    for index, (x, z) in enumerate(((29, -5), (33, -5), (45, -10), (52, -22))):
        add_box(f"MESH_YARD_BARRIER_{index}", (2.4, 0.18, 0.18), (x, 0.82, z), "safety", "container-yard", 0.025)
        for side in (-1, 1):
            add_box(f"MESH_YARD_BARRIER_LEG_{index}_{side:+}", (0.12, 1.5, 0.12), (x + side, 0.75, z), "steel_galvanized", "container-yard", 0.018)


def build_construction() -> None:
    zone = "construction"
    add_box("MESH_CONSTRUCTION_SLAB", (24, 0.24, 24), (-35, 0.12, -22), "concrete_warm", zone, 0.04)
    for x in (-42, -36, -30):
        for z in (-29, -22, -15):
            add_box(f"MESH_FRAME_COLUMN_{x}_{z}", (0.42, 8.5, 0.42), (x, 4.25, z), "steel_navy", zone, 0.04)
    for y in (3.2, 6.3):
        add_box(f"MESH_FRAME_FLOOR_{y}", (13, 0.38, 14), (-36, y, -22), "concrete", zone, 0.05)
        for z in (-29, -15):
            add_box(f"MESH_FRAME_BEAM_{y}_{z}", (14, 0.34, 0.34), (-36, y + 0.4, z), "rust", zone, 0.03)

    # Scaffold and stairs.
    for x in (-46, -42):
        for z in (-17, -13):
            add_cylinder(f"MESH_SCAFFOLD_{x}_{z}", 0.07, 8, (x, 4, z), "safety", zone, 10)
    for y in (2.5, 5.0, 7.5):
        add_box(f"MESH_SCAFFOLD_DECK_{y}", (4.5, 0.16, 4.5), (-44, y, -15), "wood", zone, 0.03)

    # Tower crane.
    add_box("MESH_CRANE_MAST", (1.0, 27, 1.0), (-48, 13.5, -31), "safety", zone, 0.06)
    add_box("MESH_CRANE_BOOM", (29, 0.7, 0.9), (-35, 26.5, -31), "safety", zone, 0.05)
    add_box("MESH_CRANE_COUNTER", (4, 1.3, 1.7), (-49, 25.5, -31), "concrete", zone, 0.08)
    add_cylinder("MESH_CRANE_CABLE", 0.025, 12, (-23, 20.5, -31), "steel_navy", zone, 8)
    add_box("MESH_CRANE_HOOK", (0.45, 0.7, 0.3), (-23, 14.2, -31), "rust", zone, 0.08)


def build_residential() -> None:
    zone = "residential"
    hx, hz = -35, 22
    add_box("MESH_HOUSE_FOUNDATION", (12, 0.45, 10), (hx, 0.22, hz), "concrete", zone, 0.08)
    add_box("MESH_HOUSE_FLOOR_1", (10, 0.22, 8), (hx, 0.45, hz), "wood", zone, 0.04)
    add_box("MESH_HOUSE_FLOOR_2", (10, 0.22, 8), (hx, 4.65, hz), "wood", zone, 0.04)
    add_box("MESH_HOUSE_WALL_BACK", (10, 8.5, 0.35), (hx, 4.5, hz - 4), "plaster", zone, 0.06)
    add_box("MESH_HOUSE_WALL_LEFT", (0.35, 8.5, 8), (hx - 5, 4.5, hz), "plaster", zone, 0.06)
    add_box("MESH_HOUSE_WALL_RIGHT", (0.35, 8.5, 8), (hx + 5, 4.5, hz), "plaster", zone, 0.06)
    add_box("MESH_HOUSE_WALL_FRONT_L", (3.5, 8.5, 0.35), (hx - 3.25, 4.5, hz + 4), "plaster", zone, 0.06)
    add_box("MESH_HOUSE_WALL_FRONT_R", (3.5, 8.5, 0.35), (hx + 3.25, 4.5, hz + 4), "plaster", zone, 0.06)
    add_box("MESH_HOUSE_WALL_FRONT_HEADER", (3, 5.6, 0.35), (hx, 5.7, hz + 4), "plaster", zone, 0.06)
    add_gable_roof("MESH_HOUSE_GABLE", 12, 10, 3.2, (hx, 8.75, hz), zone)
    add_box("MESH_HOUSE_PORCH", (9, 0.3, 3.2), (hx, 0.45, hz + 5.2), "wood", zone, 0.05)
    for floor_y in (2.4, 6.2):
        for x in (hx - 3.2, hx + 3.2):
            add_box(f"MESH_HOUSE_WINDOW_{x}_{floor_y}", (2.0, 1.7, 0.1), (x, floor_y, hz + 4.06), "glass_warm", zone, 0.03)
    add_box("MESH_HOUSE_DOOR_OPEN", (1.7, 2.7, 0.16), (hx + 1.45, 1.55, hz + 3.25), "wood", zone, 0.04, math.pi / 2)
    add_box("MESH_HOUSE_CHIMNEY", (1.1, 4.1, 1.1), (hx + 4, 10, hz - 1.8), "rust", zone, 0.08)

    # Raised garden beds and greenhouse.
    for i, z in enumerate((34, 38, 42)):
        add_box(f"MESH_GARDEN_BED_{i}", (7, 0.55, 1.8), (-48, 0.35, z), "wood", zone, 0.04)
        add_box(f"MESH_GARDEN_SOIL_{i}", (6.5, 0.16, 1.35), (-48, 0.68, z), "foliage", zone, 0.02)
    add_box("MESH_GREENHOUSE_FRAME", (6.5, 3.2, 5), (-25, 1.6, 38), "steel_galvanized", zone, 0.04)
    for x, z, scale in ((-52, 29, 1.0), (-49, 24, 1.2), (-24, 31, 0.9), (-21, 39, 1.05)):
        add_cylinder(f"IMPACT_FOLIAGE_TREE_TRUNK_{x}_{z}", 0.24 * scale, 4.8 * scale, (x, 2.4 * scale, z), "wood", zone, 10)
        for cluster in range(3):
            angle = cluster * math.tau / 3
            bpy.ops.mesh.primitive_ico_sphere_add(
                subdivisions=2,
                radius=1.7 * scale,
                location=to_blender_position(
                    (
                        x + math.cos(angle) * 0.7 * scale,
                        5.2 * scale + (cluster % 2) * 0.45,
                        z + math.sin(angle) * 0.7 * scale,
                    )
                ),
            )
            canopy = bpy.context.object
            canopy.name = f"IMPACT_FOLIAGE_TREE_CANOPY_{x}_{z}_{cluster}"
            canopy.data.materials.append(MATERIALS["foliage" if cluster % 2 == 0 else "foliage_light"])
            assign_zone(canopy, zone)


def build_hunter_spawn() -> None:
    zone = "hunter-spawn"
    x, z = -42, 0
    add_box("MESH_HUNTER_SPAWN_SLAB", (15, 0.3, 15), (x, 0.15, z), "concrete", zone, 0.06)
    add_box("MESH_HUNTER_CAGE_WEST", (0.3, 4.2, 15), (x - 7, 2.1, z), "steel_navy", zone, 0.03)
    add_box("MESH_HUNTER_CAGE_BACK", (14, 4.2, 0.3), (x, 2.1, z - 7), "steel_navy", zone, 0.03)
    add_box("MESH_HUNTER_CAGE_FRONT", (14, 4.2, 0.3), (x, 2.1, z + 7), "steel_navy", zone, 0.03)
    gate = add_box(
        "MESH_HUNTER_GATE", (0.3, 4.2, 14), (x + 7, 2.1, z),
        "rust", zone, 0.03,
    )
    gate["gameplayRole"] = "hunterGate"
    add_box("MESH_HUNTER_GATE_HEADER", (0.45, 0.6, 14.5), (x + 7, 4.45, z), "steel_navy", zone, 0.04)
    add_box("MESH_HUNTER_SIGN", (0.16, 1.2, 4.5), (x + 7.18, 5.25, z), "neon_violet", zone, 0.03)


def build_boat_hull(
    name: str,
    origin: tuple[float, float, float],
    rotation_y: float,
    length: float,
    width: float,
    height: float,
    material: str,
    motion_key: str,
) -> None:
    sections = [
        (-length / 2, 0.82, -height * 0.5),
        (0.0, 1.0, -height * 0.58),
        (length / 2, 0.16, -height * 0.25),
    ]
    local_vertices: list[tuple[float, float, float]] = []
    for section_x, width_scale, bottom_y in sections:
        half_width = width * width_scale / 2
        local_vertices.extend([
            (section_x, height * 0.45, -half_width),
            (section_x, height * 0.45, half_width),
            (section_x, bottom_y, -half_width * 0.55),
            (section_x, bottom_y, half_width * 0.55),
        ])
    vertices = [
        rotate_offset(origin, vertex, rotation_y)
        for vertex in local_vertices
    ]
    faces = [
        (0, 4, 5, 1), (4, 8, 9, 5),
        (2, 3, 7, 6), (6, 7, 11, 10),
        (0, 2, 6, 4), (4, 6, 10, 8),
        (1, 5, 7, 3), (5, 9, 11, 7),
        (0, 1, 3, 2), (8, 10, 11, 9),
    ]
    hull = add_custom_mesh(
        f"MESH_{name}_HULL",
        vertices,
        faces,
        material,
        "boats",
        0.05,
    )
    mark_motion(hull, motion_key)


def build_workboat(
    name: str,
    origin: tuple[float, float, float],
    rotation_y: float,
) -> None:
    motion = f"boat-{name.lower()}"
    build_boat_hull(name, origin, rotation_y, 10.5, 3.5, 1.6, "boat_blue", motion)
    deck = mark_motion(add_box(
        f"MESH_{name}_DECK", (7.2, 0.22, 2.7),
        rotate_offset(origin, (-0.8, 0.55, 0), rotation_y),
        "wood", "boats", 0.05, rotation_y,
    ), motion)
    cabin_local = [
        (-2.9, 0.55, -1.27), (-2.9, 0.55, 1.27),
        (0.5, 0.55, -1.27), (0.5, 0.55, 1.27),
        (-2.6, 2.75, -1.18), (-2.6, 2.75, 1.18),
        (0.12, 2.75, -1.08), (0.12, 2.75, 1.08),
    ]
    cabin = add_custom_mesh(
        f"MESH_{name}_CABIN",
        [rotate_offset(origin, vertex, rotation_y) for vertex in cabin_local],
        [
            (0, 2, 3, 1), (4, 5, 7, 6),
            (0, 4, 6, 2), (1, 3, 7, 5),
            (0, 1, 5, 4), (2, 6, 7, 3),
        ],
        "plaster",
        "boats",
        0.06,
    )
    mark_motion(cabin, motion)
    roof = mark_motion(add_box(
        f"MESH_{name}_CABIN_ROOF", (3.8, 0.22, 2.9),
        rotate_offset(origin, (-1.2, 2.85, 0), rotation_y),
        "roof", "boats", 0.07, rotation_y,
    ), motion)
    for side in (-1, 1):
        window = mark_motion(add_box(
            f"MESH_{name}_WINDOW_{side:+}", (2.1, 0.75, 0.07),
            rotate_offset(origin, (-1.0, 1.95, side * 1.3), rotation_y),
            "glass_cool", "boats", 0.02, rotation_y,
        ), motion)
        window["boatPart"] = "window"
    mark_motion(add_box(
        f"MESH_{name}_FRONT_WINDOW", (0.08, 0.75, 1.85),
        rotate_offset(origin, (0.52, 1.95, 0), rotation_y),
        "glass_cool", "boats", 0.02, rotation_y,
    ), motion)
    mark_motion(add_box(
        f"MESH_{name}_CABIN_DOOR", (0.9, 1.8, 0.08),
        rotate_offset(origin, (-2.45, 1.55, -1.31), rotation_y),
        "steel_navy", "boats", 0.03, rotation_y,
    ), motion)
    mast_start = rotate_offset(origin, (0.8, 0.65, 0), rotation_y)
    mast_end = rotate_offset(origin, (0.8, 5.0, 0), rotation_y)
    mast = add_beam_between(
        f"MESH_{name}_MAST", mast_start, mast_end, 0.09,
        "steel_galvanized", "boats",
    )
    mark_motion(mast, motion)
    for side in (-1, 1):
        rail_start = rotate_offset(origin, (1.0, 1.05, side * 1.45), rotation_y)
        rail_end = rotate_offset(origin, (4.1, 1.05, side * 0.55), rotation_y)
        mark_motion(add_beam_between(
            f"MESH_{name}_RAIL_{side:+}", rail_start, rail_end, 0.055,
            "steel_galvanized", "boats",
        ), motion)
        stripe_start = rotate_offset(origin, (-4.5, 0.1, side * 1.45), rotation_y)
        stripe_end = rotate_offset(origin, (3.8, 0.1, side * 0.72), rotation_y)
        mark_motion(add_beam_between(
            f"MESH_{name}_WATERLINE_{side:+}", stripe_start, stripe_end, 0.09,
            "plaster", "boats",
        ), motion)
    exhaust_start = rotate_offset(origin, (-2.2, 2.65, 0.75), rotation_y)
    exhaust_end = rotate_offset(origin, (-2.2, 4.15, 0.75), rotation_y)
    mark_motion(add_beam_between(
        f"MESH_{name}_EXHAUST", exhaust_start, exhaust_end, 0.16,
        "rust", "boats",
    ), motion)
    radar_start = rotate_offset(origin, (0.8, 4.65, -0.7), rotation_y)
    radar_end = rotate_offset(origin, (0.8, 4.65, 0.7), rotation_y)
    mark_motion(add_beam_between(
        f"MESH_{name}_RADAR", radar_start, radar_end, 0.08,
        "steel_galvanized", "boats",
    ), motion)
    mark_motion(add_cylinder(
        f"MESH_{name}_BOW_WINCH", 0.34, 0.55,
        rotate_offset(origin, (3.35, 0.95, 0), rotation_y),
        "rust", "boats", 14,
    ), motion)
    life_ring = add_torus(
        f"MESH_{name}_LIFE_RING", 0.34, 0.1,
        rotate_offset(origin, (-2.3, 2.0, 1.38), rotation_y),
        "safety", "boats",
    )
    life_ring.rotation_euler[0] = math.pi / 2
    mark_motion(life_ring, motion)
    for index, (offset, material) in enumerate((
        ((-0.2, 3.0, -1.15), "nav_red"),
        ((-0.2, 3.0, 1.15), "nav_green"),
    )):
        mark_motion(add_box(
            f"MESH_{name}_NAV_LIGHT_{index}",
            (0.16, 0.16, 0.16),
            rotate_offset(origin, offset, rotation_y),
            material,
            "boats",
            0.04,
            rotation_y,
        ), motion)
    for index, offset in enumerate(((-1.8, 0.25, -1.65), (0.4, 0.25, -1.55), (-1.8, 0.25, 1.65), (0.4, 0.25, 1.55))):
        tire = add_torus(
            f"MESH_{name}_SIDE_FENDER_{index}",
            0.31,
            0.1,
            rotate_offset(origin, offset, rotation_y),
            "rubber",
            "boats",
        )
        tire.rotation_euler[0] = math.pi / 2
        mark_motion(tire, motion)
    deck["boatPart"] = "deck"
    cabin["boatPart"] = "cabin"
    roof["boatPart"] = "roof"


def build_skiff(
    name: str,
    origin: tuple[float, float, float],
    rotation_y: float,
    material: str,
) -> None:
    motion = f"boat-{name.lower()}"
    build_boat_hull(name, origin, rotation_y, 6.2, 2.15, 1.0, material, motion)
    for offset in (-1.2, 0.2, 1.45):
        mark_motion(add_box(
            f"MESH_{name}_BENCH_{offset:+}", (0.28, 0.22, 1.65),
            rotate_offset(origin, (offset, 0.48, 0), rotation_y),
            "wood", "boats", 0.03, rotation_y,
        ), motion)
    for side in (-1, 1):
        mark_motion(add_beam_between(
            f"MESH_{name}_GUNWALE_{side:+}",
            rotate_offset(origin, (-2.7, 0.68, side * 0.92), rotation_y),
            rotate_offset(origin, (2.65, 0.68, side * 0.5), rotation_y),
            0.08,
            "steel_galvanized",
            "boats",
        ), motion)
    mark_motion(add_box(
        f"MESH_{name}_OUTBOARD", (0.65, 1.0, 0.65),
        rotate_offset(origin, (-3.25, 0.25, 0), rotation_y),
        "steel_navy", "boats", 0.08, rotation_y,
    ), motion)
    rope = add_torus(
        f"MESH_{name}_ROPE_COIL", 0.24, 0.055,
        rotate_offset(origin, (1.7, 0.62, 0), rotation_y),
        "rope_beige", "boats",
    )
    mark_motion(rope, motion)


def populate_harbor_boats() -> None:
    build_workboat("WORKBOAT", (27, -0.1, 52), 0.18)
    build_skiff("SKIFF_WEST", (-34, -0.28, 52), -0.32, "boat_green")
    build_skiff("SKIFF_EAST", (48, -0.28, 55), 0.42, "boat_red")
    build_boat_hull(
        "BARGE", (2, -0.45, 59), -0.06, 14, 4.6, 1.15,
        "rust", "boat-barge",
    )
    for index, (x, material) in enumerate(((-2.3, "container_red"), (1.0, "container_navy"), (4.3, "container_teal"))):
        mark_motion(add_box(
            f"MESH_BARGE_CARGO_{index}", (3.0, 1.7, 3.4), (x, 0.65, 59),
            material, "boats", 0.06, -0.06,
        ), "boat-barge")


def build_dock_district() -> None:
    zone = "dock"
    # Dockside bar.
    add_box("MESH_BAR_FLOOR", (18, 0.22, 11), (0, 0.25, -35), "wood", zone, 0.04)
    add_box("MESH_BAR_BACK", (18, 5.8, 0.4), (0, 2.9, -40.5), "steel_navy", zone, 0.08)
    add_box("MESH_BAR_LEFT", (0.4, 5.8, 11), (-9, 2.9, -35), "steel_navy", zone, 0.08)
    add_box("MESH_BAR_RIGHT", (0.4, 5.8, 11), (9, 2.9, -35), "steel_navy", zone, 0.08)
    add_box("MESH_BAR_FRONT_L", (3.5, 5.8, 0.4), (-7.25, 2.9, -29.5), "steel_navy", zone, 0.08)
    add_box("MESH_BAR_FRONT_R", (3.5, 5.8, 0.4), (7.25, 2.9, -29.5), "steel_navy", zone, 0.08)
    add_box("MESH_BAR_FRONT_HEADER", (11, 1.5, 0.4), (0, 5.05, -29.5), "steel_navy", zone, 0.08)
    add_box("MESH_BAR_ROOF", (20, 0.5, 13), (0, 6, -35), "roof", zone, 0.12)
    for pane_x in (-7, 0, 7):
        add_box(f"MESH_BAR_FRONT_GLASS_{pane_x:+}", (4, 3.8, 0.12), (pane_x, 2.1, -29.45), "glass_warm", zone, 0.03)
    add_box("MESH_BAR_NEON", (9, 0.3, 0.15), (0, 5.1, -29.35), "neon_violet", zone, 0.03)
    for x in (-6, -2, 2, 6):
        add_cylinder(f"MESH_BAR_TABLE_{x}", 0.65, 0.14, (x, 0.85, -27), "wood", zone, 14)
        add_cylinder(f"MESH_BAR_TABLE_LEG_{x}", 0.09, 0.75, (x, 0.43, -27), "steel_navy", zone, 10)

    # Neon mart.
    add_box("MESH_MART_FLOOR", (14, 0.22, 10), (45, 0.25, -38), "concrete_warm", zone, 0.04)
    add_box("MESH_MART_BACK", (14, 5.2, 0.4), (45, 2.6, -43), "concrete_warm", zone, 0.08)
    add_box("MESH_MART_LEFT", (0.4, 5.2, 10), (38, 2.6, -38), "concrete_warm", zone, 0.08)
    add_box("MESH_MART_RIGHT", (0.4, 5.2, 10), (52, 2.6, -38), "concrete_warm", zone, 0.08)
    add_box("MESH_MART_FRONT_L", (2.5, 5.2, 0.4), (39.25, 2.6, -33), "concrete_warm", zone, 0.08)
    add_box("MESH_MART_FRONT_R", (2.5, 5.2, 0.4), (50.75, 2.6, -33), "concrete_warm", zone, 0.08)
    add_box("MESH_MART_FRONT_HEADER", (9, 1.2, 0.4), (45, 4.6, -33), "concrete_warm", zone, 0.08)
    add_box("MESH_MART_ROOF", (15, 0.45, 11), (45, 5.35, -38), "roof", zone, 0.1)
    add_box("MESH_MART_WINDOW_LEFT", (3.5, 2.8, 0.12), (42.25, 2.25, -32.95), "glass_warm", zone, 0.02)
    add_box("MESH_MART_WINDOW_RIGHT", (3.5, 2.8, 0.12), (47.75, 2.25, -32.95), "glass_warm", zone, 0.02)
    add_box("MESH_MART_DOOR_OPEN", (1.8, 2.8, 0.14), (46.1, 1.55, -33.8), "container_teal", zone, 0.03, math.pi / 2)
    add_box("MESH_MART_NEON", (10, 0.26, 0.14), (45, 4.7, -32.85), "neon_cyan", zone, 0.02)
    add_box("MESH_MART_AWNING", (12, 0.22, 2.2), (45, 4.15, -31.9), "container_teal", zone, 0.05)

    # Working pier and mooring equipment.
    for x in range(-18, 51, 6):
        mark_instance(
            add_cylinder(f"MESH_PIER_PILE_{x}", 0.19, 2.5, (x, -0.25, 42), "steel_navy", zone, 12),
            "pier-pile",
        )
    for x in range(-15, 48, 8):
        mark_instance(
            add_cylinder(f"MESH_BOLLARD_{x}", 0.22, 0.75, (x, 0.48, 39), "steel_galvanized", zone, 12),
            "dock-bollard",
        )
    for i, x in enumerate((16, 21, 34, 39)):
        mark_instance(
            add_cylinder(f"MESH_BUOY_{i}", 0.32, 0.8, (x, -0.35, 50 + (i % 2) * 3), "safety", zone, 12),
            "harbor-buoy",
        )


def build_dock_detail_pack() -> None:
    zone = "dock-detail"
    # Rubber fenders, mooring cleats and safety ladders along the working pier.
    for index, x in enumerate(range(-16, 49, 8)):
        fender = add_torus(
            f"MESH_DOCK_FENDER_{index}", 0.34, 0.11,
            (x, -0.08, 42.35), "rubber", zone,
        )
        fender.rotation_euler[0] = math.pi / 2
        mark_instance(fender, "dock-fender")
        mark_instance(add_box(
            f"MESH_MOORING_CLEAT_{index}", (0.42, 0.12, 0.18),
            (x + 1.8, 0.48, 40.8), "steel_galvanized", zone, 0.025,
        ), "mooring-cleat")

    for index, x in enumerate((-8, 24, 44)):
        for side in (-0.3, 0.3):
            add_box(
                f"MESH_DOCK_LADDER_RAIL_{index}_{side:+}",
                (0.07, 1.9, 0.07), (x + side, -0.05, 42.55),
                "safety", zone, 0.015,
            )
        for rung in range(5):
            add_box(
                f"MESH_DOCK_LADDER_RUNG_{index}_{rung}",
                (0.65, 0.055, 0.055), (x, -0.72 + rung * 0.36, 42.55),
                "safety", zone, 0.01,
            )

    # Pier market and information kiosk restore the populated waterfront.
    for index, (x, z, material) in enumerate((
        (5, 36, "container_red"),
        (13, 36, "container_teal"),
        (21, 36, "safety"),
        (29, 36, "neon_violet"),
    )):
        mark_instance(add_cylinder(
            f"MESH_PIER_TABLE_{index}", 0.72, 0.14,
            (x, 0.82, z), "wood", zone, 14,
        ), "pier-table")
        add_cylinder(
            f"MESH_PIER_UMBRELLA_POLE_{index}", 0.055, 2.5,
            (x, 1.3, z), "steel_galvanized", zone, 10,
        )
        umbrella = add_cone(
            f"MESH_PIER_UMBRELLA_{index}", 1.35, 0.45,
            (x, 2.55, z), material, zone,
        )
        mark_instance(umbrella, f"pier-umbrella-{material}")
        for chair_index, (dx, dz) in enumerate(((-1.05, 0), (1.05, 0), (0, -1.05), (0, 1.05))):
            chair_x = x + dx
            chair_z = z + dz
            back_x = chair_x + (0.28 if dx > 0 else -0.28 if dx < 0 else 0)
            back_z = chair_z + (0.28 if dz > 0 else -0.28 if dz < 0 else 0)
            mark_instance(add_box(
                f"MESH_PIER_CHAIR_SEAT_{index}_{chair_index}",
                (0.55, 0.12, 0.55),
                (chair_x, 0.48, chair_z),
                "wood", zone, 0.035,
            ), "pier-chair-seat")
            mark_instance(add_box(
                f"MESH_PIER_CHAIR_BACK_{index}_{chair_index}",
                (0.55 if dz != 0 else 0.1, 0.62, 0.1 if dz != 0 else 0.55),
                (back_x, 0.82, back_z),
                "wood", zone, 0.025,
            ), "pier-chair-back")
            for leg_index, (lx, lz) in enumerate(((-0.2, -0.2), (0.2, -0.2), (-0.2, 0.2), (0.2, 0.2))):
                mark_instance(add_box(
                    f"MESH_PIER_CHAIR_LEG_{index}_{chair_index}_{leg_index}",
                    (0.055, 0.45, 0.055),
                    (chair_x + lx, 0.23, chair_z + lz),
                    "steel_navy", zone, 0.01,
                ), "pier-chair-leg")

    add_box("MESH_PIER_KIOSK_BODY", (4.2, 3.2, 3.4), (39, 1.6, 36.2), "container_teal", zone, 0.1)
    add_box("MESH_PIER_KIOSK_WINDOW", (2.8, 1.35, 0.1), (39, 1.9, 34.45), "glass_warm", zone, 0.025)
    add_box("MESH_PIER_KIOSK_SIGN", (3.6, 0.45, 0.12), (39, 3.65, 34.4), "neon_cyan", zone, 0.03)

    for index, x in enumerate((-12, 18, 46)):
        life_ring = add_torus(
            f"MESH_DOCK_LIFE_RING_{index}", 0.38, 0.1,
            (x, 1.35, 42.1), "safety", zone,
        )
        life_ring.rotation_euler[0] = math.pi / 2
        mark_instance(life_ring, "dock-life-ring")

    # Fishing-net work area and compact loading davit.
    net_x = -4
    for side in (-1, 1):
        add_beam_between(
            f"MESH_NET_FRAME_{side:+}",
            (net_x + side * 1.7, 0.35, 40.0),
            (net_x + side * 1.7, 3.0, 40.0),
            0.09,
            "steel_galvanized",
            zone,
        )
    add_beam_between(
        "MESH_NET_FRAME_TOP",
        (net_x - 1.7, 3.0, 40.0),
        (net_x + 1.7, 3.0, 40.0),
        0.09,
        "steel_galvanized",
        zone,
    )
    for line in range(7):
        mark_instance(add_beam_between(
            f"MESH_FISHING_NET_LINE_{line}",
            (net_x - 1.5 + line * 0.5, 0.45, 40.03),
            (net_x - 1.5 + line * 0.5, 2.85, 40.03),
            0.018,
            "rope_beige",
            zone,
        ), "fishing-net-line")
    add_beam_between(
        "MESH_DOCK_DAVIT_MAST",
        (47, 0.4, 40.5),
        (47, 5.2, 40.5),
        0.18,
        "safety",
        zone,
    )
    add_beam_between(
        "MESH_DOCK_DAVIT_ARM",
        (47, 5.1, 40.5),
        (43.5, 5.1, 42.0),
        0.16,
        "safety",
        zone,
    )


def build_garden_detail_pack() -> None:
    zone = "garden-detail"
    pond_x, pond_z = -48, 38
    add_torus("MESH_GARDEN_POND_RIM", 3.2, 0.28, (pond_x, 0.2, pond_z), "concrete_warm", zone)
    water = add_cylinder("IMPACT_WATER_GARDEN_POND", 3.0, 0.08, (pond_x, 0.22, pond_z), "container_teal", zone, 28)
    water["weaponImpactKind"] = "water"
    for index, angle in enumerate((0.3, 1.4, 2.7, 4.1, 5.4)):
        radius = 1.2 + (index % 2) * 0.55
        mark_instance(add_cylinder(
            f"MESH_LILY_PAD_{index}", 0.24, 0.025,
            (
                pond_x + math.cos(angle) * radius,
                0.29,
                pond_z + math.sin(angle) * radius,
            ),
            "foliage_light", zone, 12,
        ), "lily-pad")
    for index, (x, z, scale) in enumerate((
        (-53, 34, 0.9), (-43.5, 40.5, 0.7), (-51, 43, 0.6),
        (-44, 34.5, 0.8),
    )):
        rock = add_cylinder(
            f"MESH_GARDEN_ROCK_{index}", 0.65 * scale, 0.8 * scale,
            (x, 0.38 * scale, z), "concrete", zone, 9,
        )
        rock.scale.x = 1.4
        rock.rotation_euler[2] = index * 0.37
    add_cylinder("MESH_PATIO_TABLE", 0.8, 0.14, (-42, 0.82, 32), "wood", zone, 14)
    add_cylinder("MESH_PATIO_UMBRELLA_POLE", 0.055, 2.6, (-42, 1.3, 32), "steel_galvanized", zone, 10)
    add_cone("MESH_PATIO_UMBRELLA", 1.45, 0.5, (-42, 2.65, 32), "container_red", zone)


def build_construction_detail_pack() -> None:
    zone = "construction-detail"
    add_cylinder("MESH_CONSTRUCTION_SILO", 2.1, 8.0, (-48, 4, -22), "concrete_warm", zone, 24)
    add_cylinder("MESH_CONSTRUCTION_SILO_CAP", 2.25, 0.28, (-48, 8.12, -22), "steel_galvanized", zone, 24)
    for rung in range(20):
        add_box(
            f"MESH_SILO_LADDER_{rung:02}", (0.55, 0.05, 0.05),
            (-45.95, 0.25 + rung * 0.4, -22), "safety", zone, 0.01,
        )
    for index, z in enumerate(range(-31, -11, 3)):
        mark_instance(add_box(
            f"MESH_CONSTRUCTION_FENCE_{index}", (0.08, 2.2, 2.8),
            (-23.4, 1.1, z), "steel_galvanized", zone, 0.015,
        ), "construction-fence-panel")
    for index, x in enumerate((-42, -39, -33, -29)):
        for bar in range(4):
            mark_instance(add_cylinder(
                f"MESH_REBAR_{index}_{bar}", 0.035, 2.2,
                (x + bar * 0.16, 1.1, -12.5), "rust", zone, 8,
            ), "construction-rebar")
    add_box("MESH_CONSTRUCTION_SIGN", (3.2, 1.4, 0.14), (-35, 2.4, -10.5), "safety", zone, 0.04)
    for index, (x, z, rotation) in enumerate(((-27, -28, 0.05), (-31, -12, -0.08), (-45, -30, 0.02))):
        add_box(f"MESH_FORMWORK_STACK_{index}", (3.2, 0.7, 1.15), (x, 0.35, z), "wood", zone, 0.035, rotation)
        for strap in (-0.9, 0.9):
            add_box(f"MESH_FORMWORK_STRAP_{index}_{strap:+}", (0.12, 0.74, 1.18), (x + strap, 0.36, z), "steel_galvanized", zone, 0.012, rotation)
    for index, (x, z) in enumerate(((-26, -17), (-43, -26))):
        add_box(f"MESH_CEMENT_PALLET_{index}", (1.7, 0.15, 1.2), (x, 0.08, z), "wood", zone, 0.02)
        for layer in range(3):
            add_box(
                f"MESH_CEMENT_BAGS_{index}_{layer}",
                (1.45, 0.22, 0.95), (x, 0.25 + layer * 0.22, z),
                "concrete_warm", zone, 0.04, (layer % 2) * 0.08,
            )
    for index, (x, z) in enumerate(((-27, -20), (-46, -13))):
        add_box(f"MESH_WORK_LIGHT_TRIPOD_{index}", (0.12, 2.1, 0.12), (x, 1.05, z), "steel_navy", zone, 0.018)
        add_box(f"MESH_WORK_LIGHT_HEAD_{index}", (0.75, 0.5, 0.22), (x, 2.15, z), "glass_warm", zone, 0.035)


def build_restored_landmarks() -> None:
    zone = "restored-landmarks"
    # Watchtower matches the detached procedural collider route.
    tower_x, tower_z = 40, 30
    for dx in (-1.5, 1.5):
        for dz in (-1.5, 1.5):
            add_box(
                f"MESH_WATCHTOWER_LEG_{dx:+}_{dz:+}", (0.25, 6, 0.25),
                (tower_x + dx, 3, tower_z + dz), "steel_navy", zone, 0.025,
            )
    add_box("MESH_WATCHTOWER_PLATFORM", (4, 0.18, 4), (tower_x, 6, tower_z), "steel_galvanized", zone, 0.04)
    add_cone("MESH_WATCHTOWER_ROOF", 3.0, 1.5, (tower_x, 7.5, tower_z), "container_red", zone)
    for rung in range(15):
        add_box(
            f"MESH_WATCHTOWER_LADDER_{rung:02}", (0.62, 0.05, 0.05),
            (tower_x + 1.8, 0.22 + rung * 0.4, tower_z),
            "safety", zone, 0.01,
        )

    # Gazebo restores a secondary dock landmark and hide route.
    gazebo_x, gazebo_z = 5, 30
    add_box("MESH_GAZEBO_FLOOR", (4.5, 0.18, 4.5), (gazebo_x, 0.1, gazebo_z), "wood", zone, 0.04)
    for dx in (-2, 2):
        for dz in (-2, 2):
            add_cylinder(
                f"MESH_GAZEBO_POST_{dx:+}_{dz:+}", 0.09, 3.0,
                (gazebo_x + dx, 1.5, gazebo_z + dz), "wood", zone, 10,
            )
    add_cone("MESH_GAZEBO_ROOF", 3.4, 1.4, (gazebo_x, 3.6, gazebo_z), "roof", zone)


def build_ferris_support() -> None:
    zone = "ferris-static"
    x, z, hub_y = -10, 34, 12
    add_box("MESH_FERRIS_PLATFORM", (14, 0.35, 10), (x, 0.18, z), "concrete_warm", zone, 0.08)
    for z_offset in (-2.2, 2.2):
        add_beam_between(
            f"MESH_FERRIS_LEG_L_{z_offset}",
            (x - 3.4, 0.35, z + z_offset),
            (x - 0.7, hub_y, z + z_offset),
            0.48,
            "steel_navy",
            zone,
        )
        add_beam_between(
            f"MESH_FERRIS_LEG_R_{z_offset}",
            (x + 3.4, 0.35, z + z_offset),
            (x + 0.7, hub_y, z + z_offset),
            0.48,
            "steel_navy",
            zone,
        )
        add_box(
            f"MESH_FERRIS_HUB_SUPPORT_{z_offset}",
            (3.0, 0.55, 0.55),
            (x, hub_y, z + z_offset),
            "rust",
            zone,
            0.06,
        )
    ticket_x = x - 8.5
    ticket_z = z - 2.8
    add_box("MESH_FERRIS_TICKET_FLOOR", (4.5, 0.2, 3.2), (ticket_x, 0.1, ticket_z), "wood", zone, 0.03)
    add_box("MESH_FERRIS_TICKET_ROOF", (4.8, 0.25, 3.5), (ticket_x, 3.42, ticket_z), "roof", zone, 0.06)
    add_box("MESH_FERRIS_TICKET_BACK", (4.5, 3.4, 0.2), (ticket_x, 1.7, ticket_z - 1.6), "steel_navy", zone, 0.04)
    add_box("MESH_FERRIS_TICKET_LEFT", (0.2, 3.4, 3.2), (ticket_x - 2.25, 1.7, ticket_z), "steel_navy", zone, 0.04)
    add_box("MESH_FERRIS_TICKET_RIGHT", (0.2, 3.4, 3.2), (ticket_x + 2.25, 1.7, ticket_z), "steel_navy", zone, 0.04)
    add_box("MESH_FERRIS_TICKET_FRONT_L", (1.2, 3.4, 0.2), (ticket_x - 1.65, 1.7, ticket_z + 1.6), "steel_navy", zone, 0.04)
    add_box("MESH_FERRIS_TICKET_FRONT_R", (1.2, 3.4, 0.2), (ticket_x + 1.65, 1.7, ticket_z + 1.6), "steel_navy", zone, 0.04)
    add_box("MESH_FERRIS_TICKET_HEADER", (2.1, 0.7, 0.2), (ticket_x, 3.05, ticket_z + 1.6), "steel_navy", zone, 0.04)
    add_box("MESH_FERRIS_TICKET_WINDOW", (1.0, 1.25, 0.08), (ticket_x - 1.65, 2.0, ticket_z + 1.71), "glass_warm", zone, 0.02)
    add_box("MESH_FERRIS_SIGN", (5.2, 0.6, 0.16), (x - 8.5, 4.0, z - 1.1), "neon_violet", zone, 0.04)


def build_cinematic_collisions() -> None:
    """Thin shell colliders for V2-only architecture and explicit door gaps."""
    zone = "cinematic-collision"

    # Match the visible cinematic containers exactly. The legacy container
    # fence/colliders are intentionally not carried over because their meshes
    # are absent from the V2 scene and otherwise create invisible walls.
    for index, (position, _material, rotation_y) in enumerate(CONTAINER_LAYOUTS):
        x, y, z = position
        width = abs(6.2 * math.cos(rotation_y)) + abs(2.4 * math.sin(rotation_y))
        depth = abs(6.2 * math.sin(rotation_y)) + abs(2.4 * math.cos(rotation_y))
        add_collision(
            f"COL_MOVE_CINE_CONTAINER_{index:02}",
            (width, 2.5, depth),
            (x, y + 1.25, z),
            zone,
        )
    add_collision(
        "COL_MOVE_CINE_FORKLIFT",
        (1.8, 2.2, 1.5),
        (49, 1.1, -5),
        zone,
    )

    # The unfinished concrete frame is authored as separate visual columns.
    # Mirror those footprints with movement colliders so players cannot walk
    # through the structure while preserving the open bays between columns.
    construction_column_index = 0
    for x in (-42, -36, -30):
        for z in (-29, -22, -15):
            add_collision(
                f"COL_MOVE_CINE_CONSTRUCTION_COLUMN_{construction_column_index:02}",
                (0.42, 8.5, 0.42),
                (x, 4.25, z),
                zone,
            )
            construction_column_index += 1

    # The east face is the gameplay-controlled gate and deliberately remains
    # collider-free here. Its open/closed state is managed by the game.
    for name, dimensions, position in (
        ("COL_MOVE_CINE_HUNTER_SPAWN_WEST", (0.3, 4.2, 15), (-49, 2.1, 0)),
        ("COL_MOVE_CINE_HUNTER_SPAWN_BACK", (14, 4.2, 0.3), (-42, 2.1, -7)),
        ("COL_MOVE_CINE_HUNTER_SPAWN_FRONT", (14, 4.2, 0.3), (-42, 2.1, 7)),
    ):
        add_collision(name, dimensions, position, zone)

    # Dockside Bar: three glazed wall sections with two door openings.
    for name, dimensions, position in (
        ("COL_MOVE_CINE_BAR_BACK", (18, 5.8, 0.4), (0, 2.9, -40.5)),
        ("COL_MOVE_CINE_BAR_LEFT", (0.4, 5.8, 11), (-9, 2.9, -35)),
        ("COL_MOVE_CINE_BAR_RIGHT", (0.4, 5.8, 11), (9, 2.9, -35)),
        ("COL_MOVE_CINE_BAR_FRONT_LEFT", (4, 5.8, 0.3), (-7, 2.9, -29.5)),
        ("COL_MOVE_CINE_BAR_FRONT_CENTER", (4, 5.8, 0.3), (0, 2.9, -29.5)),
        ("COL_MOVE_CINE_BAR_FRONT_RIGHT", (4, 5.8, 0.3), (7, 2.9, -29.5)),
    ):
        add_collision(name, dimensions, position, zone)

    # Neon Mart: central two-metre entrance remains unobstructed.
    for name, dimensions, position in (
        ("COL_MOVE_CINE_MART_BACK", (14, 5.2, 0.4), (45, 2.6, -43)),
        ("COL_MOVE_CINE_MART_LEFT", (0.4, 5.2, 10), (38, 2.6, -38)),
        ("COL_MOVE_CINE_MART_RIGHT", (0.4, 5.2, 10), (52, 2.6, -38)),
        ("COL_MOVE_CINE_MART_FRONT_EDGE_L", (2.5, 5.2, 0.3), (39.25, 2.6, -33)),
        ("COL_MOVE_CINE_MART_FRONT_WINDOW_L", (3.5, 5.2, 0.3), (42.25, 2.6, -33)),
        ("COL_MOVE_CINE_MART_FRONT_WINDOW_R", (3.5, 5.2, 0.3), (47.75, 2.6, -33)),
        ("COL_MOVE_CINE_MART_FRONT_EDGE_R", (2.5, 5.2, 0.3), (50.75, 2.6, -33)),
        ("COL_MOVE_CINE_MART_FRONT_HEADER", (2, 2.4, 0.3), (45, 4, -33)),
    ):
        add_collision(name, dimensions, position, zone)

    # Worker house shell: open center doorway on the front facade.
    for name, dimensions, position in (
        ("COL_MOVE_CINE_HOUSE_BACK", (10, 8.5, 0.35), (-35, 4.5, 18)),
        ("COL_MOVE_CINE_HOUSE_LEFT", (0.35, 8.5, 8), (-40, 4.5, 22)),
        ("COL_MOVE_CINE_HOUSE_RIGHT", (0.35, 8.5, 8), (-30, 4.5, 22)),
        ("COL_MOVE_CINE_HOUSE_FRONT_L", (3.5, 8.5, 0.35), (-38.25, 4.5, 26)),
        ("COL_MOVE_CINE_HOUSE_FRONT_R", (3.5, 8.5, 0.35), (-31.75, 4.5, 26)),
        ("COL_MOVE_CINE_HOUSE_FRONT_HEADER", (3, 5.6, 0.35), (-35, 5.7, 26)),
    ):
        add_collision(name, dimensions, position, zone)

    # Ferris ticket booth replaces the former solid box with a usable doorway.
    ticket_x = -18.5
    ticket_z = 31.2
    for name, dimensions, position in (
        ("COL_MOVE_CINE_TICKET_BACK", (4.5, 3.4, 0.2), (ticket_x, 1.7, ticket_z - 1.6)),
        ("COL_MOVE_CINE_TICKET_LEFT", (0.2, 3.4, 3.2), (ticket_x - 2.25, 1.7, ticket_z)),
        ("COL_MOVE_CINE_TICKET_RIGHT", (0.2, 3.4, 3.2), (ticket_x + 2.25, 1.7, ticket_z)),
        ("COL_MOVE_CINE_TICKET_FRONT_L", (1.2, 3.4, 0.2), (ticket_x - 1.65, 1.7, ticket_z + 1.6)),
        ("COL_MOVE_CINE_TICKET_FRONT_R", (1.2, 3.4, 0.2), (ticket_x + 1.65, 1.7, ticket_z + 1.6)),
        ("COL_MOVE_CINE_TICKET_HEADER", (2.1, 0.7, 0.2), (ticket_x, 3.05, ticket_z + 1.6)),
        ("COL_MOVE_CINE_YARD_OFFICE", (7, 3.2, 5), (55, 1.6, -2)),
        ("COL_MOVE_CINE_PIER_KIOSK", (4.2, 3.2, 3.4), (39, 1.6, 36.2)),
    ):
        add_collision(name, dimensions, position, zone)


def build_shared_props() -> None:
    zone = "shared-props"
    lamps = [
        (-24, 31), (0, 31), (24, 31), (53, 8), (53, -21),
        (-34, -10), (-15, 21), (11, 21), (35, 21),
    ]
    for index, (x, z) in enumerate(lamps):
        mark_instance(
            add_cylinder(f"MESH_LAMP_POST_{index}", 0.08, 5.5, (x, 2.75, z), "steel_navy", zone, 10),
            "street-lamp-post",
        )
        mark_instance(
            add_box(f"MESH_LAMP_ARM_{index}", (1.2, 0.1, 0.1), (x + 0.5, 5.35, z), "steel_navy", zone, 0.02),
            "street-lamp-arm",
        )
        mark_instance(
            add_box(f"MESH_LAMP_LIGHT_{index}", (0.55, 0.16, 0.32), (x + 1, 5.25, z), "glass_warm", zone, 0.04),
            "street-lamp-light",
        )

    for i, (x, z) in enumerate(((-18, 20), (-12, 22), (19, 20), (33, 9), (52, 18), (-30, -34))):
        mark_instance(
            add_box(f"MESH_CRATE_{i}", (1.2, 1.0, 1.1), (x, 0.5, z), "wood", zone, 0.06, i * 0.11),
            "cargo-crate",
        )
        mark_instance(
            add_box(f"MESH_PALLET_{i}", (1.5, 0.16, 1.2), (x + 1.5, 0.08, z), "wood", zone, 0.025, i * -0.07),
            "cargo-pallet",
        )

    cone_positions = [
        (30, -4), (32, -4), (28, -6), (38, 6),
        (-25, 18), (15, 20), (42, -18), (20, -16),
    ]
    for index, (x, z) in enumerate(cone_positions):
        mark_instance(
            add_cone(f"MESH_TRAFFIC_CONE_{index}", 0.2, 0.68, (x, 0.34, z), "safety", zone),
            "traffic-cone",
        )

    barrel_positions = [(-19, 5), (-18, 5), (10, 15), (38, -22), (-15, -12), (5, 13)]
    for index, (x, z) in enumerate(barrel_positions):
        mark_instance(
            add_cylinder(f"MESH_OIL_BARREL_{index}", 0.36, 0.96, (x, 0.48, z), "steel_navy", zone, 14),
            "oil-barrel",
        )

    tire_positions = [(28, -6), (28.5, -5.5), (35, 8), (-20, 12), (45, -10)]
    for index, (x, z) in enumerate(tire_positions):
        mark_instance(
            add_torus(f"MESH_TIRE_{index}", 0.29, 0.1, (x, 0.13, z), "rubber", zone),
            "loose-tire",
        )

    pallet_positions = [(-5, -14), (12, 10), (4, -2), (-12, 8), (18, -8), (0, 16), (35, -5), (-8, -5)]
    for index, (x, z) in enumerate(pallet_positions):
        mark_instance(
            add_box(f"MESH_LOOSE_PALLET_{index}", (1.2, 0.14, 1.0), (x, 0.08, z), "wood", zone, 0.02, index * 0.31),
            "loose-pallet",
        )

    for index, (x, z) in enumerate(((5, 36), (30, 36), (-10, 34))):
        mark_instance(
            add_torus(f"MESH_ROPE_COIL_{index}", 0.24, 0.055, (x, 0.16, z), "wood", zone),
            "rope-coil",
        )

    for index, (x, z, radius) in enumerate((
        (0, 5, 1.0), (-10, -3, 0.7), (8, -10, 1.1),
        (15, 2, 0.8), (-5, 12, 1.0), (35, -10, 1.2),
    )):
        add_cylinder(f"MESH_OIL_STAIN_{index}", radius, 0.015, (x, 0.19, z), "rubber", zone, 18)

    for index, (x, z, radius) in enumerate(((-8, 8, 1.0), (5, -12, 0.8), (35, -20, 1.2), (20, 30, 1.0))):
        add_cylinder(f"MESH_PUDDLE_{index}", radius, 0.018, (x, 0.2, z), "puddle", zone, 20)


def create_lods() -> None:
    render_objects = [
        obj
        for obj in bpy.context.scene.objects
        if (
            obj.type == "MESH"
            and not obj.name.startswith(("COL_", "MARKER_"))
            and not obj.get("instanceKey")
            and not obj.get("ambientMotion")
            and not obj.get("gameplayRole")
        )
    ]
    grouped: dict[tuple[str, str], list[bpy.types.Object]] = {}
    for obj in render_objects:
        zone = obj.get("harborZone", "misc")
        material_name = obj.data.materials[0].name if obj.data.materials else "none"
        if obj.name.startswith("IMPACT_FOLIAGE"):
            impact = "IMPACT_FOLIAGE"
        elif obj.name.startswith("IMPACT_WATER"):
            impact = "IMPACT_WATER"
        else:
            impact = "MESH"
        grouped.setdefault((f"{zone}_{impact}", material_name), []).append(obj)

    lod0_objects: list[bpy.types.Object] = []
    for (group_name, material_name), objects in grouped.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"{group_name}_{material_name}_LOD0"
        lod0_objects.append(joined)

    lod1_objects: list[bpy.types.Object] = []
    for source in lod0_objects:
        duplicate = source.copy()
        duplicate.data = source.data.copy()
        bpy.context.collection.objects.link(duplicate)
        duplicate.name = source.name.replace("_LOD0", "_LOD1")
        bpy.context.view_layer.objects.active = duplicate
        duplicate.select_set(True)
        decimate = duplicate.modifiers.new("MobileDecimate", "DECIMATE")
        decimate.ratio = 0.38
        try:
            bpy.ops.object.modifier_apply(modifier=decimate.name)
        except RuntimeError:
            duplicate.modifiers.remove(decimate)
        duplicate.select_set(False)
        lod1_objects.append(duplicate)

    # Mobile LOD prioritizes draw-call reduction over zone-level culling.
    lod1_groups: dict[tuple[str, str], list[bpy.types.Object]] = {}
    for obj in lod1_objects:
        if "IMPACT_FOLIAGE" in obj.name:
            impact = "IMPACT_FOLIAGE"
        elif "IMPACT_WATER" in obj.name:
            impact = "IMPACT_WATER"
        else:
            impact = "MESH"
        material_name = obj.data.materials[0].name if obj.data.materials else "none"
        lod1_groups.setdefault((impact, material_name), []).append(obj)

    for (impact, material_name), objects in lod1_groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        joined = bpy.context.object
        joined.name = f"harbor_{impact}_{material_name}_LOD1"
        joined.select_set(False)


def count_triangles(name_suffix: str) -> int:
    total = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.name.endswith(name_suffix):
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        total += len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    return total


def export_glb() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_extras=True,
        export_cameras=False,
        export_lights=False,
    )

    manifest = {
        "version": "1.2.0",
        "asset": "/assets/maps/harbor-v2/cinematic/harbor-cinematic.glb",
        "coordinateSystem": "right-handed-y-up",
        "zones": [
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
        ],
        "lods": {
            "LOD0": ["medium", "high"],
            "LOD1": ["low"],
        },
        "materials": sorted(MATERIALS.keys()),
        "collisions": CINEMATIC_COLLISION_SPECS,
        "metrics": {
            "payloadBytes": os.path.getsize(GLB_PATH),
            "lod0Triangles": count_triangles("_LOD0"),
            "lod1Triangles": count_triangles("_LOD1"),
            "lod0Meshes": len([o for o in bpy.context.scene.objects if o.name.endswith("_LOD0")]),
            "lod1Meshes": len([o for o in bpy.context.scene.objects if o.name.endswith("_LOD1")]),
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")


def render_preview() -> None:
    # Preview-only context: ocean and the separately shipped Warehouse slice.
    add_box(
        "PREVIEW_OCEAN",
        (300, 0.12, 260),
        (4, -0.86, 2),
        "puddle",
        "preview",
        0,
    )
    warehouse_path = ROOT / "client/public/assets/maps/harbor-v2/warehouse.glb"
    if warehouse_path.exists():
        bpy.ops.import_scene.gltf(filepath=str(warehouse_path))

    for obj in bpy.context.scene.objects:
        if (
            obj.name.endswith("_LOD1")
            or obj.name.startswith(("COL_", "MARKER_"))
            or "_LOD1" in obj.name
        ):
            obj.hide_render = True

    world = bpy.context.scene.world or bpy.data.worlds.new("HarborCinematicWorld")
    bpy.context.scene.world = world
    world.color = (0.035, 0.045, 0.055)
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.09, 0.11, 0.13, 1)
    background.inputs["Strength"].default_value = 0.35

    bpy.ops.object.light_add(type="SUN", location=(-50, 40, 60))
    sun = bpy.context.object
    sun.data.energy = 3.0
    sun.data.color = (1.0, 0.58, 0.28)
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(-52))
    bpy.ops.object.light_add(type="AREA", location=(20, -20, 45))
    fill = bpy.context.object
    fill.data.energy = 1100
    fill.data.shape = "DISK"
    fill.data.size = 45
    fill.data.color = (0.35, 0.52, 0.68)

    bpy.ops.object.camera_add(location=(118, -142, 112))
    camera = bpy.context.object
    direction = Vector((4, -2, 2)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 52
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)

    camera.location = (70, -72, 13)
    camera.data.lens = 48
    direction = Vector((18, -43, 1.0)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(DOCK_PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)

    camera.location = (48, -69, 9)
    camera.data.lens = 55
    direction = Vector((27, -52, 1.1)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(FLEET_PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    reset_scene()
    build_materials()
    build_base()
    build_container_yard()
    build_construction()
    build_residential()
    build_hunter_spawn()
    build_dock_district()
    build_dock_detail_pack()
    populate_harbor_boats()
    build_garden_detail_pack()
    build_construction_detail_pack()
    build_restored_landmarks()
    build_ferris_support()
    build_cinematic_collisions()
    build_shared_props()
    create_lods()
    export_glb()
    render_preview()
    print(f"Harbor cinematic GLB: {GLB_PATH}")
    print(f"Harbor cinematic manifest: {MANIFEST_PATH}")
    print(f"Harbor cinematic preview: {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
