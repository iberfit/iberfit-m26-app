import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=(file)=>readFile(new URL('../'+file,import.meta.url),'utf8');

test('all required release authentication gates trigger on Coach Live session UI changes',async()=>{
  const paths=[
    '.github/workflows/coach-webauthn-recurring.yml',
    '.github/workflows/admin-webauthn-recurring.yml',
    '.github/workflows/remote-gates.yml',
  ];
  for(const path of paths){
    const body=await read(path);
    assert.match(body,/push:[\\s\\S]*?paths:[\\s\\S]*?src\\/m26\\/workflows\\/session-ui\\.js/u,
      path+' must run on a protected Canary source push affecting Plan B');
    const n=body.split("      - 'src/m26/workflows/session-ui.js'").length-1;
    assert.equal(n,path.includes('remote-gates')?1:2,
      path+' must cover protected push and PR where supported');
  }
});

test('M44 positive PDF writes remain push-only even when Coach WebAuthn is manually dispatched',async()=>{
  const wf=await read('.github/workflows/coach-webauthn-recurring.yml');
  const guard=await read('qa/m44/positive-webauthn-issued-pdf.mjs');
  assert.ok(wf.includes("M26_QA_M44_POSITIVE_CERT: ${{ github.event_name == 'push' && github.ref == 'refs/heads/canary/rc74-4' }}"));
  assert.doesNotMatch(wf,/M26_QA_M44_POSITIVE_CERT:\\s*['\"]true['\"]/u);
  assert.match(guard,/e\\.GITHUB_EVENT_NAME!=='push'/u);
  assert.match(guard,/e\\.GITHUB_REF_NAME!=='canary\\/rc74-4'/u);
  assert.match(guard,/e\\.M26_PROJECT_REF!==QA_REF/u);
  assert.match(wf,/Cleanup Coach QA WebAuthn fixture[\\s\\S]*?if: always\\(\\)/u);
});
