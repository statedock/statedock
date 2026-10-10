import {readFile} from 'node:fs/promises';
const text=await readFile(new URL('../wrangler.deploy.jsonc',import.meta.url),'utf8').catch(()=>{throw new Error('Create wrangler.deploy.jsonc from wrangler.jsonc and configure your own resources first.');});
// The distributed template is JSON-compatible; personal files may add comments.
const config=JSON.parse(text.replace(/^\s*\/\/.*$/gm,''));
const url=new URL(config.vars?.PUBLIC_BASE_URL??'http://localhost');
if(url.protocol!=='https:'||['localhost','127.0.0.1','statedock.dev','app.statedock.dev'].includes(url.hostname))throw new Error('PUBLIC_BASE_URL must be your own public HTTPS origin.');
if(!config.d1_databases?.[0]?.database_id||/^0+$/.test(config.d1_databases[0].database_id.replaceAll('-','')))throw new Error('Configure your own D1 database ID.');
if(!config.kv_namespaces?.[0]?.id||/^0+$/.test(config.kv_namespaces[0].id))throw new Error('Configure your own OAuth KV ID.');
if(!config.r2_buckets?.[0]?.bucket_name)throw new Error('Configure your own attachment bucket.');
if(!config.vars?.EMAIL_FROM||config.vars.EMAIL_FROM.endsWith('@example.com'))throw new Error('Configure your verified sending address.');
console.log('Self-hosted deployment configuration passed.');
