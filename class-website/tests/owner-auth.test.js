import test from "node:test";
import assert from "node:assert/strict";
import { createOwnerAuth } from "../assets/js/owner-auth.js";

function fakeClient({ member = true, loginError = null } = {}) {
  const state = { session: null, signedOut: false };
  const client = {
    state,
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      signInWithPassword: async ({ email, password }) => {
        if (loginError || email !== "owner@example.test" || password !== "temporary-test-only") {
          return { data: { session: null }, error: loginError ?? new Error("invalid credentials") };
        }
        state.session = { user: { id: "owner-id" } };
        return { data: { session: state.session }, error: null };
      },
      signOut: async () => {
        state.session = null;
        state.signedOut = true;
        return { error: null };
      },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from(table) {
      assert.equal(table, "owners");
      return {
        select() { return this; },
        eq(_key, userId) { this.userId = userId; return this; },
        async maybeSingle() {
          return {
            data: member && this.userId === "owner-id" ? { user_id: this.userId } : null,
            error: null,
          };
        },
      };
    },
  };
  return client;
}

test("Owner sign-in requires a matching owners membership", async () => {
  const client = fakeClient();
  const auth = createOwnerAuth(client);
  const result = await auth.signIn("owner@example.test", "temporary-test-only");
  assert.equal(result.isOwner, true);
  assert.equal(result.user.id, "owner-id");
  await auth.signOut();
  assert.equal(client.state.session, null);
});

test("non-owner sessions are signed out and denied", async () => {
  const client = fakeClient({ member: false });
  const auth = createOwnerAuth(client);
  await assert.rejects(auth.signIn("owner@example.test", "temporary-test-only"), /belum terdaftar sebagai Owner/);
  assert.equal(client.state.session, null);
  assert.equal(client.state.signedOut, true);
});

test("repeated login failures briefly throttle retries", async () => {
  let time = 1000;
  const auth = createOwnerAuth(fakeClient({ loginError: new Error("denied") }), { now: () => time });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await assert.rejects(auth.signIn("owner@example.test", "wrong"), /belum cocok/);
  }
  await assert.rejects(auth.signIn("owner@example.test", "wrong"), /Terlalu banyak percobaan/);
  time += 5001;
  await assert.rejects(auth.signIn("owner@example.test", "wrong"), /belum cocok/);
});
