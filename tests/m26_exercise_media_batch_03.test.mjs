import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateApprovedBatch } from "../scripts/exercise-media/publish-approved-via-broker.mjs";

const CASES = [
  ["IBF-SENTADILLA-GOBLET","d97df4fe70655937634fa52b8322c9a88f20339f7384dbccdda627c7d4e44d5b"],
  ["IBF-DEAD-BUG","dc07119534408d47e65df8730aa6cbfd4a7afa5703d56a69c8d5538a47f443d5"],
  ["IBF-FLEXION-DE-BRAZOS","7a1eb670b632862dc3b8f777a0606193662eb9589121e8ca149c6ca3e6878ee9"],
  ["IBF-PUENTE-DE-GLUTEOS","cbf7a3ffbd1cf162384b1cc5ded03beeb246a7a28246b47aaf148230c766c430"],
  ["IBF-BIRD-DOG","4703af975e27a27d471b692bc7b2631b80e67a4a15815063365d1c4f5e3029cc"]
];

test("approved IBERFIT batch 03 reconstructs exact final immutable WebP assets", () => {
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
    const parts=batch.items[0].source_base64_parts;
    assert.ok(Array.isArray(parts)&&parts.length>0);
    assert.ok(parts.every((part)=>part.startsWith(`scripts/exercise-media/approved/${id}/`)));
    assert.ok(parts.every((part)=>/\.final-v\d+\.b64\.\d+$/.test(part)));
  }
});
