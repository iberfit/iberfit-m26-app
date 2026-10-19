import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderRouteView} from '../src/m26/modules/route-render.js';
import {setClientBottomMoreOpen,syncClientBottomMoreToggle,handleClientBottomMoreKeydown,dismissClientBottomMoreOnClick,dismissClientBottomMoreOnFocus} from '../src/m26/ui/client-bottom-nav-disclosure.js';
const shell=fs.readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/m26/ui/client-bottom-nav.css',import.meta.url),'utf8');
function fixture(){
 const attrs=new Map(),summary={focused:0,setAttribute(k,v){attrs.set(k,v)},focus(){this.focused++}};
 const items=Array.from({length:3},()=>({disabled:false,focused:0,focus(){this.focused++}}));
 const details={open:false,matches:s=>s==='details.m26-client-bottom-nav-more',setAttribute(k,v){attrs.set(k,v)},removeAttribute(k){attrs.delete(k)},querySelector:s=>s===':scope > summary'?summary:null,querySelectorAll:s=>s==='.m26-client-bottom-nav-menu [role="menuitem"]'?items:[],contains:x=>x===summary||items.includes(x)};
 summary.closest=s=>s==='details.m26-client-bottom-nav-more'?details:null;
 for(const item of items)item.closest=s=>s==='.m26-client-bottom-nav-menu [role="menuitem"]'?item:s==='details.m26-client-bottom-nav-more'?details:null;
 const root={querySelector:()=>details.open?details:null};
 const event=(target,key)=>({target,key,prevented:false,preventDefault(){this.prevented=true}});
 return {attrs,summary,items,details,root,event};
}
test('Más conserva menú accesible y 6 destinos sin adorno',()=>{
 const html=renderRouteView({kind:'placeholder',role:'client',title:'Prueba'});
 assert.match(html,/m26-client-bottom-nav-more/);
 assert.match(html,/aria-controls="m26-client-bottom-nav-menu" aria-expanded="false"/);
 assert.match(html,/id="m26-client-bottom-nav-menu" class="m26-client-bottom-nav-menu" role="menu"/);
 assert.equal((html.match(/role="menuitem"/g)||[]).length,6);
 assert.doesNotMatch(html,/m26-client-bottom-nav-spark|✦/);
});
test('estado ARIA sincronizado al abrir, cerrar y togglear',()=>{
 const f=fixture();
 assert.equal(setClientBottomMoreOpen(f.details,true),true);
 assert.equal(f.attrs.get('aria-expanded'),'true');
 assert.equal(syncClientBottomMoreToggle({target:f.details}),true);
 setClientBottomMoreOpen(f.details,false);
 assert.equal(f.attrs.get('aria-expanded'),'false');
});
test('flechas Home End Escape permiten navegación operativa sin rutas falsas',()=>{
 const f=fixture();
 const open=f.event(f.summary,'ArrowDown');
 assert.equal(handleClientBottomMoreKeydown(open),true);
 assert.equal(open.prevented,true);
 assert.equal(f.items[0].focused,1);
 handleClientBottomMoreKeydown(f.event(f.items[0],'ArrowDown'));
 assert.equal(f.items[1].focused,1);
 handleClientBottomMoreKeydown(f.event(f.items[1],'End'));
 assert.equal(f.items[2].focused,1);
 handleClientBottomMoreKeydown(f.event(f.items[2],'ArrowDown'));
 assert.equal(f.items[0].focused,2);
 const esc=f.event(f.items[0],'Escape');
 assert.equal(handleClientBottomMoreKeydown(esc),true);
 assert.equal(f.summary.focused,1);
 assert.equal(f.details.open,false);
 assert.equal(f.attrs.get('aria-expanded'),'false');
});
test('clic y foco externo cierran sin alterar una selección interna',()=>{
 const f=fixture(),outside={closest:()=>null};
 setClientBottomMoreOpen(f.details,true);
 assert.equal(dismissClientBottomMoreOnFocus(f.root,f.items[0]),false);
 assert.equal(dismissClientBottomMoreOnClick(f.root,outside),true);
 setClientBottomMoreOpen(f.details,true);
 assert.equal(dismissClientBottomMoreOnClick(f.root,f.items[0]),true);
 setClientBottomMoreOpen(f.details,true);
 assert.equal(dismissClientBottomMoreOnFocus(f.root,outside),true);
});
test('shell registra y retira listeners de teclado y toggle',()=>{
 assert.match(shell,/root.addEventListener\('keydown',onClientBottomMoreKeydown\)/);
 assert.match(shell,/root.removeEventListener\('keydown',onClientBottomMoreKeydown\)/);
 assert.match(shell,/root.addEventListener\('toggle',syncClientBottomMoreToggle,true\)/);
 assert.match(shell,/root.removeEventListener\('toggle',syncClientBottomMoreToggle,true\)/);
});
test('menú respeta safe areas, altura disponible y movimiento reducido',()=>{
 assert.match(css,/max-height: min\(24rem, 62dvh, calc\(100dvh - 9rem - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)\)/);
 assert.match(css,/scroll-padding-block: \.5rem/);
 assert.match(css,/min-height: 66px/);
 assert.match(css,/prefers-reduced-motion: reduce/);
});
