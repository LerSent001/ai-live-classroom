import { readFileSync } from "node:fs";
import { fal } from "@fal-ai/client";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const falKey = env.match(/^FAL_KEY=(.+)$/m)?.[1]?.trim();
if (!falKey) throw new Error("FAL_KEY missing from .env.local");
fal.config({ credentials: falKey });

const TOPIC = "Why does ice float on water?";
const SCENE_COUNT = 12;

const prompt = `Design one continuous ${SCENE_COUNT * 5}-second visual lesson about:\n${TOPIC}\n
Return only JSON:
{
  "title":"short playful lesson title",
  "bigQuestion":"the precise question this lesson answers",
  "suggestedTopics":["related follow-up question","related follow-up question","related follow-up question"],
  "steps":[
    {"role":"hook|foundation|mechanism|example|connection|misconception|application|transition|synthesis|recap","narration":"one relaxed line spoken in this beat","concept":"the exact fact delivered","visualAction":"one specific animated demonstration"}
  ]
}

Requirements:
- Exactly ${SCENE_COUNT} ordered steps for ${SCENE_COUNT} consecutive five-second scenes.
- This is one lesson arc, not ${SCENE_COUNT} miniature versions of the whole lesson.
- Start with a hook, build foundations and mechanisms, use examples and applications, correct a misconception, synthesize, and end with a recap.
- Write the narration, concept, and visual action for every beat now. No later LLM call will rewrite individual scenes.
- Each beat must advance the previous beat and fit one visual demonstration with narration that can be spoken naturally within five seconds.
- Vary staging, diagrams, camera distance, and editorial cuts across adjacent beats.
- Do not repeat narration, openings, or visual actions.
- Use reinforcement beats where the longer duration benefits from breathing room.
- Include exactly three distinct, natural follow-up lesson questions in suggestedTopics. They should deepen or branch from this lesson without repeating its topic.
- Be accurate for a curious general audience.
- Output the JSON immediately with no preamble or analysis.`;

const MODELS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "google/gemini-2.5-flash-lite",
      "google/gemini-3.5-flash-lite",
      "google/gemini-3.7-flash",
      "deepseek/deepseek-v4-flash-0731",
      "qwen/qwen3.8-flash",
      "z-ai/glm-5.3-flash",
      "nvidia/nemotron-3.5-lightning",
    ];

const SYSTEM_PROMPT =
  "You are a fast, accurate curriculum designer. Return only the requested JSON and distribute one lesson across distinct short visual beats.";
const geminiKey = env.match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();

async function runDirectGemini(model) {
  const attempt = async (withThinking) => {
    const generationConfig = { temperature: 0.35, maxOutputTokens: 8000 };
    if (withThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig,
        }),
      },
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 200);
      const error = new Error(`status ${response.status}: ${detail}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    return payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  };
  try {
    return await attempt(true);
  } catch (error) {
    if (error.status !== 400) throw error;
    console.log(`   (${model}: thinkingBudget rejected, retrying with thinking default)`);
    return attempt(false);
  }
}

for (const model of MODELS) {
  const startedAt = Date.now();
  try {
    let output;
    if (model.startsWith("direct/")) {
      output = await runDirectGemini(model.slice(7));
    } else {
      const result = await fal.subscribe("openrouter/router", {
        input: {
          model,
          prompt,
          system_prompt: SYSTEM_PROMPT,
          temperature: 0.35,
          max_tokens: 8000,
        },
      });
      output = result?.data?.output ?? "";
    }
    const elapsedMs = Date.now() - startedAt;
    let steps = "parse-failed";
    let sample = "";
    try {
      const cleaned = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      const parsed = JSON.parse(cleaned);
      steps = Array.isArray(parsed.steps) ? parsed.steps.length : "no-steps";
      sample = parsed.steps?.[0]?.narration?.slice(0, 90) ?? "";
    } catch {}
    console.log(`${model}: ${elapsedMs}ms | steps=${steps} | chars=${output.length}`);
    if (sample) console.log(`   beat1: ${sample}`);
  } catch (error) {
    console.log(`${model}: FAILED after ${Date.now() - startedAt}ms — ${error?.message ?? error}`);
  }
}
