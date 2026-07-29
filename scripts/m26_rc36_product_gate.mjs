import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const report=read('src/m26/workflows/iri-report-document.js');
const routes=read('src/m26/modules/route-render.js');
const vm=read('src/m26/modules/route-view-model.js');
const ci=read('.github/workflows/ci.yml');
const checks=[
  ['Informe sin radar no normativo',!/function radarChart|function domainVisuals|class="radar"/.test(report)],
  ['Informe con evidencia por áreas',/domainEvidenceGrid/.test(report)&&/Sin puntuación global/.test(report)],
  ['PDF ultra premium IBERFIT activo',/PREMIUM_RC36_CSS/.test(report)&&/m26-premium-report-v2/.test(report)&&/cover-lockup/.test(report)],
  ['Isotipo y logotipo integrados sin contenedor circular',/cover-isotipo/.test(report)&&/Entrenamiento personal<br>con criterio/.test(report)&&!/class="cover-mark"/.test(report)],
  ['Pestañas y textos protegidos contra solapamiento',/section-tab/.test(report)&&/overflow-wrap:anywhere/.test(report)&&/word-break:normal/.test(report)],
  ['Fondo crema, verde y dorado de marca',/#f5eedc/.test(report)&&/#08251a/.test(report)&&/#c9a95c/.test(report)],
  ['Bioimpedancia orientada por método',/Bioimpedancia segmental/.test(routes)&&/Equipo y modelo/.test(routes)],
  ['Grasa corporal no contradice validación por dominio',!/name="bodyFatPercent" required/.test(routes)],
  ['IRI explica 7 etapas y 3 dominios',/Proceso guiado de 7 etapas/.test(routes)&&/3 dominios de resultado/.test(routes)],
  ['Modelo distingue proceso y cobertura',/processLabel/.test(vm)&&/7 de 7 etapas completadas/.test(vm)],
  ['Cliente no recibe instrucción de completar IRI',/Registrar cómo estás hoy/.test(routes)&&/Tu ruta IBERFIT/.test(routes)],
  ['Cliente conserva accesos funcionales',/Registrar bienestar/.test(routes)&&/Consultar informes/.test(routes)],
  ['CI reconoce RC36',/Validar RC36 canary/.test(ci)&&/rc36-evidencia-validacion/.test(ci)],
];
const output={release:'IBERFIT_M26_RC36_V2_IRI_CLIENT_PREMIUM_REPORT',generatedAt:new Date().toISOString(),checks:checks.map(([name,ok])=>({name,ok})),ok:checks.every(([,ok])=>ok),productionModified:false,productionDeployed:false,cloudflareModified:false};
fs.mkdirSync(path.join(root,'recovery'),{recursive:true});
fs.writeFileSync(path.join(root,'recovery','RC36_PRODUCT_GATE.json'),`${JSON.stringify(output,null,2)}\n`);
console.log(JSON.stringify(output,null,2));
if(!output.ok)process.exit(1);