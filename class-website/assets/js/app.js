import {
  COLLECTIONS,
  addActivity,
  commitImport,
  createRecord,
  deleteBlob,
  exportPackage,
  getActivityLog,
  getBlob,
  deleteSharedGalleryImage,
  getOwnerInbox,
  getGalleryStorageUsage,
  getReportAttachmentUrl,
  getStorageMeta,
  hardDeleteRecord,
  initializeStorage,
  parseImportText,
  previewImport,
  readCollection,
  refreshSharedCollections,
  resetData,
  resolvePublishedConflict,
  restoreRecord,
  saveLocalRecord,
  saveRecord,
  submitSharedReport,
  submitSharedSuggestion,
  updateOwnerInbox,
  deleteOwnerInbox,
  uploadSharedObject,
  getSharedImageUrl,
  softDeleteRecord,
  sourceLabel,
  writeCollection,
  writeCollections,
  subscribeSharedRecords,
} from "./storage.js";
import { getScheduleView, DAY_NAMES } from "./schedule.js";
import {
  announce,
  compareDateRecords,
  createElement as el,
  downloadText,
  formatDate,
  formatDateTime,
  formatLiveDateTime,
  getDeadlineBadge,
  localToday,
} from "./utils.js";
import { animateWheel, celebrateWinner, chooseWinnerIndex, drawWheel, playWheelTick } from "./wheel.js";
import { createSuggestionText, createWhatsAppUrl, formatReportMessage, isValidWhatsAppNumber } from "./reports.js";
import { createMomentGallery, processGalleryImage } from "./gallery.js";
import { createIcon } from "./icons.js";
import { RecordConflictError } from "./shared-storage.js";
import { getOwnerStatus, signInOwner, signOutOwner, subscribeOwnerAuth } from "./owner-auth.js";

const root = document.querySelector("#view-root");
const nav = document.querySelector("#bottom-nav");
const dialog = document.querySelector("#app-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogEyebrow = document.querySelector("#dialog-eyebrow");
const dialogContent = document.querySelector("#dialog-content");
const dialogActions = document.querySelector("#dialog-actions");
const dialogForm = document.querySelector("#dialog-form");
const collections = [...COLLECTIONS];
const publicViews = [
  { id: "home", label: "Beranda", icon: "home" },
  { id: "class", label: "Kelas", icon: "class" },
  { id: "schedule", label: "Jadwal", icon: "schedule" },
  { id: "gallery", label: "Momen", icon: "moments" },
  { id: "more", label: "Lainnya", icon: "more" },
];
const categoryNames = {
  classInfo: "Deskripsi kelas",
  homework: "PR",
  exams: "Jadwal ulangan",
  outlines: "Kisi-kisi",
  announcements: "Pengumuman",
};
const dayOptions = DAY_NAMES.slice(1).map((name, index) => ({ value: index + 1, label: name }));
const defaultSettings = {
  id: "main",
  switchTime: "20:00",
  schoolDays: [1, 2, 3, 4, 5],
  whatsappNumber: "",
  galleryMaxBytes: 5 * 1024 * 1024,
  reportCooldownSeconds: 60,
  excludePicked: false,
};

let data = Object.fromEntries(collections.map((name) => [name, []]));
let currentView = "home";
let showAllSchedule = false;
let classCategory = "classInfo";
let dashboardSection = "overview";
let dashboardUnlocked = false;
let modalSubmitHandler = null;
let toastTimer = 0;
let uploadPreviewUrls = [];
let currentGallery = [];
let currentGalleryController = null;
let viewerIndex = 0;
let hiddenTapTimes = [];
let lastReport = null;
let reportCooldownTimer = 0;
let galleryFilterTimer = 0;
let themeSwitchReady = false;
let heroClockElement = null;
let heroClockTimer = null;
let heroClockListenersReady = false;
let networkListenersReady = false;
let ownerAuthListenerReady = false;
let appBooted = false;
let realtimeUnsubscribe = null;
let realtimeFallbackTimer = 0;
let realtimeRefreshTimer = 0;
let sharedRefreshPromise = null;

const $ = (selector, scope = document) => scope.querySelector(selector);
const active = (name) => (data[name] ?? []).filter((record) => record.deletedAt === null);
const deleted = (name) => (data[name] ?? []).filter((record) => record.deletedAt !== null);
const settings = () => active("settings")[0] ?? defaultSettings;
/* PROTECTED */
const themeRecord = () => active("theme")[0] ?? { id: "main", value: "system", accent: "red", createdAt: timestamp(), updatedAt: timestamp(), deletedAt: null };
/* END PROTECTED */
const timestamp = () => new Date().toISOString();
const isUnlocked = () => dashboardUnlocked;

function button(label, action, { variant = "", disabled = false, attrs = {} } = {}) {
  const { dataset = {}, ...otherAttrs } = attrs;
  return el("button", {
    className: `button${variant ? ` ${variant}` : ""}`,
    text: label,
    attrs: { type: "button", dataset: { action, ...dataset }, disabled, ...otherAttrs },
  });
}

function textButton(label, action, { danger = false, attrs = {} } = {}) {
  const { dataset = {}, ...otherAttrs } = attrs;
  return el("button", {
    className: `text-button${danger ? " danger" : ""}`,
    text: label,
    attrs: { type: "button", dataset: { action, ...dataset }, ...otherAttrs },
  });
}

function heading(kicker, title, description = "") {
  const wrap = el("div", { className: "page-heading" });
  const text = el("div");
  text.append(el("p", { className: "eyebrow", text: kicker }), el("h1", { text: title }));
  if (description) text.append(el("p", { text: description }));
  text.append(el("div", { className: "classic-divider", attrs: { "aria-hidden": "true" } }));
  wrap.append(text);
  return wrap;
}

function makeView(id) {
  return el("section", { className: "view", attrs: { id: `view-${id}`, "aria-labelledby": `heading-${id}` } });
}

function cardHeader(title, subtitle = "", { classicDivider = false } = {}) {
  const header = el("div", { className: "card-head" });
  const copy = el("div");
  copy.append(el("h2", { text: title }));
  if (subtitle) copy.append(el("p", { text: subtitle }));
  if (classicDivider) copy.append(el("div", { className: "classic-divider", attrs: { "aria-hidden": "true" } }));
  header.append(copy);
  return header;
}

function emptyState(title, description, actionNode = null) {
  const state = el("div", { className: "empty-state", attrs: { role: "status" } });
  state.append(el("strong", { text: title }), el("p", { text: description }));
  if (actionNode) state.append(actionNode);
  return state;
}

function showToast(message) {
  const region = $("#toast-region");
  region.replaceChildren(el("div", { className: "toast", text: message, attrs: { role: "status" } }));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => region.replaceChildren(), 3600);
  announce(message);
}

function setSourceLabel() {
  try { $("#source-pill").textContent = sourceLabel(); }
  catch { $("#source-pill").textContent = "Data lokal"; }
}

function setConnectionStatus(message = "") {
  const status = $("#connection-status");
  status.textContent = message;
  status.hidden = !message;
}

async function refreshSharedData() {
  if (sharedRefreshPromise) return sharedRefreshPromise;
  sharedRefreshPromise = (async () => {
    const result = await refreshSharedCollections();
    if (!result.ok) {
      setConnectionStatus(result.offline
        ? "Offline - menampilkan data terakhir yang tersimpan di perangkat."
        : `Data bersama belum bisa diperbarui. Data terakhir tetap tersedia. ${result.error.message}`);
      setSourceLabel();
      return;
    }
    let changed = false;
    for (const [name, records] of Object.entries(result.collections)) {
      if (JSON.stringify(data[name] ?? []) !== JSON.stringify(records)) changed = true;
      data[name] = records;
    }
    setConnectionStatus("");
    setSourceLabel();
    if (changed) await renderCurrent();
  })();
  try {
    return await sharedRefreshPromise;
  } finally {
    sharedRefreshPromise = null;
  }
}

function startRealtimeFallback() {
  clearInterval(realtimeFallbackTimer);
  realtimeFallbackTimer = setInterval(() => { void refreshSharedData(); }, 180000);
}

function stopRealtime() {
  realtimeUnsubscribe?.();
  realtimeUnsubscribe = null;
  clearInterval(realtimeFallbackTimer);
}

function startRealtime() {
  if (realtimeUnsubscribe || document.hidden || !navigator.onLine) return;
  try {
    realtimeUnsubscribe = subscribeSharedRecords(() => {
      clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = setTimeout(() => { void refreshSharedData(); }, 250);
    }, (status) => {
      if (status === "SUBSCRIBED") clearInterval(realtimeFallbackTimer);
      else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) startRealtimeFallback();
    });
  } catch (error) {
    setConnectionStatus(`Pembaruan langsung tidak tersedia. Data akan diperiksa berkala. ${error.message}`);
    startRealtimeFallback();
  }
}

function setupNetworkListeners() {
  if (networkListenersReady) return;
  networkListenersReady = true;
  window.addEventListener("offline", () => {
    stopRealtime();
    setConnectionStatus("Offline - menampilkan data terakhir yang tersimpan di perangkat.");
    setSourceLabel();
  });
  window.addEventListener("online", () => {
    void refreshSharedData();
    startRealtime();
  });
  window.addEventListener("focus", () => {
    void refreshSharedData();
    if (currentView === "dashboard") void renderCurrent();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopRealtime();
    else {
      void refreshSharedData();
      startRealtime();
      if (currentView === "dashboard") void renderCurrent();
    }
  });
  window.addEventListener("pagehide", stopRealtime, { once: true });
}

/* PROTECTED */
function setTheme() {
  const theme = themeRecord().value;
  const resolved = theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  const accent = ["red", "yellow", "blue", "green"].includes(themeRecord().accent) ? themeRecord().accent : "red";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.accent = accent;
  const themeSwitch = $("#theme-switch");
  themeSwitch.setAttribute("aria-checked", String(resolved === "dark"));
  themeSwitch.querySelector(".eraser-label").textContent = resolved === "dark" ? "Gelap" : "Terang";
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
}

async function toggleTheme(x = innerWidth / 2, y = 0) {
  const resolved = document.documentElement.dataset.theme;
  const value = resolved === "dark" ? "light" : "dark";
  const apply = async () => {
    data.theme = await saveRecord("theme", { ...themeRecord(), value, updatedAt: timestamp() });
    setTheme();
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const supportsTransition = typeof document.startViewTransition === "function" && !reduced;
  if (supportsTransition) {
    document.documentElement.style.setProperty("--theme-origin-x", `${x}px`);
    document.documentElement.style.setProperty("--theme-origin-y", `${y}px`);
    const transition = document.startViewTransition(apply);
    await transition.updateCallbackDone;
  } else {
    await apply();
  }
  showToast(value === "dark" ? "Tema gelap aktif." : "Tema terang aktif.");
}

function setupThemeSwitch() {
  if (themeSwitchReady) return;
  themeSwitchReady = true;
  const themeSwitch = $("#theme-switch");
  let pointerStart = null;
  themeSwitch.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    themeSwitch.setPointerCapture(event.pointerId);
  });
  themeSwitch.addEventListener("pointerup", (event) => {
    if (!pointerStart || event.pointerId !== pointerStart.id) return;
    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    themeSwitch.style.setProperty("--drag-x", `${Math.max(-24, Math.min(24, event.clientX - pointerStart.x))}px`);
    if (distance >= 14) {
      themeSwitch.dataset.suppressClick = "true";
      void toggleTheme(event.clientX, event.clientY);
    }
    pointerStart = null;
    requestAnimationFrame(() => themeSwitch.style.removeProperty("--drag-x"));
  });
  themeSwitch.addEventListener("pointercancel", () => { pointerStart = null; });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (themeRecord().value === "system") setTheme();
  });
}
/* END PROTECTED */

async function logActivity(description, action = "ubah", recordId = "") {
  try {
    await addActivity(description, action, recordId);
  } catch (error) {
    showToast(`Data tersimpan, tetapi catatan aktivitas gagal disimpan: ${error.message}`);
  }
}

async function persist(name, records, activity) {
  data[name] = await writeCollection(name, records);
  if (activity) await logActivity(activity.description, activity.action, activity.recordId);
  setSourceLabel();
  await renderCurrent();
}

function currentMetaRecord(name) {
  return active(name)[0] ?? { id: "main", createdAt: timestamp(), updatedAt: timestamp(), deletedAt: null };
}

function makeRecordFromForm(collection, formValues, oldRecord) {
  const record = oldRecord ? { ...oldRecord, ...formValues, updatedAt: timestamp() } : createRecord(formValues);
  if (collection === "schedule") {
    if (record.start >= record.end) throw new Error("Jam selesai harus setelah jam mulai.");
    if (!Number.isInteger(Number(record.day)) || Number(record.day) < 1 || Number(record.day) > 7) throw new Error("Pilih hari yang valid.");
    record.day = Number(record.day);
  }
  if (collection === "settings") {
    const number = record.whatsappNumber ?? "";
    if (number && !isValidWhatsAppNumber(number)) throw new Error("Nomor WhatsApp harus berisi 10-15 digit internasional tanpa tanda plus atau spasi.");
    if (!Array.isArray(record.schoolDays) || !record.schoolDays.length || record.schoolDays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      throw new Error("Pilih setidaknya satu hari sekolah yang valid.");
    }
    record.galleryMaxBytes = Math.max(100 * 1024, Math.min(Number(record.galleryMaxMb || 5) * 1024 * 1024, 25 * 1024 * 1024));
    record.reportCooldownSeconds = Math.max(0, Math.min(Number(record.reportCooldownSeconds ?? 60), 86400));
    record.mutedWheel = Boolean(record.mutedWheel);
    record.vibrationEnabled = Boolean(record.vibrationEnabled);
    delete record.galleryMaxMb;
  }
  if (collection === "theme" && !["light", "dark", "system"].includes(record.value)) throw new Error("Tema tidak dikenal.");
  if (collection === "students" && !String(record.name ?? "").trim()) throw new Error("Nama siswa wajib diisi.");
  if (collection === "gallery") {
    record.tags = Array.isArray(record.tags)
      ? record.tags
      : String(record.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
  }
  return record;
}

function field(name, label, { type = "text", required = false, value = "", options = [], help = "", placeholder = "", multiple = false, min = null, max = null } = {}) {
  const wrapper = el("label", { className: "form-field" });
  wrapper.append(el("span", { text: label }));
  let input;
  if (type === "textarea") {
    input = el("textarea", { attrs: { name, rows: 4, required, placeholder } });
    input.value = value ?? "";
  } else if (type === "select") {
    input = el("select", { attrs: { name, required } });
    for (const option of options) {
      input.append(el("option", { text: option.label, attrs: { value: option.value } }));
    }
    input.value = String(value ?? options[0]?.value ?? "");
  } else if (type === "multiselect") {
    input = el("select", { attrs: { name, required, multiple: true } });
    const selected = new Set((Array.isArray(value) ? value : []).map(String));
    for (const option of options) {
      const child = el("option", { text: option.label, attrs: { value: option.value } });
      child.selected = selected.has(String(option.value));
      input.append(child);
    }
  } else {
    input = el("input", { attrs: { name, type, required, placeholder, multiple, min, max } });
    if (type !== "file" && type !== "checkbox") input.value = value ?? "";
    if (type === "checkbox") input.checked = Boolean(value);
    if (type === "file") input.accept = "image/jpeg,image/png,image/webp";
  }
  wrapper.append(input);
  if (help) wrapper.append(el("small", { text: help }));
  return wrapper;
}

const formFields = {
  classInfo: [
    { key: "name", label: "Nama kelas", required: true },
    { key: "description", label: "Tentang kelas", type: "textarea" },
    { key: "label", label: "Catatan", placeholder: "Contoh: Data contoh" },
  ],
  homework: [
    { key: "title", label: "Judul PR", required: true },
    { key: "subject", label: "Mata pelajaran", required: true },
    { key: "description", label: "Petunjuk", type: "textarea" },
    { key: "date", label: "Batas pengumpulan", type: "date" },
    { key: "author", label: "Dibuat oleh", placeholder: "Owner / Guru" },
    { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Belum selesai" }, { value: "done", label: "Selesai" }] },
  ],
  exams: [
    { key: "title", label: "Nama ulangan", required: true },
    { key: "subject", label: "Mata pelajaran", required: true },
    { key: "description", label: "Catatan", type: "textarea" },
    { key: "date", label: "Tanggal ulangan", type: "date" },
    { key: "author", label: "Dibuat oleh" },
    { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Akan datang" }, { value: "done", label: "Selesai" }] },
  ],
  outlines: [
    { key: "title", label: "Judul kisi-kisi", required: true },
    { key: "subject", label: "Mata pelajaran", required: true },
    { key: "description", label: "Materi yang dipelajari", type: "textarea" },
    { key: "date", label: "Tanggal terkait", type: "date" },
    { key: "author", label: "Dibuat oleh" },
  ],
  announcements: [
    { key: "title", label: "Judul pengumuman", required: true },
    { key: "description", label: "Isi pengumuman", type: "textarea", required: true },
    { key: "date", label: "Tanggal", type: "date" },
    { key: "author", label: "Dibuat oleh" },
  ],
  customSections: [
    { key: "title", label: "Nama bagian", required: true },
    { key: "description", label: "Isi bagian", type: "textarea" },
  ],
  schedule: [
    { key: "day", label: "Hari", type: "select", options: dayOptions, required: true },
    { key: "subject", label: "Mata pelajaran", required: true },
    { key: "start", label: "Mulai", type: "time", required: true },
    { key: "end", label: "Selesai", type: "time", required: true },
    { key: "teacher", label: "Guru" },
    { key: "classroom", label: "Ruang" },
  ],
  students: [{ key: "name", label: "Nama siswa", required: true }],
  gallery: [
    { key: "caption", label: "Cerita foto", required: true },
    { key: "uploader", label: "Diunggah oleh", placeholder: "Contoh: Siswa" },
    { key: "album", label: "Album", placeholder: "Contoh: Kegiatan kelas" },
    { key: "tags", label: "Tag", placeholder: "Pisahkan dengan koma" },
    { key: "files", label: "Pilih gambar (opsional saat mengubah)", type: "file", multiple: true, help: "JPG, PNG, atau WebP. Maksimal sesuai batas ukuran di Dashboard." },
  ],
  settings: [
    { key: "switchTime", label: "Jam ganti jadwal", type: "time", required: true },
    { key: "schoolDays", label: "Hari sekolah", type: "multiselect", options: dayOptions, required: true, help: "Pilih semua hari sekolah; gunakan Ctrl atau Command untuk memilih beberapa hari." },
    { key: "whatsappNumber", label: "Nomor WhatsApp tujuan", placeholder: "62xxxxxxxxxx", help: "Kosongkan untuk menonaktifkan tautan WhatsApp." },
    { key: "galleryMaxMb", label: "Batas unggah gambar (MB)", type: "number", min: 1, max: 25 },
    { key: "reportCooldownSeconds", label: "Jeda laporan (detik)", type: "number", min: 0, max: 86400 },
    { key: "excludePicked", label: "Jangan pilih siswa yang sudah terpilih", type: "checkbox" },
  ],
  theme: [
    { key: "value", label: "Tampilan", type: "select", options: [{ value: "system", label: "Ikuti perangkat" }, { value: "light", label: "Terang" }, { value: "dark", label: "Gelap" }] },
    { key: "accent", label: "Warna penanda", type: "select", options: [{ value: "red", label: "Merah spidol" }, { value: "yellow", label: "Kuning kapur" }, { value: "blue", label: "Biru kelas" }, { value: "green", label: "Hijau papan" }] },
  ],
};

function showModal(title, content, actions, eyebrow = "Ruang Kelas") {
  dialogTitle.textContent = title;
  dialogEyebrow.textContent = eyebrow;
  dialogContent.replaceChildren(...content);
  dialogActions.replaceChildren(...actions);
  modalSubmitHandler = null;
  if (!dialog.open) dialog.showModal();
}

function closeModal(value = "cancel") {
  if (dialog.open) dialog.close(value);
}

function showMessage(title, message, { actions = null, eyebrow = "Ruang Kelas" } = {}) {
  const content = el("div");
  content.append(el("p", { text: message }));
  const choices = actions ?? [button("Tutup", "dialog-close", { variant: "secondary" })];
  showModal(title, [content], choices, eyebrow);
}

function showConfirm(title, message, confirmLabel, variant = "danger") {
  return new Promise((resolve) => {
    const content = el("div");
    content.append(el("p", { text: message }));
    const cancel = button("Batal", "dialog-close", { variant: "secondary" });
    const confirm = button(confirmLabel, "confirm-choice", { variant });
    confirm.addEventListener("click", () => { closeModal("confirm"); resolve(true); });
    cancel.addEventListener("click", () => { closeModal("cancel"); resolve(false); });
    dialog.addEventListener("cancel", () => resolve(false), { once: true });
    showModal(title, [content], [cancel, confirm]);
  });
}

function showForm(title, fields, initial, onSubmit, { submitLabel = "Simpan", eyebrow = "Ruang Kelas" } = {}) {
  for (const url of uploadPreviewUrls) URL.revokeObjectURL(url);
  uploadPreviewUrls = [];
  dialogTitle.textContent = title;
  dialogEyebrow.textContent = eyebrow;
  const formStack = el("div", { className: "form-stack" });
  for (const descriptor of fields) {
    formStack.append(field(descriptor.key, descriptor.label, {
      ...descriptor,
      value: initial?.[descriptor.key] ?? descriptor.value ?? "",
    }));
  }
  formStack.append(el("div", { className: "dialog-error", attrs: { "aria-live": "polite" } }));
  dialogContent.replaceChildren(formStack);
  const cancel = button("Batal", "dialog-close", { variant: "secondary" });
  const submit = el("button", { className: "button", text: submitLabel, attrs: { type: "submit" } });
  dialogActions.replaceChildren(cancel, submit);
  modalSubmitHandler = async (event) => {
    event.preventDefault();
    const errorNode = $(".dialog-error", dialogContent);
    errorNode.textContent = "";
    const values = {};
    for (const descriptor of fields) {
      const input = $(`[name="${CSS.escape(descriptor.key)}"]`, formStack);
      if (descriptor.type === "file") {
        values[descriptor.key] = input.files;
      } else if (descriptor.type === "checkbox") {
        values[descriptor.key] = input.checked;
      } else if (descriptor.type === "multiselect") {
        values[descriptor.key] = Array.from(input.selectedOptions, (option) => Number(option.value));
      } else if (descriptor.type === "number") {
        values[descriptor.key] = input.value === "" ? "" : Number(input.value);
      } else {
        values[descriptor.key] = input.value.trim();
      }
    }
    try {
      const result = await onSubmit(values);
      if (result !== "reopen-form" && dialog.open) closeModal("saved");
    } catch (error) {
      errorNode.textContent = error.message || "Data belum bisa disimpan. Coba lagi.";
      announce(errorNode.textContent);
    }
  };
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => $("input,textarea,select", formStack)?.focus());
}

dialogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (modalSubmitHandler) void modalSubmitHandler(event);
});

document.addEventListener("click", async (event) => {
  const close = event.target.closest("[data-dialog-close]");
  if (close) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !dialog.open) return;
  event.preventDefault();
  if (dialog.dispatchEvent(new Event("cancel", { cancelable: true }))) closeModal();
});

function promptRecordConflict(error, proposedRecord) {
  const content = el("div", { className: "form-stack" });
  content.append(el("p", { text: "Data ini berubah di perangkat lain. Periksa versi terbaru sebelum memilih tindakan." }));
  content.append(el("h3", { text: "Versi di server" }));
  content.append(el("pre", { className: "record-conflict-preview", text: error.latestRecord ? JSON.stringify(error.latestRecord, null, 2) : "Data terbaru tidak tersedia atau sudah dihapus." }));
  content.append(el("h3", { text: "Perubahan dari perangkat ini" }));
  content.append(el("pre", { className: "record-conflict-preview", text: JSON.stringify(proposedRecord, null, 2) }));
  const latest = button("Muat versi terbaru", "dialog-close", { variant: "secondary" });
  const actions = [latest];
  const overwrite = error.latestRecord ? button("Timpa setelah meninjau", "dialog-close", { variant: "danger" }) : null;
  if (overwrite) actions.push(overwrite);
  showModal("Konflik perubahan", [content], actions, "Data bersama");
  return new Promise((resolve) => {
    let settled = false;
    const finish = (choice) => {
      if (settled) return;
      settled = true;
      closeModal(choice);
      resolve(choice);
    };
    latest.addEventListener("click", () => finish("latest"), { once: true });
    overwrite?.addEventListener("click", () => finish("overwrite"), { once: true });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish("latest");
    }, { once: true });
    dialog.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        resolve("latest");
      }
    }, { once: true });
  });
}

async function persistWithConflictResolution(action, proposedRecord) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return { value: await action(), latest: false };
    } catch (error) {
      if (!(error instanceof RecordConflictError)) throw error;
      const choice = await promptRecordConflict(error, proposedRecord);
      const refreshed = await refreshSharedCollections();
      if (!refreshed.ok) throw new Error(`Data terbaru gagal dimuat: ${refreshed.error.message}`);
      for (const [name, records] of Object.entries(refreshed.collections)) data[name] = records;
      setSourceLabel();
      if (choice === "latest") return { latest: true };
    }
  }
  throw new Error("Data masih berubah di perangkat lain. Muat ulang data sebelum mencoba lagi.");
}

function createHiddenTapGate() {
  const brand = $("#brand-mark");
  brand.addEventListener("click", () => {
    const now = Date.now();
    hiddenTapTimes = hiddenTapTimes.filter((time) => now - time <= 3000);
    hiddenTapTimes.push(now);
    if (hiddenTapTimes.length >= 5) {
      hiddenTapTimes = [];
      void openDashboardGate();
    }
  });
}

async function openDashboardGate() {
  try {
    if (isUnlocked()) {
      dashboardUnlocked = true;
      currentView = "dashboard";
      await renderCurrent();
      return;
    }
    const content = el("div", { className: "form-stack" });
    content.append(el("p", { text: "Masuk dengan akun Owner untuk mengelola data kelas bersama." }));
    const usernameField = field("ownerUsername", "Username", { type: "email", required: true, autocomplete: "username" });
    const passwordField = field("ownerPassword", "Password", { type: "password", required: true, autocomplete: "current-password" });
    content.append(usernameField, passwordField, el("div", { className: "dialog-error", attrs: { "aria-live": "polite" } }));
    const cancel = button("Batal", "dialog-close", { variant: "secondary" });
    const submit = el("button", { className: "button", text: "Masuk Dashboard", attrs: { type: "submit" } });
    dialogTitle.textContent = "Panel Owner";
    dialogEyebrow.textContent = "Dashboard";
    dialogContent.replaceChildren(content);
    dialogActions.replaceChildren(cancel, submit);
    modalSubmitHandler = async (event) => {
      event.preventDefault();
      const errorNode = $(".dialog-error", content);
      submit.disabled = true;
      try {
        const status = await signInOwner(
          $('[name="ownerUsername"]', content).value,
          $('[name="ownerPassword"]', content).value,
        );
        if (!status.isOwner) throw new Error("Akun ini belum terdaftar sebagai Owner.");
        dashboardUnlocked = true;
        currentView = "dashboard";
        closeModal("unlocked");
        await renderCurrent();
      } catch (error) {
        errorNode.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    };
    dialog.showModal();
    inputFocus(usernameField);
  } catch (error) {
    showToast(error.message);
  }
}

function inputFocus(node) {
  requestAnimationFrame(() => $("input", node)?.focus());
}

function navButton(view) {
  const item = el("button", {
    className: "nav-item",
    attrs: { type: "button", dataset: { view: view.id }, "aria-current": currentView === view.id ? "page" : null },
  });
  item.append(createIcon(view.icon, { className: "nav-icon" }), el("span", { text: view.label }));
  return item;
}

function renderNav() {
  const items = [...publicViews];
  if (dashboardUnlocked) items.push({ id: "dashboard", label: "Dashboard", icon: "class" });
  nav.replaceChildren(...items.map(navButton));
  nav.hidden = false;
}

function goTo(view) {
  if (view === "dashboard" && !dashboardUnlocked) return;
  showAllSchedule = false;
  currentView = view;
  void renderCurrent();
  $("#app-main").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}

function activeSettingsPanel() {
  const record = currentMetaRecord("settings");
  return { ...defaultSettings, ...record };
}

function scheduleRows(periods, today, { allWeek = false } = {}) {
  const container = el("div", { className: "schedule-mini" });
  if (!periods.length) return emptyState("Jadwal belum diisi", "Nanti, Owner bisa menambahkan jam pelajaran di Dashboard.");
  const view = getScheduleView(new Date(), active("schedule"), activeSettingsPanel());
  for (const period of periods) {
    const row = el("div", { className: `period-row${view.currentPeriod?.id === period.id && today ? " is-current" : ""}${view.nextPeriod?.id === period.id && today ? " is-next" : ""}` });
    row.append(el("span", { className: "period-time", text: `${period.start}–${period.end}` }));
    const copy = el("div", { className: "period-subject" });
    copy.append(el("span", { text: period.subject }));
    const meta = [period.teacher, period.classroom].filter(Boolean).join(" · ");
    if (meta) copy.append(el("div", { className: "period-meta", text: meta }));
    row.append(copy);
    const status = view.currentPeriod?.id === period.id && today
      ? "Sedang berlangsung"
      : view.nextPeriod?.id === period.id && today
        ? "Selanjutnya"
        : allWeek
          ? DAY_NAMES[period.day]
          : "";
    if (status) row.append(el("span", { className: `period-state${status === "Sedang berlangsung" ? " is-current" : status === "Selanjutnya" ? " is-next" : ""}`, text: status }));
    container.append(row);
  }
  return container;
}

function recordTitle(record, collection) {
  return record.title || record.name || record.caption || record.subject || categoryNames[collection] || "Data kelas";
}

function makeRecordCard(collection, record, { admin = false } = {}) {
  const ledger = ["homework", "outlines"].includes(collection) ? " ledger-row" : "";
  const classic = collection === "announcements" ? " classic-key-card" : "";
  const card = el("article", { className: `record-card${ledger}${classic}${record.status === "done" ? " is-done" : ""}${record.date && getDeadlineBadge(record.date, record.status) === "Terlambat" ? " is-expired" : ""}` });
  const top = el("div", { className: "record-top" });
  const title = el("div");
  title.append(el("h3", { text: recordTitle(record, collection) }));
  if (record.subject) title.append(el("p", { className: "record-subject", text: record.subject }));
  top.append(title);
  const badge = getDeadlineBadge(record.date, record.status);
  if (badge) top.append(el("span", { className: `status-badge stamp${badge === "Selesai" ? " is-current" : ""}`, text: badge }));
  card.append(top);
  if (record.description) card.append(el("p", { className: "record-description", text: record.description }));
  if (record.date) card.append(el("p", { className: "record-meta", text: `Tanggal: ${formatDate(record.date)}` }));
  if (record.author) card.append(el("p", { className: "record-meta", text: `Dibuat oleh ${record.author}` }));
  if (admin) {
    const actions = el("div", { className: "record-actions" });
    if (record.deletedAt) {
      actions.append(button("Pulihkan", "restore-record", { variant: "soft", attrs: { dataset: { collection, id: record.id } } }));
      if (collection === "gallery" && record.storagePath) {
        actions.append(button("Hapus permanen", "delete-record", { variant: "danger", attrs: { dataset: { collection, id: record.id, permanent: "true" } } }));
      }
    } else {
      actions.append(
        button("Ubah", "edit-record", { variant: "secondary", attrs: { dataset: { collection, id: record.id } } }),
        button("Hapus", "delete-record", { variant: "secondary", attrs: { dataset: { collection, id: record.id } } }),
      );
    }
    card.append(actions);
  }
  return card;
}

function renderHome() {
  const view = makeView("home");
  const classInfo = active("classInfo")[0] ?? { name: "Kelas", description: "Info kelas belum ditambahkan." };
  const weekday = currentDayNumber();
  const scheduleView = getScheduleView(new Date(), active("schedule"), activeSettingsPanel());
  const featuredDay = weekday === 5 && scheduleView.shownDay === 1 && scheduleView.mode === "single"
    ? "Senin depan"
    : DAY_NAMES[scheduleView.shownDay] ?? "";
  const homeHeading = heading("Papan kabar kelas", classInfo.name, classInfo.description);
  homeHeading.classList.add("home-hero", "classic-key-card");
  homeHeading.querySelector("h1").id = "heading-home";
  const homeCopy = homeHeading.firstElementChild;
  const homeClock = el("time", { className: "hero-date" });
  homeClock.append(
    el("span", { className: "hero-date-dot", attrs: { "aria-hidden": "true" } }),
    el("span", { className: "hero-date-label" }),
  );
  homeCopy.insertBefore(homeClock, homeHeading.querySelector(".classic-divider"));
  view.append(homeHeading);

  const scheduleSection = el("section", { className: "schedule-feature classic-key-card" });
  const header = cardHeader(
    "Lihat jadwal sepekan",
    scheduleView.mode === "full-week" ? "Semua hari ditampilkan." : `Jadwal ${featuredDay}.`,
    { classicDivider: true },
  );
  header.append(button("Semua jadwal", "show-full-schedule", { variant: "soft" }));
  scheduleSection.append(header);
  if (scheduleView.mode === "full-week") {
    scheduleSection.append(el("p", { className: "period-meta", text: scheduleView.pinnedDay === 1 ? "Senin ada di urutan pertama." : "Semua hari ditampilkan." }));
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      const periods = active("schedule").filter((period) => period.day === day).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.start.localeCompare(b.start));
      const section = el("section");
      section.append(el("h3", { text: DAY_NAMES[day] }));
      section.append(scheduleRows(periods, false, { allWeek: true }));
      scheduleSection.append(section);
    }
  } else {
    const shown = active("schedule").filter((period) => period.day === scheduleView.shownDay).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.start.localeCompare(b.start));
    scheduleSection.append(scheduleRows(shown, scheduleView.shownDay === weekday));
  }
  view.append(scheduleSection);

  const deadlines = [...active("homework"), ...active("exams")]
    .filter((record) => record.status !== "done" && typeof record.date === "string")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const deadlineSection = el("section", { className: "board-section ruled-list" });
  deadlineSection.append(cardHeader("PR dan ulangan terdekat", deadlines.length ? `${deadlines.length} yang perlu dicek` : "Belum ada tanggal dekat.", { classicDivider: true }));
  if (deadlines.length) deadlines.forEach((record) => {
    const collection = active("homework").some((item) => item.id === record.id) ? "homework" : "exams";
    deadlineSection.append(makeRecordCard(collection, record));
  });
  else deadlineSection.append(emptyState("Belum ada tenggat", "PR atau jadwal ulangan akan muncul di sini."));
  view.append(deadlineSection);

  const announcements = active("announcements").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 1);
  const noticeSection = el("section", { className: "board-section" });
  noticeSection.append(cardHeader("Pengumuman terbaru", announcements.length ? "Pesan dari Owner atau Guru." : "Belum ada kabar baru.", { classicDivider: true }));
  if (announcements.length) announcements.forEach((item) => noticeSection.append(makeRecordCard("announcements", item)));
  else noticeSection.append(emptyState("Belum ada pengumuman", "Kabar kelas akan muncul di sini."));
  view.append(noticeSection);
  return view;
}

function stopHeroClock() {
  clearTimeout(heroClockTimer);
  heroClockTimer = null;
  heroClockElement = null;
}

function refreshHeroClock() {
  if (!heroClockElement?.isConnected) {
    stopHeroClock();
    return;
  }
  if (document.hidden) {
    clearTimeout(heroClockTimer);
    heroClockTimer = null;
    return;
  }

  const { text, datetime } = formatLiveDateTime(new Date());
  $(".hero-date-label", heroClockElement).textContent = text;
  if (datetime) heroClockElement.dateTime = datetime;
  else heroClockElement.removeAttribute("datetime");

  clearTimeout(heroClockTimer);
  heroClockTimer = setTimeout(refreshHeroClock, 60_000 - (Date.now() % 60_000));
}

function setupHeroClockListeners() {
  if (heroClockListenersReady) return;
  heroClockListenersReady = true;
  document.addEventListener("visibilitychange", refreshHeroClock);
  window.addEventListener("focus", refreshHeroClock);
  window.addEventListener("pageshow", refreshHeroClock);
}

function startHeroClock(element) {
  stopHeroClock();
  heroClockElement = element;
  setupHeroClockListeners();
  refreshHeroClock();
}

function renderClass() {
  const view = makeView("class");
  view.append(heading("Papan kelas", "Info kelas", "Tugas, ulangan, dan kabar kelas ada di satu tempat."));
  const tabs = el("div", { className: "category-tabs", attrs: { role: "tablist", "aria-label": "Bagian informasi kelas" } });
  const categories = [...Object.entries(categoryNames), ...active("customSections").map((record) => [record.id, record.title])];
  if (!categories.some(([key]) => key === classCategory)) classCategory = "classInfo";
  for (const [key, label] of categories) {
    const tab = el("button", { className: "tab-button", text: label, attrs: { type: "button", role: "tab", "aria-selected": classCategory === key, "aria-current": classCategory === key ? "true" : null, dataset: { action: "class-category", category: key } } });
    tabs.append(tab);
  }
  view.append(tabs);
  const custom = active("customSections").find((record) => record.id === classCategory);
  if (custom) {
    view.append(el("article", { className: "card card-pad" }, [
      el("h2", { className: "section-title", text: custom.title }),
      el("p", { className: "record-description", text: custom.description || "Belum ada keterangan." }),
    ]));
    return view;
  }
  if (classCategory === "classInfo") {
    const info = active("classInfo")[0];
    const panel = el("article", { className: "card card-pad" });
    panel.append(cardHeader(info?.name ?? "Deskripsi kelas", info?.label ?? "Tentang teman-teman di kelas."));
    panel.append(el("p", { className: "record-description", text: info?.description ?? "Informasi kelas belum ditambahkan." }));
    if (dashboardUnlocked) panel.append(button(info ? "Ubah deskripsi" : "Tambah deskripsi", info ? "edit-record" : "create-record", {
      variant: "soft",
      attrs: { dataset: info ? { collection: "classInfo", id: info.id } : { collection: "classInfo" } },
    }));
    view.append(panel);
    return view;
  }
  const records = active(classCategory).sort(compareDateRecords);
  if (dashboardUnlocked) view.append(button(`Tambah ${categoryNames[classCategory] ?? "info"}`, "create-record", { attrs: { dataset: { collection: classCategory } } }));
  if (!records.length) view.append(emptyState("Belum ada info di sini", "Info baru akan muncul setelah Owner menambahkannya."));
  else records.forEach((record) => view.append(makeRecordCard(classCategory, record, { admin: dashboardUnlocked })));
  return view;
}

function renderSchedule() {
  const view = makeView("schedule");
  const schedule = active("schedule").sort((a, b) => a.day - b.day || (a.order ?? 999) - (b.order ?? 999) || a.start.localeCompare(b.start));
  const result = getScheduleView(new Date(), schedule, activeSettingsPanel());
  const shown = result.mode === "full-week" || showAllSchedule
    ? [1, 2, 3, 4, 5, 6, 7]
    : [result.shownDay];
  const showWholeWeek = result.mode === "full-week" || showAllSchedule;
  const shownDayLabel = currentDayNumber() === 5 && result.shownDay === 1 && result.mode === "single"
    ? "Senin depan"
    : DAY_NAMES[result.shownDay];
  view.append(heading("Waktu belajar", showWholeWeek ? "Jadwal sepekan" : `Jadwal ${shownDayLabel}`, `Jam ganti tampilan: ${activeSettingsPanel().switchTime}. Waktu mengikuti WIB.`));
  const buttonRow = el("div", { className: "action-row" });
  if (result.mode !== "full-week") buttonRow.append(button(showAllSchedule ? "Lihat hari terpilih" : "Lihat semua jadwal", "toggle-full-schedule", { variant: "soft" }));
  if (dashboardUnlocked) buttonRow.append(button("Tambah jam", "create-record", { attrs: { dataset: { collection: "schedule" } } }));
  view.append(buttonRow);
  let found = false;
  for (const day of shown) {
    const rows = schedule.filter((period) => period.day === day);
    if (rows.length) found = true;
    const section = el("section", { className: "schedule-feature classic-key-card" });
    const title = result.pinnedDay === day ? `${DAY_NAMES[day]} · awal minggu` : DAY_NAMES[day];
    section.append(cardHeader(title, rows.length ? `${rows.length} jam pelajaran` : "Belum ada jam pelajaran.", { classicDivider: true }));
    if (!rows.length) section.append(emptyState("Hari ini belum diatur", dashboardUnlocked ? "Kamu bisa menambahkan jam lewat Dashboard." : "Jadwal hari ini belum dibagikan."));
    else {
      section.append(scheduleRows(rows, day === currentDayNumber()));
      if (dashboardUnlocked) {
        const list = el("div", { className: "record-actions" });
        for (const period of rows) {
          list.append(
            button(`Ubah ${period.subject}`, "edit-record", { variant: "secondary", attrs: { dataset: { collection: "schedule", id: period.id } } }),
            button("Hapus", "delete-record", { variant: "secondary", attrs: { dataset: { collection: "schedule", id: period.id } } }),
          );
        }
        section.append(list);
      }
    }
    view.append(section);
  }
  if (!found && !schedule.length && result.mode === "full-week" && dashboardUnlocked) view.append(button("Pulihkan jadwal contoh", "restore-default-schedule", { variant: "soft" }));
  return view;
}

/* PROTECTED */
function renderGallery() {
  const view = makeView("gallery");
  view.append(heading("Cerita hari-hari kita", "Momen kelas", "Foto yang ditambahkan di sini hanya tersimpan di perangkat ini."));
  const allGallery = active("gallery").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const preferences = activeSettingsPanel();
  let selectedAlbum = preferences.galleryAlbum ?? "all";
  const query = preferences.galleryQuery ?? "";
  const galleryMode = preferences.galleryMode === "list" ? "list" : "disc";
  const albums = [...new Set(active("gallery").map((item) => item.album).filter(Boolean))];
  if (selectedAlbum !== "all" && !albums.includes(selectedAlbum)) selectedAlbum = "all";
  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
  const gallery = allGallery.filter((item) => {
    const matchesAlbum = selectedAlbum === "all" || item.album === selectedAlbum;
    const searchable = `${item.caption ?? ""} ${item.uploader ?? ""} ${item.album ?? ""} ${(item.tags ?? []).join(" ")} ${String(item.createdAt).slice(0, 7)}`.toLocaleLowerCase("id-ID");
    return matchesAlbum && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
  const toolbar = el("div", { className: "gallery-toolbar" });
  if (dashboardUnlocked) toolbar.append(button("Tambah foto", "upload-gallery"));
  const select = el("select", { className: "search-input", attrs: { "aria-label": "Filter album", dataset: { action: "filter-album" } } });
  select.append(el("option", { text: "Semua album", attrs: { value: "all" } }));
  albums.forEach((album) => select.append(el("option", { text: album, attrs: { value: album } })));
  select.value = selectedAlbum;
  toolbar.append(select);
  toolbar.append(el("input", { className: "search-input", attrs: { type: "search", placeholder: "Cari foto, tag, atau bulan", "aria-label": "Cari foto, tag, atau bulan", value: query, dataset: { action: "filter-gallery" } } }));
  const modeSwitch = el("div", { className: "gallery-mode-switch", attrs: { role: "group", "aria-label": "Tampilan galeri" } });
  for (const [mode, label] of [["disc", "Piringan"], ["list", "Daftar"]]) {
    modeSwitch.append(button(label, "gallery-mode", {
      variant: galleryMode === mode ? "soft" : "secondary",
      attrs: { dataset: { mode }, "aria-pressed": String(galleryMode === mode) },
    }));
  }
  toolbar.append(modeSwitch);
  view.append(toolbar);
  currentGallery = gallery;
  currentGalleryController = createMomentGallery(gallery, {
    likedIds: preferences.likedGalleryIds ?? [],
    dashboardUnlocked,
    mode: galleryMode,
    emptyMessage: allGallery.length ? "Tidak ada momen yang cocok dengan filter ini" : "Belum ada momen yang dibagikan",
    onOpen: openViewer,
  });
  view.append(currentGalleryController.element);
  if (dashboardUnlocked && deleted("gallery").length) {
    view.append(el("h2", { className: "section-title", text: "Foto yang dihapus" }));
    deleted("gallery").forEach((item) => view.append(makeRecordCard("gallery", item, { admin: true })));
  }
  return view;
}
/* END PROTECTED */

function currentDayNumber(date = new Date()) {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jakarta", weekday: "short" }).format(date);
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 })[short];
}

function renderMore() {
  const view = makeView("more");
  view.append(heading("Ruang untuk ikut mencoba", "Lainnya", "Pilih nama, kirim laporan, atau titipkan saran."));

  const wheelPanel = el("section", { className: "card card-pad" });
  wheelPanel.append(cardHeader("Roda nama", "Nama contoh belum tentu sama dengan daftar kelas."));
  const wheelArea = el("div", { className: "wheel-layout" });
  const frame = el("div", { className: "wheel-frame" });
  frame.append(el("span", { className: "wheel-pointer", attrs: { "aria-hidden": "true" } }));
  const disc = el("div", { className: "wheel-disc", attrs: { id: "wheel-disc", dataset: { rotation: "0" } } });
  disc.append(el("canvas", { attrs: { id: "wheel-canvas", "aria-label": "Roda pemilih nama", role: "img" } }));
  frame.append(disc);
  const students = active("students");
  const config = activeSettingsPanel();
  const eligible = config.excludePicked ? students.filter((student) => !(config.pickedStudentIds ?? []).includes(student.id)) : students;
  const wheelActions = el("div", { className: "action-row" });
  wheelActions.append(button("Putar roda", "spin-wheel", { disabled: eligible.length === 0 }));
  wheelActions.append(
    button(config.mutedWheel ? "Nyalakan bunyi" : "Matikan bunyi", "toggle-wheel-sound", { variant: "secondary" }),
    button(config.vibrationEnabled ? "Matikan getar" : "Nyalakan getar", "toggle-wheel-vibration", { variant: "secondary" }),
  );
  if (dashboardUnlocked) wheelActions.append(button("Atur nama", "manage-students", { variant: "secondary" }));
  const history = active("wheelHistory").slice(-3).reverse();
  wheelArea.append(frame, wheelActions);
  if (eligible.length === 0) wheelArea.append(emptyState("Belum ada nama yang bisa dipilih", students.length ? "Semua nama sudah terpilih. Atur ulang daftar pilihan di Dashboard." : "Owner bisa menambahkan nama lewat Dashboard."));
  if (history.length) {
    const recent = el("p", { className: "record-meta", text: `Terakhir terpilih: ${history.map((item) => item.name).join(", ")}` });
    wheelArea.append(recent);
  }
  wheelPanel.append(wheelArea);
  view.append(wheelPanel);

  const reportPanel = el("section", { className: "card card-pad" });
  reportPanel.append(cardHeader("Ada yang perlu diberi tahu?", "Tulis laporan, lalu buka pesan WhatsApp yang sudah disiapkan."));
  reportPanel.append(el("p", { className: "public-only-note", text: "Laporan dikirim ke kotak masuk website. Ini tidak berarti Owner atau Guru sudah membacanya. WhatsApp hanya membuka draf yang perlu kamu kirim sendiri." }));
  const reportFields = el("div", { className: "form-stack" });
  reportFields.append(field("reportName", "Nama", { required: true, placeholder: "Nama panggilan" }));
  reportFields.append(field("reportMessage", "Pesan", { type: "textarea", required: true }));
  reportFields.append(field("reportFiles", "Lampiran gambar (opsional)", { type: "file", multiple: true, help: "Maksimal 3 gambar. Lampiran diunduh terpisah untuk dikirim manual." }));
  const numberOk = isValidWhatsAppNumber(config.whatsappNumber);
  const reportButton = button("Kirim laporan", "submit-report");
  reportButton.setAttribute("aria-describedby", "whatsapp-help");
  reportFields.append(reportButton);
  reportFields.append(el("p", { className: "record-meta", attrs: { id: "whatsapp-help" }, text: numberOk ? "Laporan disimpan online; pesan WhatsApp tetap perlu dikirim manual." : "Nomor WhatsApp belum diatur Owner. Laporan tetap dapat dikirim ke kotak masuk tanpa tautan WhatsApp." }));
  reportPanel.append(reportFields);
  view.append(reportPanel);

  const suggestionPanel = el("section", { className: "card card-pad" });
  suggestionPanel.append(cardHeader("Punya usul untuk kelas?", "Saran masuk ke kotak saran website."));
  const suggestionForm = el("div", { className: "form-stack" });
  suggestionForm.append(field("suggestionTitle", "Judul saran", { required: true }));
  suggestionForm.append(field("suggestionName", "Nama (opsional)"));
  suggestionForm.append(field("suggestionMessage", "Ceritakan idemu", { type: "textarea", required: true }));
  suggestionForm.append(button("Simpan saran", "submit-suggestion"));
  suggestionForm.append(el("p", { className: "record-meta", text: "Saran dikirim online dan dapat dibaca Owner. Kamu bisa salin atau unduh setelah mengirim." }));
  suggestionPanel.append(suggestionForm);
  view.append(suggestionPanel);
  return view;
}

async function renderDashboard() {
  const view = makeView("dashboard");
  const header = heading("Panel Owner", "Dashboard", "Perubahan tersimpan online dan dapat dilihat pengunjung di perangkat lain.");
  header.append(button("Keluar Dashboard", "lock-dashboard", { variant: "secondary" }));
  view.append(header);
  const sectionList = [
    ["overview", "Ringkasan"],
    ["classInfo", "Info kelas"],
    ["schedule", "Jadwal"],
    ["wheel", "Roda nama"],
    ["gallery", "Galeri"],
    ["reports", "Laporan"],
    ["suggestions", "Saran"],
    ["activity", "Aktivitas"],
    ["settings", "Pengaturan"],
    ["backup", "Cadangan"],
  ];
  const tabs = el("div", { className: "dashboard-tabs", attrs: { role: "tablist", "aria-label": "Bagian Dashboard" } });
  for (const [key, title] of sectionList) {
    tabs.append(el("button", { className: "tab-button", text: title, attrs: { type: "button", role: "tab", "aria-selected": dashboardSection === key, "aria-current": dashboardSection === key ? "true" : null, dataset: { action: "dashboard-section", section: key } } }));
  }
  view.append(tabs);
  const panel = el("section", { className: "dashboard-panel", attrs: { "aria-live": "polite" } });
  await fillDashboardPanel(panel);
  view.append(panel);
  return view;
}

function dashboardAddButton(collection, label = "Tambah") {
  return button(label, "create-record", { attrs: { dataset: { collection } } });
}

function renderAdminList(name, { includeDeleted = true } = {}) {
  const items = includeDeleted ? data[name] : active(name);
  const list = el("div", { className: "admin-list" });
  const available = items.filter((record) => !record.deletedAt);
  if (!available.length) list.append(emptyState("Belum ada data", "Tambahkan data pertama lewat tombol di bawah."));
  for (const item of items) {
    const card = makeRecordCard(name, item, { admin: true });
    list.append(card);
  }
  return list;
}

async function fillDashboardPanel(panel) {
  panel.replaceChildren();
  if (dashboardSection === "overview") {
    let reportCount = 0;
    let suggestionCount = 0;
    try {
      [reportCount, suggestionCount] = await Promise.all([
        getOwnerInbox("reports").then((items) => items.length),
        getOwnerInbox("suggestions").then((items) => items.length),
      ]);
    } catch (error) {
      panel.append(el("p", { className: "error-message", text: `Ringkasan kotak masuk gagal dimuat: ${error.message}` }));
    }
    const counts = [
      ["homework", "Tugas"],
      ["exams", "Ulangan"],
      ["schedule", "Jam jadwal"],
      ["gallery", "Momen bersama"],
      ["reports", "Laporan masuk"],
      ["suggestions", "Saran masuk"],
      ["students", "Nama roda"],
      ["announcements", "Pengumuman"],
    ];
    const grid = el("div", { className: "dashboard-overview" });
    for (const [key, label] of counts) {
      const count = key === "reports" ? reportCount : key === "suggestions" ? suggestionCount : active(key).length;
      grid.append(el("div", { className: "stat-card" }, [
        el("strong", { text: String(count) }),
        el("span", { text: label }),
      ]));
    }
    panel.append(grid);
    const meta = getStorageMeta();
    panel.append(el("p", { className: "record-meta", text: `Sumber data: ${meta?.source ?? sourceLabel()}. Koleksi yang sudah tersambung dimuat dari Supabase. Data lama di browser tidak dipindahkan otomatis.` }));
    panel.append(button("Kelola info kelas", "dashboard-section", { variant: "soft", attrs: { dataset: { section: "classInfo" } } }));
    return;
  }
  if (dashboardSection === "classInfo") {
    panel.append(cardHeader("Informasi kelas dan konten", "Ubah, pulihkan, atau tambahkan bagian kelas."));
    panel.append(dashboardAddButton("classInfo", "Tambah deskripsi kelas"));
    if (active("classInfo").length) panel.append(renderAdminList("classInfo", { includeDeleted: false }));
    else panel.append(emptyState("Deskripsi belum tersedia", "Tambahkan keterangan kelas."));
    for (const name of ["homework", "exams", "outlines", "announcements", "customSections"]) {
      const group = el("section");
      group.append(cardHeader(categoryNames[name] ?? "Bagian khusus", `${active(name).length} item`));
      group.append(dashboardAddButton(name, `Tambah ${categoryNames[name] ?? "bagian khusus"}`));
      group.append(renderAdminList(name));
      panel.append(group);
    }
    return;
  }
  if (dashboardSection === "schedule") {
    panel.append(cardHeader("Atur jam pelajaran", "Pilih jadwal berdasarkan hari. Urutan mengikuti jam mulai."));
    panel.append(dashboardAddButton("schedule", "Tambah jam pelajaran"));
    const list = el("div", { className: "admin-list" });
    const records = [...data.schedule].sort((a, b) => a.day - b.day || (a.order ?? 999) - (b.order ?? 999) || a.start.localeCompare(b.start));
    if (!records.length) list.append(emptyState("Jadwal belum diatur", "Tambahkan jam pelajaran atau pulihkan jadwal contoh."));
    records.forEach((record) => {
      const card = makeRecordCard("schedule", record, { admin: true });
      if (!record.deletedAt) {
        const actions = el("div", { className: "record-actions" });
        const sameDay = records.filter((item) => item.day === record.day && !item.deletedAt);
        const index = sameDay.findIndex((item) => item.id === record.id);
        actions.append(
          button("Naik", "reorder-record", { variant: "secondary", disabled: index === 0, attrs: { dataset: { id: record.id, direction: "-1" } } }),
          button("Turun", "reorder-record", { variant: "secondary", disabled: index === sameDay.length - 1, attrs: { dataset: { id: record.id, direction: "1" } } }),
        );
        card.append(actions);
      }
      list.append(card);
    });
    panel.append(list);
    panel.append(dashboardAddButton("settings", "Atur jam ganti"));
    panel.append(button("Pulihkan jadwal contoh", "restore-default-schedule", { variant: "secondary" }));
    return;
  }
  if (dashboardSection === "wheel") {
    panel.append(cardHeader("Nama peserta", "Nama contoh harus diganti dengan daftar yang benar."));
    panel.append(dashboardAddButton("students", "Tambah nama"));
    panel.append(
      button("Atur ulang yang sudah terpilih", "reset-picked", { variant: "secondary" }),
      button("Hapus riwayat pilihan", "clear-wheel-history", { variant: "secondary" }),
      button("Pulihkan nama contoh", "restore-demo-students", { variant: "secondary" }),
    );
    panel.append(renderAdminList("students"));
    if (data.wheelHistory.length) {
      const history = el("div", { className: "admin-list" });
      [...data.wheelHistory].reverse().forEach((item) => {
        history.append(el("p", { className: "record-meta", text: `${item.name} · ${formatDateTime(item.pickedAt ?? item.createdAt)}` }));
      });
      panel.append(history);
    }
    const checkbox = field("excludePickedDashboard", "Jangan pilih yang sudah terpilih", { type: "checkbox", value: activeSettingsPanel().excludePicked });
    const save = button("Simpan pilihan", "save-wheel-setting", { variant: "soft" });
    panel.append(el("div", { className: "form-stack" }, [checkbox, save]));
    return;
  }
  if (dashboardSection === "gallery") {
    panel.append(cardHeader("Kelola Momen Kelas", "Foto dan keterangan disimpan online untuk semua pengunjung."));
    panel.append(button("Tambah foto", "upload-gallery"));
    panel.append(renderAdminList("gallery"));
    const storageNote = el("p", { className: "record-meta" });
    panel.append(storageNote);
    try {
      const usage = await getGalleryStorageUsage();
      const warningThreshold = 800_000_000;
      storageNote.textContent = `Perkiraan galeri: ${usage.files} file · ${(usage.bytes / 1024 / 1024).toFixed(1)} MB. Periksa pemakaian dan kuota terbaru di Dashboard Supabase.`;
      if (usage.bytes >= warningThreshold) {
        storageNote.textContent += " Galeri mendekati ambang pengingat 800 MB; ini bukan kuota resmi.";
        storageNote.className = "warning-message";
      }
    } catch (error) {
      storageNote.textContent = `Ukuran galeri online belum dapat diperiksa: ${error.message}`;
    }
    return;
  }
  if (dashboardSection === "reports" || dashboardSection === "suggestions") {
    const name = dashboardSection;
    panel.append(cardHeader(name === "reports" ? "Laporan masuk" : "Kotak saran", "Kiriman tersimpan online. Ini tidak berarti Guru sudah membacanya."));
    const list = el("div", { className: "admin-list" });
    let items;
    try {
      items = await getOwnerInbox(name);
      data[name] = items;
    } catch (error) {
      list.append(el("p", { className: "error-message", text: `Kotak masuk gagal dimuat: ${error.message}` }));
      panel.append(list);
      return;
    }
    if (!items.length) list.append(emptyState(name === "reports" ? "Belum ada laporan" : "Belum ada saran", "Kiriman baru akan muncul di sini setelah tersimpan online."));
    items.forEach((item) => {
      const card = el("article", { className: "record-card" });
      card.append(el("h3", { text: item.title || item.name || "Tanpa judul" }));
      card.append(el("p", { className: "record-description", text: item.message || "" }));
      card.append(el("p", { className: "record-meta", text: `${item.status || (item.read ? "Dibaca" : "Belum dibaca")} · ${formatDateTime(item.createdAt)}` }));
      if (item.note) card.append(el("p", { className: "record-meta", text: `Catatan: ${item.note}` }));
      const actions = el("div", { className: "record-actions" });
      if (name === "suggestions") actions.append(
        button(item.read ? "Tandai belum dibaca" : "Tandai dibaca", "toggle-read", { variant: "secondary", attrs: { dataset: { collection: name, id: item.id } } }),
        button(item.archived ? "Pulihkan" : "Arsipkan", "toggle-archive", { variant: "secondary", attrs: { dataset: { collection: name, id: item.id } } }),
        button("Catatan balasan", "reply-note", { variant: "secondary", attrs: { dataset: { id: item.id } } }),
      );
      if (name === "reports") {
        for (const path of item.attachment_paths ?? item.attachmentPaths ?? []) {
          actions.append(button("Buka lampiran", "open-report-attachment", { variant: "secondary", attrs: { dataset: { path } } }));
        }
      }
      actions.append(button("Hapus", "delete-record", { variant: "secondary", attrs: { dataset: { collection: name, id: item.id, permanent: "true" } } }));
      card.append(actions);
      if (item.replyNote) card.append(el("p", { className: "record-meta", text: `Catatan Owner: ${item.replyNote}` }));
      list.append(card);
    });
    panel.append(list);
    return;
  }
  if (dashboardSection === "activity") {
    panel.append(cardHeader("Aktivitas perangkat ini", "Catatan lokal dan tidak tahan manipulasi."));
    const list = el("div", { className: "activity-list" });
    try {
      const entries = await getActivityLog();
      if (!entries.length) list.append(emptyState("Belum ada aktivitas", "Perubahan yang didukung akan muncul di sini."));
      entries.forEach((entry) => {
        const row = el("div", { className: "activity-row" });
        row.append(el("strong", { text: entry.description }), el("p", { className: "record-meta", text: formatDateTime(entry.at) }));
        list.append(row);
      });
    } catch (error) {
      list.append(el("p", { className: "error-message", text: `Catatan aktivitas gagal dibaca: ${error.message}` }));
    }
    panel.append(list);
    return;
  }
  if (dashboardSection === "settings") {
    panel.append(cardHeader("Pengaturan situs", "Atur jadwal, WhatsApp, tema, dan batas lokal."));
    panel.append(button("Ubah pengaturan situs", "edit-record", { attrs: { dataset: { collection: "settings", id: active("settings")[0]?.id ?? "" } } }));
    panel.append(button("Ubah tampilan", "edit-record", { variant: "secondary", attrs: { dataset: { collection: "theme", id: currentMetaRecord("theme").id } } }));
    panel.append(el("p", { className: "record-meta", text: `Nomor WhatsApp: ${settings().whatsappNumber ? "sudah diatur" : "belum diatur"}. Pengaturan situs disimpan online; preferensi pribadi tetap di perangkat ini.` }));
    return;
  }
  if (dashboardSection === "backup") {
    panel.append(cardHeader("Cadangan dan pemulihan", "Ekspor dulu sebelum memindahkan atau mengganti perangkat."));
    panel.append(button("Unduh cadangan JSON", "export-backup"));
    panel.append(button("Impor cadangan JSON", "import-backup", { variant: "secondary" }));
    panel.append(el("p", { className: "record-meta", text: "Cadangan menyertakan gambar, jadi ukuran berkas bisa besar. Impor divalidasi sebelum perubahan disimpan." }));
    panel.append(el("div", { className: "settings-list" }, [
      button("Reset data demo", "reset-data", { variant: "secondary", attrs: { dataset: { kind: "demo" } } }),
      button("Hapus semua data aplikasi", "reset-data", { variant: "danger", attrs: { dataset: { kind: "all" } } }),
      button("Pulihkan data publikasi", "reset-data", { variant: "secondary", attrs: { dataset: { kind: "published" } } }),
    ]));
  }
}

async function renderCurrent() {
  stopHeroClock();
  currentGalleryController?.destroy();
  currentGalleryController = null;
  dashboardUnlocked = isUnlocked();
  if (currentView === "dashboard" && !dashboardUnlocked) currentView = "home";
  renderNav();
  setSourceLabel();
  setTheme();
  let view;
  if (currentView === "home") view = renderHome();
  else if (currentView === "class") view = renderClass();
  else if (currentView === "schedule") view = renderSchedule();
  else if (currentView === "gallery") view = await renderGallery();
  else if (currentView === "more") view = renderMore();
  else view = await renderDashboard();
  const firstHeading = $("h1", view);
  if (firstHeading && !firstHeading.id) firstHeading.id = `heading-${currentView}`;
  root.replaceChildren(view);
  if (currentView === "home") startHeroClock($(".hero-date", view));
  root.hidden = false;
  $("#loading-view").hidden = true;
  renderNav();
  if (currentView === "more") {
    const canvas = $("#wheel-canvas", root);
    if (canvas) drawWheel(canvas, active("students").map((student) => student.name));
  }
}

function activeRecord(collection, id) {
  return data[collection]?.find((record) => record.id === id);
}

async function showEditor(collection, id = null) {
  if (!dashboardUnlocked) throw new Error("Buka Dashboard dulu untuk mengubah data.");
  if (!formFields[collection]) throw new Error("Form untuk data ini belum tersedia.");
  const old = id ? activeRecord(collection, id) : null;
  if (id && !old) throw new Error("Data yang ingin diubah tidak ditemukan.");
  const initial = old ? { ...old } : collection === "settings" ? activeSettingsPanel() : collection === "theme" ? themeRecord() : {};
  if (collection === "settings") initial.galleryMaxMb = Math.round((initial.galleryMaxBytes ?? 5 * 1024 * 1024) / 1024 / 1024);
  showForm(`${old ? "Ubah" : "Tambah"} ${collection === "schedule" ? "jam pelajaran" : collection === "students" ? "nama" : categoryNames[collection] ?? collection}`, formFields[collection], initial, async (values) => {
    if (collection === "classInfo" && !old && active("classInfo").length) throw new Error("Deskripsi kelas sudah ada. Ubah deskripsi yang tersedia.");
    if (collection === "settings") values.pickedStudentIds = initial.pickedStudentIds ?? [];
    if (collection === "theme") values.accent = initial.accent ?? "blue";
    const record = makeRecordFromForm(collection, values, old);
    if (collection === "customSections" && active("customSections").some((item) => item.id !== old?.id && item.title.trim().toLowerCase() === record.title.trim().toLowerCase())) {
      throw new Error("Nama bagian itu sudah dipakai.");
    }
    if (collection === "gallery") {
      const files = Array.from(values.files ?? []);
      if (!old && !files.length) throw new Error("Pilih setidaknya satu gambar.");
      if (old && files.length > 1) throw new Error("Saat mengubah foto, pilih maksimal satu gambar pengganti.");
      if (old && !files.length) {
        const saved = await saveRecord("gallery", record);
        data.gallery = saved;
        await logActivity("Owner mengubah keterangan foto Momen Kelas", "ubah", record.id);
        setSourceLabel();
        await renderCurrent();
        showToast("Keterangan foto tersimpan.");
        return;
      }
      const progressWrap = el("div");
      const progress = el("progress", { attrs: { max: 100, value: 0, class: "image-progress" } });
      const status = el("p", { className: "record-meta", text: "Memeriksa gambar…" });
      progressWrap.append(progress, status);
      dialogContent.append(progressWrap);
      let saved = 0;
      let failure = null;
      for (const file of files) {
        try {
          progress.value = 0;
          const image = await processGalleryImage(file, {
            maxBytes: activeSettingsPanel().galleryMaxBytes,
            saveLocal: false,
            onProgress: (value) => { progress.value = value; status.textContent = `Memeriksa dan menyimpan ${file.name} (${value}%)`; },
          });
          const extension = image.blob.type === "image/webp" ? "webp" : "jpg";
          const storagePath = `${crypto.randomUUID()}.${extension}`;
          await uploadSharedObject("gallery", storagePath, image.blob);
          const item = old
            ? { ...record, storagePath, blobId: null, width: image.width, height: image.height, originalName: image.originalName, tags: record.tags, updatedAt: timestamp() }
            : createRecord({
              caption: record.caption,
              uploader: record.uploader || "Teman kelas",
              album: record.album || "",
              tags: record.tags,
              storagePath,
              width: image.width,
              height: image.height,
              originalName: image.originalName,
            });
          data.gallery = await saveRecord("gallery", item);
          saved += 1;
          await logActivity(`Owner ${old ? "mengganti foto" : "menambahkan foto"} di Momen Kelas`, old ? "ubah" : "tambah", item.id);
        } catch (error) {
          failure = error;
          break;
        }
      }
      setSourceLabel();
      await renderCurrent();
      if (failure) {
        const detail = `${failure.message} Gambar yang telah terunggah tidak dihapus otomatis.`;
        if (saved) showToast(`${saved} gambar sudah tersimpan. Foto berikutnya gagal: ${detail}`);
        else throw new Error(detail, { cause: failure });
      } else {
        showToast(old ? "Foto berhasil diperbarui dan dibagikan." : `${saved} gambar tersimpan online.`);
      }
      return;
    }
    const saveResult = await persistWithConflictResolution(() => saveRecord(collection, record), record);
    if (saveResult.latest) {
      await renderCurrent();
      await showEditor(collection, id ?? record.id);
      return "reopen-form";
    }
    const saved = saveResult.value;
    data[collection] = saved;
    await logActivity(`Owner ${old ? "mengubah" : "menambahkan"} ${recordTitle(record, collection)}`, old ? "ubah" : "tambah", record.id);
    if (collection === "theme") setTheme();
    setSourceLabel();
    await renderCurrent();
    showToast("Perubahan berhasil disimpan.");
  }, { submitLabel: old ? "Simpan perubahan" : "Tambah" });
}

async function deleteItem(collection, id, permanent = false) {
  if (!dashboardUnlocked) throw new Error("Buka Dashboard dulu.");
  if (collection === "reports" || collection === "suggestions") {
    const inboxItem = data[collection].find((item) => item.id === id);
    if (!inboxItem) throw new Error("Kiriman kotak masuk tidak ditemukan.");
    if (!await showConfirm("Hapus kiriman?", "Kiriman ini akan dihapus permanen dari server.", "Hapus")) return;
    await deleteOwnerInbox(collection, id, { confirmed: true });
    await logActivity(`Owner menghapus ${collection === "reports" ? "laporan" : "saran"}`, "hapus", id);
    await renderCurrent();
    showToast("Kiriman dihapus.");
    return;
  }
  const record = activeRecord(collection, id);
  if (!record) throw new Error("Data tidak ditemukan.");
  const label = recordTitle(record, collection);
  const ok = await showConfirm("Hapus data?", permanent
    ? `Data “${label}” akan dihapus permanen setelah server mengonfirmasi.`
    : `“${label}” akan disembunyikan. Kamu masih bisa memulihkannya di Dashboard.`,
  "Hapus");
  if (!ok) return;
  const result = await persistWithConflictResolution(
    () => permanent
      ? hardDeleteRecord(collection, id, { confirmed: true })
      : softDeleteRecord(collection, id),
    record,
  );
  if (result.latest) {
    await renderCurrent();
    return;
  }
  data[collection] = result.value;
  if (permanent && collection === "gallery" && record.storagePath) {
    try {
      await deleteSharedGalleryImage(record.storagePath, { confirmed: true });
    } catch (error) {
      await renderCurrent();
      showToast(`Catatan foto sudah dihapus, tetapi file ${record.storagePath} masih tersimpan. Hapus manual dari Supabase Storage: ${error.message}`);
      return;
    }
  }
  await logActivity(`Owner menghapus ${label}`, "hapus", id);
  await renderCurrent();
  showToast("Data dihapus dari tampilan.");
}

async function restoreItem(collection, id) {
  if (!dashboardUnlocked) throw new Error("Buka Dashboard dulu.");
  const record = activeRecord(collection, id);
  if (!record) throw new Error("Data yang ingin dipulihkan tidak ditemukan.");
  const result = await persistWithConflictResolution(() => restoreRecord(collection, id), record);
  if (result.latest) {
    await renderCurrent();
    return;
  }
  data[collection] = result.value;
  await logActivity(`Owner memulihkan ${recordTitle(activeRecord(collection, id), collection)}`, "pulihkan", id);
  await renderCurrent();
  showToast("Data dipulihkan.");
}

async function downloadExport() {
  const packageData = await exportPackage();
  const content = JSON.stringify(packageData, null, 2);
  if (content.length > 10 * 1024 * 1024) {
    const proceed = await showConfirm("Cadangan berukuran besar", `Berkas sekitar ${(content.length / 1024 / 1024).toFixed(1)} MB karena gambar ikut disertakan. Tetap unduh?`, "Unduh");
    if (!proceed) return;
  }
  downloadText(`cadangan-ruang-kelas-${localToday()}.json`, content);
  showToast("Cadangan berhasil disiapkan.");
}

function askImportFile() {
  const input = el("input", { attrs: { type: "file", accept: "application/json,.json", hidden: true } });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const parsed = parseImportText(await file.text());
      const preview = previewImport(parsed);
      const summary = Object.entries(preview.counts).filter(([, count]) => count).map(([name, count]) => `${name}: ${count}`).join("\n");
      const overwriteCount = Object.values(preview.overwritten).reduce((sum, count) => sum + count, 0);
      const accepted = await showConfirm("Periksa cadangan", `Data akan diganti semua. Data ditemukan:\n${summary || "Belum ada data"}\nCatatan dengan ID yang sama: ${overwriteCount}\nGambar: ${preview.blobCount}\nLanjutkan impor?`, "Impor data");
      if (!accepted) return;
      data = await commitImport(preview);
      await logActivity("Owner mengimpor cadangan data", "impor");
      setSourceLabel();
      await renderCurrent();
      showToast("Cadangan berhasil dipulihkan.");
    } catch (error) {
      showMessage("Impor tidak berhasil", error.message);
    }
  }, { once: true });
  document.body.append(input);
  input.click();
}

async function handleReset(kind) {
  const labels = {
    demo: ["Reset data demo", "Data lokal akan diganti dengan contoh dari file publikasi. Gambar tidak ikut dihapus."],
    all: ["Hapus semua data aplikasi", "Semua data dan gambar lokal di browser ini akan dihapus. Tindakan ini tidak bisa dibatalkan."],
    published: ["Pulihkan data publikasi", "Data kelas akan diganti dengan versi yang saat ini diterbitkan. Gambar lokal yang tidak terkait tidak akan dihapus."],
  };
  const [title, message] = labels[kind] ?? [];
  if (!title) throw new Error("Pilihan reset tidak dikenal.");
  if (!await showConfirm(title, message, "Lanjutkan")) return;
  const result = await resetData(kind);
  data = result.collections;
  setSourceLabel();
  await renderCurrent();
  showToast(`${title} selesai.`);
}

async function resolveConflict(conflict) {
  const content = el("div");
  content.append(el("p", { text: `Data publikasi versi ${conflict.publishedVersion} sudah tersedia. Data lokalmu berbeda, jadi belum ada yang diganti.` }));
  content.append(el("p", { className: "warning-message", text: "Pilih cara melanjutkan. Perubahan lokal tidak akan ditimpa tanpa pilihanmu." }));
  const latest = button("Pakai data terbaru", "conflict-published", { variant: "danger" });
  const keep = button("Tetap pakai data lokal", "conflict-keep", { variant: "secondary" });
  const merge = button("Gabung", "conflict-merge", { variant: "soft" });
  showModal("Pembaruan data tersedia", [content], [latest, keep, merge], "Published");
  const choice = await new Promise((resolve) => {
    latest.addEventListener("click", () => { closeModal("published"); resolve("published"); }, { once: true });
    keep.addEventListener("click", () => { closeModal("keep"); resolve("keep"); }, { once: true });
    merge.addEventListener("click", () => { closeModal("merge"); resolve("merge"); }, { once: true });
    dialog.addEventListener("cancel", () => resolve(null), { once: true });
  });
  if (!choice) return;
  if (choice === "published") {
    const backup = await exportPackage();
    downloadText(`cadangan-sebelum-pembaruan-${localToday()}.json`, JSON.stringify(backup, null, 2));
  }
  const result = await resolvePublishedConflict(choice);
  data = result.collections;
  setSourceLabel();
  await renderCurrent();
  showToast("Pilihan data berhasil disimpan.");
}

/* PROTECTED */
async function uploadGallery() {
  await showEditor("gallery");
}

async function openViewer(id) {
  viewerIndex = currentGallery.findIndex((item) => item.id === id);
  if (viewerIndex < 0) return;
  await updateViewer();
  $("#viewer-dialog").showModal();
}

async function updateViewer() {
  const item = currentGallery[viewerIndex];
  if (!item) return;
  try {
    const image = $("#viewer-image");
    if (image.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl);
    const url = item.storagePath ? getSharedImageUrl(item.storagePath) : null;
    if (!url && item.blobId) {
      const blob = await getBlob(item.blobId);
      if (!blob) throw new Error("Gambar tidak ditemukan.");
      const localUrl = URL.createObjectURL(blob);
      image.dataset.objectUrl = localUrl;
      image.src = localUrl;
    } else if (url) {
      delete image.dataset.objectUrl;
      image.src = url;
    } else throw new Error("Alamat gambar tidak tersedia.");
    image.alt = item.caption || "Momen kelas";
    $("#viewer-caption").textContent = `${item.caption || "Momen kelas"} · ${item.uploader || "Teman kelas"}`;
  } catch (error) {
    showToast(error.message);
  }
}

async function toggleLike(id) {
  const config = activeSettingsPanel();
  const liked = new Set(config.likedGalleryIds ?? []);
  if (liked.has(id)) liked.delete(id);
  else liked.add(id);
  const next = { ...config, likedGalleryIds: [...liked], updatedAt: timestamp() };
  data.settings = await saveLocalRecord("settings", next);
  await renderCurrent();
}
/* END PROTECTED */

function eligibleStudents() {
  const students = active("students");
  const config = activeSettingsPanel();
  return config.excludePicked
    ? students.filter((student) => !(config.pickedStudentIds ?? []).includes(student.id))
    : students;
}

async function spin() {
  const students = eligibleStudents();
  if (!students.length) {
    showToast("Belum ada nama yang bisa dipilih.");
    return;
  }
  const index = chooseWinnerIndex(students.length);
  const winner = students[index];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const disc = $("#wheel-disc");
  const canvas = $("#wheel-canvas");
  if (!disc || !canvas) return;
  let audioContext = null;
  let tickTimer = 0;
  const config = activeSettingsPanel();
  if (!reduced && !config.mutedWheel) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Audio Web tidak didukung browser ini.");
      audioContext = new AudioContextClass();
      await audioContext.resume();
      tickTimer = window.setInterval(() => {
        playWheelTick(audioContext);
        if (config.vibrationEnabled && navigator.vibrate) navigator.vibrate(12);
      }, 120);
    } catch (error) {
      showToast(`Suara roda tidak tersedia: ${error.message}`);
    }
  }
  const showWinner = async () => {
    if (tickTimer) clearInterval(tickTimer);
    if (audioContext?.state !== "closed") await audioContext?.close();
    const history = createRecord({ name: winner.name, studentId: winner.id, pickedAt: timestamp() });
    data.wheelHistory = await saveRecord("wheelHistory", history);
    const config = activeSettingsPanel();
    if (config.excludePicked) {
      config.pickedStudentIds = [...new Set([...(config.pickedStudentIds ?? []), winner.id])];
      data.settings = await saveLocalRecord("settings", { ...config, updatedAt: timestamp() });
    }
    await logActivity(`Roda nama memilih ${winner.name}`, "pilih", winner.id);
    const winnerCard = el("div", { className: "winner-banner" }, [
      el("span", { className: "eyebrow gold", text: "Nama yang terpilih" }),
      el("strong", { text: winner.name }),
    ]);
    showModal("Selamat!", [winnerCard], [button("Tutup", "dialog-close", { variant: "secondary" })]);
    celebrateWinner(winnerCard);
  };
  animateWheel(disc, canvas, students.map((student) => student.name), index, reduced, () => { void showWinner(); });
}

async function submitReport() {
  const form = $(".form-stack", root);
  const nameInput = $('[name="reportName"]', form);
  const messageInput = $('[name="reportMessage"]', form);
  const fileInput = $('[name="reportFiles"]', form);
  if (!nameInput.value.trim() || !messageInput.value.trim()) throw new Error("Nama dan pesan laporan wajib diisi.");
  const config = activeSettingsPanel();
  const last = Number(config.lastReportAt || 0);
  const wait = Number(config.reportCooldownSeconds ?? 60) * 1000 - (Date.now() - last);
  if (wait > 0) throw new Error(`Tunggu ${Math.ceil(wait / 1000)} detik sebelum menyiapkan laporan berikutnya.`);
  const files = Array.from(fileInput.files ?? []);
  if (files.length > 3) throw new Error("Lampiran laporan maksimal 3 gambar.");
  const attachmentIds = [];
  const attachmentPaths = [];
  let report;
  try {
    for (const file of files) {
      const image = await processGalleryImage(file, { maxBytes: 3 * 1024 * 1024 });
      attachmentIds.push(image.id);
      const extension = image.blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${crypto.randomUUID()}.${extension}`;
      attachmentPaths.push(await uploadSharedObject("report-attachments", path, image.blob));
    }
    const submitted = await submitSharedReport({
      name: nameInput.value.trim(),
      message: messageInput.value.trim(),
      attachmentPaths,
    });
    report = { ...submitted, attachmentIds, attachmentPaths };
  } catch (error) {
    await Promise.all(attachmentIds.map((id) => deleteBlob(id)));
    const retained = attachmentPaths.length
      ? " Sebagian lampiran mungkin sudah terunggah; tidak ada file yang dihapus otomatis."
      : "";
    throw new Error(`${error.message}${retained}`, { cause: error });
  }
  try {
    data.settings = await saveLocalRecord("settings", { ...config, lastReportAt: Date.now(), updatedAt: timestamp() });
  } catch (error) {
    showToast(`Laporan sudah tersimpan online, tetapi pengingat jeda lokal gagal disimpan: ${error.message}`);
  }
  lastReport = report;
  await renderCurrent();
  showReportReady(report);
}

function showReportReady(report) {
  const content = el("div", { className: "form-stack" });
  content.append(el("p", { className: "public-only-note", text: "Laporan sudah dikirim ke kotak masuk website. Ini tidak berarti Owner atau Guru sudah membacanya. WhatsApp hanya membuka draf yang perlu kamu kirim sendiri." }));
  if (report.attachmentIds.length) content.append(el("p", { className: "warning-message", text: "Lampiran gambar akan diunduh; silakan kirim manual di WhatsApp." }));
  const actions = [];
  const message = formatReportMessage({ name: report.name, message: report.message, timestamp: formatDateTime(report.createdAt) });
  const open = button("Buka WhatsApp", "open-report-whatsapp", {
    disabled: !isValidWhatsAppNumber(activeSettingsPanel().whatsappNumber),
    attrs: { dataset: { id: report.id } },
  });
  if (!isValidWhatsAppNumber(activeSettingsPanel().whatsappNumber)) {
    content.append(el("p", { className: "record-meta", text: "Nomor WhatsApp belum diatur Owner. Laporan tetap tersimpan online." }));
  }
  actions.push(open, button("Tutup", "dialog-close", { variant: "secondary" }));
  showModal("Laporan tersimpan", [content], actions, "Online");
  for (const id of report.attachmentIds) {
    const download = button("Unduh lampiran", "download-attachment", { variant: "soft", attrs: { dataset: { id } } });
    dialogContent.append(download);
  }
  lastReport = { ...report, formattedMessage: message };
}

async function openReportWhatsApp(id) {
  const report = data.reports.find((item) => item.id === id) ?? (lastReport?.id === id ? lastReport : null);
  if (!report) throw new Error("Laporan tidak ditemukan.");
  const config = activeSettingsPanel();
  const message = formatReportMessage({ name: report.name, message: report.message, timestamp: formatDateTime(report.createdAt) });
  const url = createWhatsAppUrl(config.whatsappNumber, message);
  const link = el("a", { attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } });
  document.body.append(link);
  link.click();
  link.remove();
  showToast("WhatsApp dibuka. Pesan belum terkirim sampai kamu menekan Kirim.");
  closeModal();
  await renderCurrent();
}

async function downloadAttachment(id) {
  const blob = await getBlob(id);
  if (!blob) throw new Error("Lampiran tidak ditemukan di browser ini.");
  const url = URL.createObjectURL(blob);
  const link = el("a", { attrs: { href: url, download: `lampiran-laporan-${id}.jpg` } });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function submitSuggestion() {
  const title = $('[name="suggestionTitle"]', root).value.trim();
  const name = $('[name="suggestionName"]', root).value.trim();
  const message = $('[name="suggestionMessage"]', root).value.trim();
  if (!title || !message) throw new Error("Judul dan isi saran wajib diisi.");
  const record = await submitSharedSuggestion({ title, name, message });
  data.suggestions = [...data.suggestions.filter((item) => item.id !== record.id), record];
  await renderCurrent();
  showSuggestionReady(record);
}

function showSuggestionReady(record) {
  const content = el("div", { className: "form-stack" });
  content.append(el("p", { className: "public-only-note", text: "Saran sudah masuk ke kotak saran website. Ini tidak berarti Owner atau Guru sudah membacanya." }));
  const actions = [
    button("Salin teks", "copy-suggestion", { variant: "soft", attrs: { dataset: { id: record.id } } }),
    button("Unduh .txt", "download-suggestion", { variant: "secondary", attrs: { dataset: { id: record.id, type: "txt" } } }),
    button("Unduh .json", "download-suggestion", { variant: "secondary", attrs: { dataset: { id: record.id, type: "json" } } }),
  ];
  const config = activeSettingsPanel();
  if (isValidWhatsAppNumber(config.whatsappNumber)) actions.push(button("Buka WhatsApp", "suggestion-whatsapp", { attrs: { dataset: { id: record.id } } }));
  actions.push(button("Tutup", "dialog-close", { variant: "secondary" }));
  showModal("Saran tersimpan", [content], actions, "Online");
}

function suggestionById(id) {
  const record = data.suggestions.find((item) => item.id === id);
  if (!record) throw new Error("Saran tidak ditemukan.");
  return record;
}

async function copySuggestion(id) {
  const record = suggestionById(id);
  const text = createSuggestionText(record);
  if (!navigator.clipboard?.writeText) throw new Error("Fitur salin tidak tersedia. Gunakan tombol unduh teks.");
  await navigator.clipboard.writeText(text);
  showToast("Teks saran disalin.");
}

function exportSuggestion(id, type) {
  const record = suggestionById(id);
  const content = type === "json" ? JSON.stringify(record, null, 2) : createSuggestionText(record);
  downloadText(`saran-${record.id}.${type}`, content, type === "json" ? "application/json" : "text/plain;charset=utf-8");
}

function shareSuggestion(id) {
  const record = suggestionById(id);
  const url = createWhatsAppUrl(activeSettingsPanel().whatsappNumber, createSuggestionText(record));
  const link = el("a", { attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } });
  document.body.append(link);
  link.click();
  link.remove();
  showToast("WhatsApp terbuka dengan draf saran. Pesan belum terkirim.");
}

async function saveReadState(collection, id, fieldName) {
  const record = data[collection].find((item) => item.id === id);
  if (!record) throw new Error("Data tidak ditemukan.");
  const field = fieldName === "readAt" ? "read" : "archived";
  const updated = await updateOwnerInbox(collection, id, { [field]: !record[field] });
  data[collection] = data[collection].map((item) => item.id === id ? updated : item);
  await logActivity(`Owner mengubah status ${collection === "suggestions" ? "saran" : "laporan"}`, "ubah", id);
  await renderCurrent();
}

async function replyNote(id) {
  const record = data.suggestions.find((item) => item.id === id);
  if (!record) throw new Error("Saran tidak ditemukan.");
  showForm("Catatan balasan", [{ key: "replyNote", label: "Catatan untuk Owner", type: "textarea" }], { replyNote: record.replyNote ?? "" }, async ({ replyNote: note }) => {
    const updated = await updateOwnerInbox("suggestions", id, { replyNote: note });
    data.suggestions = data.suggestions.map((item) => item.id === id ? updated : item);
    await logActivity("Owner menyimpan catatan saran", "ubah", id);
    await renderCurrent();
  });
}

async function openReportAttachment(path) {
  const url = await getReportAttachmentUrl(path);
  const link = el("a", { attrs: { href: url, target: "_blank", rel: "noopener noreferrer" } });
  document.body.append(link);
  link.click();
  link.remove();
}

async function reorder(id, direction) {
  const applyOrder = async () => {
    const record = activeRecord("schedule", id);
    if (!record) throw new Error("Jam pelajaran tidak ditemukan.");
    const dayRecords = active("schedule").filter((item) => item.day === record.day).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.start.localeCompare(b.start));
    const index = dayRecords.findIndex((item) => item.id === id);
    const next = dayRecords[index + Number(direction)];
    if (!next) return null;
    dayRecords.forEach((item, position) => { item.order = position; });
    const first = record.order;
    record.order = next.order;
    next.order = first;
    const now = timestamp();
    record.updatedAt = now;
    next.updatedAt = now;
    return await writeCollection("schedule", data.schedule);
  };
  const result = await persistWithConflictResolution(applyOrder, activeRecord("schedule", id));
  if (result.latest) {
    await renderCurrent();
    return;
  }
  if (!result.value) return;
  data.schedule = result.value;
  await logActivity("Owner mengubah urutan jadwal", "ubah", id);
  await renderCurrent();
}

async function manageStudents() {
  dashboardSection = "wheel";
  currentView = "dashboard";
  await renderCurrent();
}

async function saveWheelToggle() {
  const input = $('[name="excludePickedDashboard"]', root);
  const config = activeSettingsPanel();
  data.settings = await saveLocalRecord("settings", { ...config, excludePicked: input.checked, updatedAt: timestamp() });
  await renderCurrent();
  showToast("Pilihan roda nama tersimpan.");
}

async function toggleWheelSetting(key) {
  const config = activeSettingsPanel();
  data.settings = await saveLocalRecord("settings", { ...config, [key]: !config[key], updatedAt: timestamp() });
  await renderCurrent();
  showToast(key === "mutedWheel"
    ? (config.mutedWheel ? "Bunyi roda aktif." : "Bunyi roda dimatikan.")
    : (config.vibrationEnabled ? "Getar roda dimatikan." : "Getar roda aktif."));
}

async function resetPicked() {
  const config = activeSettingsPanel();
  data.settings = await saveLocalRecord("settings", { ...config, pickedStudentIds: [], updatedAt: timestamp() });
  await renderCurrent();
  showToast("Daftar nama terpilih diatur ulang.");
}

async function restoreDemoStudents() {
  if (!await showConfirm("Pulihkan nama contoh?", "Daftar nama sekarang akan diganti dengan nama contoh dari data publikasi.", "Pulihkan")) return;
  const response = await fetch("./data/default-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Daftar nama publikasi tidak bisa dimuat.");
  const published = await response.json();
  const config = activeSettingsPanel();
  const updates = await writeCollections({
    students: published.collections.students,
    settings: [{ ...config, pickedStudentIds: [], updatedAt: timestamp() }],
  });
  data.students = updates.students;
  data.settings = updates.settings;
  await logActivity("Owner memulihkan daftar nama contoh", "pulihkan");
  await renderCurrent();
  showToast("Daftar nama contoh dipulihkan.");
}

async function restoreScheduleDefaults() {
  if (!await showConfirm("Pulihkan jadwal contoh?", "Jadwal aktif akan diganti dengan data contoh publikasi.", "Pulihkan")) return;
  const published = await fetch("./data/default-data.json", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Data jadwal publikasi tidak bisa dimuat.");
    return response.json();
  });
  data.schedule = await writeCollection("schedule", published.collections.schedule);
  await logActivity("Owner memulihkan jadwal publikasi", "pulihkan");
  await renderCurrent();
  showToast("Jadwal publikasi dipulihkan.");
}

async function lockOwner() {
  if (!await showConfirm("Keluar Dashboard?", "Sesi Owner akan ditutup di perangkat ini.", "Keluar", "danger")) return;
  await signOutOwner();
  dashboardUnlocked = false;
  currentView = "home";
  dashboardSection = "overview";
  await renderCurrent();
  showToast("Kamu sudah keluar dari Dashboard.");
}

function setViewCategory(category) {
  classCategory = category;
  void renderCurrent();
}

/* PROTECTED */
async function saveGalleryPreference(key, value, { refresh = true, delay = 0, focusMode = null, focusAlbum = false } = {}) {
  data.settings = await saveLocalRecord("settings", { ...activeSettingsPanel(), [key]: value, updatedAt: timestamp() });
  if (!refresh) return;
  clearTimeout(galleryFilterTimer);
  const search = $('[data-action="filter-gallery"]', root);
  const focused = document.activeElement === search;
  const focusedMode = focusMode ?? (document.activeElement?.dataset.action === "gallery-mode" ? document.activeElement.dataset.mode : null);
  const shouldFocusAlbum = focusAlbum || document.activeElement?.dataset.action === "filter-album";
  const selectionStart = focused ? search.selectionStart : null;
  const selectionEnd = focused ? search.selectionEnd : null;
  const render = () => {
    void renderCurrent().then(() => {
      const nextSearch = $('[data-action="filter-gallery"]', root);
      if (focused && nextSearch) {
        nextSearch.focus({ preventScroll: true });
        if (selectionStart !== null && selectionEnd !== null) {
          nextSearch.setSelectionRange(selectionStart, selectionEnd);
        }
      }
      if (focusedMode) $(`[data-action="gallery-mode"][data-mode="${focusedMode}"]`, root)?.focus({ preventScroll: true });
      if (shouldFocusAlbum) $('[data-action="filter-album"]', root)?.focus({ preventScroll: true });
    });
  };
  if (delay) galleryFilterTimer = setTimeout(render, delay);
  else render();
}
/* END PROTECTED */

function $$(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

async function handleClick(event) {
  const target = event.target.closest("[data-action], [data-view]");
  if (!target) return;
  if (target.id === "theme-switch" && target.dataset.suppressClick) {
    delete target.dataset.suppressClick;
    return;
  }
  if (target.dataset.view) {
    goTo(target.dataset.view);
    return;
  }
  const action = target.dataset.action;
  try {
    switch (action) {
      case "navigate": goTo(target.dataset.view); break;
      case "dialog-close": closeModal(); break;
      case "theme": await toggleTheme(event.clientX, event.clientY); break;
      case "gallery-mode": await saveGalleryPreference("galleryMode", target.dataset.mode, { focusMode: target.dataset.mode }); break;
      case "class-category": setViewCategory(target.dataset.category); break;
      case "dashboard-section": dashboardSection = target.dataset.section; if (target.dataset.section) await renderCurrent(); break;
      case "create-record": await showEditor(target.dataset.collection); break;
      case "edit-record": await showEditor(target.dataset.collection, target.dataset.id); break;
      case "delete-record": await deleteItem(target.dataset.collection, target.dataset.id, target.dataset.permanent === "true"); break;
      case "restore-record": await restoreItem(target.dataset.collection, target.dataset.id); break;
      case "upload-gallery": await uploadGallery(); break;
      case "view-image": await openViewer(target.dataset.id); break;
      case "toggle-like": await toggleLike(target.dataset.id); break;
      case "spin-wheel": await spin(); break;
      case "manage-students": await manageStudents(); break;
      case "submit-report": await submitReport(); break;
      case "submit-suggestion": await submitSuggestion(); break;
      case "open-report-whatsapp": await openReportWhatsApp(target.dataset.id); break;
      case "open-report-attachment": await openReportAttachment(target.dataset.path); break;
      case "download-attachment": await downloadAttachment(target.dataset.id); break;
      case "copy-suggestion": await copySuggestion(target.dataset.id); break;
      case "download-suggestion": exportSuggestion(target.dataset.id, target.dataset.type); break;
      case "suggestion-whatsapp": shareSuggestion(target.dataset.id); break;
      case "toggle-read": await saveReadState(target.dataset.collection, target.dataset.id, "readAt"); break;
      case "toggle-archive": await saveReadState(target.dataset.collection, target.dataset.id, "archivedAt"); break;
      case "reply-note": await replyNote(target.dataset.id); break;
      case "reorder-record": await reorder(target.dataset.id, Number(target.dataset.direction)); break;
      case "save-wheel-setting": await saveWheelToggle(); break;
      case "toggle-wheel-sound": await toggleWheelSetting("mutedWheel"); break;
      case "toggle-wheel-vibration": await toggleWheelSetting("vibrationEnabled"); break;
      case "reset-picked": await resetPicked(); break;
      case "restore-demo-students": await restoreDemoStudents(); break;
      case "clear-wheel-history": {
        if (!await showConfirm("Hapus riwayat roda?", "Riwayat pilihan di browser ini akan dihapus.", "Hapus")) break;
        data.wheelHistory = await writeCollection("wheelHistory", []);
        await renderCurrent();
        showToast("Riwayat roda dihapus.");
        break;
      }
      case "restore-default-schedule": await restoreScheduleDefaults(); break;
      case "lock-dashboard": await lockOwner(); break;
      case "export-backup": await downloadExport(); break;
      case "import-backup": askImportFile(); break;
      case "reset-data": await handleReset(target.dataset.kind); break;
      case "show-full-schedule": currentView = "schedule"; showAllSchedule = true; await renderCurrent(); break;
      case "toggle-full-schedule": showAllSchedule = !showAllSchedule; await renderCurrent(); break;
      case "conflict-published": case "conflict-keep": case "conflict-merge": break;
      default: break;
    }
  } catch (error) {
    showToast(error.message || "Ada kendala. Perubahan belum berhasil.");
  }
}

document.addEventListener("click", (event) => { void handleClick(event); });
document.addEventListener("change", (event) => {
  if (event.target.matches('[data-action="filter-album"]')) {
    void saveGalleryPreference("galleryAlbum", event.target.value, { focusAlbum: true }).catch((error) => showToast(error.message));
  }
  if (event.target.matches('input[type="file"][name="files"], input[type="file"][name="reportFiles"]')) {
    for (const url of uploadPreviewUrls) URL.revokeObjectURL(url);
    uploadPreviewUrls = [];
    const preview = el("div", { className: "upload-previews" });
    for (const file of Array.from(event.target.files ?? [])) {
      if (!file.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(file);
      uploadPreviewUrls.push(url);
      preview.append(el("img", { attrs: { src: url, alt: `Pratinjau ${file.name}` } }));
    }
    const existing = $(".upload-previews", dialogContent);
    if (existing) existing.remove();
    if (preview.childElementCount) event.target.closest(".form-field").append(preview);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.matches('[data-action="filter-gallery"]')) {
    void saveGalleryPreference("galleryQuery", event.target.value, { delay: 80 }).catch((error) => showToast(error.message));
  }
});

/* PROTECTED */
$("#viewer-dialog").addEventListener("click", (event) => {
  if (event.target.matches("[data-viewer-close]")) $("#viewer-dialog").close();
});
$("#viewer-dialog").addEventListener("close", () => {
  const image = $("#viewer-image");
  if (image.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl);
  image.removeAttribute("src");
});
document.addEventListener("keydown", (event) => {
  if (!$("#viewer-dialog").open) return;
  if (event.key === "ArrowRight") {
    viewerIndex = (viewerIndex + 1) % currentGallery.length;
    void updateViewer();
  }
  if (event.key === "ArrowLeft") {
    viewerIndex = (viewerIndex - 1 + currentGallery.length) % currentGallery.length;
    void updateViewer();
  }
});

$("#viewer-image").addEventListener("pointerdown", (event) => { $("#viewer-image").dataset.swipeStart = String(event.clientX); });
$("#viewer-image").addEventListener("pointerup", (event) => {
  const start = Number($("#viewer-image").dataset.swipeStart);
  if (Math.abs(event.clientX - start) < 70 || currentGallery.length < 2) return;
  viewerIndex = (viewerIndex + (event.clientX < start ? 1 : -1) + currentGallery.length) % currentGallery.length;
  void updateViewer();
});

document.addEventListener("keydown", (event) => {
  if (!event.target.matches('[data-action="view-image"]') || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  void openViewer(event.target.dataset.id);
});
/* END PROTECTED */

dialog.addEventListener("close", () => {
  for (const url of uploadPreviewUrls) URL.revokeObjectURL(url);
  uploadPreviewUrls = [];
});

function registerWorker() {
  if (!("serviceWorker" in navigator)) {
    showToast("Mode offline belum didukung browser ini.");
    return;
  }
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).then((registration) => {
    if (registration.waiting) showUpdateNotice(registration);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateNotice(registration);
      });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
  }).catch((error) => showToast(`Mode offline gagal disiapkan: ${error.message}`));
}

function showUpdateNotice(registration) {
  const content = el("div");
  content.append(el("p", { text: "Versi baru tersedia. Muat ulang untuk memakai versi terbaru." }));
  const reload = button("Versi baru tersedia - Muat ulang", "apply-update");
  reload.addEventListener("click", () => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    closeModal();
  });
  showModal("Pembaruan tersedia", [content], [reload, button("Nanti", "dialog-close", { variant: "secondary" })], "Ruang Kelas");
}

async function boot() {
  createHiddenTapGate();
  try {
    const result = await initializeStorage("./data/default-data.json");
    data = Object.fromEntries(collections.map((name) => [name, readCollection(name)]));
    setupThemeSwitch();
    setTheme();
    try {
      dashboardUnlocked = (await getOwnerStatus()).isOwner;
    } catch (error) {
      dashboardUnlocked = false;
      showToast(`Status Owner belum dapat diperiksa: ${error.message}`);
    }
    if (!ownerAuthListenerReady) {
      ownerAuthListenerReady = true;
      subscribeOwnerAuth((status, error) => {
        dashboardUnlocked = !error && status.isOwner;
        if (!dashboardUnlocked && currentView === "dashboard") {
          currentView = "home";
          dashboardSection = "overview";
        }
        if (appBooted) void renderCurrent();
        if (error) showToast(`Sesi Owner perlu diperiksa lagi: ${error.message}`);
      });
    }
    if (result.warning) showToast(result.warning);
    await renderCurrent();
    appBooted = true;
    registerWorker();
    setupNetworkListeners();
    await refreshSharedData();
    startRealtime();
  } catch (error) {
    $("#loading-view").replaceChildren(
      el("p", { className: "error-message", text: error.message }),
      button("Coba lagi", "retry-app"),
    );
    $("#loading-view").hidden = false;
    root.hidden = true;
  }
}

document.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="retry-app"]')) void boot();
});

boot();
