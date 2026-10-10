import { initializeAdministrator, setUserDisabled } from "../src/instance-admin-service.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../src/index.js";
import { fixture } from "./fixture.js";
import { type OnlineEnv, cookie, digest } from "../src/auth.js";

function base64url(buffer: Uint8Array): string {
  let str = "";
  for (let i = 0; i < buffer.length; i++) str += String.fromCharCode(buffer[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(str: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)));
}

test("OAuth 2.1 RFC 8414 and RFC 9728 discovery metadata", async () => {
  const f = await fixture();
  const env = {
    DB: f.db,
    ATTACHMENTS: f.bucket,
    OAUTH_KV: f.oauthKv,
    APP_ENV: "test", PUBLIC_BASE_URL:"https://dock.example.test",
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as OnlineEnv;

  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

  try {
    // 1. Protected resource metadata (RFC 9728)
    const resMeta = await handler.fetch(
      new Request("https://dock.example.test/.well-known/oauth-protected-resource/mcp"),
      env,
      ctx
    );
    assert.equal(resMeta.status, 200);
    const resJson = await resMeta.json() as any;
    assert.equal(resJson.resource, "https://dock.example.test/mcp");
    assert.deepEqual(resJson.authorization_servers, ["https://dock.example.test"]);
    assert.ok(resJson.scopes_supported.includes("mcp:read"));

    // 2. Authorization server metadata (RFC 8414)
    const asMeta = await handler.fetch(
      new Request("https://dock.example.test/.well-known/oauth-authorization-server"),
      env,
      ctx
    );
    assert.equal(asMeta.status, 200);
    const asJson = await asMeta.json() as any;
    assert.equal(asJson.issuer, "https://dock.example.test");
    assert.equal(asJson.authorization_endpoint, "https://dock.example.test/oauth/authorize");
    assert.equal(asJson.token_endpoint, "https://dock.example.test/oauth/token");
    assert.equal(asJson.registration_endpoint, "https://dock.example.test/oauth/register");
    assert.deepEqual(asJson.response_types_supported, ["code"]);
    assert.ok(asJson.code_challenge_methods_supported.includes("S256"));
    assert.ok(asJson.scopes_supported.includes("mcp:read"));
    assert.ok(asJson.scopes_supported.includes("mcp:write"));
    assert.ok("client_id_metadata_document_supported" in asJson);
  } finally {
    f.client.close();
  }
});

test("Unauthenticated MCP requests receive standard OAuth 401 challenge", async () => {
  const f = await fixture();
  const env = {
    DB: f.db,
    ATTACHMENTS: f.bucket,
    OAUTH_KV: f.oauthKv,
    APP_ENV: "test", PUBLIC_BASE_URL:"https://dock.example.test",
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as OnlineEnv;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

  try {
    const res = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
      env,
      ctx
    );
    assert.equal(res.status, 401);
    const authHeader = res.headers.get("www-authenticate");
    assert.ok(authHeader, "WWW-Authenticate header must be present");
    assert.match(authHeader, /Bearer/);
    assert.match(authHeader, /resource_metadata=/);
  } finally {
    f.client.close();
  }
});

test("Legacy API Key clients continue to authenticate with read/write and tenant isolation", async () => {
  const f = await fixture();
  const env = {
    DB: f.db,
    ATTACHMENTS: f.bucket,
    OAUTH_KV: f.oauthKv,
    APP_ENV: "test", PUBLIC_BASE_URL:"https://dock.example.test",
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as OnlineEnv;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

  try {
    // Create an API key for User 'one'
    const token = "sdm_testapikeyuserone12345678901234";
    const tokenHash = await digest(token);
    await f.client.execute({
      sql: "INSERT INTO mcp_clients(id, user_id, name, token_hash, token_prefix, created_at) VALUES('client-1', 'one', 'Codex', ?, 'sdm_test', 'now')",
      args: [tokenHash],
    });

    // Create a project for user 'one'
    await f.client.execute("INSERT INTO projects(id, owner_id, slug, name, created_at, updated_at) VALUES('proj-1', 'one', 'proj-one', 'Project One', 'now', 'now')");
    // Create a project for user 'two'
    await f.client.execute("INSERT INTO projects(id, owner_id, slug, name, created_at, updated_at) VALUES('proj-2', 'two', 'proj-two', 'Project Two', 'now', 'now')");

    // Call list_projects with User One's API key
    const listRes = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "list_projects", arguments: {} },
        }),
      }),
      env,
      ctx
    );
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json() as any;
    const projects = JSON.parse(listJson.result.content[0].text).data;
    assert.equal(projects.length, 1);
    assert.equal(projects[0].slug, "proj-one");

    // Write a plan with User One's API key
    const writeRes = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "create_plan",
            arguments: { project: "proj-one", title: "API Key Created Task", status: "PLAN" },
          },
        }),
      }),
      env,
      ctx
    );
    assert.equal(writeRes.status, 200);
    const writeJson = await writeRes.json() as any;
    const plan = JSON.parse(writeJson.result.content[0].text).data;
    assert.equal(plan.title, "API Key Created Task");
    assert.equal(plan.status, "PLAN");

    // Invalid API key receives 401
    const invalidRes = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer sdm_invalidtoken99999999999999",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
      }),
      env,
      ctx
    );
    assert.equal(invalidRes.status, 401);
  } finally {
    f.client.close();
  }
});

test("OAuth 2.1 Authorization Code + PKCE flow, Scope separation, and Planned Task creation", async () => {
  const f = await fixture();
  const env = {
    DB: f.db,
    ATTACHMENTS: f.bucket,
    OAUTH_KV: f.oauthKv,
    APP_ENV: "test", PUBLIC_BASE_URL:"https://dock.example.test",
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as OnlineEnv;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

  try {
    // 1. Dynamic Client Registration (RFC 7591) for ChatGPT
    const regRes = await handler.fetch(
      new Request("https://dock.example.test/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "ChatGPT Web",
          redirect_uris: ["https://chatgpt.com/api/mcp/callback"],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
      env,
      ctx
    );
    assert.equal(regRes.status, 201);
    const client = await regRes.json() as any;
    const clientId = client.client_id;
    assert.ok(clientId, "Client ID must be returned");

    // 2. PKCE parameters
    const codeVerifier = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~verylongverifier";
    const codeChallenge = base64url(await sha256(codeVerifier));

    // 3. GET /oauth/authorize without user session -> returns login HTML
    const unauthAuthRes = await handler.fetch(
      new Request(
        `https://dock.example.test/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=https://chatgpt.com/api/mcp/callback&scope=mcp:read%20mcp:write&code_challenge=${codeChallenge}&code_challenge_method=S256&state=xyz123`
      ),
      env,
      ctx
    );
    assert.equal(unauthAuthRes.status, 200);
    const unauthHtml = await unauthAuthRes.text();
    assert.match(unauthHtml, /登录 StateDock/);

    // 4. Create user session for User 'one'
    const sessionToken = "session-token-for-user-one";
    const sessionTokenHash = await digest(sessionToken);
    await f.client.execute({
      sql: "INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at) VALUES('sess-1', 'one', ?, datetime('now', '+30 days'), 'now')",
      args: [sessionTokenHash],
    });
    const sessionCookieHeader = `statedock_session=${sessionToken}`;

    // 5. GET /oauth/authorize with user session -> returns Consent page with handle
    const authRes = await handler.fetch(
      new Request(
        `https://dock.example.test/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=https://chatgpt.com/api/mcp/callback&scope=mcp:read%20mcp:write&code_challenge=${codeChallenge}&code_challenge_method=S256&state=xyz123`,
        {
          headers: { Cookie: sessionCookieHeader },
        }
      ),
      env,
      ctx
    );
    assert.equal(authRes.status, 200);
    const consentHtml = await authRes.text();
    assert.match(consentHtml, /ChatGPT Web/);
    assert.match(consentHtml, /chatgpt.com/);
    assert.match(consentHtml, /mcp:read/);
    assert.match(consentHtml, /mcp:write/);

    // Extract handle from HTML form
    const handleMatch = /name="handle"\s+value="([^"]+)"/.exec(consentHtml);
    assert.ok(handleMatch, "handle must be in consent form");
    const handle = handleMatch[1];

    // Grab consent cookie returned in Set-Cookie
    const consentCookies = authRes.headers.getSetCookie?.() || [authRes.headers.get("set-cookie") || ""];
    const consentCookieStr = consentCookies.join("; ");

    // 6. Test User Deny -> 302 redirect with access_denied
    const denyBody = new FormData();
    denyBody.set("handle", handle);
    denyBody.set("decision", "deny");
    const denyRes = await handler.fetch(
      new Request("https://dock.example.test/oauth/authorize", {
        method: "POST",
        headers: {
          Cookie: `${sessionCookieHeader}; ${consentCookieStr}`,
        },
        body: denyBody,
      }),
      env,
      ctx
    );
    assert.equal(denyRes.status, 302);
    const denyLocation = new URL(denyRes.headers.get("location")!);
    assert.equal(denyLocation.origin, "https://chatgpt.com");
    assert.equal(denyLocation.searchParams.get("error"), "access_denied");
    assert.equal(denyLocation.searchParams.get("state"), "xyz123");

    // 7. Start fresh authorization for Approve
    const authRes2 = await handler.fetch(
      new Request(
        `https://dock.example.test/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=https://chatgpt.com/api/mcp/callback&scope=mcp:read%20mcp:write&code_challenge=${codeChallenge}&code_challenge_method=S256&state=state-approve`,
        {
          headers: { Cookie: sessionCookieHeader },
        }
      ),
      env,
      ctx
    );
    const consentHtml2 = await authRes2.text();
    const handle2 = /name="handle"\s+value="([^"]+)"/.exec(consentHtml2)![1];
    const consentCookies2 = (authRes2.headers.getSetCookie?.() || [authRes2.headers.get("set-cookie") || ""]).join("; ");

    // Approve with both mcp:read and mcp:write
    const approveBody = new FormData();
    approveBody.set("handle", handle2);
    approveBody.set("decision", "approve");
    approveBody.append("scope", "mcp:read");
    approveBody.append("scope", "mcp:write");

    const approveRes = await handler.fetch(
      new Request("https://dock.example.test/oauth/authorize", {
        method: "POST",
        headers: {
          Cookie: `${sessionCookieHeader}; ${consentCookies2}`,
        },
        body: approveBody,
      }),
      env,
      ctx
    );
    assert.equal(approveRes.status, 302);
    const approveLocation = new URL(approveRes.headers.get("location")!);
    assert.equal(approveLocation.origin, "https://chatgpt.com");
    assert.equal(approveLocation.searchParams.get("state"), "state-approve");
    const code = approveLocation.searchParams.get("code")!;
    assert.ok(code, "Authorization code must be returned");

    // 8. Token exchange at POST /oauth/token with PKCE verifier
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: "https://chatgpt.com/api/mcp/callback",
      code_verifier: codeVerifier,
    });
    const tokenRes = await handler.fetch(
      new Request("https://dock.example.test/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenParams.toString(),
      }),
      env,
      ctx
    );
    assert.equal(tokenRes.status, 200);
    const tokenData = await tokenRes.json() as any;
    assert.ok(tokenData.access_token, "access_token must be present");
    assert.ok(tokenData.refresh_token, "refresh_token must be present");
    assert.equal(tokenData.token_type, "bearer");
    assert.ok(tokenData.scope.includes("mcp:read"));
    assert.ok(tokenData.scope.includes("mcp:write"));
    const accessToken = tokenData.access_token;

    // 9. Inspect tools/list via OAuth token -> contains securitySchemes
    const toolsRes = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "tools/list", params: {} }),
      }),
      env,
      ctx
    );
    assert.equal(toolsRes.status, 200);
    const toolsJson = await toolsRes.json() as any;
    const createPlanTool = toolsJson.result.tools.find((t: any) => t.name === "create_plan");
    assert.ok(createPlanTool);
    assert.deepEqual(createPlanTool.securitySchemes, [{ type: "oauth2", scopes: ["mcp:write"] }]);

    // 10. ChatGPT creates Planned Task in StateDock!
    await f.client.execute("INSERT INTO projects(id, owner_id, slug, name, created_at, updated_at) VALUES('p-oauth', 'one', 'statedock', 'StateDock', 'now', 'now')");

    const createPlanRes = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 11,
          method: "tools/call",
          params: {
            name: "create_plan",
            arguments: {
              project: "statedock",
              title: "OAuth 测试方案",
              body: "与 ChatGPT Web 讨论的 OAuth 测试方案",
              status: "PLAN",
            },
          },
        }),
      }),
      env,
      ctx
    );
    assert.equal(createPlanRes.status, 200);
    const createPlanJson = await createPlanRes.json() as any;
    const planResult = JSON.parse(createPlanJson.result.content[0].text).data;
    assert.equal(planResult.title, "OAuth 测试方案");
    assert.equal(planResult.status, "PLAN");
    assert.match(planResult.reference, /^SD-/);

    // Verify task is persisted in D1 and is in PLAN state
    const d1Row = await f.client.execute({
      sql: "SELECT title, status FROM plans WHERE id = ?",
      args: [planResult.id],
    });
    assert.equal(d1Row.rows[0].title, "OAuth 测试方案");
    assert.equal(d1Row.rows[0].status, "PLAN");

    // 11. Test Scope restriction: create token with only mcp:read
    const authRes3 = await handler.fetch(
      new Request(
        `https://dock.example.test/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=https://chatgpt.com/api/mcp/callback&scope=mcp:read&code_challenge=${codeChallenge}&code_challenge_method=S256&state=state-read-only`,
        {
          headers: { Cookie: sessionCookieHeader },
        }
      ),
      env,
      ctx
    );
    const consentHtml3 = await authRes3.text();
    const handle3 = /name="handle"\s+value="([^"]+)"/.exec(consentHtml3)![1];
    const consentCookies3 = (authRes3.headers.getSetCookie?.() || [authRes3.headers.get("set-cookie") || ""]).join("; ");

    const approveReadOnlyBody = new FormData();
    approveReadOnlyBody.set("handle", handle3);
    approveReadOnlyBody.set("decision", "approve");
    approveReadOnlyBody.append("scope", "mcp:read");

    const approveReadOnlyRes = await handler.fetch(
      new Request("https://dock.example.test/oauth/authorize", {
        method: "POST",
        headers: {
          Cookie: `${sessionCookieHeader}; ${consentCookies3}`,
        },
        body: approveReadOnlyBody,
      }),
      env,
      ctx
    );
    const codeReadOnly = new URL(approveReadOnlyRes.headers.get("location")!).searchParams.get("code")!;

    const tokenReadOnlyRes = await handler.fetch(
      new Request("https://dock.example.test/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          code: codeReadOnly,
          redirect_uri: "https://chatgpt.com/api/mcp/callback",
          code_verifier: codeVerifier,
        }).toString(),
      }),
      env,
      ctx
    );
    const tokenReadOnlyData = (await tokenReadOnlyRes.json() as any);
    const tokenReadOnly = tokenReadOnlyData.access_token;

    // Read tool succeeds with read-only token
    const readOnlyListRes = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenReadOnly}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 20,
          method: "tools/call",
          params: { name: "list_plans", arguments: { project: "statedock" } },
        }),
      }),
      env,
      ctx
    );
    assert.equal(readOnlyListRes.status, 200);

    const identityResponse = await handler.fetch(new Request("https://dock.example.test/mcp", {
      method: "POST", headers: {"Content-Type":"application/json", Authorization:`Bearer ${tokenReadOnly}`},
      body: JSON.stringify({jsonrpc:"2.0",id:22,method:"tools/call",params:{name:"get_instance_info",arguments:{}}}),
    }), env, ctx);
    assert.equal(identityResponse.status,200);
    assert.equal((await identityResponse.json() as any).result.structuredContent.data.publicOrigin,"https://dock.example.test");

    // Write tool is rejected with 403 insufficient_scope
    const readOnlyWriteRes = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenReadOnly}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 21,
          method: "tools/call",
          params: {
            name: "create_plan",
            arguments: { project: "statedock", title: "Should Fail", status: "PLAN" },
          },
        }),
      }),
      env,
      ctx
    );
    assert.equal(readOnlyWriteRes.status, 403);
    const writeAuthHeader = readOnlyWriteRes.headers.get("www-authenticate");
    assert.ok(writeAuthHeader);
    assert.match(writeAuthHeader, /insufficient_scope/);
    assert.match(writeAuthHeader, /mcp:write/);

    // 12. Test Refresh Token:
    // a. Old refresh token from superseded grant is revoked:
    const oldRefreshRes = await handler.fetch(
      new Request("https://dock.example.test/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: tokenData.refresh_token,
        }).toString(),
      }),
      env,
      ctx
    );
    assert.equal(oldRefreshRes.status, 400);

    // b. Active refresh token succeeds:
    const refreshRes = await handler.fetch(
      new Request("https://dock.example.test/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          refresh_token: tokenReadOnlyData.refresh_token,
        }).toString(),
      }),
      env,
      ctx
    );
    assert.equal(refreshRes.status, 200);
    const refreshedData = await refreshRes.json() as any;
    assert.ok(refreshedData.access_token);
    assert.notEqual(refreshedData.access_token, tokenReadOnly);

    // 13. Invalid/bogus token rejected with 401
    const bogusRes = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid:oauth:token",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 30, method: "tools/list", params: {} }),
      }),
      env,
      ctx
    );
    assert.equal(bogusRes.status, 401);
    const oldRequest=()=>handler.fetch(new Request("https://dock.example.test/mcp",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${refreshedData.access_token}`},body:JSON.stringify({jsonrpc:"2.0",id:90,method:"tools/list"})}),env,ctx);
    assert.equal((await oldRequest()).status,200);
    await f.client.execute("UPDATE users SET instance_approved_at=NULL WHERE id='one'");
    assert.equal((await oldRequest()).status,401);
    await f.client.execute("UPDATE users SET instance_approved_at='now' WHERE id='one'");
    assert.equal((await oldRequest()).status,200);
    await initializeAdministrator({...env,OWNER_EMAIL:"two@example.test"},"two","two@example.test");
    assert.equal(await setUserDisabled(f.db,"two","one",true),true);
    assert.equal((await oldRequest()).status,401);
    assert.equal(await setUserDisabled(f.db,"two","one",false),true);
    assert.equal((await oldRequest()).status,401);
  } finally {
    f.client.close();
  }
});
