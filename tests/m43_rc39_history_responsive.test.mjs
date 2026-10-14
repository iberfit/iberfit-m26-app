import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderCompletedSessionHistory} from '../src/m26/rc39/completed-session-history.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
const css=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');

test('RC39 Client restores confirmed session history with useful facts and excludes unfinished executions',()=>{
  const model={kind:'sesion',role:'client',serviceActive:true,
    selectedClient:{modality:'hibrido'},rc39:{role:'client',sessionProjections:[]},
    executions:[
      {statusRaw:'completada',date:'2026-10-14',
        body:{status:'completada',completedAt:'2026-10-14T10:00:00Z',
          sourceSnapshot:{title:'Sesión fuerza y carrera'},
          results:{a:{reps:8},b:{distanceKm:4}},feedback:{sessionRpe:7}}},
      {statusRaw:'en_curso',body:{status:'en_curso',title:'No publicar aún'}},
    ]};
  const html=renderCompletedSessionHistory(model);
  assert.match(html,/Sesión fuerza y carrera/);
  assert.match(html,/2 registros/);
  assert.match(html,/Esfuerzo percibido 7\/10/);
  assert.doesNotMatch(html,/No publicar aún/);
  assert.equal((html.match(/data-m43-completed-session/g)||[]).length,1);
  assert.match(renderRc39Route(model),/data-m43-session-history/);
  assert.doesNotMatch(renderRc39Route({...model,role:'coach'}),/data-m43-session-history/);
});
test('RC39 history safe empty state plus mobile wrapping',()=>{
  assert.match(renderCompletedSessionHistory({executions:[]}),/Cuando completes una sesión/);
  assert.match(css,/\.m26-session-experience__capability\{\s*display:inline-flex;\s*flex:0 0 auto;/);
  assert.match(css,/\.m26-session-experience__capabilities\{flex-wrap:wrap;overflow:visible;/);
});
