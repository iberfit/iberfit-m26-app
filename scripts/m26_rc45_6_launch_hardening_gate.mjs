import fs from 'node:fs';
import process from 'node:process';

const read=(path)=>fs.readFileSync(path,'utf8');
const checks=[];
const check=(name,ok)=>checks.push({name,ok:Boolean(ok)});

const report=read('src/m26/workflows/iri-report-document.js');
const css=read('public/m26/iri-report.css');
const external=read('src/m26/workflows/iri-external-report-controller.js');
const ignore=read('.gitignore');
const pkg=JSON.parse(read('package.json'));

check('PDF plan-band sin truncamiento silencioso',!/\.plan-band p\{[^}]*max-height:[^}]*overflow:hidden/u.test(report)&&!/\.plan-band p\{[^}]*max-height:[^}]*overflow:hidden/u.test(css));
check('PDF deduplica disponibilidad',report.includes('distinctText(i.availability,p.preferredSchedule)'));
check('PDF usa cache key RC45.6',report.includes('m26-rc45-6-launch-hardening-v1'));
check('Bioimpedancia permite app producción',external.includes("['https://app.iberfit.cl', 'https://app.iberfit.cl']"));
check('Bioimpedancia mapea coach a app cliente',external.includes("['https://coach.iberfit.cl', 'https://app.iberfit.cl']"));
check('Origen externo sigue fail-closed',external.includes('M26_IRI_EXTERNAL_REPORT_APP_ORIGIN_INVALID'));
check('Wrangler local ignorado',/^\.wrangler\/$/mu.test(ignore));
check('Supabase temp ignorado',/^supabase\/\.temp\/$/mu.test(ignore));
check('Generación visual local ignorada',/^recovery\/rc45-visual\/generated\/$/mu.test(ignore));
check('Test RC45.6 registrado',pkg.scripts?.['test:m26:rc456']==='node --test tests/m26_rc45_6_launch_hardening.test.mjs');
check('Validación RC45.6 registrada',pkg.scripts?.['validate:rc456:local']==='npm run validate:rc455:local && npm run test:m26:rc456');

const failed=checks.filter((item)=>!item.ok);
console.log(JSON.stringify({
  release:'RC45.6',
  gate:'launch-hardening',
  ok:failed.length===0,
  checks,
  deferred:[
    'Unificar la arquitectura histórica de build RC40-RC45 después del lanzamiento web.',
    'Normalizar versionado global de package/runtime en una entrega separada para no ampliar riesgo ahora.',
    'Completar biblioteca visual mediante pipeline por lotes tras cerrar el gate web.'
  ]
},null,2));

if(failed.length){
  console.error(`RC45.6_GATE_FAILED:${failed.map((item)=>item.name).join('|')}`);
  process.exit(1);
}
