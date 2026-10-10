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
  ["docs/self-hosting.md", "doc.md"],
])
  await copyFile(resolve(base, from), resolve(dist, to));

// Publish the operator guides linked by doc.md at the same relative paths.
for (const name of [
  "agent-setup",
  "self-hosting",
  "migrations",
  "operations",
  "validation",
  "architecture",
]) {
  await copyFile(resolve(base, `docs/${name}.md`), resolve(dist, `${name}.md`));
}
