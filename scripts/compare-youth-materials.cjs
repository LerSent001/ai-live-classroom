// Evidence arrangement only: both sides are actual browser screenshots.
/* eslint-disable @typescript-eslint/no-require-imports -- standalone QA */
const sharp = require('sharp');
const path = require('node:path');
const directory = path.resolve('output/youth-material-study');
async function pair(name, crop) {
  const images = await Promise.all(['flat-before.png', 'textured-final.png'].map(async file => {
    const image = sharp(path.join(directory, file));
    return (crop ? image.extract(crop) : image).png().toBuffer();
  }));
  const { width, height } = await sharp(images[0]).metadata();
  await sharp({ create: { width: width * 2, height, channels: 3, background: '#fff' } })
    .composite(images.map((input, index) => ({ input, left: width * index, top: 0 })))
    .png().toFile(path.join(directory, name));
}
(async () => {
  await pair('comparison.png');
  await pair('comparison-window.png', { left: 0, top: 135, width: 420, height: 455 });
  await pair('comparison-wall-wood.png', { left: 760, top: 155, width: 460, height: 590 });
})().catch(error => { console.error(error); process.exitCode = 1; });
