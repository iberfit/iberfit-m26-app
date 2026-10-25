import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const M44=".github/workflows/m44-encrypted-disaster-recovery.yml";
const read=path=>readFileSync(path,'utf8');
function eventBlock(yaml,event,next){
  const i=yaml.indexOf('  '+event+':');
  assert.ok(i>0,event+' event missing');
  const tail=yaml.slice(i+event.length+3);
  const boundary=tail.search(/^  [a-z_]+:/mu);
  return boundary<0?tail:tail.slice(0,boundary);
}
test('M44 renewal triggers Device Experience for PR and Canary push',()=>{
  const yaml=read('.github/workflows/device-experience-gate.yml');
  for(const event of ['pull_request','push']){
    assert.match(eventBlock(yaml,event),/m44-encrypted-disaster-recovery\.yml/u);
  }
  assert.match(yaml,/workflow_dispatch:/u);
});
test('M44 renewal triggers read-only Canary remote gates on exact source SHA',()=>{
  const yaml=read('.github/workflows/remote-gates.yml');
  assert.match(eventBlock(yaml,'push'),/m44-encrypted-disaster-recovery\.yml/u);
  assert.match(yaml,/workflow_dispatch:/u);
  assert.match(yaml,/name: IBERFIT M26 Gates remotos de solo lectura/u);
});
test('M44 renewal triggers continuous audit for PR and exact Canary push',()=>{
  const yaml=read('.github/workflows/continuous-app-audit.yml');
  for(const event of ['pull_request','push']){
    assert.match(eventBlock(yaml,event),/m44-encrypted-disaster-recovery\.yml/u);
  }
  assert.match(yaml,/workflow_dispatch:/u);
});
test('M44 workflow retains protected Canary-push backup and restoration controls',()=>{
  const yaml=read(M44);
  assert.match(eventBlock(yaml,'push'),/m44-encrypted-disaster-recovery\.yml/u);
  assert.match(yaml,/BACKUP_ENCRYPT_AND_VERIFY_PROD/u);
  assert.match(yaml,/m44-prod-db-storage-encrypted-backup-and-restore/u);
});
