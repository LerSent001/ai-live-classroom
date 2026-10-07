// Only arranges existing QA screenshots. This does not create application art.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone QA evidence utility. */
const sharp = require('sharp');
const path = require('node:path');
const out = path.resolve('output/youth-qa');
const source = path.resolve('docs/youth/selected-reference.png');
const rendered = path.join(out, 'desktop.png');

async function pair(name, crop) {
  const a = sharp(source), b = sharp(rendered);
  if (crop) { a.extract(crop); b.extract(crop); }
  const left = await a.png().toBuffer();
  const right = await b.png().toBuffer();
  const { width, height } = await sharp(left).metadata();
  await sharp({ create: { width: width * 2, height, channels: 3, background: '#f3efe4' } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: width, top: 0 }])
    .png().toFile(path.join(out, name));
}

(async () => {
  await pair('comparison-full.png');
  await pair('comparison-composer.png', { left: 1100, top: 730, width: 572, height: 200 });
  await pair('comparison-screen.png', { left: 425, top: 0, width: 380, height: 400 });
  await pair('comparison-stage.png', { left: 1500, top: 10, width: 172, height: 75 });
  await pair('comparison-furniture.png', { left: 270, top: 570, width: 430, height: 310 });
  await pair('comparison-window.png', { left: 0, top: 110, width: 370, height: 465 });
})().catch((error) => { console.error(error); process.exitCode = 1; });
