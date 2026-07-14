// Peer — live two-user room verification against the Supabase project.
// User A creates a room; user B joins via the invite code (RPC); both connect
// to the realtime channel from separate clients ("different devices"), see
// each other's presence, exchange a chat message, and sync a quiz event.
// Also proves isolation: outsiders can't see the room, fake a join, or
// subscribe/broadcast on the room's private realtime channel.
// Usage: node tools/verify-rooms.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

loadDotEnv();
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};
const until = (fn, ms = 8000) => new Promise((resolveWait) => {
  const started = Date.now();
  const timer = setInterval(() => {
    if (fn() || Date.now() - started > ms) {
      clearInterval(timer);
      resolveWait(fn());
    }
  }, 150);
});

const stamp = Date.now();
const password = `Peer-rooms-${stamp}!`;
const mk = (tag) => admin.auth.admin.createUser({ email: `peer-rooms-${tag}-${stamp}@example.com`, password, email_confirm: true });
const { data: userA } = await mk("a");
const { data: userB } = await mk("b");
const { data: userC } = await mk("c"); // the outsider

try {
  const login = async (user) => {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: user.user.email, password });
    return client;
  };
  const clientA = await login(userA);
  const clientB = await login(userB);
  const clientC = await login(userC);

  // A creates a room
  const { data: room, error: createError } = await clientA.from("rooms").insert({
    owner_id: userA.user.id, name: "Spanish B2 talk hour", topic: "Spanish B2", domain_id: "language",
  }).select().single();
  check("A creates a room", !createError && !!room?.invite_code, room?.invite_code);
  await clientA.from("room_members").upsert({ room_id: room.id, user_id: userA.user.id, role: "owner" });

  // outsider C cannot see it, cannot guess-join without the code
  const { data: cSees } = await clientC.from("rooms").select("id").eq("id", room.id);
  check("outsider cannot see the room (RLS)", (cSees || []).length === 0);
  const { error: badJoin } = await clientC.rpc("join_room_with_code", { code: "0000deadbeef" });
  check("wrong invite code is rejected", Boolean(badJoin));

  // B joins with the real invite code
  const { data: joined, error: joinError } = await clientB.rpc("join_room_with_code", { code: room.invite_code });
  const joinedRoom = Array.isArray(joined) ? joined[0] : joined;
  check("B joins via invite code", !joinError && joinedRoom?.id === room.id);
  const { data: bSees } = await clientB.from("rooms").select("name").eq("id", room.id);
  check("B can now see the room", bSees?.[0]?.name === "Spanish B2 talk hour");

  // both connect to the realtime channel (two devices)
  const state = { membersA: [], msgB: null, quizB: null, subA: false, subB: false };
  const chA = clientA.channel(`room:${room.id}`, { config: { presence: { key: userA.user.id }, broadcast: { self: true }, private: true } });
  const chB = clientB.channel(`room:${room.id}`, { config: { presence: { key: userB.user.id }, broadcast: { self: true }, private: true } });

  chA.on("presence", { event: "sync" }, () => { state.membersA = Object.values(chA.presenceState()).flat(); });
  chB.on("broadcast", { event: "room-msg" }, ({ payload }) => { state.msgB = payload; });
  chB.on("broadcast", { event: "quiz" }, ({ payload }) => { state.quizB = payload; });

  chA.subscribe(async (status) => { if (status === "SUBSCRIBED") { state.subA = true; await chA.track({ userId: userA.user.id, name: "Ana" }); } });
  chB.subscribe(async (status) => { if (status === "SUBSCRIBED") { state.subB = true; await chB.track({ userId: userB.user.id, name: "Ben" }); } });

  await until(() => state.subA && state.subB);
  check("both clients connected to the realtime channel", state.subA && state.subB);

  await until(() => state.membersA.length >= 2);
  check("presence shows both partners", state.membersA.length >= 2, state.membersA.map((m) => m.name).join(", "));

  chA.send({ type: "broadcast", event: "room-msg", payload: { id: "m1", name: "Ana", userId: userA.user.id, text: "¡Explícame el subjuntivo!", at: Date.now() } });
  await until(() => Boolean(state.msgB));
  check("A's chat message reached B live", state.msgB?.text === "¡Explícame el subjuntivo!");

  chA.send({ type: "broadcast", event: "quiz", payload: { question: "ojalá + ?", answer: "subjuntivo", revealed: false, index: 1, total: 3, deckName: "Subjuntivo", byName: "Ana" } });
  await until(() => Boolean(state.quizB));
  check("co-op quiz question synced to B", state.quizB?.question === "ojalá + ?" && state.quizB?.revealed === false);

  // outsider C is an authenticated non-member: private-channel RLS on
  // realtime.messages must reject both subscribing and broadcasting to
  // this room's topic, independent of the "can't see the row" checks above.
  const stateC = { status: null, gotReply: false };
  const chC = clientC.channel(`room:${room.id}`, { config: { presence: { key: userC.user.id }, broadcast: { self: true }, private: true } });
  chC.on("broadcast", { event: "room-msg" }, () => { stateC.gotReply = true; });
  chC.subscribe((status) => { stateC.status = status; });
  await until(() => ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(stateC.status));
  check("outsider cannot subscribe to the room's private realtime channel", stateC.status !== "SUBSCRIBED", stateC.status);

  state.msgB = null;
  chC.send({ type: "broadcast", event: "room-msg", payload: { id: "spy", name: "C", userId: userC.user.id, text: "leaked", at: Date.now() } });
  chA.send({ type: "broadcast", event: "room-msg", payload: { id: "m2", name: "Ana", userId: userA.user.id, text: "still live", at: Date.now() } });
  await until(() => Boolean(state.msgB));
  check("outsider's broadcast never reached B", state.msgB?.text === "still live" && !stateC.gotReply);

  await chC.unsubscribe().catch(() => {});
  await chA.unsubscribe();
  await chB.unsubscribe();
} finally {
  for (const user of [userA, userB, userC]) {
    await admin.auth.admin.deleteUser(user.user.id).catch(() => {});
  }
  console.log("cleanup: room test users removed (room cascades away)");
}

process.exit(failures ? 1 : 0);

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && value && process.env[key] === undefined) process.env[key] = value;
  }
}
