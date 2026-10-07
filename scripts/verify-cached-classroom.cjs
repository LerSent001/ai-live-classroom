// Native saved-course API and original scripts/MP4s. No wallet, provider or new generation.
/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { SavedClassrooms } = require('../src/server/saved-classrooms.ts');
const base = process.env.YOUTH_TEST_URL || 'http://127.0.0.1:3028';
const root = path.resolve('recordings'), id = 'classroom-fb4fde11-6d8c-4dbe-a096-bc7c561cc906';
const recorded = new SavedClassrooms(root).load(id), out = path.resolve('output/cached-classroom-qa');
const files = recorded.lessons.flatMap(lesson => fs.readdirSync(path.join(root, lesson.recordingId)).map(name => path.join(root, lesson.recordingId, name)));
const hash = () => files.map(file => [path.relative(root, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
const before = hash(); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-gpu', '--use-angle=metal', '--disable-background-networking'] });
  const context = await browser.newContext({ viewport: { width: 1672, height: 941 } }), page = await context.newPage();
  const errors = [], reports = [], snapshots = [], external = [], media = new Set(), durations = new Set();
  let starts = 0, queues = 0;
  page.setDefaultTimeout(90000); page.on('pageerror', e => errors.push(String(e)));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { external.push(url.hostname); return route.abort(); }
    if (url.pathname.startsWith('/api/saved-video/')) media.add(url.pathname);
    if (url.pathname === '/api/youth/tokenpay/status') return route.fulfill({ json: { connected: true, balanceYuan: null } });
    if (!url.pathname.startsWith('/api/youth/classroom')) return route.continue();
    // Exercise the main UI with the original legacy course via its real saved-course API.
    // The old bear identity and lesson content are NOT renamed as a new mentor course.
    const target = base + url.pathname.replace('/api/youth/classroom', '/api/classroom') + url.search;
    let body;
    if (request.method() === 'POST') {
      body = request.postDataJSON();
      if (body.kind === 'start') { body.teacherId = recorded.lessons[0].lesson.teacherId; starts++; }
      if (body.kind === 'queue-lesson') queues++;
      if (body.kind === 'report-playback') reports.push(body.report);
    }
    const response = await route.fetch({ url: target, ...(body ? { postData: body } : {}) });
    const data = await response.json(); assert.equal(data.ok, true, JSON.stringify(data));
    if (data.outcome) { data.outcome.snapshot.configured = true; snapshots.push(data.outcome.snapshot); }
    return route.fulfill({ response, json: data });
  });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-scene-ready="true"]');
    await page.getByLabel('想学习的问题', { exact: true }).fill(recorded.lessons[0].lesson.topic);
    await page.getByRole('button', { name: '开始探索', exact: true }).click();
    await page.getByText('时长待规划', { exact: true }).waitFor();
    for (const lesson of recorded.lessons.slice(1)) {
      await page.getByLabel('继续学习的问题', { exact: true }).fill(lesson.lesson.topic);
      await page.getByRole('button', { name: '加入续讲', exact: true }).click();
    }
    await page.waitForFunction(() => document.querySelector('.lesson-video-visible')?.currentTime > .25);
    await page.screenshot({ path: path.join(out, 'playing-original-cache.png') });
    await page.getByRole('button', { name: '提新问题', exact: true }).waitFor();
    await page.waitForTimeout(750);
    await page.screenshot({ path: path.join(out, 'complete-original-cache.png') });
    const end = snapshots.at(-1), activations = reports.filter(r => r.kind === 'started' || r.kind === 'advanced');
    assert.equal(starts, 1); assert.equal(queues, 2); assert.equal(media.size, 10); assert.equal(activations.length, 10);
    assert.equal(end.playlist.length, 3); assert.ok(end.playlist.every(lesson => lesson.kind === 'complete'));
    assert.equal(end.warning, null); assert.equal(end.metrics.skippedScenes, 0); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    for (const snapshot of snapshots) if (snapshot.lesson) durations.add(snapshot.lesson.durationSeconds);
    assert.deepEqual(hash(), before, 'original scripts, task receipts, metadata and MP4s must remain unchanged');
    const elapsedSeconds = (reports.findLast(r => r.kind === 'drained').atMs - activations[0].atMs) / 1000;
    assert.ok(elapsedSeconds >= 50 && elapsedSeconds < 90);
    await page.getByRole('button', { name: '提新问题', exact: true }).click();
    await page.getByRole('button', { name: '开始探索', exact: true }).waitFor();
    const result = { verified: true, evidence: 'ORIGINAL cached scripts and 10 real MP4s through native saved-course API, main UI uses an isolated cache-routing test harness', providerCalls: 0, nominalPathSeconds: recorded.lessons.map(l => l.lesson.durationSeconds), playbackActivations: activations.length, uniqueMedia: media.size, elapsedSeconds, originalFilesUnchanged: true, exitToLobby: true, errors };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failed.png') });
    fs.writeFileSync(path.join(out, 'failed.json'), JSON.stringify({ errors, reports, text: await page.locator('main').innerText(), snapshot: snapshots.at(-1) }, null, 2));
    throw error;
  } finally { await context.close(); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
