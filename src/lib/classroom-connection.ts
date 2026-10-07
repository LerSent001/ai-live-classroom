import { parseClassroomApiResponse } from "@/lib/classroom-boundaries";
import { CLASSROOM_CONFIG } from "@/lib/classroom-config";
import type { ClassroomSessionId, ClassroomSnapshot, CommandOutcome } from "@/lib/classroom-types";

export class ClassroomApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ClassroomApiError";
  }
}

export function isMissingClassroomSession(error: unknown): boolean {
  return error instanceof ClassroomApiError && error.status === 404 && error.code === "SESSION_NOT_FOUND";
}

export async function readClassroomResponse(
  response: Response,
  sessionId: ClassroomSessionId,
): Promise<CommandOutcome> {
  if (!response.ok && [408, 429, 500, 502, 503, 504].includes(response.status)) {
    throw new ClassroomApiError(response.status, "CONNECTION_RETRY", "正在恢复课堂连接，已提交任务仍在后台处理。请勿重复提交。");
  }
  const raw: unknown = await response.json();
  const parsed = parseClassroomApiResponse(raw);
  if (!parsed.ok) throw new ClassroomApiError(response.status, parsed.error.code, parsed.error.message);
  if (parsed.outcome.snapshot.id !== sessionId) throw new Error("The classroom response has a different session ID.");
  return parsed.outcome;
}

export function isTransientClassroomError(error: unknown): boolean {
  return !(error instanceof ClassroomApiError) || error.code === "RECORDING_RECOVERING" ||
    [408, 429, 500, 502, 503, 504].includes(error.status);
}

/** A new process has its own version counter. Retired processes must not win a
 * late response, but a restored process must not be discarded as old state. */
export function shouldAcceptClassroomSnapshot(current: ClassroomSnapshot | null, next: ClassroomSnapshot, retired = new Set<string>()): boolean {
  if (next.runtimeId && retired.has(next.runtimeId)) return false;
  if (!current || current.id !== next.id) return true;
  if (current.runtimeId && !next.runtimeId) return false;
  return current.runtimeId !== next.runtimeId || current.version <= next.version;
}

async function requestClassroomResponse<T>(url: string, init: RequestInit, read: (response: Response) => Promise<T>,
  options: { signal?: AbortSignal; timeoutMs?: number; request?: typeof fetch } = {}): Promise<T> {
  if (options.signal?.aborted) throw options.signal.reason;
  const controller = new AbortController();
  let rejectAbort!: (reason: unknown) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => { const error = options.signal?.reason ?? new DOMException("Aborted", "AbortError"); controller.abort(error); rejectAbort(error); };
  options.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    const error = new DOMException("Classroom connection confirmation timed out", "TimeoutError");
    controller.abort(error); rejectAbort(error);
  }, options.timeoutMs ?? 10_000);
  try {
    const work = (options.request ?? fetch)(url, { ...init, signal: controller.signal })
      .then(read);
    return await Promise.race([work, interrupted]);
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}

export async function requestClassroomSnapshot(url: string, init: RequestInit, sessionId: ClassroomSessionId,
  options: { signal?: AbortSignal; timeoutMs?: number; request?: typeof fetch } = {}): Promise<CommandOutcome> {
  return requestClassroomResponse(url, init, response => readClassroomResponse(response, sessionId), options);
}

function waitForConnection(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** Only the application command is retried, with exactly the same receipt ID.
 * The server deduplicates it; this NEVER retries a provider generation POST. */
export async function sendClassroomCommand(input: {
  apiBase: string; sessionId: ClassroomSessionId; command: Record<string, unknown>; commandId: string;
  signal?: AbortSignal; onRetry?(attempt: number): void;
}, options: { request?: typeof fetch; timeoutMs?: number; retryDelayMs?: number } = {}): Promise<CommandOutcome> {
  const body = JSON.stringify({ ...input.command, id: input.commandId });
  for (let attempt = 1; ; attempt++) {
    if (input.signal?.aborted) throw input.signal.reason;
    try {
      return await requestClassroomSnapshot(`${input.apiBase}/${input.sessionId}`, {
        method: "POST", headers: { "content-type": "application/json" }, body,
      }, input.sessionId, { signal: input.signal, request: options.request, timeoutMs: options.timeoutMs });
    } catch (error) {
      if (input.signal?.aborted || !isTransientClassroomError(error)) throw error;
      input.onRetry?.(attempt);
      await waitForConnection(options.retryDelayMs ?? Math.min(5000, attempt * 500), input.signal);
    }
  }
}

/** Clearing is idempotent: a missing session after a lost reply is already clear.
 * Retries only DELETE, never session creation or generation. */
export async function clearClassroomSession(input: {
  apiBase: string; sessionId: ClassroomSessionId; abandon?: boolean;
  signal?: AbortSignal; onRetry?(attempt: number): void;
}, options: { request?: typeof fetch; timeoutMs?: number; retryDelayMs?: number } = {}): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    if (input.signal?.aborted) throw input.signal.reason;
    try {
      await requestClassroomResponse(`${input.apiBase}/${input.sessionId}${input.abandon ? "?abandon=1" : ""}`, { method: "DELETE" }, async response => {
        if (response.status === 404) return;
        if (response.ok) return;
        if ([408, 429, 500, 502, 503, 504].includes(response.status)) throw new ClassroomApiError(response.status, "CONNECTION_RETRY", "正在恢复退出连接。");
        const parsed = parseClassroomApiResponse(await response.json());
        throw new ClassroomApiError(response.status, parsed.ok ? "RESET_FAILED" : parsed.error.code, parsed.ok ? "课堂暂时无法退出。" : parsed.error.message);
      }, { ...options, signal: input.signal });
      return;
    } catch (error) {
      if (input.signal?.aborted || !isTransientClassroomError(error)) throw error;
      input.onRetry?.(attempt);
      await waitForConnection(options.retryDelayMs ?? Math.min(5000, attempt * 500), input.signal);
    }
  }
}

// Establish the free, idle session before polling. Never replay lesson commands here.
export function watchClassroomSession(input: Readonly<{
  apiBase?: string;
  sessionId: ClassroomSessionId;
  onSnapshot: (snapshot: ClassroomSnapshot) => void;
  onError: (error: unknown) => void;
  requestTimeoutMs?: number;
}>): () => void {
  const controller = new AbortController();
  const apiBase = input.apiBase ?? "/api/classroom";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let connected = false;
  let intervalMs: number = CLASSROOM_CONFIG.pollIntervalMs;

  const poll = async () => {
    try {
      const outcome = await requestClassroomSnapshot(connected ? `${apiBase}/${input.sessionId}` : apiBase,
        connected ? { cache: "no-store" } : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: input.sessionId }),
          }, input.sessionId, { signal: controller.signal, timeoutMs: input.requestTimeoutMs });
      if (controller.signal.aborted) return;
      connected = true;
      input.onSnapshot(outcome.snapshot);
      const startingUp = !outcome.snapshot.hasPlaybackBegun && outcome.snapshot.production.kind !== "idle";
      intervalMs = startingUp ? CLASSROOM_CONFIG.startupPollIntervalMs : CLASSROOM_CONFIG.pollIntervalMs;
    } catch (error) {
      if (controller.signal.aborted) return;
      input.onError(error);
      // A lost server session is terminal for this observer. The UI decides how to re-enter.
      if (isMissingClassroomSession(error)) return;
    }
    if (!controller.signal.aborted) timer = setTimeout(poll, intervalMs);
  };

  void poll();
  return () => {
    controller.abort();
    if (timer !== null) clearTimeout(timer);
  };
}
