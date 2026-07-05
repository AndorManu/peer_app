// Peer — live verification of public-room discovery (migration 0006).
// A creates one PUBLIC and one PRIVATE room. B (a stranger) must: see the
// public one in the discovery listing (safe fields only, no invite code),
// NOT see the private one anywhere, join the public one via RPC and read its
// row, and be REFUSED a join_public_room on the private id. Presence/chat
// paths reuse the room machinery already proven by verify-rooms.mjs.
// Usage: node tools/verify-discovery.mjs
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

const stamp = Date.now();
const password = `Peer-disc-${stamp}!`;
const mk = (tag) => admin.auth.admin.createUser({ email: `peer-disc-${tag}-${stamp}@example.com`, password, email_confirm: true });
const { data: userA } = await mk("a");
const { data: userB } = await mk("b");

try {
  const login = async (user) => {
    const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: user.user.email, password });
    return client;
  };
  const clientA = await login(userA);
  const clientB = await login(userB);

  // A creates one public and one private room
  const mkRoom = async (name, visibility) => {
    const { data, error } = await clientA.from("rooms").insert({
      owner_id: userA.user.id, name, topic: name, domain_id: "science", visibility,
    }).select().single();
    if (error) throw new Error(error.message);
    await clientA.from("room_members").upsert({ room_id: data.id, user_id: userA.user.id, role: "owner" });
    return data;
  };
  const publicRoom = await mkRoom(`Astro study hall ${stamp}`, "public");
  const privateRoom = await mkRoom(`Secret exam prep ${stamp}`, "private");
  check("A created a public and a private room", !!publicRoom.id && !!privateRoom.id);

  // B's discovery listing: public visible, private absent, safe fields only
  const { data: listing, error: listError } = await clientB.rpc("list_public_rooms");
  check("B can call list_public_rooms", !listError, listError?.message);
  const foundPublic = (listing || []).find((room) => room.id === publicRoom.id);
  const foundPrivate = (listing || []).find((room) => room.id === privateRoom.id);
  check("public room appears in B's discovery feed", !!foundPublic, `${foundPublic?.name} · ${foundPublic?.member_count} member(s)`);
  check("private room does NOT appear in discovery", !foundPrivate);
  check("listing exposes no invite code or owner id", foundPublic && !("invite_code" in foundPublic) && !("owner_id" in foundPublic));
  check("listing carries member count + domain", foundPublic && Number(foundPublic.member_count) === 1 && foundPublic.domain_id === "science");

  // B cannot see the private room through the table either
  const { data: bPeeks } = await clientB.from("rooms").select("id").eq("id", privateRoom.id);
  check("private room row is invisible to B (RLS)", (bPeeks || []).length === 0);

  // join_public_room refuses the private id, accepts the public one
  const { error: privateJoin } = await clientB.rpc("join_public_room", { room: privateRoom.id });
  check("join_public_room refuses a private room id", Boolean(privateJoin), privateJoin?.message);
  const { data: joined, error: joinError } = await clientB.rpc("join_public_room", { room: publicRoom.id });
  const joinedRoom = Array.isArray(joined) ? joined[0] : joined;
  check("B joins the public room via discovery", !joinError && joinedRoom?.id === publicRoom.id);

  // membership is real: B now reads the room row + member count went up
  const { data: bReads } = await clientB.from("rooms").select("id, name").eq("id", publicRoom.id);
  check("B can read the joined room (member RLS)", (bReads || []).length === 1);
  const { data: relisted } = await clientB.rpc("list_public_rooms");
  const recount = (relisted || []).find((room) => room.id === publicRoom.id);
  check("member count updates in the feed", Number(recount?.member_count) === 2, `now ${recount?.member_count}`);

  // and the private room's CONTENTS stay sealed even after B joined a public one
  const { data: bPeeks2 } = await clientB.from("room_members").select("user_id").eq("room_id", privateRoom.id);
  check("private room membership stays invisible to B", (bPeeks2 || []).length === 0);
} finally {
  // clean up throwaway users + their rooms (cascade)
  for (const user of [userA, userB]) {
    if (user?.user?.id) await admin.auth.admin.deleteUser(user.user.id).catch(() => {});
  }
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

function loadDotEnv() {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
