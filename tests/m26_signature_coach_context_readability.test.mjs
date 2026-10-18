import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildCoachLiveContextSignal,buildCoachSessionReadinessContext} from '../src/m26/ui/session-readiness.js';

const runtime=readFileSync(new URL('../src/m26/design/runtime-static.css',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8');
const selector='.m27-session-live-context-copy>small{';
function rules(css,selector){
  const a=css.indexOf(selector);assert.ok(a>=0,'missing style '+selector);
  const b=css.indexOf('}',a);return css.slice(a+selector.length,b);
}

test('Coach safety notes never truncate in source or CSP-safe production stylesheet',()=>{
  for(const css of [source,runtime]){
    const block=rules(css,selector);
    assert.match(block,/white-space:normal/u);
    assert.match(block,/overflow:visible/u);
    assert.match(block,/overflow-wrap:anywhere/u);
    assert.match(block,/font-size:\.86rem/u);
    assert.doesNotMatch(block,/text-overflow:ellipsis|overflow:hidden|white-space:nowrap/u);
    assert.match(rules(css,'.m27-session-readiness-coach-item>small{'),/overflow-wrap:anywhere/u);
  }
});

test('Confirmed pain retains the complete note and takes priority over overdue decisions',()=>{
  const text='Molestia localizada de rodilla derecha con el rango de flexión habitual.';
  const signal=buildCoachLiveContextSignal({
    feedback:{pain:true,painNotes:text},
    decisions:{overdueCount:2,topSignal:'Revisar dosis de entrenamiento'},
  });
  assert.equal(signal.kind,'confirmed-pain');
  assert.equal(signal.detail,text);
  assert.equal(signal.level,'warning');
});
test('Unconfirmed pain is not invented and professional decisions remain separate',()=>{
  const signal=buildCoachLiveContextSignal({
    feedback:{pain:false,painNotes:'No debe usarse como dolor'},
    decisions:{overdueCount:1,topSignal:'Comprobar adherencia'},
  });
  assert.equal(signal.kind,'decision-overdue');
  assert.equal(signal.detail,'Comprobar adherencia');
});
test('Client context remains gated by role and no business action is added',()=>{
  assert.match(source,/if\(role!=='coach'\|\|!\['active','rest'\]\.includes\(liveState\)\)return false/u);
  assert.doesNotMatch(source,/document\.write\(|innerHTML\s*=/u);
  assert.match(source,/if\(!signal\)return false/u);
});

test('Confirmed Coach session keeps every character from long professional feedback',()=>{
  const painNotes='Molestia confirmada en rodilla derecha, revisar técnica y rango antes de progresar. '.repeat(9).trim();
  const comment='El cliente describe una modificación de intensidad y necesidad de revisar la próxima carga. '.repeat(7).trim();
  assert.ok(painNotes.length>220);
  assert.ok(comment.length>280);
  const state={
    collections:{
      sessionExecutions:[{
        id:'session-coach-completed',
        clientId:'client-context-1',
        status:'completed',
        syncStatus:'clean',
        completedAt:'2026-10-17T17:00:00Z',
        feedback:{pain:true,painNotes,comment},
      }],
      m26Entities:[],
    },
  };
  const context=buildCoachSessionReadinessContext(state,'client-context-1');
  assert.equal(context.feedback.hasExecution,true);
  assert.equal(context.feedback.pain,true);
  assert.equal(context.feedback.painNotes,painNotes);
  assert.equal(context.feedback.comment,comment);
  assert.equal(buildCoachLiveContextSignal(context).detail,painNotes);
});

test('Long overdue Coach decisions are preserved, and source contains no implicit text cap',()=>{
  const decision='Reevaluar prescripción del bloque y documentar decisión antes de progresar. '.repeat(10).trim();
  const signal=buildCoachLiveContextSignal({
    feedback:{pain:false},
    decisions:{overdueCount:1,topSignal:decision},
  });
  assert.ok(decision.length>280);
  assert.equal(signal.kind,'decision-overdue');
  assert.equal(signal.detail,decision);
  assert.doesNotMatch(source,/function coachBriefText\(value,max=/u);
  assert.doesNotMatch(source,/return String\(value\?\?''\)\.trim\(\)\.slice\(/u);
  assert.doesNotMatch(source,/coachBriefText\([^\n]*,\s*\d+\)/u);
});
