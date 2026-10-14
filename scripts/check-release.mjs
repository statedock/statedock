import { readFile, lstat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const forbiddenNames = new Set([
  "billing-routes.ts",
  "BillingModal.tsx",
  "membership-service.ts",
  "entitlements.ts",
  "stripe.ts",
  "create-redemption-code.ts",
  "LandingPage.tsx",
  "MoreFunPage.tsx",
  "landing.css",
  "more-fun.css",
  "more-fun-content.ts",
  "TodoDemo.tsx",
  "HomepageSections.tsx",
  "CollaborationExamples.tsx",
]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk_live_|rk_live_)[A-Za-z0-9]{12,}/,
  /\bsdm_[a-f0-9]{64}\b/i,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
];
const exampleDomain = /(?:^|\.)(?:example\.(?:com|net|org|test)|test|invalid)$/i;
// Reviewed upstream reference only; runtime endpoints and other files remain blocked.
const reviewedReferenceUrls = new Map([
  ["skills/statedock/SKILL.md", new Set(["https://statedock.dev/skill.md"])],
]);

export async function checkRelease(root) {
  const { stdout } = await run(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root },
  );
  const failures = [];
  for (const rel of new Set(stdout.split("\0").filter(Boolean))) {
    const parts = rel.split("/"),
      name = parts.at(-1);
    const example = name === ".dev.vars.example" || name === ".env.example";
    if (
      name === "wrangler.deploy.jsonc" ||
      name.startsWith(".vapid") ||
      (!example && (name.startsWith(".dev.vars") || name === ".env" || name.startsWith(".env."))) ||
      parts.some((p) => ["backups", ".wrangler", "node_modules", "dist"].includes(p)) ||
      /\.(?:sqlite|db)(?:-(?:shm|wal))?$/.test(name) ||
      /\.(?:pem|key|p12)$/.test(name)
    ) {
      failures.push(`${rel}: personal configuration, credentials or generated data in release`);
      continue;
    }
    if (forbiddenNames.has(name)) failures.push(`${rel}: excluded Cloud or marketing module`);
    const file = path.join(root, rel);
    let stat;
    try {
      stat = await lstat(file);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) {
      failures.push(`${rel}: symbolic links require explicit review`);
      continue;
    }
    if (!stat.isFile()) continue;
    const source = await readFile(file, "utf8");
    if (source.includes("\0")) continue;
    // The scanner contains signatures; do not match its own expressions.
    if (rel !== "scripts/check-release.mjs") {
      if (secretPatterns.some((p) => p.test(source)))
        failures.push(`${rel}: credential signature detected`);
      if (/(?:\/Volumes\/[^\s"']+|\/Users\/[^\s"']+|\/home\/(?!runner\/)[^\s"']+)/.test(source))
        failures.push(`${rel}: personal machine path detected`);
      for (const match of source.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
        // The public security contact is reviewed; other real emails remain blocked.
        if (
          !(rel === "SECURITY.md" && match[0] === "support@statedock.dev") &&
          !exampleDomain.test(match[1])
        ) {
          failures.push(`${rel}: non-example email requires review`);
          break;
        }
      }
      const urlsToCheck = source.replace(/https?:\/\/[^\s<>"'`)\]}]+/gi, (url) =>
        reviewedReferenceUrls.get(rel)?.has(url) ? "" : url,
      );
      if (/https?:\/\/(?:[a-z0-9-]+\.)*statedock\.dev\b/i.test(urlsToCheck))
        failures.push(`${rel}: official or operator instance URL in self-hosted release`);
    }
    if (
      rel.startsWith("apps/online/src/") &&
      /\b(?:isPro|plan_tier|STRIPE_SECRET_KEY|redemption_codes)\b/.test(source)
    )
      failures.push(`${rel}: commercial coupling remains`);
  }
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = await checkRelease(process.cwd());
  for (const failure of failures) console.error(failure);
  if (failures.length) process.exitCode = 1;
  else
    console.log(
      "Release source check passed: no personal config/data, detected credentials, operator URLs or Cloud/marketing modules.",
    );
}
