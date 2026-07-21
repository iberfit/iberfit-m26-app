import fs from 'node:fs';import path from 'node:path';
const root=process.cwd();const j=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));const t=(p)=>fs.readFileSync(path.join(root,p),'utf8');const report=j('recovery/RC14_INTEGRATED_QA_REPORT.json');const checks=[
 ['coach-client-pass',report.total===2&&report.passed===2&&report.results.every(x=>x.ok)],
 ['all-routes-pass',report.results.every(x=>x.routes.every(r=>r.ok&&!r.metrics.overflow&&!r.metrics.small&&!r.metrics.unlabeled&&!r.metrics.unnamed&&!r.metrics.broken&&!r.metrics.placeholders))],
 ['all-actions-pass',report.results.every(x=>x.actions.every(a=>a.ok))],
 ['commands-executed',report.results.find(x=>x.role==='coach')?.command_count>=4&&report.results.find(x=>x.role==='client')?.command_count>=2],
 ['no-runtime-errors',report.results.every(x=>!x.console_errors.length&&!x.page_errors.length)],
 ['mobile-full-navigation',/m26-mobile-more/.test(t('src/m26/shell/shell-render.js'))&&/position:\s*fixed/.test(t('src/m26/shell/shell.css'))],
 ['session-route-guard',/guardSessionNavigation/.test(t('src/m26/app/application.js'))&&/exitSessionWorkspace/.test(t('src/m26/app/application.js'))],
 ['library-full-search',/catalog\?\.list\?\.\(\)/.test(t('src/m26/app/workflow-controller.js'))],
 ['public-import-absolute',/from '\/src\/m26\/app\/application\.js'/.test(t('public/m26/app.js'))],
];let fail=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)fail++;}console.log(`\n${checks.length-fail}/${checks.length} PASS`);if(fail)process.exit(1);
