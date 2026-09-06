import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  iberfitShellTranslate,
  iberfitShellTranslationCoverage,
} from '../src/m26/ui/i18n-shell.js';

const shell=fs.readFileSync('src/m26/shell/shell-render.js','utf8');

test('shell copy is complete for every active application language',()=>{
  const coverage=iberfitShellTranslationCoverage();
  assert.deepEqual(coverage.map(({language})=>language),['es','en','fr','pt']);
  for(const language of coverage){
    assert.equal(language.complete,true);
    assert.equal(language.missing.length,0);
    assert.equal(language.extra.length,0);
    assert.equal(language.blank.length,0);
    assert.equal(language.translated,language.total);
  }
});

test('shell accessibility, access and operation states translate without changing route or auth contracts',()=>{
  assert.equal(iberfitShellTranslate('shell.skipToContent',{language:'es'}),'Saltar al contenido');
  assert.equal(iberfitShellTranslate('shell.skipToContent',{language:'en'}),'Skip to content');
  assert.equal(iberfitShellTranslate('shell.skipToContent',{language:'fr'}),'Aller au contenu');
  assert.equal(iberfitShellTranslate('shell.skipToContent',{language:'pt'}),'Saltar para o conteúdo');
  assert.equal(iberfitShellTranslate('shell.operations.pending.other',{language:'en',params:{count:3}}),'3 pending');
  assert.equal(iberfitShellTranslate('shell.operations.conflicts.one',{language:'fr',params:{count:1}}),'1 conflit');
  assert.equal(iberfitShellTranslate('shell.operations.rejected.other',{language:'pt',params:{count:2}}),'2 por rever');
  assert.equal(iberfitShellTranslate('common.logout',{language:'en'}),'Sign out');

  for(const key of [
    'shell.skipToContent',
    'shell.accessibility.navigation',
    'shell.product',
    'shell.access.title',
    'shell.access.subtitle',
    'shell.access.confirming',
    'shell.access.error',
    'shell.operations.pending.',
    'shell.operations.conflicts.',
    'shell.operations.rejected.',
    'shell.role.',
  ])assert.match(shell,new RegExp(key.replaceAll('.','\\.')));

  assert.match(shell,/applyIberfitDocumentLanguage\(vm\.language\)/u);
  assert.match(shell,/data-m26-action="logout"/u);
  assert.match(shell,/data-m26-action="logout-clear-device"/u);
  assert.doesNotMatch(shell,/innerHTML\s*=/u);
});
