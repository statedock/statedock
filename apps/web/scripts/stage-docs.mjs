import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(webDirectory, "../..");
const publicDirectory = resolve(webDirectory, "public");
await mkdir(publicDirectory, { recursive: true });
for (const name of ["doc.md", "doc.zh.md"]) {
  await copyFile(resolve(repositoryRoot, "docs", name), resolve(publicDirectory, name));
}

const specSource = resolve(repositoryRoot, "docs", "spec");
const specTarget = resolve(publicDirectory, "spec");
await mkdir(specTarget, { recursive: true });
for (const name of await readdir(specSource)) {
  await copyFile(resolve(specSource, name), resolve(specTarget, name));
}
