import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd();
const dist=path.join(root,'dist','m26-cliente-premium-final-candidate');
fs.rmSync(dist,{recursive:true,force:true});fs.mkdirSync(dist,{recursive:true});
function copy(source,target){const from=path.join(root,source),to=path.join(dist,target);if(!fs.existsSync(from))throw new Error(`RC27_BUILD_SOURCE_MISSING:${source}`);fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(from,to,{recursive:true});}
copy('public/m26/index.html','index.html');copy('public/m26','m26');copy('src/m26','src/m26');copy('baseline_m25_2/exercise-catalog-m25.json','baseline_m25_2/exercise-catalog-m25.json');copy('public/isotipo-iberfit.png','public/isotipo-iberfit.png');copy('public/m26/_headers','_headers');copy('public/m26/_redirects','_redirects');
const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const abs=path.join(dir,entry.name);if(entry.isDirectory())walk(abs);else{const rel=path.relative(dist,abs).replaceAll(path.sep,'/');if(['version.json','asset-manifest.json'].includes(rel))continue;const bytes=fs.readFileSync(abs);files.push({path:rel,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}}}
walk(dist);files.sort((a,b)=>a.path.localeCompare(b.path));const size=(ext)=>files.filter((x)=>x.path.endsWith(ext)).reduce((sum,x)=>sum+x.size,0);const totalBytes=files.reduce((sum,x)=>sum+x.size,0),javascriptBytes=size('.js'),cssBytes=size('.css'),jsonBytes=size('.json');
const meta={version:'26.0.0-cliente-premium-final.27',status:'not_deployed',deployable:false,localValidationOnly:true,productionModified:false,productionDeployed:false,builtAt:new Date().toISOString(),files:files.length,totalBytes,budgets:{javascriptBytes,cssBytes,jsonBytes,javascriptLimit:820000,cssLimit:155000,totalLimit:3700000},budgetOk:javascriptBytes<=820000&&cssBytes<=155000&&totalBytes<=3700000,locale:'es-ES',publicationLifecycle:'approve_then_publish',roleSpecificPayloads:true};
fs.writeFileSync(path.join(dist,'version.json'),JSON.stringify(meta,null,2)+'\n');fs.writeFileSync(path.join(dist,'asset-manifest.json'),JSON.stringify({version:meta.version,locale:meta.locale,files},null,2)+'\n');console.log(JSON.stringify(meta,null,2));if(!meta.budgetOk)process.exit(1);
