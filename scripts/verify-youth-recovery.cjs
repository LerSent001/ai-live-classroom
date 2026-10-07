// Background browser verification. All lesson mutations and media are local
// fixtures; external requests are blocked. This is NOT paid E2E evidence.
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.YOUTH_TEST_URL || 'http://127.0.0.1:3028';
const out = path.resolve('output/youth-recovery-qa');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-gpu', '--use-angle=metal', '--disable-background-networking'] });
  const results = [];
  try {
    for (const mode of process.env.YOUTH_RECOVERY_MODES?.split(',') || ['refresh-final', 'failed-reload-exit', 'mobile-failed-reload-exit', 'lost-start-ack', 'delayed-start-report', 'server-restart-version', 'autoplay-denied', 'mobile-autoplay-denied', 'blocked-session-storage', 'transient-media-read', 'play-confirmation-hangs']) {
      const context = await browser.newContext({ viewport: mode.startsWith('mobile') ? { width: 390, height: 844 } : { width: 1672, height: 941 } });
      const page = await context.newPage();
      const errors = [], commands = [], methods = [];
      let snapshot = null, clip = null, broken = mode.includes('failed'), executedStarts = 0;
      let mediaRequests = 0;
      const handled = new Set(), handledReports = [];
      if (mode.endsWith('autoplay-denied')) await page.addInitScript(() => {
        const play = HTMLMediaElement.prototype.play; let permitted = false;
        document.addEventListener('click', event => { if (event.target.closest('button')?.textContent?.includes('播放课程并开启声音')) permitted = true; }, true);
        HTMLMediaElement.prototype.play = function () {
          return this.src.includes('/__fixture__/') && !permitted ? Promise.reject(new DOMException('Autoplay policy fixture', 'NotAllowedError')) : play.call(this);
        };
      });
      if (mode === 'play-confirmation-hangs') await page.addInitScript(() => {
        const play = HTMLMediaElement.prototype.play; let hung = false;
        HTMLMediaElement.prototype.play = function () {
          if (this.src.includes('/__fixture__/') && !hung) { hung = true; return new Promise(() => {}); }
          return play.call(this);
        };
      });
      if (mode === 'blocked-session-storage') await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Storage blocked fixture', 'SecurityError'); } }));
      page.on('pageerror', error => errors.push(String(error)));
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) return route.abort();
        if (url.pathname === '/__fixture__/clip.webm') {
          mediaRequests++;
          return route.fulfill({ status: 200, contentType: 'video/webm', body: broken || (mode === 'transient-media-read' && mediaRequests === 1) ? Buffer.from('invalid fixture media') : clip });
        }
        if (url.pathname === '/api/youth/tokenpay/status') {
          const response = await route.fetch();
          return route.fulfill({ response, json: { connected: true, balanceYuan: 100 } });
        }
        if (!url.pathname.startsWith('/api/youth/classroom')) return route.continue();
        if (url.pathname === '/api/youth/classroom') {
          const body = request.postDataJSON();
          if (!snapshot || snapshot.id !== body.sessionId) {
            const response = await route.fetch();
            snapshot = { ...(await response.json()).outcome.snapshot, configured: true, fixture: true };
          }
        } else if (request.method() === 'DELETE') {
          methods.push(url.search);
          snapshot = null;
          return route.fulfill({ json: { ok: true } });
        } else if (request.method() === 'POST') {
          const command = request.postDataJSON(); commands.push(command);
          if (handled.has(command.id)) return route.fulfill({ json: { ok: true, outcome: { kind: 'snapshot', snapshot } } });
          handled.add(command.id);
          if (command.kind === 'start') {
            executedStarts++;
            const segment = { kind: 'generated', id: 'fixture-final-six', number: 6, durationSeconds: 5, purpose: { kind: 'lesson', stepId: 'fixture-step' }, prompt: 'No-spend fixture', summary: '本地测试片段', captions: [{ startSeconds: 0, endSeconds: 5, text: '本地测试，不是生成视频' }], videoUrl: base + '/__fixture__/clip.webm', providerUrl: base + '/__fixture__/clip.webm', expandedPrompt: null, timings: { requestId: 'fixture-receipt', queueWaitMs: null, inferenceMs: null, totalMs: 0 } };
            snapshot = { ...snapshot, version: snapshot.version + 1, epoch: 1, teacherId: command.teacherId, topic: command.topic, phase: mode === 'refresh-final' ? 'live' : 'priming', production: { kind: 'draining', reason: 'lesson-complete' }, playback: mode === 'refresh-final' ? { kind: 'playing', sceneNumber: 6 } : { kind: 'priming' }, hasPlaybackBegun: mode === 'refresh-final', committedThrough: 6, playing: mode === 'refresh-final' ? segment : null, ready: mode === 'refresh-final' ? [] : [segment], playlist: [{ sessionId: snapshot.id, position: 1, topic: command.topic, kind: mode === 'refresh-final' ? 'playing' : 'ready' }] };
            if (mode === 'lost-start-ack') return route.abort();
          } else if (command.kind === 'report-playback') {
            const report = command.report;
            if (mode === 'delayed-start-report' && report.kind === 'started') await new Promise(resolve => setTimeout(resolve, 5000));
            handledReports.push(report.kind);
            if (report.kind === 'started') snapshot = { ...snapshot, phase: 'live', version: snapshot.version + 1, playing: snapshot.playing || snapshot.ready[0], ready: [], hasPlaybackBegun: true, playback: { kind: 'playing', sceneNumber: 6 }, playlist: [{ ...snapshot.playlist[0], kind: 'playing' }] };
            if (report.kind === 'drained') snapshot = { ...snapshot, version: snapshot.version + 1, phase: 'complete', production: { kind: 'closed' }, playing: null, ready: [], playback: { kind: 'ended', finalSceneNumber: 6 }, playlist: [{ ...snapshot.playlist[0], kind: 'complete' }] };
          } else throw new Error('Unexpected fixture command');
        }
        return route.fulfill({ json: { ok: true, outcome: { kind: 'snapshot', snapshot } } });
      });
      try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-scene-ready="true"]');
        clip = Buffer.from(await page.evaluate(async () => {
          const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
          const ctx = canvas.getContext('2d'), stream = canvas.captureStream(10);
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
          const chunks = [], done = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = resolve; });
          const draw = () => { ctx.fillStyle = '#243c36'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#eee8d7'; ctx.font = '18px sans-serif'; ctx.fillText('本地恢复测试', 70, 90); };
          draw(); recorder.start(); const timer = setInterval(draw, 100);
          await new Promise(resolve => setTimeout(resolve, 2500)); recorder.stop(); clearInterval(timer); stream.getTracks().forEach(track => track.stop()); await done;
          return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
        }));
        await page.getByLabel('想学习的问题', { exact: true }).fill('恢复测试');
        await page.getByRole('button', { name: '开始探索', exact: true }).click();
        if (mode === 'refresh-final') {
          await page.waitForFunction(() => document.querySelector('.lesson-video-visible')?.currentTime > .1);
          assert.equal(snapshot.ready.length, 0, 'The final playing scene has no ready runway');
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => document.querySelector('.lesson-video-visible')?.currentTime > .1);
          assert.ok(commands.filter(c => c.kind === 'report-playback' && c.report.kind === 'started').length >= 2, 'A remount resumes the existing playing scene');
          await page.getByRole('button', { name: '提新问题', exact: true }).waitFor();
          await page.screenshot({ path: path.join(out, mode + '.png') });
        } else if (mode.includes('failed')) {
          await page.getByRole('button', { name: '重新加载视频（不重新生成）', exact: true }).waitFor();
          const buttonBox = await page.locator('.youth-notice').getByRole('button', { name: '重新加载视频（不重新生成）', exact: true }).boundingBox();
          assert.ok(buttonBox && buttonBox.height >= 44 && buttonBox.x >= 0 && buttonBox.x + buttonBox.width <= page.viewportSize().width, 'Recovery is accessible outside the scaled television');
          const noticeBox = await page.locator('.youth-notice').boundingBox(), walletBox = await page.locator('.youth-wallet-chip').boundingBox();
          assert.ok(noticeBox && walletBox && !(noticeBox.x < walletBox.x + walletBox.width && noticeBox.x + noticeBox.width > walletBox.x && noticeBox.y < walletBox.y + walletBox.height && noticeBox.y + noticeBox.height > walletBox.y), 'The wallet never covers recovery text');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), page.viewportSize().width, 'No horizontal overflow');
          await page.screenshot({ path: path.join(out, mode + '-load-failure.png') });
          broken = false;
          await page.getByRole('button', { name: '重新加载视频（不重新生成）', exact: true }).click();
          await page.waitForFunction(() => document.querySelector('.lesson-video-visible')?.currentTime > .1);
          await page.locator('.youth-guide').getByRole('button', { name: '退出课程', exact: true }).click();
          await page.getByRole('heading', { name: '从一个好问题开始', exact: true }).waitFor();
          assert.deepEqual(methods, ['?abandon=1']);
          await page.screenshot({ path: path.join(out, 'exit-to-lobby.png') });
        } else {
          if (mode.endsWith('autoplay-denied')) {
            const button = page.getByRole('button', { name: '播放课程并开启声音', exact: true });
            await button.waitFor(); const box = await button.boundingBox(); assert.ok(box?.height >= 44);
            await button.click();
          }
          await page.waitForFunction(() => document.querySelector('.lesson-video-visible')?.currentTime > .1);
          if (mode === 'server-restart-version') {
            const segment = snapshot.playing || snapshot.ready[0];
            snapshot = { ...snapshot, version: 1000, playlist: [{ ...snapshot.playlist[0], topic: '重启前的课程' }] };
            await page.locator('.guide-heading strong').filter({ hasText: '重启前的课程' }).waitFor();
            snapshot = { ...snapshot, runtimeId: 'restored-process-fixture', version: 1, phase: 'priming', hasPlaybackBegun: false,
              playing: null, ready: [{ ...segment, id: 'restored-scene-id' }], playback: { kind: 'priming' },
              playlist: [{ ...snapshot.playlist[0], topic: '恢复后的课程', kind: 'ready' }] };
            await page.locator('.guide-heading strong').filter({ hasText: '恢复后的课程' }).waitFor();
            await page.waitForFunction(() => document.querySelector('.lesson-video-visible')?.currentTime > .1);
            assert.ok(commands.some(c => c.kind === 'report-playback' && c.report.kind === 'started' && c.report.sceneId === 'restored-scene-id'));
          }
          await page.getByRole('button', { name: '提新问题', exact: true }).waitFor();
          await page.waitForTimeout(700);
          assert.ok(handledReports.indexOf('started') < handledReports.indexOf('drained'), 'Playback reports arrive in order even when a started acknowledgement is slow');
          if (mode !== 'server-restart-version') assert.equal(commands.filter(c => c.kind === 'report-playback' && c.report.kind === 'started').length, 1, 'Stale server snapshots cannot replay an already finished local scene');
          await page.screenshot({ path: path.join(out, mode + '.png') });
        }
        const startCommands = commands.filter(c => c.kind === 'start');
        assert.equal(executedStarts, 1, 'A classroom is started exactly once');
        assert.equal(new Set(startCommands.map(c => c.id)).size, 1, 'Lost replies never get a new operation ID');
        assert.equal(startCommands.length, mode === 'lost-start-ack' ? 2 : 1);
        assert.equal(commands.filter(c => c.kind === 'queue-lesson').length, 0);
        assert.deepEqual(errors, []);
        results.push({ mode, startCount: executedStarts, startConfirmations: startCommands.length, mediaRequests, providerCalls: 0, playbackReports: handledReports, errors });
      } catch (error) {
        await page.screenshot({ path: path.join(out, mode + '-failed.png') });
        fs.writeFileSync(path.join(out, mode + '-failed.json'), JSON.stringify({ errors, commands, snapshot, text: await page.locator('main').innerText(), videos: await page.locator('video').evaluateAll(videos => videos.map(video => ({ source: video.currentSrc, error: video.error?.code, ready: video.readyState }))) }, null, 2));
        throw error;
      } finally { await context.close(); }
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ verified: true, evidence: 'local browser fixtures only', results }, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
