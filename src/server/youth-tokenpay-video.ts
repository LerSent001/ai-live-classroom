import { H3_MAX_CONFIG, h3InputForPrompt } from "@/server/youth-tokenpay-config";
import { isRecord } from "@/lib/classroom-boundaries";
import type { RenderTimings } from "@/lib/classroom-types";

const QUERY_URL = "https://tokendance.space/gateway/minimax/v2/query/video_generation/";
const RETRYABLE_QUERY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RECOVERY_MESSAGES: Record<string, string> = {
  top_up_balance: "TokenDance 余额不足，请充值后再开始。",
  reauthorize_api_key: "TokenDance Key 无效或已过期，请重新授权。",
  api_key_quota: "TokenDance Key 额度已用完，请等待刷新或重新授权。",
};

export class TokenDanceError extends Error {
  constructor(message: string, readonly status?: number, readonly recoveryAction?: string) {
    super(message);
    this.name = "TokenDanceError";
  }
}

/** Querying reached its local window, NOT a failed generation. The durable ID
 * can be queried again without making another billable submission. */
export class TokenDanceTaskPending extends TokenDanceError {
  constructor(readonly requestId: string, detail: string) {
    super(`TokenDance 任务 ${requestId} 等待超时${detail}；任务可能仍在运行，请核对原任务，不要重复生成。`);
    this.name = "TokenDanceTaskPending";
  }
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const recovery = response.headers.get("TokenDance-Recovery-Action") ?? undefined;
    // Never copy provider bodies into logs: they may echo credentials or request content.
    throw new TokenDanceError(
      (recovery && RECOVERY_MESSAGES[recovery]) || `TokenDance 请求失败（HTTP ${response.status}）。未重新提交，也未切换视频服务。`,
      response.status, recovery,
    );
  }
  return response.json();
}

function taskIdOf(payload: unknown): string {
  if (!isRecord(payload)) throw new TokenDanceError("TokenDance 未返回任务 ID；不会重新提交。");
  const id = isRecord(payload.task) ? payload.task.id ?? payload.task.task_id : payload.task_id ?? payload.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,180}$/.test(id)) {
    throw new TokenDanceError("TokenDance 返回了无效任务 ID；请核对平台记录，不会重新提交。");
  }
  return id;
}

function retryableQueryIssue(error: unknown): string | null {
  if (error instanceof TokenDanceError) {
    if (error.recoveryAction || !RETRYABLE_QUERY_STATUSES.has(error.status ?? 0)) return null;
    return `HTTP ${error.status}`;
  }
  // A failed GET cannot create a second paid task. Retry the known task ID,
  // including transport timeouts and malformed gateway JSON, until the deadline.
  return error instanceof SyntaxError ? "invalid-json" : "network-or-timeout";
}

export async function generateTokenDanceVideo(
  input: { prompt: string; apiKey: string; resumeRequestId?: string; onSubmitted?: (requestId: string) => void;
    onQueryRetry?: (event: { requestId: string; attempt: number; reason: string }) => void },
  dependencies: {
    request?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
  } = {},
): Promise<{ providerUrl: string; expandedPrompt: null; queueLogs: readonly string[]; timings: RenderTimings }> {
  if (!input.apiKey.trim()) throw new TokenDanceError("TOKENDANCE_API_KEY 未配置，无法生成视频。");
  const request = dependencies.request ?? fetch;
  const sleep = dependencies.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const headers = {
    Authorization: `Bearer ${input.apiKey.trim()}`,
    "Content-Type": "application/json",
    "X-App-URL": H3_MAX_CONFIG.appUrl,
  };
  // A transport error is ambiguous: never retry this paid POST, including redirects.
  let id: string;
  if (input.resumeRequestId !== undefined) {
    id = taskIdOf({ task_id: input.resumeRequestId });
  } else {
    let submitted: unknown;
    try {
      submitted = await readResponse(await request(H3_MAX_CONFIG.endpoint, {
        method: "POST", headers, redirect: "error",
        body: JSON.stringify(h3InputForPrompt(input.prompt)), signal: AbortSignal.timeout(30_000),
      }));
    } catch (error) {
      if (error instanceof TokenDanceError) throw error;
      throw new TokenDanceError("TokenDance 提交结果未知，请核对平台记录。不会自动重试或切换视频服务。");
    }
    id = taskIdOf(submitted);
    // Await durable receipt storage before starting the query loop.
    input.onSubmitted?.(id);
  }
  const deadline = now() + (dependencies.timeoutMs ?? 15 * 60_000);
  let runningAt: number | null = null;
  let queryRetries = 0;
  let lastQueryIssue: string | null = null;
  while (now() < deadline) {
    let payload: unknown;
    try {
      payload = await readResponse(await request(`${QUERY_URL}${encodeURIComponent(id)}`, {
        method: "GET", headers, redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(Math.min(30_000, Math.max(1, deadline - now()))),
      }));
    } catch (error) {
      const reason = retryableQueryIssue(error);
      if (!reason) throw error;
      lastQueryIssue = reason;
      queryRetries += 1;
      input.onQueryRetry?.({ requestId: id, attempt: queryRetries, reason });
      await sleep(Math.min(10_000, Math.max(0, deadline - now())));
      continue;
    }
    if (!isRecord(payload) || !isRecord(payload.task) || typeof payload.task.status !== "string") {
      lastQueryIssue = "incomplete-task-payload";
      input.onQueryRetry?.({ requestId: id, attempt: ++queryRetries, reason: lastQueryIssue });
      await sleep(Math.min(10_000, Math.max(0, deadline - now())));
      continue;
    }
    lastQueryIssue = null;
    const task = payload.task;
    const returnedId = task.id ?? task.task_id;
    if (returnedId !== undefined && returnedId !== id) {
      lastQueryIssue = "mismatched-task-id";
      input.onQueryRetry?.({ requestId: id, attempt: ++queryRetries, reason: lastQueryIssue });
      await sleep(Math.min(10_000, Math.max(0, deadline - now())));
      continue;
    }
    if (task.status === "succeeded") {
      const value = isRecord(task.content) ? task.content.url : null;
      let url: URL;
      try { url = new URL(typeof value === "string" ? value : ""); }
      catch {
        lastQueryIssue = "missing-result-url";
        input.onQueryRetry?.({ requestId: id, attempt: ++queryRetries, reason: lastQueryIssue });
        await sleep(Math.min(10_000, Math.max(0, deadline - now())));
        continue;
      }
      if (url.protocol !== "https:" || url.username || url.password) throw new TokenDanceError("TokenDance 返回了不安全的视频链接。");
      return {
        providerUrl: url.toString(), expandedPrompt: null, queueLogs: [],
        timings: { requestId: id, queueWaitMs: runningAt === null ? null : runningAt - startedAt, inferenceMs: null, totalMs: now() - startedAt },
      };
    }
    if (["failed", "cancelled", "expired"].includes(String(task.status))) {
      throw new TokenDanceError(`TokenDance 任务 ${id} 已结束：${task.status}。不会重新提交。`);
    }
    if (task.status !== "queued" && task.status !== "running") {
      lastQueryIssue = "unknown-task-status";
      input.onQueryRetry?.({ requestId: id, attempt: ++queryRetries, reason: lastQueryIssue });
      await sleep(Math.min(10_000, Math.max(0, deadline - now())));
      continue;
    }
    if (task.status === "running" && runningAt === null) runningAt = now();
    await sleep(Math.min(10_000, Math.max(0, deadline - now())));
  }
  throw new TokenDanceTaskPending(id, lastQueryIssue ? `（最近一次查询：${lastQueryIssue}）` : "");
}

export async function collectTokenDanceVideo(input: Parameters<typeof generateTokenDanceVideo>[0],
  video: typeof generateTokenDanceVideo = generateTokenDanceVideo,
  options: { onPending?(id: string): void; sleep?: (ms: number) => Promise<void> } = {},
): ReturnType<typeof generateTokenDanceVideo> {
  let resumeRequestId = input.resumeRequestId;
  for (;;) {
    try { return await video({ ...input, resumeRequestId }); }
    catch (error) {
      if (!(error instanceof TokenDanceTaskPending)) throw error;
      resumeRequestId = taskIdOf({ task_id: error.requestId });
      options.onPending?.(resumeRequestId);
      // Back off between query windows. Never pass through the submit branch
      // again, even if the provider is slow or temporarily unreachable.
      await (options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(2000);
    }
  }
}
