import assert from 'node:assert/strict';
import fs from 'node:fs';

const uiPath='src/m26/workflows/session-ui.js';
const testPath='tests/m26_session_previous_set_reuse.test.mjs';

let ui=fs.readFileSync(uiPath,'utf8');
const before="    values?.rir?`RIR ${values.rir}`:null,";
const after="    values?.rir!=null&&Number.isFinite(Number(values.rir))?`RIR ${values.rir}`:null,";
assert.equal(ui.split(before).length-1,1,'expected exactly one previous-set RIR truthiness guard');
ui=ui.replace(before,after);
fs.writeFileSync(uiPath,ui);

let test=fs.readFileSync(testPath,'utf8');
const marker="test('previous-set reuse is registered for client and coach without becoming a remote command',()=>{";
assert.equal(test.split(marker).length-1,1,'expected previous-set registry test marker');
const regression=`test('Session Live preserves RIR 0 in the reusable previous-set summary',()=>{\n  const session=makeSession();\n  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-rir-zero'});\n  startExecution(execution);\n  recordSet(execution,session,{\n    reps:10,\n    load:'80 kg',\n    rpe:10,\n    rir:0,\n  });\n  advanceExecution(execution);\n\n  assert.equal(previousSetDraftValues(execution)?.rir,'0');\n  const html=renderGuidedExecution({execution,session,catalog,mediaMap:null,role:'client'});\n  assert.match(html,/data-session-previous-set/);\n  assert.match(html,/RIR 0/);\n});\n\n`;
test=test.replace(marker,regression+marker);
fs.writeFileSync(testPath,test);
