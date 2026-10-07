// Holds only the local surface atlas to prove the cover waits for actual assets.
/* eslint-disable @typescript-eslint/no-require-imports -- Background browser regression fixture. */
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyEntrance(page, base, out, name = 'desktop', reduced = false) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const handler = async route => { await gate; await route.continue(); };
  await page.route('**/youth/surfaces.webp', handler);
  await page.addInitScript(() => {
    if (window.__youthEntranceTest) return;
    window.__youthEntranceTest = { phases: [] };
    const observer = new MutationObserver(() => {
      const phase = document.querySelector('[data-theme="zh-youth"]')?.getAttribute('data-entrance-phase');
      const phases = window.__youthEntranceTest.phases;
      if (phase && phase !== phases[phases.length - 1]) phases.push(phase);
      if (phase === 'ready') observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-entrance-phase'] });
  });
  try {
    await page.goto(base + '/zh-youth', { waitUntil: 'domcontentloaded' });
    await page.locator('.youth-entrance-loading img').evaluate(image => image.decode());
    await page.waitForTimeout(reduced ? 50 : 800);
    assert.equal(await page.locator('main').getAttribute('data-scene-ready'), 'false');
    assert.equal(await page.locator('.youth-composer').count(), 0);
    assert.equal(await page.locator('.youth-entrance-loading').count(), 1, 'Cover must stay until the real atlas is loaded');
    await page.screenshot({ path: path.join(out, `entrance-${name}-loading.png`) });
    release();
    let reveal = null;
    if (!reduced) {
      await page.waitForSelector('[data-entrance-phase="entering"]', { timeout: 30000 });
      await page.waitForTimeout(550);
      reveal = await page.locator('.youth-entrance').evaluate(element => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, visibility: style.visibility, pointerEvents: style.pointerEvents, progress: Number(document.querySelector('canvas')?.dataset.entranceProgress) };
      });
      assert.equal(reveal.opacity, '0');
      assert.equal(reveal.visibility, 'hidden');
      assert.equal(reveal.pointerEvents, 'none');
      assert.ok(reveal.progress > 0 && reveal.progress < 1, 'Camera movement must be visible after the cover disappears, not finish behind it');
      assert.equal(await page.locator('.youth-composer').count(), 0, 'Input waits until landing completes');
      await page.screenshot({ path: path.join(out, `entrance-${name}-landing.png`) });
    }
    await page.waitForSelector('[data-scene-ready="true"]', { timeout: 30000 });
    assert.equal(await page.locator('.youth-entrance').count(), 0, 'No loading animation can remain in the ready DOM');
    const phases = await page.evaluate(() => window.__youthEntranceTest.phases);
    assert.deepEqual(phases, reduced ? ['loading', 'ready'] : ['loading', 'entering', 'ready']);
    assert.equal(await page.locator('canvas').first().getAttribute('data-entrance-progress'), '1');
    return { name, actualAssetGate: true, phases, reveal, reducedMotion: reduced };
  } finally {
    release();
    await page.unroute('**/youth/surfaces.webp', handler);
  }
};

module.exports.verifyFailure = async function verifyFailure(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await context.route('**/*', route => {
    if (!route.request().url().startsWith(base)) return route.abort();
    if (new URL(route.request().url()).pathname === '/youth/surfaces.webp') return route.fulfill({ status: 503, body: 'Local simulated asset failure' });
    return route.continue();
  });
  try {
    await page.goto(base + '/zh-youth', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-entrance-phase="failed"]');
    assert.equal(await page.locator('.youth-entrance-failed').getByRole('alert').count(), 1, 'The failed entrance has its own readable alert, independent of the Next route announcer');
    assert.equal(await page.getByRole('button', { name: '重新加载', exact: true }).isEnabled(), true);
    assert.equal(await page.locator('.youth-composer').count(), 0);
    await page.screenshot({ path: path.join(out, 'entrance-mobile-failed.png') });
    return { simulatedAssetFailure: true, readableRetry: true, paidRequests: 0 };
  } finally { await context.close(); }
};
