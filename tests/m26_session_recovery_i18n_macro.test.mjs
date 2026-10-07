import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const recovery=()=>fs.readFileSync('src/m26/workflows/session-sync-recovery-ui.js','utf8');
const i18n=()=>fs.readFileSync('src/m26/ui/i18n-surface.js','utf8');

function actionableMessages(source){
  const block=source.match(/const ACTIONABLE_FAILURE_MESSAGES=Object\.freeze\(\{([\s\S]*?)\}\);/u)?.[1]||'';
  const messages=[];
  for(const line of block.split('\n')){
    const match=line.match(/(?:message:)?'([^']+)'/u);
    if(match&&!match[1].startsWith('[data-'))messages.push(match[1]);
  }
  return [...new Set(messages)];
}

test('todos los mensajes operativos recuperables están clasificados por i18n',()=>{
  const messages=actionableMessages(recovery());
  assert.equal(messages.length,27,'el contrato operativo esperado debe permanecer explícito');
  const catalogue=i18n();
  const missing=messages.filter((message)=>!catalogue.includes(`['${message}'`));
  assert.deepEqual(missing,[],'ningún mensaje visible de recuperación puede quedar fuera de ES/EN/FR/PT');
});

test('los mensajes técnicos no se convierten en catálogo visible por accidente',()=>{
  const source=recovery();
  assert.match(source,/if\(!recovery\)return null;/u);
  assert.match(source,/if\(phase==='sync'\)return null;/u);
});