// Peer — secret hygiene verification.
// 1) Bundle scan: no secret from .env may appear in anything shipped to the
//    client (dist/). Only SUPABASE_URL + SUPABASE_ANON_KEY are browser-safe.
// 2) Repo scan: no tracked file may contain a secret value or key-shaped
//    string (pre-commit safety net — also run standalone anytime).
// Usage: node tools/verify-secrets.mjs [--staged]
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const SAFE_KEYS = new Set(["SUPABASE_URL", "SUPABASE_ANON_KEY", "PORT", "OPENAI_MODEL", "ANTHROPIC_MODEL"]);

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
};

// ---- load secret VALUES from .env ----
const envPath = resolve(ROOT, ".env");
const secrets = [];
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx === -1 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!key || !value || SAFE_KEYS.has(key) || value.length < 8) continue;
    secrets.push({ key, value });
  }
}

// ---- 1) client bundle scan ----
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const dist = resolve(ROOT, "dist");
if (!existsSync(dist)) {
  console.error("dist/ missing — run `npm run build` first.");
  process.exit(1);
}
let bundleLeaks = 0;
for (const file of walk(dist)) {
  if (!/\.(js|css|html|json|webmanifest|map|txt)$/i.test(file)) continue;
  const content = readFileSync(file, "utf8");
  for (const { key, value } of secrets) {
    if (content.includes(value)) {
      console.log(`LEAK  ${key} found in ${file}`);
      bundleLeaks += 1;
    }
  }
}
check(`client bundle contains no secrets (${secrets.length} checked across dist/)`, bundleLeaks === 0, `${bundleLeaks} leaks`);

// ---- 2) tracked-file scan (values + key-shaped patterns) ----
const staged = process.argv.includes("--staged");
const listCmd = staged ? "git diff --cached --name-only --diff-filter=ACM" : "git ls-files";
const tracked = execSync(listCmd, { cwd: ROOT }).toString().split(/\r?\n/).filter(Boolean)
  .filter((file) => !/^(package-lock\.json|dist\/)/.test(file))
  .filter((file) => /\.(js|jsx|ts|tsx|mjs|css|html|md|json|sql|toml|ya?ml|env.*)$/i.test(file));

const KEY_PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{24,}/, "Anthropic key"],
  [/sk-proj-[A-Za-z0-9_-]{24,}/, "OpenAI key"],
  [/sb_secret_[A-Za-z0-9_-]{16,}/, "Supabase service key"],
  [/sk_live_[A-Za-z0-9]{16,}/, "Stripe live secret"],
  [/sk_test_[A-Za-z0-9]{16,}/, "Stripe test secret"],
  [/whsec_[A-Za-z0-9]{16,}/, "Stripe webhook secret"],
  [/GOCSPX-[A-Za-z0-9_-]{16,}/, "Google client secret"],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, "private key material"],
];

let repoLeaks = 0;
for (const file of tracked) {
  let content;
  try { content = readFileSync(resolve(ROOT, file), "utf8"); } catch { continue; }
  for (const { key, value } of secrets) {
    if (content.includes(value)) {
      console.log(`LEAK  ${key} VALUE in tracked file ${file}`);
      repoLeaks += 1;
    }
  }
  for (const [pattern, label] of KEY_PATTERNS) {
    if (pattern.test(content)) {
      console.log(`LEAK  ${label} pattern in ${file}`);
      repoLeaks += 1;
    }
  }
}
check(`${staged ? "staged" : "tracked"} files contain no secret values or key patterns (${tracked.length} files)`, repoLeaks === 0, `${repoLeaks} findings`);

// ---- 3) .env is git-ignored ----
let envIgnored = false;
try {
  execSync("git check-ignore .env", { cwd: ROOT });
  envIgnored = true;
} catch { /* not ignored */ }
check(".env is git-ignored", envIgnored);

process.exit(failures ? 1 : 0);
