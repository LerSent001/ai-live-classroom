// Read-only retries. Never use this helper for a planner, authorization exchange,
// video submission, or any other billable/mutating POST.
const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

export async function readProvider<T>(url: string, options: {
  request?: typeof fetch; headers?: HeadersInit; timeoutMs?: number; maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>; label: string; read(response: Response): Promise<T>;
}): Promise<T> {
  const request = options.request ?? fetch;
  const pause = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const attempts = options.maxAttempts ?? 3;
  for (let attempt = 1; ; attempt++) {
    let terminal = false;
    try {
      const response = await request(url, { method: "GET", headers: options.headers, cache: "no-store",
        redirect: "error", signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
      if (!response.ok) {
        terminal = !TRANSIENT.has(response.status) || response.headers.has("TokenDance-Recovery-Action");
        throw new Error(`${options.label}（HTTP ${response.status}）`);
      }
      return await options.read(response);
    } catch {
      // Provider bodies, URLs with signatures, and credentials never enter logs.
      if (terminal || attempt >= attempts) throw new Error(options.label);
      await pause(Math.min(2000, attempt * 500));
    }
  }
}

export function isVideoContainer(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && (
    (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) ||
    (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
  );
}
