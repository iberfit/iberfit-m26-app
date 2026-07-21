import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {auditPaletteContrast} from '../src/m26/ui/design-system.js';
const root=process.cwd();const read=(p)=>fs.readFileSync(path.join(root,p));const json=(p)=>JSON.parse(read(p));const exists=(p)=>fs.existsSync(path.join(root,p));const hash=(p)=>crypto.createHash('sha256').update(read(p)).digest('hex');
const report=json('recovery/RC13_VISUAL_QA_REPORT.json');const remote=json('recovery/RC13_REMOTE_PREFLIGHT_STATUS.json');const css=read('src/m26/shell/shell.css').toString();const checks=[
  ['visual-report-15-of-15',report.case_count===15&&report.passed===15&&report.failed===0],
  ['visual-cases-no-errors',report.results.every((item)=>item.ok&&item.errors.length===0&&!item.console_errors.length&&!item.page_errors.length)],
  ['no-horizontal-overflow',report.results.every((item)=>!item.metrics.horizontalOverflow&&!item.metrics.overflowingElements.length)],
  ['touch-targets-runtime',report.results.every((item)=>!item.metrics.smallTargets.length)],
  ['labels-and-ids-runtime',report.results.every((item)=>!item.metrics.duplicateIds.length&&!item.metrics.unnamedButtons&&!item.metrics.unlabeledControls)],
  ['images-runtime',report.results.every((item)=>!item.metrics.brokenImages.length)],
  ['focus-runtime',report.results.every((item)=>item.metrics.focusOutline?.style!=='none'&&Number.parseFloat(item.metrics.focusOutline?.width)>=2)],
  ['navigation-responsive',report.results.every((item)=>item.case.width<=900?(!item.metrics.sidebarVisible&&item.metrics.mobileNavVisible):(item.metrics.sidebarVisible&&!item.metrics.mobileNavVisible))],
  ['performance-budget',report.results.every((item)=>item.load_ms<2500&&item.metrics.domNodes<=650)],
  ['screenshots-present',report.results.every((item)=>exists(item.screenshot)&&fs.statSync(path.join(root,item.screenshot)).size>5000)],
  ['contact-sheet-present',exists(report.contact_sheet)&&fs.statSync(path.join(root,report.contact_sheet)).size>10000],
  ['logo-published',exists('public/isotipo-iberfit.png')&&hash('public/isotipo-iberfit.png')===hash('baseline_m25_2/public/isotipo-iberfit.png')],
  ['palette-aa',auditPaletteContrast().ok],
  ['mobile-density-correction',/RC13 · Refinamiento móvil/.test(css)&&/grid-template-columns:\s*repeat\(2/.test(css)],
  ['generator-present',exists('qa/rc13_generate_visual_cases.mjs')&&exists('qa/rc13_visual_qa.py')&&exists('qa/rc13_visual_cases.json')],
  ['remote-read-only',remote.mode==='read_only'&&remote.production_modified===false],
  ['remote-not-falsely-validated',remote.catalog_remote_validated===false&&remote.engagement_extension_installed===false],
  ['documentation-present',exists('docs/VISUAL_CANARY_RC13.md')&&exists('README_RC13.md')],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}console.log(`\n${checks.length-failed}/${checks.length} PASS`);if(failed)process.exit(1);
