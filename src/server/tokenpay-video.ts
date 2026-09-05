import { H3_MAX_CONFIG, h3InputForPrompt } from "@/lib/classroom-config";
import { isRecord } from "@/lib/classroom-boundaries";
import type { RenderTimings } from "@/lib/classroom-types";

const QUERY_URL = "https://tokendance.space/gateway/minimax/v2/query/video_generation/";
const RECOVERY_MESSAGES: Record<string, string> = {
  top_up_balance: "TokenPay 余额不足，请充值后再开始。",
  reauthorize_api_key: "TokenPay Key 无效或已过期，请重新授权。",
  api_key_quota: "TokenPay Key 额度已用完，请等待刷新或重新授权。",
};

export class TokenPayError extends Error {
  constructor(message: string, readonly status?: number, readonly recoveryAction?: string) {
    super(message);
    this.name = "TokenPayError";
  }
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const recovery = response.headers.get("TokenDance-Recovery-Action") ?? undefined;
    // Never copy provider bodies into logs: they may echo credentials or request content.
    throw new TokenPayError(
      (recovery && RECOVERY_MESSAGES[recovery]) || `TokenPay 请求失败（HTTP ${response.status}）。未重新提交，也未切换视频服务。`,
      response.status, recovery,
    );
  }
  return response.json();
}

function taskIdOf(payload: unknown): string {
  if (!isRecord(payload)) throw new TokenPayError("TokenPay 未返回任务 ID；不会重新提交。");
  const id = isRecord(payload.task) ? payload.task.id ?? payload.task.task_id : payload.task_id ?? payload.id;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,180}$/.test(id)) {
    throw new TokenPayError("TokenPay 返回了无效任务 ID；请核对平台记录，不会重新提交。");
  }
  return id;
}

export async function generateTokenPayVideo(
  input: { prompt: string; apiKey: string; onSubmitted?: (requestId: string) => void },
  dependencies: {
    request?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    timeoutMs?: number;
  } = {},
): Promise<{ providerUrl: string; expandedPrompt: null; queueLogs: readonly string[]; timings: RenderTimings }> {
  if (!input.apiKey.trim()) throw new TokenPayError("TOKENDANCE_API_KEY 未配置，无法生成视频。");
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
  let submitted: unknown;
  try {
    submitted = await readResponse(await request(H3_MAX_CONFIG.endpoint, {
      method: "POST", headers, redirect: "error",
      body: JSON.stringify(h3InputForPrompt(input.prompt)), signal: AbortSignal.timeout(30_000),
    }));
  } catch (error) {
    if (error instanceof TokenPayError) throw error;
    throw new TokenPayError("TokenPay 提交结果未知，请核对平台记录。不会自动重试或切换视频服务。");
  }
  const id = taskIdOf(submitted);
  input.onSubmitted?.(id);
  const deadline = now() + (dependencies.timeoutMs ?? 15 * 60_000);
  let runningAt: number | null = null;
  while (now() < deadline) {
    let payload: unknown;
    try {
      payload = await readResponse(await request(`${QUERY_URL}${encodeURIComponent(id)}`, {
        method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(30_000),
      }));
    } catch (error) {
      if (error instanceof TokenPayError) throw error;
      throw new TokenPayError(`TokenPay 任务 ${id} 查询失败；任务可能仍在运行，请查询原任务，不要重复生成。`);
    }
    if (!isRecord(payload) || !isRecord(payload.task)) throw new TokenPayError(`TokenPay 任务 ${id} 状态格式无效。`);
    const task = payload.task;
    if (task.status === "succeeded") {
      const value = isRecord(task.content) ? task.content.url : null;
      let url: URL;
      try { url = new URL(typeof value === "string" ? value : ""); }
      catch { throw new TokenPayError(`TokenPay 任务 ${id} 未返回有效视频链接。`); }
      if (url.protocol !== "https:" || url.username || url.password) throw new TokenPayError("TokenPay 返回了不安全的视频链接。");
      return {
        providerUrl: url.toString(), expandedPrompt: null, queueLogs: [],
        timings: { requestId: id, queueWaitMs: runningAt === null ? null : runningAt - startedAt, inferenceMs: null, totalMs: now() - startedAt },
      };
    }
    if (["failed", "cancelled", "expired"].includes(String(task.status))) {
      throw new TokenPayError(`TokenPay 任务 ${id} 已结束：${task.status}。不会重新提交。`);
    }
    if (task.status !== "queued" && task.status !== "running") throw new TokenPayError(`TokenPay 任务 ${id} 返回未知状态。`);
    if (task.status === "running" && runningAt === null) runningAt = now();
    await sleep(5_000);
  }
  throw new TokenPayError(`TokenPay 任务 ${id} 等待超时；任务可能仍在运行，请核对原任务。`);
}
