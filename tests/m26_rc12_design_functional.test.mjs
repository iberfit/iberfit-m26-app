import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditInteractiveMarkup,assertActionAllowed,M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';
import {auditDesignContract,auditPaletteContrast,contrastRatio} from '../src/m26/ui/design-system.js';
import {renderActivityRoute,renderPrivateNotesRoute,renderVerificationRoute} from '../src/m26/modules/route-render.js';

test('registro unificado cubre engagement y verificación',()=>{
  for(const action of ['submit-checkin','define-habit','log-habit','save-private-note','retry','inspect','discard_local','refresh'])assert.ok(M26_ACTION_REGISTRY[action]);
  assert.equal(assertActionAllowed('save-private-note','client'),false);
  assert.equal(assertActionAllowed('submit-checkin','client'),true);
});

test('auditor detecta acción desconocida y disabled sin aria',()=>{
  const out=auditInteractiveMarkup('<button type="button" data-engagement-action="fantasma" disabled>Guardar</button>');
  assert.equal(out.ok,false);
  assert.ok(out.errors.includes('ACTION_UNREGISTERED:fantasma'));
  assert.ok(out.errors.includes('DISABLED_ARIA_REQUIRED'));
});

test('contrato visual incluye accesibilidad y responsive',()=>{
  const css=fs.readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');
  const out=auditDesignContract(css);
  assert.equal(out.ok,true,JSON.stringify(out.checks));
});

test('rutas engagement no contienen acciones sin registro',()=>{
  const capability={ready:true,missing:[]};
  const activity=renderActivityRoute({checkins:[],habits:[],canManageHabits:true,capabilities:{checkins:capability,habits:capability}});
  const notes=renderPrivateNotesRoute({notes:[],capability});
  const verification=renderVerificationRoute({center:{deploymentBlocked:true,summary:{pending:1,conflicts:1,rejected:1,total:3},items:[{operationId:'op-1',status:'pending',title:'Pendiente',entityType:'checkin',entityId:'e-1',actions:['inspect','retry','discard_local']}]}});
  for(const markup of [activity,notes,verification])assert.equal(auditInteractiveMarkup(markup).ok,true,JSON.stringify(auditInteractiveMarkup(markup).errors));
});


test('paleta premium supera contraste WCAG AA en combinaciones críticas',()=>{
  const audit=auditPaletteContrast();
  assert.equal(audit.ok,true,JSON.stringify(audit.combinations));
  assert.ok(contrastRatio('#f7f1e4','#07150f')>7);
});
