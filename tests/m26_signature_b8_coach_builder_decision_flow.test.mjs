import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const exercise={id:'b8-squat',name_es:'Sentadilla con mancuernas',pattern:'sentadilla',equipment:'mancuernas'};
const catalog={get:id=>id===exercise.id?exercise:null,search:()=>[exercise],
  facets:{patterns:['sentadilla'],equipment:['mancuernas'],difficulty:[],intent:[]}};
const draft={id:'b8-draft',title:'Fuerza base A',clientId:'b8-client',durationMinutes:55,
  deliveryModality:'presencial',previewAccepted:false,activeGroupId:null,
  blocks:[{id:'b8-exercise',type:'exercise',exerciseId:exercise.id,sets:3,reps:'8-12',restSeconds:60}]};
const render=(overrides={})=>renderSessionBuilder({draft:{...draft,...overrides},
  catalog,role:'coach',mediaMap:null,actionState:{status:'idle',message:''},filters:{},query:''});
const commandbar=html=>html.match(/<header class="m26-builder-commandbar">[\s\S]*?<\/header>/u)?.[0]||'';
const css=readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
const layer=css.slice(css.indexOf('/* SIGNATURE B8 · Coach Builder'));

test('SIGNATURE B8: only review is the primary pre-publication action, never an early publish',()=>{
  const html=render(),header=commandbar(html);
  assert.ok(header.length>250);
  assert.match(header,/data-session-action="save-draft"/u);
  assert.match(header,/data-session-action="preview"/u);
  assert.doesNotMatch(header,/data-session-action="publish"/u);
  assert.doesNotMatch(html,/data-session-action="publish"/u);
  assert.match(html,/data-session-builder-finish/u);
  assert.match(html,/data-session-draft-field="deliveryModality"/u);
  const preview=render({previewAccepted:true});
  assert.match(preview,/data-session-action="publish"/u);
  assert.doesNotMatch(commandbar(preview),/data-session-action="publish"/u);
  assert.doesNotMatch(preview,/data-session-builder-finish/u);
  assert.doesNotMatch(preview,/data-session-action="preview"/u);
  assert.match(readFileSync(new URL('../src/m26/workflows/session-builder.js',import.meta.url),'utf8'),
    /if\(draft\.previewAccepted!==true\)throw new Error\('M26_SESSION_PREVIEW_REQUIRED'\)/u);
});

test('SIGNATURE B8: native nested disclosure preserves the two real actions and discard safety copy',()=>{
  const header=commandbar(render());
  assert.match(header,/<details class="m26-builder-secondary-actions" data-session-builder-secondary-actions>/u);
  assert.match(header,/<summary class="m26-text-action">Más opciones<\/summary>/u);
  assert.match(header,/<button type="button" data-session-action="exit-session">Salir<\/button>/u);
  assert.match(header,/<details class="m26-draft-discard">/u);
  assert.match(header,/<summary class="m26-text-action">Descartar borrador<\/summary>/u);
  assert.match(header,/Elimina este borrador del dispositivo y de la sincronización/u);
  assert.match(header,/No modifica ninguna sesión publicada/u);
  assert.match(header,/data-session-action="discard-draft"/u);
  assert.equal((header.match(/<details\b/gu)||[]).length,(header.match(/<\/details>/gu)||[]).length);
  assert.doesNotMatch(header,/<details[^>]*\sopen(?:\s|>)/u);
});

test('SIGNATURE B8: Coach command bar uses nonblocking natural flow, mobile 48px and forced colors',()=>{
  assert.ok(layer.length>2000,'B8 rules present');
  assert.match(layer,/\.m26-shell\[data-m26-role="coach"\] \.m26-session-builder-v2 \.m26-builder-commandbar/u);
  assert.match(layer,/position:relative/u);
  assert.match(layer,/top:auto/u);
  assert.match(layer,/backdrop-filter:none/u);
  assert.match(layer,/min-height:48px/u);
  assert.match(layer,/touch-action:manipulation/u);
  assert.match(layer,/:focus-visible/u);
  assert.match(layer,/@media\(max-width:840px\)/u);
  assert.match(layer,/@media\(max-width:520px\)/u);
  assert.match(layer,/@media\(forced-colors:active\)/u);
  assert.doesNotMatch(layer,/!important|position:\s*(fixed|sticky)|animation\s*:/u);
});

test('SIGNATURE B8: secondary command is already translated to EN/FR/PT',()=>{
  for(const language of ['en','fr','pt']){
    const translated=iberfitSurfaceTranslate('Más opciones',{language});
    assert.notEqual(translated,'Más opciones',language);
    assert.ok(translated.length>4);
  }
});
