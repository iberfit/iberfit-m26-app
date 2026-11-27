// Offline packaging proof: no deployment, credentials, or network.
// Use independently recorded remote observations, not a mutable working tree.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {posix,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gitBlob,validateScope} from './gx350_edge_scope.mjs';
const EXTERNALS=new Set(['npm:@supabase/supabase-js@2.112.4','npm:pdf-lib@1.17.1','npm:@pdf-lib/fontkit@1.1.1']);
const fail=code=>{throw Error('GX350_EDGE_STAGE_'+code);};
// Bounded scan of the static import grammar used by the pinned source.
// Never scan across arbitrary source text or use a backtracking multiline regex.
function moduleSpecifiers(source){
 const result=[],lines=source.split('\n');
 for(let i=0;i<lines.length;i++){
  let line=lines[i].trim();
  const importing=line.startsWith('import ')||line.startsWith('import{')||line.startsWith('import\t');
  const reexport=line.startsWith('export *')||line.startsWith('export {');
  if(!importing&&!reexport)continue;
  let complete=false;
  for(let n=0;n<64;n++){
   if(line.length>4096)fail('IMPORT_DECLARATION_TOO_LONG');
   const statement=line.endsWith(';')?line.slice(0,-1).trimEnd():line;
   const quote=statement.at(-1);
   if(quote==="'"||quote==='"'){
    const first=statement.lastIndexOf(quote,statement.length-2);
    if(first<0)fail('IMPORT_SYNTAX');
    const prefix=statement.slice(0,first).trimEnd();
    if(prefix==='import'||prefix.endsWith(' from')||prefix.endsWith('}from')){
     const specifier=statement.slice(first+1,-1);
     if(!specifier||specifier.includes('\\')||specifier.includes('\n'))fail('IMPORT_SYNTAX');
     result.push(specifier);complete=true;break;
    }
   }
   if(reexport&&line.includes('}')&&!line.includes(' from')&&(line.endsWith('}')||line.endsWith('};'))){complete=true;break;}
   if(i+1>=lines.length||line.endsWith(';'))break;
   line+=' '+lines[++i].trim();
  }
  if(!complete)fail('IMPORT_SYNTAX');
 }
 return result;
}
export function verifyModuleGraph(files){
 if(!(files instanceof Map)||!files.has('index.ts'))fail('ENTRYPOINT');
 const reached=new Set(),external=new Set();
 function visit(name){
  if(reached.has(name))return;
  const bytes=files.get(name);
  if(!Buffer.isBuffer(bytes)||!bytes.length)fail('MODULE_MISSING');
  reached.add(name);
  const source=bytes.toString('utf8');
  if(/\bimport\s*\(/u.test(source))fail('DYNAMIC_IMPORT_UNREVIEWED');
  for(const specifier of moduleSpecifiers(source)){
   if(specifier.startsWith('.')){
    const target=posix.normalize(posix.join(posix.dirname(name),specifier));
    if(target==='..'||target.startsWith('../')||!files.has(target))fail('LOCAL_IMPORT_ESCAPE_OR_MISSING');
    visit(target);
   }else{
    if(!EXTERNALS.has(specifier))fail('EXTERNAL_IMPORT_UNREVIEWED');
    external.add(specifier);
   }
  }
 }
 visit('index.ts');
 if([...files.keys()].some(name=>name!=='deno.json'&&!reached.has(name)))fail('UNREACHABLE_MODULE');
 return Object.freeze({modules:reached.size,externalDependencies:external.size});
}
export function rehearseEdgePackages(manifest,read){
 validateScope(manifest);if(typeof read!=='function')fail('READER');
 const output=[];
 for(const f of manifest.functions)for(const mode of ['prod','candidate']){
  const files=new Map(),entries=[...f[mode],...(mode==='prod'&&f.importMap?[f.importMap]:[])];
  for(const x of entries){
   const bytes=Buffer.from(read(x.sourceRef,x.sourcePath));
   if(gitBlob(bytes)!==x.blob||files.has(x.name))fail('SOURCE_DRIFT');
   files.set(x.name,bytes);
  }
  if(files.has('deno.json')){
   let config;try{config=JSON.parse(files.get('deno.json').toString('utf8'));}catch{fail('CONFIG_PARSE');}
   if(config.nodeModulesDir!=='auto'||config.compilerOptions?.strict!==true||
     Object.keys(config).some(x=>!['nodeModulesDir','compilerOptions'].includes(x))||
     Object.keys(config.compilerOptions).some(x=>x!=='strict'))fail('CONFIG_SCOPE');
  }
  const proof=verifyModuleGraph(files);
  output.push(Object.freeze({slug:f.slug,mode,files:files.size,...proof,verifyJwt:f.verifyJwt}));
 }
 return Object.freeze({packages:output.length,repositoryFiles:output.reduce((n,p)=>n+p.files,0),
  proofs:Object.freeze(output),priorImportMapLiveBytesVerified:false,hostedRuntimeVerified:false,
  rollbackRuntimeCertified:false,productionAuthorized:false,remoteWrites:0});
}
export function repositoryReader(root){
 const git=process.platform==='win32'?'C:/Program Files/Git/cmd/git.exe':'/usr/bin/git';
 return (ref,path)=>execFileSync(git,['show',ref+':'+path],{cwd:root,maxBuffer:1024*1024});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==2)fail('ARGUMENTS');
 const m=JSON.parse(readFileSync(new URL('./gx350_edge_scope.json',import.meta.url),'utf8'));
 console.log(JSON.stringify(rehearseEdgePackages(m,repositoryReader(fileURLToPath(new URL('../../',import.meta.url))))));
}
