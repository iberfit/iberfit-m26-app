import test from 'node:test';
import assert from 'node:assert/strict';
import {datedCompletionSummary} from '../src/m26/workflows/occurrence-workout-service.js';
import {renderDatedCompletionSummary} from '../src/m26/workflows/occurrence-qa-ui.js';
const execution={status:'completada',queue:[{exerciseId:'run',blockId:'b1',sets:3}],
 results:{'run:1':{distanceKm:5,seconds:1800},'extra:1':{reps:10}},
 skippedSets:{'run:2':{reason:'fatigue'}},feedback:{sessionRpe:7,pain:true,comment:'private'},accumulatedActiveMs:1800000};
test('dated confirmed summary counts only frozen queue and preserves omissions and missing data',()=>{
 const summary=datedCompletionSummary(execution);
 assert.deepEqual(summary,{total:3,recorded:1,omitted:1,missing:1,sessionRpe:7,activeMs:1800000,pain:true});
 assert.equal(datedCompletionSummary({...execution,status:'active'}),null);
 assert.equal(datedCompletionSummary({...execution,queue:[]}),null);
 const legacy=datedCompletionSummary({...execution,feedback:{},accumulatedActiveMs:null});
 assert.equal(legacy.sessionRpe,null);assert.equal(legacy.activeMs,null);assert.equal(legacy.pain,null);
});
test('summary appears only on settled completion, with no raw notes or optimistic claim',()=>{
 const view={phase:'completed',completionSummary:datedCompletionSummary(execution)};
 const html=renderDatedCompletionSummary(view);
 assert.match(html,/1 \/ 3/u);assert.match(html,/30:00/u);assert.match(html,/7\/10/u);
 assert.match(html,/Series sin registro/u);assert.match(html,/Molestias registradas/u);
 assert.doesNotMatch(html,/private|fatigue/u);
 assert.equal(renderDatedCompletionSummary({...view,phase:'active'}),'');
 assert.equal(renderDatedCompletionSummary({...view,hasUncertain:true}),'');
 assert.equal(renderDatedCompletionSummary({...view,unsavedWork:true}),'');
});
