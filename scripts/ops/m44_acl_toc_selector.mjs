// IBERFIT M44 — strict PG17 custom-archive TOC selector.
// The only replayable entries are ACL and DEFAULT ACL. Everything else,
// including data/DDL/owners, is commented out. Private object names and
// SQL are never emitted in CI logs. Input must come from pg_restore --list
// on an independently authenticated archive in an isolated workspace.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const PREFIX='IBERFIT_M44_ACL_TOC_';
const MAX_BYTES=16*1024*1024;
const MAX_ITEMS=200000;
const entry=/^([0-9]+);[ \t]+([0-9]+)[ \t]+([0-9]+)[ \t]+(.+)$/;
const type=/^(ACL|DEFAULT ACL)[ \t]+([^\r\n]+)$/;
const fail=code=>{throw Error(PREFIX+code);};

export function selectPrivilegeToc(input){
 if(typeof input!=='string'||Buffer.byteLength(input,'utf8')<70||
    Buffer.byteLength(input,'utf8')>MAX_BYTES||input.includes('\0')||
    /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input))
   fail('INPUT_INVALID');
 const seen=new Set();
 let grants=0,defaults=0,entries=0;
 const result=[];
 for(const line of input.replace(/\r\n/g,'\n').split('\n')){
  if(!line||line.startsWith(';')){result.push(line);continue;}
  const match=entry.exec(line);
  if(!match||++entries>MAX_ITEMS||seen.has(match[1]))
   fail('ENTRY_INVALID_OR_DUPLICATE');
  seen.add(match[1]);
  const category=type.exec(match[4]);
  if(category?.[1]==='ACL'){
   result.push(line);grants++;
  }else if(category?.[1]==='DEFAULT ACL'){
   result.push(line);defaults++;
  }else{
   result.push(';'+line);
  }
 }
 if(!grants||!defaults)fail('REQUIRED_PRIVILEGES_MISSING');
 if(grants+defaults>=entries)fail('NON_ACL_CONTROL_MISSING');
 return Object.freeze({
  output:result.join('\n'),
  grants,defaults,total:entries,
  dataReimported:false,
  platformRecoveryVerified:false
 });
}
function safeFile(filename){
 let stat;
 try{stat=fs.lstatSync(filename);}catch{fail('INPUT_UNAVAILABLE');}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size<70||stat.size>MAX_BYTES)
  fail('INPUT_FILE_INVALID');
 return fs.readFileSync(filename,'utf8');
}
export function writePrivilegeToc(source,target){
 if(typeof source!=='string'||typeof target!=='string'||
  path.resolve(source)===path.resolve(target))fail('PATHS_INVALID');
 const sourceDir=path.dirname(path.resolve(source)),targetDir=path.dirname(path.resolve(target));
 if(sourceDir!==targetDir)fail('WORKSPACE_MISMATCH');
 const selected=selectPrivilegeToc(safeFile(source));
 let fd;
 try{
  fd=fs.openSync(target,fs.constants.O_WRONLY|fs.constants.O_CREAT|
   fs.constants.O_EXCL|(fs.constants.O_NOFOLLOW||0),0o600);
  fs.writeFileSync(fd,selected.output,'utf8');
  fs.fsyncSync(fd);
 }catch{
  if(fd!==undefined){try{fs.unlinkSync(target);}catch{}}
  fail('OUTPUT_WRITE_FAILED');
 }finally{if(fd!==undefined)fs.closeSync(fd);}
 return Object.freeze({grants:selected.grants,defaults:selected.defaults,total:selected.total});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==4)fail('USAGE');
  const result=writePrivilegeToc(process.argv[2],process.argv[3]);
  process.stdout.write('IBERFIT_M44_ACL_TOC_ONLY_VERIFIED:grants='+result.grants+
   ':defaults='+result.defaults+':platform_NOT_certified\n');
 }catch(error){
  const code=String(error?.message||'');
  process.stderr.write((code.startsWith(PREFIX)?code:PREFIX+'SELECTOR_FAILED')+'\n');
  process.exitCode=1;
 }
}
