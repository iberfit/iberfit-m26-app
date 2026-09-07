import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { validateApprovedBatch, publishApprovedBatch } from "../scripts/exercise-media/publish-approved-via-broker.mjs";

const PNG_BASE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const PNG = Buffer.concat([PNG_BASE, Buffer.alloc(64)]);
const sha = crypto.createHash("sha256").update(PNG).digest("hex");
const id = "IBF-TEST";
function fixture(root) {
  const rel = "approved/one.png";
  fs.mkdirSync(path.join(root,"approved"),{recursive:true});
  fs.writeFileSync(path.join(root,rel),PNG);
  return {
    schema:"iberfit.exercise.media.approved-batch.v1",
    target:"prod",
    items:[{
      exercise_id:id,
      local_path:rel,
      human_approved:true,
      publishable:true,
      approval:{method:"human_owner_approval",scopes:["visual","biomechanics"],automatic_qa:"not_run"},
      media:{
        schema:"iberfit.exercise.visual.v1",
        style:"iberfit-premium-movement-pair-v1",
        bucket:"iberfit-exercise-media",
        movement:{kind:"movement",path:`${id}/movement-${sha.slice(0,12)}.png`,mime:"image/png",width:1,height:1,sha256:sha},
        published:true,clientVisible:true,coachVisible:true,
        qa:{biomechanics:"approved",visual:"approved"}
      }
    }]
  };
}
test("approved batch validates exact file hash, dimensions and immutable path",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"iberfit-media-"));
  assert.equal(validateApprovedBatch(fixture(root),{sourceRoot:root}).length,1);
});
test("publisher rejects missing human approval and failed automatic QA",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"iberfit-media-"));
  const a=fixture(root);a.items[0].human_approved=false;
  assert.throws(()=>validateApprovedBatch(a,{sourceRoot:root}),/HUMAN_APPROVAL_REQUIRED/);
  const b=fixture(root);b.items[0].approval.automatic_qa="failed";
  assert.throws(()=>validateApprovedBatch(b,{sourceRoot:root}),/AUTOMATIC_QA_FAILED/);
});
test("publisher rejects a local file whose bytes do not match manifest sha",()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"iberfit-media-"));
  const x=fixture(root);fs.appendFileSync(path.join(root,x.items[0].local_path),"x");
  assert.throws(()=>validateApprovedBatch(x,{sourceRoot:root}),/FILE_SHA_MISMATCH/);
});
test("apply sends multipart only to exact broker and verifies public bytes",async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"iberfit-media-"));
  const batch=fixture(root);
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    if(String(url).includes("/functions/v1/iberfit-exercise-media-publisher")){
      assert.equal(options.method,"POST");
      assert.match(options.headers.authorization,/^Bearer /);
      const item=JSON.parse(options.body.get("item"));
      assert.equal(item.exercise_id,id);
      assert.ok(options.body.get("file") instanceof Blob);
      return new Response(JSON.stringify({
        ok:true,exercise_id:id,sha256:sha,
        public_url:`https://pjhmrhejsoofmouedavw.supabase.co/storage/v1/object/public/iberfit-exercise-media/${id}/movement-${sha.slice(0,12)}.png`
      }),{status:200,headers:{"content-type":"application/json"}});
    }
    return new Response(PNG,{status:200,headers:{"content-type":"image/png"}});
  };
  const result=await publishApprovedBatch(batch,{sourceRoot:root,oidcToken:"x".repeat(200),apply:true,fetchImpl});
  assert.equal(result.applied,true);
  assert.equal(result.count,1);
  assert.equal(calls.length,2);
});
test("automatic publisher is pinned to canary push and exact trusted workflow",()=>{
  const workflow=fs.readFileSync(new URL("../.github/workflows/exercise-media-publish-approved.yml",import.meta.url),"utf8");
  const broker=fs.readFileSync(new URL("../supabase/functions/iberfit-exercise-media-publisher/index.ts",import.meta.url),"utf8");
  assert.match(workflow,/push:\s*\n\s*branches:\s*\n\s*- canary\/rc74-4/);
  assert.match(workflow,/scripts\/exercise-media\/approved\/\*\*\/approved-batch\.json/);
  assert.match(workflow,/GITHUB_REF\" = 'refs\/heads\/canary\/rc74-4'/);
  assert.match(broker,/EXPECTED_REF = "refs\/heads\/canary\/rc74-4"/);
  assert.match(broker,/exercise-media-publish-approved\.yml@refs\/heads\/canary\/rc74-4/);
  assert.match(broker,/"push"/);
});
test("approved sentadilla al aire fragmented source reconstructs to exact immutable WebP",()=>{
  const root=process.cwd();
  const manifestPath=path.join(root,"scripts/exercise-media/approved/IBF-SENTADILLA-AL-AIRE/approved-batch.json");
  const batch=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
  const [entry]=validateApprovedBatch(batch,{sourceRoot:root});
  assert.equal(entry.id,"IBF-SENTADILLA-AL-AIRE");
  assert.equal(entry.mime,"image/webp");
  assert.equal(entry.width,768);
  assert.equal(entry.height,960);
  assert.equal(entry.sha256,"2ab5434df034778dc1036b90ba920cbfcc2385c27e334c4a8fc7b04f00afa568");
  assert.equal(entry.storagePath,"IBF-SENTADILLA-AL-AIRE/movement-2ab5434df034.webp");
});
