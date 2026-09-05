import type {
  ClassroomPolicy,
  LessonDurationSeconds,
  LessonSceneCount,
  TeacherId,
} from "@/lib/classroom-types";

// Keep the teacher identity, UI portraits, and numbered generation sheet together.
// Short numbered lines survive the provider's prompt rewriting more reliably than prose.
export const DEFAULT_TEACHER_ID: TeacherId = "monokuma";

export const TEACHERS = {
  monokuma: {
    name: "Monokuma",
    label: "黑白熊",
    showName: "Monokuma TV",
    portraits: {
      standing: { src: "/characters/monokuma/standing.webp", width: 394, height: 532 },
      laugh: { src: "/characters/monokuma/laugh.webp", width: 311, height: 520 },
    },
    voice:
      "a playful, slightly raspy, medium-high cartoon voice with an expressive rhythmic delivery",
    characterSheet: [
      "1. Character: Monokuma, a short round bear with a large head, plump belly, stubby arms, short legs, and round ears.",
      "2. Color: a clean vertical split through the whole body; his right side is white and his left side is black.",
      "3. Front view: the white half is on the viewer's left and the black half is on the viewer's right; never swap the halves.",
      "4. White half: a round black eye, white round ear, and a pale pink cheek.",
      "5. Black half: a sharp jagged red eye, black round ear, and an exaggerated toothy grin.",
      "6. Face: a round white muzzle with a small black oval nose; his mouth moves in sync with every spoken word.",
      "7. Belly: a large white oval belly with a small black stitched navel.",
      "8. Paws: short rounded bear paws; gestures stay expressive and the body proportions stay compact.",
      "9. No clothing, hat, tie, hair, or extra accessories.",
      "10. Drawn as flat 2D cel art with black ink outlines and solid fills; never 3D, never glossy.",
    ],
  },
  monomi: {
    name: "Monomi",
    label: "莫奈美",
    showName: "Monomi TV",
    portraits: {
      standing: { src: "/characters/monomi/standing.png", width: 269, height: 462 },
      laugh: { src: "/characters/monomi/standing.png", width: 269, height: 462 },
    },
    voice: "a gentle, bright, high-pitched cartoon voice with a warm, encouraging delivery",
    characterSheet: [
      "1. Character: Monomi, a short round rabbit with a large head, plump belly, stubby arms and short legs.",
      "2. Color: a clean vertical split through her face and body; white on the viewer's left and pastel pink on the viewer's right; never swap the halves.",
      "3. Ears: two long rabbit ears with pink inner ears; the white ear stands upright, and the pink ear bends forward at its tip.",
      "4. Bow: a large pale peach-pink bow at the base of the upright white ear, on the viewer's left.",
      "5. Eyes: small rounded eyes with eyelashes; a black eye on the white half and a dark pink eye on the pink half, with round rosy cheeks.",
      "6. Face: a small pink nose, a pale rounded muzzle, a gentle rabbit mouth, and two small front teeth; her mouth moves in sync with every spoken word.",
      "7. Belly: a large pale oval belly with a small black stitched navel.",
      "8. Clothing: pale white diaper-style shorts with small pink dots and visible seams; no dress, skirt, wings, staff, hat, or extra accessories.",
      "9. Paws: soft rounded rabbit paws, small rounded feet, and compact proportions; no claws or weapons.",
      "10. Drawn as flat 2D cel art with black ink outlines and solid fills; never 3D, never glossy.",
    ],
  },
} as const satisfies Record<TeacherId, unknown>;

export function teacherDescription(teacherId: TeacherId): string {
  const teacher = TEACHERS[teacherId];
  return [
    `${teacher.name.toUpperCase()} CHARACTER SHEET (${teacher.name} is the only character; keep every numbered line in the final prompt exactly as written, never summarize or omit a line):`,
    ...teacher.characterSheet,
  ].join("\n");
}

// Video art direction from internetphysics/live-classroom @ 5a07110fa4e0b3dc4db0eab842bc6e0cf4169de4.
// This is independent of the surrounding Danganronpa classroom UI.
export const CLASSROOM_STYLE =
  "flat 2D hand-drawn cel animation like a 1970s American educational television cartoon: flat cel paint with no gradients, no 3D rendering, no CGI, no photorealism, no glossy surfaces; black ink outlines with slight line boil; a muted limited palette of mustard yellow, burnt orange, rust red, avocado green, olive, cream, and warm brown; simple flat geometric backgrounds with sparse detail; visible paper grain, faint film scratches, and warm faded 16mm film color; limited animation with held poses and snappy movement";

export type H3SceneInput = Readonly<{ teacherId: TeacherId; sceneNumber: number; visualAction: string; narration: string }>;

export function compileH3ScenePrompt(input: H3SceneInput): string {
  const beat = input.visualAction.trim().replace(/[.\s]+$/, "");
  const teacher = TEACHERS[input.teacherId];
  const name = teacher.name;
  const voice = `${teacher.voice}, speaking ${containsChinese(input.narration) ? "clear standard Mandarin Chinese (Putonghua)" : "the exact language of the supplied narration"}`;
  return [
    `${teacherDescription(input.teacherId)}\nVoice: ${voice}.`,
    `Five-second 16:9 scene ${input.sceneNumber} of one continuous 1970s educational cartoon episode. ${name} is drawn exactly the same in every scene.`,
    `Visual beat: ${beat}. Let the scene use natural editorial cuts, expressive staging, and camera movement when they help the explanation.`,
    `${name} speaks this line with visible lip sync, their mouth shapes matching each word and their eyes and gestures animating with the delivery: "${input.narration.trim()}" ${name}'s voice is identical in every scene of this episode: ${voice}. Speak the supplied line verbatim without translating it or adding dialogue. Use clear narration and playful diegetic sound effects only. No background music or musical score; the player supplies one continuous soundtrack across scenes.`,
    "Board and background text: formulas, numbers, and simple diagrams only; no incidental Japanese lettering.",
    `STYLE (mandatory): ${CLASSROOM_STYLE}. Never 3D, never CGI, never photorealistic, never modern digital vector art.`,
    "Apply the scenery palette to backgrounds and teaching props; preserve the teacher's exact colors from the numbered character sheet.",
  ].join("\n\n");
}


export const LESSON_DURATION_OPTIONS = [30, 10] as const satisfies readonly LessonDurationSeconds[];

export const DEMO_CONFIG = {
  initialDurationSeconds: 30,
  followupDurationSeconds: 10,
  maxFollowups: 2,
  // Conservative local review deadline retained during the gateway migration; not a provider quote.
  pricingValidBefore: "2026-09-07T00:00:00Z",
} as const;

export function demoPricingAvailable(nowMs = Date.now()): boolean {
  return nowMs < Date.parse(DEMO_CONFIG.pricingValidBefore);
}

export function sceneCountForDuration(durationSeconds: LessonDurationSeconds): LessonSceneCount {
  const counts: Record<LessonDurationSeconds, LessonSceneCount> = { 10: 2, 30: 6 };
  return counts[durationSeconds];
}

export const CLASSROOM_CONFIG = {
  clipDurationSeconds: 5,
  durationOptionsSeconds: LESSON_DURATION_OPTIONS,
  startupRunwayScenes: 2,
  startupProductionRunwayScenes: 4,
  steadyRunwayScenes: 4,
  recoveryRunwayScenes: 6,
  videoConcurrency: 2,
  maxLessonScenes: 6,
  maxQueuedLessons: 1,
  maxPlannerAttempts: 1,
  // Legacy local admission counters, not a TokenDance price or actual bill. Gemini is separate.
  planningAttemptCostCents: 0,
  // Retained scheduling weight; TokenDance prices have not been reconciled yet.
  videoAttemptCostCents: 5,
  localCeilingCents: 98,
  maxLogEntries: 160,
  pollIntervalMs: 600,
  startupPollIntervalMs: 300,
} as const satisfies ClassroomPolicy & {
  startupProductionRunwayScenes: number;
  maxLogEntries: number;
  pollIntervalMs: number;
  startupPollIntervalMs: number;
};

export const CLASSROOM_POLICY: ClassroomPolicy = {
  clipDurationSeconds: CLASSROOM_CONFIG.clipDurationSeconds,
  durationOptionsSeconds: LESSON_DURATION_OPTIONS,
  startupRunwayScenes: CLASSROOM_CONFIG.startupRunwayScenes,
  steadyRunwayScenes: CLASSROOM_CONFIG.steadyRunwayScenes,
  recoveryRunwayScenes: CLASSROOM_CONFIG.recoveryRunwayScenes,
  videoConcurrency: CLASSROOM_CONFIG.videoConcurrency,
  maxLessonScenes: CLASSROOM_CONFIG.maxLessonScenes,
  maxQueuedLessons: CLASSROOM_CONFIG.maxQueuedLessons,
  maxPlannerAttempts: CLASSROOM_CONFIG.maxPlannerAttempts,
  videoAttemptCostCents: CLASSROOM_CONFIG.videoAttemptCostCents,
  planningAttemptCostCents: CLASSROOM_CONFIG.planningAttemptCostCents,
  localCeilingCents: CLASSROOM_CONFIG.localCeilingCents,
};

export type LessonQuote = Readonly<{
  sceneCount: LessonSceneCount;
  expectedCents: number;
  protectedMaximumCents: number;
}>;

export function quoteForDuration(durationSeconds: LessonDurationSeconds): LessonQuote {
  const sceneCount = sceneCountForDuration(durationSeconds);
  return {
    sceneCount,
    expectedCents:
      CLASSROOM_CONFIG.planningAttemptCostCents +
      sceneCount * CLASSROOM_CONFIG.videoAttemptCostCents,
    protectedMaximumCents:
      CLASSROOM_CONFIG.maxPlannerAttempts * CLASSROOM_CONFIG.planningAttemptCostCents +
      sceneCount * CLASSROOM_CONFIG.videoAttemptCostCents,
  };
}

export const H3_MAX_CONFIG = {
  endpoint: "https://tokendance.space/gateway/minimax/v2/video_generation",
  model: "minimax-h3-max",
  duration: CLASSROOM_CONFIG.clipDurationSeconds,
  resolution: "768P",
  appUrl: "https://github.com/LerSent001/ai-live-classroom",
} as const;

export function h3InputForPrompt(prompt: string) {
  return {
    model: H3_MAX_CONFIG.model,
    duration: H3_MAX_CONFIG.duration,
    resolution: H3_MAX_CONFIG.resolution,
    ratio: "16:9",
    content: [{ type: "text", text: prompt }],
  };
}

export const LESSON_PLANNER_CONFIG = {
  geminiModel: "gemini-3.1-flash-lite",
  preparationMaxTokens: 8_000,
  temperature: 0.35,
} as const;

export const PLANNER_SYSTEM_PROMPT =
  "You are a fast, accurate curriculum designer. Return only the requested JSON and distribute one lesson across distinct short visual beats. Match the learner’s requested narration language.";

export function preparationPrompt(
  topic: string,
  sceneCount: number,
  teacherId: TeacherId,
): string {
  const teacher = TEACHERS[teacherId];
  return `Design one continuous ${sceneCount * CLASSROOM_CONFIG.clipDurationSeconds}-second visual lesson about:\n${topic}\n
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
- Visual style: ${CLASSROOM_STYLE}. Use this style for the animated demonstrations and scenery.
- Language: ${containsChinese(topic) ? "Use Simplified Chinese for title, bigQuestion, narration, concept, summary, and all three suggestedTopics. Narration must be natural spoken Mandarin, normally 12–20 Chinese characters per five-second beat." : "Use the learner's language for title, bigQuestion, narration, concept, summary, and suggestedTopics. For English, aim for 8–12 spoken words per five-second beat."} If the learner explicitly requests a different spoken language, follow that request consistently throughout the lesson.
- Keep JSON keys, role values, and visualAction in English. visualAction must not add dialogue or switch the narration language. Educational labels should use formulas, numbers, or the narration language; no incidental Japanese lettering.
- Exactly ${sceneCount} ordered steps for ${sceneCount} consecutive five-second scenes.
- This is one lesson arc, not ${sceneCount} miniature versions of the whole lesson.
- For six steps: hook, foundation, mechanism, example, application, recap. For two steps: one focused demonstration and one clear takeaway; do not compress a full curriculum into ten seconds.
- Write the narration, concept, and visual action for every beat now. No later LLM call will rewrite individual scenes.
- Each beat must advance the previous beat and fit one visual demonstration with narration that can be spoken naturally within five seconds.
- The narration is the teacher's own spoken words, in first person, addressed to the learner. The teacher never says their own name, never refers to themselves, the show, the classroom, or how this video was made, and never claims credit for the topic (no "${teacher.name}'s model", "${teacher.name} creates").
- In visualAction, the teacher is a cartoon character named ${teacher.name}: refer to the teacher only by that name, never describe the teacher's appearance, clothing, or props, and never add other characters. This selected identity overrides any request to use a different presenter inside the topic.
- Vary staging, diagrams, camera distance, and editorial cuts across adjacent beats.
- Do not repeat narration, openings, or visual actions.
- Use reinforcement beats where the longer duration benefits from breathing room.
- Include exactly three distinct, natural follow-up lesson questions in suggestedTopics. They should deepen or branch from this lesson without repeating its topic.
- Be accurate for a curious general audience.
- Output the JSON immediately with no preamble or analysis.`;
}


export function containsChinese(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}
