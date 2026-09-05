import { LESSON_PLANNER_CONFIG } from "@/lib/classroom-config";
export type PlannerRecorder = (kind: string, data: Record<string, unknown>) => void;
export async function requestTokenPayPlan(
  input: Readonly<{ apiKey: string; prompt: string; systemPrompt: string; record?: PlannerRecorder }>,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!input.apiKey.trim()) throw new Error("请先连接 TokenPay 钱包。");
  const body = { model: "deepseek-v3.2", messages: [{ role: "system", content: input.systemPrompt }, { role: "user", content: input.prompt }], temperature: LESSON_PLANNER_CONFIG.temperature, max_tokens: LESSON_PLANNER_CONFIG.preparationMaxTokens, response_format: { type: "json_object" } };
  input.record?.("planner-request", { model: body.model, body });
  const response = await request("https://tokendance.space/gateway/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}`, "X-App-URL": "https://github.com/LerSent001/ai-live-classroom" },
    body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`TokenPay 课程规划失败（${response.status}），请检查钱包余额与 Key 额度。`);
  const data = await response.json();
  const output = data?.choices?.[0]?.message?.content;
  if (typeof output !== "string" || !output.trim()) throw new Error("TokenPay 未返回有效课程。请手动重试。");
  const usage: Record<string, number> = {};
  for (const field of ["prompt_tokens", "completion_tokens", "total_tokens"]) {
    const count = data?.usage?.[field];
    if (typeof count === "number" && Number.isFinite(count)) usage[field] = count;
  }
  input.record?.("planner-response", { model: body.model, output, usage, actualBilledCost: null });
  return output.trim();
}
