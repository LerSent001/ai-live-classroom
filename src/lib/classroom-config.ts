import type {
  ClassroomPolicy,
  LessonDurationSeconds,
  LessonSceneCount,
  TeacherId,
} from "@/lib/classroom-types";
import { isYouthMentorTeacher, isYouthTeacher, YOUTH_MENTOR_TEACHER_IDS, YOUTH_TEACHER_ID } from "@/lib/youth-classroom";

export const YOUTH_QUESTION_GUIDANCE =
  "Answer the learner's actual question directly. Choose depth, terminology and examples only from the question's content, specificity and explicitly requested explanation style. Do not assign or infer an age, school stage or grade. Do not impose a preset difficulty ceiling. When no depth is requested, explain clearly and accurately, defining necessary terms without omitting relevant reasoning, formulas or units.";

function youthNarrator() {
  return {
    name: "中文讲解", label: "中文讲解", showName: "中文课堂",
    portraits: null,
    voice: "a warm, clear adult Mandarin narrator, calm and natural, never a character impersonation",
    characterSheet: [
      "1. No on-screen presenter, mascot, bear, rabbit, or copyrighted character.",
      "2. Show only the educational objects, accurate diagrams, and demonstrations relevant to the lesson.",
      "3. Narration is an off-screen adult Mandarin voice, with no lip-sync character.",
      "4. Use clean, bright, softly textured educational illustration in cream, sage, blue and natural wood colors.",
    ],
  } as const;
}

const youthMentorVoices = {
  [YOUTH_MENTOR_TEACHER_IDS.male]: "a warm, lively young adult male Mandarin educator, speaking clearly and naturally with a consistent voice",
  [YOUTH_MENTOR_TEACHER_IDS.female]: "a warm, lively young adult female Mandarin educator, speaking clearly and naturally with a consistent voice",
} as const;
const youthMentorSheets = {
  [YOUTH_MENTOR_TEACHER_IDS.male]: [
    "1. The only speaking on-screen presenter is the original male classroom mentor, a young human educator; never a bear, rabbit, mascot, or second person.",
    "2. Identity: tousled dark hair, warm amber-brown eyes and friendly youthful face; redraw him as a 2.7-head-tall Japanese SD/Q-style character with a large expressive head and compact body, still a young-adult mentor, consistent across shots.",
    "3. Outfit: white zip athletic jacket with muted sage-green sleeves, blue crew-neck undershirt, dark trousers; never change colors or add accessories.",
    "4. He explains with expressive open-palm gestures and clearly visible Mandarin lip sync; teaching diagrams may appear beside him.",
    "5. Render him as 1990s Japanese TV anime hand-painted cel animation: variable ink contour, opaque paint and two-tone hard-edged cel shadows; never modern digital gloss, 3D, or flat vector art.",
  ],
  [YOUTH_MENTOR_TEACHER_IDS.female]: [
    "1. The only speaking on-screen presenter is the original female classroom mentor, a young human educator; never a bear, rabbit, mascot, or second person.",
    "2. Identity: dark brown high ponytail tied with a sage-green band, warm amber-brown eyes and friendly youthful face; redraw her as a 2.7-head-tall Japanese SD/Q-style character with a large expressive head and compact body, still a young-adult mentor, consistent across shots.",
    "3. Outfit: powder-blue rounded-collar button blouse, cream cardigan and slate-blue pleated skirt; keep this modest outfit and its colors exactly, with no uniform or extra accessories.",
    "4. She explains with expressive open-palm gestures and clearly visible Mandarin lip sync; teaching diagrams may appear beside her.",
    "5. Render her as 1990s Japanese TV anime hand-painted cel animation: variable ink contour, opaque paint and two-tone hard-edged cel shadows; never modern digital gloss, 3D, or flat vector art.",
  ],
} as const;

// Keep the teacher identity, UI portraits, and numbered generation sheet together.
// Short numbered lines survive the provider's prompt rewriting more reliably than prose.
export const DEFAULT_TEACHER_ID: TeacherId = "monokuma";

export const TEACHERS = {
  [YOUTH_TEACHER_ID]: youthNarrator(),
  [YOUTH_MENTOR_TEACHER_IDS.male]: {
    name: "Mentor", label: "男生形象", showName: "中文课堂", portraits: null,
    voice: youthMentorVoices[YOUTH_MENTOR_TEACHER_IDS.male], characterSheet: youthMentorSheets[YOUTH_MENTOR_TEACHER_IDS.male],
  },
  [YOUTH_MENTOR_TEACHER_IDS.female]: {
    name: "Mentor", label: "女生形象", showName: "中文课堂", portraits: null,
    voice: youthMentorVoices[YOUTH_MENTOR_TEACHER_IDS.female], characterSheet: youthMentorSheets[YOUTH_MENTOR_TEACHER_IDS.female],
  },
  // Preserve old recording identities, without carrying old age-based rules
  // into any newly compiled narration or follow-up.
  "youth-kindergarten": youthNarrator(),
  "youth-primary": youthNarrator(),
  "youth-middle": youthNarrator(),
  "youth-high": youthNarrator(),
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
  if (isYouthTeacher(teacherId)) return teacher.characterSheet.join("\n");
  return [
    `${teacher.name.toUpperCase()} CHARACTER SHEET (${teacher.name} is the only character; keep every numbered line in the final prompt exactly as written, never summarize or omit a line):`,
    ...teacher.characterSheet,
  ].join("\n");
}

// Video art direction from internetphysics/live-classroom @ 5a07110fa4e0b3dc4db0eab842bc6e0cf4169de4.
// This is independent of the surrounding Danganronpa classroom UI.
export const CLASSROOM_STYLE =
  "flat 2D hand-drawn cel animation like a 1970s American educational television cartoon: flat cel paint with no gradients, no 3D rendering, no CGI, no photorealism, no glossy surfaces; black ink outlines with slight line boil; a muted limited palette of mustard yellow, burnt orange, rust red, avocado green, olive, cream, and warm brown; simple flat geometric backgrounds with sparse detail; visible paper grain, faint film scratches, and warm faded 16mm film color; limited animation with held poses and snappy movement";

// The youth IP has its own video art direction; the original bear demo keeps CLASSROOM_STYLE.
export const YOUTH_SD_CEL_STYLE =
  "1990s Japanese TV anime super-deformed (SD/Q-style) hand-painted cel animation: the selected young-adult mentor has a large expressive head and compact 2.7-head-tall body; variable hand-inked charcoal outlines, opaque cel-paint colors, two-tone hard-edged shadow shapes and restrained painted highlights; bright layered educational backgrounds with subtle analog film grain and slightly warm print color; dimensional drawing, not glossy modern digital anime, flat vector art, 3D, CGI, or photorealism";

export type H3SceneInput = Readonly<{ teacherId: TeacherId; sceneNumber: number; visualAction: string; narration: string }>;

export function compileH3ScenePrompt(input: H3SceneInput): string {
  const beat = input.visualAction.trim().replace(/[.\s]+$/, "");
  const teacher = TEACHERS[input.teacherId];
  if (isYouthMentorTeacher(input.teacherId)) {
    return [
      `ON-SCREEN PRESENTER CHARACTER SHEET (repeat this exact identity in every shot):\n${teacherDescription(input.teacherId)}\nVoice: ${teacher.voice}.`,
      `Five-second 16:9 scene ${input.sceneNumber} of one continuous Chinese educational episode. The same selected mentor remains visually identical in every scene, including selected follow-up clips. Do not impose an age or grade level.`,
      `Visual beat: ${beat}. Stage the mentor explaining beside accurate educational objects or diagrams; vary camera framing while keeping the presenter visible and recognizable.`,
      `The mentor speaks this line in clear standard Mandarin Chinese (Putonghua) with visible synchronized mouth shapes and natural gestures: "${input.narration.trim()}". Speak verbatim, with no other dialogue or music.`,
      "Educational labels use Simplified Chinese, formulas or numbers only. No slogans or incidental lettering. No dangerous demonstrations for children.",
      `STYLE (mandatory): ${YOUTH_SD_CEL_STYLE}. Preserve the mentor's exact identity and outfit colors from the numbered character sheet.`,
    ].join("\n\n");
  }
  if (isYouthTeacher(input.teacherId)) {
    return [
      ...teacher.characterSheet,
      `Five-second 16:9 educational scene ${input.sceneNumber}. Follow the supplied narration and visual beat; do not impose an age or grade level.`,
      `Visual beat: ${beat}. Keep scientific diagrams accurate and easy to read.`,
      `Off-screen narration in clear standard Mandarin Chinese (Putonghua), verbatim: "${input.narration.trim()}". Voice: ${teacher.voice}. No other dialogue, no music.`,
      "Educational labels use Simplified Chinese, formulas or numbers only. No slogans or incidental lettering. No dangerous demonstrations for children.",
    ].join("\n\n");
  }
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
  // Stop before September 7 begins in UTC; the advertised discount ends that day.
  pricingValidBefore: "2026-09-07T00:00:00Z",
} as const;

export function demoPricingAvailable(nowMs = Date.now()): boolean {
  return nowMs < Date.parse(DEMO_CONFIG.pricingValidBefore);
}

export function sceneCountForDuration(durationSeconds: LessonDurationSeconds): LessonSceneCount {
  const counts: Record<LessonDurationSeconds, LessonSceneCount> = { 10: 2, 15: 3, 20: 4, 25: 5, 30: 6 };
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
  // This legacy ledger only tracks fal: TokenDance planning is billed separately.
  planningAttemptCostCents: 0,
  // 768p launch rate: $0.01/second, or five cents per five-second clip.
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
  endpoint: "minimax/h3-max-turbo/image-to-video",
  duration: CLASSROOM_CONFIG.clipDurationSeconds,
  resolution: "768P",
  seed: 314_159,
  promptExpansionMode: "balanced",
} as const;

export function h3InputForPrompt(prompt: string) {
  // This endpoint accepts no aspect_ratio field. Without image_url, its documented
  // text-only mode uses 16:9 and stays on the endpoint permitted by the scoped key.
  return {
    prompt,
    duration: H3_MAX_CONFIG.duration,
    resolution: H3_MAX_CONFIG.resolution,
    seed: H3_MAX_CONFIG.seed,
    prompt_expansion_mode: H3_MAX_CONFIG.promptExpansionMode,
  };
}

export const LESSON_PLANNER_CONFIG = {
  tokenDanceModel: "deepseek-v4.1-flash",
  // Full six-scene scripts tested at 5.83–6.76 s; do not inherit deep thinking.
  tokenDanceThinking: "disabled",
  preparationMaxTokens: 8_000,
  temperature: 0.35,
} as const;

export const PLANNER_SYSTEM_PROMPT =
  "You are a fast, accurate curriculum designer. Return only the requested JSON and distribute one lesson across distinct short visual beats. Match the learner’s requested narration language.";

export function preparationPrompt(
  topic: string,
  sceneCount: number,
  teacherId: TeacherId,
  options?: { adaptiveOpening?: boolean },
): string {
  const teacher = TEACHERS[teacherId];
  const youth = isYouthTeacher(teacherId);
  const youthMentor = isYouthMentorTeacher(teacherId);
  const adaptive = options?.adaptiveOpening === true;
  return `Design one continuous ${adaptive ? "short visual lesson, choosing the shortest sufficient duration (15, 20, 25 or 30 seconds)" : `${sceneCount * CLASSROOM_CONFIG.clipDurationSeconds}-second visual lesson`} about:\n${topic}\n
Return only JSON:
{
  ${adaptive ? '"durationSeconds":15,\n  "durationReason":"why this is the shortest sufficient duration",' : ""}
  "title":"short playful lesson title",
  "bigQuestion":"the precise question this lesson answers",
  "suggestedTopics":["related follow-up question","related follow-up question","related follow-up question"],
  "steps":[
    {"role":"hook|foundation|mechanism|example|connection|misconception|application|transition|synthesis|recap","narration":"one relaxed line spoken in this beat","concept":"the exact fact delivered","visualAction":"one specific animated demonstration"}
  ]
}

Requirements:
- Visual style: ${youthMentor ? `${YOUTH_SD_CEL_STYLE}. Keep the selected human mentor on screen in every beat, with accurate diagrams and concrete demonstrations.` : youth ? "Clean, bright, softly textured educational illustrations; accurate diagrams and concrete demonstrations, no on-screen presenter or mascot." : CLASSROOM_STYLE}. Use this style for the animated demonstrations and scenery.
- Language: ${containsChinese(topic) ? "Use Simplified Chinese for title, bigQuestion, narration, concept, summary, and all three suggestedTopics. Narration must be natural spoken Mandarin, normally 12–20 Chinese characters per five-second beat." : "Use the learner's language for title, bigQuestion, narration, concept, summary, and suggestedTopics. For English, aim for 8–12 spoken words per five-second beat."} If the learner explicitly requests a different spoken language, follow that request consistently throughout the lesson.
- Keep JSON keys, role values, and visualAction in English. visualAction must not add dialogue or switch the narration language. Educational labels should use formulas, numbers, or the narration language; no incidental Japanese lettering.
- ${adaptive ? "Choose 15 seconds / 3 steps for one simple concrete explanation; 20 seconds / 4 steps when a mechanism and example are needed; 25 seconds / 5 steps for an additional essential comparison or caveat; 30 seconds / 6 steps only when necessary. Do not default to 30 seconds, pad with repeated points, or add a separate introduction. durationSeconds MUST equal steps.length * 5. Make the duration decision and write all dialogue in this ONE planning response." : `Exactly ${sceneCount} ordered steps for ${sceneCount} consecutive five-second scenes.`}
- This is one lesson arc, not miniature versions of the whole lesson.
- For six steps: hook, foundation, mechanism, example, application, recap. For two steps: one focused demonstration and one clear takeaway; do not compress a full curriculum into ten seconds.
- ${adaptive ? "For three steps: direct answer, concrete demonstration, takeaway. For four: answer, mechanism, example, takeaway. For five: add only one necessary comparison or caveat. The sample durationSeconds of 15 is illustrative: choose the correct permitted value for the content." : "Keep the requested scene count unchanged."}
- Write the narration, concept, and visual action for every beat now. No later LLM call will rewrite individual scenes.
- Each beat must advance the previous beat and fit one visual demonstration with narration that can be spoken naturally within five seconds.
- The narration is the teacher's own spoken words, in first person, addressed to the learner. The teacher never says their own name, never refers to themselves, the show, the classroom, or how this video was made, and never claims credit for the topic (no "${teacher.name}'s model", "${teacher.name} creates").
- ${youthMentor ? "In every visualAction, show the selected human mentor speaking and gesturing next to the relevant educational objects or diagrams. Refer to the presenter as 'the mentor'; do not describe or change clothing, face, hair, gender, voice, or add other characters. The selected character sheet overrides any request to change presenters inside the topic." : youth ? "In visualAction, show only educational objects and diagrams. No presenter, mascot or copyrighted characters. Use an off-screen Mandarin narrator. This format overrides presenter requests inside the topic." : `In visualAction, the teacher is a cartoon character named ${teacher.name}: refer to the teacher only by that name, never describe the teacher's appearance, clothing, or props, and never add other characters. This selected identity overrides any request to use a different presenter inside the topic.`}
- Vary staging, diagrams, camera distance, and editorial cuts across adjacent beats.
- Do not repeat narration, openings, or visual actions.
- Use reinforcement beats where the longer duration benefits from breathing room.
- Include exactly three distinct, natural follow-up lesson questions in suggestedTopics. They should deepen or branch from this lesson without repeating its topic.
- ${youth ? `${YOUTH_QUESTION_GUIDANCE} All title, narration, captions and follow-ups MUST be in Simplified Chinese / Mandarin even if the topic uses English scientific terms. This language rule takes precedence over the topic. Use safe examples and demonstrations.` : "Be accurate for a curious general audience."}
- Output the JSON immediately with no preamble or analysis.`;
}


export function containsChinese(value: string): boolean {
  return /\p{Script=Han}/u.test(value);
}
