import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderActionState} from '../src/m26/ui/action-state.js';

test('estado de acción escapa HTML no confiable antes de renderizarlo',()=>{
  const html=renderActionState({status:'error',message:'<img src=x onerror="alert(1)"> & fallo'});
  assert.doesNotMatch(html,/<img\b/u);
  assert.match(html,/&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; fallo/u);
});

test('error, retry y offline conservan alerta assertive del contrato accesible',()=>{
  for(const status of ['error','retry','offline']){
    const html=renderActionState({status,message:'Fallo'});
    assert.match(html,/role="alert"/u);
    assert.match(html,/aria-live="assertive"/u);
    assert.match(html,/aria-atomic="true"/u);
  }
});

test('loading conserva estado polite y aria-busy',()=>{
  const html=renderActionState({status:'loading',message:''});
  assert.match(html,/role="status"/u);
  assert.match(html,/aria-live="polite"/u);
  assert.match(html,/aria-busy="true"/u);
  assert.match(html,/>Procesando…<\/div>/u);
});

test('sesión en vivo reutiliza el renderer seguro y acerca el feedback a los controles activos',()=>{
  const source=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  assert.match(source,/import \{renderActionState\} from '\.\.\/ui\/action-state\.js';/u);
  assert.match(source,/const state=renderActionState\(actionState\);/u);
  assert.match(source,/\$\{renderActionState\(actionState\)\}/u);
  assert.match(source,/\$\{professionalClientContext\}\n    \$\{sync\}[\s\S]*?\$\{state\}\n        <button type="button" class="m26-primary-action" data-session-action="complete-set"/u);
  assert.match(source,/\$\{state\}\n        <div class="m26-session-live-actions">/u);
});