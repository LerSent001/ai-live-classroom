// Mechanical packing/resampling of existing project textures, not new AI art.
/* eslint-disable @typescript-eslint/no-require-imports -- offline asset build */
const sharp = require('sharp');
const fs = require('node:fs');
(async () => {
  const board = await sharp('public/youth/chalkboard.webp').resize(1536, 549).png().toBuffer();
  const wall = await sharp('public/youth/plaster.webp').extract({ left: 0, top: 160, width: 512, height: 192 }).png().toBuffer();
  const wood = await sharp('public/youth/oak.webp').rotate(90).resize(1024, 192).png().toBuffer();
  await sharp({ create: { width: 1536, height: 768, channels: 3, background: '#ffffff' } })
    .composite([{ input: board, left: 0, top: 0 }, { input: wall, left: 0, top: 560 }, { input: wood, left: 512, top: 560 }])
    .webp({ quality: 90 }).toFile('public/youth/surfaces.webp');
  const manifest = { width: 1536, height: 768, bytes: fs.statSync('public/youth/surfaces.webp').size,
    previousBaseTexels: 2048 * 732, baseTexels: 1536 * 768,
    regions: { board: [2, 2, 1532, 545], plaster: [4, 564, 504, 184], wood: [516, 564, 1016, 184], white: [12, 760, 1, 1] } };
  fs.writeFileSync('public/youth/surfaces.json', JSON.stringify(manifest, null, 2) + '\n');
  console.log(manifest);
})().catch(error => { console.error(error); process.exitCode = 1; });
