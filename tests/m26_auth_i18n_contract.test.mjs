import test from 'node:test';
import assert from 'node:assert/strict';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const TITLE='Identidad confirmada · acceso pendiente';
const DETAIL='La cuenta es válida, pero todavía no tiene una aplicación IBERFIT habilitada. Puedes volver a intentar el acceso o entrar con otra cuenta mientras se revisa la asignación.';

test('account-context auth state remains classified in every supported translated language',()=>{
  for(const language of ['en','fr','pt']){
    const title=iberfitSurfaceTranslate(TITLE,{language});
    const detail=iberfitSurfaceTranslate(DETAIL,{language});
    assert.notEqual(title,TITLE,`${language} must translate the auth context title`);
    assert.notEqual(detail,DETAIL,`${language} must translate the auth context detail`);
    assert.ok(title.trim());
    assert.ok(detail.trim());
  }
});
