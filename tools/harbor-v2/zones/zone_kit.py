"""Shared Blender authoring kit for Harbor V2 edge-zone assets (AC garden, AD
construction).

Everything is authored in Three.js coordinates (x right, y up, z toward the
south dock) and converted to Blender Z-up on creation, so the numbers in the
zone builders line up 1:1 with ``harbor-warehouse.json``, the procedural
collider dump and ``build_cinematic_harbor.py``.

Run inside the live Blender MCP session (``exec`` the zone builder) or in
background mode. The kit never writes production GLBs; export goes through
``tools/harbor-v2/export_zone_scene.py`` into ``art-source/harbor-v2/_staging``.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[3]
ART_SOURCE = ROOT / "art-source/harbor-v2"
TEXTURES = ROOT / "tools/harbor-v2/textures"

COLLECTION_NAMES = (
    "RENDER_LOD0",
    "RENDER_LOD1",
    "RENDER_SHARED",
    "COLLISION",        # locked reference copies of the procedural gameplay colliders (never exported)
    "COLLISION_ZONE",   # colliders this zone ships for its own props: COL_MOVE_<ZONE>_* (exported)
    "MARKERS",
    "SOCKETS",
    "REFERENCE",
    "PREVIEW_ONLY",
)

Vec3 = tuple[float, float, float]


def to_blender(position: Vec3) -> Vec3:
    x, y, z = position
    return (x, -z, y)


def to_three(position) -> Vec3:
    x, y, z = position
    return (x, z, -y)


# --------------------------------------------------------------------------- #
# Materials
# --------------------------------------------------------------------------- #


def _gltf_output_group() -> bpy.types.NodeTree:
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        group.interface.new_socket("Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
        group.nodes.new("NodeGroupInput")
    return group


def _image(path: Path, colorspace: str) -> bpy.types.Image:
    key = f"ZONE_{path.name}"
    image = bpy.data.images.get(key)
    if image is None:
        image = bpy.data.images.load(str(path), check_existing=False)
        image.name = key
    image.colorspace_settings.name = colorspace
    image.filepath = bpy.path.relpath(str(path)) if bpy.data.filepath else str(path)
    return image


def _clear(tree: bpy.types.NodeTree) -> None:
    for node in list(tree.nodes):
        tree.nodes.remove(node)


class PaletteSwatch:
    """A flat colour inside a shared palette texture (one draw call for many props)."""

    def __init__(self, material: bpy.types.Material, u: float, v: float, name: str):
        self.material = material
        self.u = u
        self.v = v
        self.name = name


class ZoneKit:
    """Stateful helper bound to one zone scene."""

    def __init__(self, zone_id: str, harbor_zone: str, texture_pack: str,
                 dynamic_collections: tuple[str, ...] = ()):
        self.zone_id = zone_id            # e.g. "GARDEN"
        self.harbor_zone = harbor_zone    # e.g. "residential"
        self.texture_pack = texture_pack  # e.g. "garden-pbr"
        # Extra collections whose meshes hang under RIG_<ZONE>_* empties (wheels,
        # cabins, boats). They are batched per parent so the hierarchy survives
        # export and the client can animate the empties.
        self.dynamic_collections = tuple(dynamic_collections)
        self.materials: dict[str, bpy.types.Material] = {}
        self.tiles: dict[str, float] = {}
        self.collections: dict[str, bpy.types.Collection] = {}
        self.rng = random.Random(20260907)

    # ---- scene -------------------------------------------------------------- #

    def _all_collection_names(self) -> tuple[str, ...]:
        return COLLECTION_NAMES + tuple(c for c in self.dynamic_collections if c not in COLLECTION_NAMES)

    def new_scene(self, scene_name: str) -> None:
        bpy.ops.wm.read_homefile(use_empty=True)
        scene = bpy.context.scene
        scene.name = scene_name
        scene.unit_settings.system = "METRIC"
        scene.unit_settings.scale_length = 1.0
        scene.unit_settings.length_unit = "METERS"
        scene["catchAndRunAuthoring"] = True
        scene["catchAndRunZone"] = self.zone_id
        scene["coordinateContract"] = "Blender Z-up meters; glTF export Y-up"
        if self.dynamic_collections:
            scene["dynamicCollections"] = list(self.dynamic_collections)
        for name in self._all_collection_names():
            collection = bpy.data.collections.new(name)
            scene.collection.children.link(collection)
            self.collections[name] = collection
        self.materials.clear()
        self.tiles.clear()

    def bind_existing_scene(self) -> None:
        scene = bpy.context.scene
        for name in self._all_collection_names():
            collection = bpy.data.collections.get(name)
            if collection is None:
                collection = bpy.data.collections.new(name)
                scene.collection.children.link(collection)
            self.collections[name] = collection

    # ---- rig nodes ------------------------------------------------------------ #

    def rig(self, name: str, position: Vec3, *, parent: bpy.types.Object | None = None,
            collection: str, tags: dict | None = None) -> bpy.types.Object:
        """Animation/socket empty exported as a glTF node.

        ``name`` is namespaced to ``RIG_<ZONE>_<NAME>`` (or ``SOCKET_<ZONE>_<NAME>``
        when it starts with ``SOCKET_``); ``position`` is the world position in
        Three.js meters. Meshes parented to it keep their local transform on export,
        so the client rotates/bobs the empty and everything below follows.
        """
        if name.startswith("SOCKET_"):
            full = f"SOCKET_{self.zone_id}_{name[len('SOCKET_'):].upper()}"
        else:
            full = f"RIG_{self.zone_id}_{name.upper()}"
        if bpy.data.objects.get(full) is not None:
            raise ValueError(f"duplicate rig node {full}")
        obj = bpy.data.objects.new(full, None)
        obj.empty_display_type = "PLAIN_AXES"
        obj.empty_display_size = 0.5
        bpy.context.scene.collection.objects.link(obj)
        obj.location = to_blender(position)
        if parent is not None:
            bpy.context.view_layer.update()
            obj.parent = parent
            obj.matrix_parent_inverse = parent.matrix_world.inverted()
        obj["harborZone"] = self.harbor_zone
        obj["harbor_v2_role"] = "rig_node"
        if tags:
            for key, value in tags.items():
                obj[key] = value
        self.link(obj, collection)
        return obj

    def attach(self, obj: bpy.types.Object, parent: bpy.types.Object, collection: str) -> bpy.types.Object:
        """Parent a world-space authored object to a rig node and move it to a dynamic collection."""
        bpy.context.view_layer.update()
        obj.parent = parent
        obj.matrix_parent_inverse = parent.matrix_world.inverted()
        obj["rigParent"] = parent.name
        self.link(obj, collection)
        return obj

    def link(self, obj: bpy.types.Object, collection: str) -> None:
        target = self.collections[collection]
        for current in tuple(obj.users_collection):
            current.objects.unlink(obj)
        target.objects.link(obj)

    def subcollection(self, parent: str, name: str) -> bpy.types.Collection:
        """Organisational child collection (e.g. FERRIS_STATIC under RENDER_LOD0).

        Batching and export walk ``all_objects`` of the render collections, so meshes
        linked here behave exactly like meshes linked to the parent.
        """
        existing = self.collections.get(name) or bpy.data.collections.get(name)
        if existing is None:
            existing = bpy.data.collections.new(name)
            self.collections[parent].children.link(existing)
        self.collections[name] = existing
        return existing

    # ---- materials ---------------------------------------------------------- #

    def pbr(self, key: str, spec_name: str | None = None, *, pack: str | None = None,
            normal_strength: float = 1.0, alpha_clip: bool = False,
            double_sided: bool = False) -> bpy.types.Material:
        """Material from a derived Poly Haven set (see zone_textures.py)."""
        if key in self.materials:
            return self.materials[key]
        pack = pack or self.texture_pack
        spec_name = spec_name or key.lower().removeprefix("mat_")
        derived = TEXTURES / pack / "_derived"
        spec = json.loads((derived / "spec.json").read_text())[spec_name]
        mat = bpy.data.materials.new(key)
        mat.use_nodes = True
        tree = mat.node_tree
        _clear(tree)
        out = tree.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
        bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (250, 0)
        tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        base = tree.nodes.new("ShaderNodeTexImage"); base.location = (-420, 320)
        base.image = _image(derived / spec["base"], "sRGB")
        tree.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_clip:
            tree.links.new(base.outputs["Alpha"], bsdf.inputs["Alpha"])
            mat.surface_render_method = "DITHERED"
            mat["alphaMode"] = "MASK"
        orm = tree.nodes.new("ShaderNodeTexImage"); orm.location = (-420, 0)
        orm.image = _image(derived / spec["orm"], "Non-Color")
        sep = tree.nodes.new("ShaderNodeSeparateColor"); sep.location = (-120, 0)
        tree.links.new(orm.outputs["Color"], sep.inputs["Color"])
        tree.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        tree.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        group = tree.nodes.new("ShaderNodeGroup"); group.node_tree = _gltf_output_group()
        group.location = (250, -360)
        tree.links.new(sep.outputs["Red"], group.inputs["Occlusion"])
        normal = tree.nodes.new("ShaderNodeTexImage"); normal.location = (-420, -360)
        normal.image = _image(derived / spec["normal"], "Non-Color")
        normal_map = tree.nodes.new("ShaderNodeNormalMap"); normal_map.location = (-120, -360)
        normal_map.inputs["Strength"].default_value = normal_strength
        tree.links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
        mat.use_backface_culling = not double_sided
        mat["polyhavenSource"] = spec.get("source", spec_name)
        self.materials[key] = mat
        self.tiles[key] = float(spec["tile"])
        return mat

    def simple(self, key: str, base: Vec3, rough: float, metal: float = 0.0, *,
               alpha: float = 1.0, emissive: Vec3 | None = None,
               emissive_strength: float = 0.0, blended: bool = False,
               double_sided: bool = False) -> bpy.types.Material:
        if key in self.materials:
            return self.materials[key]
        mat = bpy.data.materials.new(key)
        mat.use_nodes = True
        tree = mat.node_tree
        _clear(tree)
        out = tree.nodes.new("ShaderNodeOutputMaterial")
        bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
        tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        bsdf.inputs["Base Color"].default_value = (*base, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Alpha"].default_value = alpha
        if emissive is not None:
            bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emissive_strength
        mat.surface_render_method = "BLENDED" if blended else "DITHERED"
        mat.use_backface_culling = not double_sided
        self.materials[key] = mat
        self.tiles[key] = 1.0
        return mat

    def palette(self, key: str, colors: dict[str, Vec3], *, rough: float = 0.85,
                swatch_px: int = 64, grid: int = 4, metal: float = 0.0,
                emissive_strength: float = 0.0) -> dict[str, PaletteSwatch]:
        """Build a nearest-filtered swatch texture + material; returns swatches by name.

        ``emissive_strength`` > 0 also feeds the swatch colour into Emission, which
        gives one material for every coloured light (navigation lights, bulbs).
        """
        import numpy as np
        if len(colors) > grid * grid:
            raise ValueError("palette grid too small")
        size = swatch_px * grid
        pixels = np.zeros((size, size, 4), dtype=np.float32)
        pixels[..., 3] = 1.0
        swatches: dict[str, PaletteSwatch] = {}
        derived = TEXTURES / self.texture_pack / "_derived"
        derived.mkdir(parents=True, exist_ok=True)
        path = derived / f"{key.lower()}.png"
        mat = bpy.data.materials.new(key)
        for index, (name, rgb) in enumerate(colors.items()):
            gx, gy = index % grid, index // grid
            pixels[gy * swatch_px:(gy + 1) * swatch_px, gx * swatch_px:(gx + 1) * swatch_px, :3] = rgb
            swatches[name] = PaletteSwatch(mat, (gx + 0.5) / grid, (gy + 0.5) / grid, name)
        image = bpy.data.images.new(f"ZONE_{path.name}", width=size, height=size, alpha=True)
        image.colorspace_settings.name = "sRGB"
        image.pixels = pixels.ravel().tolist()
        image.filepath_raw = str(path)
        image.file_format = "PNG"
        image.save()
        mat.use_nodes = True
        tree = mat.node_tree
        _clear(tree)
        out = tree.nodes.new("ShaderNodeOutputMaterial")
        bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
        tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
        tex = tree.nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.interpolation = "Closest"   # NEAREST sampling keeps swatches crisp at any distance
        tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        if emissive_strength > 0:
            tree.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = emissive_strength
        self.materials[key] = mat
        self.tiles[key] = 1.0
        return swatches

    # ---- object creation ---------------------------------------------------- #

    def _finish(self, obj: bpy.types.Object, mat, lod: str,
                tags: dict | None, bevel: float, uv_locked: bool = False) -> bpy.types.Object:
        if isinstance(mat, PaletteSwatch):
            obj.data.materials.append(mat.material)
            layer = obj.data.uv_layers.get("UVMap") or obj.data.uv_layers.new(name="UVMap")
            for loop in layer.data:
                loop.uv = (mat.u, mat.v)
            uv_locked = True
        else:
            obj.data.materials.append(mat)
        obj["harborZone"] = self.harbor_zone
        obj["harbor_v2_role"] = "render_mesh"
        obj["gameplayRole"] = "decorative"
        obj["zoneLod"] = lod
        if uv_locked:
            obj["uvLocked"] = True
        if tags:
            for key, value in tags.items():
                obj[key] = value
        if bevel > 0:
            mod = obj.modifiers.new("EDGE_BEVEL", "BEVEL")
            mod.width = bevel
            mod.segments = 1
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(40)
        self.link(obj, "RENDER_LOD0" if lod == "LOD0" else "RENDER_LOD1" if lod == "LOD1" else "RENDER_SHARED")
        return obj

    def box(self, name: str, size: Vec3, center: Vec3, mat: bpy.types.Material, *,
            lod: str = "LOD0", bevel: float = 0.0, rot_y: float = 0.0,
            tags: dict | None = None) -> bpy.types.Object:
        """Axis-aligned box; size/center in Three.js (x, y, z) meters."""
        sx, sy, sz = size
        mesh = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector((sx, sz, sy)), verts=bm.verts)  # x, depth(z->-y), height
        bm.to_mesh(mesh); bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = to_blender(center)
        # Three.js rotation about +Y (up) equals Blender rotation about +Z with same sign.
        obj.rotation_euler = (0.0, 0.0, rot_y)
        return self._finish(obj, mat, lod, tags, bevel)

    def cylinder(self, name: str, radius: float, height: float, center: Vec3,
                 mat: bpy.types.Material, *, segments: int = 12, radius_top: float | None = None,
                 axis: str = "y", lod: str = "LOD0", tags: dict | None = None,
                 rot: Vec3 = (0.0, 0.0, 0.0)) -> bpy.types.Object:
        """Cylinder whose axis is Three.js y (up) by default; axis "x"/"z" lay it down."""
        mesh = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segments,
            radius1=radius, radius2=radius if radius_top is None else radius_top,
            depth=height,
        )
        bm.to_mesh(mesh); bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = to_blender(center)
        if axis == "x":
            obj.rotation_euler = (0.0, math.pi / 2, 0.0)
        elif axis == "z":
            obj.rotation_euler = (math.pi / 2, 0.0, 0.0)
        if any(rot):
            obj.rotation_euler = Vector(obj.rotation_euler) + Vector(rot)
        return self._finish(obj, mat, lod, tags, 0.0)

    def mesh(self, name: str, verts: list[Vec3], faces: list[tuple[int, ...]],
             mat: bpy.types.Material, *, lod: str = "LOD0", tags: dict | None = None,
             uvs: list[tuple[float, float]] | None = None, bevel: float = 0.0,
             smooth: bool = False, force_recalc: bool = False) -> bpy.types.Object:
        """Arbitrary mesh from Three.js-space vertices (world coordinates)."""
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([to_blender(v) for v in verts], [], faces)
        mesh.update()
        # Winding is authored in Three.js space; the Z-up conversion mirrors it.
        # Closed volumes get consistent outward normals, open sheets face up.
        bm = bmesh.new(); bm.from_mesh(mesh)
        closed = force_recalc or all(len(edge.link_faces) == 2 for edge in bm.edges)
        if closed and len(bm.faces) > 1:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        else:
            flip = [f for f in bm.faces if f.normal.z < -0.05]
            if flip:
                bmesh.ops.reverse_faces(bm, faces=flip)
        bm.to_mesh(mesh); bm.free(); mesh.update()
        if uvs is not None:
            layer = mesh.uv_layers.new(name="UVMap")
            for poly in mesh.polygons:
                for loop_index in poly.loop_indices:
                    layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
        if smooth:
            for poly in mesh.polygons:
                poly.use_smooth = True
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return self._finish(obj, mat, lod, tags, bevel, uv_locked=uvs is not None)

    def torus(self, name: str, center: Vec3, radius: float, tube: float, mat,
              *, segments: int = 48, profile: int = 6, axis: str = "z",
              arc: tuple[float, float] | None = None, lod: str = "LOD0",
              tags: dict | None = None, smooth: bool = True) -> bpy.types.Object:
        """Ring (or ring arc) in Three.js meters. ``axis`` is the ring normal: "z"
        gives a wheel standing in the x-y plane, "y" a ring lying flat."""
        a0, a1 = arc if arc else (0.0, math.tau)
        closed = arc is None
        verts: list[Vec3] = []
        faces: list[tuple[int, ...]] = []
        count = segments if closed else segments + 1
        for i in range(count):
            t = a0 + (a1 - a0) * (i / segments)
            cx, cy = math.cos(t), math.sin(t)
            for j in range(profile):
                p = math.tau * j / profile
                r = radius + tube * math.cos(p)
                h = tube * math.sin(p)
                if axis == "z":
                    verts.append((center[0] + r * cx, center[1] + r * cy, center[2] + h))
                elif axis == "y":
                    verts.append((center[0] + r * cx, center[1] + h, center[2] + r * cy))
                else:
                    verts.append((center[0] + h, center[1] + r * cy, center[2] + r * cx))
        ring_count = count if closed else count - 1
        for i in range(ring_count):
            n = (i + 1) % count
            for j in range(profile):
                k = (j + 1) % profile
                faces.append((i * profile + j, n * profile + j, n * profile + k, i * profile + k))
        return self.mesh(name, verts, faces, mat, lod=lod, tags=tags, smooth=smooth, force_recalc=True)

    def plane(self, name: str, size: tuple[float, float], center: Vec3,
              mat: bpy.types.Material, *, normal: str = "y", lod: str = "LOD0",
              tags: dict | None = None, rot_y: float = 0.0) -> bpy.types.Object:
        """Single quad; ``normal`` is the Three.js axis the quad faces (+y up by default)."""
        w, h = size
        if normal == "y":
            verts = [(-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2)]
        elif normal == "z":
            verts = [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)]
        else:
            verts = [(0, -h / 2, w / 2), (0, -h / 2, -w / 2), (0, h / 2, -w / 2), (0, h / 2, w / 2)]
        cos_r, sin_r = math.cos(rot_y), math.sin(rot_y)
        rotated = [(x * cos_r + z * sin_r, y, -x * sin_r + z * cos_r) for x, y, z in verts]
        world = [(center[0] + x, center[1] + y, center[2] + z) for x, y, z in rotated]
        uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
        obj = self.mesh(name, world, [(0, 1, 2, 3)], mat, lod=lod, tags=tags, uvs=uvs)
        return obj

    # ---- shipped colliders --------------------------------------------------- #

    def collider(self, name: str, minimum: Vec3, maximum: Vec3, *,
                 ladder: str | None = None) -> bpy.types.Object:
        """Movement collider this zone ships for a prop it introduces.

        Exported as ``COL_MOVE_<ZONE>_<NAME>``; MapAssetLoader turns any COL_MOVE_*
        node into a world-space AABB, so the box is authored in Three.js meters and
        must match the visual it protects (validator: inside the footprint, outside
        clearance volumes, not overlapping a procedural gameplay collider).

        ``ladder="+z"`` (or "-z"/"+x"/"-x") exports ``COL_LADDER_<ZONE>_<NAME>``
        instead: the column still blocks movement but players climb it from the
        given side (the value is the ``ladderApproach`` extra read by the client).
        """
        (x0, y0, z0), (x1, y1, z1) = minimum, maximum
        if x1 <= x0 or y1 <= y0 or z1 <= z0:
            raise ValueError(f"collider {name} has a non-positive extent: {minimum} -> {maximum}")
        if ladder is not None and ladder not in ("+x", "-x", "+z", "-z"):
            raise ValueError(f"ladder approach must be +x/-x/+z/-z, got {ladder!r}")
        kind = "LADDER" if ladder else "MOVE"
        full = f"COL_{kind}_{self.zone_id}_{name.upper()}"
        if bpy.data.objects.get(full) is not None:
            raise ValueError(f"duplicate collider name {full}")
        mesh = bpy.data.meshes.new(full)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector((x1 - x0, z1 - z0, y1 - y0)), verts=bm.verts)
        bm.to_mesh(mesh); bm.free()
        obj = bpy.data.objects.new(full, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = to_blender(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        obj.display_type = "WIRE"
        obj.show_in_front = True
        obj.hide_render = True
        obj["harborZone"] = self.harbor_zone
        obj["harbor_v2_role"] = "ladder_collider" if ladder else "movement_collider"
        obj["gameplayRole"] = "collision"
        obj["colliderMin"] = [x0, y0, z0]
        obj["colliderMax"] = [x1, y1, z1]
        if ladder:
            obj["ladderApproach"] = ladder
        self.link(obj, "COLLISION_ZONE")
        return obj

    def zone_colliders(self) -> list[bpy.types.Object]:
        return [obj for obj in self.collections["COLLISION_ZONE"].objects if obj.type == "MESH"]

    # ---- reference volumes -------------------------------------------------- #

    def import_reference_colliders(self, json_path: Path, bbox: tuple[Vec3, Vec3]) -> int:
        """Load procedural collider AABBs that intersect bbox as locked wire boxes."""
        data = json.loads(Path(json_path).read_text())
        (x0, y0, z0), (x1, y1, z1) = bbox
        material = self.simple("MAT_COLLISION_REF", (0.9, 0.25, 0.2), 0.9)
        count = 0
        for item in data["colliders"]:
            lo, hi = item["min"], item["max"]
            if hi["x"] < x0 or lo["x"] > x1 or hi["z"] < z0 or lo["z"] > z1 or hi["y"] < y0 or lo["y"] > y1:
                continue
            if item.get("ferrisCabin"):
                continue
            size = (hi["x"] - lo["x"], hi["y"] - lo["y"], hi["z"] - lo["z"])
            center = ((lo["x"] + hi["x"]) / 2, (lo["y"] + hi["y"]) / 2, (lo["z"] + hi["z"]) / 2)
            mesh = bpy.data.meshes.new(f"REF_COL_{item['index']:03d}")
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=Vector((max(size[0], 0.001), max(size[2], 0.001), max(size[1], 0.001))), verts=bm.verts)
            bm.to_mesh(mesh); bm.free()
            obj = bpy.data.objects.new(mesh.name, mesh)
            bpy.context.scene.collection.objects.link(obj)
            obj.location = to_blender(center)
            obj.data.materials.append(material)
            obj.display_type = "WIRE"
            obj.show_in_front = True
            obj.hide_render = True
            obj["colliderIndex"] = item["index"]
            obj["colliderMin"] = [lo["x"], lo["y"], lo["z"]]
            obj["colliderMax"] = [hi["x"], hi["y"], hi["z"]]
            self.link(obj, "COLLISION")
            count += 1
        return count

    def import_reference_glb(self, glb_path: Path, keep_bbox: tuple[Vec3, Vec3] | None = None) -> int:
        """Import the live cinematic GLB as a locked spatial reference (never exported)."""
        before = set(bpy.data.objects)
        import contextlib
        import io
        import logging
        for name in list(logging.root.manager.loggerDict):
            if "gltf" in name.lower():
                logging.getLogger(name).setLevel(logging.WARNING)
        with contextlib.redirect_stdout(io.StringIO()):
            bpy.ops.import_scene.gltf(filepath=str(glb_path))
        imported = [obj for obj in bpy.data.objects if obj not in before]
        kept = 0
        for obj in imported:
            if obj.type == "MESH" and keep_bbox is not None:
                world = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
                xs = [p.x for p in world]; ys = [p.y for p in world]
                (x0, _, z0), (x1, _, z1) = keep_bbox
                # Blender y = -three z
                if max(xs) < x0 - 20 or min(xs) > x1 + 20 or max(ys) < -z1 - 20 or min(ys) > -z0 + 20:
                    bpy.data.objects.remove(obj)
                    continue
            obj.name = f"REF_{obj.name}"
            obj.hide_render = True
            obj.hide_select = True
            if obj.type == "MESH":
                # spatial reference only: drop textured materials so the zone
                # .blend does not embed the whole cinematic texture set
                obj.data.materials.clear()
                obj.data.materials.append(self.simple("MAT_REFERENCE_GREY", (0.45, 0.45, 0.47), 0.9))
            self.link(obj, "REFERENCE")
            kept += 1
        # purge orphaned cinematic materials/images
        for material in list(bpy.data.materials):
            if material.users == 0 and material.name not in self.materials:
                bpy.data.materials.remove(material)
        for image in list(bpy.data.images):
            if image.users == 0 and not image.name.startswith("ZONE_"):
                bpy.data.images.remove(image)
        return kept

    def add_reference_image(self, image_path: Path, name: str, center: Vec3,
                            width_m: float, rotation_z: float = 0.0, height_m: float | None = None) -> bpy.types.Object:
        """Reference image plane lying flat (top-down orthographic) in REFERENCE."""
        image = bpy.data.images.load(str(image_path), check_existing=True)
        aspect = image.size[1] / max(image.size[0], 1)
        height_m = height_m or width_m * aspect
        mesh = bpy.data.meshes.new(name)
        hw, hh = width_m / 2, height_m / 2
        mesh.from_pydata([(-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0)], [], [(0, 1, 2, 3)])
        layer = mesh.uv_layers.new(name="UVMap")
        for loop, uv in zip(mesh.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            layer.data[loop.index].uv = uv
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = to_blender(center)
        obj.rotation_euler = (0.0, 0.0, rotation_z)
        mat = bpy.data.materials.new(f"MAT_REF_{name}")
        mat.use_nodes = True
        tree = mat.node_tree
        _clear(tree)
        out = tree.nodes.new("ShaderNodeOutputMaterial")
        emission = tree.nodes.new("ShaderNodeEmission")
        tex = tree.nodes.new("ShaderNodeTexImage"); tex.image = image
        tree.links.new(tex.outputs["Color"], emission.inputs["Color"])
        tree.links.new(emission.outputs["Emission"], out.inputs["Surface"])
        mesh.materials.append(mat)
        obj.hide_render = True
        obj.hide_select = True
        self.link(obj, "REFERENCE")
        return obj

    # ---- finishing ---------------------------------------------------------- #

    def render_objects(self) -> list[bpy.types.Object]:
        result = []
        for name in ("RENDER_LOD0", "RENDER_LOD1", "RENDER_SHARED") + self.dynamic_collections:
            result.extend(obj for obj in self.collections[name].all_objects if obj.type == "MESH")
        return result

    def rig_nodes(self) -> list[bpy.types.Object]:
        result = []
        for name in self.dynamic_collections + ("SOCKETS",):
            result.extend(obj for obj in self.collections[name].objects if obj.type == "EMPTY")
        return result

    def project_box_uvs(self) -> int:
        """World-space box projection, 1 UV unit = material tile in meters."""
        count = 0
        for obj in self.render_objects():
            if obj.get("uvLocked"):
                continue
            if not obj.material_slots or obj.material_slots[0].material is None:
                continue
            tile = self.tiles.get(obj.material_slots[0].material.name, 1.0)
            mesh = obj.data
            bm = bmesh.new(); bm.from_mesh(mesh)
            uv_layer = bm.loops.layers.uv.verify()
            mw = obj.matrix_world; rot = mw.to_3x3()
            for face in bm.faces:
                n = rot @ face.normal
                if n.length == 0:
                    continue
                n.normalize()
                axis = max(range(3), key=lambda i: abs(n[i]))
                for loop in face.loops:
                    p = mw @ loop.vert.co
                    if axis == 0:
                        u, v = (-p.y if n.x > 0 else p.y), p.z
                    elif axis == 1:
                        u, v = (p.x if n.y > 0 else -p.x), p.z
                    else:
                        u, v = p.x, (p.y if n.z > 0 else -p.y)
                    loop[uv_layer].uv = (u / tile, v / tile)
            bm.to_mesh(mesh); bm.free(); mesh.update()
            count += 1
        return count

    def batch_by_material(self, lod: str, *, keep_separate: set[str] | None = None) -> list[bpy.types.Object]:
        """Join objects of one LOD tier that share material + tags into single meshes.

        Objects carrying ``instanceKey`` or listed in keep_separate stay as they are.
        Modifiers are applied before joining. Result names follow
        ``MESH_<ZONE>_<MATERIAL>[_<TAG>]_<LOD>``.
        """
        keep_separate = keep_separate or set()
        collection = self.collections["RENDER_LOD0" if lod == "LOD0" else "RENDER_LOD1"]
        groups: dict[tuple, list[bpy.types.Object]] = {}
        # (collection name, parent rig node or None) is part of the key so meshes hanging
        # under a RIG_ empty are joined per parent and keep following it.
        sources = [(collection, obj) for obj in collection.all_objects]
        for dyn in self.dynamic_collections:
            sources.extend((self.collections[dyn], obj) for obj in self.collections[dyn].objects)
        for source_collection, obj in list(sources):
            if obj.type != "MESH" or obj.get("instanceKey") or obj.name in keep_separate:
                continue
            if source_collection.name != collection.name and obj.get("zoneLod") != lod:
                continue
            mat = obj.material_slots[0].material if obj.material_slots else None
            # castShadow is decided by MapAssetLoader from the batch name, so it is
            # deliberately not part of the grouping key (fewer draw calls).
            key = (
                mat.name if mat else "NONE",
                obj.get("weaponImpactKind", ""),
                obj.get("ambientMotion", ""),
                bool(obj.get("ignoreWeaponRaycast", False)),
                source_collection.name,
                obj.parent.name if obj.parent is not None else "",
            )
            groups.setdefault(key, []).append(obj)

        results = []
        depsgraph = bpy.context.evaluated_depsgraph_get()
        bpy.context.view_layer.update()
        for key, objects in groups.items():
            mat_name, impact, motion, ignore_ray, source_name, parent_name = key
            label = mat_name.removeprefix("MAT_")
            if motion:
                label += f"_{motion.upper().replace('-', '_')}"
            # MapAssetLoader tags weapon impact surfaces by name token, so batches
            # carrying foliage/water impact kinds must spell it out in the name.
            prefix = f"IMPACT_{impact.upper()}_" if impact and impact != "solid" else ""
            if ignore_ray:
                label += "_NORAY"
            parent = bpy.data.objects.get(parent_name) if parent_name else None
            if parent is not None:
                # RIG_<ZONE>_CABIN_3 -> CABIN_3
                label = parent.name.split(f"_{self.zone_id}_", 1)[-1] + "_" + label
            name = f"MESH_{self.zone_id}_{prefix}{label}_{lod}"
            suffix = 1
            while bpy.data.objects.get(name) is not None:
                name = f"MESH_{self.zone_id}_{prefix}{label}_B{suffix}_{lod}"
                suffix += 1
            material = objects[0].material_slots[0].material if objects[0].material_slots else None
            # Operator-free join: evaluate modifiers through the depsgraph and
            # merge world-space geometry with bmesh (works in background mode too).
            bm = bmesh.new()
            uv_layer = bm.loops.layers.uv.verify()
            for obj in objects:
                evaluated = obj.evaluated_get(depsgraph)
                mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
                mesh.transform(obj.matrix_world)
                bm.from_mesh(mesh)
                bpy.data.meshes.remove(mesh)
            # weld duplicate vertices produced by adjoining boxes of one material
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
            merged = bpy.data.meshes.new(name)
            bm.to_mesh(merged)
            bm.free()
            if parent is not None:
                # bake the world-space join into the parent's local frame so the
                # exported node is a plain child of the rig empty
                merged.transform(parent.matrix_world.inverted())
            merged.update()
            if material is not None:
                merged.materials.append(material)
            joined = bpy.data.objects.new(name, merged)
            bpy.context.scene.collection.objects.link(joined)
            if parent is not None:
                joined.parent = parent
                joined["rigParent"] = parent.name
            castless = all(obj.get("castShadow") is False for obj in objects)
            for obj in objects:
                data = obj.data
                bpy.data.objects.remove(obj)
                if data.users == 0:
                    bpy.data.meshes.remove(data)
            self.link(joined, source_name)
            if castless:
                joined["castShadow"] = False
            joined["zoneLod"] = lod
            joined["harborZone"] = self.harbor_zone
            joined["harbor_v2_role"] = "render_mesh"
            joined["gameplayRole"] = "decorative"
            joined["zonePass"] = f"{self.zone_id}_ZONE_PASS"
            if impact:
                joined["weaponImpactKind"] = impact
            else:
                joined["weaponImpactKind"] = "solid"
            if motion:
                joined["ambientMotion"] = motion
            if ignore_ray:
                joined["ignoreWeaponRaycast"] = True
            results.append(joined)
        # instanced props stay separate meshes (collapsed into InstancedMesh by the
        # client) but still need the zone namespace + LOD suffix for the exporter
        counters: dict[str, int] = {}
        remaining = [(collection, obj) for obj in collection.all_objects]
        for dyn in self.dynamic_collections:
            remaining.extend((self.collections[dyn], obj) for obj in self.collections[dyn].objects)
        for source_collection, obj in remaining:
            if obj.type != "MESH" or not obj.get("instanceKey"):
                continue
            if source_collection.name != collection.name and obj.get("zoneLod") != lod:
                continue
            if obj.name.startswith(f"MESH_{self.zone_id}_"):
                continue
            key = str(obj["instanceKey"]).upper().replace("-", "_")
            index = counters.get(key, 0)
            counters[key] = index + 1
            obj.name = f"MESH_{self.zone_id}_INST_{key}_{index}_{lod}"
            obj.data.name = obj.name
            obj["zoneLod"] = lod
        bpy.ops.object.select_all(action="DESELECT")
        return results

    def apply_all_modifiers(self) -> None:
        for obj in self.render_objects():
            if obj.modifiers:
                bpy.context.view_layer.objects.active = obj
                for mod in list(obj.modifiers):
                    bpy.ops.object.modifier_apply(modifier=mod.name)

    def stats(self) -> dict:
        out = {}
        for name in ("RENDER_LOD0", "RENDER_LOD1", "RENDER_SHARED") + self.dynamic_collections:
            tris = {"LOD0": 0, "LOD1": 0}; draws = {"LOD0": 0, "LOD1": 0}
            for obj in self.collections[name].all_objects:
                if obj.type != "MESH":
                    continue
                lod = "LOD1" if obj.name.endswith("_LOD1") or obj.get("zoneLod") == "LOD1" else "LOD0"
                obj.data.calc_loop_triangles()
                tris[lod] += len(obj.data.loop_triangles)
                draws[lod] += max(1, len(obj.material_slots))
            entry = {"objects": len(self.collections[name].objects)}
            if name in self.dynamic_collections:
                entry.update({"lod0Triangles": tris["LOD0"], "lod0DrawCalls": draws["LOD0"],
                              "lod1Triangles": tris["LOD1"], "lod1DrawCalls": draws["LOD1"],
                              "rigNodes": sum(1 for o in self.collections[name].objects if o.type == "EMPTY")})
            else:
                entry.update({"triangles": tris["LOD0"] + tris["LOD1"], "drawCalls": draws["LOD0"] + draws["LOD1"]})
            out[name] = entry
        out["COLLISION_ZONE"] = {"objects": len(self.zone_colliders())}
        return out
