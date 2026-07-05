// Peer — apply SQL migrations to the Supabase Postgres database.
// Usage: node tools/db-migrate.mjs
// Reads SUPABASE_URL + SUPABASE_DB_PASSWORD from .env. Tracks applied files in
// public._migrations so re-runs are no-ops.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import pg from "pg";

loadDotEnv();

const url = process.env.SUPABASE_URL || "";
const password = process.env.SUPABASE_DB_PASSWORD || "";
const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!ref || !password || /REPLACE_WITH/i.test(password)) {
  console.error("Missing SUPABASE_URL or SUPABASE_DB_PASSWORD in .env");
  process.exit(1);
}

// Direct connections are IPv6-only; the session pooler is IPv4. Try direct
// first, then common-region poolers.
const candidates = [
  { host: `db.${ref}.supabase.co`, port: 5432, user: "postgres" },
  ...["eu-west-1", "eu-central-1", "eu-west-2", "eu-west-3", "eu-north-1", "us-east-1", "us-east-2", "us-west-1"].map((region) => ({
    host: `aws-0-${region}.pooler.supabase.com`,
    port: 5432,
    user: `postgres.${ref}`,
  })),
];

async function connect() {
  let lastError;
  for (const candidate of candidates) {
    const client = new pg.Client({
      host: candidate.host,
      port: candidate.port,
      user: candidate.user,
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      console.log(`Connected via ${candidate.host}`);
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
    }
  }
  throw lastError;
}

const client = await connect();
try {
  await client.query(`
    create table if not exists public._migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const { rows } = await client.query("select name from public._migrations");
  const applied = new Set(rows.map((row) => row.name));

  const dir = resolve(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip    ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    console.log(`apply   ${file} ...`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into public._migrations (name) values ($1)", [file]);
      await client.query("commit");
      console.log(`done    ${file}`);
    } catch (error) {
      await client.query("rollback");
      console.error(`FAILED  ${file}: ${error.message}`);
      process.exitCode = 1;
      break;
    }
  }
} finally {
  await client.end();
}

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
