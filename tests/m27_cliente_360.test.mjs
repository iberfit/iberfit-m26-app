import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  areaDefinition,
  canonicalArea,
  navigationForRole,
} from '../src/m26/shell/navigation.js';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const routeRenderer=read('src/m26/modules/route-render.js');
const bottomNavCss=read('src/m26/ui/client-bottom-nav.css');

test('M27 presenta Cliente 360 sin cambiar la ruta técnica ni los permisos',()=>{
  const area=areaDefinition('progreso');
  assert.equal(area.key,'progreso');
  assert.equal(area.label,'Cliente 360');
  assert.equal(area.title,'Cliente 360 · Progreso y seguimiento');
  assert.deepEqual(area.roles,['coach','client']);
  assert.equal(canonicalArea('cliente360'),'progreso');
  assert.equal(canonicalArea('cliente-360'),'progreso');
  assert.equal(canonicalArea('cliente_360'),'progreso');

  const client=navigationForRole('client');
  assert.deepEqual(
    client.primary.map((item)=>item.key),
    ['hoy','planificacion','sesion','progreso'],
  );
  assert.equal(
    client.primary.find((item)=>item.key==='progreso')?.label,
    'Cliente 360',
  );
});

test('Cliente 360 eleva visualmente el progreso real sin duplicar datos ni motores',()=>{
  assert.match(bottomNavCss,/M27 · Cliente 360/u);
  assert.match(bottomNavCss,/\[data-client-bottom-nav-route="progreso"\]/u);
  assert.match(bottomNavCss,/content:\s*"CLIENTE 360"/u);
  assert.match(bottomNavCss,/content:\s*"Cliente 360"/u);
  assert.match(bottomNavCss,/font-variant-numeric:\s*tabular-nums/u);

  assert.match(routeRenderer,/Progreso y adherencia/u);
  assert.match(routeRenderer,/renderLongitudinalDataExperience/u);
  assert.match(routeRenderer,/renderExerciseProgressSection/u);
  assert.match(routeRenderer,/Actividad de dispositivo/u);
  assert.match(routeRenderer,/Promedio de bienestar/u);
  assert.doesNotMatch(bottomNavCss,/Athlete 360|Athlete Dashboard/u);
});

test('Cliente 360 conserva navegación y fuente de verdad existentes',()=>{
  assert.match(routeRenderer,/if \(vm\.kind === 'progreso'\) return renderProgressRoute\(vm\)/u);
  assert.doesNotMatch(bottomNavCss,/display:\s*none[^}]*m26-route/u);
  assert.doesNotMatch(bottomNavCss,/pointer-events:\s*none[^}]*m26-stat/u);
  assert.doesNotMatch(bottomNavCss,/supabase|service[_-]?role|rpc\(/iu);
});
