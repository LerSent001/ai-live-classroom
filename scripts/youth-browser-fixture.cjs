// Browser-only simulation. Every lesson command is fulfilled here, never sent to
// the app. The small WebM is locally encoded test media, NOT a generated lesson.
/* eslint-disable @typescript-eslint/no-require-imports -- Imported by the standalone CommonJS QA runner, not the application. */
const assert = require('node:assert/strict');
const path = require('node:path');

module.exports = async function verifyPlayback(browser, base, out) {
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [], commands = [], playback = [];
  let snapshot = null;
  let pristine = null;
  let clip = null;
  let releaseClip;
  const clipGate = new Promise((resolve) => { releaseClip = resolve; });
  page.on('pageerror', (error) => errors.push(String(error)));
  const response = () => ({ ok: true, outcome: { kind: 'snapshot', snapshot } });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/__test__/youth-clip.webm') {
      await clipGate;
      return route.fulfill({ status: 200, contentType: 'video/webm', body: clip });
    }
    if (url.pathname === '/api/youth/tokenpay/status') {
      const response = await route.fetch();
      return route.fulfill({ response, json: { connected: true, balanceYuan: 12.3456 } });
    }
    if (!url.pathname.startsWith('/api/youth/classroom')) return route.continue();
    if (url.pathname === '/api/youth/classroom') {
      // Empty-session creation is the only API request forwarded to the server.
      const result = await (await route.fetch()).json();
      pristine = structuredClone(result.outcome.snapshot);
      snapshot = { ...structuredClone(pristine), configured: true, fixture: true };
    } else if (request.method() === 'DELETE') {
      snapshot = null;
      return route.fulfill({ json: { ok: true } });
    } else if (request.method() === 'POST') {
      const command = request.postDataJSON();
      commands.push(command);
      if (command.kind === 'start') {
        const steps = Array.from({ length: 6 }, (_, index) => ({ id: `step-${index + 1}`, position: index + 1, role: index === 0 ? 'hook' : index === 5 ? 'recap' : 'mechanism', title: '本地播放测试', teachingGoal: '检查视频连续播放', narration: '本地测试视频，不是实际生成课程。', concept: '视频播放', summary: '本地测试', visualAction: 'A diagnostic video plays.', required: true }));
        const segments = steps.map((step, index) => ({ kind: 'generated', id: `scene-fixture-${index + 1}`, number: index + 1, durationSeconds: 2.5, purpose: { kind: 'lesson', stepId: step.id }, prompt: 'Local test fixture only', summary: '本地测试', captions: [{ startSeconds: 0, endSeconds: 2.5, text: `第 ${index + 1} 段：本地视频播放测试` }], videoUrl: `${base}/__test__/youth-clip.webm?n=${index}`, providerUrl: `${base}/__test__/youth-clip.webm?n=${index}`, expandedPrompt: null, timings: { requestId: 'local-fixture', queueWaitMs: 0, inferenceMs: 0, totalMs: 0 } }));
        snapshot = { ...snapshot, version: snapshot.version + 1, teacherId: command.teacherId, topic: command.topic, phase: 'priming', production: { kind: 'draining', reason: 'lesson-complete' }, playback: { kind: 'priming' }, committedThrough: 6,
          lesson: { teacherId: command.teacherId, topic: command.topic, title: '视频播放测试', bigQuestion: '屏幕运镜与视频能否衔接？', durationSeconds: 30, targetSceneCount: 6, steps, preparedBy: 'local fixture', preparationLatencyMs: 0, suggestedTopics: ['声音是怎样传播的？', '光为什么会折射？', '影子为什么会变化？'] },
          ready: segments, playlist: [{ sessionId: snapshot.id, position: 1, topic: command.topic, kind: 'ready' }] };
      } else if (command.kind === 'report-playback') {
        const report = command.report;
        if (report.kind !== 'media-ready') {
          playback.push({ ...report, camera: await page.locator('canvas').first().getAttribute('data-camera') });
          const id = report.sceneId || report.startedSceneId;
          const playing = snapshot.ready.find((segment) => segment.id === id);
          snapshot = { ...snapshot, version: snapshot.version + 1, hasPlaybackBegun: true };
          if (report.kind === 'drained') snapshot = { ...snapshot, phase: 'complete', production: { kind: 'closed' }, playback: { kind: 'ended', finalSceneNumber: 6 }, playing: null, ready: [], playlist: [{ ...snapshot.playlist[0], kind: 'complete' }, ...snapshot.playlist.slice(1)] };
          else snapshot = { ...snapshot, phase: 'live', playback: { kind: 'playing', sceneNumber: playing.number }, playing, ready: snapshot.ready.filter((segment) => segment.number > playing.number), playlist: [{ ...snapshot.playlist[0], kind: 'playing' }, ...snapshot.playlist.slice(1)] };
        }
      } else if (command.kind === 'queue-lesson') {
        snapshot = { ...snapshot, version: snapshot.version + 1, playlist: [...snapshot.playlist, { sessionId: snapshot.id + '-next', position: 2, topic: command.topic, kind: 'waiting' }] };
      } else throw new Error('Unexpected fixture command: ' + command.kind);
    }
    return route.fulfill({ json: response() });
  });
  try {
    await page.goto(base + '/zh-youth', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-scene-ready="true"]', { timeout: 30000 });
    // Encode 2.5 seconds at 10 fps, 320x180. No downloaded media or ffmpeg job.
    clip = Buffer.from(await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 80000 });
      const chunks = [];
      const done = new Promise((resolve) => { recorder.ondataavailable = (event) => chunks.push(event.data); recorder.onstop = resolve; });
      let frame = 0;
      const paint = () => { ctx.fillStyle = '#243c36'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#eee8d7'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('本地视频测试', 160, 85); ctx.fillText(String(++frame), 160, 120); };
      paint(); recorder.start(); const timer = setInterval(paint, 100);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      recorder.stop(); clearInterval(timer); stream.getTracks().forEach((track) => track.stop()); await done;
      return Array.from(new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer()));
    }));
    assert.equal(await page.getByRole('combobox').count(), 0);
    await page.getByLabel('想学习的问题', { exact: true }).fill('重力');
    await page.getByRole('button', { name: '切换为女生形象', exact: true }).click();
    await page.locator('[data-youth-portrait="mentor-female-v2"] img').evaluate(image => image.decode());
    assert.equal(commands.length, 0, 'A connected wallet must not turn portrait switching into a lesson command');
    // Composition Enter must not submit a paid command.
    await page.getByLabel('想学习的问题', { exact: true }).dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
    assert.equal(commands.filter((command) => command.kind === 'start').length, 0);
    const requestedClip = page.waitForRequest((request) => new URL(request.url()).pathname === '/__test__/youth-clip.webm');
    await page.getByRole('button', { name: '开始探索' }).click();
    await requestedClip;
    assert.equal(await page.locator('.youth-guide').count(), 1, 'Preparation keeps the lesson guide visible');
    assert.equal(await page.locator('[data-youth-portrait]').count(), 0, 'Decorative mentor stays out of active lessons');
    assert.equal(await page.locator('.youth-mentor-switch').count(), 0, 'Portrait switch stays out of playback');
    await page.waitForTimeout(200);
    assert.equal(await page.locator('canvas').first().getAttribute('data-camera'), 'room', 'The room remains visible while video decoding is pending');
    assert.equal(playback.length, 0, 'No playback can start before media is ready');
    releaseClip();
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.camera === 'screen');
    await page.waitForFunction(() => document.querySelector('.lesson-video-visible')?.currentTime > 0.2);
    assert.equal(commands.find((command) => command.kind === 'start').teacherId, 'youth-question');
    assert.equal(playback.find((event) => event.kind === 'started').camera, 'screen', 'Playback waits for camera to settle');
    assert.equal(await page.locator('.youth-guide').count(), 1, 'Playback keeps the original-style guide available');
    assert.equal(await page.getByText('视频播放测试', { exact: true }).count(), 1, 'The lesson title remains visible during playback');
    assert.equal(await page.getByRole('button', { name: /声音是怎样传播的/ }).count(), 1, 'A branch can be chosen while video is playing');
    await page.waitForFunction(() => Number(document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')) > 0);
    const branchPanel = await page.locator('.youth-guide').boundingBox();
    assert.ok(branchPanel && branchPanel.x > 1200, 'The follow-up panel stays on the right on desktop');
    const screenBounds = await page.locator('.youth-screen').boundingBox();
    assert.ok(screenBounds && screenBounds.x + screenBounds.width + 40 <= branchPanel.x, 'The desktop television and panel must not overlap');
    assert.equal(await page.getByRole('button', { name: '提新问题', exact: true }).count(), 0, 'No reset or replay-looking action appears during playback');
    assert.equal(await page.locator('.youth-guide').getByText('课堂', { exact: true }).count(), 0, 'Redundant classroom label is hidden');
    const desktopWallet = await page.getByRole('button', { name: '打开 TokenDance 钱包' }).boundingBox();
    assert.ok(desktopWallet && desktopWallet.x < 40 && desktopWallet.y + desktopWallet.height > 900, 'Wallet stays in the lower-left desktop corner during playback');
    await page.screenshot({ path: path.join(out, 'screen-playback.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(1700);
    const laptopScreen = await page.locator('.youth-screen').boundingBox();
    const laptopPanel = await page.locator('.youth-guide').boundingBox();
    assert.ok(laptopScreen && laptopPanel && laptopScreen.x + laptopScreen.width + 40 <= laptopPanel.x, 'Laptop television and panel must not overlap');
    await page.screenshot({ path: path.join(out, 'screen-playback-laptop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1700);
    const mobileBranchPanel = await page.locator('.youth-guide').boundingBox();
    assert.ok(mobileBranchPanel && mobileBranchPanel.x >= 0 && mobileBranchPanel.x + mobileBranchPanel.width <= 390, 'Mobile follow-up panel fits the viewport');
    const mobileWallet = await page.getByRole('button', { name: '打开 TokenDance 钱包' }).boundingBox();
    assert.ok(mobileWallet && mobileWallet.x < 30 && mobileWallet.y < 140 && mobileWallet.y + mobileWallet.height < mobileBranchPanel.y, 'Mobile wallet stays in its upper-left corner, clear of the bottom guide');
    const mobileScreen = await page.locator('.youth-screen').boundingBox();
    assert.ok(mobileScreen && mobileScreen.y + mobileScreen.height + 10 <= mobileBranchPanel.y, 'Mobile television stays above the follow-up panel');
    await page.screenshot({ path: path.join(out, 'screen-playback-mobile.png') });
    await page.setViewportSize({ width: 1672, height: 941 });
    await page.waitForTimeout(1700);
    assert.equal(commands.filter((command) => command.kind === 'queue-lesson').length, 0, 'Suggestions never auto-submit');
    await page.getByRole('button', { name: /声音是怎样传播的/ }).click();
    await page.locator('.guide-queue').getByText('声音是怎样传播的？', { exact: true }).waitFor();
    assert.equal(commands.filter((command) => command.kind === 'queue-lesson').length, 1, 'A playback-time branch is queued by explicit selection');
    assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el, '::after').pointerEvents), 'none', 'The side guide gradient must not block video input');
    const atRest = Number(await page.locator('canvas').first().getAttribute('data-render-frames'));
    await page.waitForTimeout(1000);
    const playingFrames = Number(await page.locator('canvas').first().getAttribute('data-render-frames')) - atRest;
    await page.getByRole('button', { name: '看看教室' }).click();
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.camera === 'room');
    await page.getByRole('button', { name: '回到屏幕' }).click();
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.camera === 'screen');
    await page.getByText('本节课程已结束', { exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await page.getByRole('progressbar', { name: '课程播放进度' }).getAttribute('aria-valuenow'), '100', 'Completed lesson shows full progress');
    assert.equal(await page.locator('.youth-guide').count(), 1, 'Completion retains the guide');
    assert.equal(await page.getByRole('button', { name: '提新问题', exact: true }).count(), 1, 'A clear new-question action appears only after completion');
    assert.equal(playback.filter((event) => event.kind === 'advanced').length, 5, 'All six local clips hand off');
    await page.getByRole('button', { name: /光为什么会折射/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.guide-queue li').length === 2);
    assert.equal(commands.filter((command) => command.kind === 'queue-lesson').length, 2, 'Completion still permits the remaining branch');
    await page.getByRole('button', { name: '提新问题', exact: true }).click();
    await page.getByRole('heading', { name: '从一个好问题开始' }).waitFor();
    assert.equal(await page.locator('[data-youth-portrait="mentor-female-v2"]').count(), 1, 'The selected female mentor returns with the lobby, without resetting to male');
    assert.equal(await page.getByRole('button', { name: '切换为男生形象', exact: true }).count(), 1);
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.camera === 'room');
    assert.equal(await page.locator('.tv-off').count(), 1);
    assert.deepEqual(errors, []);
    return { locallyEncodedTestClipBytes: clip.length, paidApiCalls: 0, waitedForMediaBeforeCamera: true, playback, playingFrameDeltaOneSecond: playingFrames, startCount: commands.filter((c) => c.kind === 'start').length, followupCount: commands.filter((c) => c.kind === 'queue-lesson').length, errors };
  } finally { releaseClip(); await context.close(); }
};
