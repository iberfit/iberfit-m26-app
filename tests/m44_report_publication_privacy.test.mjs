import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {clientContentView} from '../src/m26/publication/client-content.js';
const load=async(path)=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('M44 canonical reports remain private while the client receives an explicitly whitelisted publication',async()=>{
  const text=await load('supabase/migrations/20261015142000_m44_report_client_safe_publication_v1.sql');
  assert.match(text,/new\.body:=coalesce\(new\.body,'\{\}'::jsonb\)[\s\S]*?'visibleToClient',false/);
  assert.match(text,/as restrictive for select to authenticated/);
  assert.match(text,/coalesce\(public\.iberfit_current_role_v26\(\),''\) in \('coach','admin'\)/);
  assert.match(text,/audience=case when v_published then 'cliente' else 'coach' end/);
  const part=text.slice(text.indexOf('v_client_json:=jsonb_build_object'),text.indexOf('update public.reports r set'));
  for(const property of ['summary','conclusions','recommendations','periodStart','periodEnd','activitySeries'])
    assert.ok(part.includes("'"+property+"'"));
  for(const privateField of ['coachComment','createdBy','m44DraftFingerprint','sourceAssessmentRevision','evidenceSignature'])
    assert.ok(!part.includes("'"+privateField+"'"),'private field '+privateField+' leaked');
  assert.match(text,/revoke all on function/);
});

test('M44 client report renderer uses only whitelisted report-content fields',async()=>{
  const source=await load('src/m26/publication/client-content.js');
  assert.match(source,/const publicReportValue=/);
  assert.match(source,/publicReportValue\('conclusions'/);
  assert.match(source,/publicReportValue\('recommendations'/);
  assert.doesNotMatch(source,/publicReportValue\('coachComment'/);
});

test('M44 publication protections are installed atomically without DROP TRIGGER or DROP POLICY',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261015142000_m44_report_client_safe_publication_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/create or replace trigger trg_m44_report_private_body_guard/);
 assert.match(sql,/create or replace trigger trg_m44_report_client_safe_projection/);
 assert.match(sql,/m44_report_private_policy_precondition/);
 assert.doesNotMatch(sql,/drop trigger|drop policy/i);
});


test('client document refuses invalid canonical chart data without turning missing values into zero',()=>{
  const report={id:'r1',status:'publicado',audience:'cliente',reportType:'weekly',periodStart:'2026-09-07',periodEnd:'2026-09-13',summary:'Informe',conclusions:'Interpretación',recommendations:'Revisar',coachComment:'NOTA PRIVADA',evidence:[{label:'Sesiones',text:'3',source:'sessionExecutions'}],activitySeries:[{from:'2026-09-07',to:'2026-09-09',count:0},{from:'2026-09-10',to:'2026-09-13',count:3}]};
  const valid=clientContentView('report',report);
  assert.equal(valid.reportDocument.activitySeries[0].count,0);
  assert.doesNotMatch(JSON.stringify(valid),/NOTA PRIVADA/);
  for(const invalid of [null,'0',false,[],1.5,-1]){
    const projection=clientContentView('report',{...report,activitySeries:[{from:'2026-09-07',to:'2026-09-13',count:invalid}]});
    assert.equal(projection.reportDocument,null);
    assert.equal(projection.summary,'Informe');
  }
  assert.equal(clientContentView('report',{...report,audience:'coach'}).reportDocument,null);
  assert.equal(clientContentView('report',{...report,periodEnd:'2026-09-31'}).reportDocument,null);
  assert.equal(clientContentView('report',{...report,activitySeries:[{from:'2026-09-07',to:'2026-09-10',count:1},{from:'2026-09-10',to:'2026-09-13',count:2}]}).reportDocument,null);
});
