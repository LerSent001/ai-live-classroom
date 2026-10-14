"""Repack embedded GLB textures at <=512 px; preserve geometry and VRM metadata."""
import io
import json
import struct
from pathlib import Path
from PIL import Image

source = Path('output/vroid-reference/hair-female.vrm').read_bytes()
size = struct.unpack_from('<I', source, 12)[0]
document = json.loads(source[20:20 + size])
binary = source[28 + size:]
images = {item['bufferView']: item for item in document['images']}
packed = bytearray()
for index, view in enumerate(document['bufferViews']):
    start = view.get('byteOffset', 0)
    content = binary[start:start + view['byteLength']]
    if index in images:
        image = Image.open(io.BytesIO(content))
        image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        image.save(output, format='PNG', optimize=True)
        content = output.getvalue()
        images[index]['mimeType'] = 'image/png'
    packed.extend(b'\0' * (-len(packed) % 4))
    view['byteOffset'] = len(packed)
    view['byteLength'] = len(content)
    packed.extend(content)
packed.extend(b'\0' * (-len(packed) % 4))
document['buffers'][0]['byteLength'] = len(packed)
encoded = json.dumps(document, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
result = struct.pack('<III', 0x46546c67, 2, 28 + len(encoded) + len(packed))
result += struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
result += struct.pack('<II', len(packed), 0x004e4942) + packed
Path('public/youth/models/hair-female.vrm').write_bytes(result)
print(json.dumps({'originalBytes': len(source), 'optimizedBytes': len(result), 'textureLimit': 512}))
