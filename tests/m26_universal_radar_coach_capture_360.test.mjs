import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCoachCaptureNotes,renderCoachCapturePreview,buildCoachCaptureDraft} from '../src/m26/workflows/coach-capture.js';
import {renderCoachCaptureSurface} from '../src/m26/workflows/coach-capture-ui.js';
import {createSessionDraft,validateSessionDraft} from '../src/m26/workflows/session-builder.js';
const exercises=[
 {id:'goblet',name_es:'Sentadilla goblet',measurementProfile:'strength'},
 {id:'trx',name_es:'Remo TRX',measurementProfile:'strength'},
 {id:'plank',name_es:'Plancha',measurementProfile:'isometric'},
];
const catalog={
 get(id){return exercises.find(x=>x.id===id)||null;},
 has(id){return Boolean(this.get(id));},
 search(query){return exercises.filter(x=>x.name_es.toLowerCase().includes(String(query).toLowerCase()));},
};
const notes='3 × 10 Sentadilla goblet · 12 kg por mancuerna · descanso 60 s\n'+
 'Remo TRX 3 × 12 · RPE 7\nPlancha 3 × 30 s';
test('Radar 360 Coach Capture parses examples without fabricating load or RPE',()=>{
 const p=parseCoachCaptureNotes(notes);
 assert.equal(p.ok,true);
 assert.equal(p.rows.length,3);
 assert.equal(p.rows[0].plannedLoad,'12 kg por mancuerna');
 assert.equal(p.rows[0].restSeconds,60);
 assert.equal(p.rows[1].targetRpe,7);
 assert.equal(p.rows[1].plannedLoad,null);
 assert.equal(p.rows[2].reps,'30 s');
 assert.equal(p.rows[2].targetRpe,null);
});
test('Radar 360 fails closed on ambiguous load, ranges, duplicates, and unknown tokens',()=>{
 for(const input of ['3x10 Sentadilla goblet · 12 kg',
 '3x10 Sentadilla goblet · prescripción inventada',
 '3x10 Sentadilla goblet · RPE 7 · RPE 8',
 '3x10 Sentadilla goblet · descanso 4000 s',
 '3x10 Sentadilla goblet · RIR 11',
 '3x10 Sentadilla goblet · RPE 0']){
  assert.equal(parseCoachCaptureNotes(input).ok,false,input);
 }
 assert.equal(parseCoachCaptureNotes('x'.repeat(4001)).ok,false);
 assert.equal(parseCoachCaptureNotes(Array(25).fill('3x10 Sentadilla goblet').join('\n')).ok,false);
});
test('Radar 360 rejects a partial import rather than silently dropping bad lines',()=>{
 const parsed=parseCoachCaptureNotes('3x10 Sentadilla goblet\n5x5 Press · 40 kg');
 assert.equal(parsed.ok,false);
 const draft=createSessionDraft({clientId:'client-a'});
 assert.throws(()=>buildCoachCaptureDraft({draft,parsed,selectedIds:['goblet'],catalog}),/M26_CAPTURE_ROWS_INVALID/);
 assert.equal(draft.blocks.length,0);
});
test('Radar 360 previews are HTML-escaped and catalog matching is never automatic',()=>{
 const parsed=parseCoachCaptureNotes('2x8 <script>alert(1)</script>');
 assert.equal(parsed.ok,true);
 const html=renderCoachCapturePreview(parsed,catalog);
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('<option value="">Seleccionar ejercicio'));
 assert.ok(html.includes('data-session-capture-confirm'));
 const ui=renderCoachCaptureSurface();
 assert.ok(ui.includes('data-session-capture-input'));
 assert.ok(ui.includes('data-session-action="capture-parse"'));
 assert.ok(!ui.includes('data-session-action="capture-confirm"'));
});
test('Radar 360 stages a copy, requires valid exact matches and new publication preview',()=>{
 const parsed=parseCoachCaptureNotes(notes);
 const initial=createSessionDraft({clientId:'client-a'});
 initial.previewAccepted=true;
 assert.throws(()=>buildCoachCaptureDraft({draft:initial,parsed,selectedIds:['goblet','trx','missing'],catalog}),/M26_CAPTURE_MATCH_REQUIRED/);
 assert.equal(initial.blocks.length,0);
 const draft=buildCoachCaptureDraft({draft:initial,parsed,selectedIds:['goblet','trx','plank'],catalog});
 assert.equal(initial.blocks.length,0);
 assert.equal(draft.blocks.length,3);
 assert.equal(draft.previewAccepted,false);
 assert.equal(draft.blocks[0].plannedLoad,'12 kg por mancuerna');
 assert.equal(draft.blocks[1].plannedLoad,'');
 assert.equal(draft.blocks[2].reps,'30 s');
 assert.equal(validateSessionDraft(draft,catalog).ok,true);
});
test('Radar 360 role and stale source identity are guarded in delegated controller',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const ctl=read('src/m26/workflows/session-controller.js');
 const ui=read('src/m26/workflows/session-ui.js');
 assert.ok(ctl.includes("context?.draft?.previewAccepted===true"));
 assert.ok(ctl.includes("captureScope(fresh)!==scope"));
 assert.ok(ctl.includes("captureState.source!==source"));
 assert.ok(ctl.includes('fresh.draft.blocks=staged.blocks'));
 assert.ok(ctl.includes('queueAutosave(fresh)'));
 assert.ok(ctl.includes('captureState=null;mounted=false'));
 assert.ok(ui.includes("role==='coach'&&!draft.previewAccepted?renderCoachCaptureSurface():''"));
});
