import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const rules=[
 ['packages/core/src',[/@statedock\/db/,/drizzle-orm/,/@libsql\//,/cloudflare:/,/apps\//]],
 ['packages/db/src',[/apps\//]],
 ['apps/web/src',[/online\/src/,/api\/src/,/mcp\/src/]],
];
let failures=0;
async function check(dir,blocked){
 for(const item of await readdir(dir,{withFileTypes:true})){
  const file=path.join(dir,item.name);
  if(item.isDirectory()){await check(file,blocked);continue;}
  if(!/\.tsx?$/.test(file)||file.endsWith('.test.ts'))continue;
  const source=await readFile(file,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)){
   const specifier=match[1];
   if(blocked.some(rule=>rule.test(specifier))){console.error(`${path.relative(root,file)} crosses a protected module boundary: ${specifier}`);failures++;}
  }
 }
}
for(const [dir,blocked] of rules)await check(path.join(root,dir),blocked);
if(failures)process.exitCode=1;else console.log('Core, storage and browser dependency boundaries passed.');
