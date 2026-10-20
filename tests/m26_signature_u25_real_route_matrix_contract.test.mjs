import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const inventory=JSON.parse(read('qa/visual/signature-360-coverage.json'));
test('U25 uses opt-in production renderer, not placeholder facade',()=>{
 const fixture=read('qa/visual/signature-route-shell.fixture.mjs');
 assert.ok(fixture.includes("params.get('body')==='real'"));
 assert.ok(fixture.includes('renderRouteView(createRouteViewModel(vm,state'));
 assert.ok(fixture.includes("bodyMode:realBodies?'real-synthetic':'placeholder'"));
});
test('U25 has all 43 routes wired to Device Gate and no false acceptance',()=>{
 const cfg=read('playwright.device-experience.config.mjs'),spec=read('qa/device-experience/signature-u25-real-route-bodies.spec.mjs');
 assert.ok(cfg.includes("'signature-u25-real-route-bodies.spec.mjs'"));
 assert.equal(inventory.roles.client.length,9);
 assert.equal(inventory.roles.coach.length,17);
 assert.equal(inventory.roles.admin.length,17);
 for(const width of [320,390,768,1024,1440])assert.ok(spec.includes(String(width)));
 assert.ok(spec.includes('m26-route-placeholder'));
 assert.ok(spec.includes('role boundary'));
 assert.ok(spec.includes('writes'));
 assert.equal(inventory.status,'WIP_NOT_PRODUCTION');
 assert.equal(inventory.qaEvidence.syntheticRealBodyMatrix.fullFunctionalAcceptance,false);
 assert.equal(inventory.productionBaseline.sourceSha,'32e02bb0a2bd00cab5b4cd7e18c80ff3058a04b3');
 assert.equal(inventory.productionBaseline.workflowRunId,39451349112);
 assert.ok(Object.values(inventory.roles).flat().every(x=>x.evidenceStatus==='pending'));
});

test('U25 Media Review filter fields respect content-box containment on 320px screens',()=>{
 const css=read('src/m26/admin/media-review.css');
 const scope=css.slice(css.lastIndexOf('SIGNATURE U25 · media inventory form containment'));
 assert.match(scope,/\.m26-media-review-route \.m26-media-control-tools :is\(input,select\)/u);
 assert.match(scope,/box-sizing:border-box/u);
 assert.match(scope,/min-width:0/u);
 assert.match(scope,/max-width:100%/u);
 const grid=css.slice(css.lastIndexOf('SIGNATURE U25 · intrinsic grid containment'));
 assert.match(grid,/grid-template-columns:minmax\(0,1fr\)/u);
 assert.ok(grid.includes('.m26-media-review-route'));
 assert.doesNotMatch(grid,/overflow-(?:x|y|inline|block)\s*:\s*(?:hidden|clip)/u);
 const spec=read('qa/device-experience/signature-u25-real-route-bodies.spec.mjs');
 assert.ok(spec.includes("area==='admin-media-review'"));
 assert.ok(spec.includes("sheet?.sheet"));
 assert.ok(spec.includes("no document overflow"));
});
