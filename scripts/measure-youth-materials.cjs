// Finite, isolated no-spend A/B probe. Synchronised render time includes CPU and
// GPU waiting; it is NOT a pure GPU timer or a temperature/battery measurement.
/* eslint-disable @typescript-eslint/no-require-imports -- standalone QA */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.YOUTH_TEST_URL || 'http://127.0.0.1:3029';
const label = process.argv[2] || 'candidate';
if (!/^[a-z-]+$/.test(label)) throw new Error('Invalid report label');
const out = path.resolve('output/youth-material-study');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--enable-gpu', '--use-angle=metal', '--disable-background-networking'] });
  const runs = [];
  try {
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
      await context.route('**/*', route => {
        const r = route.request();
        if (!r.url().startsWith(base)) return route.abort();
        if (r.method() === 'POST' && /\/api\/classroom\//.test(r.url())) return route.abort();
        return route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.addInitScript(() => {
        const results = window.__renderProbe = { frames: [], allocations: [] };
        const contexts = new Set();
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          const gl = getContext.call(this, type, ...args);
          if (gl && type === 'webgl2' && !contexts.has(gl)) {
            contexts.add(gl);
            for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
              const original = gl[name].bind(gl);
              gl[name] = (...values) => { gl.__probeDraws = (gl.__probeDraws || 0) + 1; return original(...values); };
            }
            const storage = gl.texStorage2D.bind(gl);
            gl.texStorage2D = (...values) => { results.allocations.push({ levels: values[1], format: values[2], width: values[3], height: values[4] }); return storage(...values); };
          }
          return gl;
        };
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => raf(time => {
          const counters = new Map(Array.from(contexts, gl => [gl, gl.__probeDraws || 0]));
          const start = performance.now();
          callback(time);
          let draws = 0;
          for (const gl of contexts) {
            const count = (gl.__probeDraws || 0) - (counters.get(gl) || 0);
            if (count) { gl.finish(); draws += count; }
          }
          if (draws) results.frames.push({ ms: performance.now() - start, draws });
        });
      });
      await page.goto(base + '/zh-youth', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-scene-ready="true"]', { timeout: 60000 });
      await page.waitForTimeout(400);
      if (run === 2) await page.screenshot({ path: path.join(out, `${label}.png`) });
      const data = await page.evaluate(() => ({ ...window.__renderProbe, diagnostics: { ...document.querySelector('canvas').dataset } }));
      // Exclude initial shader/texture upload and one-time shadow captures.
      const samples = data.frames.slice(12).filter(frame => frame.draws < 40).map(frame => frame.ms).sort((a,b) => a-b);
      runs.push({ medianMs: samples[Math.floor(samples.length / 2)], p95Ms: samples[Math.floor(samples.length * .95)], samples: samples.length, ...data, errors });
      await context.close();
    }
    const result = { label, viewport: [1672, 941], method: 'RAF callback + gl.finish; warm entrance frames; same host/headless browser; not thermal or pure GPU measurement', runs };
    fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ label, runs: runs.map(({medianMs,p95Ms,samples,diagnostics,allocations,errors}) => ({medianMs,p95Ms,samples,diagnostics,allocations,errors})) }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
