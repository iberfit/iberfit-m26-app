import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contrastRatio} from '../src/m26/ui/design-system.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css={
  v3:read('src/m26/design/iberfit-premium-v3.css'),
  role:read('src/m26/design/role-surfaces.css'),
  dark:read('src/m26/design/dark-iberfit-v2.css'),
  shell:read('src/m26/shell/shell.css'),
  auth:read('src/m26/design/auth-native.css'),
  nav:read('src/m26/ui/client-bottom-nav.css'),
  admin:read('src/m26/admin/admin.css'),
};
const count=(text,re)=>(text.match(re)||[]).length;

test('M41 keeps a single canonical terminal stylesheet instead of another specificity layer',()=>{
  const html=read('public/m26/index.html');
  assert.ok(html.indexOf('/src/m26/design/role-surfaces.css')<html.indexOf('/src/m26/design/iberfit-premium-v3.css'));
  assert.ok(html.indexOf('/src/m26/design/dark-iberfit-v2.css')<html.indexOf('/src/m26/design/iberfit-premium-v3.css'));
  assert.ok(html.includes('data-iberfit-premium-v3-style="true"'));
  assert.equal(count(html,/data-iberfit-premium-v3-style="true"/g),1);
  const tokens=JSON.parse(read('src/m26/design/tokens.json'));
  assert.equal(tokens.color.primitive.forest950,'#0B1310');
  assert.equal(tokens.color.primitive.gold500,'#C5A059');
  assert.equal(tokens.color.primitive.cream100,'#F5F5F0');
  const mark=JSON.parse(read('src/m26/design/brand-truth.json'));
  assert.equal(mark.officialAsset.useAsIs,true);
  assert.equal(mark.officialAsset.recolorFromUiTokens,false);
  assert.equal(mark.officialAsset.path,'public/isotipo-iberfit.png');
});

test('M41 standard surfaces are quiet, matte and role-specific, not layered SaaS glow cards',()=>{
  assert.match(css.v3,/--iberfit-v3-panel:#152820/);
  for(const [role,panel] of [
    ['client','#192E24'],['coach','#142820'],['admin','#162820'],
  ]){
    assert.ok(css.v3.includes('.m26-shell[data-m26-role="'+role+'"]'));
    assert.ok(css.v3.includes('--iberfit-v3-panel:'+panel));
  }
  assert.match(css.v3,/background:var\(--iberfit-v3-panel\)!important/);
  assert.match(css.v3,/box-shadow:inset 0 1px 0 rgba\(245,245,240,.025\)!important/);
  assert.ok(count(css.v3,/gradient\(/g)<=15,'Do not reinstate excessive gradients in the terminal layer');
  assert.ok(count(css.role,/gradient\(/g)<=80,'Role navigation and heroes must stay restrained');
  assert.equal(count(css.nav,/gradient\(/g),0,'Compact Client navigation must not look like a neon dock');
  assert.doesNotMatch(css.shell,/radial-gradient\(circle at 85% 8%/);
  assert.doesNotMatch(css.auth,/radial-gradient\(circle at 50% -10%/);
  assert.doesNotMatch(css.auth,/background-size: 48px 48px/);
});

test('M41 carefully reserves gold, distinguishes success/errors and does not make every action decorative',()=>{
  assert.match(css.v3,/background:#C5A059!important/);
  assert.match(css.v3,/background:#D7BA7C!important/);
  assert.match(css.v3,/\.m26-badge\.is-success/);
  assert.match(css.v3,/\.m26-notice\.is-danger/);
  assert.match(css.v3,/rgba\(16,185,129,.085\)/);
  assert.match(css.v3,/rgba\(239,68,68,.085\)/);
  assert.match(css.nav,/box-shadow:inset 0 2px 0 #C5A059/);
});

test('M41 warm-paper Client moment is intentional and has WCAG AA text contrast',()=>{
  assert.match(css.dark,/\.m26-client-home-clear\{[\s\S]*?background:#F5F5F0/);
  assert.match(css.dark,/\.m26-client-home-clear strong\{\s*color:#13221C/);
  assert.match(css.dark,/\.m26-client-home-clear small\{\s*color:#44584C/);
  assert.ok(contrastRatio('#13221C','#F5F5F0')>=4.5);
  assert.ok(contrastRatio('#44584C','#F5F5F0')>=4.5);
  const device=read('qa/device-experience/device-experience.spec.mjs');
  assert.match(device,/element\.matches\('\.m26-shell\[data-m26-role="client"\] \.m26-client-home-clear'\)/);
  assert.match(device,/luminance\(foreground\)/);
  assert.match(device,/>=4\.5/);
  assert.match(device,/if\(accessible\)return false/);
});

test('M41 preserves distinct Client/Coach/Admin editorial and operational reading',()=>{
  assert.match(css.role,/\.m26-shell\[data-m26-role="client"\] \.m26-route-intro h2\{[\s\S]*?font-family:var\(--iberfit-font-family-editorial\)/);
  assert.match(css.role,/\.m26-shell\[data-m26-role="coach"\] \.m26-route-intro h2,[\s\S]*?font-family:var\(--iberfit-font-family-ui\)/);
  assert.match(css.role,/\.m26-shell\[data-m26-role="admin"\] \.m26-admin-route h2\{[\s\S]*?font-family:var\(--iberfit-font-family-ui\)/);
  assert.match(css.role,/font-variant-numeric:tabular-nums lining-nums/);
  assert.match(css.role,/\.m26-shell\[data-m26-role="admin"\] \.m26-admin-table th[\s\S]*?font-size: \.8125rem/);
});

test('M41 raises operational microcopy and preserves professional 44px actions',()=>{
  assert.match(css.dark,/\.m26-builder-library-filters label\{[\s\S]*?font-size:\.875rem/);
  assert.match(css.dark,/\.m26-builder-group-target small\{[\s\S]*?font-size:\.8125rem/);
  assert.match(css.dark,/\.m26-exercise-result-add\{[\s\S]*?min-width:44px;\s*min-height:44px/);
  assert.match(css.dark,/\.m26-builder-program \.m26-builder-toolbar button\{\s*min-height:44px/);
  assert.match(css.dark,/\.m26-client-home-primary-zone \.m26-today-action\.is-primary > span\{[\s\S]*?min-width:48px;\s*min-height:48px/);
  assert.match(css.admin,/\.m26-client-create-progress em\{font-size:\.8125rem/);
  assert.match(css.shell,/\.m26-stepper button small\{font-size:\.8125rem/);
  assert.match(css.nav,/@media \(max-width: 370px\)[\s\S]*?font-size:0\.75rem/);
  assert.match(css.nav,/overflow-wrap:anywhere;\s*text-align:center/);
  assert.match(css.auth,/\.m26-auth-flow-label > span \{[\s\S]*?font-size: \.8125rem/);
  assert.match(css.auth,/\.m26-auth-intro-trust \{[\s\S]*?font-size: \.8125rem/);
});

test('M41 focused controls are visible in keyboard, mobile, forced-colors and reduced-motion states',()=>{
  assert.match(css.v3,/outline:3px solid var\(--iberfit-v3-focus\)!important/);
  assert.match(css.v3,/button,a\[href\],summary,\[role="button"\],\[role="tab"\]/);
  assert.match(css.v3,/@media\(max-width:719px\)/);
  assert.match(css.v3,/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="hidden"\]\):not\(\[type="range"\]\):not\(\[type="file"\]\)/);
  assert.match(css.v3,/font-size:1rem!important;min-height:44px/);
  assert.match(css.v3,/@media\(forced-colors:active\)/);
  assert.match(css.v3,/outline:3px solid Highlight!important/);
  assert.match(css.v3,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css.v3,/transition:none!important;animation:none!important/);
  assert.match(css.nav,/env\(safe-area-inset-bottom\)/);
});

test('M41 device matrix is executable using actual current-source CSS on all roles and 10 viewports',()=>{
  const config=read('playwright.device-experience.config.mjs');
  const qa=read('qa/device-experience/m41-premium-visual.spec.mjs');
  assert.match(config,/'m41-premium-visual\.spec\.mjs'/);
  assert.match(config,/device-mobile-320-chromium/);
  assert.match(config,/device-tablet-768-portrait-chromium/);
  assert.match(config,/device-desktop-chromium/);
  for(const role of ['client','coach','admin'])assert.ok(qa.includes("role:'"+role+"'"));
  assert.match(qa,/page\.addStyleTag\(\{url:href\}\)/);
  assert.match(qa,/getComputedStyle\(node\)/);
  assert.match(qa,/documentWidth/);
  assert.match(qa,/contrast\(proof\.background,foreground\)/);
  assert.match(qa,/captureEvidenceScreenshot/);
});

test('M41 does not corrupt standalone reporting, IRI meaning or the running production release',()=>{
  const source=read('public/m26/index.html');
  assert.ok(source.includes('/src/m26/workflows/iri-external-report.css'));
  assert.ok(source.includes('/src/m26/workflows/iri-photogrammetry.css'));
  assert.ok(source.includes('/src/m26/rc39/rc39.css'));
  assert.ok(source.includes('/src/m26/design/typography.css'));
  assert.match(css.shell,/\.m26-iri-assessment-workspace/);
  assert.match(css.v3,/\.m26-auth-page/);
  assert.match(css.v3,/\.m26-shell\[data-m26-role="coach"\]/);
  assert.match(css.v3,/\.m26-shell\[data-m26-role="admin"\]/);
});
