import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();const dist=path.join(root,'dist','m26-launch-candidate');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(dist,{recursive:true});
function copy(source,target){const from=path.join(root,source),to=path.join(dist,target);fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(from,to,{recursive:true});}
copy('public/m26/index.html','index.html');copy('public/m26','m26');copy('src/m26','src/m26');copy('baseline_m25_2/exercise-catalog-m25.json','baseline_m25_2/exercise-catalog-m25.json');copy('public/isotipo-iberfit.png','public/isotipo-iberfit.png');
copy('public/m26/_headers','_headers');copy('public/m26/_redirects','_redirects');
const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const abs=path.join(dir,entry.name);if(entry.isDirectory())walk(abs);else{const rel=path.relative(dist,abs).replaceAll(path.sep,'/');const bytes=fs.readFileSync(abs);files.push({path:rel,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}walk(dist);files.sort((a,b)=>a.path.localeCompare(b.path));
const js=files.filter(x=>x.path.endsWith('.js')).reduce((sum,x)=>sum+x.size,0);const css=files.filter(x=>x.path.endsWith('.css')).reduce((sum,x)=>sum+x.size,0);const json=files.filter(x=>x.path.endsWith('.json')).reduce((sum,x)=>sum+x.size,0);
const meta={version:'26.0.0-launch-candidate.15',status:'not_deployed',productionModified:false,builtAt:new Date().toISOString(),files:files.length,totalBytes:files.reduce((s,x)=>s+x.size,0),budgets:{javascriptBytes:js,cssBytes:css,jsonBytes:json,javascriptLimit:650000,cssLimit:120000},budgetOk:js<=650000&&css<=120000};
fs.writeFileSync(path.join(dist,'version.json'),JSON.stringify(meta,null,2)+'\n');
fs.writeFileSync(path.join(dist,'asset-manifest.json'),JSON.stringify({version:meta.version,files},null,2)+'\n');
console.log(JSON.stringify(meta,null,2));if(!meta.budgetOk)process.exit(1);
