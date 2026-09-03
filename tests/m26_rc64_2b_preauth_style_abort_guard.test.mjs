import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('RC64.2B preauth stylesheet abort recovery is narrow verified and fail-closed',()=>{
  const smoke=read('qa/rc64/authenticated-smoke.spec.mjs');

  const helperStart=smoke.indexOf('function recoverablePreauthStylesheetAbort');
  const helperEnd=smoke.indexOf('function pageErrorProjection',helperStart);
  assert.ok(helperStart>=0&&helperEnd>helperStart);
  const helper=smoke.slice(helperStart,helperEnd);

  assert.match(helper,/item\?\.phase==='preauth'/u);
  assert.match(helper,/item\?\.method==='GET'/u);
  assert.match(helper,/item\?\.source==='local'/u);
  assert.match(helper,/item\?\.failure==='net::ERR_ABORTED'/u);
  assert.match(helper,/fullStylePaths instanceof Set/u);
  assert.match(helper,/fullStylePaths\.has\(item\?\.path\)/u);
  assert.doesNotMatch(helper,/ERR_FAILED|ERR_TIMED_OUT|ERR_CONNECTION|BLOCKED_BY_CLIENT/u);

  const checkpointStart=smoke.indexOf("const preauthStyleState=await page.evaluate");
  const checkpointEnd=smoke.indexOf("await page.getByRole('textbox',{name:'Correo',exact:true}).fill",checkpointStart);
  assert.ok(checkpointStart>=0&&checkpointEnd>checkpointStart);
  const checkpoint=smoke.slice(checkpointStart,checkpointEnd);

  assert.match(checkpoint,/link\[data-iberfit-full-style\]/u);
  assert.match(checkpoint,/link\.sheet\.cssRules\.length/u);
  assert.match(checkpoint,/item\.media==='all'/u);
  assert.match(checkpoint,/item\.readable===true/u);
  assert.match(checkpoint,/RC64_2B_PREAUTH_STYLE_NOT_READY/u);
  assert.match(checkpoint,/RC64_2B_PREAUTH_RUNTIME_FAILURE/u);
  assert.match(checkpoint,/RC64_2B_PREAUTH_REQUEST_FAILURE/u);
  assert.match(checkpoint,/requestFailures===requestFailureMeta\.length/u);
  assert.match(checkpoint,/requestFailureMeta\.every/u);
  assert.match(checkpoint,/recoverablePreauthStylesheetAbort/u);
  assert.match(checkpoint,/requestFailures=0;/u);
  assert.match(checkpoint,/requestFailureMeta\.length=0;/u);

  const resetIndex=checkpoint.indexOf('requestFailures=0;');
  const recoveryCheckIndex=checkpoint.indexOf("if(!recoverable)");
  assert.ok(recoveryCheckIndex>=0&&resetIndex>recoveryCheckIndex);

  assert.match(smoke,/stages=\$\{stageSummary\}/u);
  assert.match(smoke,/RC64_2B_RUNTIME_ERROR_DURING_AUTH/u);
  assert.match(smoke,/expect\(requestFailures\)\.toBe\(0\)/u);
});
