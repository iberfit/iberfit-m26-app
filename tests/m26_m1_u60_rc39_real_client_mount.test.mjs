import test from 'node:test';
import assert from 'node:assert/strict';
import {renderRouteView} from '../src/m26/modules/route-render.js';

const client=Object.freeze({
  kind:'sesion',role:'client',serviceActive:true,
  sessions:[],rc39:{role:'client',sessionProjections:[],planningItems:[]},
  qaDatedPanel:'<section data-u60-panel data-u60-qa-only="true">QA · U60</section>',
});
test('M1 RC39 actual Client sessions includes U60 inside session scroller, before mobile dock',()=>{
  const markup=renderRouteView(client);
  assert.match(markup,/data-m27-session-surface="sessions"/u);
  assert.equal((markup.match(/data-u60-panel/gu)||[]).length,1);
  const i=markup.indexOf('data-m27-session-surface="sessions"');
  const panel=markup.indexOf('data-u60-panel');
  const dock=markup.indexOf('m26-client-bottom-nav-layer');
  assert.ok(i>=0&&panel>i&&dock>panel,
    'QA date surface must be inside RC39 session route before independent Client dock');
});
test('M1 U60 mount is opt-in only and cannot contaminate PROD, Coach or ordinary Client',()=>{
  for(const vm of [
    {...client,qaDatedPanel:''},
    {...client,qaDatedPanel:undefined},
    {...client,qaDatedPanel:null},
    {...client,role:'coach',rc39:{role:'coach',sessionProjections:[],planningItems:[]}},
  ]){
    const markup=renderRouteView(vm);
    assert.doesNotMatch(markup,/data-u60-panel/u);
  }
});
