import fs from 'node:fs';
import path from 'node:path';
const [baseline,candidate]=process.argv.slice(2).map(p=>path.resolve(p||''));
for(const dir of [baseline,candidate]){
 if(!fs.existsSync(path.join(dir,'m26','index.html')))
 throw Error('M44_REAL_PACKAGE_MISSING:'+dir);
}
function inspect(dir){
 const bytes={javascript:0,css:0,core:0,media:0,all:0,files:0};
 const names=new Set();
 for(const entry of ['src/m26','m26','public']){
  const start=path.join(dir,entry);
  if(!fs.existsSync(start))continue;
  const stack=[start];
  while(stack.length){
   const current=stack.pop();
   for(const item of fs.readdirSync(current,{withFileTypes:true})){
    const absolute=path.join(current,item.name);
    if(item.isDirectory()){stack.push(absolute);continue;}
    if(!item.isFile())continue;
    const relative=path.relative(dir,absolute).replaceAll(path.sep,'/');
    const len=fs.statSync(absolute).size,ext=path.extname(item.name).toLowerCase();
    bytes.all+=len;bytes.files++;names.add(relative);
    if(ext==='.js'||ext==='.mjs'){bytes.javascript+=len;bytes.core+=len;}
    else if(ext==='.css'){bytes.css+=len;bytes.core+=len;}
    else if(ext==='.json'||ext==='.html'||ext==='.txt'||ext==='.webmanifest'){
      bytes.core+=len;
    }else bytes.media+=len;
   }
  }
 }
 return {bytes,names};
}
const base=inspect(baseline),now=inspect(candidate);
const removed=[...base.names].filter(n=>!now.names.has(n));
if(removed.length)throw Error('M44_PACKAGING_REMOVED_BASELINE_ASSETS:'+removed.slice(0,8).join(','));
const limits={javascript:0.06,css:0.06,core:0.06,media:0.025,all:0.05};
const comparison={};
let failure=false;
for(const [key,rate] of Object.entries(limits)){
 const before=base.bytes[key],after=now.bytes[key],delta=after-before;
 const cap=Math.ceil(before*(1+rate));
 const ok=after<=cap;
 comparison[key]={baselineBytes:before,candidateBytes:after,deltaBytes:delta,limitBytes:cap,growthPct:before?Math.round(10000*delta/before)/100:null,pass:ok};
 if(!ok)failure=true;
}
const output={schema:'iberfit.m44.real-package-incremental-budget.v1',
 source:'actual Canary RC64 deployment packager',
 base:'canary/rc74-4',strictNoBaselineRemoval:true,
 fileCount:{baseline:base.bytes.files,candidate:now.bytes.files},
 comparison,pass:!failure};
console.log(JSON.stringify(output,null,2));
if(failure)throw Error('M44_CANARY_RELATIVE_PAYLOAD_BUDGET_EXCEEDED');
