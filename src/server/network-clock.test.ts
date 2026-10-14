import test from 'node:test';
import assert from 'node:assert/strict';
import { readNetworkClock } from './network-clock';

test('network time has explicit fallback, then calibrates from HTTPS Date and caches the sample', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal((await readNetworkClock()).source, 'server-fallback');
    let calls = 0;
    const epoch = Date.parse('2026-10-14T07:00:00Z');
    globalThis.fetch = async () => { calls++; return new Response(null, { headers: { date: new Date(epoch).toUTCString() } }); };
    const sample = await readNetworkClock();
    assert.equal(sample.source, 'network');
    assert.ok(Math.abs(sample.epochMs - epoch - 500) < 100);
    const later = await readNetworkClock();
    assert.equal(calls, 1); assert.ok(later.epochMs >= sample.epochMs);
  } finally { globalThis.fetch = original; }
});
