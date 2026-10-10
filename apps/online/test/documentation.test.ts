import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/index.js";
import type { OnlineEnv } from "../src/auth.js";
import { sendNtfy } from "../src/ntfy.js";

test("documentation requires explicit acceptable markdown, regardless of client user agent", async () => {
  const env = {
    ASSETS: {
      fetch: async (r: Request) =>
        new Response(
          new URL(r.url).pathname === "/doc.md" ? "# Markdown guide" : "<html>Documentation</html>",
          {
            headers: {
              "Cache-Control": "public, max-age=0, must-revalidate",
              "Content-Type": new URL(r.url).pathname === "/doc.md" ? "text/markdown" : "text/html",
            },
          },
        ),
    },
  } as unknown as OnlineEnv;
  for (const accept of [
    "text/html",
    "*/*",
    "application/json",
    "text/plain",
    "text/markdown;q=0",
    "",
  ]) {
    const response = await app.request(
      "https://dock.example.test/doc",
      { headers: { Accept: accept, "User-Agent": "python-agent curl" } },
      env,
    );
    assert.match(response.headers.get("Content-Type")!, /text\/html/);
    assert.equal(response.headers.get("Vary"), "Accept");
    assert.equal(response.headers.get("Cache-Control"), "private, max-age=60");
  }
  for (const accept of [
    "text/markdown",
    "TEXT/MARKDOWN; charset=utf-8",
    "text/html, text/markdown;q=0.8",
  ]) {
    const response = await app.request(
      "https://dock.example.test/doc",
      { headers: { Accept: accept } },
      env,
    );
    assert.match(response.headers.get("Content-Type")!, /text\/markdown/);
    assert.equal(response.headers.get("Vary"), "Accept");
    assert.equal(response.headers.get("Cache-Control"), "private, max-age=60");
    assert.equal(await response.text(), "# Markdown guide");
  }
});

test("ntfy identifies this instance rather than the official service", async () => {
  const original = globalThis.fetch;
  let headers: Headers | undefined;
  globalThis.fetch = (async (_url: any, options?: RequestInit) => {
    headers = new Headers(options?.headers);
    return new Response("OK");
  }) as typeof fetch;
  try {
    assert.equal(
      (
        await sendNtfy(
          "https://push.example.test/topic",
          "Test",
          "Body",
          "https://dock.example.test/task/1",
        )
      ).ok,
      true,
    );
    assert.equal(headers!.get("User-Agent"), "StateDock/1.0 (+https://dock.example.test)");
  } finally {
    globalThis.fetch = original;
  }
});
