// UI-only wallet responses. No real key, login, charge, balance or video calls.
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone background browser QA. */
const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function verifyWallet(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [], commands = [];
  let connected = false, keyAccepted = false, unreadableBalance = false, creates = 0, navigations = 0;
  page.on('pageerror', (error) => errors.push(String(error)));
  // Next's same-document history updates also emit framenavigated; only a new
  // document request would indicate the unwanted whole-page reload.
  page.on('request', (request) => { if (request.isNavigationRequest() && request.resourceType() === 'document') navigations++; });
  await context.route('**/*', async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/api/youth/tokenpay/status') {
      // Allow only the real, free HttpOnly-cookie bootstrap. Its key is absent.
      const response = await route.fetch();
      return route.fulfill({ response, json: connected
        ? unreadableBalance ? { connected: true, warning: '余额暂时无法读取，请检查钱包状态。' } : { connected: true, balanceYuan: 12.3456 }
        : { connected: false } });
    }
    if (url.pathname.startsWith('/api/youth/tokenpay/')) {
      commands.push(url.pathname);
      if (url.pathname.endsWith('/key')) {
        assert.equal(request.postDataJSON().key, 'fake-wallet-key-for-ui-test-only');
        if (!keyAccepted) return route.fulfill({ status: 400, json: { error: '连接失败，请检查 Key、网络或重新授权。此处为本地模拟错误，不是真实账户结果。' } });
        connected = true; return route.fulfill({ json: { connected: true, balanceYuan: 12.3456 } });
      }
      if (url.pathname.endsWith('/disconnect')) { connected = false; return route.fulfill({ json: { connected: false } }); }
      throw new Error('Unexpected wallet action: ' + url.pathname);
    }
    if (url.pathname.startsWith('/api/youth/classroom')) {
      if (request.method() === 'POST' && request.postDataJSON().kind) throw new Error('Paid commands forbidden in wallet QA');
      if (request.method() === 'POST') creates++;
      const response = await route.fetch();
      const data = await response.json();
      if (data.ok && data.outcome) data.outcome.snapshot.configured = connected;
      return route.fulfill({ response, json: data });
    }
    return route.continue();
  });
  try {
    await page.goto(base + '/zh-youth');
    await page.waitForSelector('[data-scene-ready="true"]');
    const chip = page.getByRole('button', { name: '打开 TokenDance 钱包' });
    const panel = page.getByRole('region', { name: 'TokenDance 钱包' });
    await chip.click(); await page.getByRole('button', { name: '授权连接', exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, 'wallet-desktop.png') });
    const surface = await panel.evaluate((el) => ({ background: getComputedStyle(el).backgroundColor, filter: getComputedStyle(el).filter, blur: getComputedStyle(el).backdropFilter }));
    assert.equal(surface.background, 'rgb(21, 33, 29)'); assert.equal(surface.filter, 'none'); assert.equal(surface.blur, 'none');
    await page.getByRole('button', { name: '粘贴 API Key' }).click();
    assert.equal(await page.getByLabel('TokenDance API Key', { exact: true }).getAttribute('type'), 'password');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.getByLabel('TokenDance API Key', { exact: true }).fill('fake-wallet-key-for-ui-test-only');
    await page.getByRole('button', { name: '验证并连接' }).click();
    await panel.getByRole('status').waitFor();
    assert.equal(await page.getByLabel('TokenDance API Key', { exact: true }).inputValue(), '');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, 'wallet-mobile-error.png') });
    const bounds = await panel.boundingBox();
    const errorBounds = await panel.getByRole('status').boundingBox();
    assert.ok(errorBounds.y >= bounds.y && errorBounds.y + errorBounds.height <= bounds.y + bounds.height, 'Entire error message remains readable in the scrolling panel');
    const composer = await page.locator('.youth-composer form').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert.ok(bounds.y + bounds.height <= composer.y, 'Mobile wallet must not cover course input');
    const heights = await panel.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    assert.ok(heights.every((height) => height >= 44));
    keyAccepted = true;
    await page.getByLabel('TokenDance API Key', { exact: true }).fill('fake-wallet-key-for-ui-test-only');
    await page.getByRole('button', { name: '验证并连接' }).click();
    await panel.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('[data-wallet-connected]')?.dataset.walletConnected === 'true');
    await page.screenshot({ path: path.join(out, 'wallet-mobile-connected-mock.png') });
    assert.match(await chip.innerText(), /¥12\.35/);
    await chip.click(); assert.equal(await panel.getByText('¥ 12.3456', { exact: true }).count(), 1);
    unreadableBalance = true;
    await page.getByRole('button', { name: '刷新余额' }).click();
    await panel.getByText('暂时无法读取', { exact: true }).waitFor();
    assert.equal(await panel.getByText('¥ 0.0000').count(), 0, 'Unavailable balance must not be fabricated as zero');
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '打开 TokenDance 钱包');
    assert.equal(await chip.getAttribute('aria-expanded'), 'false');
    assert.equal(await chip.evaluate(el => el === document.activeElement), true);
    await page.setViewportSize({ width: 1440, height: 900 }); await chip.click();
    unreadableBalance = false; await page.getByRole('button', { name: '刷新余额' }).click();
    await panel.getByText('¥ 12.3456', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, 'wallet-desktop-connected-mock.png') });
    await page.getByRole('button', { name: '断开连接' }).click();
    await panel.getByText('尚未连接', { exact: true }).waitFor();
    await page.waitForTimeout(900);
    assert.equal(navigations, 1, 'Wallet changes update the classroom without reloading');
    assert.ok(creates >= 3, 'Connect/disconnect establishes fresh isolated empty sessions');
    assert.deepEqual(errors, []);
    return { responses: 'local fixtures only; not a real account', paidRequests: 0, providerRequests: 0, mobileBounds: bounds, surface, noPageReload: true, creates, commands, errors };
  } finally { await context.close(); }
};
