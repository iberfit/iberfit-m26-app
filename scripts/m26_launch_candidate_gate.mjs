import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),dist=path.join(root,'dist','m26-launch-candidate');const j=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));const t=(p)=>fs.readFileSync(path.join(root,p),'utf8');const e=(p)=>fs.existsSync(path.join(root,p));const version=j('dist/m26-launch-candidate/version.json'),graph=j('recovery/RC15_MODULE_GRAPH_REPORT.json'),remote=j('recovery/RC15_REMOTE_VALIDATION_STATUS.json'),headers=t('dist/m26-launch-candidate/_headers'),sw=t('dist/m26-launch-candidate/m26/sw.js');const checks=[
 ['dist-present',e('dist/m26-launch-candidate/index.html')&&e('dist/m26-launch-candidate/m26/app.js')],
 ['version-launch-candidate',version.version==='26.0.0-launch-candidate.15'&&version.status==='not_deployed'],
 ['performance-budget',version.budgetOk&&version.budgets.javascriptBytes<=version.budgets.javascriptLimit&&version.budgets.cssBytes<=version.budgets.cssLimit],
 ['module-graph',graph.ok&&graph.missing.length===0&&graph.modules>=45],
 ['security-headers',['Content-Security-Policy','Strict-Transport-Security','Permissions-Policy','Service-Worker-Allowed'].every(x=>headers.includes(x))],
 ['pwa-rc15',/m26-rc15/.test(sw)&&/request\.method!==\'GET\'/.test(sw)&&/request\.mode===\'navigate\'/.test(sw)],
 ['no-api-cache',/\/auth\/v1\//.test(sw)&&/\/rest\/v1\//.test(sw)&&/\/rpc\//.test(sw)],
 ['runtime-fail-closed',/enabled:\s*false/.test(t('dist/m26-launch-candidate/m26/runtime-config.js'))],
 ['no-real-key-in-template',/REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY/.test(t('dist/m26-launch-candidate/m26/runtime-config.example.js'))&&!/eyJ[A-Za-z0-9_-]{20,}/.test(t('dist/m26-launch-candidate/m26/runtime-config.example.js'))],
 ['remote-honesty',remote.connector_available===false&&remote.catalog_remote_validated===false&&remote.production_modified===false&&remote.production_deployed===false],
 ['runbooks',e('docs/LAUNCH_CANDIDATE_RC15.md')&&e('docs/RC15_CANARY_AND_ROLLBACK_RUNBOOK.md')&&e('README_RC15.md')],
];let fail=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++;}console.log(`\n${checks.length-fail}/${checks.length} PASS`);if(fail)process.exit(1);
