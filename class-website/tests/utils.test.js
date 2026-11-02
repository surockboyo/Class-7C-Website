import test from "node:test";
import assert from "node:assert/strict";
import { getDeadlineBadge } from "../assets/js/utils.js";

const now = new Date("2026-11-01T05:00:00.000Z");

test("deadline labels use only the specified milestones and handle invalid dates", () => {
  assert.equal(getDeadlineBadge("2026-11-02", "active", now), "H-1");
  assert.equal(getDeadlineBadge("2026-11-04", "active", now), "H-3");
  assert.equal(getDeadlineBadge("2026-11-08", "active", now), "H-7");
  assert.equal(getDeadlineBadge("2026-11-03", "active", now), "");
  assert.equal(getDeadlineBadge("2026-11-01", "active", now), "Hari ini");
  assert.equal(getDeadlineBadge("2026-10-31", "active", now), "Terlambat");
  assert.equal(getDeadlineBadge("invalid", "active", now), "");
  assert.equal(getDeadlineBadge("", "done", now), "Selesai");
});
