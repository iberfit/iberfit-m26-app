import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const sha=(file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function verify(manifestPath,base){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,manifestPath),'utf8'));
  const failures=[];
  for(const entry of manifest.entries){
    const file=path.join(root,base,entry.path);
    if(!fs.existsSync(file)){failures.push({path:entry.path,reason:'missing'});continue;}
    const size=fs.statSync(file).size;
    const digest=sha(file);
    if(size!==entry.size||digest!==entry.sha256)failures.push({path:entry.path,reason:'mismatch',expectedSize:entry.size,actualSize:size,expectedSha256:entry.sha256,actualSha256:digest});
  }
  return {manifestPath,expected:manifest.count,verified:manifest.entries.length-failures.length,failures,ok:failures.length===0};
}
const full=verify('recovery/RC20_SHA256_MANIFEST.json','');
const web=verify('recovery/RC20_WEB_SHA256_MANIFEST.json','dist/m26-performance-wearables-candidate');
console.log(`${full.ok?'PASS':'FAIL'} full ${full.verified}/${full.expected}`);
console.log(`${web.ok?'PASS':'FAIL'} web ${web.verified}/${web.expected}`);
if(!full.ok||!web.ok){console.error(JSON.stringify({full,web},null,2));process.exit(1);}
