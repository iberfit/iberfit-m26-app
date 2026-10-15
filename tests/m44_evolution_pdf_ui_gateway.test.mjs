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


test('M44 issue archive permits explicit version opening, safe history, and reasoned withdraw only to Coach',async()=>{
 const s=await read('src/m26/app/workflow-controller.js');
 for(const phrase of [
 'function issuedHistoryHost(', 'async function showIssuedEvolutionHistory(',
 'async function withdrawIssuedEvolutionPdf(', 'requireCoach();',
 'history.manager','input.dataset.m44WithdrawReason','open.dataset.issuanceId',
 "action==='show-issued-evolution-history'", "action==='withdraw-issued-evolution-pdf'",
 'Las URLs ya emitidas pueden seguir accesibles hasta su vencimiento de 120 segundos',
 ])
 assert.ok(s.includes(phrase),phrase);
 assert.match(s,/caption\.textContent=/);
 assert.match(s,/new Date\(item\.issuedAt\)/);
 assert.match(s,/host\.replaceChildren\(\)/);
 assert.doesNotMatch(s,/host\.innerHTML/);
});
test('M44 Client and Coach versions have isolated action gateway with no direct Storage keys',async()=>{
 const s=await read('src/m26/app/application.js');
 for(const symbol of ['getEvolutionPdfHistory:async','openEvolutionPdfById:async','withdrawEvolutionPdf:async',
 'evolutionReportGovernance.history(currentToken()','evolutionReportGovernance.open(currentToken()',
 'evolutionReportGovernance.withdraw(currentToken()'])
 assert.ok(s.includes(symbol),symbol);
});
