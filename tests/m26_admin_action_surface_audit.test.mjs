import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);

const REQUIRED_FORM_KINDS=[
  'user-status','role-change','assignment-create','assignment-end',
  'lead-create','lead-update','client-lifecycle','client-delete',
  'task-create','task-resolve','template-save','automation-save','settings-save',
];

const ACTIONABLE_AREAS=[
  'admin-inicio','admin-usuarios','admin-equipo','admin-clientes',
  'admin-operaciones','admin-comunicacion','admin-automatizaciones','admin-configuracion',
];

test('Admin audit exercises operational routes and real management actions',async()=>{
  const out=await mkdtemp(path.join(tmpdir(),'iberfit-admin-action-audit-'));
  try{
    const {stdout,stderr}=await execFileAsync(
      process.execPath,
      ['scripts/audit/admin_action_surface_audit.mjs'],
      {
        cwd:process.cwd(),
        env:{...process.env,M26_ADMIN_AUDIT_OUT_DIR:out},
        timeout:30_000,
        maxBuffer:2_000_000,
      },
    );
    assert.match(stdout,/IBERFIT_ADMIN_ACTION_AUDIT=PASS/u,stderr);

    const report=JSON.parse(await readFile(path.join(out,'admin-actions-latest.json'),'utf8'));
    assert.equal(report.ok,true);
    assert.equal(report.coverage.audited,report.coverage.allowed);
    assert.equal(report.coverage.allowed,11);
    assert.equal(report.coverage.actionableAudited,ACTIONABLE_AREAS.length);
    assert.ok(report.coverage.interactiveButtons>0);
    assert.deepEqual(report.coverage.missingFormKinds,[]);
    for(const kind of REQUIRED_FORM_KINDS)assert.ok(report.coverage.formKinds.includes(kind),`missing ${kind}`);
    for(const area of ACTIONABLE_AREAS){
      const route=report.routes.find((item)=>item.area===area);
      assert.ok(route,`missing route ${area}`);
      assert.ok(route.buttons>0,`no buttons audited for ${area}`);
      assert.notEqual(route.kind,'admin-unavailable');
      assert.notEqual(route.kind,'admin-forbidden');
    }
  }finally{
    await rm(out,{recursive:true,force:true});
  }
});
