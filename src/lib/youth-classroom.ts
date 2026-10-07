/** New questions use one neutral identity, separate from the Demo and old
 * age-scoped recordings. Legacy IDs remain readable but are not new choices. */
export const YOUTH_SESSION_KEY = "zh-youth-classroom-session-v1";
export const YOUTH_TEACHER_ID = "youth-question";
export const YOUTH_MENTOR_TEACHER_IDS = { male: "youth-mentor-male", female: "youth-mentor-female" } as const;
export const LEGACY_YOUTH_TEACHER_IDS = ["youth-kindergarten", "youth-primary", "youth-middle", "youth-high"] as const;

export type YouthMentorTeacherId = (typeof YOUTH_MENTOR_TEACHER_IDS)[keyof typeof YOUTH_MENTOR_TEACHER_IDS];
export type YouthTeacherId = typeof YOUTH_TEACHER_ID | YouthMentorTeacherId | (typeof LEGACY_YOUTH_TEACHER_IDS)[number];
export function isYouthMentorTeacher(value: unknown): value is YouthMentorTeacherId {
  return value === YOUTH_MENTOR_TEACHER_IDS.male || value === YOUTH_MENTOR_TEACHER_IDS.female;
}
export function isYouthTeacher(value: unknown): value is YouthTeacherId {
  return value === YOUTH_TEACHER_ID || isYouthMentorTeacher(value) || LEGACY_YOUTH_TEACHER_IDS.some((id) => id === value);
}
export function youthNotice(message: string | null | undefined): string | null {
  if (!message) return null;
  if (/demo discount has ended|review the video price/i.test(message)) return "原 Demo 的视频优惠期已结束。为避免产生未确认的费用，生成仍受价格保护限制；确认新价格后才能启用。";
  if (/FAL_KEY|TOKENDANCE_API_KEY|missing.*key|Course generation is not configured/i.test(message)) return "课程生成服务尚未配置，请连接 TokenDance 钱包后再开始。";
  return message.replace(/^The lesson could not be prepared:\s*/i, "课程暂未完成：")
    .replace(/^Video generation stopped:\s*/i, "视频暂未完成：");
}
export const YOUTH_RENDERING = {
  maxDpr: 1.25, cameraSeconds: 1.45, entranceSeconds: 1.65, entranceRevealSeconds: .32,
  deskColumns: [-2.25, 2.25], deskRows: [-0.6, 1.5, 3.6],
  screen: { center: [-2.45, 3.9, -2.4] as const, width: 2.07, height: 1.5525, frameWidth: 2.22, frameHeight: 1.7 },
} as const;
