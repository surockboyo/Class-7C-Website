import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTIONS,
  initializeStorage,
  migratePackage,
  parseImportText,
  previewImport,
  readCollection,
  validateCollection,
  writeCollection,
  commitImport,
} from "../assets/js/storage.js";

class MemoryStorage {
  values = new Map();
  failKey = null;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) {
    if (this.failKey && String(key).includes(this.failKey)) {
      this.failKey = null;
      throw new DOMException("Quota penuh", "QuotaExceededError");
    }
    this.values.set(String(key), String(value));
  }
  removeItem(key) { this.values.delete(String(key)); }
  clear() { this.values.clear(); }
}

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
let memory;
const now = "2026-11-01T00:00:00.000Z";
const record = (id, fields = {}) => ({ id, createdAt: now, updatedAt: now, deletedAt: null, ...fields });

function packageData(overrides = {}) {
  const collections = Object.fromEntries(COLLECTIONS.map((name) => [name, []]));
  collections.classInfo = [record("class-1", { name: "Kelas contoh" })];
  return {
    schemaVersion: 1,
    appVersion: "1.0.0",
    publishedVersion: 1,
    collections: { ...collections, ...overrides },
    blobs: [],
  };
}

beforeEach(async () => {
  memory = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memory });
  globalThis.fetch = async () => new Response(JSON.stringify(packageData()), { status: 200, headers: { "Content-Type": "application/json" } });
  await initializeStorage();
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else delete globalThis.localStorage;
});

test("rejects malformed JSON and unsupported schema without changing stored data", () => {
  const before = readCollection("classInfo");
  assert.throws(() => parseImportText("{broken"), /bukan JSON yang valid/);
  assert.throws(() => migratePackage({ schemaVersion: 4, publishedVersion: 1, collections: {} }), /tidak didukung/);
  assert.deepEqual(readCollection("classInfo"), before);
});

test("validates duplicate IDs and migrates an older schema", () => {
  const duplicate = [record("same"), record("same")];
  assert.throws(() => validateCollection("homework", duplicate), /ID ganda/);
  const migrated = migratePackage({
    schemaVersion: 0,
    publishedVersion: 0,
    collections: { homework: [{ title: "PR lama" }] },
  });
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.collections.homework[0].id, "legacy-homework-1");
  assert.equal(migrated.collections.homework[0].deletedAt, null);
});

test("quota failure rolls back every local collection write", async () => {
  const before = new Map(memory.values);
  memory.failKey = "theme";
  await assert.rejects(writeCollection("theme", [record("new-theme")]), /Quota penuh/);
  memory.failKey = null;
  assert.deepEqual(memory.values, before);
  assert.deepEqual(readCollection("theme"), []);
});

test("rejects imports with missing image blobs before committing", () => {
  const payload = packageData({
    gallery: [record("photo-1", { blobId: "missing-blob", caption: "Foto" })],
  });
  assert.throws(() => previewImport(payload), /gambar yang hilang/);
  assert.equal(readCollection("classInfo")[0].name, "Kelas contoh");
});

test("a failed import leaves existing data unchanged", async () => {
  const before = readCollection("classInfo");
  const payload = packageData({ classInfo: [record("replacement", { name: "Jangan ganti" })] });
  const preview = previewImport(payload);
  await assert.rejects(commitImport(preview), /IndexedDB.*tidak tersedia/);
  assert.deepEqual(readCollection("classInfo"), before);
});
