import fs from 'node:fs';
import path from 'node:path';
import {auditDesignContract,auditPaletteContrast} from '../src/m26/ui/design-system.js';
import {M26_ACTION_REGISTRY} from '../src/m26/ui/interactive-audit.js';
const root=process.cwd();
const css=fs.readFileSync(path.join(root,'src/m26/shell/shell.css'),'utf8');
const render=fs.readFileSync(path.join(root,'src/m26/modules/route-render.js'),'utf8');
const design=auditDesignContract(css);
const checks=[
  ['design-contract',design.ok],
  ['unified-action-registry',Object.keys(M26_ACTION_REGISTRY).length>=25],
  ['engagement-actions-covered',['save-checkin-draft','submit-checkin','save-habit-draft','define-habit','log-habit','save-private-note'].every(x=>M26_ACTION_REGISTRY[x])],
  ['verification-actions-covered',['inspect','retry','discard_local'].every(x=>M26_ACTION_REGISTRY[x])],
  ['disabled-buttons-aria',(render.match(/disabled aria-disabled="true"/g)||[]).length>=(render.match(/ disabled/g)||[]).length],
  ['focus-visible',/:focus-visible/.test(css)],
  ['high-contrast',/prefers-contrast:\s*more/.test(css)],
  ['mobile-field-layout',/\.m26-field-grid\s*\{\s*grid-template-columns:\s*1fr/.test(css)],
  ['private-note-role-locked',M26_ACTION_REGISTRY['save-private-note'].roles.join(',')==='admin,coach'],
  ['palette-contrast-aa',auditPaletteContrast().ok],
  ['mobile-stat-density',/RC13 · Refinamiento móvil/.test(css)&&/repeat\(2, minmax\(0, 1fr\)\)/.test(css)],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);
