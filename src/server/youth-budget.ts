import { createHash } from "node:crypto";
import { isRecord } from "@/lib/classroom-boundaries";
import { PLANNER_SYSTEM_PROMPT, preparationPrompt } from "@/lib/classroom-config";
import type { LessonDurationSeconds, TeacherId } from "@/lib/classroom-types";
import { H3_MAX_CONFIG, LESSON_PLANNER_CONFIG } from "./youth-tokenpay-config";
import { readBalance } from "./youth-tokenpay-wallet";
import { readProvider } from "./provider-read";

type Quote = { amountCny: number; durationSeconds: number; quotedAt: string; videoRateCny: number };
// Include reference and time-band prices; a conservative maximum avoids relying
// on a promotion or a cheap route. Unknown schemas fail closed before any POST.
function rates(pricing: unknown, id: string, unit: string, resolution?: string): number[] {
  const found: number[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!isRecord(value)) return;
    if (value.id === id) {
      const entries = resolution ? value.skus : value.plans;
      if (Array.isArray(entries)) for (const entry of entries) {
        if (!isRecord(entry) || entry.unit !== unit || (resolution && (!isRecord(entry.specs) || entry.specs.resolution !== resolution))) continue;
        const rate = typeof entry.rate === "string" || typeof entry.rate === "number" ? Number(entry.rate) : NaN;
        if (Number.isFinite(rate) && rate > 0) found.push(rate);
      }
    }
    Object.values(value).forEach(visit);
  }
  visit(pricing);
  if (!found.length) throw new Error("无法核实当前课程价格，未提交付费请求；请稍后重试。");
  return found;
}

export async function quoteYouthLesson(input: { topic: string; teacherId: TeacherId; durationSeconds: LessonDurationSeconds; adaptiveOpening?: boolean; phase?: "lesson" }, request: typeof fetch = fetch): Promise<Quote> {
  const models = await Promise.all([H3_MAX_CONFIG.model, LESSON_PLANNER_CONFIG.tokenDanceModel].map(async (slug) => {
    const model: unknown = await readProvider(`https://tokendance.space/portal/api/models/${slug}`, {
      request, label: "当前课程价格读取失败，未提交付费请求。", read: response => response.json(),
    });
    if (!isRecord(model) || model.slug !== slug || model.is_restricted === true) throw new Error("课程模型或价格不可用，未提交付费请求。");
    return model.pricing;
  }));
  const videoRateCny = Math.max(...rates(models[0], "minimax:video_generation_v2:video_seconds", "seconds", H3_MAX_CONFIG.resolution));
  const inputRate = Math.max(...rates(models[1], "openai:chat-completions:input_tokens", "millionTokens"));
  const outputRate = Math.max(...rates(models[1], "openai:chat-completions:completion_tokens", "millionTokens"));
  // UTF-8 byte count is a deliberately conservative token upper bound for our
  // bounded prompts, with extra room for chat framing. Output is explicitly capped.
  const inputTokens = Buffer.byteLength(PLANNER_SYSTEM_PROMPT + preparationPrompt(input.topic, input.durationSeconds / 5, input.teacherId, { adaptiveOpening: input.adaptiveOpening || input.phase === "lesson" }), "utf8") + 512;
  const plannerCny = (inputTokens * inputRate + LESSON_PLANNER_CONFIG.preparationMaxTokens * outputRate) / 1_000_000;
  const amountCny = Math.ceil((input.durationSeconds * videoRateCny + plannerCny) * 1.1 * 100) / 100;
  return { amountCny, durationSeconds: input.durationSeconds, quotedAt: new Date().toISOString(), videoRateCny };
}

type Reservation = { keyHash: string; quote: Quote; pending: number; closed: boolean; uncertain: boolean };
export class YouthBudgetGuard {
  private reservations = new Map<string, Reservation>();
  private tail: Promise<void> = Promise.resolve();
  constructor(private request: typeof fetch = fetch) {}
  async reserve(id: string, key: string, input: Parameters<typeof quoteYouthLesson>[0]): Promise<Quote> {
    const predecessor = this.tail;
    let unlock!: () => void;
    this.tail = new Promise<void>(resolve => { unlock = resolve; });
    await predecessor;
    try {
      const existing = this.reservations.get(id);
      const keyHash = createHash("sha256").update(key).digest("hex");
      if (input.phase === "lesson") {
        // The admitted ceiling already covers this shorter map. Shrink locally,
        // preserving the planner allowance and original price timestamp; do not
        // add another network round-trip between planning and the first render.
        if (!existing || existing.keyHash !== keyHash || existing.closed || existing.uncertain) throw new Error("课程预算已取消或状态未知，未提交付费请求。");
        if (input.durationSeconds > existing.quote.durationSeconds) throw new Error("实际课程超出已核验预算，未提交付费请求。");
        const released = (existing.quote.durationSeconds - input.durationSeconds) * existing.quote.videoRateCny * 1.1;
        const amountCny = Math.min(existing.quote.amountCny, Math.ceil((existing.quote.amountCny - released) * 100) / 100);
        const quote = { ...existing.quote, durationSeconds: input.durationSeconds, amountCny };
        this.reservations.set(id, { ...existing, quote });
        return quote;
      }
      if (existing && existing.keyHash !== keyHash) throw new Error("课程预算身份不匹配，未提交付费请求。");
      if (existing) return existing.quote;
      const [balance, quote] = await Promise.all([readBalance(key, this.request), quoteYouthLesson(input, this.request)]);
      const held = [...this.reservations.entries()].filter(([otherId, r]) => otherId !== id && r.keyHash === keyHash).reduce((sum, [, r]) => sum + r.quote.amountCny, 0);
      if (balance - held < quote.amountCny) throw new Error(`余额不足以完成本节 ${input.durationSeconds} 秒课程：保守预算 ¥${quote.amountCny.toFixed(2)}（含余量），可用余额 ¥${Math.max(0, balance - held).toFixed(2)}。${input.phase === "lesson" ? "脚本已保存，未提交视频生成；请核对钱包状态。" : "未提交付费请求。"}`);
      this.reservations.set(id, { keyHash, quote, pending: 0, closed: false, uncertain: false });
      return quote;
    } catch (error) {
      if (error instanceof Error && /未提交付费请求|未提交视频生成/.test(error.message)) throw error;
      throw new Error("余额或价格预检不可用，未提交付费请求。请刷新钱包后重试。");
    } finally { unlock(); }
  }
  begin(id: string): void { const entry = this.reservations.get(id); if (entry) entry.pending++; }
  finish(id: string): void { const entry = this.reservations.get(id); if (entry) { entry.pending--; this.releaseIfClosed(id, entry); } }
  close(id: string): void { const entry = this.reservations.get(id); if (entry) { entry.closed = true; this.releaseIfClosed(id, entry); } }
  complete(id: string): void { this.reservations.delete(id); }
  uncertain(id: string): void { const entry = this.reservations.get(id); if (entry) entry.uncertain = true; }
  restore(id: string, keyHash: string, quote: Quote): void {
    if (!/^[a-f0-9]{64}$/.test(keyHash) || !Number.isFinite(quote.amountCny) || quote.amountCny <= 0) return;
    if (!this.reservations.has(id)) this.reservations.set(id, { keyHash, quote, pending: 0, closed: false, uncertain: true });
  }
  private releaseIfClosed(id: string, entry: Reservation) { if (entry.closed && entry.pending === 0 && !entry.uncertain) this.reservations.delete(id); }
}
export const youthBudget = new YouthBudgetGuard();
