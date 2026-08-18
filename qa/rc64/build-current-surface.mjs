import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const output=path.join(root,'.tmp','rc64-current-surface');

const entries=Object.freeze([
  ['public/m26/index.html','index.html'],
  ['public/m26','m26'],
  ['src/m26','src/m26'],
  ['baseline_m25_2/exercise-catalog-m25.json','baseline_m25_2/exercise-catalog-m25.json'],
  ['public/isotipo-iberfit.png','public/isotipo-iberfit.png'],
]);

function copy(source,target){
  const from=path.join(root,source);
  const to=path.join(output,target);
  if(!fs.existsSync(from))throw new Error(`RC64_2A_QA_SOURCE_MISSING:${source}`);
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.cpSync(from,to,{recursive:true});
}

fs.rmSync(output,{recursive:true,force:true});
fs.mkdirSync(output,{recursive:true});

for(const [source,target] of entries)copy(source,target);

const runtime=fs.readFileSync(path.join(output,'m26','runtime-config.js'),'utf8');
if(!/enabled:\s*false/u.test(runtime))throw new Error('RC64_2A_QA_RUNTIME_MUST_FAIL_CLOSED');
if(!/qaOnly:\s*true/u.test(runtime))throw new Error('RC64_2A_QA_RUNTIME_MUST_BE_QA_ONLY');

const canonicalCss=fs.readFileSync(path.join(root,'src','m26','shell','shell.css'),'utf8').replace(/\r\n?/gu,'\n');
const builtCss=fs.readFileSync(path.join(output,'src','m26','shell','shell.css'),'utf8').replace(/\r\n?/gu,'\n');
if(canonicalCss!==builtCss)throw new Error('RC64_2A_QA_SHELL_CSS_NOT_CANONICAL');

console.log(JSON.stringify({
  schema:'iberfit.rc64.2a.current-source-qa-surface.v1',
  output:'.tmp/rc64-current-surface',
  source:'canonical-working-tree',
  releaseCandidate:false,
  historicalReleaseBudgetsApplied:false,
  runtimeEnabled:false,
  qaOnly:true,
  shellCssCanonicalParity:true,
},null,2));
