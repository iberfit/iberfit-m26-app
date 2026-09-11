import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateApprovedBatch } from "../scripts/exercise-media/publish-approved-via-broker.mjs";

const CASES = [
  ["IBF-PESO-MUERTO-RUMANO-CON-MANCUERNAS","e804560ff8fed337647f9e56dcf7ebdaeecf09c79b71b022156bb84a9dee34f5"],
  ["IBF-REMO-CON-MANCUERNA-A-UNA-MANO","69c6c0dabc0335fed4c1d7d3bec4aa11b26534302b768381628d6e85f11b98f1"],
  ["IBF-PRESS-DE-PECHO-CON-MANCUERNAS","13944c1c2674955876162082aaf6ccaf3e6298c9969644812ac263b0a5c82428"],
  ["IBF-ELEVACION-LATERAL-CON-MANCUERNAS","fa7388901c8d6271b5ead3578338db1a25a1d9ccff5743416f7d2bf2e25d2615"],
  ["IBF-CURL-DE-BICEPS-CON-MANCUERNAS","4bbdffe95d8b3324ee7eb70f7a1f73400717b4b74890180fe950f3e92cd83328"]
];

test("current approved IBERFIT batch 02 media reconstructs exact immutable WebP assets", () => {
  const root = process.cwd();
  for (const [id, sha256] of CASES) {
    const manifestPath = path.join(root,"scripts","exercise-media","approved",id,"approved-batch.json");
    const batch = JSON.parse(fs.readFileSync(manifestPath,"utf8"));
    const [entry] = validateApprovedBatch(batch,{sourceRoot:root});
    assert.equal(entry.id,id);
    assert.equal(entry.mime,"image/webp");
    assert.equal(entry.width,640);
    assert.equal(entry.height,800);
    assert.equal(entry.sha256,sha256);
    assert.equal(entry.storagePath,`${id}/movement-${sha256.slice(0,12)}.webp`);
    assert.equal(batch.items[0].human_approved,true);
    assert.equal(batch.items[0].publishable,true);
    assert.equal(batch.items[0].media.clientVisible,true);
    assert.equal(batch.items[0].media.coachVisible,true);
    assert.equal(batch.items[0].media.qa.visual,"approved");
    assert.equal(batch.items[0].media.qa.biomechanics,"approved");
  }
});

test("original batch 02 press de pecho bytes remain preserved as immutable history", () => {
  const root=process.cwd();
  const id="IBF-PRESS-DE-PECHO-CON-MANCUERNAS";
  const dir=path.join(root,"scripts","exercise-media","approved",id);
  const legacyParts=[0,1,2,3].map((i)=>path.join(dir,`${id}.b64.0${i}`));
  assert.ok(legacyParts.every((file)=>fs.existsSync(file)));
  const encoded=legacyParts.map((file)=>fs.readFileSync(file,"utf8").replace(/\s+/g,"")).join("");
  const bytes=Buffer.from(encoded,"base64");
  assert.equal(
    crypto.createHash("sha256").update(bytes).digest("hex"),
    "6a0c7ca12b88198eb73f81a9f0c04b5b08fc1d0b9bb6cd4b4ca0acbb4b1d64c1"
  );
});
