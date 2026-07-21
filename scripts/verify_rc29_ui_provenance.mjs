import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const baseline=JSON.parse(fs.readFileSync(path.join(root,'recovery','RC28_SHA256_MANIFEST.json'),'utf8'));
const baselineMap=new Map(baseline.entries.map((entry)=>[entry.path,entry]));
const prefixes=['src/m26/','public/m26/'];
const allowedChanges=new Set(['public/m26/runtime-config.js']);
const compared=[];const changed=[];const missing=[];
const sha=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const [filePath,entry] of baselineMap){
  if(!prefixes.some((prefix)=>filePath.startsWith(prefix))||allowedChanges.has(filePath))continue;
  const absolute=path.join(root,filePath);
  if(!fs.existsSync(absolute)){missing.push(filePath);continue;}
  const actual=sha(absolute);compared.push(filePath);
  if(actual!==entry.sha256||fs.statSync(absolute).size!==entry.size)changed.push({path:filePath,expectedSha256:entry.sha256,actualSha256:actual});
}
const report={release:'IBERFIT_M26_PREPUBLICACION_INFRA_RC29',functionalBaseline:'RC28',generatedAt:new Date().toISOString(),compared:compared.length,allowedChanges:[...allowedChanges],changed,missing,visibleUiCodeChanged:changed.length>0||missing.length>0,ok:changed.length===0&&missing.length===0};
fs.writeFileSync(path.join(root,'recovery','RC29_UI_SOURCE_PROVENANCE.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.ok)process.exit(1);
