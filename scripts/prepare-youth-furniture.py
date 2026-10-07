"""Headless, geometry-only CC0 adaptation. No render, bake, simulation or API use.
Run Blender -b --factory-startup -t 2 --python scripts/prepare-youth-furniture.py.
The source atlas is sampled only to classify surfaces / retain authored crevice AO.
Runtime assets have vertex colors, no large PBR texture set and no animations.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/youth/models'
DEST.mkdir(parents=True, exist_ok=True)


def linear(hex_value):
    c = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4) for v in c]


palette = {k: linear(v) for k, v in {
    'wood': 'dfbf91', 'plastic': '75ada7', 'steel': '668a8f', 'rubber': '455458'
}.items()}
report = []
for asset_id, filename in [('SchoolDesk_01', 'school-desk.glb'), ('SchoolChair_01', 'school-chair.glb')]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = ROOT / 'output/youth-source' / asset_id
    bpy.ops.import_scene.gltf(filepath=str(source / f'{asset_id}.gltf'))
    diffuse = bpy.data.images.load(str(source / 'textures' / f'{asset_id}_diff_1k.jpg'))
    arm = bpy.data.images.load(str(source / 'textures' / f'{asset_id}_arm_1k.jpg'))
    rgb, channels = list(diffuse.pixels), list(arm.pixels)
    width, height = diffuse.size

    def sample(values, uv):
        x, y = int((uv.x % 1) * (width - 1)), int((uv.y % 1) * (height - 1))
        index = (y * width + x) * 4
        return values[index:index + 3]

    total_before = 0
    total_after = 0
    bounds = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        mesh = obj.data
        mesh.calc_loop_triangles()
        total_before += len(mesh.loop_triangles)
        # Dissolve redundant coplanar triangles; do not aggressively collapse the
        # authored curved silhouette, chair slots, leg bends or the desk storage lip.
        modifier = obj.modifiers.new('Remove coplanar source triangles', 'DECIMATE')
        modifier.decimate_type = 'DISSOLVE'
        modifier.angle_limit = math.radians(1)
        modifier.delimit = {'NORMAL', 'UV'}
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        mesh = obj.data
        color = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for poly in mesh.polygons:
            center_uv = sum((mesh.uv_layers.active.data[i].uv for i in poly.loop_indices), Vector((0, 0))) / len(poly.loop_indices)
            r, g, b = sample(rgb, center_uv)
            ao, rough, metallic = sample(channels, center_uv)
            surface = 'steel'
            if 'Desk' in asset_id and r > b * 1.25 and r > g * 1.08:
                surface = 'wood'
            elif 'Chair' in asset_id and b > r * 1.18:
                surface = 'plastic'
            elif max(r, g, b) < .06 and metallic < .25:
                surface = 'rubber'
            base = palette[surface]
            for i in poly.loop_indices:
                cavity = sample(channels, mesh.uv_layers.active.data[i].uv)[0]
                # Gentle source AO only; remove wear/scratches, no grain/noise maps.
                factor = .94 + .06 * max(0, min(1, cavity))
                color.data[i].color = (*[c * factor for c in base], 1)
        mesh.materials.clear()
        material = bpy.data.materials.new('CC0 campus palette')
        material.diffuse_color = (1, 1, 1, 1)
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Roughness'].default_value = .85
        color_node = material.node_tree.nodes.new('ShaderNodeVertexColor')
        color_node.layer_name = 'Color'
        material.node_tree.links.new(color_node.outputs['Color'], bsdf.inputs['Base Color'])
        mesh.materials.append(material)
        # Drop UVs to avoid fetching / exporting any original PBR maps.
        for uv in list(mesh.uv_layers):
            mesh.uv_layers.remove(uv)
        modifier = obj.modifiers.new('Web silhouette budget', 'DECIMATE')
        modifier.ratio = .55
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        mesh = obj.data
        mesh.calc_loop_triangles()
        total_after += len(mesh.loop_triangles)
        bounds.extend([obj.matrix_world @ Vector(v) for v in obj.bound_box])
        obj['source'] = f'https://polyhaven.com/a/{asset_id}'
        obj['license'] = 'CC0-1.0'
        obj['author'] = 'Ethan Place'
        obj.select_set(False)
    # Keep source physical dimensions and glTF orientation; normalize at runtime.
    bpy.ops.export_scene.gltf(filepath=str(DEST / filename), export_format='GLB', export_animations=False, export_extras=True, export_texcoords=False)
    entry = {'source': asset_id, 'file': filename, 'trianglesBefore': total_before, 'triangles': total_after,
             'bytes': (DEST / filename).stat().st_size,
             'boundsBlender': [[min(v[i] for v in bounds) for i in range(3)], [max(v[i] for v in bounds) for i in range(3)]]}
    print(json.dumps(entry))
    report.append(entry)
(DEST / 'manifest.json').write_text(json.dumps(report, indent=2) + '\n')
