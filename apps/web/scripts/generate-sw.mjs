import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist");
const html = await readFile(resolve(dist, "index.html"), "utf8");
const template = (await readFile(resolve(here, "../sw.template.js"), "utf8")).replace(
  "__PUSH_HANDLERS__",
  await readFile(resolve(here, "../sw-push.template.js"), "utf8"),
);
const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map(
  (match) => match[1],
);
const publicFiles = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/statedock.svg",
  "/icons/statedock-192.png",
  "/icons/statedock-512.png",
  "/icons/statedock-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/icons/favicon-32x32.png",
  "/logo.png",
];
const buildId = createHash("sha256")
  .update(html)
  .update(Date.now().toString())
  .digest("hex")
  .slice(0, 10);
const sw = template
  .replace("__BUILD_ID__", buildId)
  .replace("__PRECACHE_URLS__", JSON.stringify([...new Set([...publicFiles, ...assets])]));
await writeFile(resolve(dist, "sw.js"), sw);
console.log(
  `Generated service worker with ${new Set([...publicFiles, ...assets]).size} precached app assets.`,
);
