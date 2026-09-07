"""Generate the Harbor V2 Warehouse vertical slice and export it as GLB."""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "client" / "public" / "assets" / "maps" / "harbor-v2"
GLB_PATH = OUTPUT_DIR / "warehouse.glb"
MANIFEST_PATH = OUTPUT_DIR / "warehouse.manifest.json"
PREVIEW_PATH = ROOT / "docs" / "v2" / "harbor" / "warehouse-v2-preview.png"
INTERIOR_PREVIEW_PATH = ROOT / "docs" / "v2" / "harbor" / "warehouse-v2-interior.png"
LOADING_PREVIEW_PATH = ROOT / "docs" / "v2" / "harbor" / "warehouse-v2-loading-bay.png"
STAIRS_PREVIEW_PATH = ROOT / "docs" / "v2" / "harbor" / "warehouse-v2-stairs.png"
TEXTURE_DIR = ROOT / "tools" / "harbor-v2" / "textures"

materials: dict[str, bpy.types.Material] = {}
collision_specs: list[dict[str, object]] = []
marker_specs: list[dict[str, object]] = []
PBR_TEXTURE_SETS = {
    "MAT_CONCRETE": "concrete",
    "MAT_CORRUGATED_RED": "rusty_corrugated_iron",
    "MAT_WOOD": "wood_planks",
    "MAT_ROOF_DARK": "asphalt_02",
}


def generated_image(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float,
    kind: str,
    size: int = 64,
):
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            grain = (
                math.sin(x * 0.61 + y * 0.19)
                + math.cos(y * 0.37 - x * 0.13)
            ) * 0.025
            if kind == "base":
                pixels.extend(
                    (
                        max(0.0, min(1.0, color[0] + grain)),
                        max(0.0, min(1.0, color[1] + grain * 0.75)),
                        max(0.0, min(1.0, color[2] + grain * 0.5)),
                        1.0,
                    )
                )
            elif kind == "normal":
                pixels.extend(
                    (
                        0.5 + math.sin(x * 0.31) * 0.055,
                        0.5 + math.cos(y * 0.29) * 0.055,
                        0.996,
                        1.0,
                    )
                )
            else:
                pixels.extend((0.94, max(0.05, min(1.0, roughness + grain)), metallic, 1.0))
    image.pixels = pixels
    image.pack()
    return image


def material(name: str, color: tuple[float, float, float, float], roughness: float, metallic: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    principled = nodes.get("Principled BSDF")

    texture_set = PBR_TEXTURE_SETS.get(name)
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
        if name == "MAT_ROOF_DARK":
            pixels = list(base_image.pixels)
            for index in range(0, len(pixels), 4):
                pixels[index] *= 0.28
                pixels[index + 1] *= 0.31
                pixels[index + 2] *= 0.35
            base_image.pixels = pixels
        for image in (base_image, normal_image, orm_image):
            image.pack()
        normal_image.colorspace_settings.name = "Non-Color"
        orm_image.colorspace_settings.name = "Non-Color"
        texture_coordinates = nodes.new("ShaderNodeTexCoord")
        mapping = nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (3.0, 3.0, 3.0)
        links.new(texture_coordinates.outputs["UV"], mapping.inputs["Vector"])
    else:
        base_image = generated_image(f"{name}_BaseColor", color, roughness, metallic, "base")
        normal_image = generated_image(f"{name}_Normal", color, roughness, metallic, "normal")
        orm_image = generated_image(f"{name}_ORM", color, roughness, metallic, "orm")
        normal_image.colorspace_settings.name = "Non-Color"
        orm_image.colorspace_settings.name = "Non-Color"
        mapping = None

    base = nodes.new("ShaderNodeTexImage")
    base.image = base_image
    if mapping:
        links.new(mapping.outputs["Vector"], base.inputs["Vector"])
    links.new(base.outputs["Color"], principled.inputs["Base Color"])

    normal = nodes.new("ShaderNodeTexImage")
    normal.image = normal_image
    if mapping:
        links.new(mapping.outputs["Vector"], normal.inputs["Vector"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.65 if texture_set else 0.3
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

    orm = nodes.new("ShaderNodeTexImage")
    orm.image = orm_image
    if mapping:
        links.new(mapping.outputs["Vector"], orm.inputs["Vector"])
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], principled.inputs["Roughness"])
    links.new(separate.outputs["Blue"], principled.inputs["Metallic"])
    materials[name] = mat
    return mat


def emissive_material(
    name: str,
    color: tuple[float, float, float, float],
    strength: float,
):
    mat = material(name, color, 0.28, 0.08)
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Emission Color"].default_value = color
    principled.inputs["Emission Strength"].default_value = strength
    return mat


def add_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material_name: str | None,
    *,
    bevel: float = 0.0,
    collision: bool = False,
):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material_name:
        obj.data.materials.append(materials[material_name])
    if bevel > 0:
        modifier = obj.modifiers.new("BEVEL", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    if collision:
        obj["harbor_v2_role"] = "movement_collision"
        x, y, z = location
        width, depth, height = dimensions
        three_position = {"x": x, "y": z, "z": -y}
        three_dimensions = {"x": width, "y": height, "z": depth}
        collision_specs.append(
            {
                "name": name,
                "position": three_position,
                "dimensions": three_dimensions,
                "min": {
                    "x": x - width / 2,
                    "y": z - height / 2,
                    "z": -y - depth / 2,
                },
                "max": {
                    "x": x + width / 2,
                    "y": z + height / 2,
                    "z": -y + depth / 2,
                },
            }
        )
    else:
        obj["harbor_v2_role"] = "render_mesh"
    return obj


def add_cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material_name: str,
    vertices: int = 16,
):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(materials[material_name])
    obj["harbor_v2_role"] = "render_mesh"
    bevel = obj.modifiers.new("BEVEL", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 2
    return obj


def add_marker(name: str, three_position: tuple[float, float, float]):
    x, y, z = three_position
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(x, -z, y))
    marker = bpy.context.object
    marker.name = name
    marker.empty_display_size = 0.5
    marker["harbor_v2_role"] = "marker"
    marker_specs.append({"name": name, "position": {"x": x, "y": y, "z": z}})
    return marker


def add_beam_between_three(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    thickness: float,
    material_name: str,
):
    start_blender = Vector((start[0], -start[2], start[1]))
    end_blender = Vector((end[0], -end[2], end[1]))
    direction = end_blender - start_blender
    midpoint = (start_blender + end_blender) * 0.5
    bpy.ops.mesh.primitive_cube_add(location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (thickness, thickness, direction.length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.data.materials.append(materials[material_name])
    obj["harbor_v2_role"] = "render_mesh"
    return obj


def build_shell():
    add_box("MESH_WAREHOUSE_FLOOR", (0, 0, 0), (46, 36, 0.2), "MAT_CONCRETE", bevel=0.03)

    # Foundation and corrugated wall shell. Front faces Blender -Y / Three.js +Z.
    add_box("MESH_WAREHOUSE_BASE_LEFT", (-22.75, 0, 0.65), (0.5, 36, 1.3), "MAT_CONCRETE", bevel=0.04)
    add_box("MESH_WAREHOUSE_BASE_RIGHT_BACK", (22.75, 12, 0.65), (0.5, 12, 1.3), "MAT_CONCRETE", bevel=0.04)
    add_box("MESH_WAREHOUSE_BASE_RIGHT_FRONT", (22.75, -14, 0.65), (0.5, 8, 1.3), "MAT_CONCRETE", bevel=0.04)
    add_box("MESH_WAREHOUSE_BASE_BACK", (0, 17.75, 0.65), (46, 0.5, 1.3), "MAT_CONCRETE", bevel=0.04)
    add_box("MESH_WAREHOUSE_BASE_FRONT_L", (-16.25, -17.75, 0.65), (13.5, 0.5, 1.3), "MAT_CONCRETE", bevel=0.04)
    add_box("MESH_WAREHOUSE_BASE_FRONT_R", (16.25, -17.75, 0.65), (13.5, 0.5, 1.3), "MAT_CONCRETE", bevel=0.04)

    add_box("MESH_WAREHOUSE_WALL_LEFT", (-22.75, 0, 4.65), (0.35, 36, 6.7), "MAT_CORRUGATED_RED", bevel=0.025)
    add_box("MESH_WAREHOUSE_WALL_RIGHT_BACK", (22.75, 12, 4.65), (0.35, 12, 6.7), "MAT_CORRUGATED_RED", bevel=0.025)
    add_box("MESH_WAREHOUSE_WALL_RIGHT_FRONT", (22.75, -14, 4.65), (0.35, 8, 6.7), "MAT_CORRUGATED_RED", bevel=0.025)
    add_box("MESH_WAREHOUSE_WALL_RIGHT_HEADER", (22.75, -2, 6.75), (0.35, 16, 2.5), "MAT_STEEL_NAVY", bevel=0.025)
    add_box("MESH_WAREHOUSE_WALL_BACK", (0, 17.75, 4.65), (46, 0.35, 6.7), "MAT_STEEL_NAVY", bevel=0.025)
    add_box("MESH_WAREHOUSE_WALL_FRONT_L", (-16.25, -17.75, 4.65), (13.5, 0.35, 6.7), "MAT_CORRUGATED_RED", bevel=0.025)
    add_box("MESH_WAREHOUSE_WALL_FRONT_R", (16.25, -17.75, 4.65), (13.5, 0.35, 6.7), "MAT_CORRUGATED_RED", bevel=0.025)
    add_box("MESH_WAREHOUSE_FRONT_HEADER", (0, -17.75, 7.2), (19, 0.45, 1.6), "MAT_STEEL_NAVY", bevel=0.04)

    # Structural columns and facade ribs provide realistic scale and highlights.
    for index, x in enumerate([-22.4, -17.25, -11.5, -5.75, 0, 5.75, 11.5, 17.25, 22.4]):
        if abs(x) >= 9.5:
            add_box(f"MESH_FRAME_FRONT_{index:02}", (x, -17.45, 4.0), (0.22, 0.22, 8.0), "MAT_GALVANIZED", bevel=0.025)
        add_box(f"MESH_FRAME_BACK_{index:02}", (x, 17.45, 4.0), (0.22, 0.22, 8.0), "MAT_GALVANIZED", bevel=0.025)
    for index, y in enumerate([-12, -6, 0, 6, 12]):
        add_box(f"MESH_FRAME_LEFT_{index:02}", (-22.45, y, 4.0), (0.22, 0.22, 8.0), "MAT_GALVANIZED", bevel=0.025)
        if y < -6 or y > 10:
            add_box(f"MESH_FRAME_RIGHT_{index:02}", (22.45, y, 4.0), (0.22, 0.22, 8.0), "MAT_GALVANIZED", bevel=0.025)

    # Two pitched roof slabs rise toward the center ridge and drain toward both eaves.
    roof_pitch = math.radians(4)
    for side, y, angle in [("FRONT", -9.0, roof_pitch), ("BACK", 9.0, -roof_pitch)]:
        roof = add_box(f"MESH_ROOF_{side}", (0, y, 8.65), (47, 18.6, 0.28), "MAT_ROOF_DARK", bevel=0.025)
        roof.rotation_euler.x = angle
        for seam_index, x in enumerate(range(-20, 21, 5)):
            seam = add_box(
                f"MESH_ROOF_SEAM_{side}_{seam_index:02}",
                (x, y, 8.82),
                (0.06, 18.3, 0.06),
                "MAT_GALVANIZED",
                bevel=0.01,
            )
            seam.rotation_euler.x = angle
    add_box("MESH_ROOF_RIDGE", (0, 0, 9.34), (47.2, 0.4, 0.32), "MAT_GALVANIZED", bevel=0.04)
    add_box("MESH_ROOF_GUTTER_FRONT", (0, -18.15, 8.05), (47.2, 0.28, 0.24), "MAT_GALVANIZED", bevel=0.03)
    add_box("MESH_ROOF_GUTTER_BACK", (0, 18.15, 8.05), (47.2, 0.28, 0.24), "MAT_GALVANIZED", bevel=0.03)
    for index, x in enumerate([-15, -5, 5, 15]):
        add_cylinder(f"MESH_ROOF_VENT_{index:02}", (x, 2, 9.35), 0.45, 0.7, "MAT_GALVANIZED")


def build_interior():
    # Three modular shelf banks with gameplay-authored tier heights.
    shelf_centers = [(-13, 1), (0, -3), (13, 2)]
    levels = [1.3, 2.6, 3.8]
    for shelf_index, (x, y) in enumerate(shelf_centers):
        for side in (-3.8, 3.8):
            for post_index, post_y in enumerate((y - 1.0, y + 1.0)):
                add_box(
                    f"MESH_SHELF_POST_{shelf_index}_{side:+.0f}_{post_index}",
                    (x + side, post_y, 2.0),
                    (0.14, 0.14, 4.0),
                    "MAT_STEEL_NAVY",
                    bevel=0.015,
                )
        for level_index, z in enumerate(levels):
            add_box(
                f"MESH_SHELF_DECK_{shelf_index}_{level_index}",
                (x, y, z),
                (8, 2.2, 0.14),
                "MAT_GALVANIZED",
                bevel=0.02,
            )
            add_box(
                f"MESH_SHELF_EDGE_{shelf_index}_{level_index}",
                (x, y - 1.05, z + 0.08),
                (8, 0.08, 0.24),
                "MAT_SAFETY_YELLOW",
                bevel=0.01,
            )

    # Rear catwalk and guard rails.
    add_box("MESH_CATWALK_DECK", (0, 14.8, 4.0), (30, 2.0, 0.18), "MAT_GALVANIZED", bevel=0.025)
    for x in range(-14, 15, 2):
        add_box(f"MESH_CATWALK_POST_{x:+03}", (x, 13.85, 4.55), (0.07, 0.07, 1.1), "MAT_SAFETY_YELLOW")
    add_box("MESH_CATWALK_RAIL_TOP", (0, 13.85, 5.05), (30, 0.08, 0.08), "MAT_SAFETY_YELLOW")
    add_box("MESH_CATWALK_RAIL_MID", (0, 13.85, 4.6), (30, 0.06, 0.06), "MAT_SAFETY_YELLOW")

    # The former rear-left decorative stair had no gameplay collider or
    # supported landing connection. Keep it absent until its route is authored
    # visually and in the collision contract together.

    # Suspended central route. The collider remains the deck box below; the
    # following members are render-only load paths and fall protection.
    add_box("MESH_SUSPENDED_PLATFORM", (6, 6, 5.6), (8, 4, 0.22), "MAT_STEEL_NAVY", bevel=0.03)
    for beam_index, beam_y in enumerate((4.35, 7.65)):
        add_box(
            f"MESH_SUSPENDED_CROSSBEAM_{beam_index:02}",
            (6, beam_y, 5.4),
            (8.4, 0.22, 0.24),
            "MAT_STEEL_NAVY",
            bevel=0.015,
        )
        roof_underside = 9.14 - beam_y * math.tan(math.radians(4))
        for hanger_index, hanger_x in enumerate((2.25, 9.75)):
            add_beam_between_three(
                f"MESH_SUSPENDED_HANGER_{beam_index:02}_{hanger_index:02}",
                (hanger_x, 5.48, -beam_y),
                (hanger_x, roof_underside, -beam_y),
                0.11,
                "MAT_GALVANIZED",
            )

    # Guard both long sides and leave the short ends open for the authored route.
    for guard_side, guard_y in (("FRONT", 4.05), ("BACK", 7.95)):
        add_box(
            f"MESH_SUSPENDED_TOE_{guard_side}",
            (6, guard_y, 5.78),
            (8, 0.1, 0.18),
            "MAT_SAFETY_YELLOW",
            bevel=0.01,
        )
        for post_index, post_x in enumerate((2.1, 4.0, 6.0, 8.0, 9.9)):
            add_box(
                f"MESH_SUSPENDED_GUARD_POST_{guard_side}_{post_index:02}",
                (post_x, guard_y, 6.24),
                (0.08, 0.08, 1.1),
                "MAT_SAFETY_YELLOW",
            )
        add_box(
            f"MESH_SUSPENDED_GUARD_MID_{guard_side}",
            (6, guard_y, 6.22),
            (8, 0.07, 0.07),
            "MAT_SAFETY_YELLOW",
        )
        add_box(
            f"MESH_SUSPENDED_GUARD_TOP_{guard_side}",
            (6, guard_y, 6.74),
            (8, 0.08, 0.08),
            "MAT_SAFETY_YELLOW",
        )

    # Dressing objects establish scale without carrying gameplay collision.
    for index, (x, y, scale) in enumerate([
        (-17, -8, 1.0), (-14.5, -8.5, 0.7), (15, -6, 0.9),
        (17, -5.5, 0.65), (-4, 8, 0.8), (4, 9, 1.1),
    ]):
        add_box(
            f"MESH_DRESSING_CRATE_{index:02}",
            (x, y, scale * 0.5),
            (scale, scale, scale),
            "MAT_WOOD",
            bevel=0.035,
        )
    for index, (x, y) in enumerate([(-19, -13), (19, -13), (19, 13)]):
        add_cylinder(f"MESH_DRESSING_BARREL_{index:02}", (x, y, 0.5), 0.32, 1.0, "MAT_STEEL_NAVY")

    # Sign backing; lettering remains a separate, replaceable asset.
    add_box("MESH_SIGN_BACKING", (0, -18.05, 7.0), (8.0, 0.12, 1.2), "MAT_STEEL_NAVY", bevel=0.04)
    bpy.ops.object.text_add(location=(-3.4, -18.14, 6.8), rotation=(math.radians(90), 0, 0))
    sign = bpy.context.object
    sign.name = "MESH_SIGN_OLD_HARBOR"
    sign.data.body = "OLD HARBOR"
    sign.data.align_x = "LEFT"
    sign.data.size = 0.75
    sign.data.extrude = 0.015
    sign.data.materials.append(materials["MAT_SAFETY_YELLOW"])
    sign["harbor_v2_role"] = "render_mesh"
    bpy.context.view_layer.objects.active = sign
    sign.select_set(True)
    bpy.ops.object.convert(target="MESH")


def build_exterior_roof_access():
    """Authored fire escapes matching the established gameplay step volumes."""
    step_height = 0.4
    step_depth = 1.4
    step_count = 21
    stair_width = 3.0

    stair_runs = [
        ("WEST", -26.0, -13.0, 1.0),
        ("EAST", 26.0, 15.0, -1.0),
    ]
    for side, three_x, start_z, direction in stair_runs:
        for step in range(step_count):
            box_height = step_height
            center_y = step * step_height + box_height / 2
            center_z = start_z + direction * (step * step_depth + step_depth / 2)
            add_box(
                f"MESH_EXT_STAIR_{side}_{step:02}",
                (three_x, -center_z, center_y),
                (stair_width, step_depth, box_height),
                "MAT_GALVANIZED",
                bevel=0.025,
            )
            add_box(
                f"MESH_EXT_STAIR_EDGE_{side}_{step:02}",
                (three_x, -(center_z + direction * step_depth * 0.44), center_y + box_height / 2 + 0.025),
                (stair_width, 0.08, 0.05),
                "MAT_SAFETY_YELLOW",
                bevel=0.01,
            )
            # A post at every tread keeps the long rail spans credible while
            # adding only low-cost box geometry.
            for rail_side in (-1, 1):
                rail_x = three_x + rail_side * 1.45
                add_box(
                    f"MESH_EXT_STAIR_RAIL_{side}_{rail_side:+}_{step:02}",
                    (rail_x, -center_z, center_y + 0.65),
                    (0.08, 0.08, 1.3),
                    "MAT_SAFETY_YELLOW",
                )

        landing_z = start_z + direction * ((step_count - 1) * step_depth + step_depth / 2)
        landing_x = three_x + 2 if side == "WEST" else three_x - 2

        # Three continuous stringers carry the treads instead of leaving them
        # as disconnected slabs. Their ends land beneath the first and last
        # authored tread without altering that gameplay geometry.
        first_tread_z = start_z + direction * (step_depth / 2)
        for stringer_index, stringer_offset in enumerate((-1.15, 0.0, 1.15)):
            add_beam_between_three(
                f"MESH_EXT_STAIR_STRINGER_{side}_{stringer_index:02}",
                (three_x + stringer_offset, 0.02, first_tread_z),
                (three_x + stringer_offset, 8.0, landing_z),
                0.22,
                "MAT_STEEL_NAVY",
            )

        # Three ground-supported bents break the 29 m run into believable
        # spans. Concrete pads, steel posts, and transverse cap beams are all
        # visual-only and sit beneath the existing tread boxes.
        for bent_index, support_step in enumerate((5, 11, 17)):
            support_height = support_step * step_height
            support_z = start_z + direction * (support_step * step_depth + step_depth / 2)
            add_box(
                f"MESH_EXT_STAIR_BENT_BEAM_{side}_{bent_index:02}",
                (three_x, -support_z, support_height - 0.12),
                (stair_width + 0.35, 0.24, 0.24),
                "MAT_STEEL_NAVY",
            )
            for post_side in (-1, 1):
                post_x = three_x + post_side * 1.25
                add_box(
                    f"MESH_EXT_STAIR_BENT_POST_{side}_{bent_index:02}_{post_side:+}",
                    (post_x, -support_z, support_height / 2),
                    (0.22, 0.22, support_height),
                    "MAT_STEEL_NAVY",
                )
                add_box(
                    f"MESH_EXT_STAIR_FOOTING_{side}_{bent_index:02}_{post_side:+}",
                    (post_x, -support_z, 0.1),
                    (0.58, 0.58, 0.2),
                    "MAT_CONCRETE",
                    bevel=0.02,
                )

        add_box(
            f"MESH_EXT_STAIR_LANDING_{side}",
            (landing_x, -landing_z, 8.15),
            (7.0, step_depth + 0.5, 0.2),
            "MAT_GALVANIZED",
            bevel=0.03,
        )
        for beam_index, beam_offset in enumerate((-0.72, 0.72)):
            add_box(
                f"MESH_EXT_STAIR_LANDING_BEAM_{side}_{beam_index:02}",
                (landing_x, -(landing_z + beam_offset), 7.95),
                (7.0, 0.2, 0.24),
                "MAT_STEEL_NAVY",
            )

        for rail_side in (-1, 1):
            rail_x = three_x + rail_side * 1.45
            add_beam_between_three(
                f"MESH_EXT_STAIR_MIDRAIL_{side}_{rail_side:+}",
                (
                    rail_x,
                    1.0,
                    start_z + direction * 0.4,
                ),
                (
                    rail_x,
                    9.15,
                    landing_z,
                ),
                0.09,
                "MAT_SAFETY_YELLOW",
            )
            add_beam_between_three(
                f"MESH_EXT_STAIR_TOPRAIL_{side}_{rail_side:+}",
                (
                    rail_x,
                    1.45,
                    start_z + direction * 0.4,
                ),
                (
                    rail_x,
                    9.55,
                    landing_z,
                ),
                0.09,
                "MAT_SAFETY_YELLOW",
            )

        # Continue the guard around the landing bridge. The approach rail starts
        # at the inner stair stringer so the full tread width stays open; the
        # opposite rail spans from the exposed end back to the wall.
        wall_x = -22.75 if side == "WEST" else 22.75
        landing_half_depth = (step_depth + 0.5) / 2
        inside_sign = 1 if side == "WEST" else -1
        outer_sign = -inside_sign
        inner_stair_x = three_x + inside_sign * stair_width / 2
        outer_x = landing_x + outer_sign * 3.42
        approach_z = landing_z - direction * landing_half_depth
        far_z = landing_z + direction * landing_half_depth
        landing_guard_segments = (
            (
                "APPROACH",
                inner_stair_x,
                wall_x,
                approach_z,
                (inner_stair_x, (inner_stair_x + wall_x) / 2, wall_x),
            ),
            (
                "FAR",
                outer_x,
                wall_x,
                far_z,
                ((outer_x + wall_x) / 2, wall_x),
            ),
        )
        for edge_name, rail_start_x, rail_end_x, edge_z, post_positions in landing_guard_segments:
            for post_index, post_x in enumerate(post_positions):
                add_box(
                    f"MESH_EXT_STAIR_LANDING_POST_{side}_{edge_name}_{post_index:02}",
                    (post_x, -edge_z, 8.78),
                    (0.08, 0.08, 1.1),
                    "MAT_SAFETY_YELLOW",
                )
            for rail_name, rail_height, rail_thickness in (
                ("MID", 8.78, 0.07),
                ("TOP", 9.3, 0.09),
            ):
                add_beam_between_three(
                    f"MESH_EXT_STAIR_LANDING_{rail_name}_{side}_{edge_name}",
                    (rail_start_x, rail_height, edge_z),
                    (rail_end_x, rail_height, edge_z),
                    rail_thickness,
                    "MAT_SAFETY_YELLOW",
                )

        for post_index, post_z in enumerate((approach_z, far_z)):
            add_box(
                f"MESH_EXT_STAIR_LANDING_OUTER_POST_{side}_{post_index:02}",
                (outer_x, -post_z, 8.78),
                (0.08, 0.08, 1.1),
                "MAT_SAFETY_YELLOW",
            )
        for rail_name, rail_height, rail_thickness in (
            ("MID", 8.78, 0.07),
            ("TOP", 9.3, 0.09),
        ):
            add_beam_between_three(
                f"MESH_EXT_STAIR_LANDING_OUTER_{rail_name}_{side}",
                (outer_x, rail_height, approach_z),
                (outer_x, rail_height, far_z),
                rail_thickness,
                "MAT_SAFETY_YELLOW",
            )


def build_facade_detail():
    """Mid-scale facade detail that survives at gameplay camera distances."""
    # Loading-door frame and overhead canopy.
    add_box("MESH_LOADING_FRAME_LEFT", (-9.65, -18.0, 3.2), (0.32, 0.45, 6.4), "MAT_GALVANIZED", bevel=0.035)
    add_box("MESH_LOADING_FRAME_RIGHT", (9.65, -18.0, 3.2), (0.32, 0.45, 6.4), "MAT_GALVANIZED", bevel=0.035)
    add_box("MESH_LOADING_FRAME_TOP", (0, -18.0, 6.35), (19.6, 0.45, 0.35), "MAT_GALVANIZED", bevel=0.035)
    add_box("MESH_LOADING_CANOPY", (0, -18.65, 6.55), (13, 2.0, 0.22), "MAT_STEEL_NAVY", bevel=0.045)

    # Side-window placeholders were shallow emissive boxes placed on top of
    # uncut cladding. Some also crossed the east loading opening. They remain
    # intentionally absent until a later pass creates recessed openings,
    # reveals, sills, mullions, and matching wall topology.

    # Roof skylights establish believable construction. Downspouts remain
    # intentionally absent until the gutter run has proper hoppers and elbows;
    # the former vertical pipes stopped short and were offset from the gutter.
    for index, (x, y, z) in enumerate(((-12, -6, 9.07), (0, -2, 9.35), (12, 5, 9.14))):
        skylight = add_box(
            f"MESH_ROOF_SKYLIGHT_{index}",
            (x, y, z),
            (5.5, 2.2, 0.14),
            "MAT_ROOF_GLASS",
            bevel=0.05,
        )
        skylight.rotation_euler.x = math.radians(4 if y < 0 else -4)
    # Exterior loading props align with the concept without closing the route.
    for index, x in enumerate((-8.5, 8.5)):
        add_cylinder(
            f"MESH_LOADING_BOLLARD_{index}",
            (x, -19.0, 0.7),
            0.14,
            1.4,
            "MAT_SAFETY_YELLOW",
            vertices=12,
        )
    for index, (x, y, scale) in enumerate(((-17, -19.2, 1.0), (-14.8, -19.4, 0.7), (15, -19.1, 0.85))):
        add_box(
            f"MESH_LOADING_CRATE_{index}",
            (x, y, scale * 0.5),
            (scale, scale, scale),
            "MAT_WOOD",
            bevel=0.04,
        )

    # Practical lamps above the loading entrance and stairs.
    for index, (x, y, z) in enumerate(((-5.5, -18.45, 7.25), (5.5, -18.45, 7.25), (-22.95, -8, 6.4), (22.95, 8, 6.4))):
        add_box(
            f"MESH_WAREHOUSE_LAMP_{index}",
            (x, y, z),
            (0.65, 0.28, 0.28),
            "MAT_LIGHT_WARM",
            bevel=0.035,
        )


def build_collisions_and_markers():
    collision_material = material("MAT_COLLISION_DEBUG", (0.8, 0.1, 0.1, 0.15), 1.0)

    collision_boxes = [
        ("COL_MOVE_FLOOR", (0, 0, -0.1), (46, 36, 0.2)),
        ("COL_MOVE_WALL_LEFT", (-22.75, 0, 4.0), (0.5, 36, 8.0)),
        ("COL_MOVE_WALL_RIGHT_BACK", (22.75, 12, 4.0), (0.5, 12, 8.0)),
        ("COL_MOVE_WALL_RIGHT_FRONT", (22.75, -14, 4.0), (0.5, 8, 8.0)),
        ("COL_MOVE_WALL_RIGHT_HEADER", (22.75, -2, 6.75), (0.5, 16, 2.5)),
        ("COL_MOVE_WALL_BACK", (0, 17.75, 4.0), (46, 0.5, 8.0)),
        ("COL_MOVE_WALL_FRONT_L", (-16.25, -17.75, 4.0), (13.5, 0.5, 8.0)),
        ("COL_MOVE_WALL_FRONT_R", (16.25, -17.75, 4.0), (13.5, 0.5, 8.0)),
        ("COL_MOVE_FRONT_HEADER", (0, -17.75, 7.2), (19, 0.5, 1.6)),
        ("COL_MOVE_CATWALK", (0, 14.8, 4.0), (30, 2.0, 0.2)),
        ("COL_MOVE_SUSPENDED", (6, 6, 5.6), (8, 4, 0.24)),
    ]
    roof_segments = 12
    roof_segment_depth = 36 / roof_segments
    roof_pitch = math.tan(math.radians(4))
    for index in range(roof_segments):
        y = -18 + roof_segment_depth * (index + 0.5)
        roof_top = 8.15 + (18 - abs(y)) * roof_pitch
        collision_boxes.append((
            f"COL_MOVE_ROOF_{index:02}",
            (0, y, roof_top - 0.175),
            (46, roof_segment_depth + 0.08, 0.35),
        ))
    for shelf_index, (x, y) in enumerate([(-13, 1), (0, -3), (13, 2)]):
        for level_index, z in enumerate([1.3, 2.6, 3.8]):
            collision_boxes.append(
                (f"COL_MOVE_SHELF_{shelf_index}_{level_index}", (x, y, z), (8, 2.2, 0.16))
            )
    for step in range(10):
        collision_boxes.append(
            (
                f"COL_MOVE_STEP_{step:02}",
                (-18, 8.5 + step * 0.45, 0.2 + step * 0.4),
                (2.0, 0.55, 0.2),
            )
        )

    for side, three_x, start_z, direction in [
        ("WEST", -26.0, -13.0, 1.0),
        ("EAST", 26.0, 15.0, -1.0),
    ]:
        for step in range(21):
            center_y = step * 0.4 + 0.2
            center_z = start_z + direction * (step * 1.4 + 0.7)
            collision_boxes.append(
                (
                    f"COL_MOVE_EXT_STAIR_{side}_{step:02}",
                    (three_x, -center_z, center_y),
                    (3.0, 1.4, 0.4),
                )
            )
        landing_z = start_z + direction * (20 * 1.4 + 0.7)
        landing_x = three_x + 2 if side == "WEST" else three_x - 2
        collision_boxes.append(
            (
                f"COL_MOVE_EXT_STAIR_LANDING_{side}",
                (landing_x, -landing_z, 8.15),
                (7.0, 1.9, 0.2),
            )
        )

    for name, location, dimensions in collision_boxes:
        obj = add_box(name, location, dimensions, None, collision=True)
        obj.data.materials.append(collision_material)

    add_marker("MARKER_WAREHOUSE_ORIGIN", (0, 0, 0))
    for index, position in enumerate([
        (0, 0, 5), (5, 0, -8), (-10, 0, 12),
        (10, 0, -5), (15, 0, 10), (-5, 0, -15),
    ]):
        add_marker(f"MARKER_PROP_SPAWN_{index:02}", position)


def optimize_render_meshes():
    render_meshes = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and not obj.name.startswith("COL_")
    ]
    for obj in render_meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)

    for material_name, mat in materials.items():
        if material_name == "MAT_COLLISION_DEBUG":
            continue
        material_meshes = [
            obj for obj in bpy.context.scene.objects
            if obj.type == "MESH"
            and not obj.name.startswith("COL_")
            and len(obj.data.materials) > 0
            and obj.data.materials[0] == mat
        ]
        if not material_meshes:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in material_meshes:
            obj.select_set(True)
        target = material_meshes[0]
        bpy.context.view_layer.objects.active = target
        bpy.ops.object.join()
        target.name = f"MESH_WAREHOUSE_{material_name.removeprefix('MAT_')}_LOD0"
        target.data.materials.clear()
        target.data.materials.append(mat)
        for polygon in target.data.polygons:
            polygon.material_index = 0


def build_lod1():
    simplified_boxes = [
        ("MESH_WAREHOUSE_FLOOR_LOD1", (0, 0, 0), (46, 36, 0.2), "MAT_CONCRETE"),
        ("MESH_WAREHOUSE_LEFT_LOD1", (-22.75, 0, 4), (0.35, 36, 8), "MAT_CORRUGATED_RED"),
        ("MESH_WAREHOUSE_BACK_LOD1", (0, 17.75, 4), (46, 0.35, 8), "MAT_STEEL_NAVY"),
        ("MESH_WAREHOUSE_FRONT_L_LOD1", (-16, -17.75, 4), (14, 0.35, 8), "MAT_CORRUGATED_RED"),
        ("MESH_WAREHOUSE_FRONT_R_LOD1", (16, -17.75, 4), (14, 0.35, 8), "MAT_CORRUGATED_RED"),
        ("MESH_WAREHOUSE_FRONT_HEADER_LOD1", (0, -17.75, 7.2), (18, 0.35, 1.6), "MAT_STEEL_NAVY"),
        ("MESH_WAREHOUSE_RIGHT_BACK_LOD1", (22.75, 12, 4), (0.35, 12, 8), "MAT_CORRUGATED_RED"),
        ("MESH_WAREHOUSE_RIGHT_FRONT_LOD1", (22.75, -14, 4), (0.35, 8, 8), "MAT_CORRUGATED_RED"),
        ("MESH_WAREHOUSE_RIGHT_HEADER_LOD1", (22.75, -2, 6.75), (0.35, 16, 2.5), "MAT_STEEL_NAVY"),
        ("MESH_WAREHOUSE_CATWALK_LOD1", (0, 14.8, 4), (30, 2, 0.18), "MAT_GALVANIZED"),
        ("MESH_WAREHOUSE_SHELF_L_LOD1", (-13, 1, 1.9), (8, 2.2, 3.8), "MAT_STEEL_NAVY"),
        ("MESH_WAREHOUSE_SHELF_C_LOD1", (0, -3, 1.9), (8, 2.2, 3.8), "MAT_STEEL_NAVY"),
        ("MESH_WAREHOUSE_SHELF_R_LOD1", (13, 2, 1.9), (8, 2.2, 3.8), "MAT_STEEL_NAVY"),
    ]
    for name, location, dimensions, material_name in simplified_boxes:
        add_box(name, location, dimensions, material_name)

    roof_pitch = math.radians(4)
    for side, y, angle in [("FRONT", -9.0, roof_pitch), ("BACK", 9.0, -roof_pitch)]:
        roof = add_box(
            f"MESH_WAREHOUSE_ROOF_{side}_LOD1",
            (0, y, 8.65),
            (47, 18.6, 0.28),
            "MAT_STEEL_NAVY",
        )
        roof.rotation_euler.x = angle
    add_box(
        "MESH_WAREHOUSE_ROOF_RIDGE_LOD1",
        (0, 0, 9.34),
        (47.2, 0.4, 0.32),
        "MAT_GALVANIZED",
    )


def render_preview():
    for obj in bpy.context.scene.objects:
        if obj.name.startswith("COL_") or obj.name.endswith("_LOD1"):
            obj.hide_render = True

    bpy.ops.object.light_add(type="SUN", location=(20, -30, 40))
    sun = bpy.context.object
    sun.rotation_euler = (math.radians(28), 0, math.radians(-32))
    sun.data.energy = 2.2
    sun.data.color = (1.0, 0.82, 0.64)

    bpy.ops.object.light_add(type="AREA", location=(-15, -20, 25))
    fill = bpy.context.object
    fill.data.energy = 1800
    fill.data.shape = "DISK"
    fill.data.size = 18
    fill.data.color = (0.42, 0.58, 0.9)

    bpy.ops.object.light_add(type="AREA", location=(0, -7, 7.5))
    interior_fill = bpy.context.object
    interior_fill.data.energy = 2400
    interior_fill.data.shape = "RECTANGLE"
    interior_fill.data.size = 16
    interior_fill.data.color = (1.0, 0.72, 0.48)

    bpy.ops.object.camera_add(location=(54, -62, 34))
    camera = bpy.context.object
    camera.data.lens = 52
    direction = Vector((0, 0, 4.2)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera

    world = bpy.context.scene.world or bpy.data.worlds.new("HarborV2World")
    bpy.context.scene.world = world
    world.color = (0.035, 0.045, 0.06)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW_PATH)
    scene.render.film_transparent = False
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {PREVIEW_PATH}")

    camera.location = (0, -30, 5.5)
    camera.data.lens = 36
    direction = Vector((0, 2, 3.2)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(INTERIOR_PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {INTERIOR_PREVIEW_PATH}")

    camera.location = (0, -39, 6.2)
    camera.data.lens = 42
    direction = Vector((0, -17.5, 3.8)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(LOADING_PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {LOADING_PREVIEW_PATH}")

    camera.location = (38, -26, 18)
    camera.data.lens = 50
    direction = Vector((23, -3, 5.0)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(STAIRS_PREVIEW_PATH)
    bpy.ops.render.render(write_still=True)
    print(f"Rendered {STAIRS_PREVIEW_PATH}")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    material("MAT_CONCRETE", (0.34, 0.32, 0.29, 1.0), 0.82)
    material("MAT_STEEL_NAVY", (0.045, 0.09, 0.14, 1.0), 0.52, 0.72)
    material("MAT_ROOF_DARK", (0.035, 0.045, 0.05, 1.0), 0.84, 0.24)
    material("MAT_CORRUGATED_RED", (0.34, 0.075, 0.055, 1.0), 0.7, 0.42)
    material("MAT_GALVANIZED", (0.42, 0.47, 0.5, 1.0), 0.46, 0.82)
    material("MAT_SAFETY_YELLOW", (0.9, 0.48, 0.04, 1.0), 0.58, 0.18)
    material("MAT_WOOD", (0.28, 0.16, 0.08, 1.0), 0.88)
    emissive_material("MAT_LIGHT_WARM", (0.5, 0.28, 0.08, 1.0), 3.0)
    material("MAT_ROOF_GLASS", (0.04, 0.09, 0.12, 1.0), 0.18, 0.45)

    build_shell()
    build_interior()
    build_exterior_roof_access()
    build_facade_detail()
    build_collisions_and_markers()
    optimize_render_meshes()
    build_lod1()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        export_format="GLB",
        export_apply=True,
        export_extras=True,
        export_yup=True,
    )

    manifest = {
        "asset": "harbor-v2/warehouse.glb",
        "version": 1,
        "threeCoordinateSystem": "Y-up",
        "warehouseEnvelope": {"x": 46, "y": 8, "z": 36},
        "lods": {
            "LOD0": {"qualityTiers": ["medium", "high"]},
            "LOD1": {"qualityTiers": ["low"]},
        },
        "collisions": collision_specs,
        "markers": marker_specs,
        "budgets": {
            "desktop": {"triangles": 120000, "drawCalls": 100, "payloadMB": 12},
            "mobile": {"triangles": 60000, "drawCalls": 60, "payloadMB": 6},
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    render_preview()
    print(f"Exported {GLB_PATH}")
    print(f"Wrote {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
