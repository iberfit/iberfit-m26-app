import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');

test('M44 Coach issue control appears only for a published canonical report',async()=>{
 const s=await read('src/m26/modules/route-render.js');
 assert.match(s,/entity==='report'&&String\(item\.statusRaw\|\|''\)\.toLowerCase\(\)==='publicado'/);
 assert.match(s,/data-workflow-action="issue-evolution-pdf"/);
 assert.match(s,/data-workflow-action="open-issued-evolution-pdf"/);
});
test('M44 Client reads last issued PDF; Coach and Admin issue with active client scope',async()=>{
 const s=await read('src/m26/app/workflow-controller.js');
 const from=s.indexOf('async function handleIssuedEvolutionPdf('),to=s.indexOf('function openPublishedEvolutionReport(',from);
 assert.ok(from>0&&to>from);
 const h=s.slice(from,to);
 for(const expected of ['M44_PDF_OFFLINE_UNAVAILABLE','requireCoach()','requireVisibleClient(clientId)',
 'getLatestEvolutionPdf(id)','issueEvolutionReport(id)','popup.location.replace(result.signedUrl)',
 'popup.close','M44_PDF_PUBLISHED_REPORT_REQUIRED'])
  assert.ok(h.includes(expected),expected);
 assert.match(s,/action==='issue-evolution-pdf'/);
 assert.match(s,/action==='open-issued-evolution-pdf'/);
});
test('M44 app constructs isolated verified governance with refresh token on every request',async()=>{
 const s=await read('src/m26/app/application.js');
 assert.match(s,/createEvolutionReportGovernanceService\(\{runtime\}\)/);
 assert.match(s,/evolutionReportGovernance\.issue\(currentToken\(\),\{reportId\}\)/);
 assert.match(s,/evolutionReportGovernance\.latest\(currentToken\(\),\{reportId\}\)/);
});
