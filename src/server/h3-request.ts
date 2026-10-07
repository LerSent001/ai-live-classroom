import { ApiError } from "@fal-ai/client";
import { H3_MAX_CONFIG, h3InputForPrompt } from "@/lib/classroom-config";
import { isRecord } from "@/lib/classroom-boundaries";

// SDK queue.submit retries POST up to three times even when client retry is zero.
// Submit once ourselves; status/result reads may safely retry the same request ID.
export async function submitH3Clip(
  input: Readonly<{ apiKey: string; prompt: string }>,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!input.apiKey.trim()) throw new Error("FAL_KEY is missing.");
  const response = await request(`https://queue.fal.run/${H3_MAX_CONFIG.endpoint}`, {
    method: "POST",
    headers: { authorization: `Key ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(h3InputForPrompt(input.prompt)),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body: unknown = response.headers.get("content-type")?.includes("application/json")
      ? await response.json()
      : undefined;
    throw new ApiError({ status: response.status, message: `H3 submission failed (${response.status}).`, body });
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.request_id !== "string" || !/^[a-zA-Z0-9_-]{1,180}$/.test(payload.request_id)) {
    throw new Error("fal returned no valid request ID. Submission was not retried.");
  }
  return payload.request_id;
}
