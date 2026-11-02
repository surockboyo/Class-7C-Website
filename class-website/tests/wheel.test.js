import test from "node:test";
import assert from "node:assert/strict";
import { chooseWinnerIndex, getRotationForWinner, getSliceAtPointer } from "../assets/js/wheel.js";

test("winner selection is always a valid eligible-list index", () => {
  for (const names of [[], ["A"], ["A", "B"], ["A", "B", "C", "D", "E"], Array.from({ length: 40 }, (_, i) => `N${i}`)]) {
    const picked = chooseWinnerIndex(names.length);
    if (names.length === 0) assert.equal(picked, -1);
    else assert.ok(picked >= 0 && picked < names.length);
  }
});

test("wheel landing angle points at the chosen slice for 1, 2, 5, and 40 names", () => {
  for (const count of [1, 2, 5, 40]) {
    for (let index = 0; index < count; index += 1) {
      const rotation = getRotationForWinner(count, index, 0, 5);
      assert.equal(getSliceAtPointer(rotation, count), index);
    }
  }
});
