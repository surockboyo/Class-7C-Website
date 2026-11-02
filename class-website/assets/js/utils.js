export const TIME_ZONE = "Asia/Jakarta";

export function formatDate(date, options = {}) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "Tanggal belum diatur";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(value);
}

export function formatDateTime(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "Waktu belum tersedia";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

export function formatLiveDateTime(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return { text: "Waktu belum tersedia", datetime: null };
  const wib = new Date(value.getTime() + 7 * 60 * 60 * 1000);

  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("id-ID", {
      timeZone: TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(value).map(({ type, value: part }) => [type, part]));
  } catch {
    const weekdays = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    parts = {
      weekday: weekdays[wib.getUTCDay()],
      day: String(wib.getUTCDate()),
      month: months[wib.getUTCMonth()],
      year: String(wib.getUTCFullYear()),
      hour: String(wib.getUTCHours()).padStart(2, "0"),
      minute: String(wib.getUTCMinutes()).padStart(2, "0"),
      second: String(wib.getUTCSeconds()).padStart(2, "0"),
    };
  }

  const pad = (part) => String(part).padStart(2, "0");
  const datePart = `${wib.getUTCFullYear()}-${pad(wib.getUTCMonth() + 1)}-${pad(wib.getUTCDate())}`;
  const timePart = `${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}:${pad(wib.getUTCSeconds())}`;
  return {
    text: `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year} pukul ${pad(parts.hour)}.${pad(parts.minute)}`,
    datetime: `${datePart}T${timePart}+07:00`,
  };
}

export function createElement(tag, { className, text, attrs = {} } = {}, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "checked" || key === "disabled" || key === "hidden" || key === "required" || key === "multiple") node[key] = Boolean(value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child instanceof Node) node.append(child);
    else if (child !== null && child !== undefined) node.append(document.createTextNode(String(child)));
  }
  return node;
}

export function safeDateForInput(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return "";
  return value;
}

export function getDeadlineBadge(dateValue, status, now = new Date()) {
  if (status === "done") return "Selesai";
  if (typeof dateValue !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return "";
  const due = Date.parse(`${dateValue}T00:00:00+07:00`);
  if (Number.isNaN(due)) return "";
  const today = Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now) + "T00:00:00+07:00");
  const difference = Math.round((due - today) / 86400000);
  if (difference < 0) return "Terlambat";
  if (difference === 0) return "Hari ini";
  if ([1, 3, 7].includes(difference)) return "H-" + difference;
  return "";
}

export function downloadText(filename, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = createElement("a", { attrs: { href: url, download: filename } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function announce(message) {
  const live = document.querySelector("#live-region");
  if (live) live.textContent = message;
}

export function localRecordTime(record) {
  return record.updatedAt || record.createdAt || new Date().toISOString();
}

export function compareDateRecords(a, b) {
  const dateA = typeof a.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : null;
  const dateB = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  const today = localToday();
  const upcomingA = dateA && dateA >= today && a.status !== "done";
  const upcomingB = dateB && dateB >= today && b.status !== "done";
  if (upcomingA !== upcomingB) return upcomingA ? -1 : 1;
  if (dateA && dateB) return upcomingA ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
  if (dateA) return -1;
  if (dateB) return 1;
  return 0;
}

export function localToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}
