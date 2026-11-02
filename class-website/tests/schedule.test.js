import test from "node:test";
import assert from "node:assert/strict";
import { getScheduleView } from "../assets/js/schedule.js";

const onePeriodPerDay = Array.from({ length: 5 }, (_, index) => ({
  id: `period-${index + 1}`,
  day: index + 1,
  subject: `Pelajaran ${index + 1}`,
  start: "08:00",
  end: "09:00",
}));

function view(iso, schedule = onePeriodPerDay, switchTime = "20:00") {
  return getScheduleView(new Date(iso), schedule, { switchTime, schoolDays: [1, 2, 3, 4, 5] });
}

test("shows each weekday until the switch time", () => {
  for (const [iso, day] of [
    ["2026-11-02T03:00:00Z", 1],
    ["2026-11-03T03:00:00Z", 2],
    ["2026-11-04T03:00:00Z", 3],
    ["2026-11-05T03:00:00Z", 4],
    ["2026-11-06T03:00:00Z", 5],
  ]) {
    assert.equal(view(iso).shownDay, day);
    assert.equal(view(iso).mode, "single");
  }
});

test("switches after S, including custom switch time and S-1 minute", () => {
  assert.equal(view("2026-11-02T12:59:00Z").shownDay, 1);
  assert.equal(view("2026-11-02T13:00:00Z").shownDay, 2);
  assert.equal(view("2026-11-02T11:59:00Z", onePeriodPerDay, "19:00").shownDay, 1);
  assert.equal(view("2026-11-02T12:00:00Z", onePeriodPerDay, "19:00").shownDay, 2);
});

test("handles midnight and Friday-to-Monday boundaries in WIB", () => {
  assert.equal(view("2026-11-02T16:59:00Z").shownDay, 2);
  assert.equal(view("2026-11-02T17:00:00Z").shownDay, 2);
  assert.equal(view("2026-11-06T12:59:00Z").shownDay, 5);
  assert.equal(view("2026-11-06T13:00:00Z").shownDay, 1);
  assert.equal(view("2026-11-06T16:59:00Z").shownDay, 1);
  assert.equal(view("2026-11-06T17:00:00Z").mode, "full-week");
});

test("shows Saturday full-week and pins Monday on Sunday", () => {
  const saturday = view("2026-11-07T03:00:00Z");
  const sunday = view("2026-11-08T03:00:00Z");
  assert.equal(saturday.mode, "full-week");
  assert.equal(saturday.shownDay, null);
  assert.equal(sunday.mode, "full-week");
  assert.equal(sunday.pinnedDay, 1);
});

test("handles empty and invalid schedule records without throwing", () => {
  assert.equal(view("2026-11-02T03:00:00Z", []).currentPeriod, null);
  const result = view("2026-11-02T03:00:00Z", [{ day: 1, start: "bad", end: "also bad" }]);
  assert.equal(result.currentPeriod, null);
  assert.equal(result.nextPeriod, null);
});

test("highlights only a current period and the next period before it starts", () => {
  const schedule = [
    { id: "one", day: 1, subject: "Pertama", start: "08:00", end: "09:00" },
    { id: "two", day: 1, subject: "Kedua", start: "09:30", end: "10:00" },
  ];
  assert.equal(view("2026-11-02T01:30:00Z", schedule).currentPeriod.id, "one");
  assert.equal(view("2026-11-02T02:15:00Z", schedule).currentPeriod, null);
  assert.equal(view("2026-11-02T02:15:00Z", schedule).nextPeriod.id, "two");
  assert.equal(view("2026-11-02T04:00:00Z", schedule).currentPeriod, null);
  assert.equal(view("2026-11-02T04:00:00Z", schedule).nextPeriod, null);
});
