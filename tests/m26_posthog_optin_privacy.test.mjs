import test from 'node:test';
import assert from 'node:assert/strict';
import {createIberfitPosthogObserver,posthogConsentActive,posthogConsentAvailable,renderPosthogConsentPanel} from '../src/m26/analytics/posthog-manual.js';

function setup(config={enabled:true,provider:'posthog',publicKey:'phc_'+('X'.repeat(28)),host:'https://us.i.posthog.com'},qaOnly=false){
 const listeners={};const sent=[];
 const element={getAttribute:(name)=>name==='data-m26-role'?'client':null};
 const root={addEventListener:(k,cb)=>{listeners[k]=cb;},removeEventListener:(k)=>{delete listeners[k];},
   contains:(x)=>Boolean(x),querySelector:(selector)=>selector.includes('m26-shell')?element:null};
 const scope={crypto:{randomUUID:()=> 'synthetic-ephemeral-not-a-user'},innerWidth:390,
   fetch:(url,opts)=>{sent.push({url,opts});return Promise.resolve({ok:true});}};
 const watcher=createIberfitPosthogObserver({root,config,production:true,qaOnly,releaseSha:'a'.repeat(40),scope,fetchImpl:scope.fetch});
 const checkbox={checked:true,closest:(selector)=>selector.includes('consent')?checkbox:null};
 function change(checked){checkbox.checked=checked;listeners.change?.({target:checkbox});}
 function click(attrs){const target={getAttribute:(name)=>attrs[name]||null};listeners.click?.({target:{closest:()=>target}});}
 return {watcher,sent,change,click,root};
}
test('Fails closed without configuration, QA, or a valid host',()=>{
 for(const [config,qa] of [[{},false],[{enabled:true,provider:'posthog',publicKey:'phc_'+('X'.repeat(28)),host:'https://evil.example'},false],[{enabled:true,provider:'posthog',publicKey:'phc_'+('X'.repeat(28)),host:'https://us.i.posthog.com'},true]]){
  const a=setup(config,qa);
  assert.equal(a.watcher.available,false);assert.equal(a.sent.length,0);
  a.change(true);a.click({'data-m26-area':'hoy'});assert.equal(a.sent.length,0);a.watcher.destroy();
 }
});
test('Consent is off by default, reversible, per-tab and never stored',()=>{
 const a=setup();assert.equal(a.watcher.consented,false);assert.equal(posthogConsentAvailable(),true);
 assert.match(renderPosthogConsentPanel(),/data-iberfit-analytics-consent/u);
 a.click({'data-m26-area':'hoy'});assert.equal(a.sent.length,0);
 a.change(true);assert.equal(a.watcher.consented,true);assert.equal(posthogConsentActive(),true);
 assert.equal(a.sent.length,1);
 a.change(false);a.click({'data-m26-area':'agenda'});assert.equal(a.sent.length,1);
 a.watcher.destroy();assert.equal(posthogConsentActive(),false);
});
test('Only allowlisted role/area/event and strictly anonymous payload cross network',()=>{
 const a=setup();a.change(true);
 a.click({'data-m26-area':'progreso','data-entity-id':'real-private-user-id'});
 a.click({'data-m26-area':'evil','data-workflow-action':'update-private-data'});
 a.click({'data-workflow-action':'start-published-session','data-entity-id':'private-session-id'});
 assert.equal(a.sent.length,3);
 assert.equal(a.sent[1].url,'https://us.i.posthog.com/i/v0/e/');
 const events=a.sent.map(x=>JSON.parse(x.opts.body));
 assert.deepEqual(events.map(x=>x.event),['iberfit_workspace_viewed','iberfit_navigation_requested','iberfit_training_start_requested']);
 for(const entry of events){
  const data=JSON.stringify(entry);
  assert.equal(entry.properties.role,'client');assert.equal(entry.properties.device,'mobile');
  assert.equal(entry.properties.$process_person_profile,false);
  for(const forbidden of ['real-private-user-id','private-session-id','email','health','password','session_recording','http://app.iberfit','customerId','tokenValue']){
   assert.equal(data.includes(forbidden),false,forbidden);
  }
 }
 assert.equal(a.sent[0].opts.credentials,'omit');assert.equal(a.sent[0].opts.referrerPolicy,'no-referrer');
 a.click({'data-m26-action':'logout'});assert.equal(a.watcher.consented,false);
 a.watcher.destroy();
});
test('Never subscribes to DOM content, keystrokes, clicks without consent, or session recording',()=>{
 const a=setup();assert.equal(a.root.querySelector('.m26-shell[data-m26-role]')!==null,true);
 assert.match(renderPosthogConsentPanel({admin:true}),/m26-admin-notice/u);
 a.watcher.destroy();
});
