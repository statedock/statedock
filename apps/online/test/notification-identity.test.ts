import test from "node:test";
import assert from "node:assert/strict";
import { formatTaskId, formatTaskLabel } from "@statedock/core";
import { notificationText } from "../../web/src/notification-events.js";
import { notificationRepository } from "../src/notification-service.js";
import type { OnlineEnv } from "../src/auth.js";
import { fixture } from "./fixture.js";

test("browser and every outbound channel share project task identity and title", async () => {
 const f=await fixture(); const originalFetch=globalThis.fetch;
 const requests: {url:string; body:any}[]=[];
 globalThis.fetch=(async (url:any,init:any)=>{
  requests.push({url:String(url),body:JSON.parse(init.body)});
  return new Response(JSON.stringify({ok:true,code:200}),{headers:{'content-type':'application/json'}});
 }) as typeof fetch;
 try {
  await f.client.execute("INSERT INTO telegram_subscribers(id,user_id,chat_id,created_at) VALUES('telegram-one','one','chat-one','now')");
  await f.client.execute("INSERT INTO discord_connections(id,user_id,name,webhook_url,created_at) VALUES('discord-one','one','Test','https://discord.com/api/webhooks/test','now')");
  await f.client.execute("INSERT INTO bark_subscribers(user_id,device_key,enabled,updated_at) VALUES('one','device-one',1,'now')");
  await f.client.execute("INSERT INTO ntfy_subscribers(user_id,topic_url,enabled,updated_at) VALUES('one','https://ntfy.sh/topic-one',1,'now')");
  await f.client.execute("INSERT INTO webhook_connections(id,user_id,name,url,created_at) VALUES('webhook-one','one','Test','https://example.test/hook','now')");
  const repo=notificationRepository({DB:f.db,ATTACHMENTS:f.bucket,TELEGRAM_BOT_TOKEN:'fake-test-token'} as OnlineEnv,'one');
  const actor={id:'test',type:'human' as const};
  const project=await repo.createProject({slug:'my-web-app',name:'My Web App'},actor);
  const title='Fix <upload> & retry';
  const plan=await repo.createPlan(project.id,{title,status:'DONE',summary:'Verified'},actor);
  const displayId=`my-web-app-${plan.number}`;
  const label=`${displayId} · ${title}`;
  assert.equal(requests.length,5);
  const telegram=requests.find(r=>r.url.includes('api.telegram.org'))!.body;
  assert.ok(telegram.text.includes(`${displayId} · Fix &lt;upload&gt; &amp; retry`));
  assert.ok(!telegram.text.includes(`${plan.reference} ·`));
  const discord=requests.find(r=>r.url.includes('discord.com'))!.body.embeds[0];
  assert.equal(discord.title,`${displayId} · 任务已完成`);
  assert.ok(discord.description.startsWith(label));
  const bark=requests.find(r=>r.url.includes('api.day.app'))!.body;
  const ntfy=requests.find(r=>r.url.includes('ntfy.sh'))!.body;
  for(const payload of [bark,ntfy]) assert.equal(payload.title,`${displayId} · 任务已完成`);
  assert.ok(bark.body.startsWith(label)); assert.ok(ntfy.message.startsWith(label));
  const webhook=requests.find(r=>r.url.includes('example.test'))!.body.data;
  assert.equal(webhook.displayId,displayId); assert.equal(webhook.displayLabel,label);
  assert.equal(webhook.reference,plan.reference); assert.equal(webhook.project.slug,'my-web-app');
  assert.ok(telegram.text.includes(`task=${plan.reference}`));
  assert.equal(notificationText({...plan,projectSlug:project.slug,sequence:1,kind:'completed'},'zh').body,label);
 } finally {globalThis.fetch=originalFetch;f.client.close();}
});

test('legacy events without project context preserve their existing identity',()=>{
 const event={reference:'SD-000099',number:68,title:'Legacy event'};
 assert.equal(formatTaskId(event),'SD-000099');
 assert.equal(formatTaskLabel(event),'SD-000099 · Legacy event');
});
