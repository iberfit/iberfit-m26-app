import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

test('press de pecho v2 permanece preservado como histórico inmutable',()=>{
  const root=process.cwd();
  const id='IBF-PRESS-DE-PECHO-CON-MANCUERNAS';
  const dir=path.join(root,'scripts','exercise-media','approved',id);
  const parts=['00','01','02','03a','03b'].map(s=>path.join(dir,`${id}-v2.b64.${s}`));
  assert.ok(parts.every(file=>fs.existsSync(file)));
  const encoded=parts.map(file=>fs.readFileSync(file,'utf8').replace(/\s+/g,'')).join('');
  const bytes=Buffer.from(encoded,'base64');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'adaa8c05ec2b49720ad65a60d6c6c7393a1ee30a0bf5e16b2a13d4c12b548bc7');
  assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
  assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
});
