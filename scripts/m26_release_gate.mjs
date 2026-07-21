import fs from 'node:fs';
import path from 'node:path';
const required=[
  'src/m26/command-catalog.js','src/m26/workflows/session-controller.js','src/m26/ui/action-state.js',
  'src/m26/ui/interactive-audit.js','src/m26/platform/pwa.js','public/m26/sw.js',
  'public/m26/manifest.webmanifest','public/m26/offline.html','public/m26/icons/icon-192.png','public/m26/icons/icon-512.png','public/m26/icons/icon-maskable-192.png','public/m26/icons/icon-maskable-512.png','tests/m26_rc8_release_readiness.test.mjs','docs/COMMAND_CONTRACT_RC8.md','docs/PRODUCT_COVERAGE_MATRIX_RC8.md'
];
const checks=[];
for(const file of required)checks.push([`exists:${file}`,fs.existsSync(file)]);
const source=[...required.filter((f)=>(f.startsWith('src/')||f.startsWith('public/'))&&(f.endsWith('.js')||f.endsWith('.mjs'))), 'src/m26/workflows/iri-workflow.js','src/m26/workflows/planning-workflow.js','src/m26/workflows/agenda-workflow.js','src/m26/workflows/session-execution.js'].filter(fs.existsSync).map((f)=>fs.readFileSync(f,'utf8')).join('\n');
checks.push(['exact-44-command-registry',(source.match(/\['[A-Z_ÁÉÍÓÚÑ]+','[a-z_]+','[A-Z_ÁÉÍÓÚÑ]+'/g)||[]).length===44]);
checks.push(['no-obsolete-command-types',!/(IRI_GUARDAR|INFORME_IRI_GENERAR|CITA_ACTUALIZAR|CICLO_CREAR|CICLO_ACTUALIZAR|PLAN_CREAR|PLAN_ACTUALIZAR|SESION_EJECUCION_REGISTRAR)/.test(source)]);
checks.push(['no-inline-handlers',!/onclick\s*=/.test(source+fs.readFileSync('public/m26/offline.html','utf8'))]);
checks.push(['no-blocking-dialogs',!/\b(prompt|alert|confirm)\s*\(/.test(source)]);
checks.push(['command-bus-contract',fs.readFileSync('src/m26/command-bus.js','utf8').includes('validateCommandAgainstRegistry')]);
checks.push(['backend-payload-plan',fs.readFileSync('src/m26/workflows/planning-workflow.js','utf8').includes('payload:{draft:')]);
checks.push(['backend-payload-appointment',fs.readFileSync('src/m26/workflows/agenda-workflow.js','utf8').includes('payload:{appointment:')]);
checks.push(['backend-payload-progress',fs.readFileSync('src/m26/workflows/session-execution.js','utf8').includes('progressSnapshot')]);
checks.push(['pwa-no-post-cache',fs.readFileSync('public/m26/sw.js','utf8').includes("request.method!=='GET'")]);
checks.push(['touch-target-44',fs.readFileSync('src/m26/shell/shell.css','utf8').includes('min-height:44px')]);
checks.push(['protected-m25-present',fs.existsSync('legacy/m25_official')]);
checks.push(['protected-m25-2-present',fs.existsSync('baseline_m25_2')]);
const failed=checks.filter(([,ok])=>!ok);console.log(checks.map(([name,ok])=>`${ok?'PASS':'FAIL'} ${name}`).join('\n'));
fs.mkdirSync('recovery',{recursive:true});fs.writeFileSync('recovery/m26-release-gate-results.json',JSON.stringify({gate:'M26_RC8_RELEASE',ok:failed.length===0,passed:checks.length-failed.length,failed:failed.length,checks:checks.map(([name,ok])=>({name,ok}))},null,2));
if(failed.length)process.exit(1);
