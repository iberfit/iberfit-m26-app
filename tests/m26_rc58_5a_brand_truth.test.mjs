import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const truth=JSON.parse(read('src/m26/design/brand-truth.json'));
const tokens=JSON.parse(read('src/m26/design/tokens.json'));
const rc45=JSON.parse(read('recovery/rc45-visual/RC45_5I_ISOTIPO_FINAL.json'));
const master=JSON.parse(read('public/iberfit/master/IBERFIT_MALE_MASTER_V1/front-master-v1.metadata.json'));
const launch=read('docs/APP_IBERFIT_CL_LAUNCH_PARITY.md');

const sha256=(path)=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');

test('official brand asset is pinned by path and sha256',()=>{
  assert.equal(truth.officialAsset.path,'public/isotipo-iberfit.png');
  assert.equal(
    truth.officialAsset.sha256,
    'd4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa'
  );
  assert.equal(sha256(truth.officialAsset.path),truth.officialAsset.sha256);
  assert.equal(truth.officialAsset.primaryAppearance,'gold');
  assert.equal(truth.officialAsset.generatedByAI,false);
});

test('RC45.5I independently confirms the same official asset',()=>{
  assert.equal(rc45.status,'OFFICIAL_ISOTIPO_COMPOSITION_APPROVED');
  assert.equal(rc45.isotipo.asset,truth.officialAsset.path);
  assert.equal(rc45.isotipo.sha256,truth.officialAsset.sha256);
  assert.equal(rc45.isotipo.officialAssetUsed,true);
  assert.equal(rc45.isotipo.generatedByAI,false);
  assert.equal(master.isotipoPlan.officialAsset,truth.officialAsset.path);
  assert.equal(master.isotipoPlan.officialAssetSha256,truth.officialAsset.sha256);
  assert.equal(master.isotipoComposition.officialAsset,truth.officialAsset.path);
});

test('raster observations are not silently promoted to canonical recolor tokens',()=>{
  assert.equal(truth.colorPolicy.canonicalLogoGoldHex,null);
  assert.equal(truth.officialAsset.useAsIs,true);
  assert.equal(truth.officialAsset.recolorFromUiTokens,false);
  assert.equal(truth.colorPolicy.observationsAreCanonicalTokens,false);
  assert.equal(truth.colorPolicy.observedTopExactColor,'#FBDD8B');
  assert.equal(truth.colorPolicy.observedGoldFamilyMean,'#FADC84');
});

test('existing product gold remains separate and unchanged in RC58.5A',()=>{
  assert.equal(tokens.color.primitive.gold500,'#c8a65d');
  assert.equal(tokens.color.primitive.gold300,'#e4cd98');
  assert.equal(truth.colorPolicy.productUiGold500,tokens.color.primitive.gold500);
  assert.equal(truth.colorPolicy.productUiGold300,tokens.color.primitive.gold300);
  assert.equal(truth.colorPolicy.productUiGoldsAreLogoRecolorValues,false);
});

test('commercial web cannot override brand truth',()=>{
  assert.equal(truth.colorPolicy.commercialCurrentCssIsBrandSourceOfTruth,false);
  assert.deepEqual(truth.propagation.order,[
    'BRAND_TRUTH',
    'DESIGN_TOKENS',
    'M26',
    'ANDROID_PHONE',
    'WEAR_OS',
    'COMMERCIAL_WEB',
  ]);
});

test('app.iberfit.cl cutover contract remains protected',()=>{
  assert.equal(truth.launch.finalAppDomain,'app.iberfit.cl');
  assert.equal(truth.launch.preserveCurrentUntilControlledCutover,true);
  assert.equal(truth.launch.functionalParityRequired,true);
  assert.match(launch,/CURRENT_APP_IBERFIT_CL_PRESERVE_UNTIL_CONTROLLED_CUTOVER=TRUE/);
  assert.match(launch,/FUNCTIONAL_PARITY_REQUIRED_BEFORE_CUTOVER=TRUE/);
});