import { spawnSync } from 'node:child_process';import fs from 'node:fs';import path from 'node:path';
// The full RC29 test suite can emit over Node's spawnSync default 1 MiB
// stdout cap. This is a CLI validation task; keep a bounded but realistic
// capture limit and surface the exit mechanism, never private child output.
const MAX_RC29_OUTPUT_BYTES=64*1024*1024;
const root=process.cwd();
const steps=[];
function run(name,command,args){
 const result=spawnSync(command,args,{
  cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],
  maxBuffer:MAX_RC29_OUTPUT_BYTES
 });
 const ok=result.status===0&&!result.error;
 steps.push({name,command:[command,...args].join(' '),status:result.status,ok});
 process.stdout.write(result.stdout||'');
 process.stderr.write(result.stderr||'');
 if(!ok){
  const cause=result.error?.code||
   (result.signal?'SIGNAL_'+result.signal:
    Number.isInteger(result.status)?'EXIT_'+result.status:'UNKNOWN');
  // A legacy build can exit 1 after a long buffered test output, causing
  // its diagnostics to be lost when the parent process exits. Surface only
  // bounded, non-sensitive numerical budget evidence or safe error codes;
  // never emit arbitrary stderr, environment or credentials in this reason.
  let detail='';
  if(name==='build'){
    try{
      const meta=JSON.parse((result.stdout||'').trim());
      const budget=meta?.budgets||{};
      if(meta?.budgetOk===false){
        detail=':BUDGET_'+[
          'javascriptBytes','javascriptLimit','cssBytes','cssLimit',
          'coreBytes','coreTotalLimit','mediaBytes','mediaTotalLimit'
        ].map((key)=>key+'='+String(Number(budget[key]??0))).join(',');
      }
    }catch{
      const safeCode=(result.stderr||'').match(
        /(?:RC29_BUILD_SOURCE_MISSING|ENOENT|ENOSPC|ENOMEM|EMFILE|EACCES)/u
      )?.[0];
      if(safeCode)detail=':'+safeCode;
    }
  }
  throw new Error('RC29_VALIDATION_FAILED:'+name+':'+cause+detail);
 }
 return result.stdout;
}
run('repository-hygiene','node',['scripts/remote-gates/check_repository_hygiene.mjs']);
const testFiles=fs.readdirSync(path.join(root,'tests')).filter((name)=>name.endsWith('.test.mjs')).sort().map((name)=>`tests/${name}`);
const testOutput=run('tests','node',['--test',...testFiles]);
run('build','node',['scripts/build_rc29_prepublication_candidate.mjs']);
run('module-graph','node',['scripts/verify_rc29_module_graph.mjs']);
run('ui-provenance','node',['scripts/verify_rc29_ui_provenance.mjs']);
run('prepublication-gate','node',['scripts/m26_rc29_prepublication_gate.mjs']);
const testMatch=testOutput.match(/# tests (\d+)/),passMatch=testOutput.match(/# pass (\d+)/),failMatch=testOutput.match(/# fail (\d+)/);const tests={total:Number(testMatch?.[1]||0),passed:Number(passMatch?.[1]||0),failed:Number(failMatch?.[1]||0)};
const inherited={functionalBaseline:'RC28',visibleUiCodeChanged:false,visualQa:JSON.parse(fs.readFileSync(path.join(root,'recovery','RC28_VISUAL_QA_REPORT.json'),'utf8')),integratedQa:JSON.parse(fs.readFileSync(path.join(root,'recovery','RC28_INTEGRATED_QA_REPORT.json'),'utf8')),castellanoQa:JSON.parse(fs.readFileSync(path.join(root,'recovery','RC28_CASTELLANO_GATE_REPORT.json'),'utf8'))};
const provenance=JSON.parse(fs.readFileSync(path.join(root,'recovery','RC29_UI_SOURCE_PROVENANCE.json'),'utf8'));
const gate=JSON.parse(fs.readFileSync(path.join(root,'recovery','RC29_PREPUBLICATION_GATE_REPORT.json'),'utf8'));const graph=JSON.parse(fs.readFileSync(path.join(root,'recovery','RC29_MODULE_GRAPH_REPORT.json'),'utf8'));
const report={release:'IBERFIT_M26_PREPUBLICACION_INFRA_RC29',version:'26.0.0-prepublicacion-infraestructura.29',generatedAt:new Date().toISOString(),ok:steps.every((x)=>x.ok)&&tests.failed===0&&gate.ok&&graph.ok&&provenance.ok,tests,prepublicationGate:{passed:gate.passed,total:gate.total,failed:gate.failed},moduleGraph:{modules:graph.modules,missing:graph.missing.length},inheritedEvidence:{functionalBaseline:'RC28',visibleUiCodeChanged:provenance.visibleUiCodeChanged,uiFilesCompared:provenance.compared,visual:{passed:inherited.visualQa.passed,total:inherited.visualQa.case_count,failed:inherited.visualQa.failed},integrated:{passed:inherited.integratedQa.passed,total:inherited.integratedQa.total},castellano:{passed:inherited.castellanoQa.passed,total:inherited.castellanoQa.total}},productionModified:false,productionDeployed:false,deployable:false,pendingExternalGates:['Repositorio privado de aplicación','Acceso Supabase disponible','Comparación autenticada exacta de 52 comandos','Cuentas QA Coach y dos Clientes','RLS y payloads por identidad','Canario Cloudflare','Dispositivos físicos','Rollback real'],steps:steps.map((x)=>({name:x.name,ok:x.ok,status:x.status}))};fs.writeFileSync(path.join(root,'recovery','RC29_LOCAL_VALIDATION.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(!report.ok)process.exit(1);
