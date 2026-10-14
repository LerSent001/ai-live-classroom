import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { YouthEntrance } from "./entrance";
import { youthCameraPose, youthEntrancePose } from "./camera";
import { YOUTH_RENDERING } from "@/lib/youth-classroom";

test("first entry uses a minimal screen signal and removes the entire cover when ready", () => {
  for (const mentor of ["male", "female"] as const) {
    const html = renderToStaticMarkup(createElement(YouthEntrance, { phase: "loading", mentor }));
    assert.match(html, /youth-entrance-loading/);
    assert.match(html, /role="status"/);
    assert.match(html, /正在准备教室/);
    assert.match(html, /youth-arrival-symbol/);
    assert.doesNotMatch(html, /课堂即将|youth-entrance-title|<img/);
    assert.doesNotMatch(html, /canvas|video|monokuma|monomi|aria-valuenow|progressbar/);
    assert.equal(renderToStaticMarkup(createElement(YouthEntrance, { phase: "ready", mentor })), "");
  }
});

test("entrance reveal is decorative and asset failure retains a reload action", () => {
  const reveal = renderToStaticMarkup(createElement(YouthEntrance, { phase: "entering", mentor: "male" }));
  assert.match(reveal, /youth-entrance-entering" aria-hidden="true"/);
  const failed = renderToStaticMarkup(createElement(YouthEntrance, { phase: "failed", mentor: "female" }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /重新加载/);
  assert.match(failed, /type="button"/);
  assert.doesNotMatch(failed, /正在载入场景与材质/);
});

test("first arrival locks the camera at the existing lobby endpoint", () => {
  for (const [width, height] of [[1672, 941], [1440, 900], [390, 844], [844, 390]]) {
    for (const screen of [false, true]) {
      const start = youthEntrancePose(width, height, 0, screen);
      const end = youthCameraPose(width, height, screen);
      assert.deepEqual(youthEntrancePose(width, height, 1, screen), end);
      assert.deepEqual(youthEntrancePose(width, height, 2, screen), end);
      assert.deepEqual(youthEntrancePose(width, height, -1, screen), start);
      assert.deepEqual(start, end);
      for (let step = 0; step <= 100; step++) {
        const pose = youthEntrancePose(width, height, step / 100, screen);
        assert.ok([...pose.position, ...pose.lookAt, pose.fov].every(Number.isFinite));
        assert.ok(pose.position[1] > 0 && pose.position[1] < 5.38);
      }
    }
  }
  assert.equal(YOUTH_RENDERING.entranceSeconds + YOUTH_RENDERING.entranceRevealSeconds, 2.13);
});
