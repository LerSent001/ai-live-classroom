// UI-only regression: no lesson command may be sent by portrait switching.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone background browser QA. */
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyPortraitSwitch(page, out, viewportName) {
  const mutations = [];
  const onRequest = (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) {
      mutations.push({ method: request.method(), path: new URL(request.url()).pathname });
    }
  };
  const input = page.getByLabel('想学习的问题', { exact: true });
  const draft = await input.inputValue();
  const headingBefore = await page.locator('.youth-composer h1').boundingBox();
  const formBefore = await page.locator('.youth-composer form').boundingBox();
  const canvasCount = await page.locator('canvas').count();
  await input.fill('为什么天空是蓝色的？');
  page.on('request', onRequest);
  try {
    const switchToFemale = page.getByRole('button', { name: '切换为女生形象', exact: true });
    assert.equal(await switchToFemale.getAttribute('type'), 'button');
    assert.equal((await switchToFemale.textContent()).trim(), '', 'The switch must contain no visible text');
    assert.equal(await switchToFemale.locator('svg').count(), 1);
    const iconStyle = await switchToFemale.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderWidth, iconWidth: el.querySelector('svg').getBoundingClientRect().width }));
    assert.equal(iconStyle.background, 'rgba(0, 0, 0, 0)');
    assert.equal(iconStyle.border, '0px');
    assert.equal(iconStyle.iconWidth, 20);
    assert.equal(await switchToFemale.evaluate(el => Boolean(el.closest('form, [aria-hidden="true"]'))), false);
    await switchToFemale.click();
    const female = page.locator('[data-youth-portrait="mentor-female-v2"] img');
    await female.evaluate(image => image.decode());
    assert.equal(await page.locator('[data-youth-portrait] img').count(), 1, 'Only the selected character is mounted');
    const style = await female.evaluate(image => {
      const css = getComputedStyle(image);
      return { mask: css.maskImage, webkitMask: css.webkitMaskImage, filter: css.filter, animation: css.animationName, source: image.currentSrc };
    });
    assert.match(style.mask, /^linear-gradient/);
    assert.match(style.mask, /rgba\(0, 0, 0, 0\) 100%/);
    assert.equal(style.filter, 'none');
    assert.equal(style.animation, 'none');
    assert.match(style.source, /mentor-female-halfbody-v2\.png/, 'The current female outfit must not resolve to the rejected v1 image');
    const switchToMale = page.getByRole('button', { name: '切换为男生形象', exact: true });
    const button = await switchToMale.boundingBox();
    assert.ok(button && button.height >= 44 && button.x >= 0 && button.y >= 0 && button.x + button.width <= page.viewportSize().width);
    assert.equal(button.width, 44, 'Small icon retains a 44px invisible touch target, not a wide pill');
    assert.equal(await switchToMale.evaluate(el => getComputedStyle(el).maskImage), 'none', 'The button must not fade with the artwork');
    assert.deepEqual(await page.locator('.youth-composer h1').boundingBox(), headingBefore);
    assert.deepEqual(await page.locator('.youth-composer form').boundingBox(), formBefore);
    await page.screenshot({ path: path.join(out, `${viewportName}-female.png`) });
    await switchToMale.focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-youth-portrait="mentor-v1"] img').evaluate(image => image.decode());
    assert.equal(await input.inputValue(), '为什么天空是蓝色的？', 'Switching retains the question draft');
    await page.getByRole('button', { name: '切换为女生形象', exact: true }).focus();
    await page.keyboard.press('Space');
    await female.evaluate(image => image.decode());
    await page.getByRole('button', { name: '切换为男生形象', exact: true }).click();
    await page.locator('[data-youth-portrait="mentor-v1"] img').evaluate(image => image.decode());
    await page.waitForTimeout(250);
    const before = await page.locator('canvas').first().getAttribute('data-render-frames');
    await page.waitForTimeout(1000);
    const after = await page.locator('canvas').first().getAttribute('data-render-frames');
    assert.equal(after, before, 'Portrait switching must not leave a WebGL render loop running');
    assert.equal(await page.locator('canvas').count(), canvasCount);
    assert.deepEqual(mutations, [], 'Pointer, Enter and Space switching must never call a mutating API');
    return { viewportName, style, button, pointerAndKeyboardCycle: true, preservesDraftAndLayout: true, mutatingRequests: mutations, idleFrameDelta: Number(after) - Number(before) };
  } finally {
    page.off('request', onRequest);
    await input.fill(draft);
  }
};
