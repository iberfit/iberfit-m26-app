import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {navigationForRole} from '../src/m26/shell/navigation.js';
import {getIberfitLanguage} from '../src/m26/ui/i18n.js';

const shell=readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
const navSource=readFileSync(new URL('../src/m26/shell/navigation.js',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../src/m26/ui/i18n.js',import.meta.url),'utf8');
function grouped(role){
  const begin=shell.indexOf('  '+role+':Object.freeze([');
  const end=shell.indexOf('  ]),',begin);
  assert.ok(begin>=0&&end>begin);
  const block=shell.slice(begin,end);
  const items=[...block.matchAll(/keys:Object\.freeze\(\[([^\]]*)\]\)/gu)];
  return items.flatMap(entry=>[...entry[1].matchAll(/'([^']+)'/gu)].map(match=>match[1]));
}
test('M42: sidebar groups retain every authorized client, coach and admin route exactly once',()=>{
  for(const role of ['client','coach','admin']){
    const expected=navigationForRole(role);
    const all=[...expected.primary,...expected.context,...expected.tools].map(i=>i.key);
    const groupedKeys=grouped(role);
    const flattened=groupedKeys.filter(k=>all.includes(k));
    assert.equal(flattened.length,new Set(flattened).size,role+' duplicated a route');
    const missing=all.filter(k=>!groupedKeys.includes(k));
    assert.deepEqual(missing,[],role+' lost a feature in grouping');
  }
});
test('M42: Client mobile prioritizes plan, next workout and progress without losing Activity in More',()=>{
  assert.deepEqual(navigationForRole('client').mobile.map(x=>x.key),['hoy','planificacion','sesion','progreso']);
  assert.ok(navigationForRole('client').context.some(x=>x.key==='actividad'));
  assert.match(navSource,/mobile: \['hoy', 'planificacion', 'sesion', 'progreso'\]/u);
});
test('M42: new role group labels are localized in all installed interface languages',()=>{
  for(const key of ['nav.coach.training','nav.coach.followup','nav.admin.journey','nav.client.contact'])
    assert.equal((i18n.match(new RegExp("'"+key+"'","gu"))||[]).length,4,key);
  assert.equal(typeof getIberfitLanguage(),'string');
});
