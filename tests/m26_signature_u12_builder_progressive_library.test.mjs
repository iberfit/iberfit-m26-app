import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSessionLibraryResults} from '../src/m26/workflows/session-ui.js';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('src/m26/workflows/session-controller.js');
const app=read('src/m26/app/application.js');
const css=read('src/m26/design/dark-iberfit-v2.css');
const items=Array.from({length:120},(_,i)=>({
 id:'u12-ex-'+String(i+1).padStart(3,'0'),name_es:'Ejercicio de prueba '+(i+1),
 pattern:'empuje',equipment:'mancuernas',primary_muscles:['pectorales']
}));
const catalog={search:()=>items};
const draft={blocks:[],activeGroupId:null};
const options={catalog,draft,query:'p',filters:{},mediaMap:null,role:'coach'};
const hits=(html)=>(html.match(/data-session-action="add-exercise"/gu)||[]).length;
test('U12: búsqueda de 120 resultados pinta solo los 24 iniciales, no un árbol oculto de 96',()=>{
 const x=renderSessionLibraryResults(options);
 assert.equal(x.count,120);
 assert.equal(x.shown,24);
 assert.equal(hits(x.markup),24);
 assert.match(x.markup,/data-session-action="load-more-library"/u);
 assert.match(x.markup,/24 de 120/u);
 assert.doesNotMatch(x.markup,/u12-ex-025|u12-ex-120/u);
 assert.doesNotMatch(x.markup,/m26-exercise-results-more/u);
});
test('U12: paginación progresiva mantiene 120/120 accesibles y sin duplicados',()=>{
 for(const limit of [24,48,72,96,120]){
  const result=renderSessionLibraryResults({...options,visibleLimit:limit});
  assert.equal(result.shown,limit);
  assert.equal(hits(result.markup),limit);
  const ids=[...result.markup.matchAll(/data-exercise-id="(u12-ex-\d+)"/gu)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(ids.length,limit);
  assert.match(result.markup,new RegExp('u12-ex-'+String(limit).padStart(3,'0'),'u'));
  if(limit<120)assert.match(result.markup,/data-session-action="load-more-library"/u);
  else assert.doesNotMatch(result.markup,/data-session-action="load-more-library"/u);
 }
});
test('U12: el catálogo dinámico mayor de 500 ejercicios conserva todos los destinos',()=>{
 const large=Array.from({length:620},(_,i)=>({id:'large-'+String(i+1),name_es:'Fuerza '+(i+1),pattern:'fuerza',equipment:'mancuernas',primary_muscles:[]}));
 const wide=renderSessionLibraryResults({...options,catalog:{search:()=>large},visibleLimit:720});
 assert.equal(wide.count,620);
 assert.equal(wide.shown,620);
 assert.equal(hits(wide.markup),620);
 assert.doesNotMatch(wide.markup,/data-session-action="load-more-library"/u);
});
test('U12: peticiones malformadas nunca generan una lista interminable',()=>{
 const huge=renderSessionLibraryResults({...options,visibleLimit:100000});
 assert.equal(huge.shown,120);
 const bad=renderSessionLibraryResults({...options,visibleLimit:'not-a-number'});
 assert.equal(bad.shown,24);
});
test('U12: el controlador conserva scroll/foco y restablece páginas al buscar o cambiar filtros',()=>{
 assert.match(source,/action==='load-more-library'/u);
 assert.match(source,/const newlyAvailable=all.slice\(current\)/u);
 assert.match(source,/\.focus\?\.\(\{preventScroll:false\}\)/u);
 assert.match(source,/context.setLibraryVisibleLimit\?\.\(24\)/gu);
 assert.match(app,/libraryVisibleLimit:sessionUi\.libraryVisibleLimit\|\|24/u);
 assert.match(app,/setLibraryVisibleLimit:\(n\)=>/u);
});
test('U12: acción táctil accesible en Coach sin capa nueva ni ocultar destinos',()=>{
 assert.match(css,/\.m26-builder-library-more\{/u);
 assert.match(css,/min-height:48px/u);
 assert.match(css,/\.m26-builder-library-more:focus-visible/u);
 assert.match(css,/var\(--iberfit-color-surface-base\)/u);
});
