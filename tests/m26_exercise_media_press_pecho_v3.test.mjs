import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const manifestPath='scripts/exercise-media/approved/IBF-PRESS-DE-PECHO-CON-MANCUERNAS/approved-batch.json';
const expectedSha='13944c1c2674955876162082aaf6ccaf3e6298c9969644812ac263b0a5c82428';
const expectedPath='IBF-PRESS-DE-PECHO-CON-MANCUERNAS/movement-13944c1c2674.webp';

test('press de pecho v3 cumple contrato approved-only y reconstruye bytes exactos',()=>{
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.schema,'iberfit.exercise.media.approved-batch.v1');
  assert.equal(manifest.target,'prod');
  assert.equal(manifest.items.length,1);
  const item=manifest.items[0];
  assert.equal(item.exercise_id,'IBF-PRESS-DE-PECHO-CON-MANCUERNAS');
  assert.equal(item.human_approved,true);
  assert.equal(item.publishable,true);
  assert.equal(item.approval?.method,'human_owner_approval');
  assert.deepEqual(item.approval?.scopes,['visual','biomechanics']);
  assert.match(String(item.approval?.note||''),/isotipo oficial real/i);

  const movement=item.media?.movement;
  assert.equal(item.media?.schema,'iberfit.exercise.visual.v1');
  assert.equal(item.media?.style,'iberfit-premium-movement-pair-v1');
  assert.equal(item.media?.bucket,'iberfit-exercise-media');
  assert.equal(item.media?.published,true);
  assert.equal(item.media?.clientVisible,true);
  assert.equal(item.media?.coachVisible,true);
  assert.equal(item.media?.qa?.biomechanics,'approved');
  assert.equal(item.media?.qa?.visual,'approved');
  assert.equal(movement?.mime,'image/webp');
  assert.equal(movement?.width,640);
  assert.equal(movement?.height,800);
  assert.equal(movement?.path,expectedPath);
  assert.equal(movement?.sha256,expectedSha);

  const parts=item.source_base64_parts;
  assert.equal(parts.length,6);
  assert.ok(parts.every(p=>p.includes('-v3.b64.')));
  assert.ok(parts.every(p=>fs.existsSync(p)));
  const encoded=parts.map(p=>fs.readFileSync(p,'utf8').replace(/\s+/g,'')).join('');
  const bytes=Buffer.from(encoded,'base64');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expectedSha);
  assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF');
  assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP');
});
