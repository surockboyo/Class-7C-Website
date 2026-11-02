export const SHARED_COLLECTIONS = [
  "classInfo",
  "homework",
  "exams",
  "kisi-kisi",
  "announcements",
  "schedule",
  "scheduleSettings",
  "students",
  "galleryPosts",
  "albums",
  "birthdays",
  "piket",
  "siteSettings",
  "wheelHistory",
];

const LEGACY_COLLECTIONS = {
  classInfo: "classInfo",
  homework: "homework",
  exams: "exams",
  outlines: "kisi-kisi",
  announcements: "announcements",
  customSections: "classInfo",
  schedule: "schedule",
  students: "students",
  "kisi-kisi": "kisi-kisi",
  galleryPosts: "galleryPosts",
  albums: "albums",
  birthdays: "birthdays",
  piket: "piket",
  scheduleSettings: "scheduleSettings",
  siteSettings: "siteSettings",
  settings: "siteSettings",
  gallery: "galleryPosts",
  wheelHistory: "wheelHistory",
};
const CACHE_KEY = "ruangTemu:supabase-cache:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RecordConflictError extends Error {
  constructor(message, latestRecord = null) {
    super(message);
    this.name = "RecordConflictError";
    this.latestRecord = latestRecord;
  }
}

function clone(value) {
  return structuredClone(value);
}

function emptyCache() {
  return { collections: {}, versions: {}, initialized: false };
}

function decodeCache(cache) {
  if (!cache || typeof cache !== "object") return emptyCache();
  if (!cache.collections || typeof cache.collections !== "object" || !cache.versions || typeof cache.versions !== "object") {
    throw new Error("Struktur cache data bersama tidak valid.");
  }
  return cache;
}

function sourceData(collection, record) {
  const data = clone(record);
  if (collection === "settings") {
    const sharedKeys = ["switchTime", "schoolDays", "whatsappNumber", "galleryMaxBytes", "reportCooldownSeconds"];
    return {
      id: record.id,
      ...Object.fromEntries(sharedKeys.filter((key) => key in record).map((key) => [key, record[key]])),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      deletedAt: record.deletedAt,
      __sourceCollection: collection,
    };
  }
  if (collection !== LEGACY_COLLECTIONS[collection]) data.__sourceCollection = collection;
  return data;
}

function recordFromRow(row) {
  const { __sourceCollection, ...data } = row.data;
  return {
    record: {
      ...data,
      id: row.id,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    },
    sourceCollection: __sourceCollection,
  };
}

function toRow(collection, record) {
  const sharedCollection = LEGACY_COLLECTIONS[collection];
  if (!sharedCollection) throw new Error(`Koleksi ${collection} belum memakai penyimpanan bersama.`);
  if (!UUID_PATTERN.test(record.id)) {
    throw new Error("Data lama belum dipindahkan. Buat cadangan dan lakukan migrasi terkonfirmasi sebelum mengubahnya.");
  }
  return {
    collection: sharedCollection,
    id: record.id,
    data: sourceData(collection, record),
    deleted_at: record.deletedAt ?? null,
  };
}

function isOnline() {
  return globalThis.navigator?.onLine !== false;
}

function fromPrivateRow(row) {
  if ("title" in row) {
    return {
      ...row,
      id: row.id,
      createdAt: row.created_at,
      readAt: row.read ? row.created_at : null,
      archivedAt: row.archived ? row.created_at : null,
      replyNote: row.reply_note,
    };
  }
  return {
    ...row,
    id: row.id,
    createdAt: row.created_at,
    attachmentPaths: row.attachment_paths ?? [],
    status: row.status,
    note: row.note,
  };
}

export function createSharedStorage(client, {
  cacheStorage = globalThis.localStorage,
  validateCollection,
  online = isOnline,
  publicClient = client,
  isOwner = async (userId) => {
    const { data, error } = await client.from("owners")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Status Owner gagal diperiksa: ${error.message}`);
    return Boolean(data);
  },
} = {}) {
  if (!client?.from || !client?.auth?.getSession) throw new Error("Klien Supabase tidak valid.");
  if (!cacheStorage?.getItem || !cacheStorage?.setItem) throw new Error("Cache browser tidak tersedia.");
  if (typeof validateCollection !== "function") throw new Error("Validator data bersama tidak tersedia.");
  let realtimeChannel = null;

  function readCache() {
    try {
      return decodeCache(JSON.parse(cacheStorage.getItem(CACHE_KEY) ?? "null"));
    } catch (error) {
      throw new Error("Cache data bersama rusak. Data server tidak diubah.", { cause: error });
    }
  }

  function writeCache(cache) {
    const serialized = JSON.stringify(cache);
    cacheStorage.setItem(CACHE_KEY, serialized);
    if (cacheStorage.getItem(CACHE_KEY) !== serialized) throw new Error("Cache data bersama tidak berhasil disimpan.");
  }

  async function requireWriteAccess() {
    if (!online()) throw new Error("Kamu sedang offline. Perubahan Dashboard dinonaktifkan dan tidak disimpan.");
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(`Sesi Dashboard tidak dapat diperiksa: ${error.message}`);
    if (!data.session) throw new Error("Masuk sebagai Owner untuk menyimpan perubahan bersama.");
    if (!await isOwner(data.session.user.id)) throw new Error("Akun ini belum terdaftar sebagai Owner.");
    return data.session.user;
  }

  async function requireOwner() {
    if (!online()) throw new Error("Kamu sedang offline. Aksi ini memerlukan koneksi internet.");
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(`Sesi Dashboard tidak dapat diperiksa: ${error.message}`);
    if (!data.session || !await isOwner(data.session.user.id)) throw new Error("Masuk dengan akun Owner untuk membuka data ini.");
    return data.session.user;
  }

  async function refresh() {
    const data = [];
    for (let offset = 0; ; offset += 1000) {
      const { data: page, error } = await client
        .from("records")
        .select("collection,id,data,version,updated_at,deleted_at")
        .order("updated_at", { ascending: false })
        .range(offset, offset + 999);
      if (error) throw new Error(`Data bersama gagal dimuat: ${error.message}`);
      data.push(...(page ?? []));
      if ((page ?? []).length < 1000) break;
    }

    const cache = emptyCache();
    const priorCache = readCache();
    for (const name of Object.keys(LEGACY_COLLECTIONS)) cache.collections[name] = [];
    for (const name of ["albums", "birthdays", "piket", "scheduleSettings"]) cache.collections[name] = [];

    for (const row of data ?? []) {
      const { record, sourceCollection } = recordFromRow(row);
      const legacyNames = Object.entries(LEGACY_COLLECTIONS)
        .filter(([, sharedName]) => sharedName === row.collection)
        .map(([legacyName]) => legacyName);
      let legacyName = legacyNames[0];
      if (sourceCollection) legacyName = sourceCollection;
      if (!legacyName) continue;
      if (legacyName === "settings") {
        const local = priorCache.collections.settings?.find((item) => item.id === record.id) ?? priorCache.collections.settings?.[0];
        Object.assign(record, Object.fromEntries(
          ["mutedWheel", "vibrationEnabled", "excludePicked", "pickedStudentIds", "galleryMode", "galleryAlbum", "gallerySearch", "lastReportAt"]
            .filter((key) => local && key in local)
            .map((key) => [key, local[key]]),
        ));
      }
      cache.collections[legacyName].push(record);
      cache.versions[`${row.collection}:${row.id}`] = row.version;
    }
    if (!cache.collections.settings.length && priorCache.collections.settings?.length) {
      cache.collections.settings = clone(priorCache.collections.settings);
    }
    for (const name of Object.keys(cache.collections)) validateCollection(name, cache.collections[name]);
    cache.initialized = true;
    cache.rowCount = (data ?? []).length;
    writeCache(cache);
    return cache;
  }

  async function submitReport({ name, message, attachmentPaths = [] }) {
    if (!online()) throw new Error("Kamu sedang offline. Laporan belum dikirim.");
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 100) throw new Error("Nama laporan harus 1-100 karakter.");
    if (typeof message !== "string" || message.trim().length < 1 || message.trim().length > 5000) throw new Error("Pesan laporan harus 1-5000 karakter.");
    if (!Array.isArray(attachmentPaths) || attachmentPaths.length > 5) throw new Error("Lampiran laporan maksimal 5 gambar.");
    const { error } = await publicClient.from("reports").insert({
      name: name.trim(),
      message: message.trim(),
      attachment_paths: attachmentPaths,
    });
    if (error) throw new Error(`Laporan gagal dikirim ke kotak masuk: ${error.message}`);
    return { id: crypto.randomUUID(), name: name.trim(), message: message.trim(), attachmentPaths, status: "Baru", createdAt: new Date().toISOString() };
  }

  async function submitSuggestion({ title, message, name = "" }) {
    if (!online()) throw new Error("Kamu sedang offline. Saran belum dikirim.");
    if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 160) throw new Error("Judul saran harus 1-160 karakter.");
    if (typeof message !== "string" || message.trim().length < 1 || message.trim().length > 5000) throw new Error("Isi saran harus 1-5000 karakter.");
    if (typeof name !== "string" || name.length > 100) throw new Error("Nama maksimal 100 karakter.");
    const { error } = await publicClient.from("suggestions").insert({
      title: title.trim(),
      message: message.trim(),
      name: name.trim() || null,
    });
    if (error) throw new Error(`Saran gagal dikirim ke kotak masuk: ${error.message}`);
    return { id: crypto.randomUUID(), title: title.trim(), message: message.trim(), name: name.trim(), read: false, archived: false, replyNote: "", createdAt: new Date().toISOString() };
  }

  async function listInbox(name) {
    if (!["reports", "suggestions", "activity_log"].includes(name)) throw new Error("Kotak masuk tidak dikenal.");
    await requireOwner();
    const { data, error } = await client.from(name).select("*").order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(`Data ${name} gagal dimuat: ${error.message}`);
    return (data ?? []).map((row) => name === "activity_log"
      ? { ...row, createdAt: row.created_at, actor: row.actor }
      : fromPrivateRow(row));
  }

  async function updateInbox(name, id, changes) {
    if (!["reports", "suggestions"].includes(name)) throw new Error("Data kotak masuk ini tidak dapat diubah.");
    await requireOwner();
    const fields = name === "suggestions"
      ? { ...(changes.read === undefined ? {} : { read: changes.read }), ...(changes.archived === undefined ? {} : { archived: changes.archived }), ...(changes.replyNote === undefined ? {} : { reply_note: changes.replyNote }) }
      : { ...(changes.status === undefined ? {} : { status: changes.status }), ...(changes.note === undefined ? {} : { note: changes.note }) };
    if (!Object.keys(fields).length) throw new Error("Tidak ada perubahan untuk disimpan.");
    const { data, error } = await client.from(name).update(fields).eq("id", id).select("*").maybeSingle();
    if (error) throw new Error(`Perubahan kotak masuk gagal disimpan: ${error.message}`);
    if (!data) throw new Error("Item kotak masuk tidak ditemukan.");
    return fromPrivateRow(data);
  }

  async function deleteInbox(name, id, { confirmed = false } = {}) {
    if (!["reports", "suggestions"].includes(name)) throw new Error("Data kotak masuk ini tidak dapat dihapus.");
    if (!confirmed) throw new Error("Penghapusan memerlukan konfirmasi.");
    await requireOwner();
    const { data, error } = await client.from(name).delete().eq("id", id).select("id").maybeSingle();
    if (error) throw new Error(`Data kotak masuk gagal dihapus: ${error.message}`);
    if (!data) throw new Error("Item kotak masuk tidak ditemukan.");
  }

  async function addActivity({ action, record = null, description }) {
    const actor = await requireWriteAccess();
    const { error } = await client.from("activity_log").insert({
      action: String(action).slice(0, 60),
      record,
      description: String(description).slice(0, 500),
      actor: actor.id,
    });
    if (error) throw new Error(`Catatan aktivitas gagal disimpan: ${error.message}`);
  }

  async function uploadObject(bucket, path, blob, { contentType = blob?.type, upsert = false } = {}) {
    if (!(blob instanceof Blob)) throw new Error("Berkas gambar tidak valid.");
    if (bucket === "gallery") await requireOwner();
    else if (bucket === "report-attachments") {
      if (!online()) throw new Error("Kamu sedang offline. Lampiran belum diunggah.");
    } else throw new Error("Penyimpanan gambar tidak dikenal.");
    const storageClient = bucket === "report-attachments" ? publicClient : client;
    const { data, error } = await storageClient.storage.from(bucket).upload(path, blob, { contentType, upsert });
    if (error) throw new Error(`Gambar gagal diunggah: ${error.message}`);
    return data.path;
  }

  function publicImageUrl(path) {
    if (!path) return null;
    const { data } = client.storage.from("gallery").getPublicUrl(path);
    return data.publicUrl;
  }

  async function reportAttachmentUrl(path) {
    await requireOwner();
    const { data, error } = await client.storage.from("report-attachments").createSignedUrl(path, 60);
    if (error) throw new Error(`Lampiran laporan gagal dibuka: ${error.message}`);
    return data.signedUrl;
  }

  async function removeGalleryObject(path, { confirmed = false } = {}) {
    if (!confirmed) throw new Error("Penghapusan gambar permanen memerlukan konfirmasi.");
    await requireOwner();
    const { error } = await client.storage.from("gallery").remove([path]);
    if (error) throw new Error(`Gambar gagal dihapus: ${error.message}`);
  }

  async function getGalleryStorageUsage() {
    if (!online()) throw new Error("Perkiraan ukuran galeri memerlukan koneksi internet.");
    let offset = 0;
    let bytes = 0;
    let files = 0;
    for (;;) {
      const { data, error } = await publicClient.storage.from("gallery").list("", {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Ukuran galeri gagal diperiksa: ${error.message}`);
      const entries = data ?? [];
      for (const entry of entries) {
        const size = Number(entry.metadata?.size);
        if (Number.isFinite(size) && size >= 0) {
          bytes += size;
          files += 1;
        }
      }
      if (entries.length < 1000) break;
      offset += entries.length;
    }
    return { bytes, files };
  }

  function subscribePublicRecords(onRecord, onStatus) {
    if (typeof client.channel !== "function") throw new Error("Realtime Supabase tidak tersedia.");
    if (realtimeChannel) void client.removeChannel(realtimeChannel);
    realtimeChannel = client.channel("public-records")
      .on("postgres_changes", { event: "*", schema: "public", table: "records" }, onRecord)
      .subscribe(onStatus);
    return () => {
      if (!realtimeChannel) return;
      const channel = realtimeChannel;
      realtimeChannel = null;
      void client.removeChannel(channel);
    };
  }

  async function persistCollection(name, records, previousRecords) {
    validateCollection(name, records);
    await requireWriteAccess();
    const cache = readCache();
    const sharedName = LEGACY_COLLECTIONS[name];
    if (!sharedName) throw new Error(`Koleksi ${name} belum disiapkan untuk penyimpanan bersama.`);
    const priorRecords = name === "settings" ? previousRecords.filter((record) => UUID_PATTERN.test(record.id)) : previousRecords;
    const normalizedRecords = name === "settings"
      ? records.map((record) => UUID_PATTERN.test(record.id) ? record : { ...record, id: crypto.randomUUID() })
      : records;
    const oldById = new Map(priorRecords.map((record) => [record.id, record]));
    const nextById = new Map(normalizedRecords.map((record) => [record.id, record]));
    cache.collections[name] ??= [];
    if (name === "settings") cache.collections[name] = cache.collections[name].filter((record) => UUID_PATTERN.test(record.id));

    for (const [id, previous] of oldById) {
      if (nextById.has(id)) continue;
      const version = cache.versions[`${sharedName}:${id}`];
      if (!version) throw new Error("Data lama belum dipindahkan. Data lokal tetap utuh dan tidak diunggah.");
      const { data, error } = await client.from("records")
        .update({ deleted_at: new Date().toISOString() })
        .eq("collection", sharedName).eq("id", id).eq("version", version)
        .select("collection,id,data,version,updated_at,deleted_at").maybeSingle();
      if (error) throw new Error(`Data ${name} gagal dihapus: ${error.message}`);
      if (!data) throw new RecordConflictError("Data berubah di perangkat lain. Muat data terbaru sebelum mencoba lagi.");
      cache.versions[`${sharedName}:${id}`] = data.version;
      cache.collections[name] = cache.collections[name].map((record) => record.id === id
        ? { ...previous, deletedAt: data.deleted_at, updatedAt: data.updated_at }
        : record);
      writeCache(cache);
    }

    for (const record of normalizedRecords) {
      const previous = oldById.get(record.id);
      if (previous && JSON.stringify(previous) === JSON.stringify(record)) continue;
      const row = toRow(name, record);
      const key = `${sharedName}:${row.id}`;
      const version = cache.versions[key];
      let result;
      if (version) {
        result = await client.from("records")
          .update({ data: row.data, deleted_at: row.deleted_at })
          .eq("collection", sharedName).eq("id", row.id).eq("version", version)
          .select("collection,id,data,version,updated_at,deleted_at").maybeSingle();
      } else if (oldById.has(row.id)) {
        throw new Error("Data lokal lama belum dipindahkan. Data lokal tetap utuh dan tidak diunggah.");
      } else {
        result = await client.from("records")
          .insert(row)
          .select("collection,id,data,version,updated_at,deleted_at").single();
      }
      if (result.error) throw new Error(`Data ${name} gagal disimpan: ${result.error.message}`);
      if (!result.data) {
        const latest = await client.from("records").select("data,updated_at,deleted_at,version")
          .eq("collection", sharedName).eq("id", row.id).maybeSingle();
        if (latest.error) throw new Error(`Konflik terdeteksi, tetapi data terbaru gagal dimuat: ${latest.error.message}`);
        const latestRecord = latest.data ? recordFromRow({ ...latest.data, id: row.id }).record : null;
        throw new RecordConflictError("Data berubah di perangkat lain. Muat data terbaru untuk meninjau konflik.", latestRecord);
      }
      cache.versions[key] = result.data.version;
      cache.collections[name] = [
        ...cache.collections[name].filter((item) => item.id !== row.id),
        recordFromRow(result.data).record,
      ];
      writeCache(cache);
    }
    return clone(cache.collections[name]);
  }

  async function hardDelete(name, id, { confirmed = false } = {}) {
    if (!confirmed) throw new Error("Hapus permanen memerlukan konfirmasi.");
    await requireWriteAccess();
    const sharedName = LEGACY_COLLECTIONS[name];
    if (!sharedName) throw new Error(`Koleksi ${name} belum memakai penyimpanan bersama.`);
    const cache = readCache();
    const key = `${sharedName}:${id}`;
    const version = cache.versions[key];
    if (!version) throw new Error("Data belum tersimpan di server atau masih memakai ID lama.");
    const { data, error } = await client.from("records").delete()
      .eq("collection", sharedName).eq("id", id).eq("version", version)
      .select("id").maybeSingle();
    if (error) throw new Error(`Data ${name} gagal dihapus permanen: ${error.message}`);
    if (!data) throw new RecordConflictError("Data berubah di perangkat lain. Muat data terbaru sebelum menghapusnya.");
    cache.collections[name] = (cache.collections[name] ?? []).filter((record) => record.id !== id);
    delete cache.versions[key];
    writeCache(cache);
    return clone(cache.collections[name]);
  }

  return {
    readCache,
    refresh,
    persistCollection,
    hardDelete,
    submitReport,
    submitSuggestion,
    listInbox,
    updateInbox,
    deleteInbox,
    addActivity,
    uploadObject,
    publicImageUrl,
    reportAttachmentUrl,
    removeGalleryObject,
    getGalleryStorageUsage,
    subscribePublicRecords,
  };
}
