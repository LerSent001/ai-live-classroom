import Image from "next/image";

// Portraits and video character sheets share the same male/female selection.
export const YOUTH_MENTORS = {
  male: { label: "男生形象", asset: "mentor-halfbody-v1.png", version: "mentor-v1" },
  female: { label: "女生形象", asset: "mentor-female-halfbody-v2.png", version: "mentor-female-v2" },
} as const;
export type YouthMentorId = keyof typeof YOUTH_MENTORS;

export function nextYouthMentor(mentor: YouthMentorId): YouthMentorId {
  return mentor === "male" ? "female" : "male";
}

// A passive DOM image, not part of the WebGL scene or generated lesson content.
// Next serves a cached, size-appropriate image while retaining the original PNG alpha.
export function YouthMentorPortrait({ mentor = "male" }: { mentor?: YouthMentorId }) {
  const character = YOUTH_MENTORS[mentor];
  return <div className="youth-mentor-portrait" aria-hidden="true" data-youth-portrait={character.version}>
    <Image src={`/youth/characters/${character.asset}`} alt="" width={1024} height={1536}
      sizes="(max-width: 700px) 140px, (max-height: 650px) 150px, 240px"
      draggable={false} loading="eager" />
  </div>;
}
