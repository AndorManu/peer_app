// Peer — live RLS verification against the Supabase project.
// Creates two throwaway users, writes rows as user A, and proves user B can
// neither read, modify, spoof, nor delete them — then cleans everything up.
// Usage: node tools/verify-supabase.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

loadDotEnv();

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const stamp = Date.now();
const password = `Peer-verify-${stamp}!`;
const emailA = `peer-verify-a-${stamp}@example.com`;
const emailB = `peer-verify-b-${stamp}@example.com`;

const { data: userA, error: createAError } = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true });
const { data: userB, error: createBError } = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true });
if (createAError || createBError) {
  console.error("Could not create test users:", createAError?.message || createBError?.message);
  process.exit(1);
}
const idA = userA.user.id;
const idB = userB.user.id;

async function signedInClient(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

try {
  const clientA = await signedInClient(emailA);
  const clientB = await signedInClient(emailB);

  // ---- user A writes their own data ----
  const { error: insertError } = await clientA.from("projects").insert({
    user_id: idA, id: "proj1", name: "Organic Chemistry", domain_id: "science",
  });
  check("A can insert their own project", !insertError, insertError?.message);

  await clientA.from("chats").insert({ user_id: idA, id: "chat1", project_id: "proj1", name: "SN2 help" });
  await clientA.from("messages").insert({ user_id: idA, id: "msg1", chat_id: "chat1", role: "user", content: "secret question about my exam" });
  await clientA.from("notes").insert({ user_id: idA, id: "note1", project_id: "proj1", title: "Private note", content: "my private study note" });

  const { data: ownRows } = await clientA.from("projects").select("id");
  check("A reads their own project back", ownRows?.length === 1);

  // ---- user B must be locked out ----
  const { data: bReadsProjects } = await clientB.from("projects").select("*");
  check("B cannot read A's projects", (bReadsProjects || []).length === 0, `${(bReadsProjects || []).length} rows leaked`);

  const { data: bReadsMessages } = await clientB.from("messages").select("*");
  check("B cannot read A's messages", (bReadsMessages || []).length === 0);

  const { data: bReadsNotes } = await clientB.from("notes").select("*");
  check("B cannot read A's notes", (bReadsNotes || []).length === 0);

  const { data: bUpdate } = await clientB.from("projects")
    .update({ name: "hacked" }).eq("user_id", idA).eq("id", "proj1").select();
  check("B cannot modify A's project", (bUpdate || []).length === 0);

  const { data: bDelete } = await clientB.from("projects")
    .delete().eq("user_id", idA).eq("id", "proj1").select();
  check("B cannot delete A's project", (bDelete || []).length === 0);

  const { error: spoofError } = await clientB.from("projects").insert({
    user_id: idA, id: "spoofed", name: "spoofed row",
  });
  check("B cannot insert rows AS user A", Boolean(spoofError), spoofError ? "rejected by RLS" : "SPOOF SUCCEEDED");

  const { error: usageWriteError } = await clientB.from("usage_events").insert({
    user_id: idB, kind: "chat", tokens_in: 0, tokens_out: 0,
  });
  check("clients cannot write their own usage metering", Boolean(usageWriteError), usageWriteError ? "rejected (server-only)" : "CLIENT METERED ITSELF");

  const { error: subWriteError } = await clientB.from("subscriptions").upsert({
    user_id: idB, status: "active", plan: "pro",
  });
  check("clients cannot grant themselves Pro", Boolean(subWriteError), subWriteError ? "rejected (webhook-only)" : "SELF-UPGRADE SUCCEEDED");

  // A's data survived all of it
  const { data: survivors } = await clientA.from("projects").select("name");
  check("A's data intact after B's attempts", survivors?.length === 1 && survivors[0].name === "Organic Chemistry");

  // service role (server) can see everything — used by webhooks/admin jobs
  const { data: adminRows } = await admin.from("projects").select("id").eq("user_id", idA);
  check("service role bypasses RLS (server-side)", (adminRows || []).length === 1);
} finally {
  await admin.auth.admin.deleteUser(idA).catch(() => {});
  await admin.auth.admin.deleteUser(idB).catch(() => {});
  console.log("cleanup: test users removed (cascades wiped their rows)");
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
