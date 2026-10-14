/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated visual/performance regression; blocks every paid classroom command.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.YOUTH_TEST_URL || 'http://localhost:3011';
const out = path.resolve('output/paper-print-qa');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-gpu', '--use-angle=metal', '--disable-background-networking'] });
  const checks = [];
  try {
    for (const [name, width, height, reducedMotion] of [['desktop',1672,941,'no-preference'], ['mobile',390,844,'no-preference'], ['reduced-motion',390,844,'reduce']]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion });
      const errors = [], blocked = [];
      await context.route('**/*', route => {
        const request = route.request();
        if (new URL(request.url()).origin !== base) { blocked.push(request.url()); return route.abort(); }
        if (request.method() === 'POST' && /\/api\/(youth\/)?classroom\//.test(request.url()) && ['start','queue-lesson'].includes(request.postDataJSON()?.kind)) throw new Error('Paid command forbidden');
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(String(error)));
      page.on('console', message => { if (message.type() === 'error' && /THREE|shader|WebGL/i.test(message.text())) errors.push(message.text()); });
      await page.addInitScript(() => {
        window.__printProbe = { offscreenDraws: 0 };
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          const gl = get.call(this, type, ...args);
          if (gl && type === 'webgl2' && !gl.__printInstrumented) {
            gl.__printInstrumented = true;
            let target = null;
            const bind = gl.bindFramebuffer.bind(gl);
            gl.bindFramebuffer = (type, buffer) => { if (type === gl.FRAMEBUFFER || type === gl.DRAW_FRAMEBUFFER) target = buffer; return bind(type, buffer); };
            for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
              const draw = gl[name].bind(gl);
              gl[name] = (...args) => { if (target) window.__printProbe.offscreenDraws++; return draw(...args); };
            }
          }
          return gl;
        };
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-scene-ready="true"]', { timeout: 90000 });
      await page.waitForSelector('.youth-vroid-portrait canvas[data-mentor-presented="true"]', { timeout: 90000 });
      await page.waitForTimeout(3000);
      const scene = page.locator('.youth-scene canvas');
      const before = Number(await scene.getAttribute('data-render-frames'));
      const clockBefore = Number(await scene.getAttribute('data-clock-epoch'));
      await page.waitForTimeout(1200);
      const after = Number(await scene.getAttribute('data-render-frames'));
      assert.ok(Number(await scene.getAttribute('data-clock-epoch')) > clockBefore, 'Real clock advances without pointer input');
      const diagnostics = await scene.evaluate(canvas => ({ ...canvas.dataset, width: canvas.width, height: canvas.height }));
      assert.ok(after - before <= 4, 'Clock wakes the room at most once a second, not continuously');
      assert.equal(diagnostics.materialStyle, 'paper-print-baked');
      assert.equal(diagnostics.exterior, 'perspective-illustration');
      assert.equal(Number(diagnostics.exteriorTriangles), 2);
      assert.equal(diagnostics.shadowMaps, 'false');
      assert.ok(Number(diagnostics.drawCalls) < 50);
      const surfaces = await page.evaluate(() => {
        const form = document.querySelector('.youth-composer form');
        const box = form.getBoundingClientRect();
        const style = getComputedStyle(form);
        return { background: style.backgroundColor, border: style.borderTopWidth, shadow: style.boxShadow, left: box.left, right: box.right, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, offscreenDraws: window.__printProbe.offscreenDraws };
      });
      // Scene keeps the print render; the user restored the earlier white/green UI.
      assert.equal(surfaces.background, 'rgb(255, 254, 250)');
      assert.equal(surfaces.border, '1px');
      assert.ok(surfaces.left >= 0 && surfaces.right <= width);
      assert.equal(surfaces.overflow, false);
      assert.equal(surfaces.offscreenDraws, 0);
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      if (name === 'desktop') {
        await page.mouse.move(820, 620);
        await page.waitForTimeout(250);
        assert.equal(await scene.getAttribute('data-hover-part'), '4', 'Podium selects as a complete object');
        assert.ok(Number(await scene.getAttribute('data-hover-lift')) > .01);
        await page.screenshot({ path: path.join(out, 'desktop-hover.png') });
        await page.waitForTimeout(1200);
        assert.equal(Number(await scene.getAttribute('data-hover-lift')), 0);
        const settled = await scene.getAttribute('data-render-frames');
        await page.waitForTimeout(350);
        assert.ok(Number(await scene.getAttribute('data-render-frames')) - Number(settled) <= 2, 'Only the real clock may wake the settled hover');
        await page.mouse.move(590, 280);
        await page.waitForTimeout(250);
        assert.equal(await scene.getAttribute('data-hover-part'), '22');
        assert.equal(Number(await scene.getAttribute('data-hover-lift')), 0, 'Screen must stay aligned to DOM video');
        await page.mouse.move(1650, 10);
      }
      await page.locator('.youth-wallet-chip').click();
      await page.locator('.youth-wallet-panel').waitFor();
      const wallet = await page.locator('.youth-wallet-panel').boundingBox();
      assert.ok(wallet.x >= 0 && wallet.x + wallet.width <= width && wallet.y + wallet.height <= height);
      await page.screenshot({ path: path.join(out, `${name}-wallet.png`) });
      if (reducedMotion === 'reduce') {
        const animated = await page.locator('.youth-classroom').evaluate(root => [...root.querySelectorAll('*')].filter(element => getComputedStyle(element).animationName !== 'none').length);
        assert.equal(animated, 0);
      }
      assert.deepEqual(errors, []);
      checks.push({ name, width, height, diagnostics, idleFrameDelta: after - before, surfaces, wallet, errors, blockedExternal: blocked.length });
      await context.close();
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ checks, realProviderCalls: 0 }, null, 2));
    console.log(JSON.stringify({ checks, realProviderCalls: 0 }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
