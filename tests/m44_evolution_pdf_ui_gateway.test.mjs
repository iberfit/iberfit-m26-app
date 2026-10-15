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
 'evolutionPdfActionScope({state,role,clientId,reportId:id,action:issue?',
 'getLatestEvolutionPdf(id)','issueEvolutionReport(id)','popup.location.replace(result.signedUrl)',
 'popup.close','evolutionPdfActionScope({state,role,clientId,reportId:id,action:issue?'])
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
 const bounded=s.slice(s.indexOf('async function showIssuedEvolutionHistory('),s.indexOf('async function withdrawIssuedEvolutionPdf('));
 assert.doesNotMatch(bounded,/host\.innerHTML/);
});
test('M44 Client and Coach versions have isolated action gateway with no direct Storage keys',async()=>{
 const s=await read('src/m26/app/application.js');
 for(const symbol of ['getEvolutionPdfHistory:async','openEvolutionPdfById:async','withdrawEvolutionPdf:async',
 'evolutionReportGovernance.history(currentToken()','evolutionReportGovernance.open(currentToken()',
 'evolutionReportGovernance.withdraw(currentToken()'])
 assert.ok(s.includes(symbol),symbol);
});


test('M44 issued report lifecycle presents actionable Spanish recovery messages before generic permissions errors',async()=>{
 const s=await read('src/m26/app/workflow-controller.js');
 const beginning=s.slice(s.indexOf('function friendlyError('),s.indexOf('function friendlyError(')+5700);
 for(const code of ['M44_PDF_ISSUANCE_NOT_AVAILABLE','M44_PDF_WITHDRAWN_REVISION_CANNOT_BE_REISSUED',
 'M44_PDF_REQUEST_TIMEOUT','M44_PDF_BRAND_FONT_FETCH_FAILED','M44_PDF_OFFLINE_UNAVAILABLE',
 'M44_PDF_POPUP_BLOCKED','M44_PDF_WITHDRAW_REASON_REQUIRED'])assert.ok(beginning.includes(code),code);
 assert.ok(beginning.indexOf('M44_PDF_ISSUANCE_NOT_AVAILABLE')<beginning.indexOf('ROLE|FORBIDDEN|CLIENT_CONTEXT'));
});


test('M44 issued-PDF failures route to visible report status, never the session or IRI banner',async()=>{
 const code=await read('src/m26/app/workflow-controller.js');
 assert.match(code,/const isEvolutionPdf=\['issue-evolution-pdf','open-issued-evolution-pdf','show-issued-evolution-history','withdraw-issued-evolution-pdf'\]/);
 assert.match(code,/const scope=isEvolutionPdf\?'report':isIriReport/);
 assert.match(code,/status\(root,scope,friendlyError\(error\),'error'\)/);
});
