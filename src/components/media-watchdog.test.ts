import assert from "node:assert/strict";
import test from "node:test";
import { waitForMediaPlay, watchMediaLoad } from "./media-watchdog";

test("silent media loading has a timeout, but ready, retired and cancelled loads do not fail", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let timeouts = 0;
  watchMediaLoad({ current: () => true, ready: () => false, timeout: () => timeouts++ }, 100);
  watchMediaLoad({ current: () => true, ready: () => true, timeout: () => timeouts++ }, 100);
  watchMediaLoad({ current: () => false, ready: () => false, timeout: () => timeouts++ }, 100);
  const cancel = watchMediaLoad({ current: () => true, ready: () => false, timeout: () => timeouts++ }, 100);
  cancel(); t.mock.timers.tick(101); assert.equal(timeouts, 1);
});

test("a play promise that never settles cannot trap the player in a pending activation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = waitForMediaPlay(() => new Promise<void>(() => {}), 100);
  const rejected = assert.rejects(pending, e => e instanceof DOMException && e.name === "TimeoutError");
  t.mock.timers.tick(101); await rejected;
  await waitForMediaPlay(async () => {}, 100);
});
