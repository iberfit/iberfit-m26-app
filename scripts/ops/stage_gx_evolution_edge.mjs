// Local-only: build a self-contained evolution Edge project from the current checkout.
// No network, credentials, deployment or writes to the repository.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,lstatSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const SLUG='iberfit-evolution-report-emission-v1';
const FILES=Object.freeze(['artifact-authorization.js','deno.json','index.ts','pdf-renderer.js','report-trend-contract.js','storage-recovery.js']);
const ADAPTER="// Repository adapter. The deployment stage materializes the canonical source here.\nexport * from '../../../src/m26/workflows/report-trend-contract.js';\n";
export function stageEvolutionEdge(root=ROOT){
 const source=join(root,'supabase','functions',SLUG);
 const names=readdirSync(source).sort((a,b)=>a<b?-1:a>b?1:0);
 if(names.length!==FILES.length||names.some((name,i)=>name!==FILES[i]))throw Error('GX_EDGE_STAGE_UNEXPECTED_SOURCE');
 const read=file=>{const info=lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>1000000)throw Error('GX_EDGE_STAGE_SOURCE_INVALID');return readFileSync(file);};
 if(read(join(source,'report-trend-contract.js')).toString('utf8')!==ADAPTER)throw Error('GX_EDGE_STAGE_ADAPTER_DRIFT');
 const canonical=read(join(root,'src/m26/workflows/report-trend-contract.js'));
 const config=read(join(root,'supabase/config.toml'));
 if(!/^\[functions\.iberfit-evolution-report-emission-v1\]\r?\nverify_jwt = true\s*$/mu.test(config.toString('utf8')))throw Error('GX_EDGE_STAGE_JWT_REQUIRED');
 const dir=mkdtempSync(join(tmpdir(),'iberfit-gx-evolution-'));
 try{
  const target=join(dir,'supabase','functions',SLUG);
  mkdirSync(target,{recursive:true});
  writeFileSync(join(dir,'supabase','config.toml'),config,{flag:'wx'});
  for(const name of FILES)writeFileSync(join(target,name),name==='report-trend-contract.js'?canonical:read(join(source,name)),{flag:'wx'});
  return dir;
 }catch(error){rmSync(dir,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==2)throw Error('GX_EDGE_STAGE_USAGE');
 console.log(stageEvolutionEdge());
}
