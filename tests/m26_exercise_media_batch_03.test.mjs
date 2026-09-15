import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateApprovedBatch } from "../scripts/exercise-media/publish-approved-via-broker.mjs";

const CASES = [
  ["IBF-SENTADILLA-GOBLET","859fadb57853c66ee12fc211a90bb43d6911c8a25311fc553d34c008f8396b55"],
  ["IBF-DEAD-BUG","272bc2b23fd2f85ee572926f4d69e760de1f679a642c42c03f12bb3f7fdb85f8"],
  ["IBF-FLEXION-DE-BRAZOS","72fe887a9a4a394b667bb6dda2aeef6a64a86c9b046cb2923192adb34b5de1b8"],
  ["IBF-PUENTE-DE-GLUTEOS","fa9cd7979e0522c7e6badcae8e0cd93aa41f8058153f16682be24d212c05eafd"],
  ["IBF-BIRD-DOG","0183cccae55da15a7ce485f901d78e9fc237aafd26cc834e542c82eaf3523219"]
];

test("approved IBERFIT batch 03 reconstructs exact immutable WebP assets", () => {
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
