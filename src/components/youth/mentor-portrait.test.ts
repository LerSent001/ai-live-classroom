import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nextYouthMentor, YOUTH_MENTORS, YouthMentorPortrait, type YouthMentorId } from "./mentor-portrait";

test("youth mentor is a passive optimized DOM portrait with the original alpha source", () => {
  const html = renderToStaticMarkup(createElement(YouthMentorPortrait));
  assert.match(html, /data-youth-portrait="mentor-v1"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /alt=""/);
  assert.match(html, /draggable="false"/);
  assert.match(html, /\/_next\/image\?/);
  assert.match(html, /mentor-halfbody-v1\.png/);
  assert.doesNotMatch(html, /canvas|video|button|monokuma|monomi/);
  const png = readFileSync(new URL("../../../public/youth/characters/mentor-halfbody-v1.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1536);
  assert.equal(png[25], 6, "Original image retains RGBA rather than flattening its background");
  assert.ok(png.length < 2_000_000);
  assert.equal(createHash("sha256").update(png).digest("hex"), "cc62a056358750e59dccd7688229387b2963571860c33292d36cf1d3328d7723", "The existing male artwork is preserved byte-for-byte");
});

test("both UI identities use a single optimized image and the same alpha-mask surface", () => {
  for (const mentor of Object.keys(YOUTH_MENTORS) as YouthMentorId[]) {
    const character = YOUTH_MENTORS[mentor];
    const html = renderToStaticMarkup(createElement(YouthMentorPortrait, { mentor }));
    assert.ok(html.includes(`data-youth-portrait="${character.version}"`));
    assert.ok(html.includes(character.asset));
    assert.equal((html.match(/<img\b/g) ?? []).length, 1);
    assert.match(html, /class="youth-mentor-portrait" aria-hidden="true"/);
    assert.doesNotMatch(html, /canvas|video|button|monokuma|monomi/);
    const png = readFileSync(new URL(`../../../public/youth/characters/${character.asset}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1536);
    assert.equal(png[25], 6, "Each original image must retain RGBA");
    assert.ok(png.length < 2_000_000);
  }
});

test("the original single-button cycle has just male and female UI identities", () => {
  assert.deepEqual(Object.keys(YOUTH_MENTORS), ["male", "female"]);
  assert.equal(nextYouthMentor("male"), "female");
  assert.equal(nextYouthMentor("female"), "male");
  assert.equal(nextYouthMentor(nextYouthMentor("male")), "male");
});
