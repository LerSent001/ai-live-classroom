"""Convert licensed, authored props to compact vertex-colour GLBs, offline only.
Blender --factory-startup -b -t 2 --python scripts/prepare-youth-props.py
Sources and CC0 permission are recorded in public/youth/models/props-manifest.json.
"""
import bpy
import json
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/youth/models'
assets = [
    ('monstera-plant', 'Isa Lousberg', 'https://poly.pizza/m/s9Nocqk1Ge'),
    ('pothos', 'Isa Lousberg', 'https://poly.pizza/m/QqbCvErL93'),
    ('books', 'CreativeTrio', 'https://poly.pizza/m/dxt7dETAy9'),
]
report = []
for name, author, source in assets:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'output/youth-props/source' / (name + '.glb')))
    triangles = 0
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        colours = mesh.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        cached = {}
        for poly in mesh.polygons:
            mat = mesh.materials[poly.material_index]
            image = next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image), None)
            if image and image.name not in cached:
                cached[image.name] = list(image.pixels)
            for i in poly.loop_indices:
                if image:
                    u, v = mesh.uv_layers.active.data[i].uv
                    w, h = image.size
                    index = (min(h - 1, max(0, int(v * h))) * w + min(w - 1, max(0, int(u * w)))) * 4
                    rgb = cached[image.name][index:index + 3]
                else:
                    rgb = list(mat.diffuse_color[:3])
                # Keep authored value variation, harmonise the original teal
                # Monstera palette with the classroom's natural leaf greens.
                if name == 'monstera-plant':
                    rgb = [rgb[0] * .95, rgb[1] * .82, rgb[2] * .47]
                colours.data[i].color = (*rgb, 1)
        mesh.materials.clear()
        mat = bpy.data.materials.new('Authored palette, no runtime textures')
        mat.use_nodes = True
        node = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        node.layer_name = 'Color'
        mat.node_tree.links.new(node.outputs['Color'], mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
        mesh.materials.append(mat)
        while mesh.uv_layers:
            mesh.uv_layers.remove(mesh.uv_layers[0])
        mesh.calc_loop_triangles()
        triangles += len(mesh.loop_triangles)
        obj['author'], obj['license'], obj['source'] = author, 'CC0-1.0', source
    file = DEST / (name + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', export_animations=False, export_extras=True, export_cameras=False, export_lights=False)
    report.append(dict(file=file.name, author=author, license='CC0-1.0', source=source, triangles=triangles, bytes=file.stat().st_size))
(DEST / 'props-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(report))
