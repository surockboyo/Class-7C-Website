import test from "node:test";
import assert from "node:assert/strict";
import { formatLiveDateTime } from "../assets/js/utils.js";

test("formats the live clock in Indonesian WIB with an explicit ISO offset", () => {
  const result = formatLiveDateTime(new Date("2026-11-01T15:17:00.000Z"));
  assert.deepEqual(result, {
    text: "Minggu, 1 November 2026 pukul 22.17",
    datetime: "2026-11-01T22:17:00+07:00",
  });
});

test("updates weekday and date across midnight in WIB", () => {
  const before = formatLiveDateTime(new Date("2026-11-01T16:59:00.000Z"));
  const after = formatLiveDateTime(new Date("2026-11-01T17:00:00.000Z"));
  assert.equal(before.text, "Minggu, 1 November 2026 pukul 23.59");
  assert.equal(before.datetime, "2026-11-01T23:59:00+07:00");
  assert.equal(after.text, "Senin, 2 November 2026 pukul 00.00");
  assert.equal(after.datetime, "2026-11-02T00:00:00+07:00");
});

test("converts timestamps from another timezone to the correct WIB date and time", () => {
  const result = formatLiveDateTime(new Date("2026-11-01T09:17:00-08:00"));
  assert.deepEqual(result, {
    text: "Senin, 2 November 2026 pukul 00.17",
    datetime: "2026-11-02T00:17:00+07:00",
  });
});

test("falls back to a safe Indonesian date when Intl timezone formatting is unavailable", () => {
  const original = Intl.DateTimeFormat;
  try {
    Intl.DateTimeFormat = () => { throw new RangeError("Timezone unavailable"); };
    assert.deepEqual(formatLiveDateTime(new Date("2026-11-01T15:17:00.000Z")), {
      text: "Minggu, 1 November 2026 pukul 22.17",
      datetime: "2026-11-01T22:17:00+07:00",
    });
  } finally {
    Intl.DateTimeFormat = original;
  }
});

test("returns a safe message and no invalid datetime for an invalid input", () => {
  assert.deepEqual(formatLiveDateTime(new Date(Number.NaN)), {
    text: "Waktu belum tersedia",
    datetime: null,
  });
});
