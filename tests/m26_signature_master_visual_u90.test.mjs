import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
const s=css.split('SIGNATURE MASTER U90')[1]?.split('END SIGNATURE MASTER U90')[0]||'';
const catalog=JSON.parse(readFileSync(new URL('../qa/visual/signature-360-coverage.json',import.meta.url),'utf8'));

test('U90 uses a single existing canonical visual sheet for all 43 routes',()=>{
 assert.ok(s.length>9000);
 assert.ok((s.match(/\.m26-main/g)||[]).length>25,'real authenticated route container');
 assert.doesNotMatch(s,/\.m26-workspace(?![-\w])/,'do not target a nonexistent route wrapper');
 assert.deepEqual(Object.fromEntries(Object.entries(catalog.roles).map(([role,areas])=>[role,areas.length])),{client:9,coach:17,admin:17});
 for(const role of ['client','coach','admin'])assert.ok(s.includes('data-m26-role="'+role+'"'),role);
 for(const element of ['.m26-route-intro','.m26-panel','.m26-stat','.m26-admin-table','.m26-session-builder-v2','.m26-client-bottom-nav'])
  assert.ok(s.includes(element),element);
 assert.match(s,/--iberfit-master-ivory/);
 assert.match(s,/--iberfit-master-gold/);
});
test('U90 provides 320/390 mobile, 768–1150 tablet, desktop and Retina-safe vector hooks',()=>{
 assert.match(s,/@media \(max-width:600px\)/);
 assert.match(s,/@media \(min-width:768px\) and \(max-width:1150px\)/);
 assert.match(s,/shape-rendering:geometricPrecision/);
 assert.match(s,/data-m26-client-guide="secondary-actions"/);
 assert.match(s,/m26-text-action\[data-m26-area="clientes"\]/);
 assert.match(s,/min-inline-size:0/);
 assert.match(s,/overflow-x:auto/);
 assert.match(s,/prefers-reduced-motion:reduce/);
 assert.match(s,/forced-colors:active/);
 assert.match(s,/:focus-visible/);
});
test('U90 never replaces auth, commands or context with prototype labels',()=>{
 assert.doesNotMatch(s,/data-workflow-action|localStorage|fetch\(|Supabase|API_KEY|\[DEMO\]|FICTICIOS|innerHTML|!important|display:none|pointer-events:none|position:fixed/);
 const vm={role:'client',serviceKind:'training',clients:[{id:'client-qa',serviceActive:true}],operations:{},
  appointments:[],upcoming:[],rc39:{sessionProjections:[{id:'session-qa',visible:true,canClientStart:true,session:{title:'Sesión'}}]}};
 assert.match(renderHoyRoute(vm),/data-workflow-action="start-published-session"/);
 assert.doesNotMatch(renderHoyRoute({...vm,serviceKind:'iri_only'}),/data-workflow-action="start-published-session"/);
});
test('U90 does not erase navigation, touch targets, charts or real status labels',()=>{
 assert.doesNotMatch(s,/overflow-x:hidden|overflow:hidden|visibility:hidden|transform:scale/);
 assert.match(s,/min-block-size:44px/);
 assert.match(s,/font-variant-numeric:tabular-nums/);
 assert.match(s,/shape-rendering:geometricPrecision/);
});
