// Final-version validation only. Isolated headless Chrome, no paid requests.
/* eslint-disable @typescript-eslint/no-require-imports -- standalone local QA */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.YOUTH_TEST_URL || 'http://127.0.0.1:3036';
const out = path.resolve('output/youth-bake');

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-gpu', '--use-angle=metal', '--disable-background-networking'] });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 2 });
    await context.route('**/*', route => {
      const request = route.request();
      if (!request.url().startsWith(base)) return route.abort();
      if (request.method() === 'POST' && /\/api\/(youth\/)?classroom\//.test(request.url()) && ['start', 'queue-lesson'].includes(request.postDataJSON()?.kind)) throw new Error('Paid generation forbidden');
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => {
      const result = window.__bakeProbe = { framebuffers: 0, offscreenDraws: 0, frames: [] };
      const contexts = new Set();
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        const gl = get.call(this, type, ...args);
        if (gl && type === 'webgl2' && !contexts.has(gl)) {
          contexts.add(gl);
          const framebuffer = gl.createFramebuffer.bind(gl);
          gl.createFramebuffer = () => { result.framebuffers++; return framebuffer(); };
          let target = null;
          const bind = gl.bindFramebuffer.bind(gl);
          gl.bindFramebuffer = (type, framebuffer) => { if (type === gl.FRAMEBUFFER || type === gl.DRAW_FRAMEBUFFER) target = framebuffer; return bind(type, framebuffer); };
          for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
            const draw = gl[name].bind(gl);
            gl[name] = (...values) => { gl.__draws = (gl.__draws || 0) + 1; if (target) result.offscreenDraws++; return draw(...values); };
          }
        }
        return gl;
      };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(time => {
        const previous = new Map(Array.from(contexts, gl => [gl, gl.__draws || 0]));
        const start = performance.now(); callback(time);
        let draws = 0;
        for (const gl of contexts) {
          const count = (gl.__draws || 0) - (previous.get(gl) || 0);
          if (count) { gl.finish(); draws += count; }
        }
        if (draws) result.frames.push({ draws, ms: performance.now() - start });
      });
    });
    await page.goto(base + '/zh-youth', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-scene-ready="true"]', { timeout: 45000 });
    await page.locator('[data-youth-portrait] img').evaluate(image => image.decode());
    const before = await page.locator('canvas').first().getAttribute('data-render-frames');
    await page.waitForTimeout(1800);
    const after = await page.locator('canvas').first().getAttribute('data-render-frames');
    assert.equal(after, before, 'Idle scene must not render');
    const diagnostics = await page.locator('canvas').first().evaluate(canvas => ({ ...canvas.dataset, width: canvas.width, height: canvas.height }));
    assert.equal(diagnostics.shadowMaps, 'false');
    assert.equal(diagnostics.shadows, 'offline-baked');
    assert.ok(Number(diagnostics.drawCalls) <= 29);
    assert.ok(Number(diagnostics.assetTriangles) <= 45000, 'Authored plants and recessed openings stay within 45k triangles');
    await page.screenshot({ path: path.join(out, 'baked-desktop.png') });
    const pan = [];
    for (const [name, from, to] of [['left', 200, 1000], ['right', 1000, 150]]) {
      const previousBox = await page.locator('.youth-screen').boundingBox();
      // Start over the floor/canvas, not the television's separate HTML layer.
      await page.mouse.move(from, 600); await page.mouse.down();
      await page.mouse.move(to, 600, { steps: 18 }); await page.mouse.up();
      await page.waitForTimeout(100);
      const box = await page.locator('.youth-screen').boundingBox();
      assert.ok(Math.abs(box.x - previousBox.x) > 10, 'Real pan must move the screen projection');
      pan.push({ name, screenX: box.x, renderFrames: await page.locator('canvas').first().getAttribute('data-render-frames') });
      await page.screenshot({ path: path.join(out, `baked-${name}.png`) });
      if (name === 'right') {
        // Capture the actual retained WebGL frame without HTML overlays, so the
        // doorway/props can be inspected; this is not a separately rendered mock.
        const pixels = await page.locator('canvas').first().evaluate(canvas => canvas.toDataURL('image/png'));
        fs.writeFileSync(path.join(out, 'room-detail.png'), Buffer.from(pixels.split(',')[1], 'base64'));
      }
    }
    const probe = await page.evaluate(() => window.__bakeProbe);
    // Three r185 reserves three empty copy/scratch FBO handles on construction.
    // Only actual offscreen draws would indicate a shadow/postprocessing pass.
    assert.equal(probe.offscreenDraws, 0, 'No shadow or postprocessing draws');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.camera === 'room');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, 'baked-mobile.png') });
    await context.close();
    const playback = process.env.YOUTH_SKIP_PLAYBACK ? null : await require('./youth-browser-fixture.cjs')(browser, base, out);
    const warm = probe.frames.slice(12).map(frame => frame.ms).sort((a, b) => a - b);
    assert.deepEqual(errors, []);
    const report = { diagnostics, pan, idleFrameDelta: Number(after) - Number(before), framebufferHandles: probe.framebuffers, offscreenDraws: probe.offscreenDraws, warmFrames: warm.length, medianMs: warm[Math.floor(warm.length / 2)], p95Ms: warm[Math.floor(warm.length * .95)], timingMethod: 'RAF callback plus gl.finish; CPU + GPU wait, not power or thermal measurement', playback, errors };
    fs.writeFileSync(path.join(out, process.env.YOUTH_SKIP_PLAYBACK ? 'verification-pan.json' : 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
