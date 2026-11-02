import test from "node:test";
import assert from "node:assert/strict";
import { createSharedStorage, RecordConflictError } from "../assets/js/shared-storage.js";

const ID = "3a5988e2-e001-4fc7-a407-91dfb13039ab";
const OTHER_ID = "4a5988e2-e001-4fc7-a407-91dfb13039ac";
const now = "2026-11-01T00:00:00.000Z";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

class RecordsQuery {
  constructor(client) {
    this.client = client;
    this.filters = [];
    this.operation = "select";
    this.payload = null;
  }
  select() { return this; }
  order() { return this; }
  range() { return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  delete() { this.operation = "delete"; return this; }
  async maybeSingle() {
    const result = await this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
  }
  async single() {
    const result = await this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
  }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async execute() {
    let rows = this.client.rows.filter((row) => this.filters.every(([key, value]) => row[key] === value));
    if (this.operation === "select") return { data: structuredClone(rows), error: null };
    if (this.operation === "insert") {
      const row = { ...structuredClone(this.payload), version: 1, updated_at: now, updated_by: null };
      this.client.rows.push(row);
      return { data: [structuredClone(row)], error: null };
    }
    if (this.operation === "update") {
      rows.forEach((row) => {
        Object.assign(row, structuredClone(this.payload));
        row.version += 1;
        row.updated_at = "2026-11-01T00:01:00.000Z";
      });

      test("gallery and site settings map to public shared records without syncing browser preferences", async () => {
        const client = makeClient();
        const storage = makeStorage(client);
        await storage.refresh();
        const settings = {
          id: "main",
          switchTime: "19:30",
          whatsappNumber: "",
          mutedWheel: true,
          lastReportAt: 123,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        const saved = await storage.persistCollection("settings", [settings], [settings]);
        assert.match(saved[0].id, UUID_PATTERN);
        assert.equal(client.rows[0].collection, "siteSettings");
        assert.equal(client.rows[0].data.switchTime, "19:30");
        assert.equal("mutedWheel" in client.rows[0].data, false);
        assert.equal("lastReportAt" in client.rows[0].data, false);
      });
      return { data: structuredClone(rows), error: null };
    }
    if (this.operation === "delete") {
      this.client.rows = this.client.rows.filter((row) => !rows.includes(row));
      return { data: structuredClone(rows), error: null };
    }
    throw new Error("Unexpected fake query operation.");
  }
}

function makeClient(rows = [], { session = true } = {}) {
  return {
    rows: structuredClone(rows),
    auth: { getSession: async () => ({ data: { session: session ? { user: { id: "owner-id" } } : null }, error: null }) },
    from(table) {
      assert.equal(table, "records");
      return new RecordsQuery(this);
    },
  };
}

function validateCollection(_name, records) {
  assert.ok(Array.isArray(records));
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
}

function makeStorage(client, { online = () => true, cacheStorage = new MemoryStorage() } = {}) {
  return createSharedStorage(client, { cacheStorage, validateCollection, online, isOwner: async () => true });
}

function row(collection, id, data, version = 1) {
  return { collection, id, data, version, updated_at: now, deleted_at: null };
}

test("refresh maps shared records and custom sections into the local collection view", async () => {
  const client = makeClient([
    row("classInfo", ID, { id: ID, title: "Deskripsi", createdAt: now, updatedAt: now, deletedAt: null }),
    row("classInfo", OTHER_ID, { id: OTHER_ID, title: "Bagian baru", __sourceCollection: "customSections", createdAt: now, updatedAt: now, deletedAt: null }),
  ]);
  const storage = makeStorage(client);
  const cache = await storage.refresh();
  assert.equal(cache.collections.classInfo[0].title, "Deskripsi");
  assert.equal(cache.collections.customSections[0].title, "Bagian baru");
  assert.equal(cache.versions[`classInfo:${OTHER_ID}`], 1);
});

test("new shared records require an Owner session and update the cache after server confirmation", async () => {
  const client = makeClient();
  const storage = makeStorage(client);
  await storage.refresh();
  const record = { id: ID, title: "Tugas", createdAt: now, updatedAt: now, deletedAt: null };
  const saved = await storage.persistCollection("homework", [record], []);
  assert.equal(saved[0].title, "Tugas");
  assert.equal(client.rows[0].version, 1);
  assert.equal(storage.readCache().versions[`homework:${ID}`], 1);
});

test("updates use the cached version and report a conflict instead of overwriting", async () => {
  const client = makeClient([row("homework", ID, { id: ID, title: "Versi awal", createdAt: now, updatedAt: now, deletedAt: null })]);
  const storage = makeStorage(client);
  await storage.refresh();
  const cached = storage.readCache().collections.homework[0];
  client.rows[0].version = 2;
  client.rows[0].data.title = "Perubahan perangkat lain";
  await assert.rejects(
    storage.persistCollection("homework", [{ ...cached, title: "Perubahan lokal" }], [cached]),
    (error) => error instanceof RecordConflictError && error.latestRecord?.title === "Perubahan perangkat lain",
  );
  assert.equal(client.rows[0].data.title, "Perubahan perangkat lain");
});

test("offline and unauthenticated writes are rejected without queuing", async () => {
  const record = { id: ID, title: "Baru", createdAt: now, updatedAt: now, deletedAt: null };
  const offline = makeStorage(makeClient(), { online: () => false });
  await assert.rejects(offline.persistCollection("homework", [record], []), /offline/i);
  const signedOut = makeStorage(makeClient([], { session: false }));
  await assert.rejects(signedOut.persistCollection("homework", [record], []), /Owner/);
});

test("authenticated non-owners cannot write shared records", async () => {
  const storage = createSharedStorage(makeClient(), {
    cacheStorage: new MemoryStorage(),
    validateCollection,
    isOwner: async () => false,
  });
  await storage.refresh();
  const record = { id: ID, title: "Baru", createdAt: now, updatedAt: now, deletedAt: null };
  await assert.rejects(storage.persistCollection("homework", [record], []), /belum terdaftar sebagai Owner/);
});

test("legacy non-UUID records are never migrated implicitly", async () => {
  const client = makeClient();
  const storage = makeStorage(client);
  await storage.refresh();
  const legacy = { id: "legacy-homework-1", title: "Data lama", createdAt: now, updatedAt: now, deletedAt: null };
  await assert.rejects(
    storage.persistCollection("homework", [{ ...legacy, title: "Jangan pindahkan" }], [legacy]),
    /migrasi terkonfirmasi/,
  );
  assert.equal(client.rows.length, 0);
});

test("hard delete requires confirmation and a matching server version", async () => {
  const client = makeClient([row("homework", ID, { id: ID, title: "PR", createdAt: now, updatedAt: now, deletedAt: null })]);
  const storage = makeStorage(client);
  await storage.refresh();
  await assert.rejects(storage.hardDelete("homework", ID), /konfirmasi/);
  assert.equal(client.rows.length, 1);
  const remaining = await storage.hardDelete("homework", ID, { confirmed: true });
  assert.deepEqual(remaining, []);
  assert.equal(client.rows.length, 0);
});
