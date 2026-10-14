/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.YOUTH_TEST_URL || 'http://localhost:3011';
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const results = [];
  try {
    for (const [width, height] of [[1440,900], [390,844]]) {
      const context = await browser.newContext({viewport: {width,height}, reducedMotion: 'reduce'});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await context.route('**/*', route => {
        const r = route.request();
        if (!r.url().startsWith(base) || (r.method() === 'POST' && /\/classroom\//.test(r.url()))) return route.abort();
        return route.continue();
      });
      await page.goto(base);
      await page.waitForSelector('[data-scene-ready="true"]');
      await page.waitForFunction(() => Number(document.querySelector('.youth-vroid-portrait canvas')?.dataset.portraitTriangles) > 0);
      await page.waitForTimeout(1500);
      const canvas = page.locator('.youth-vroid-portrait canvas');
      const before = await canvas.getAttribute('data-portrait-frames');
      await page.waitForTimeout(2500);
      assert.equal(await canvas.getAttribute('data-portrait-frames'), before, 'Idle portrait renders no extra frames');
      assert.equal(await page.locator('.youth-mentor-switch').count(), 0);
      assert.equal(await page.locator('[data-youth-portrait] img').count(), 0);
      const box = await canvas.boundingBox();
      const framing = await page.locator('.youth-vroid-portrait').boundingBox();
      assert.ok(framing.height / height >= .33 && framing.height / height <= .5);
      assert.ok(box.y + box.height >= height, 'Portrait extends behind controls to the screen edge');
      assert.ok(box.x >= 0 && box.x + box.width <= width);
      const formBox = await page.locator('.youth-composer form').boundingBox();
      const buttonBox = await page.locator('.youth-composer button[type="submit"]').boundingBox();
      assert.ok(Math.abs(formBox.x + formBox.width / 2 - width / 2) < 2, 'Composer stays horizontally centered');
      assert.ok(buttonBox.x > formBox.x && buttonBox.x + buttonBox.width < formBox.x + formBox.width, 'Button is inside input shell');
      assert.ok(buttonBox.y >= formBox.y && buttonBox.y + buttonBox.height <= formBox.y + formBox.height);
      assert.deepEqual(errors, []);
      await page.screenshot({path: `output/vroid-reference/lobby-${width}.png`});
      await page.emulateMedia({reducedMotion: 'no-preference'});
      await page.waitForFunction(() => Number(document.querySelector('.youth-vroid-portrait canvas')?.dataset.blink) > .8);
      await page.screenshot({path: `output/vroid-reference/blink-${width}.png`});
      await page.waitForFunction(() => Number(document.querySelector('.youth-vroid-portrait canvas')?.dataset.smile) > .35);
      const motion = await canvas.evaluate(c => ({...c.dataset}));
      assert.ok(Number(motion.animatedFaceMeshes) > 0 && Math.abs(Number(motion.headTilt)) > .05);
      await page.screenshot({path: `output/vroid-reference/smile-tilt-${width}.png`});
      assert.equal(motion.motionSource, 'VRoid-MotionPack-02-06');
      await page.emulateMedia({reducedMotion: 'reduce'});
      await page.waitForTimeout(200);
      const stopped = await canvas.getAttribute('data-portrait-frames');
      await page.waitForTimeout(1200);
      assert.equal(await canvas.getAttribute('data-portrait-frames'), stopped, 'Reduced motion stops animation and rendering');
      results.push({width,height,box,metrics: await canvas.evaluate(c => ({...c.dataset, width: c.width,height: c.height})),motion,reducedMotionExtraFrames:0,errors});
      await context.close();
    }
    fs.writeFileSync('output/vroid-reference/browser-check.json', JSON.stringify(results,null,2));
    console.log(JSON.stringify(results));
  } finally {await browser.close();}
})().catch(e => {console.error(e);process.exitCode=1;});
