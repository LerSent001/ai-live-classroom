// Background-only, one Chromium process. No provider/paid requests are permitted.
// PLAYWRIGHT_MODULE may point to an existing Playwright installation.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS QA runner supports an externally supplied Playwright installation. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.YOUTH_TEST_URL || 'http://127.0.0.1:3028';
const out = path.resolve('output/youth-qa');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-gpu', '--use-angle=metal', '--disable-background-networking'] });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (!request.url().startsWith(base) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) return route.abort();
    if (request.method() === 'POST' && /\/api\/(youth\/)?classroom\//.test(request.url()) && ['start', 'queue-lesson'].includes(request.postDataJSON()?.kind)) throw new Error('Paid start is forbidden in visual QA');
    return route.continue();
  });
  try {
    const desktopEntrance = await require('./youth-entrance-fixture.cjs')(page, base, out);
    await page.locator('[data-youth-portrait="mentor-v1"] img').evaluate(image => image.decode());
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(out, 'desktop.png') });
    const scrim = await page.locator('main').evaluate(el => {
      const style = getComputedStyle(el, '::after');
      return { content: style.content, background: style.backgroundImage, pointerEvents: style.pointerEvents, filter: style.filter, animation: style.animationName };
    });
    assert.equal(scrim.content, '""');
    assert.ok(scrim.background.startsWith('linear-gradient(90deg'));
    assert.equal(scrim.pointerEvents, 'none');
    assert.equal(scrim.filter, 'none');
    assert.equal(scrim.animation, 'none');
    const before = await page.locator('canvas').first().getAttribute('data-render-frames');
    await page.waitForTimeout(3000);
    const after = await page.locator('canvas').first().getAttribute('data-render-frames');
    const performance = await page.locator('canvas').first().evaluate((el) => ({ ...el.dataset, width: el.width, height: el.height }));
    assert.equal(after, before, 'Idle classroom must not render continuously');
    assert.equal(await page.getByRole('combobox').count(), 0, 'Questions have no age/stage selector');
    assert.equal(await page.locator('main').getAttribute('data-audience-stage'), null);
    assert.equal(await page.locator('main').getAttribute('data-lesson-mode'), 'question');
    assert.equal(await page.locator('main').getAttribute('data-desk-count'), '6');
    assert.equal(await page.locator('.tv-off').count(), 1);
    assert.equal(await page.locator('[data-teacher-id], .television-static-canvas').count(), 0);
    assert.equal(await page.locator('[data-youth-portrait="mentor-v1"]').count(), 1);
    const portrait = await page.locator('[data-youth-portrait="mentor-v1"]').boundingBox();
    const heading = await page.locator('.youth-composer h1').boundingBox();
    assert.ok(portrait && heading && portrait.y >= 0 && portrait.y + portrait.height <= heading.y, 'Half-body portrait stays above the unchanged composer heading');
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
    assert.ok(!resources.some((url) => /monokuma|monomi|retro-classroom-loop/.test(url)), 'Youth must not load bear or soundtrack assets');
    assert.ok(resources.some(url => /mentor-halfbody-v1/.test(url)), 'Youth loads its original half-body artwork');
    assert.ok(!resources.some(url => /turnaround|yangcong/.test(url)), 'Reference sheets and third-party reference images are not runtime assets');
    assert.deepEqual(resources.filter(url => /\.glb$/.test(url)).map(url => new URL(url).pathname).sort(), ['books', 'monstera-plant', 'pothos', 'school-chair', 'school-desk'].map(name => `/youth/models/${name}.glb`));
    assert.ok(resources.some(url => /youth\/surfaces.webp$/.test(url)), 'Static surfaces use one shared atlas');
    assert.ok(!resources.some(url => /oak.webp|plaster.webp|chalkboard.webp|nor_gl|diff_1k|arm_1k/.test(url)), 'Original standalone images / PBR textures are not downloaded at runtime');
    assert.ok(Number(performance.assetTriangles) <= 45000, 'Authored plants and recessed openings stay within 45k triangles');
    assert.ok(Number(performance.drawCalls) <= 29, 'Draw calls must not exceed the rejected flat version');
    const desktopSwitch = await require('./youth-portrait-fixture.cjs')(page, out, 'desktop');
    await page.getByLabel('想学习的问题', { exact: true }).fill('彩虹是怎么形成的？');
    await page.getByRole('button', { name: '开始探索' }).click();
    await page.getByRole('region', { name: 'TokenDance 钱包' }).waitFor();
    await page.getByRole('button', { name: '收起钱包' }).click();
    await page.getByLabel('想学习的问题', { exact: true }).fill('');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator('main').getAttribute('data-entrance-phase'), 'ready', 'Resize must not replay the entrance');
    const mobileEntrance = await require('./youth-entrance-fixture.cjs')(page, base, out, 'mobile');
    await page.waitForTimeout(1800);
    await page.locator('[data-youth-portrait="mentor-v1"] img').evaluate(image => image.decode());
    await page.screenshot({ path: path.join(out, 'mobile.png') });
    assert.equal(await page.getByRole('combobox').count(), 0, 'Mobile also has no age/stage selector');
    assert.ok((await page.locator('main').evaluate(el => getComputedStyle(el, '::after').backgroundImage)).startsWith('linear-gradient(rgba'), 'Mobile scrim uses the default downward direction');
    const form = await page.locator('.youth-composer form').boundingBox();
    assert.ok(form && form.x >= 0 && form.x + form.width <= 390, 'Mobile composer fits viewport');
    const mobilePortrait = await page.locator('[data-youth-portrait="mentor-v1"]').boundingBox();
    assert.ok(mobilePortrait && mobilePortrait.x >= 0 && mobilePortrait.x + mobilePortrait.width <= 390 && mobilePortrait.y >= 0, 'Mobile portrait fits without horizontal overflow');
    const mobileSwitch = await require('./youth-portrait-fixture.cjs')(page, out, 'mobile');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(base + '/styles/monokuma', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-entrance-phase="ready"]', { timeout: 60000 });
    assert.equal(await page.locator('[data-teacher-id="monokuma"]').count() > 0, true, 'Original demo keeps its bear');
    assert.equal(await page.getByRole('heading', { name: 'What do you want to learn about?' }).count(), 1);
    const sessions = await page.evaluate(() => ({ demo: sessionStorage.getItem('tung-classroom-session-v1'), youth: sessionStorage.getItem('zh-youth-classroom-session-v1') }));
    assert.ok(sessions.demo && sessions.youth && sessions.demo !== sessions.youth, 'Demo and youth session keys are isolated');
    await page.screenshot({ path: path.join(out, 'original-demo.png') });
    await context.close();
    const wallet = await require('./youth-wallet-fixture.cjs')(browser, base, out);
    const playback = process.env.YOUTH_SKIP_PLAYBACK ? null : await require('./youth-browser-fixture.cjs')(browser, base, out);
    const retinaContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const retinaPage = await retinaContext.newPage();
    retinaPage.on('pageerror', (error) => errors.push(String(error)));
    await retinaContext.route('**/*', (route) => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const reducedEntrance = await require('./youth-entrance-fixture.cjs')(retinaPage, base, out, 'reduced', true);
    await retinaPage.waitForTimeout(800);
    const retinaBefore = await retinaPage.locator('canvas').first().getAttribute('data-render-frames');
    await retinaPage.waitForTimeout(2000);
    const retina = await retinaPage.locator('canvas').first().evaluate((canvas) => {
      const gl = canvas.getContext('webgl2'); const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return { width: canvas.width, height: canvas.height, ...canvas.dataset, gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
    });
    assert.equal(retina.width, 1800); assert.equal(retina.height, 1125);
    assert.equal(retina.renderFrames, retinaBefore, 'Retina/reduced-motion idle has no render loop');
    await retinaContext.close();
    const failedEntrance = await require('./youth-entrance-fixture.cjs').verifyFailure(browser, base, out);
    const report = { viewport: [1672, 941], lessonMode: 'question', ageSelector: false, scrim, portrait, mobilePortrait, entrance: { desktop: desktopEntrance, mobile: mobileEntrance, reduced: reducedEntrance, failure: failedEntrance }, mentorSwitch: { desktop: desktopSwitch, mobile: mobileSwitch }, idleFrameDelta: Number(after) - Number(before), performance, retina, resources, originalDemo: { bearVisible: true, isolatedSessions: true }, wallet, playback, errors };
    fs.writeFileSync(path.join(out, 'browser-check.json'), JSON.stringify(report, null, 2));
    assert.deepEqual(errors, []);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    process.stderr.write(JSON.stringify({ errors }, null, 2) + '\n');
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
