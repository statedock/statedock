import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkRelease } from "./check-release.mjs";

test("release scan permits the exact upstream Skill reference only in the reviewed Skill", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "release-scan-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const skillDir = path.join(root, "skills/statedock");
    await mkdir(skillDir, { recursive: true });
    const skill = path.join(skillDir, "SKILL.md");
    const upstream = "https://" + "statedock" + ".dev/skill.md";
    await writeFile(skill, `Upstream standard: <${upstream}>`);
    assert.deepEqual(await checkRelease(root), []);
    for (const url of [
      upstream + "/other",
      upstream + "?endpoint=mcp",
      upstream.replace("https:", "http:"),
      upstream.replace("/skill.md", "/mcp"),
      upstream.replace("statedock", "app.statedock"),
    ]) {
      await writeFile(skill, `Upstream standard: <${upstream}>\nEndpoint: ${url}`);
      assert.ok(
        (await checkRelease(root)).some((f) => f.includes("instance URL")),
        url,
      );
    }
    await writeFile(skill, `Upstream standard: <${upstream}>`);
    for (const rel of ["README.md", "runtime.ts", ".dev.vars.example"]) {
      await writeFile(path.join(root, rel), upstream);
      assert.ok(
        (await checkRelease(root)).some((f) => f.startsWith(`${rel}:`)),
        rel,
      );
      await rm(path.join(root, rel));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release scan ignores private local files but rejects force-tracked config and data", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "release-scan-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    await writeFile(
      path.join(root, ".gitignore"),
      ".dev.vars\n.vapid.json\nwrangler.deploy.jsonc\nbackups/\n",
    );
    await writeFile(path.join(root, ".vapid.json"), "{}");
    await writeFile(path.join(root, ".dev.vars"), "PRIVATE_TEST_VALUE=not-a-real-secret");
    await writeFile(path.join(root, ".dev.vars.example"), "OWNER_EMAIL=owner@example.com");
    await writeFile(path.join(root, "wrangler.deploy.jsonc"), "{}");
    await mkdir(path.join(root, "backups"));
    await writeFile(path.join(root, "backups", "database.sql"), "SELECT 1;");
    assert.deepEqual(await checkRelease(root), []);
    execFileSync(
      "git",
      ["add", "-f", ".dev.vars", ".vapid.json", "wrangler.deploy.jsonc", "backups/database.sql"],
      { cwd: root },
    );
    const failures = await checkRelease(root);
    assert.equal(failures.filter((f) => f.includes("personal configuration")).length, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release scan detects operator examples, emails, machine paths and credentials without printing values", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "release-scan-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const operator = "https://" + "test." + "statedock" + ".dev";
    const personal = "person@" + "mailbox" + ".com";
    const secret = "sdm_" + "a".repeat(64);
    await writeFile(
      path.join(root, "bad.md"),
      `${operator}\n${personal}\n${secret}\n${"/Users/" + "someone/project"}`,
    );
    const failures = await checkRelease(root);
    assert.equal(failures.length, 4);
    assert.ok(failures.every((f) => !f.includes(secret) && !f.includes(personal)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release scan allows only the reviewed security contact in the security policy", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "release-scan-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    const contact = "support@" + "statedock" + ".dev";
    await writeFile(path.join(root, "SECURITY.md"), `Contact: ${contact}`);
    assert.deepEqual(await checkRelease(root), []);
    await writeFile(path.join(root, "README.md"), contact);
    assert.ok((await checkRelease(root)).some((f) => f.startsWith("README.md:")));
    await writeFile(path.join(root, "README.md"), "Public documentation");
    await writeFile(path.join(root, "SECURITY.md"), "personal@" + "mailbox.com");
    assert.ok((await checkRelease(root)).some((f) => f.startsWith("SECURITY.md:")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
