"""Offline Cycles bake; runtime only downloads a light atlas and packed UVs.
blender -b -t 2 --python scripts/bake-youth-lighting.py -- source.json output-dir
The warm/cool grading below is adapted from Sakuragaoka Station (MIT),
src/core/renderer.js @ 4112f57208b7e29998344ca71fef74202c2b2bdd.
"""
import bpy
import json
import math
import os
import sys
from array import array
from mathutils import Vector
import numpy as np

source, output = sys.argv[sys.argv.index("--") + 1:]
os.makedirs(output, exist_ok=True)
with open(source, encoding="utf-8") as handle:
    exported = json.load(handle)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.cycles.max_bounces = 3
scene.cycles.diffuse_bounces = 2
scene.cycles.use_denoising = True
scene.render.threads_mode = "FIXED"
scene.render.threads = 2
scene.render.bake.margin = 5
scene.render.bake.use_clear = False
scene.render.bake.use_pass_direct = True
scene.render.bake.use_pass_indirect = True
scene.render.bake.use_pass_color = False

size = 1536
image = bpy.data.images.new("Youth static irradiance", width=size, height=size, alpha=True, float_buffer=True)
image.generated_color = (0, 0, 0, 0)
image.colorspace_settings.name = "Linear Rec.709"
objects = []
for entry in exported["meshes"]:
    raw = entry["positions"]
    normals = entry["normals"]
    vertices, lookup, faces = [], {}, []
    for i in range(0, len(raw), 9):
        face = []
        for j in range(i, i + 9, 3):
            point = (raw[j], -raw[j + 2], raw[j + 1])
            key = tuple(round(v, 6) for v in point)
            if key not in lookup:
                lookup[key] = len(vertices)
                vertices.append(point)
            face.append(lookup[key])
        faces.append(face)
    mesh = bpy.data.meshes.new(f"batch-{entry['index']}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    assert len(mesh.loops) == len(raw) // 3, "Bake may not change topology"
    mesh.normals_split_custom_set([(normals[i], -normals[i + 2], normals[i + 1]) for i in range(0, len(normals), 3)])
    mesh.uv_layers.new(name="lightmap")
    obj = bpy.data.objects.new(mesh.name, mesh)
    scene.collection.objects.link(obj)
    # Glass and the two-triangle daylight background never occlude the fixed
    # daylight. All shadow casting is baked offline, never rendered at runtime.
    obj.visible_shadow = entry["casts"]
    material = bpy.data.materials.new(mesh.name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    diffuse = nodes.get("Principled BSDF")
    diffuse.inputs["Base Color"].default_value = (.8, .8, .8, 1)
    diffuse.inputs["Roughness"].default_value = 1
    diffuse.inputs["Specular IOR Level"].default_value = 0
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    obj.data.materials.append(material)
    objects.append(obj)

for obj in objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.004, area_weight=.25, correct_aspect=True)
bpy.ops.object.mode_set(mode="OBJECT")

world = bpy.data.worlds.new("Cool skylight")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.48, .61, .9, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .65
scene.world = world
sun = bpy.data.lights.new("Fixed warm daylight", "SUN")
sun.energy = 1.65
sun.color = (1, .87, .7)
sun.angle = .065
sun_object = bpy.data.objects.new(sun.name, sun)
scene.collection.objects.link(sun_object)
sun_object.rotation_euler = Vector((.78, .35, -.69)).to_track_quat("-Z", "Y").to_euler()
for z in (-2, 2.5, 7):
    fill = bpy.data.lights.new("Window bounce", "AREA")
    fill.energy = 75
    fill.color = (.69, .8, 1)
    fill.shape = "RECTANGLE"
    fill.size = 2.5
    fill.size_y = 2.5
    obj = bpy.data.objects.new(fill.name, fill)
    scene.collection.objects.link(obj)
    obj.location = (-5.45, -z, 3.2)
    obj.rotation_euler = Vector((1, 0, -.25)).to_track_quat("-Z", "Y").to_euler()

print("Baking static classroom daylight", flush=True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.object.bake(type="DIFFUSE")

# Denoise the bake offline with Blender's OpenImageDenoise compositor. Baking
# itself does not honor Cycles' render denoising checkbox.
scene.use_nodes = True
tree = scene.node_tree
tree.nodes.clear()
source_node = tree.nodes.new("CompositorNodeImage")
source_node.image = image
denoise = tree.nodes.new("CompositorNodeDenoise")
denoise.use_hdr = True
destination = tree.nodes.new("CompositorNodeOutputFile")
destination.base_path = os.path.abspath(output)
destination.file_slots[0].path = "denoised-"
destination.format.file_format = "OPEN_EXR"
destination.format.color_depth = "32"
tree.links.new(source_node.outputs["Image"], denoise.inputs["Image"])
tree.links.new(denoise.outputs["Image"], destination.inputs[0])
camera = bpy.data.objects.new("Bake compositor trigger", bpy.data.cameras.new("Bake camera"))
scene.collection.objects.link(camera)
camera.location = (0, 0, 100)
scene.camera = camera
scene.render.resolution_x = scene.render.resolution_y = 8
scene.cycles.samples = 1
bpy.ops.render.render()
denoised = bpy.data.images.load(os.path.join(output, "denoised-0001.exr"), check_existing=False)

# Adapt the reference's cool shadows / warm highlights offline. No full-screen
# framebuffer, noise shader, film grain or bloom remains in the browser.
pixels = np.empty(size * size * 4, dtype=np.float32)
denoised.pixels.foreach_get(pixels)
rgba = pixels.reshape((-1, 4))
# Fixed blue-violet fill keeps this a bright painted classroom, even underneath
# desks. Fine surface shadows still come from the real geometry in the bake.
rgb = np.maximum(rgba[:, :3], 0) * .95 + np.array([.14, .16, .25], dtype=np.float32)
print("Irradiance percentiles", np.percentile(rgb, [5, 50, 95, 99]), flush=True)
def smoothstep(lo, hi, value):
    t = np.clip((value - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)
rgb = np.minimum(rgb, .78) + .22 * (1 - np.exp(-np.maximum(rgb - .78, 0) / .22))
luma = rgb[:, 0] * .2126 + rgb[:, 1] * .7152 + rgb[:, 2] * .0722
cool = (1 - smoothstep(.08, .55, luma))[:, None] * .55
rgb *= 1 + cool * np.array([-.1, -.08, .1])
rgb += smoothstep(.55, 1, luma)[:, None] * np.array([.022, .012, -.012])
rgba[:, :3] = np.maximum(rgb, 0)
rgba[:, 3] = 1
image.pixels.foreach_set(rgba.ravel())
image.filepath_raw = os.path.join(output, "lighting.png")
image.file_format = "PNG"
image.save()

manifest = {"version": 1, "width": size, "height": size, "samples": 48, "denoised": True, "meshes": []}
packed = array("H")
for obj, entry in zip(objects, exported["meshes"]):
    uv = obj.data.uv_layers.active.data
    assert len(uv) == len(entry["positions"]) // 3
    for loop in uv:
        packed.extend(round(max(0, min(1, float(v))) * 65535) for v in loop.uv)
    manifest["meshes"].append({"vertices": len(uv), "stamp": entry["stamp"]})
if sys.byteorder != "little":
    packed.byteswap()
with open(os.path.join(output, "lighting-uv.bin"), "wb") as handle:
    handle.write(packed.tobytes())
manifest["uvBytes"] = len(packed) * 2
with open(os.path.join(output, "lighting.json"), "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2)
print("Baked", manifest["uvBytes"], "UV bytes", flush=True)
