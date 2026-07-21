import fs from 'node:fs';
import {loadExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {EXERCISE_VISIBLE_FORBIDDEN_TERMS} from '../src/m26/exercises/castellano.js';
const read=(p)=>fs.readFileSync(p,'utf8');
const json=(p)=>JSON.parse(read(p));
const VERSION='26.0.0-cierre-local-maximo.28';
const exerciseCatalog=await loadExerciseCatalog('baseline_m25_2/exercise-catalog-m25.json');
const exerciseForbidden=new RegExp(`\\b(?:${EXERCISE_VISIBLE_FORBIDDEN_TERMS.map((term)=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\\\$&')).join('|')})\\b`,'i');
const exerciseVisibleInvalid=exerciseCatalog.list().filter((item)=>exerciseForbidden.test(`${item.name_es} ${item.equipment}`));
const visual=json('recovery/RC28_VISUAL_QA_REPORT.json');
const integrated=json('recovery/RC28_INTEGRATED_QA_REPORT.json');
const index=read('public/m26/index.html'),offline=read('public/m26/offline.html'),manifest=json('public/m26/manifest.webmanifest');
const route=read('src/m26/modules/route-render.js'),shell=read('src/m26/shell/shell-render.js'),wearable=read('src/m26/wearables/controller.js'),locale=read('src/m26/ui/castellano.js');
const legacyVisible=['Enviar check-in','Añadir resumen al check-in','Contexto wearable','Coach recibe','Guiada en app','Sesión online','HRV media','Chair stand','step test','OAuth está'];
const visualText=visual.results.map((item)=>item.metrics?.visibleLanguage||'').join('\n');
const visualNoHits=visual.results.every((item)=>item.ok&&item.metrics?.documentLanguage==='es-ES'&&Array.isArray(item.metrics?.forbiddenLanguageHits)&&item.metrics.forbiddenLanguageHits.length===0);
const integratedNoHits=integrated.results.every((item)=>item.ok&&item.routes.every((route)=>route.metrics?.documentLanguage==='es-ES'&&Array.isArray(route.metrics?.forbiddenLanguageHits)&&route.metrics.forbiddenLanguageHits.length===0)&&item.finalMetrics?.documentLanguage==='es-ES'&&item.finalMetrics?.forbiddenLanguageHits?.length===0);
const checks=[
 ['version',visual.version===VERSION&&integrated.version===VERSION],
 ['document-language',/<html lang="es-ES">/.test(index)&&/<html lang="es-ES">/.test(offline)&&manifest.lang==='es-ES'],
 ['locale-module',/IBERFIT_UI_LOCALE\s*=\s*'es-ES'/.test(locale)],
 ['visible-status-map',/ready:\s*'Preparado'/.test(locale)&&/pending:\s*'Pendiente'/.test(locale)&&/rejected:\s*'Rechazada'/.test(locale)],
 ['visible-source-map',/checkin:\s*'Registro de bienestar'/.test(locale)&&/wearable:\s*'Datos de dispositivos'/.test(locale)],
 ['visible-platform-map',/cloud:\s*'Servicio en línea'/.test(locale)],
 ['visible-operation-map',/castilianOperationTitle/.test(locale)&&/castilianOperationDetail/.test(locale)],
 ['no-legacy-visible-copy',legacyVisible.every((term)=>!route.includes(term)&&!shell.includes(term)&&!wearable.includes(term))],
 ['required-human-copy',/Enviar registro de bienestar/.test(route)&&/El entrenador recibe únicamente resúmenes confirmados/.test(route)&&/VFC media/.test(route)],
 ['exercise-catalog-castilian',exerciseCatalog.count===367&&exerciseVisibleInvalid.length===0&&exerciseCatalog.get('IBF-CLAMSHELL')?.name_es==='Apertura de cadera en decúbito lateral'],
 ['spanish-download-names',/iberfit-plantilla-dispositivos\.json/.test(wearable)&&/iberfit-resumen-dispositivos-/.test(wearable)],
 ['visual-castilian',visual.case_count===40&&visual.passed===40&&visual.failed===0&&visualNoHits],
 ['access-states-covered',visual.results.some((x)=>x.case?.name==='acceso_confirmando_mobile')&&visual.results.some((x)=>x.case?.name==='acceso_error_desktop')],
 ['integrated-castilian',integrated.passed===2&&integrated.total===2&&integratedNoHits],
 ['proper-names-preserved',/Apple Health/.test(visualText)&&/Health Connect/.test(visualText)&&/Google Health API/.test(visualText)&&/Garmin Connect/.test(visualText)&&/Oura/.test(visualText)],
 ['service-worker-cache-bumped',/m26-rc28/.test(read('public/m26/sw.js'))&&/m26-rc23/.test(read('public/m26/sw.js'))],
];
const results=checks.map(([name,value])=>({name,ok:Boolean(value)}));const failed=results.filter((x)=>!x.ok);const report={release:'IBERFIT_M26_CIERRE_LOCAL_MAXIMO_RC28',version:VERSION,generatedAt:new Date().toISOString(),passed:results.length-failed.length,total:results.length,failed:failed.length,checks:results,ok:failed.length===0,note:'Audita únicamente texto visible y atributos accesibles; los identificadores internos y nombres propios de proveedores se conservan.'};
fs.writeFileSync('recovery/RC28_CASTELLANO_GATE_REPORT.json',JSON.stringify(report,null,2)+'\n');for(const item of results)console.log(`${item.ok?'PASS':'FAIL'} ${item.name}`);console.log(`\n${report.passed}/${report.total} PASS`);if(failed.length)process.exit(1);
