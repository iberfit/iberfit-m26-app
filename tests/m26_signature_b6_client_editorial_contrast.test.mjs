import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
const marker='/* SIGNATURE B6 · Atelier Cliente';
const b6=css.slice(css.indexOf(marker));

function luminance(hex){
  const channels=[1,3,5].map(index=>Number.parseInt(hex.slice(index,index+2),16)/255);
  const linear=channels.map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
  return linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722;
}
function contrast(a,b){
  const one=luminance(a),two=luminance(b);
  return (Math.max(one,two)+0.05)/(Math.min(one,two)+0.05);
}
function clientVm(overrides={}){
  return {role:'client',serviceKind:'training',
    clients:[{id:'c1',name:'Cliente QA'}],appointments:[],upcoming:[],
    operations:{},rc39:{sessionProjections:[]},...overrides};
}

test('B6 editorial material is deliberately scoped to Client Today and no other role',()=>{
  assert.ok(b6.length>3500);
  assert.match(b6,/m26-client-home-editorial-v3 .m26-client-home-journey/u);
  for(const line of b6.split('\n').filter(line=>line.trim().startsWith('.m26-shell'))){
    assert.match(line.trim(),/^\.m26-shell\[data-m26-role="client"\] \.m26-workspace \.m26-client-home-editorial-v3/u);
  }
  for(const role of ['coach','admin']){
    assert.doesNotMatch(renderHoyRoute({...clientVm(),role}),/m26-client-home-editorial-v3/u);
  }
  assert.match(renderHoyRoute(clientVm()),/m26-client-home-editorial-v3/u);
});

test('B6 no extra overlay, UI permission or blocking motion is introduced',()=>{
  assert.doesNotMatch(b6,/!important|position\s*:\s*(?:fixed|sticky)|(?:backdrop-filter|animation\s*:\s*infinite)/u);
  assert.doesNotMatch(b6,/data-workflow-action|data-session-action|\.m26-auth-|role="admin"/u);
  assert.match(b6,/@media\(max-width:680px\)/u);
  assert.match(b6,/@media\(prefers-reduced-motion:reduce\)/u);
  assert.match(b6,/@media\(forced-colors:active\)/u);
  assert.match(b6,/min-height:48px/u);
  assert.match(b6,/:focus-visible/u);
});

test('B6 warm paper keeps journey titles, descriptions, progress numbers WCAG AA',()=>{
  const paper='#F3ECDD';
  for(const [foreground,minimum,description] of [
    ['#173629',7,'heading'],['#3F594A',4.5,'explanatory copy'],
    ['#4E6254',4.5,'step number'],['#6B4B1E',4.5,'section kicker'],
    ['#795817',4.5,'available/published status number'],
  ]){
    assert.ok(b6.includes(foreground),'missing styled '+description);
    assert.ok(contrast(foreground,paper)>=minimum,description+' contrast below '+minimum);
  }
  assert.match(b6,/color-scheme:light/u);
  assert.match(b6,/background:#F3ECDD/u);
});

test('B6 styling cannot turn a published supervised session into an executable action',()=>{
  const vm=clientVm({rc39:{sessionProjections:[{
    id:'s1',visible:true,canClientStart:false,canClientExecute:false,
    ownership:'coach_led',visibility:'summary_only',
    title:'Sesión supervisada',session:{id:'s1',title:'Sesión supervisada',status:'publicado'},
  }]}});
  const html=renderHoyRoute(vm);
  const journey=html.match(/<section class="m26-client-home-journey"[\s\S]*?<\/section>/u)?.[0]||'';
  assert.match(journey,/data-journey-state="published"/u);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
  assert.match(b6,/data-journey-state="published"/u);
  assert.match(b6,/data-journey-state="available"/u);
  assert.doesNotMatch(b6,/<(?:button|a)\b/u);
});
