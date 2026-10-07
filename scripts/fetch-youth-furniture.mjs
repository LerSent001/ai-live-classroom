// Public CC0 assets only. No account, provider key or paid generation.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve('output/youth-source');
for (const id of ['SchoolDesk_01', 'SchoolChair_01']) {
  const metadata = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  const file = metadata.gltf['1k'].gltf;
  const files = { [`${id}.gltf`]: file, ...file.include };
  for (const [relative, entry] of Object.entries(files)) {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`${response.status}: ${entry.url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('md5').update(bytes).digest('hex') !== entry.md5) throw new Error(`Checksum: ${relative}`);
    const target = path.join(root, id, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    console.log(id, relative, bytes.length);
  }
  await writeFile(path.join(root, id, 'source.json'), JSON.stringify({ id, author: 'Ethan Place', license: 'CC0-1.0', source: `https://polyhaven.com/a/${id}`, files }, null, 2));
}
