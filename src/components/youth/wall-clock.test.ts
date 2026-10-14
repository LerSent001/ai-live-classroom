import test from 'node:test';
import assert from 'node:assert/strict';
import { clockAngles } from './wall-clock';

test('clock hands show Beijing time and all three advance with elapsed real seconds', () => {
  const epoch = Date.parse('2026-10-14T04:00:00Z');
  const before = clockAngles(epoch), after = clockAngles(epoch + 1000);
  const turn = Math.PI * 2;
  assert.ok(Math.abs(before.hour % turn) < 1e-9);
  assert.ok(Math.abs(before.minute % turn) < 1e-9);
  assert.ok(Math.abs(after.second - before.second - turn / 60) < 1e-9);
  assert.ok(Math.abs(after.minute - before.minute - turn / 3600) < 1e-9);
  assert.ok(Math.abs(after.hour - before.hour - turn / 43200) < 1e-9);
});
