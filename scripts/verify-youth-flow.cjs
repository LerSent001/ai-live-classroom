// Full 30/10/10 browser workflow with the actual runtime and local, encoded
// media. ALL providers are in-memory test doubles; no wallet or paid API call.
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { RecordingStore } = require('../src/server/recording-store.ts');
const { YouthRuntimeRegistry } = require('../src/server/youth-classroom-runtime.ts');
const { parseClassroomCommand, parseCreateClassroomRequest } = require('../src/lib/classroom-boundaries.ts');
const { SavedClassrooms } = require('../src/server/saved-classrooms.ts');
const base = process.env.YOUTH_TEST_URL || 'http://127.0.0.1:3028';
const openingSeconds = Number(process.env.YOUTH_OPENING_SECONDS || 30);
assert.ok([15, 20, 25, 30].includes(openingSeconds));
const cached = process.env.YOUTH_CACHED_MEDIA === '1';
const cache = cached ? new SavedClassrooms(path.resolve('recordings')).load('classroom-fb4fde11-6d8c-4dbe-a096-bc7c561cc906') : null;
const cacheFiles = cache?.lessons.flatMap(lesson => lesson.scenes.map((_, n) => path.resolve('recordings', lesson.recordingId, `scene-${String(n + 1).padStart(2, '0')}.mp4`)));
const hashes = cacheFiles?.map(file => require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
const out = path.resolve(cached ? `output/youth-cached-adaptive-${openingSeconds}` : 'output/youth-flow-qa');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'youth-browser-flow-'));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-gpu', '--use-angle=metal', '--disable-background-networking'] });
  let clip, plans = 0, videos = 0, jobs = 0, maxJobs = 0, rootId;
  const commands = [], playback = [], errors = [], blockedExternal = [];
  const store = new RecordingStore(temporary, 'local-no-spend-browser-fixture');
  const registry = new YouthRuntimeRegistry({ get: () => 'FAKE-KEY-NOT-A-REAL-WALLET', revision: () => 0 }, () => store, {
    preflight: async (_id, _key, lesson) => ({ amountCny: 17, durationSeconds: lesson.durationSeconds, quotedAt: 'fixture', videoRateCny: .5 }),
    plan: async input => {
      const initial = ++plans === 1, count = initial ? openingSeconds / 5 : 2;
      const output = JSON.stringify({ durationSeconds: count * 5, title: initial ? '彩虹是怎么形成的？' : '继续认识彩虹', bigQuestion: '阳光为何有多种颜色？', suggestedTopics: ['折射', '散射', '水滴'],
        steps: Array.from({ length: count }, (_, n) => ({ role: 'mechanism', concept: `本地测试概念${n + 1}`, narration: '阳光进入水滴后，方向会发生改变。', visualAction: 'The mentor points at a ray and a water droplet.' })) });
      input.record?.('planner-request', { model: 'local-fixture-no-provider', body: { purpose: 'test only' } });
      input.record?.('planner-response', { model: 'local-fixture-no-provider', output });
      return output;
    },
    video: async input => {
      assert.equal(input.resumeRequestId, undefined);
      const requestId = `local-fixture-video-${++videos}`; input.onSubmitted?.(requestId);
      jobs++; maxJobs = Math.max(maxJobs, jobs);
      await new Promise(resolve => setTimeout(resolve, 100)); jobs--;
      return { providerUrl: `${base}/__fixture__/encoded-${Number(requestId.split('-').at(-1))}.${cached ? 'mp4' : 'webm'}`, expandedPrompt: null, queueLogs: [], timings: { requestId, queueWaitMs: null, inferenceMs: null, totalMs: 100 } };
    },
    download: async url => {
      const number = Number(String(url).match(/encoded-(\d+)/)[1]);
      return new Response(cached ? fs.readFileSync(cacheFiles[number - 1]) : clip, { headers: { 'content-type': cached ? 'video/mp4' : 'video/webm' } });
    },
  });
  const runtime = registry.get('b'.repeat(64));
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  page.setDefaultTimeout(90_000);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { blockedExternal.push(url.hostname); return route.abort(); }
    if (url.pathname === '/api/youth/tokenpay/status') {
      const response = await route.fetch(); return route.fulfill({ response, json: { connected: true, balanceYuan: 100 } });
    }
    if (url.pathname.startsWith('/api/youth/saved-video/')) {
      const parts = url.pathname.split('/');
      return route.fulfill({ status: 200, contentType: cached ? 'video/mp4' : 'video/webm', body: fs.readFileSync(path.join(temporary, parts[4], `scene-${String(Number(parts[5])).padStart(2, '0')}.mp4`)) });
    }
    if (!url.pathname.startsWith('/api/youth/classroom')) return route.continue();
    let snapshot;
    if (url.pathname === '/api/youth/classroom') {
      const input = parseCreateClassroomRequest(request.postDataJSON()); rootId = input.sessionId; snapshot = runtime.create(input);
    } else if (request.method() === 'POST') {
      const command = parseClassroomCommand(request.postDataJSON()); commands.push(command.kind);
      if (command.kind === 'report-playback') playback.push(command.report);
      snapshot = runtime.command(rootId, command)?.snapshot;
    } else snapshot = runtime.view(rootId);
    return route.fulfill({ json: { ok: true, outcome: { kind: 'snapshot', snapshot } } });
  });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-scene-ready="true"]');
    if (!cached) clip = Buffer.from(await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d'), stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [], done = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = resolve; });
      const draw = () => { ctx.fillStyle = '#243c36'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#eee8d7'; ctx.font = '18px sans-serif'; ctx.fillText('Local no-spend QA', 60, 90); };
      draw(); recorder.start(); const timer = setInterval(draw, 100);
      await new Promise(resolve => setTimeout(resolve, 5000)); recorder.stop(); clearInterval(timer); stream.getTracks().forEach(track => track.stop()); await done;
      return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
    }));
    await page.getByLabel('想学习的问题', { exact: true }).fill('彩虹是怎么形成的？');
    await page.getByRole('button', { name: '开始探索', exact: true }).click();
    await page.getByLabel('继续学习的问题', { exact: true }).fill('折射');
    await page.getByRole('button', { name: '加入续讲', exact: true }).click();
    await page.getByLabel('继续学习的问题', { exact: true }).fill('散射');
    await page.getByRole('button', { name: '加入续讲', exact: true }).click();
    await page.getByRole('button', { name: '提新问题', exact: true }).waitFor();
    await page.waitForTimeout(1000);
    const state = runtime.view(rootId), activations = playback.filter(r => r.kind === 'started' || r.kind === 'advanced');
    const expectedClips = openingSeconds / 5 + 4;
    assert.equal(plans, 3); assert.equal(videos, expectedClips); assert.ok(maxJobs <= 2);
    assert.equal(commands.filter(c => c === 'start').length, 1); assert.equal(commands.filter(c => c === 'queue-lesson').length, 2);
    assert.equal(state.playlist.length, 3); assert.ok(state.playlist.every(l => l.kind === 'complete'));
    assert.equal(state.metrics.skippedScenes, 0); assert.equal(activations.length, expectedClips);
    assert.equal(new Set(activations.map(r => r.kind === 'started' ? r.sceneId : r.startedSceneId)).size, expectedClips);
    assert.equal(state.warning, null); assert.deepEqual(errors, []); assert.deepEqual(blockedExternal, []);
    const elapsedSeconds = (playback.findLast(r => r.kind === 'drained').atMs - activations[0].atMs) / 1000;
    assert.ok(elapsedSeconds >= openingSeconds + 17 && elapsedSeconds < openingSeconds + 45, 'All real-duration media clips actually play');
    if (cached) assert.deepEqual(cacheFiles.map(file => require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')), hashes);
    await page.screenshot({ path: path.join(out, 'complete-local-fixture.png') });
    const result = { verified: true, evidence: cached ? 'actual runtime, mock planning/generation, ORIGINAL cached MP4s as media test assets; NOT a newly generated lesson' : 'actual runtime with in-memory providers and locally encoded media ONLY', providerCalls: 0,
      cachedFilesUnchanged: cached ? true : undefined, plannedLessons: plans, videoSubmissions: videos, maxConcurrentJobs: maxJobs, nominalPathSeconds: [openingSeconds, 10, 10], playbackActivations: activations.length, elapsedSeconds, errors };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failed.png') });
    fs.writeFileSync(path.join(out, 'failed.json'), JSON.stringify({ errors, commands, playback, state: rootId ? runtime.view(rootId) : null, text: await page.locator('main').innerText() }, null, 2));
    throw error;
  } finally { await context.close(); await browser.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
