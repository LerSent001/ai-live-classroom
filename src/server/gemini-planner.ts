import { isRecord } from "@/lib/classroom-boundaries";
import { LESSON_PLANNER_CONFIG } from "@/lib/classroom-config";

export type PlannerRecorder = (kind: string, data: Record<string, unknown>) => void;

// Keep the provider boundary injectable so contract checks never spend credits.
export async function requestGeminiPlan(
  input: Readonly<{ apiKey: string; prompt: string; systemPrompt: string; record?: PlannerRecorder }>,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!input.apiKey.trim()) throw new Error("GEMINI_API_KEY is missing.");
  const model = LESSON_PLANNER_CONFIG.geminiModel;
  const body = {
    systemInstruction: { parts: [{ text: input.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: input.prompt }] }],
    generationConfig: {
      temperature: LESSON_PLANNER_CONFIG.temperature,
      maxOutputTokens: LESSON_PLANNER_CONFIG.preparationMaxTokens,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingLevel: "minimal" },
    },
  };
  input.record?.("planner-request", { model, body });
  const response = await request(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": input.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (!response.ok) throw new Error(`Gemini planning failed with status ${response.status}.`);
  const payload: unknown = await response.json();
  // Keep public output and token counts; never persist auth or thinking parts.
  if (isRecord(payload)) {
    const usage: Record<string, number> = {};
    if (isRecord(payload.usageMetadata)) {
      for (const field of ["promptTokenCount", "candidatesTokenCount", "totalTokenCount", "thoughtsTokenCount", "cachedContentTokenCount"]) {
        const count = payload.usageMetadata[field];
        if (typeof count === "number" && Number.isFinite(count)) usage[field] = count;
      }
    }
    const outputs = Array.isArray(payload.candidates) ? payload.candidates.flatMap((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return [];
      return candidate.content.parts.flatMap((part) =>
        isRecord(part) && part.thought !== true && typeof part.text === "string" ? [part.text] : [],
      );
    }) : [];
    input.record?.("planner-response", {
      modelVersion: typeof payload.modelVersion === "string" ? payload.modelVersion : null,
      output: outputs.join(""), usage, actualBilledCost: null,
    });
  }
  const candidate = isRecord(payload) && Array.isArray(payload.candidates) ? payload.candidates[0] : null;
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    throw new Error("Gemini returned an invalid planner response.");
  }
  const text = candidate.content.parts
    .filter((part) => isRecord(part) && part.thought !== true && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no lesson text.");
  return text;
}
