import assert from "node:assert/strict";
import { test } from "node:test";
import { en } from "./i18n/en.js";
import { zh } from "./i18n/zh.js";
function paths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value)
    .flatMap(([key, item]) => paths(item, `${prefix}.${key}`))
    .sort();
}
test("English and Chinese expose identical translation keys", () =>
  assert.deepEqual(paths(en), paths(zh)));
