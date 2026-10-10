import { test } from "node:test";
import assert from "node:assert/strict";
import handler, { app } from "../src/index.js";
import { fixture } from "./fixture.js";
import { digest, type OnlineEnv } from "../src/auth.js";
import { canRegister, initializeAdministrator, isAdministrator, setUserDisabled } from "../src/instance-admin-service.js";
import { D1Repository } from "../src/repository.js";
import { ProjectMemberService } from "../src/project-member-service.js";
import { dispatchNotifications } from "../src/notification-dispatcher.js";

async function setup() {
 const f=await fixture();const messages:{to:string;text:string}[]=[];
 const env={DB:f.db,ATTACHMENTS:f.bucket,OAUTH_KV:f.oauthKv,APP_ENV:'test',PUBLIC_BASE_URL:'https://dock.example.test',OWNER_EMAIL:'one@example.test',EMAIL_FROM:'noreply@example.test',SESSION_SECRET:'isolated-test-secret',EMAIL:{send:async(m:{to:string;text:string})=>{messages.push(m);return{messageId:'test'};}},ASSETS:{fetch:async()=>new Response('asset')}} as OnlineEnv;
 const request=(path:string,init:RequestInit={})=>app.request(`https://dock.example.test${path}`,init,env);
 const json=(value:unknown)=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
 async function signIn(email='one@example.test'){
   assert.equal((await request('/api/auth/request-code',json({email}))).status,200);
   const code=/code is (\d{6})/.exec(messages.at(-1)!.text)![1];
   const response=await request('/api/auth/verify-code',json({email,code}));
   assert.equal(response.status,200);return response.headers.get('set-cookie')!.split(';')[0];
 }
 return {...f,env,messages,request,json,signIn};
}

test('bootstrap only accepts configured verified email; admin identity persists across config changes',async()=>{
 const f=await setup();try{
  assert.equal(await canRegister(f.env,'two@example.test'),false);
  assert.equal((await f.request('/api/auth/request-code',f.json({email:'two@example.test'}))).status,200);
  await initializeAdministrator(f.env,'two','two@example.test');assert.equal(await isAdministrator(f.db,'two'),false);
  const cookie=await f.signIn();const session=await(await f.request('/api/auth/session',{headers:{Cookie:cookie}})).json() as any;
  assert.equal(session.data.isAdmin,true);assert.equal(session.data.isPro,undefined);assert.equal(session.data.planTier,undefined);
  f.env.OWNER_EMAIL='two@example.test';await initializeAdministrator(f.env,'two','two@example.test');assert.equal(await isAdministrator(f.db,'one'),true);assert.equal(await isAdministrator(f.db,'two'),false);
  assert.match(cookie,/statedock_session=/);assert.equal((await f.request('/api/admin/users',{headers:{Cookie:cookie}})).status,200);
 }finally{f.client.close();}
});

test('invitation registration, administration authorization, CSRF, and audit trail',async()=>{
 const f=await setup();try{
  const cookie=await f.signIn();const auth={Cookie:cookie,'Content-Type':'application/json'};
  assert.equal((await f.request('/api/admin/users')).status,401);
  assert.equal(await canRegister(f.env,'new@example.test'),false);
  assert.equal((await f.request('/api/admin/users',{...f.json({email:'new@example.test'}),headers:auth})).status,201);
  assert.equal(await canRegister(f.env,'new@example.test'),true);
  const other=await f.signIn('new@example.test');assert.equal((await f.request('/api/admin/users',{headers:{Cookie:other}})).status,403);
  assert.equal((await f.request('/api/admin/instance',{method:'PUT',headers:{...auth,Origin:'https://evil.test'},body:JSON.stringify({registrationMode:'open'})})).status,403);
  assert.equal((await f.request('/api/admin/instance',{method:'PUT',headers:auth,body:JSON.stringify({registrationMode:'open'})})).status,403);
  assert.equal(await canRegister(f.env,'another@example.test'),false);
  const rows=await f.client.execute('SELECT action FROM admin_events');assert.deepEqual(rows.rows.map(r=>r.action),['instance.initialized','user.invited']);
  assert.equal((await f.request('/api/admin/users/one',{method:'PUT',headers:auth,body:JSON.stringify({disabled:true})})).status,409);
 }finally{f.client.close();}
});

test('account suspension revokes sessions and API keys and rejects existing OAuth access',async()=>{
 const f=await setup();try{
  await f.signIn();const cookie=await f.signIn('two@example.test');
  await f.client.execute({sql:"INSERT INTO mcp_clients(id,user_id,name,token_hash,token_prefix,created_at) VALUES('key','two','Agent',?,'test','now')",args:[await digest('key-two')]});
  assert.equal(await setUserDisabled(f.db,'two','one',true),false);
  assert.equal(await setUserDisabled(f.db,'one','two',true),true);
  assert.equal(await canRegister(f.env,'two@example.test'),false);
  assert.equal((await f.request('/api/projects',{headers:{Cookie:cookie}})).status,401);
  const response=await handler.fetch(new Request('https://dock.example.test/mcp',{method:'POST',headers:{Authorization:'Bearer key-two','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})}),f.env,{waitUntil(){},passThroughOnException(){}} as any);assert.equal(response.status,401);
  assert.equal(await setUserDisabled(f.db,'one','two',false),true);
  assert.equal((await f.request('/api/projects',{headers:{Cookie:cookie}})).status,401);
  const key=await f.client.execute("SELECT revoked_at FROM mcp_clients WHERE id='key'");assert.ok(key.rows[0].revoked_at);
 }finally{f.client.close();}
});

test('self-hosted projects and membership have no commercial quota; access isolation remains',async()=>{
 const f=await setup();try{
  const actor={id:'one',type:'human' as const};const own=new D1Repository(f.db,'one',undefined,f.bucket);const other=new D1Repository(f.db,'two',undefined,f.bucket);
  for(let i=0;i<12;i++)await own.createProject({slug:`owned-${i}`,name:`Owned ${i}`},actor);
  for(let i=0;i<3;i++)await other.createProject({slug:`other-${i}`,name:`Other ${i}`},{id:'two',type:'human'});
  const project=await own.getProject('owned-0');const service=new ProjectMemberService(f.db);
  for(let i=0;i<12;i++){
    const id=`member-${i}`;await f.client.execute({sql:"INSERT INTO users(id,email,created_at,instance_approved_at) VALUES(?,?,?,'now')",args:[id,`${id}@example.test`,'now']});
    assert.equal(await service.invite(project.id,id,'one','one@example.test',`${id}@example.test`,`link-${i}`,'now'),true);
  }
  assert.equal(await service.invite(project.id,'two','one','one@example.test','two@example.test','joined','now'),true);
  await other.createProject({slug:'other-3',name:'After joining'},{id:'two',type:'human'});
  await own.createPlan(project.id,{title:'Agent A',status:'WORKING'},actor);await own.createPlan(project.id,{title:'Agent B',status:'WORKING'},actor);
  assert.equal((await own.listPlans(project.id,'WORKING')).length,2);
  await assert.rejects(()=>other.getProject('owned-1'),/not found/i);
  await assert.rejects(()=>other.updateProject(project.id,{name:'Not owner'},{id:'two',type:'human'}),/Only the project owner/);
  await initializeAdministrator(f.env,'one','one@example.test');await assert.rejects(()=>own.getProject('other-0'),/not found/i);
  const columns=await f.client.execute('PRAGMA table_info(users)');assert.equal(columns.rows.some(r=>r.name==='plan_tier'),false);
 }finally{f.client.close();}
});

test('multiple notification channels work without subscription endpoints',async()=>{
 const f=await setup();try{
  const cookie=await f.signIn();const headers={Cookie:cookie,'Content-Type':'application/json'};
  const bark=await f.request('/api/auth/bark',{method:'PUT',headers,body:JSON.stringify({address:'https://api.day.app/device-one',enabled:true})});assert.equal(bark.status,200);
  const ntfy=await f.request('/api/auth/ntfy',{method:'PUT',headers,body:JSON.stringify({topic:'https://ntfy.sh/own-topic',enabled:true})});assert.equal(ntfy.status,200);
  assert.equal((await f.request('/api/billing/subscription',{headers})).status,404);
  assert.equal((await f.request('/api/billing/redeem',{method:'POST',headers,body:JSON.stringify({code:'anything'})})).status,404);
 }finally{f.client.close();}
});

test('custom-instance OAuth metadata requires instance URL; configured metadata points only to own host',async()=>{
 const f=await setup();try{
  const ctx={waitUntil(){},passThroughOnException(){}} as any;
  const response=await handler.fetch(new Request('https://dock.example.test/.well-known/oauth-authorization-server'),f.env,ctx);assert.equal(response.status,200);
  const body=await response.json() as any;assert.equal(body.issuer,'https://dock.example.test');assert.equal(body.token_endpoint,'https://dock.example.test/oauth/token');
  const missing=await handler.fetch(new Request('https://dock.example.test/'),{...f.env,PUBLIC_BASE_URL:undefined},ctx);assert.equal(missing.status,503);
 }finally{f.client.close();}
});

test('suspended users do not receive pending notifications',async()=>{
 const f=await setup();const previous=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;return Response.json({code:200});}) as typeof fetch;
 try{
  await initializeAdministrator(f.env,'one','one@example.test');
  const repo=new D1Repository(f.db,'two',undefined,f.bucket);const actor={id:'two',type:'human' as const};const project=await repo.createProject({slug:'private',name:'Private'},actor);
  await f.client.execute("INSERT INTO bark_subscribers(id,user_id,device_key,enabled,updated_at) VALUES('bark','two','device',1,'now')");
  await repo.createPlan(project.id,{title:'Before suspension',status:'DONE'},actor);
  await setUserDisabled(f.db,'one','two',true);await dispatchNotifications(f.env,project.id);assert.equal(calls,0);
 }finally{globalThis.fetch=previous;f.client.close();}
});


test("API credential revocation is owner-only, origin-checked, and immediately rejects MCP access", async () => {
  const f = await setup();
  try {
    const owner = await f.signIn();
    const other = await f.signIn("two@example.test");
    const created = await f.request("/api/auth/mcp-clients", {
      ...f.json({ name: "Revocation regression" }),
      headers: { ...f.json({}).headers, Cookie: owner },
    });
    assert.equal(created.status, 201);
    const { data } = (await created.json()) as any;
    const call = () =>
      handler.fetch(
        new Request("https://dock.example.test/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.token}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "get_instance_info", arguments: {} },
          }),
        }),
        f.env,
        { waitUntil() {}, passThroughOnException() {} } as any,
      );
    const first = await call();
    assert.equal(first.status, 200);
    const info = ((await first.json()) as any).result.structuredContent.data;
    assert.equal(info.publicOrigin, "https://dock.example.test");
    assert.equal(info.mcpUrl, "https://dock.example.test/mcp");
    assert.equal(info.connectionName, "statedock_dock_example_test");
    const path = `/api/auth/mcp-clients/${data.id}`;
    assert.equal((await f.request(path, { method: "DELETE" })).status, 401);
    assert.equal(
      (await f.request(path, { method: "DELETE", headers: { Cookie: other } })).status,
      404,
    );
    assert.equal(
      (
        await f.request(path, {
          method: "DELETE",
          headers: { Cookie: owner, Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal((await call()).status, 200);
    assert.equal(
      (await f.request(path, { method: "DELETE", headers: { Cookie: owner } })).status,
      204,
    );
    assert.equal((await call()).status, 401);
    assert.deepEqual(
      (
        (await (
          await f.request("/api/auth/mcp-clients", { headers: { Cookie: owner } })
        ).json()) as any
      ).data,
      [],
    );
    assert.equal(
      (await f.request(path, { method: "DELETE", headers: { Cookie: owner } })).status,
      204,
    );
  } finally {
    f.client.close();
  }
});

test("active MCP identity follows instance configuration rather than the requested host", async () => {
  const f = await setup();
  try {
    await f.client.execute({
      sql: "INSERT INTO mcp_clients(id,user_id,name,token_hash,token_prefix,created_at) VALUES('instance-key','one','Agent',?,'test','now')",
      args: [await digest("instance-key")],
    });
    const rpc = (method: string, params?: unknown) =>
      new Request("https://unrelated.example/mcp", {
        method: "POST",
        headers: {
          Authorization: "Bearer instance-key",
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
    for (const origin of ["https://first.example", "https://second.example"]) {
      const env = { ...f.env, PUBLIC_BASE_URL: origin };
      const response = await handler.fetch(
        rpc("tools/call", { name: "get_instance_info", arguments: {} }),
        env,
        { waitUntil() {}, passThroughOnException() {} } as any,
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as any;
      assert.equal(body.result.structuredContent.data.publicOrigin, origin);
      const listed = await handler.fetch(rpc("tools/list"), env, {
        waitUntil() {},
        passThroughOnException() {},
      } as any);
      const tools = ((await listed.json()) as any).result.tools;
      assert.ok(tools.every((tool: any) => tool.description.startsWith(`[${origin}]`)));
      const metadata = tools.find((tool: any) => tool.name === "get_instance_info");
      assert.equal(metadata.annotations.readOnlyHint, true);
      assert.deepEqual(metadata.securitySchemes[0].scopes, ["mcp:read"]);
    }
  } finally {
    f.client.close();
  }
});
