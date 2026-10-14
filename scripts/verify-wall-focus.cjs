/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.YOUTH_TEST_URL || 'http://localhost:3000';
const label = process.env.YOUTH_QA_LABEL || 'before';
const out = path.resolve('output/wall-focus-qa');
const diagnostic = process.env.YOUTH_DIAGNOSE === '1';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const neutral = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#dddddd' } }).webp().toBuffer();
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-gpu','--use-angle=metal','--disable-background-networking'] });
  const results = [];
  try {
    for (const mode of diagnostic ? ['original','flat-light','flat-surface'] : ['desktop','mobile']) {
      const width = mode === 'mobile' ? 390 : 1672, height = mode === 'mobile' ? 844 : 941;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      await context.route('**/*', route => {
        const r = route.request(), u = new URL(r.url());
        if (u.origin !== base) return route.abort();
        if (r.method() === 'POST' && /\/api\/(youth\/)?classroom\//.test(u.pathname)) return route.abort();
        if ((mode === 'flat-light' && u.pathname === '/youth/lighting.webp') || (mode === 'flat-surface' && u.pathname === '/youth/surfaces.webp')) return route.fulfill({contentType:'image/webp', body:neutral});
        if (process.env.YOUTH_LIGHTMAP_FILE && u.pathname === '/youth/lighting.webp') return route.fulfill({contentType:'image/png', body:fs.readFileSync(process.env.YOUTH_LIGHTMAP_FILE)});
        return route.continue();
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(base); await page.waitForSelector('[data-scene-ready="true"]', {timeout:60000});
      if (!diagnostic) await page.waitForSelector('.youth-vroid-portrait canvas[data-mentor-presented="true"]', {timeout:90000});
      await page.waitForTimeout(500);
      await page.screenshot({path:path.join(out,`${label}-${mode}.png`)});
      const input = page.locator('.youth-composer input');
      await input.click();
      const focus = await input.evaluate(input => ({outline:getComputedStyle(input).outlineStyle, width:getComputedStyle(input).outlineWidth, parentBorder:getComputedStyle(input.closest('form')).borderTopColor}));
      await page.screenshot({path:path.join(out,`${label}-${mode}-focus.png`)});
      if (label === 'after') assert.equal(focus.outline, 'none');
      if (!diagnostic && mode === 'desktop') {
        for (const [name, from, to] of [['pan-left',250,900], ['pan-right',900,250]]) {
          await page.mouse.move(from,600); await page.mouse.down();
          await page.mouse.move(to,600,{steps:15}); await page.mouse.up();
          await page.waitForTimeout(150);
          await page.screenshot({path:path.join(out,`${label}-${name}.png`)});
        }
      }
      assert.deepEqual(errors, []);
      results.push({mode,focus,errors}); await context.close();
    }
    fs.writeFileSync(path.join(out,`${label}.json`), JSON.stringify({results,realProviderCalls:0},null,2));
    console.log(JSON.stringify(results));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
