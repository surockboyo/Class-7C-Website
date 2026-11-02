const TIME_ZONE = "Asia/Jakarta";
const DAY_INDEX = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };

function getWibParts(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError("Waktu jadwal tidak valid.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { day: DAY_INDEX[values.weekday], minutes: Number(values.hour) * 60 + Number(values.minute) };
}

function parseTime(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function validPeriods(schedule, day) {
  if (!Array.isArray(schedule)) return [];
  return schedule
    .filter((period) => period && period.day === day && typeof period.subject === "string")
    .map((period) => ({ ...period, startMinutes: parseTime(period.start), endMinutes: parseTime(period.end) }))
    .filter((period) => period.startMinutes !== null && period.endMinutes !== null && period.startMinutes < period.endMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

export function getScheduleView(now, schedule, settings = {}) {
  const { day, minutes } = getWibParts(now);
  const switchAt = parseTime(settings.switchTime) ?? 20 * 60;
  const schoolDays = Array.isArray(settings.schoolDays) ? settings.schoolDays : [1, 2, 3, 4, 5];
  if (day > 5) {
    return { mode: "full-week", shownDay: null, pinnedDay: day === 7 ? 1 : null, currentPeriod: null, nextPeriod: null };
  }
  let shownDay = day;
  if (minutes >= switchAt) {
    if (day === 5) shownDay = 1;
    else shownDay = day + 1;
    if (!schoolDays.includes(shownDay)) {
      let candidate = shownDay;
      for (let count = 0; count < 7 && !schoolDays.includes(candidate); count += 1) candidate = candidate === 7 ? 1 : candidate + 1;
      shownDay = candidate;
    }
  }
  const periods = validPeriods(schedule, shownDay);
  const isShowingToday = shownDay === day;
  const currentPeriod = isShowingToday
    ? periods.find((period) => period.startMinutes <= minutes && minutes < period.endMinutes) ?? null
    : null;
  const nextPeriod = isShowingToday && !currentPeriod
    ? periods.find((period) => period.startMinutes > minutes) ?? null
    : null;
  return {
    mode: "single",
    shownDay,
    pinnedDay: null,
    currentPeriod: currentPeriod ? { ...currentPeriod } : null,
    nextPeriod: nextPeriod ? { ...nextPeriod } : null,
  };
}

export const DAY_NAMES = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
