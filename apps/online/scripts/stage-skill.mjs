import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const base = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dist = resolve(base, "apps/web/dist");
await mkdir(dist, { recursive: true });
for (const [from, to] of [
  ["skills/statedock/SKILL.md", "skill.md"],
  ["docs/agent-setup.md", "agent.md"],
  ["docs/agent-setup.md", "setup.md"],
  ["docs/doc.md", "doc.md"],
  ["docs/doc.zh.md", "doc.zh.md"],
]) {
  await copyFile(resolve(base, from), resolve(dist, to));
}
for (const name of [
  "agent-setup",
  "self-hosting",
  "migrations",
  "operations",
  "validation",
  "architecture",
]) {
  try {
    await copyFile(resolve(base, "docs/" + name + ".md"), resolve(dist, name + ".md"));
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  }
}
