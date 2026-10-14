type ClockSample = { epochMs: number; source: 'network' | 'server-fallback'; sampledAt: number };
let cached: { epochMs: number; monotonicMs: number; sampledAt: number } | undefined;
let pending: Promise<ClockSample> | undefined;

export async function readNetworkClock(): Promise<ClockSample> {
  if (cached && performance.now() - cached.monotonicMs < 300_000) {
    return { epochMs: cached.epochMs + performance.now() - cached.monotonicMs, source: 'network', sampledAt: cached.sampledAt };
  }
  if (pending) return pending;
  pending = (async () => {
    // Fixed HTTPS origins only. No user URL, credentials or paid providers.
    for (const url of ['https://www.baidu.com/', 'https://www.qq.com/']) {
      try {
        const started = performance.now();
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(2500) });
        const date = Date.parse(response.headers.get('date') ?? '');
        const age = Number(response.headers.get('age') ?? 0);
        if (!response.ok || !Number.isFinite(date) || !Number.isFinite(age) || age > 5) continue;
        // HTTP Date has second precision. Mid-second plus half the measured RTT.
        cached = { epochMs: date + age * 1000 + 500 + (performance.now() - started) / 2, monotonicMs: performance.now(), sampledAt: Date.now() };
        return { epochMs: cached.epochMs, source: 'network' as const, sampledAt: cached.sampledAt };
      } catch { /* Try the other origin; retain explicit fallback provenance. */ }
    }
    return { epochMs: cached ? cached.epochMs + performance.now() - cached.monotonicMs : Date.now(), source: 'server-fallback' as const, sampledAt: cached?.sampledAt ?? Date.now() };
  })();
  try { return await pending; } finally { pending = undefined; }
}
