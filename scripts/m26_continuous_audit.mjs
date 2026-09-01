import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { M26_AREAS, areaAllowedForRole, navigationForRole } from '../src/m26/shell/navigation.js';
import { ADMIN_AREAS } from '../src/m26/admin/navigation.js';
import { ADMIN_ROUTE_CAPABILITIES } from '../src/m26/admin/permission-policy.js';

const root=process.cwd();
const checks=[];
const failures=[];

function check(name,condition,detail=''){
  const ok=Boolean(condition);
  const item={name,ok,detail:String(detail||'')};
  checks.push(item);
  if(!ok)failures.push(item);
}

async function source(relative){
  return readFile(path.join(root,relative),'utf8');
}

function navKeys(role){
  const nav=navigationForRole(role);
  return new Set([...nav.primary,...nav.context,...nav.tools,...nav.mobile].map((item)=>item.key));
}

function allowedKeys(role){
  return new Set(Object.values(M26_AREAS)
    .filter((definition)=>areaAllowedForRole(definition.key,role))
    .map((definition)=>definition.key));
}

const [routeVm,routeRender,routeGuard,liveGate,ci,prodFrontend,prodBundle,sessionVault,webauthn]=await Promise.all([
  source('src/m26/modules/route-view-model.js'),
  source('src/m26/modules/route-render.js'),
  source('src/m26/shell/route-guard.js'),
  source('scripts/release/check_live_production_gate.mjs'),
  source('.github/workflows/ci.yml'),
  source('.github/workflows/final-production-frontend.yml'),
  source('.github/workflows/final-production-bundle.yml'),
  source('src/m26/app/session-vault.js'),
  source('src/m26/app/webauthn.js'),
]);

for(const role of ['admin','coach','client']){
  const navigation=navKeys(role);
  for(const area of navigation){
    check(`navigation:${role}:${area}`,areaAllowedForRole(area,role),`Destino visible prohibido para ${role}`);
  }
}

const intentionalClientSpecial=new Set(['retos','ajustes']);
for(const role of ['admin','coach','client']){
  const allowed=allowedKeys(role);
  const visible=navKeys(role);
  const hidden=[...allowed].filter((area)=>!visible.has(area));
  const expected=role==='client'?[...intentionalClientSpecial]:[];
  check(`discoverability:${role}`,
    hidden.length===expected.length&&expected.every((area)=>hidden.includes(area)),
    `permitidas no visibles=${hidden.join(',')||'ninguna'}`
  );
}

for(const area of ['retos','ajustes']){
  const definition=M26_AREAS[area];
  check(`client-only:${area}`,
    definition.roles.length===1&&definition.roles[0]==='client',
    `roles=${definition.roles.join(',')}`
  );
  check(`coach-denied:${area}`,!areaAllowedForRole(area,'coach'));
  check(`admin-denied:${area}`,!areaAllowedForRole(area,'admin'));
}

for(const definition of Object.values(M26_AREAS)){
  if(definition.roles.includes('admin')){
    check(`admin-metadata:${definition.key}`,definition.key.startsWith('admin-'),'Metadata admin fuera de admin-*');
  }
}

const adminAreaKeys=Object.keys(ADMIN_AREAS).sort();
const adminCapabilityKeys=Object.keys(ADMIN_ROUTE_CAPABILITIES).sort();
check('admin-area-capability-bijection',
  JSON.stringify(adminAreaKeys)===JSON.stringify(adminCapabilityKeys),
  `areas=${adminAreaKeys.length}; capabilities=${adminCapabilityKeys.length}`
);
check('admin-area-count',adminAreaKeys.length===11,`count=${adminAreaKeys.length}`);

check('retos-view-model',/if\(area==='retos'\)/u.test(routeVm));
check('ajustes-view-model',/if\(area==='ajustes'\)/u.test(routeVm));
check('retos-renderer',/vm\.kind === 'retos'[\s\S]{0,100}renderChallengesRoute\(vm\)/u.test(routeRender));
check('ajustes-renderer',/vm\.kind === 'ajustes'[\s\S]{0,100}renderSettingsRoute\(vm\)/u.test(routeRender));
check('route-guard-fail-closed',/M26_ROUTE_FORBIDDEN/u.test(routeGuard)&&/!areaAllowedForRole\(requested, role\)/u.test(routeGuard));

check('session-vault-session-storage',/globalThis\.sessionStorage/u.test(sessionVault)&&!/localStorage/u.test(sessionVault));
check('webauthn-fail-closed',/M26_WEBAUTHN_UNSUPPORTED/u.test(webauthn)&&/M26_WEBAUTHN_CEREMONY_FAILED/u.test(webauthn));
check('webauthn-credential-size-bound',/MAX_WEBAUTHN_JSON_BYTES/u.test(webauthn)&&/MAX_TOKEN_CHARS/u.test(sessionVault));

check('live-gate-production-origin',/PROD_ORIGIN='https:\/\/app\.iberfit\.cl'/u.test(liveGate));
check('live-gate-production-project',/PROD_REF='pjhmrhejsoofmouedavw'/u.test(liveGate));
check('live-gate-source-branch',/SOURCE_BRANCH='prep\/final-production-rc74-4'/u.test(liveGate));
check('live-gate-blocks-mutations',/!\['GET','HEAD','OPTIONS'\]\.includes\(method\)/u.test(liveGate)&&/route\.abort\(\)/u.test(liveGate));
check('live-gate-desktop-mobile',/name:'desktop'/u.test(liveGate)&&/name:'mobile'/u.test(liveGate));

check('ci-read-only-permissions',/permissions:\s*\n\s*contents:\s*read/u.test(ci));
check('production-frontend-read-only-permissions',/permissions:\s*\n\s*contents:\s*read/u.test(prodFrontend));
check('production-frontend-job',/validate-production-frontend:/u.test(prodFrontend));
check('production-frontend-exact-branch',/prep\/final-production-rc74-4/u.test(prodFrontend));
check('production-frontend-prod-ref',/pjhmrhejsoofmouedavw/u.test(prodFrontend));
check('production-frontend-rejects-qa',/! grep -q 'gjztkdwfmunnzhtvxrsu'/u.test(prodFrontend));
check('production-frontend-rejects-service-role',/! grep -qi 'service\[_-\]\*role'/u.test(prodFrontend));
check('production-bundle-read-only-permissions',/permissions:\s*\n\s*contents:\s*read/u.test(prodBundle));
check('production-bundle-exact-branch',/prep\/final-production-rc74-4/u.test(prodBundle));

const report={
  schema:'iberfit.m26.continuous-audit.v1',
  generatedAt:new Date().toISOString(),
  releaseBase:'74131c2f9646c41373a7a6425a921a6be633b621',
  productionOrigin:'https://app.iberfit.cl',
  checks,
  summary:{total:checks.length,passed:checks.length-failures.length,failed:failures.length},
  failures,
  mutationsPerformed:false,
};

const outDir=path.join(root,'recovery','continuous-audit');
await mkdir(outDir,{recursive:true});
const outPath=path.join(outDir,'M26_CONTINUOUS_AUDIT.json');
await writeFile(outPath,`${JSON.stringify(report,null,2)}\n`,'utf8');
console.log(JSON.stringify({ok:failures.length===0,...report.summary,evidence:path.relative(root,outPath).replaceAll(path.sep,'/'),mutationsPerformed:false},null,2));
if(failures.length)process.exit(1);
