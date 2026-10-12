import assert from "node:assert/strict";
import test from "node:test";
import handler from "../src/index.js";
import { digest, type OnlineEnv } from "../src/auth.js";
import { setUserDisabled } from "../src/instance-admin-service.js";
import { fixture } from "./fixture.js";

// Exercise the same client + callback used by both hosts, including ChatGPT's
// shared CIMD identity. Only the external metadata document is mocked.
for (const mode of ["dcr", "cimd"] as const) {
  test(`${mode}: multiple host grants retain their Agent identity, scopes and refresh access`, async () => {
    const f = await fixture();
    const previousFetch = globalThis.fetch;
    const runtime = globalThis as typeof globalThis & { Cloudflare?: unknown };
    const previousCloudflare = runtime.Cloudflare;
    runtime.Cloudflare = { compatibilityFlags: { global_fetch_strictly_public: true } };
    const metadataUrl = "https://chatgpt.com/oauth/client.json";
    const callback = "https://chatgpt.com/api/mcp/callback";
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === metadataUrl)
        return Response.json({
          client_id: metadataUrl,
          client_name: "Shared ChatGPT client",
          redirect_uris: [callback],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        });
      return previousFetch(input, init);
    };
    const env = {
      DB: f.db,
      ATTACHMENTS: f.bucket,
      OAUTH_KV: f.oauthKv,
      APP_ENV: "test",
      PUBLIC_BASE_URL: "https://instance.example.test",
      ASSETS: { fetch: async () => new Response("asset") },
    } as unknown as OnlineEnv;
    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as ExecutionContext;
    const request = (path: string, init?: RequestInit) =>
      handler.fetch(new Request(`https://instance.example.test${path}`, init), env, ctx);
    try {
      await f.client.execute({
        sql: "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES('session','one',?,'2099-01-01','now')",
        args: [await digest("session-one")],
      });
      await f.client.execute(
        "INSERT INTO agent_profiles(id,user_id,name,created_at) VALUES('codex','one','Codex','now'),('deepseek','one','DeepSeek','now')",
      );
      await f.client.execute(
        "INSERT INTO projects(id,owner_id,slug,name,created_at,updated_at) VALUES('p','one','p','P','now','now')",
      );
      await f.client.execute(
        "INSERT INTO plans(id,project_id,number,global_number,title,status,assigned_agent_id,created_at,updated_at) VALUES('a','p',1,1,'A','READY','codex','now','now'),('b','p',2,2,'B','READY','deepseek','now','now')",
      );
      let clientId = metadataUrl;
      if (mode === "dcr") {
        const response = await request("/oauth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: "Shared host",
            redirect_uris: [callback],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
          }),
        });
        assert.equal(response.status, 201);
        clientId = ((await response.json()) as { client_id: string }).client_id;
      }
      const verifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd";
      const challenge = Buffer.from(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
      ).toString("base64url");
      const mint = async (agentId: string, scopes = ["mcp:read", "mcp:write"]) => {
        const params = new URLSearchParams({
          response_type: "code",
          client_id: clientId,
          redirect_uri: callback,
          scope: scopes.join(" "),
          code_challenge: challenge,
          code_challenge_method: "S256",
          state: crypto.randomUUID(),
        });
        const consent = await request(`/oauth/authorize?${params}`, {
          headers: { Cookie: "statedock_session=session-one" },
        });
        assert.equal(consent.status, 200);
        const html = await consent.text();
        const handle = /name="handle"\s+value="([^"]+)"/.exec(html)?.[1];
        assert.ok(handle, "Consent handle is required");
        const cookies = consent.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; ");
        const form = new FormData();
        form.set("handle", handle);
        form.set("decision", "approve");
        form.set("agentId", agentId);
        for (const scope of scopes) form.append("scope", scope);
        const approved = await request("/oauth/authorize", {
          method: "POST",
          headers: { Cookie: `statedock_session=session-one; ${cookies}` },
          body: form,
        });
        assert.equal(approved.status, 302);
        const code = new URL(approved.headers.get("location")!).searchParams.get("code");
        assert.ok(code);
        const exchanged = await request("/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: clientId,
            redirect_uri: callback,
            code,
            code_verifier: verifier,
          }),
        });
        assert.equal(exchanged.status, 200);
        return (await exchanged.json()) as {
          access_token: string;
          refresh_token: string;
          scope: string;
        };
      };
      const call = async (token: string, name = "list_ready_tasks") => {
        const response = await request("/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: { project: "p" } },
          }),
        });
        const json = (await response.json()) as any;
        return { status: response.status, result: json.result };
      };
      const first = await mint("codex");
      assert.equal((await call(first.access_token)).status, 200);
      const second = await mint("deepseek");
      const third = await mint("codex", ["mcp:read"]);
      for (const [token, expected] of [
        [first.access_token, "a"],
        [second.access_token, "b"],
      ] as const) {
        const response = await call(token);
        assert.equal(response.status, 200);
        assert.deepEqual(
          JSON.parse(response.result.content[0].text).data.map((p: any) => p.id),
          [expected],
        );
      }
      assert.equal((await call(third.access_token, "claim_next_task")).status, 403);
      const refresh = (token: string) =>
        request("/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: token,
          }),
        });
      const refreshed = [];
      for (const grant of [first, second]) {
        const response = await refresh(grant.refresh_token);
        assert.equal(response.status, 200);
        refreshed.push(
          (await response.json()) as { access_token: string; refresh_token: string; scope: string },
        );
      }
      const claims = await Promise.all(
        refreshed.map((grant) => call(grant.access_token, "claim_next_task")),
      );
      for (const [i, agentId] of ["codex", "deepseek"].entries()) {
        assert.equal(claims[i].status, 200);
        assert.equal(
          JSON.parse(claims[i].result.content[0].text).data.plan.claimedAgentId,
          agentId,
        );
      }
      // Explicitly revoking one grant must remain effective, without harming peers.
      const revoked = await request("/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          token: third.refresh_token,
          token_type_hint: "refresh_token",
        }),
      });
      assert.equal(revoked.status, 200);
      assert.equal((await call(third.access_token)).status, 401);
      assert.equal((await refresh(third.refresh_token)).status, 400);
      for (const grant of refreshed) assert.equal((await call(grant.access_token)).status, 200);
      await f.client.execute(
        "INSERT INTO instance_settings(key,value) VALUES('admin_user_id','two')",
      );
      await setUserDisabled(f.db, "two", "one", true);
      for (const grant of refreshed) {
        assert.equal((await call(grant.access_token)).status, 401);
        assert.equal((await refresh(grant.refresh_token)).status, 400);
      }
    } finally {
      globalThis.fetch = previousFetch;
      if (previousCloudflare === undefined) delete runtime.Cloudflare;
      else runtime.Cloudflare = previousCloudflare;
      f.client.close();
    }
  });
}
