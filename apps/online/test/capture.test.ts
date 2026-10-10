import {test} from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./fixture.js";
import {StateDockService} from "@statedock/core";
import {D1Repository} from "../src/repository.js";
import {captureTelegram} from "../src/telegram-capture.js";
import {parseNtfyUrl, sendNtfy, notifyNtfySubscribers} from "../src/ntfy.js";
test("online migrations and repository keep attachments, reviews, and feedback owner-scoped",async()=>{
 const f=await fixture();try{
 const actor={id:"tester",type:"agent" as const};const a=new StateDockService(new D1Repository(f.db,"one",undefined,f.bucket)),b=new StateDockService(new D1Repository(f.db,"two",undefined,f.bucket));
 const project=await a.createProject({slug:"demo",name:"Demo"},actor);const plan=await a.createPlan(project.id,{title:"Goal",status:"DONE",summary:"Implemented"},actor);
 const locator={reference:plan.reference};const attachment=await a.writeAttachment(locator,{name:"test.png",mimeType:"image/png",data:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="},actor);
 assert.equal((await a.readAttachment(attachment.id)).name,"test.png");assert.equal(f.objects.size,1);
 await a.addReview(locator,{scope:"Offline",verdict:"passed",summary:"Works"},actor);await a.addFeedback(locator,{body:"Improve spacing"},actor);
 assert.equal((await a.listReviews(locator)).length,1);assert.equal((await a.resolvePlan(locator)).summary,"Implemented");assert.equal((await a.resolvePlan(locator)).status,"DONE");
 for(const operation of [()=>b.readAttachment(attachment.id),()=>b.listAttachments(locator),()=>b.listReviews(locator),()=>b.addFeedback(locator,{body:"Attack"},actor),()=>b.deleteAttachment(attachment.id,actor)])await assert.rejects(operation,/not found/i);
 await a.deleteAttachment(attachment.id,actor);assert.equal(f.objects.size,0);await a.writeAttachment(locator,{name:"again.png",mimeType:"image/png",data:"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="},actor);await a.deleteProject(project.id,actor);assert.equal(f.objects.size,0);
 }finally{f.client.close();}
});
test("Telegram requires project selection, binds sender, defaults to PLAN, and deduplicates updates",async()=>{
 const f=await fixture(),originalFetch=globalThis.fetch;let messages:string[]=[];
 globalThis.fetch=(async(_url:any,options:any)=>{messages.push(JSON.parse(options.body).text??"");return new Response(JSON.stringify({ok:true,result:{message_id:1}}),{headers:{"content-type":"application/json"}});}) as typeof fetch;
 try{
 const repo=new D1Repository(f.db,"one",undefined,f.bucket);const project=await repo.createProject({slug:"demo",name:"Demo"},{id:"test",type:"human"});
 await f.client.execute("INSERT INTO telegram_subscribers(id,user_id,chat_id,telegram_user_id,created_at) VALUES('sub','one','123','123','now')");
 const env={DB:f.db,ATTACHMENTS:f.bucket,TELEGRAM_BOT_TOKEN:"mock"} as any;const factory=(_env:any,owner:string)=>new D1Repository(f.db,owner,undefined,f.bucket);
 const send=async(id:number,text:string,sender=123)=>captureTelegram(env,{update_id:id,message:{chat:{id:123,type:"private"},from:{id:sender},text}},factory);
 await send(1,"New idea");assert.equal((await repo.listPlans(project.id)).length,0);
 const inboxProject = (await repo.listProjects()).find(p => p.slug === "inbox")!;
 assert.ok(inboxProject);
 assert.equal((await repo.listPlans(inboxProject.id)).length,1);
 assert.match(messages.at(-1)!,/收集箱/);
 assert.match(messages.at(-1)!,/待归类/);
 await send(2,"/use demo");await send(3,"New idea");await send(3,"New idea");const plans=await repo.listPlans(project.id);assert.equal(plans.length,1);assert.equal(plans[0].status,"PLAN");
 await send(4,"Unauthorized",999);assert.equal((await repo.listPlans(project.id)).length,1);
 await send(5,"/add nonexistent Something");assert.equal((await repo.listPlans(project.id)).length,1);
 await send(6,"/add demo Explicit idea");assert.equal((await repo.listPlans(project.id)).length,2);
 await repo.createPlan(project.id, {title: "Ongoing feature", body: "In progress", status: "WORKING"}, {id: "test", type: "human"});
 await repo.createPlan(project.id, {title: "Blocked task", body: "Need API keys", status: "WAITING"}, {id: "test", type: "human"});
 await repo.createPlan(project.id, {title: "Finished job", body: "Shipped", summary: "Shipped v1", status: "DONE"}, {id: "test", type: "human"});
 await send(7, "/todo");
 assert.match(messages.at(-1)!, /待安排/);
 assert.match(messages.at(-1)!, /New idea/);
 await send(8, "/doing");
 assert.match(messages.at(-1)!, /正在进行/);
 assert.match(messages.at(-1)!, /Ongoing feature/);
 await send(9, "/review");
 assert.match(messages.at(-1)!, /需要我处理/);
 assert.match(messages.at(-1)!, /Need API keys/);
 await send(10, "/done");
 assert.match(messages.at(-1)!, /最近完成/);
 assert.match(messages.at(-1)!, /Shipped v1/);
 await send(11, "/summary");
 assert.match(messages.at(-1)!, /状态概览/);
 assert.match(messages.at(-1)!, /正在做 \(WORKING\): 1/);
 await send(12, "/help");
 assert.match(messages.at(-1)!, /协作指令/);
 }finally{globalThis.fetch=originalFetch;f.client.close();}
});

test("ntfy parses urls, respects notification preferences, and sends formatted push", async () => {
  assert.equal(parseNtfyUrl("my-alerts"), "https://ntfy.sh/my-alerts");
  assert.equal(parseNtfyUrl("https://ntfy.sh/topic-1"), "https://ntfy.sh/topic-1");
  assert.equal(parseNtfyUrl("https://custom.ntfy.net/channel"), "https://custom.ntfy.net/channel");
  assert.equal(parseNtfyUrl("invalid URL with spaces"), null);

  const f = await fixture(), originalFetch = globalThis.fetch;
  let sentPayloads: any[] = [];
  globalThis.fetch = (async (url: any, options: any) => {
    sentPayloads.push({ url, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ id: "ntfy-1" }), { status: 200 });
  }) as typeof fetch;

  try {
    await f.client.execute("INSERT INTO ntfy_subscribers(user_id,topic_url,auth_token,enabled,updated_at) VALUES('one','https://ntfy.sh/team-alerts','secret-token',1,'now')");
    const env = { DB: f.db } as any;

    // Send completed event
    await notifyNtfySubscribers(env, "one", {
      projectId: "p1",
      projectName: "EchoLangs",
      number: 125,
      reference: "SD-000125",
      title: "Audio Player Fix",
      kind: "completed",
      summary: "Progress preserved after return",
    });

    assert.equal(sentPayloads.length, 1);
    assert.equal(sentPayloads[0].url, "https://ntfy.sh/");
    assert.equal(sentPayloads[0].body.topic, "team-alerts");
    assert.match(sentPayloads[0].body.title, /任务已完成/);
    assert.match(sentPayloads[0].body.message, /Progress preserved/);
    assert.match(sentPayloads[0].body.click, /SD-000125/);
  } finally {
    globalThis.fetch = originalFetch;
    f.client.close();
  }
});
