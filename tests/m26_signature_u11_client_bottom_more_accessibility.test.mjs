import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bindShellDisclosureDismissSupport} from '../src/m26/rc39/shell-enhancer.js';
import {renderRouteView} from '../src/m26/modules/route-render.js';

const nav=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../src/m26/rc39/shell-enhancer.js',import.meta.url),'utf8');
test('SIGNATURE U11 reuses the existing disclosure rather than binding a second controller',()=>{
 assert.match(source,/SHELL_DISCLOSURE_BOUND_DOCUMENTS=new WeakSet\(\)/);
 assert.match(source,/documentLike.addEventListener\('focusin'/);
 assert.match(source,/closeDetailsDisclosure\(details,\{restoreFocus:false\}\)/);
 const html=renderRouteView({kind:'placeholder',role:'client',title:'Prueba'});
 assert.doesNotMatch(html,/m26-client-bottom-nav-spark|✦/);
 assert.match(html,/m26-client-bottom-nav-icon" aria-hidden="true"/);
 assert.match(html,/aria-haspopup="menu" aria-controls="m26-client-bottom-nav-menu"/);
});
test('Tab fuera del menú lo cierra sin devolver el foco a su lanzador',()=>{
 const events=new Map(),attrs=new Map();
 let summaryFocusCount=0;
 const summary={setAttribute(name,value){attrs.set(name,value)},focus(){summaryFocusCount++}};
 const internal={};
 const details={open:true,matches:selector=>selector==='details.m26-client-bottom-nav-more',contains:target=>target===internal||target===summary,querySelector:selector=>selector==='summary'?summary:null,removeAttribute(name){if(name==='open')this.open=false}};
 const doc={
  addEventListener(name,fn){events.set(name,[...(events.get(name)||[]),fn])},
  querySelector(sel){return sel.includes('m26-client-bottom-nav-more[open]')&&details.open?details:null}
 };
 assert.equal(bindShellDisclosureDismissSupport(doc),true);
 assert.equal(bindShellDisclosureDismissSupport(doc),false);
 for(const fn of events.get('focusin')||[])fn({target:internal});
 assert.equal(details.open,true);
 for(const fn of events.get('focusin')||[])fn({target:{}});
 assert.equal(details.open,false);
 assert.equal(attrs.get('aria-expanded'),'false');
 assert.equal(summaryFocusCount,0);
});
test('menú acotado a 320 px, pantalla baja y safe areas, sin interferir con el dock',()=>{
 assert.match(nav,/max-height:\s*min\(24rem,\s*62dvh,\s*calc\(100dvh - 9rem - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)\)/u);
 assert.match(nav,/scroll-padding-block:\s*\.5rem/u);
 assert.match(nav,/min-height:\s*66px/u);
 assert.match(nav,/prefers-reduced-motion:\s*reduce/u);
 assert.match(nav,/@media \(max-width:\s*370px\)/u);
 assert.doesNotMatch(nav,/\.m26-client-bottom-nav-spark/u);
});
