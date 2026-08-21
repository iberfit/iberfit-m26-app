import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/gu,'\n');
const ci=read('.github/workflows/ci.yml');
const contributing=read('CONTRIBUTING.md');

function stepBlock(name){
  const marker=`      - name: ${name}\n`;
  const start=ci.indexOf(marker);
  assert.notEqual(start,-1,`missing CI step: ${name}`);
  const next=ci.indexOf('\n      - name:',start+marker.length);
  return ci.slice(start,next===-1?ci.length:next);
}

test('RC64 release governance routes main and PRs to main through modern quality gates',()=>{
  assert.match(ci,/push:\n    branches:\n      - main\n/u);

  const legacy=stepBlock('Validar RC29');
  assert.match(legacy,/github\.ref != 'refs\/heads\/main'/u);
  assert.match(legacy,/github\.base_ref != 'main'/u);

  for(const name of ['Preparar Quality Platform RC64','Validar RC58 app integrity']){
    const block=stepBlock(name);
    assert.match(block,/github\.ref == 'refs\/heads\/main'/u);
    assert.match(block,/github\.base_ref == 'main'/u);
    assert.match(block,/feature\/rc58-design-system/u);
  }

  const quality=stepBlock('Validar RC58 app integrity');
  for(const command of [
    'node scripts/check_utf8_mojibake.mjs',
    'node scripts/generate_rc58_app_shell.mjs --check',
    'npm test',
    'npm run quality:rc64:browser',
    'npm run quality:rc64:real-shell',
    'npm run quality:rc64:performance',
  ]){
    assert.ok(quality.includes(command),`missing modern gate command: ${command}`);
  }
});

test('RC64 release governance documents main as the sole production source-of-truth',()=>{
  assert.match(contributing,/Production source-of-truth: `main`/u);
  assert.match(contributing,/`prepublicacion\/rc29` queda solo como referencia historica/u);
  assert.match(contributing,/Nunca hacer commits directos a `main`/u);
});