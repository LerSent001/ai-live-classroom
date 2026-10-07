import assert from "node:assert/strict";
import test from "node:test";
import { compileH3ScenePrompt, DEFAULT_TEACHER_ID, preparationPrompt, TEACHERS, YOUTH_QUESTION_GUIDANCE } from "./classroom-config";
import { parseClassroomCommand, parseTeacherId } from "./classroom-boundaries";
import { isYouthTeacher, LEGACY_YOUTH_TEACHER_IDS, YOUTH_MENTOR_TEACHER_IDS, YOUTH_RENDERING, YOUTH_SESSION_KEY, YOUTH_TEACHER_ID } from "./youth-classroom";
import { smoothCameraProgress, youthCameraPose } from "@/components/youth/camera";

test("new questions have a neutral identity; old recording identities remain readable", () => {
  assert.equal(DEFAULT_TEACHER_ID, "monokuma");
  assert.notEqual(YOUTH_SESSION_KEY, "tung-classroom-session-v1");
  assert.ok(!LEGACY_YOUTH_TEACHER_IDS.some((id: string) => id === YOUTH_TEACHER_ID), "new recordings cannot reuse age-scoped cache identities");
  for (const teacherId of [YOUTH_TEACHER_ID, ...LEGACY_YOUTH_TEACHER_IDS] as const) {
    assert.equal(parseTeacherId(teacherId), teacherId);
    assert.equal(isYouthTeacher(teacherId), true);
    assert.equal(TEACHERS[teacherId].portraits, null);
    assert.equal(TEACHERS[teacherId].label, "中文讲解");
    const command = parseClassroomCommand({ kind: "start", teacherId, id: `test-${teacherId}`, topic: "光线", durationSeconds: 30, atMs: 1 });
    assert.equal(command.kind, "start");
    if (command.kind === "start") assert.equal(command.teacherId, teacherId);
  }
  for (const value of ["__proto__", "youth", "monokuma", null]) assert.equal(isYouthTeacher(value), false);
});

test("question content determines depth without a default school stage", () => {
  for (const topic of ["Gravity", "为什么小球会落下？请用生活例子解释。", "请用微积分推导万有引力势能，保留公式和单位。"])
  for (const teacherId of [YOUTH_TEACHER_ID, ...LEGACY_YOUTH_TEACHER_IDS] as const) {
    const prompt = preparationPrompt(topic, 6, teacherId);
    assert.ok(prompt.includes(topic));
    assert.ok(prompt.includes(YOUTH_QUESTION_GUIDANCE));
    assert.match(prompt, /Do not assign or infer an age, school stage or grade/);
    assert.match(prompt, /Do not impose a preset difficulty ceiling/);
    assert.doesNotMatch(prompt, /kindergarten|primary school|middle school|high school|Audience:/i);
    assert.match(prompt, /MUST be in Simplified Chinese \/ Mandarin/);
    assert.doesNotMatch(prompt, /Monokuma|Monomi|named 中文讲解/);
    const video = compileH3ScenePrompt({ teacherId, sceneNumber: 1, narration: "小球松开后会向下落。", visualAction: "A ball drops beside a downward force arrow." });
    assert.match(video, /Off-screen narration in clear standard Mandarin Chinese/);
    assert.match(video, /Follow the supplied narration and visual beat; do not impose an age or grade level/);
    assert.doesNotMatch(video, /kindergarten|primary school|middle school|high school|Audience:/i);
    assert.match(video, /No on-screen presenter/);
    assert.doesNotMatch(video, /Monokuma|Monomi|visible lip sync/);
  }
});

test("new male and female mentor profiles carry the 1990s Japanese SD cel identity through planning and video", () => {
  for (const teacherId of Object.values(YOUTH_MENTOR_TEACHER_IDS)) {
    assert.equal(parseTeacherId(teacherId), teacherId);
    assert.equal(isYouthTeacher(teacherId), true);
    const plan = preparationPrompt("为什么会有彩虹？", 6, teacherId);
    assert.match(plan, /1990s Japanese TV anime super-deformed \(SD\/Q-style\) hand-painted cel animation/);
    assert.doesNotMatch(plan, /1970s American educational television cartoon/);
    assert.match(plan, /selected human mentor speaking and gesturing/);
    assert.doesNotMatch(plan, /off-screen Mandarin narrator|No presenter, mascot/);
    const video = compileH3ScenePrompt({ teacherId, sceneNumber: 1, narration: "阳光遇到水滴，就会分开成不同颜色。", visualAction: "The mentor points to sunlight entering a raindrop." });
    assert.match(video, /visible synchronized mouth shapes/);
    assert.match(video, /STYLE \(mandatory\): 1990s Japanese TV anime super-deformed/);
    assert.match(video, /2\.7-head-tall body/);
    assert.match(video, /hand-inked charcoal outlines/);
    assert.doesNotMatch(video, /1970s American educational television cartoon/);
    assert.match(video, teacherId === YOUTH_MENTOR_TEACHER_IDS.male ? /young adult male Mandarin educator/ : /young adult female Mandarin educator/);
    assert.doesNotMatch(video, /Off-screen narration|No on-screen presenter|Monokuma|Monomi/);
    assert.match(video, teacherId === YOUTH_MENTOR_TEACHER_IDS.male ? /sage-green sleeves/ : /cream cardigan and slate-blue pleated skirt/);
  }
});

test("youth camera keeps the original 4:3 television clear of the follow-up panel", () => {
  const display = YOUTH_RENDERING.screen;
  assert.ok(Math.abs(display.width / display.height - 4 / 3) < 0.001);
  for (const [width, height] of [[1672, 941], [1440, 900], [1280, 800], [1100, 900], [390, 844], [844, 390]]) {
    const pose = youthCameraPose(width, height, true);
    assert.equal(pose.position[0], pose.lookAt[0]);
    const distance = pose.position[2] - pose.lookAt[2];
    const viewHeight = 2 * distance * Math.tan(pose.fov * Math.PI / 360);
    const pixelsPerWorldUnit = height / viewHeight;
    const frameCenter = width / 2 + (display.center[0] - pose.lookAt[0]) * pixelsPerWorldUnit;
    const frameLeft = frameCenter - display.frameWidth * pixelsPerWorldUnit / 2;
    const frameRight = frameCenter + display.frameWidth * pixelsPerWorldUnit / 2;
    const frameHeight = display.frameHeight * pixelsPerWorldUnit;
    assert.ok(frameLeft >= 20 && frameRight <= width - 20);
    assert.ok(frameHeight < height);
    if (width >= 700) assert.ok(frameRight <= width - 24 - 320 - 20 + .01, "Television must end before the desktop panel");
    assert.ok(distance > 0);
  }
});

test("static scene budget and finite camera movement stay bounded", () => {
  assert.equal(YOUTH_RENDERING.deskColumns.length * YOUTH_RENDERING.deskRows.length, 6);
  assert.ok(YOUTH_RENDERING.maxDpr <= 1.25);
  assert.equal(smoothCameraProgress(-1), 0);
  assert.equal(smoothCameraProgress(1), 1);
  assert.equal(smoothCameraProgress(2), 1);
  assert.equal(smoothCameraProgress(0.5), 0.5);
});
