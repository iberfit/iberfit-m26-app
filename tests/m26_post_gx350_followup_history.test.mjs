import test from 'node:test';
import assert from 'node:assert/strict';
import {professionalFollowupHistoryComparisons,compareProfessionalFollowupPair} from '../src/m26/domain/professional-followup.js';
import {IRI_PROTOCOL_CATALOG_VERSION} from '../src/m26/workflows/iri-protocol-catalog.js';
import {renderFollowupHistory} from '../src/m26/workflows/professional-followup-ui.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const now=new Date('2026-11-28T12:00:00Z');
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const clientId=uuid(900);
function row(n,day,value,opts={}){
 const protocol={schemaVersion:1,testId:'chair-stand-30s',field:'repetitions',side:'not-applicable',variant:'standard-arms-crossed',protocolVersion:IRI_PROTOCOL_CATALOG_VERSION,configuration:'Silla 45 cm',adaptationReason:'',setup:{chairHeightCm:45},...opts.protocol};
 return {id:uuid(n),clientId:opts.clientId??clientId,measuredAt:'2025-01-'+String(day).padStart(2,'0')+'T12:00:00Z',value,unit:'reps',protocol,revision:1,rectification:opts.rectification??null};
}
const current=row(3,10,20),older=row(1,1,10),previous=row(2,5,15);
const different=row(2,5,16,{protocol:{configuration:'Silla 50 cm',setup:{chairHeightCm:50}}});
const invalidated=row(2,5,15,{rectification:{id:uuid(50),targetId:uuid(2),reason:'measurement_error',voidedAt:'2025-01-06T12:00:00Z'}});
const copy='La medición anterior cargada no es comparable. No se selecciona otra más antigua automáticamente.';
test('professional history compares immediate valid predecessor, never the largest gain',()=>{
 const pairs=professionalFollowupHistoryComparisons([current,previous,older],{now});
 assert.equal(pairs.get(current.id).previous.id,previous.id);
 assert.equal(pairs.get(current.id).comparison.delta,5);
 assert.equal(pairs.get(previous.id).comparison.delta,5);
 assert.equal(pairs.has(older.id),false);
});
test('an incompatible nearer observation blocks fallback to older comparable data',()=>{
 assert.equal(compareProfessionalFollowupPair(older,current,{now}).delta,10);
 const pair=professionalFollowupHistoryComparisons([current,different,older],{now}).get(current.id);
 assert.equal(pair.previous.id,different.id);assert.equal(pair.comparison,null);
});
test('rectification blocks fallback but remains in historical trace',()=>{
 const pair=professionalFollowupHistoryComparisons([current,invalidated,older],{now}).get(current.id);
 assert.equal(pair.previous.id,invalidated.id);assert.equal(pair.comparison,null);
});
test('same-day predecessor does not resurrect older pair',()=>{
 const sameDay={...previous,measuredAt:'2025-01-10T10:00:00Z'};
 assert.equal(professionalFollowupHistoryComparisons([current,sameDay,older],{now}).get(current.id).comparison,null);
});
test('unrelated metric and different client never mask the correct predecessor',()=>{
 const unrelated=row(5,7,4,{protocol:{testId:'push-test',field:'repetitions',variant:'standard',configuration:'Empuje estándar',setup:{variant:'standard',supportHeightCm:null,durationSeconds:null}}});
 const foreign=row(4,8,20,{clientId:uuid(901)});
 const pairs=professionalFollowupHistoryComparisons([current,foreign,unrelated,previous],{now});
 assert.equal(pairs.get(current.id).previous.id,previous.id);
 assert.equal(pairs.has(foreign.id),false);
});
test('the rendered review action matches the canonical predecessor and explains incompatible data',()=>{
 const html=renderFollowupHistory([current,different,older],{allowReview:true});
 assert.ok(html.includes(copy));
 assert.ok(!html.includes('data-gx-followup-action="review-publication" data-gx-id="'+current.id+'"'));
 const comparable=renderFollowupHistory([current,previous,older],{allowReview:true});
 assert.ok(comparable.includes('data-gx-followup-action="review-publication" data-gx-id="'+current.id+'"'));
 assert.ok(!comparable.includes(copy));
});
test('the comparison boundary is translated in English, French and Portuguese',()=>{
 for(const language of ['en','fr','pt'])assert.notEqual(iberfitSurfaceTranslate(copy,{language}),copy);
});
