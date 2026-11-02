import test from "node:test";
import assert from "node:assert/strict";
import {
  angleToIndex,
  indexToAngle,
  inertiaStep,
  nearestSlot,
  normalizeRotation,
  relativeSlotOffset,
  snapRotation,
  stepDegrees,
  visibleIndices,
  wrapIndex,
} from "../assets/js/disc-math.js";

test("angle and index mapping round-trip for 1, 2, 5, and 40 photos", () => {
  for (const count of [1, 2, 5, 40]) {
    for (let index = 0; index < count; index += 1) {
      const degrees = indexToAngle(index, count);
      assert.equal(angleToIndex(degrees, count), index);
      assert.equal(relativeSlotOffset(index, index, count), 0);
    }
  }
  assert.equal(stepDegrees(40), 20);
  assert.equal(stepDegrees(5), 72);
});

test("snaps to the nearest slot, including across zero", () => {
  assert.equal(nearestSlot(2.49, 5), 2);
  assert.equal(nearestSlot(2.51, 5), 3);
  assert.equal(nearestSlot(4.8, 5), 0);
  assert.equal(snapRotation(-0.2, 5), 0);
  assert.equal(snapRotation(4.4, 5), 4);
});

test("indices and rotations wrap in both directions and normalize large values", () => {
  assert.equal(wrapIndex(-1, 12), 11);
  assert.equal(wrapIndex(12, 12), 0);
  assert.equal(normalizeRotation(-25, 12), 11);
  assert.equal(normalizeRotation(12025, 12), 1);
  assert.equal(angleToIndex(-360, 40), 0);
  assert.equal(angleToIndex(1440, 40), 0);
});

test("visible item set stays bounded for small and very large galleries", () => {
  for (const count of [1, 2, 3, 12, 100, 1000]) {
    const visible = visibleIndices(-123.4, count);
    assert.ok(visible.length <= 9, `${count} photos produced ${visible.length} visible slots`);
    assert.ok(visible.includes(nearestSlot(-123.4, count)));
    assert.equal(new Set(visible).size, visible.length);
  }
});

test("inertia decays to a snapped slot and reduced motion skips animation", () => {
  let state = { rotation: 2.25, velocity: 0.02, done: false };
  for (let frame = 0; frame < 1000 && !state.done; frame += 1) {
    state = inertiaStep(state.rotation, state.velocity, 16, 40);
  }
  assert.equal(state.done, true);
  assert.equal(state.velocity, 0);
  assert.equal(state.rotation, snapRotation(state.rotation, 40));
  assert.deepEqual(inertiaStep(3.6, 0.02, 16, 12, true), { rotation: 4, velocity: 0, done: true });
  assert.deepEqual(inertiaStep(3, 1, 16, 1), { rotation: 0, velocity: 0, done: true });
});
