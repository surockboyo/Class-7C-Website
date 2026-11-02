import { getPublicSupabaseClient, getSupabaseClient } from "./supabase-client.js";
import { createSharedStorage } from "./shared-storage.js";

export const SCHEMA_VERSION = 1;
export const APP_VERSION = "1.0.0";
export const COLLECTIONS = [
  "classInfo",
  "homework",
  "exams",
  "outlines",
  "announcements",
  "customSections",
  "schedule",
  "students",
  "gallery",
  "reports",
  "suggestions",
  "settings",
  "theme",
  "wheelHistory",
  "albums",
  "birthdays",
  "piket",
  "scheduleSettings",
  "kisi-kisi",
  "galleryPosts",
  "siteSettings",
];
const SHARED_CACHE_KEY = "ruangTemu:supabase-cache:v1";
const LOCAL_SETTINGS_KEYS = [
  "mutedWheel", "vibrationEnabled", "excludePicked", "pickedStudentIds",
  "galleryMode", "galleryAlbum", "gallerySearch", "likedGalleryIds", "lastReportAt",
];
const SHARED_COLLECTIONS = new Set([
  "classInfo", "homework", "exams", "outlines", "announcements", "customSections",
  "schedule", "students", "albums", "birthdays", "piket", "scheduleSettings",
  "kisi-kisi", "galleryPosts", "siteSettings", "gallery", "settings", "wheelHistory",
]);

/* PROTECTED */
const PREFIX = "ruangTemu:v1:";
const META_KEY = `${PREFIX}meta`;
const SCHEMA_KEY = `${PREFIX}schemaVersion`;
/* END PROTECTED */
const DB_NAME = "ruang-temu-media";
const DB_VERSION = 1;
const DB_STORES = ["blobs", "activity"];
let publishedPackage = null;
let publishedUrl = "./data/default-data.json";
let sharedStorage = null;
let sharedConnection = "unknown";

function storage() {
  try {
    if (!globalThis.localStorage) throw new Error("Penyimpanan browser tidak tersedia.");
    const probe = `${PREFIX}probe`;
    localStorage.setItem(probe, "ok");
    localStorage.removeItem(probe);
    return localStorage;
  } catch (error) {
    throw new Error("Penyimpanan browser tidak tersedia. Coba buka situs lewat server lokal atau periksa pengaturan browser.", { cause: error });
  }
}

function getSharedStorage() {
  if (!sharedStorage) {
    sharedStorage = createSharedStorage(getSupabaseClient(), {
      validateCollection,
      publicClient: getPublicSupabaseClient(),
    });
  }
  return sharedStorage;
}

function readSharedCache() {
  const raw = storage().getItem(SHARED_CACHE_KEY);
  if (!raw) return null;
  try {
    const cache = JSON.parse(raw);
    if (!cache || typeof cache !== "object" || !cache.collections || typeof cache.collections !== "object") {
      throw new Error("Cache data bersama tidak lengkap.");
    }
    return cache;
  } catch (error) {
    throw new Error("Cache data bersama rusak. Data lama tetap aman.", { cause: error });
  }
}

function deepClone(value) {
  return structuredClone(value);
}

function recordError(record, index, collection) {
  const label = `${collection}[${index}]`;
  if (!record || typeof record !== "object" || Array.isArray(record)) return `${label} bukan objek yang valid.`;
  if (typeof record.id !== "string" || !record.id.trim()) return `${label} tidak memiliki id.`;
  if (typeof record.createdAt !== "string" || Number.isNaN(Date.parse(record.createdAt))) return `${label}.createdAt tidak valid.`;
  if (typeof record.updatedAt !== "string" || Number.isNaN(Date.parse(record.updatedAt))) return `${label}.updatedAt tidak valid.`;
  if (record.deletedAt !== null && (typeof record.deletedAt !== "string" || Number.isNaN(Date.parse(record.deletedAt)))) return `${label}.deletedAt tidak valid.`;
  return null;
}

export function validateCollection(name, records) {
  if (!COLLECTIONS.includes(name)) throw new Error(`Koleksi "${name}" tidak dikenal.`);
  if (!Array.isArray(records)) throw new Error(`Data ${name} harus berupa daftar.`);
  const ids = new Set();
  records.forEach((record, index) => {
    const error = recordError(record, index, name);
    if (error) throw new Error(error);
    if (ids.has(record.id)) throw new Error(`ID ganda "${record.id}" ditemukan di ${name}.`);
    ids.add(record.id);
  });
  return true;
}

function normalizePackage(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Berkas data harus berupa objek JSON.");
  if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 0 || input.schemaVersion > SCHEMA_VERSION) {
    throw new Error("Versi struktur data tidak didukung.");
  }
  if (!Number.isInteger(input.publishedVersion) || input.publishedVersion < 0) throw new Error("publishedVersion tidak valid.");
  const collections = input.collections ?? input.data;
  if (!collections || typeof collections !== "object" || Array.isArray(collections)) throw new Error("Kumpulan data tidak ditemukan.");
  const result = {};
  for (const name of COLLECTIONS) {
    const records = collections[name] ?? [];
    validateCollection(name, records);
    result[name] = deepClone(records);
  }
  const blobs = input.blobs ?? [];
  if (!Array.isArray(blobs)) throw new Error("Daftar gambar dalam cadangan tidak valid.");
  const blobIds = new Set();
  for (const item of blobs) {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.base64 !== "string" || typeof item.type !== "string") {
      throw new Error("Data gambar di cadangan tidak lengkap.");
    }
    if (blobIds.has(item.id)) throw new Error(`ID gambar ganda "${item.id}" ditemukan di cadangan.`);
    if (!item.base64 || !/^image\/(?:jpeg|png|webp)$/.test(item.type) || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.base64)) {
      throw new Error(`Data gambar "${item.id}" tidak valid.`);
    }
    blobIds.add(item.id);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: typeof input.appVersion === "string" ? input.appVersion : "unknown",
    publishedVersion: input.publishedVersion,
    exportedAt: typeof input.exportedAt === "string" ? input.exportedAt : new Date().toISOString(),
    collections: result,
    blobs,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
}

export function migratePackage(input) {
  if (!input || typeof input !== "object") throw new Error("Berkas data tidak valid.");
  if (input.schemaVersion === 0) {
    const oldCollections = input.collections ?? input.data ?? {};
    const now = new Date().toISOString();
    const migratedCollections = {};
    for (const name of COLLECTIONS) {
      const records = oldCollections[name] ?? [];
      if (!Array.isArray(records)) throw new Error(`Data lama ${name} harus berupa daftar.`);
      migratedCollections[name] = records.map((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`Data lama ${name}[${index}] tidak valid.`);
        const createdAt = typeof record.createdAt === "string" && !Number.isNaN(Date.parse(record.createdAt)) ? record.createdAt : now;
        const updatedAt = typeof record.updatedAt === "string" && !Number.isNaN(Date.parse(record.updatedAt)) ? record.updatedAt : createdAt;
        return {
          ...record,
          id: typeof record.id === "string" && record.id ? record.id : `legacy-${name}-${index + 1}`,
          createdAt,
          updatedAt,
          deletedAt: record.deletedAt ?? null,
        };
      });
    }
    const migrated = {
      ...input,
      schemaVersion: 1,
      collections: migratedCollections,
      publishedVersion: Number.isInteger(input.publishedVersion) ? input.publishedVersion : 0,
    };
    return normalizePackage(migrated);
  }
  return normalizePackage(input);
}

export function parseImportText(text) {
  if (typeof text !== "string") throw new Error("Berkas cadangan harus berupa teks JSON.");
  try {
    return migratePackage(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Berkas bukan JSON yang valid. Data lama tetap aman.", { cause: error });
    throw error;
  }
}

function readMeta() {
  const target = storage();
  const schema = target.getItem(SCHEMA_KEY);
  const raw = target.getItem(META_KEY);
  if (!raw) return null;
  try {
    if (schema !== String(SCHEMA_VERSION)) throw new Error("Versi penyimpanan lokal tidak cocok.");
    const value = JSON.parse(raw);
    if (!value || !Number.isInteger(value.basedOnPublishedVersion) || typeof value.hasLocalChanges !== "boolean") {
      throw new Error("Metadata lokal tidak lengkap.");
    }
    return value;
  } catch (error) {
    throw new Error("Metadata penyimpanan lokal rusak. Ekspor atau pulihkan data sebelum melanjutkan.", { cause: error });
  }
}

function writeMeta(meta) {
  const target = storage();
  const value = JSON.stringify(meta);
  target.setItem(META_KEY, value);
  if (target.getItem(META_KEY) !== value) throw new Error("Metadata tidak berhasil disimpan.");
}

function dbOpen() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Penyimpanan gambar lokal (IndexedDB) tidak tersedia di browser ini."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of DB_STORES) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Penyimpanan lokal gagal dibuka.", { cause: request.error }));
  });
}

function dbRequest(storeName, action, value) {
  return dbOpen().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, action === "put" || action === "delete" || action === "clear" ? "readwrite" : "readonly");
    const store = transaction.objectStore(storeName);
    let request;
    if (action === "getAll") request = store.getAll();
    else if (action === "get") request = store.get(value);
    else if (action === "put") request = store.put(value);
    else if (action === "delete") request = store.delete(value);
    else if (action === "clear") request = store.clear();
    else {
      database.close();
      reject(new Error("Operasi penyimpanan tidak dikenal."));
      return;
    }
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(new Error("Operasi penyimpanan lokal gagal.", { cause: request.error }));
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => reject(new Error("Transaksi penyimpanan lokal gagal.", { cause: transaction.error }));
    transaction.onabort = () => reject(new Error("Transaksi penyimpanan lokal dibatalkan.", { cause: transaction.error }));
  }));
}

function replaceAllBlobs(entries) {
  return dbOpen().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction("blobs", "readwrite");
    const store = transaction.objectStore("blobs");
    store.clear();
    for (const entry of entries) {
      if (!entry || typeof entry.id !== "string" || !(entry.blob instanceof Blob)) {
        transaction.abort();
        reject(new Error("Lampiran dalam cadangan tidak valid."));
        database.close();
        return;
      }
      store.put({ id: entry.id, blob: entry.blob, type: entry.blob.type });
    }
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(new Error("Lampiran gagal dipulihkan.", { cause: transaction.error })); };
    transaction.onabort = () => { database.close(); reject(new Error("Pemulihan lampiran dibatalkan.", { cause: transaction.error })); };
  }));
}

export async function saveBlob(id, blob) {
  if (!(blob instanceof Blob) || !id) throw new Error("Gambar tidak valid.");
  await dbRequest("blobs", "put", { id, blob, type: blob.type });
}

export async function getBlob(id) {
  if (!id) return null;
  const entry = await dbRequest("blobs", "get", id);
  return entry?.blob ?? null;
}

export async function deleteBlob(id) {
  return dbRequest("blobs", "delete", id);
}

export async function getActivityLog() {
  return (await getSharedStorage().listInbox("activity_log"))
    .map((entry) => ({ ...entry, at: entry.createdAt }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function addActivity(description, action = "ubah", recordId = "") {
  return getSharedStorage().addActivity({ action, record: recordId ? { id: recordId } : null, description });
}

export const submitSharedReport = (input) => getSharedStorage().submitReport(input);
export const submitSharedSuggestion = (input) => getSharedStorage().submitSuggestion(input);
export const getOwnerInbox = (name) => getSharedStorage().listInbox(name);
export const updateOwnerInbox = (name, id, changes) => getSharedStorage().updateInbox(name, id, changes);
export const deleteOwnerInbox = (name, id, options) => getSharedStorage().deleteInbox(name, id, options);
export const uploadSharedObject = (bucket, path, blob, options) => getSharedStorage().uploadObject(bucket, path, blob, options);
export const getSharedImageUrl = (path) => getSharedStorage().publicImageUrl(path);
export const getReportAttachmentUrl = (path) => getSharedStorage().reportAttachmentUrl(path);
export const deleteSharedGalleryImage = (path, options) => getSharedStorage().removeGalleryObject(path, options);
export const getGalleryStorageUsage = () => getSharedStorage().getGalleryStorageUsage();
export const subscribeSharedRecords = (onRecord, onStatus) => getSharedStorage().subscribePublicRecords(onRecord, onStatus);

function localCollections() {
  const target = storage();
  const collections = {};
  for (const name of COLLECTIONS) {
    const raw = target.getItem(`${PREFIX}${name}`);
    if (!raw) {
      collections[name] = [];
      continue;
    }
    try {
      collections[name] = JSON.parse(raw);
      validateCollection(name, collections[name]);
    } catch (error) {
      throw new Error(`Data ${name} rusak. Tidak ada perubahan yang dilakukan.`, { cause: error });
    }
  }
  return collections;
}

function commitCollections(collections, meta) {
  const target = storage();
  const keys = [SCHEMA_KEY, META_KEY, ...COLLECTIONS.map((name) => `${PREFIX}${name}`)];
  const snapshot = new Map(keys.map((key) => [key, target.getItem(key)]));
  try {
    for (const name of COLLECTIONS) {
      validateCollection(name, collections[name]);
      const key = `${PREFIX}${name}`;
      const serialized = JSON.stringify(collections[name]);
      target.setItem(key, serialized);
      if (target.getItem(key) !== serialized) throw new Error(`Data ${name} tidak berhasil disimpan.`);
    }
    target.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
    if (target.getItem(SCHEMA_KEY) !== String(SCHEMA_VERSION)) throw new Error("Versi penyimpanan tidak berhasil disimpan.");
    writeMeta(meta);
  } catch (error) {
    for (const [key, value] of snapshot) {
      try {
        if (value === null) target.removeItem(key);
        else target.setItem(key, value);
      } catch {
        throw new Error("Penyimpanan gagal dan pemulihan otomatis tidak lengkap. Jangan tutup tab; segera ekspor data yang masih tersedia.", { cause: error });
      }
    }
    throw error;
  }
}

function allCollectionsEmpty(collections) {
  return COLLECTIONS.every((name) => collections[name].length === 0);
}

export async function initializeStorage(baseUrl = "./data/default-data.json") {
  let published;
  let fetchError = null;
  try {
    const response = await fetch(baseUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Data publikasi gagal dimuat (HTTP ${response.status}).`);
    published = normalizePackage(await response.json());
    publishedPackage = published;
    publishedUrl = baseUrl;
  } catch (error) {
    fetchError = error;
  }
  const meta = readMeta();
  if (!meta) {
    if (!published) throw new Error(`Data publikasi tidak bisa dimuat: ${fetchError?.message ?? "sumber tidak tersedia"}`);
    const target = storage();
    if (COLLECTIONS.some((name) => target.getItem(`${PREFIX}${name}`) !== null)) {
      throw new Error("Data lokal ditemukan tanpa metadata yang diperlukan. Tidak ada perubahan yang dilakukan; ekspor atau pulihkan data secara manual.");
    }
    commitCollections(published.collections, {
      basedOnPublishedVersion: published.publishedVersion,
      hasLocalChanges: false,
      source: "Published",
    });
    return { collections: deepClone(published.collections), meta: readMeta(), publishedVersion: published.publishedVersion, conflict: null, warning: null };
  }
  const local = localCollections();
  if (!published) {
    if (allCollectionsEmpty(local)) throw new Error(`Data publikasi dan data lokal tidak tersedia: ${fetchError?.message ?? "sumber tidak tersedia"}`);
    return { collections: local, meta, publishedVersion: meta.basedOnPublishedVersion, conflict: null, warning: `Data publikasi tidak berhasil dimuat. Data lokal tetap digunakan. ${fetchError.message}` };
  }
  if (published.publishedVersion > meta.basedOnPublishedVersion && meta.hasLocalChanges) {
    return {
      collections: local,
      meta,
      publishedVersion: published.publishedVersion,
      conflict: { publishedVersion: published.publishedVersion, collections: published.collections },
      warning: null,
    };
  }
  if (published.publishedVersion > meta.basedOnPublishedVersion) {
    commitCollections(published.collections, { basedOnPublishedVersion: published.publishedVersion, hasLocalChanges: false, source: "Published" });
    return { collections: deepClone(published.collections), meta: readMeta(), publishedVersion: published.publishedVersion, conflict: null, warning: null };
  }
  return { collections: local, meta, publishedVersion: meta.basedOnPublishedVersion, conflict: null, warning: null };
}

export async function refreshSharedCollections() {
  if (globalThis.navigator?.onLine === false) {
    sharedConnection = "offline";
    return { ok: false, offline: true, error: new Error("Kamu sedang offline.") };
  }
  try {
    const cache = await getSharedStorage().refresh();
    sharedConnection = "online";
    const collections = deepClone(cache.collections);
    const localSettings = localCollections().settings[0] ?? {};
    if (collections.settings?.[0]) collections.settings[0] = { ...collections.settings[0], ...Object.fromEntries(
      LOCAL_SETTINGS_KEYS.filter((key) => key in localSettings).map((key) => [key, localSettings[key]]),
    ) };
    else collections.settings = localSettings.id ? [deepClone(localSettings)] : [];
    if (cache.rowCount === 0 && publishedPackage) {
      for (const name of ["classInfo", "homework", "exams", "outlines", "announcements", "customSections", "schedule", "students", "wheelHistory"]) {
        collections[name] = deepClone(publishedPackage.collections[name] ?? []);
      }
    }
    return { ok: true, offline: false, collections };
  } catch (error) {
    sharedConnection = globalThis.navigator?.onLine === false ? "offline" : "error";
    return { ok: false, offline: sharedConnection === "offline", error };
  }
}

export function readCollection(name) {
  if (!COLLECTIONS.includes(name)) throw new Error(`Koleksi "${name}" tidak dikenal.`);
  if (SHARED_COLLECTIONS.has(name)) {
    const cache = readSharedCache();
    if (cache && Object.hasOwn(cache.collections, name)) {
      const records = deepClone(cache.collections[name]);
      if (name === "settings" && !records.length) return deepClone(localCollections().settings);
      if (name === "settings" && records[0]) {
        const local = localCollections().settings[0] ?? {};
        records[0] = { ...records[0], ...Object.fromEntries(
          LOCAL_SETTINGS_KEYS.filter((key) => key in local).map((key) => [key, local[key]]),
        ) };
      }
      return records;
    }
  }
  return deepClone(localCollections()[name]);
}

export function getStorageMeta() {
  return readMeta();
}

export async function writeCollection(name, records) {
  if (SHARED_COLLECTIONS.has(name)) {
    const previous = readCollection(name);
    return getSharedStorage().persistCollection(name, records, previous);
  }
  const collections = localCollections();
  validateCollection(name, records);
  collections[name] = deepClone(records);
  const meta = readMeta() ?? { basedOnPublishedVersion: publishedPackage?.publishedVersion ?? 0 };
  commitCollections(collections, { ...meta, hasLocalChanges: true, source: "Local changes" });
  return readCollection(name);
}

export async function writeLocalCollection(name, records) {
  if (!COLLECTIONS.includes(name)) throw new Error(`Koleksi "${name}" tidak dikenal.`);
  const collections = localCollections();
  validateCollection(name, records);
  collections[name] = deepClone(records);
  const meta = readMeta() ?? { basedOnPublishedVersion: publishedPackage?.publishedVersion ?? 0 };
  commitCollections(collections, { ...meta, hasLocalChanges: true, source: "Local changes" });
  return readCollection(name);
}

export async function writeCollections(changes) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) throw new Error("Perubahan koleksi tidak valid.");
  const localChanges = {};
  const saved = {};
  for (const [name, records] of Object.entries(changes)) {
    validateCollection(name, records);
    if (SHARED_COLLECTIONS.has(name)) saved[name] = await writeCollection(name, records);
    else localChanges[name] = deepClone(records);
  }
  if (Object.keys(localChanges).length) {
    const collections = localCollections();
    for (const [name, records] of Object.entries(localChanges)) collections[name] = records;
    const meta = readMeta() ?? { basedOnPublishedVersion: publishedPackage?.publishedVersion ?? 0 };
    commitCollections(collections, { ...meta, hasLocalChanges: true, source: "Local changes" });
  }
  return Object.fromEntries(Object.keys(changes).map((name) => [name, saved[name] ?? readCollection(name)]));
}

export async function saveRecord(name, record) {
  const records = readCollection(name);
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) records[index] = record;
  else records.push(record);
  return await writeCollection(name, records);
}

export async function saveLocalRecord(name, record) {
  const records = readCollection(name);
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) records[index] = record;
  else records.push(record);
  return writeLocalCollection(name, records);
}

export async function softDeleteRecord(name, id) {
  const records = readCollection(name);
  const record = records.find((item) => item.id === id);
  if (!record) throw new Error("Data yang ingin dihapus tidak ditemukan.");
  record.deletedAt = new Date().toISOString();
  record.updatedAt = record.deletedAt;
  return await writeCollection(name, records);
}

export async function restoreRecord(name, id) {
  const records = readCollection(name);
  const record = records.find((item) => item.id === id);
  if (!record) throw new Error("Data yang ingin dipulihkan tidak ditemukan.");
  record.deletedAt = null;
  record.updatedAt = new Date().toISOString();
  return await writeCollection(name, records);
}

export async function hardDeleteRecord(name, id, options = {}) {
  if (SHARED_COLLECTIONS.has(name)) return getSharedStorage().hardDelete(name, id, options);
  const records = readCollection(name).filter((record) => record.id !== id);
  return await writeCollection(name, records);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Gambar gagal dimasukkan ke cadangan."));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(value, type) {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("Data gambar di cadangan tidak valid.");
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: type || "application/octet-stream" });
}

export async function exportPackage() {
  const meta = readMeta();
  const blobs = await dbRequest("blobs", "getAll");
  const encoded = await Promise.all(blobs.map(async ({ id, blob }) => ({ id, type: blob.type, base64: await blobToBase64(blob) })));
  const collections = Object.fromEntries(COLLECTIONS.map((name) => [name, readCollection(name)]));
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    publishedVersion: meta.basedOnPublishedVersion,
    metadata: { source: "Imported backup", hasLocalChanges: meta.hasLocalChanges },
    collections,
    blobs: encoded,
  };
}

export function previewImport(input) {
  const data = migratePackage(input);
  const current = Object.fromEntries(COLLECTIONS.map((name) => [name, readCollection(name)]));
  const overwritten = {};
  const counts = {};
  for (const name of COLLECTIONS) {
    counts[name] = data.collections[name].length;
    const currentIds = new Set(current[name].map((record) => record.id));
    overwritten[name] = data.collections[name].filter((record) => currentIds.has(record.id)).length;
  }
  const blobIds = new Set(data.blobs.map((item) => item.id));
  for (const name of ["gallery", "reports"]) {
    const required = data.collections[name].flatMap((record) => [
      ...(record.blobIds ?? []),
      ...(record.attachmentIds ?? []),
      ...(record.blobId ? [record.blobId] : []),
    ]);
    if (required.some((id) => !blobIds.has(id))) throw new Error("Cadangan memiliki data gambar yang hilang. Data lama tetap aman.");
  }
  return { data, counts, overwritten, blobCount: data.blobs.length };
}

export async function commitImport(preview) {
  const { data } = preview;
  const previousCollections = localCollections();
  const previousMeta = readMeta();
  const previousBlobs = await dbRequest("blobs", "getAll");
  const converted = data.blobs.map((item) => ({ id: item.id, blob: base64ToBlob(item.base64, item.type) }));
  const sharedChanges = Object.fromEntries(Object.entries(data.collections).filter(([name]) => SHARED_COLLECTIONS.has(name)));
  const localChanges = Object.fromEntries(Object.entries(data.collections).filter(([name]) => !SHARED_COLLECTIONS.has(name)));
  let sharedWritesStarted = false;
  try {
    if (Object.keys(sharedChanges).length) {
      sharedWritesStarted = true;
      await writeCollections(sharedChanges);
    }
    await replaceAllBlobs(converted);
    commitCollections({ ...previousCollections, ...localChanges }, {
      basedOnPublishedVersion: data.publishedVersion,
      hasLocalChanges: true,
      source: "Imported backup",
    });
  } catch (error) {
    try {
      commitCollections(previousCollections, previousMeta);
      await replaceAllBlobs(previousBlobs.map(({ id, blob }) => ({ id, blob })));
    } catch (restoreError) {
      throw new Error("Impor gagal dan pemulihan otomatis perlu bantuan. Jangan tutup tab; hubungi Owner.", { cause: restoreError });
    }
    const partial = sharedWritesStarted
      ? " Sebagian perubahan bersama mungkin sudah tersimpan di server; ekspor data terbaru sebelum mencoba lagi."
      : "";
    throw new Error(`Impor gagal. Data lokal sebelumnya dipertahankan.${partial} ${error.message}`, { cause: error });
  }
  return Object.fromEntries(COLLECTIONS.map((name) => [name, readCollection(name)]));
}

export async function resetData(kind) {
  if (!publishedPackage) {
    const response = await fetch(publishedUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("Data publikasi tidak bisa dimuat untuk pemulihan.");
    publishedPackage = normalizePackage(await response.json());
  }
  if (!["demo", "all", "published"].includes(kind)) throw new Error("Jenis pemulihan tidak dikenal.");
  storage();
  const previous = localCollections();
  const previousMeta = readMeta();
  const next = kind === "all" ? Object.fromEntries(COLLECTIONS.map((name) => [name, []])) : deepClone(publishedPackage.collections);
  const meta = {
    basedOnPublishedVersion: publishedPackage.publishedVersion,
    hasLocalChanges: kind === "demo",
    source: kind === "demo" ? "Local changes" : "Published",
  };
  try {
    const sharedChanges = Object.fromEntries(Object.entries(next).filter(([name]) => SHARED_COLLECTIONS.has(name)));
    if (Object.keys(sharedChanges).length) await writeCollections(sharedChanges);
    const localChanges = Object.fromEntries(Object.entries(next).filter(([name]) => !SHARED_COLLECTIONS.has(name)));
    commitCollections({ ...previous, ...localChanges }, meta);
    if (kind === "all") {
      const request = await dbOpen();
      await new Promise((resolve, reject) => {
        const transaction = request.transaction(DB_STORES, "readwrite");
        DB_STORES.forEach((name) => transaction.objectStore(name).clear());
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });
      request.close();
    }
  } catch (error) {
    commitCollections(previous, previousMeta);
    throw error;
  }
  return { collections: deepClone(next), meta: readMeta() };
}

export async function resolvePublishedConflict(choice) {
  if (!publishedPackage) throw new Error("Data publikasi terbaru tidak tersedia.");
  const meta = readMeta();
  const local = localCollections();
  if (choice === "published") {
    commitCollections(publishedPackage.collections, {
      basedOnPublishedVersion: publishedPackage.publishedVersion,
      hasLocalChanges: false,
      source: "Published",
    });
  } else if (choice === "keep") {
    commitCollections(local, {
      basedOnPublishedVersion: publishedPackage.publishedVersion,
      hasLocalChanges: true,
      source: "Local changes",
    });
  } else if (choice === "merge") {
    const merged = {};
    for (const name of COLLECTIONS) {
      const ids = new Set(local[name].map((record) => record.id));
      merged[name] = [...local[name], ...publishedPackage.collections[name].filter((record) => !ids.has(record.id))];
    }
    commitCollections(merged, {
      basedOnPublishedVersion: publishedPackage.publishedVersion,
      hasLocalChanges: true,
      source: "Local changes",
    });
  } else {
    throw new Error("Pilihan pembaruan tidak dikenal.");
  }
  return { collections: localCollections(), meta: readMeta() ?? meta };
}

export function createRecord(fields = {}) {
  const now = new Date().toISOString();
  return { ...fields, id: crypto.randomUUID(), createdAt: now, updatedAt: now, deletedAt: null };
}

export function sourceLabel() {
  if (sharedConnection === "offline") return "Offline";
  if (sharedConnection === "online") return "Supabase";
  if (sharedConnection === "error") return "Cache";
  if (globalThis.navigator?.onLine === false) return "Offline";
  const meta = readMeta();
  return meta?.hasLocalChanges ? meta.source ?? "Local changes" : "Published";
}

export function isSharedStorageOnline() {
  return sharedConnection === "online" && globalThis.navigator?.onLine !== false;
}

export function publishedDataUrl() {
  return publishedUrl;
}
