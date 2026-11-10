import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const paths=["src/m26/communication/**","src/m26/modules/**","src/m26/intelligence/**","src/m26/design/role-surfaces.css","public/m26/sw.js"];
const cases=[
  {file:'coach-webauthn-recurring.yml',count:2},
  {file:'admin-webauthn-recurring.yml',count:2},
  {file:'remote-gates.yml',count:1},
];
for(const {file,count} of cases){
  test(file+' certifies Private Coach Client/Coach surfaces at the exact Canary SHA',()=>{
    const yaml=readFileSync(new URL('../.github/workflows/'+file,import.meta.url),'utf8');
    assert.match(yaml,/^  push:\n/m);
    assert.match(yaml,/^  workflow_dispatch:/m);
    for(const path of paths){
      assert.equal(yaml.split("      - '"+path+"'").length-1,count,
        path+' must trigger '+file+' on protected Canary push'+(count===2?' and PR':''));
    }
  });
}
