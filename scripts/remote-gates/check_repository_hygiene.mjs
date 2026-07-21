import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd();
const forbiddenNames=[/^\.env($|\.)(?!example$)/,/\.pem$/i,/\.p12$/i,/service.?role/i,/client.?export/i];
const secretPatterns=[
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/i,
  /(?:password|passwd)\s*[:=]\s*["'][^"']{6,}["']/i,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
  /sk-[a-zA-Z0-9_-]{20,}/
];
const ignored=new Set(['.git','node_modules','dist','legacy','baseline_m25_2','recovery']);
const findings=[];
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(ignored.has(entry.name))continue;
    const full=path.join(dir,entry.name);const rel=path.relative(root,full);
    if(forbiddenNames.some((pattern)=>pattern.test(entry.name)))findings.push({type:'forbidden-name',path:rel});
    if(entry.isDirectory()){await walk(full);continue;}
    if(!entry.isFile()||(await stat(full)).size>2_000_000)continue;
    const content=await readFile(full,'utf8').catch(()=>null);if(content===null)continue;
    if(secretPatterns.some((pattern)=>pattern.test(content)))findings.push({type:'possible-secret',path:rel});
  }
}
await walk(root);
if(findings.length){console.error(JSON.stringify({ok:false,findings},null,2));process.exit(1);}
console.log(JSON.stringify({ok:true,findings:[]},null,2));
