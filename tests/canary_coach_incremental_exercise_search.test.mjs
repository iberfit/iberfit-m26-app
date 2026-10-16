import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSessionLibraryResults,renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const samples=[
 {id:'press',name_es:'Press de pecho',name:'Press de pecho',pattern:'empuje',equipment:'Mancuernas'},
 {id:'prensa',name_es:'Prensa de piernas',name:'Prensa de piernas',pattern:'sentadilla',equipment:'Máquina'},
 {id:'remo',name_es:'Remo TRX',name:'Remo TRX',pattern:'tracción',equipment:'TRX'},
];
const catalog={
 facets:{patterns:[],equipment:[],difficulty:[],intent:[]},
 search(query='',filters={}){const q=String(query).trim().toLowerCase();return samples.filter(x=>x.name_es.toLowerCase().includes(q)&&(!filters.pattern||x.pattern===filters.pattern));},
 get(id){return samples.find(x=>x.id===id)||null;},
};
const draft={id:'draft-1',clientId:'client-1',title:'Fuerza IBERFIT',status:'draft',durationMinutes:50,deliveryModality:'guiada_en_app',blocks:[],previewAccepted:false};
test('Coach busca progresivamente P → PR → PRE sin reconstruir la ficha',()=>{
 const full=renderSessionBuilder({draft,catalog,query:'',role:'coach'});
 assert.match(full,/data-session-search-results/);
 for(const [query,count] of [['P',2],['PR',2],['PRE',2],['REMO',1]]){
   const results=renderSessionLibraryResults({draft,catalog,query,role:'coach'});
   assert.equal(results.count,count,query);
   assert.match(results.markup,/data-session-action="add-exercise"/);
   assert.doesNotMatch(results.markup,/data-session-draft-field|data-session-block-field/);
 }
 const empty=renderSessionLibraryResults({draft,catalog,query:'noexiste'});
 assert.equal(empty.count,0);
 assert.match(empty.markup,/No hay coincidencias/);
});
test('Filtros y prevención de repetidos dentro de la biserie siguen siendo válidos',()=>{
 const filtered=renderSessionLibraryResults({draft,catalog,query:'',filters:{pattern:'empuje'}});
 assert.equal(filtered.count,1);
 assert.match(filtered.markup,/Press de pecho/);
 assert.doesNotMatch(filtered.markup,/Remo TRX/);
 const grouped={...draft,activeGroupId:'grupo-1',blocks:[{id:'grupo-1',type:'biserie',exerciseIds:['press']}]};
 const html=renderSessionLibraryResults({draft:grouped,catalog,query:'PR'}).markup;
 assert.match(html,/data-exercise-id="press" disabled aria-disabled="true"/);
 assert.match(html,/data-exercise-id="prensa"/);
});
test('El evento input cambia solo la región de resultados; nunca llama al render completo si existe',()=>{
 const source=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
 const start=source.indexOf("const search=event.target.closest?.('[data-session-search]');if(search){");
 const end=source.indexOf("const liveAddSelect=event.target.closest?.('[data-session-live-add-exercise]');",start);
 assert.ok(start>0&&end>start);
 const handling=source.slice(start,end);
 assert.match(handling,/holder\.innerHTML=result\.markup/);
 assert.match(handling,/else renderSession\(\)/);
 assert.doesNotMatch(handling,/renderSession\(\);\s*if\(wasFocused\)/);
 assert.match(source,/import \{renderSessionLibraryResults\}/);
});
