import { getSupabaseClient } from "./supabase-client.js";

export function createOwnerAuth(client, { now = Date.now } = {}) {
  if (!client?.auth?.getSession || !client?.auth?.signInWithPassword || !client?.from) {
    throw new Error("Klien autentikasi Supabase tidak valid.");
  }

  let failedAttempts = 0;
  let lockedUntil = 0;

  async function checkMembership(session) {
    if (!session) return { isOwner: false, user: null };
    const { data, error } = await client.from("owners")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) throw new Error(`Status Owner gagal diperiksa: ${error.message}`);
    if (!data) {
      await client.auth.signOut();
      return { isOwner: false, user: null };
    }
    return { isOwner: true, user: session.user };
  }

  async function getStatus() {
    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(`Sesi Dashboard gagal diperiksa: ${error.message}`);
    return checkMembership(data.session);
  }

  async function signIn(email, password) {
    const wait = lockedUntil - now();
    if (wait > 0) throw new Error(`Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(wait / 1000)} detik.`);
    const cleanEmail = typeof email === "string" ? email.trim() : "";
    if (!cleanEmail || typeof password !== "string" || !password) {
      throw new Error("Isi Username dan Password terlebih dahulu.");
    }

    const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) {
      failedAttempts += 1;
      if (failedAttempts >= 3) {
        lockedUntil = now() + 5000;
        failedAttempts = 0;
      }
      throw new Error("Username atau Password belum cocok. Coba cek lagi, ya.");
    }

    try {
      const status = await checkMembership(data.session);
      if (!status.isOwner) throw new Error("Akun ini belum terdaftar sebagai Owner.");
      failedAttempts = 0;
      lockedUntil = 0;
      return status;
    } catch (error) {
      await client.auth.signOut();
      throw error;
    }
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw new Error(`Keluar Dashboard gagal: ${error.message}`);
  }

  function subscribe(callback) {
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      queueMicrotask(async () => {
        try {
          callback(await checkMembership(session), null);
        } catch (error) {
          callback({ isOwner: false, user: null }, error);
        }
      });
    });
    return () => data.subscription.unsubscribe();
  }

  return { getStatus, signIn, signOut, subscribe };
}

let ownerAuth;

function getOwnerAuth() {
  if (!ownerAuth) ownerAuth = createOwnerAuth(getSupabaseClient());
  return ownerAuth;
}

export const getOwnerStatus = () => getOwnerAuth().getStatus();
export const signInOwner = (email, password) => getOwnerAuth().signIn(email, password);
export const signOutOwner = () => getOwnerAuth().signOut();
export const subscribeOwnerAuth = (callback) => getOwnerAuth().subscribe(callback);
