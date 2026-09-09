import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { toClassroomSessionId, toLessonStepId, toSceneId } from "@/lib/classroom-boundaries";
import type { CourseDocument, CoursePage, CourseSection } from "@/lib/classroom-types";
import { buildCoursePdf, buildCoursePptx } from "@/server/course-export";

function fixture(): CourseDocument {
  const sessionId = toClassroomSessionId("export-main");
  const sectionId = `course-section:${sessionId}`;
  const page: CoursePage = {
    id: `course-page:${sessionId}:step-1`,
    sectionId,
    stepId: toLessonStepId("step-1"),
    position: 1,
    role: "hook",
    title: "月相为什么会变化？",
    teachingGoal: "理解太阳、地球与月球的相对位置。",
    narration: "月球本身不发光，我们看到的是被太阳照亮的部分。",
    concept: "月相来自可见受光面的变化。",
    summary: "观察者看到的受光面比例会随运行位置变化。",
    visualAction: "老师用灯和球演示受光面。",
    startSeconds: 0,
    endSeconds: 5,
    media: { sceneId: toSceneId("scene-1"), status: "ready", videoUrl: "/api/saved-video/export-main/1" },
  };
  const main: CourseSection = {
    id: sectionId,
    sessionId,
    kind: "main",
    topic: "月相",
    title: "月相的成因",
    bigQuestion: "月亮为什么看起来会变化？",
    durationSeconds: 5,
    pages: [page],
  };
  return {
    id: "course-document:export-main",
    title: main.title,
    subject: main.topic,
    teacherId: "monokuma",
    main,
    appendices: [],
    activeSectionId: sectionId,
    exportReady: true,
  };
}

test("course exports embed existing video in PPTX and create real PDF bytes without requesting media", async (t) => {
  const document = fixture();
  const directory = mkdtempSync(join(tmpdir(), "course-export-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const videoPath = join(directory, "existing.mp4");
  const videoBytes = Buffer.from("existing-generated-video");
  writeFileSync(videoPath, videoBytes);
  const [pptx, pdf] = await Promise.all([
    buildCoursePptx(document, new Map([[document.main!.pages[0]!.id, videoPath]])),
    buildCoursePdf(document, () => "https://example.com/existing-scene.mp4"),
  ]);
  assert.equal(pptx.subarray(0, 2).toString("ascii"), "PK");
  assert.ok(pptx.length > 10_000);
  const archive = await JSZip.loadAsync(pptx);
  const embeddedVideoPath = Object.keys(archive.files).find((path) => /^ppt\/media\/.*\.mp4$/.test(path));
  assert.ok(embeddedVideoPath);
  const embeddedVideo = archive.file(embeddedVideoPath);
  assert.ok(embeddedVideo);
  assert.deepEqual(Buffer.from(await embeddedVideo.async("uint8array")), videoBytes);
  assert.equal(archive.file("ppt/slideMasters/slideMaster2.xml"), null);
  assert.doesNotMatch(
    await archive.file("[Content_Types].xml")!.async("string"),
    /slideMaster2\.xml/,
  );
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 10_000);
});
