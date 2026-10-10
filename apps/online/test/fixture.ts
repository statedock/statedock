import {readFileSync,readdirSync} from "node:fs";
import {createDatabase} from "../../../packages/db/dist/index.js";
export async function fixture(){
 const {client}=createDatabase("file::memory:");
 for(const file of readdirSync(new URL("../migrations/",import.meta.url)).sort())await client.executeMultiple(readFileSync(new URL(`../migrations/${file}`,import.meta.url),"utf8"));
 function prepare(sql:string){let args:any[]=[];const execute=()=>client.execute({sql,args});return {statement:()=>({sql,args}),bind(...v:any[]){args=v;return this;},async first(){return (await execute()).rows[0]??null;},async all(){return {results:(await execute()).rows};},async run(){const r=await execute();return {success:true,meta:{changes:r.rowsAffected},results:r.rows};}};}
 const db={prepare,async batch(items:any[]){const results=await client.batch(items.map(i=>i.statement()),"write");return results.map(r=>({success:true,meta:{changes:r.rowsAffected},results:r.rows}));}} as any;
 await client.execute("INSERT INTO users(id,email,created_at,instance_approved_at) VALUES('one','one@example.test','now','now'),('two','two@example.test','now','now')");
 const objects=new Map<string,Uint8Array>();const bucket={async put(key:string,data:Uint8Array){objects.set(key,data);},async get(key:string){const v=objects.get(key);return v?{arrayBuffer:async()=>v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)}:null;},async delete(key:string|string[]){for(const k of Array.isArray(key)?key:[key])objects.delete(k);}} as any;
 const kvStore = new Map<string, { value: any; expiresAt?: number }>();
 const oauthKv = {
  async get(key: string, options?: any) {
   const entry = kvStore.get(key);
   if (!entry) return null;
   if (entry.expiresAt && Date.now() > entry.expiresAt) {
    kvStore.delete(key);
    return null;
   }
   if (options?.type === "json") return typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value;
   return entry.value;
  },
  async put(key: string, value: any, options?: any) {
   let expiresAt: number | undefined;
   if (options?.expiration) expiresAt = options.expiration * 1000;
   else if (options?.expirationTtl) expiresAt = Date.now() + options.expirationTtl * 1000;
   kvStore.set(key, { value: typeof value === "string" ? value : String(value), expiresAt });
  },
  async delete(key: string) { kvStore.delete(key); },
  async list(options?: any) {
   const keys = Array.from(kvStore.keys())
    .filter(k => !options?.prefix || k.startsWith(options.prefix))
    .map(name => ({ name }));
   return { keys, list_complete: true, cursor: "" };
  },
 } as unknown as KVNamespace;
 return {client,db,bucket,objects,oauthKv,kvStore};
}
