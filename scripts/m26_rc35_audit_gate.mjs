import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const checks=[];
function read(relative){return fs.readFileSync(path.join(root,relative),'utf8');}
function check(name,ok,detail=''){checks.push({name,ok:Boolean(ok),detail:String(detail||'')});}

const renderer=read('src/m26/modules/route-render.js');
const workflow=read('src/m26/app/workflow-controller.js');
const progress=read('src/m26/engagement/progress-engine.js');
const session=read('src/m26/workflows/session-controller.js');
const engagement=read('src/m26/engagement/engagement-controller.js');
const reports=read('src/m26/workflows/iri-report-document.js');
const reportPage=read('src/m26/workflows/iri-report-page.js');
const exerciseSearch=read('src/m26/exercises/search.js');
const exerciseUi=read('src/m26/library/exercise-media-ui.js');
const css=read('src/m26/shell/shell.css');
const projection=read('src/m26/security/role-projection.js');
const map=JSON.parse(read('public/vendor/repdb/iberfit-canonical-media-map-v1.json'));

check('IRI confirma solo tras rehidratación verificable',/M26_IRI_CONFIRM_NOT_PERSISTED/.test(workflow)&&/refreshAndFind\('iriAssessments'/.test(workflow));
check('Plan confirma solo tras rehidratación verificable',/M26_PLAN_CONFIRM_NOT_PERSISTED/.test(workflow)&&/refreshAndFind\('trainingCycles'/.test(workflow));
check('Sesión guarda antes de salir',/action==='exit-session'[\s\S]*persistContext\(context\)/.test(session)&&/flushAutosave\(context,\{force:true\}\)/.test(session)&&/case 'save-draft'/.test(session));
check('Nota privada verifica persistencia',/M26_PRIVATE_NOTE_NOT_PERSISTED/.test(engagement)&&/private-note-created/.test(engagement));
check('Informe autocontenido',/<style>\$\{REPORT_CSS\}<\/style>/.test(reports)&&!/<link rel="stylesheet"[^>]*iri-report\.css/.test(reports));
check('Sin puntuación global en Progreso',!/function iriScore/.test(progress)&&!/Puntuación \$\{/.test(progress)&&/de 3 dominios registrados/.test(progress));
check('Cliente no recibe score global',!/\['score',\['score','puntuacion'/.test(projection));
check('Temporizador audible y recuperable',/AudioContext/.test(workflow)&&/audio\.resume/.test(workflow)&&/avisos a 3, 2, 1 y final/.test(workflow));
check('No realizada desactiva grupos',/syncIriSkippedGroup/.test(workflow)&&/field\.disabled=skipped/.test(workflow)&&/reason\.required=skipped/.test(workflow));
check('Informes bloqueados antes de confirmar',/generate-client-iri-report"\$\{iriConfirmed\?'':' disabled/.test(renderer));
check('Protocolos de movilidad y fuerza presentes',/Rodilla a pared/.test(renderer)&&/Silla 30 segundos/.test(renderer)&&/Remo TRX y core/.test(renderer));
check('Un único scroll documental',/height: auto;/.test(css)&&/\.m26-main \{ min-height: 0; overflow: visible;/.test(css)&&!/\.m26-main \{ min-height: 0; overflow-y: auto;/.test(css));
check('Biblioteca canónica completa',map.items?.length===367&&new Set(map.items.map((item)=>item.iberfit_id)).size===367,map.summary?.withoutCoachMedia);
check('Filtros de biblioteca presentes',/data-library-filter="equipment"/.test(renderer)&&/data-library-filter="pattern"/.test(renderer)&&/data-library-filter="visual"/.test(renderer));
check('Inteligencia acepta criterio Coach',/coachQuestion/.test(workflow)&&/Pregunta o criterio del entrenador/.test(renderer));
check('Sin score visible histórico en rutas',!/Performance|80\/100|Puntuación 80/.test(renderer));
check('Informe conserva estilos y alternativa sin popup',/mode:'same-tab'/.test(reports)&&/querySelectorAll\('style'\)/.test(reportPage)&&/document\.head\.append/.test(reportPage));
check('Validación IRI enfoca el primer error',/focusIriValidationError/.test(workflow)&&/scrollIntoView/.test(workflow)&&/aria-invalid/.test(workflow));
check('Hoy y Clientes muestran prioridad y filtros',/Siguiente acción/.test(renderer)&&/data-client-filter="iri"/.test(renderer)&&/data-client-sort/.test(renderer)&&/Abrir expediente/.test(renderer));
check('Expediente enumera datos pendientes',/Completa el perfil esencial/.test(renderer)&&/Completar en Diagnóstico IRI/.test(renderer));
check('Biblioteca explica ausencia visual y prioriza búsqueda',/Sin referencia visual/.test(exerciseUi)&&/Protocolo y detalles/.test(exerciseUi)&&/const direct=ranked\.filter/.test(exerciseSearch));
check('Actividad compacta integraciones y explica escalas',/Dispositivos e integraciones opcionales/.test(renderer)&&/0 muy baja · 10 muy alta/.test(renderer)&&!/OAuth preparado|canje de tokens en backend|Arquitectura preparada/.test(renderer));
check('Progreso incorpora lectura visual sin inventar tendencias',/Resumen visual de adherencia/.test(renderer)&&/m26-wellbeing-meter/.test(renderer)&&/Actividad de dispositivo · sin datos confirmados/.test(renderer));

const report={release:'IBERFIT_M26_CANARY_RC35_AUDIT_CLOSURE',generatedAt:new Date().toISOString(),checks,total:checks.length,passed:checks.filter((item)=>item.ok).length,failed:checks.filter((item)=>!item.ok).length};
const serialized=JSON.stringify(report,null,2)+'\n';
fs.mkdirSync(path.join(root,'recovery'),{recursive:true});
fs.writeFileSync(path.join(root,'recovery','RC35_AUDIT_GATE.json'),serialized);
report.sha256=crypto.createHash('sha256').update(serialized).digest('hex');
console.log(JSON.stringify(report,null,2));
if(report.failed)process.exit(1);
