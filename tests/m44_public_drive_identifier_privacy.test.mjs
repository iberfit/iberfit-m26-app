import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const docs=join(root,'docs','ops');
const documentation=readdirSync(docs)
  .filter(name=>(name.startsWith('M44_')||name==='IBERFIT_DRIVE_PRIVATE_RECOVERY_ROUTING.md')&&name.endsWith('.md'));

const privateDriveIdentifierPatterns=[
  /\\bDrive:\\s*[a-zA-Z0-9_-]{20,}\\b/g,
  /drive\\.google\\.com\\/(?:file\\/d|drive\\/folders)\\/[a-zA-Z0-9_-]{20,}/gi,
  /\\b(?:driveFileId|driveFolderId|googleDriveFileId)\\s*[:=]\\s*[`'"]?[a-zA-Z0-9_-]{20,}/gi,
];

test('M44 public operational evidence never includes a raw private Google Drive file or folder identifier',()=>{
  assert.ok(documentation.length>=5,'M44 documentation missing from privacy check');
  for(const name of documentation){
    const text=readFileSync(join(docs,name),'utf8');
    for(const pattern of privateDriveIdentifierPatterns){
      pattern.lastIndex=0;
      assert.equal(pattern.test(text),false,`${name}: raw Drive identifier must be kept in private custody evidence`);
    }
  }
});
