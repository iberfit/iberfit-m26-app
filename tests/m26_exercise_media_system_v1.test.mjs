import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const contract=JSON.parse(await readFile(new URL('../scripts/exercise-media/contract.json',import.meta.url),'utf8'));
const style=await readFile(new URL('../scripts/exercise-media/STYLE.md',import.meta.url),'utf8');
const spec=await readFile(new URL('../scripts/exercise-media/EXERCISE_MEDIA_SYSTEM_V1.md',import.meta.url),'utf8');
const approvedMasterMetadata=JSON.parse(await readFile(new URL('../public/iberfit/master/IBERFIT_MALE_MASTER_V1/front-master-v1.metadata.json',import.meta.url),'utf8'));

const visual=contract.media_contract.visual_system;

test('exercise media system v1 locks a high-resolution 4:5 master and current delivery derivative',()=>{
  assert.equal(visual.version,'iberfit.exercise.media.system.v1');
  assert.equal(visual.aspect_ratio,'4:5');
  assert.deepEqual(visual.generation_master,{min_width:1280,min_height:1600,allow_upscale_from_delivery:false});
  assert.deepEqual(visual.delivery,{width:640,height:800,format:'webp'});
  assert.equal(visual.safe_area_percent,6);
});

test('system v1 is pinned to the already approved athlete and official isotipo',()=>{
  const reference=visual.approved_identity_reference;
  assert.equal(reference.master_id,approvedMasterMetadata.masterId);
  assert.equal(reference.master_path,approvedMasterMetadata.output.path);
  assert.equal(reference.master_sha256,approvedMasterMetadata.output.sha256);
  assert.equal(reference.branded_reference_path,approvedMasterMetadata.brandedOutput.path);
  assert.equal(reference.branded_reference_sha256,approvedMasterMetadata.brandedOutput.sha256);
  assert.equal(reference.official_isotipo_path,approvedMasterMetadata.isotipoComposition.officialAsset);
  assert.equal(reference.official_isotipo_sha256,approvedMasterMetadata.isotipoComposition.officialAssetSha256);
  assert.equal(approvedMasterMetadata.approval.approvedByUser,true);
  assert.equal(approvedMasterMetadata.approval.selectedAsMaster,true);
  assert.match(spec,/silent drift is not allowed/i);
});

test('exercise pixels remain visual-only and semantic content belongs to UI',()=>{
  assert.equal(visual.embedded_text,false);
  assert.equal(visual.exercise_name_in_pixels,false);
  assert.equal(visual.technical_copy_in_pixels,false);
  assert.equal(visual.phase_labels_in_pixels,false);
  assert.match(style,/pure visual/i);
  assert.match(spec,/application UI owns/i);
  assert.match(spec,/No semantic UI information is baked into pixels\./);
});

test('branding uses only the exact official isotipo in approved placements',()=>{
  const branding=visual.branding;
  assert.equal(branding.official_isotipo_only,true);
  assert.equal(branding.generated_branding,false);
  assert.equal(branding.wordmark,false);
  assert.equal(branding.standalone_top_or_corner_branding,false);
  assert.deepEqual(branding.allowed_placements,['shirt-left-chest','single-wall-watermark']);
  assert.deepEqual(branding.shirt,{
    required:true,
    source:'approved_identity_reference.official_isotipo_path',
    generated:false,
    size:'small',
  });
  assert.equal(branding.wall_watermark.allowed,true);
  assert.equal(branding.wall_watermark.preferred_when_clean_background_plane_exists,true);
  assert.equal(branding.wall_watermark.source,'approved_identity_reference.official_isotipo_path');
  assert.equal(branding.wall_watermark.generated,false);
  assert.equal(branding.wall_watermark.max_count,1);
  assert.equal(branding.wall_watermark.preferred_zone,'upper-right-background');
  assert.equal(branding.wall_watermark.width_percent_min,18);
  assert.equal(branding.wall_watermark.width_percent_max,26);
  assert.equal(branding.wall_watermark.opacity_percent_min,6);
  assert.equal(branding.wall_watermark.opacity_percent_max,12);
  assert.equal(branding.wall_watermark.must_not_obscure_biomechanics,true);
  assert.deepEqual(branding.forbidden_placements,[
    'top-corner-standalone',
    'equipment',
    'dumbbells',
    'shoes',
    'shorts',
    'anatomy-inset',
  ]);
  assert.match(style,/Permitted placements are limited to: \*\*small shirt isotipo\*\* and \*\*one subtle wall watermark\*\*/i);
  assert.match(style,/Do not place a standalone top\/corner isotipo or IBERFIT wordmark inside the asset/i);
  assert.match(style,/Any approximate\/generated mark is a QA failure/i);
  assert.match(spec,/both use the exact repository asset `public\/isotipo-iberfit\.png`/i);
});

test('anatomy inset is required, upper-left, small, analytical and subordinate to biomechanics',()=>{
  assert.equal(visual.anatomy_inset.required_by_default,true);
  assert.equal(visual.anatomy_inset.exception_requires_qa_justification,true);
  assert.equal(visual.anatomy_inset.text_labels,false);
  assert.equal(visual.anatomy_inset.zone,'upper');
  assert.equal(visual.anatomy_inset.preferred_corner,'upper-left');
  assert.equal(visual.anatomy_inset.width_percent_min,12);
  assert.equal(visual.anatomy_inset.width_percent_max,16);
  assert.equal(visual.anatomy_inset.rendering_style,'analytical-anatomical-plate');
  assert.equal(visual.anatomy_inset.muscle_definition,'subtle-clear-not-hyperdefined');
  assert.equal(visual.anatomy_inset.decorative_elements,false);
  assert.equal(visual.anatomy_inset.primary_muscle_color,'iberfit-technical-green');
  assert.equal(visual.anatomy_inset.secondary_muscle_color,'iberfit-restrained-gold');
  assert.equal(visual.anatomy_inset.remaining_anatomy,'neutral-cream-grey-low-contrast');
  assert.equal(visual.anatomy_inset.must_not_obscure_biomechanics,true);
  assert.match(spec,/upper-left visual zone/i);
  assert.match(spec,/clean analytical anatomical plate/i);
  assert.match(style,/no hyper-defined musculature/i);
});

test('one canonical system must support library, live sessions, detail and fullscreen contexts',()=>{
  assert.deepEqual(visual.contexts,[
    'library-card',
    'client-live-session',
    'coach-live-session',
    'exercise-detail',
    'fullscreen-viewer',
  ]);
  assert.match(spec,/same canonical visual language/i);
});
