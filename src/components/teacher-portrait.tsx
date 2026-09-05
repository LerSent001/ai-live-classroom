import Image from "next/image";
import { TEACHERS } from "@/lib/classroom-config";
import type { TeacherId } from "@/lib/classroom-types";

export function TeacherPortrait({
  className,
  expression,
  teacherId,
}: Readonly<{ className: string; expression: "standing" | "laugh"; teacherId: TeacherId }>) {
  const portrait = TEACHERS[teacherId].portraits[expression];
  return (
    <Image
      alt=""
      aria-hidden="true"
      className={`teacher-portrait ${className}`}
      data-teacher-id={teacherId}
      src={portrait.src}
      unoptimized
      width={portrait.width}
      height={portrait.height}
    />
  );
}
