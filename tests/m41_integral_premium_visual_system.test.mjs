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
  const overview=css.v3.slice(css.v3.indexOf('.m26-admin-user360-overview .m26-admin-stat{'));
  assert.ok(overview.startsWith('.m26-admin-user360-overview .m26-admin-stat{'));
  assert.ok(overview.slice(0,450).includes('background:var(--iberfit-v3-panel)!important'));
  assert.ok(!css.v3.includes('linear-gradient(180deg,rgba(23,40,32,.34),rgba(16,29,24,.18))'));
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


test('M41 shipped CSS exactly mirrors the canonical Client guided welcome design',()=>{
  const guide=read('src/m26/onboarding/client-guided-welcome.js');
  const runtime=read('src/m26/design/runtime-static.css');
  const begin='const STYLE=`'+'\n';
  const sourceStart=guide.indexOf(begin);
  const sourceEnd=guide.indexOf('\n`;',sourceStart+begin.length);
  const marker='/* === Client guided welcome === */'+'\n';
  const shippedStart=runtime.indexOf(marker);
  const shippedEnd=runtime.indexOf('/* ===',shippedStart+marker.length);
  assert.ok(sourceStart>=0&&sourceEnd>sourceStart,'source CSS must exist');
  assert.ok(shippedStart>=0&&shippedEnd>shippedStart,'runtime CSS must embed the guide');
  const source=guide.slice(sourceStart+begin.length,sourceEnd).trim();
  const shipped=runtime.slice(shippedStart+marker.length,shippedEnd).trim();
  assert.equal(shipped,source,'guide and shipped CSS must remain byte-equivalent');
  assert.ok(shipped.includes('data-m26-client-guide-dock="clear"'));
  assert.ok(!shipped.includes('backdrop-filter:blur(16px)'));
});

test('M41 comforting Client guidance stays a discreet matte cream dialog above all mobile navigation',()=>{
  const guide=read('src/m26/onboarding/client-guided-welcome.js');
  assert.match(guide,/\.m26-client-guided-welcome\{[\s\S]*?background:#F5F5F0/);
  assert.match(guide,/--m26-client-guide-dock-clearance/);
  assert.match(guide,/bottom:max\(calc\(8\.5rem \+ env\(safe-area-inset-bottom\)\),var\(--m26-client-guide-dock-clearance,0px\)\)/);
  assert.match(guide,/getBoundingClientRect\?\.\(\)/);
  assert.match(guide,/\.m26-client-bottom-nav,\.m26-mobile-nav/);
  assert.match(guide,/setDialogDockClearance\(\)/);
  assert.match(guide,/data-m26-client-guide-dock/);
  assert.match(guide,/dialog\.style\?\.removeProperty\?\.\('--m26-client-guide-dock-clearance'\)/);
  assert.doesNotMatch(guide,/if\(!dialog\|\|Number\(scope\?\.innerWidth\|\|0\)>690\)return/);
  assert.match(guide,/\.m26-client-guided-welcome\[data-m26-client-guide-dock="clear"\]/);
  const navTest=read('qa/rc64/client-guided-welcome.spec.mjs');
  assert.match(navTest,/TOUCH TABLETS/);
  assert.match(navTest,/data-m26-client-guide-dock/);
  assert.match(guide,/overscroll-behavior:contain/);
  assert.match(guide,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(guide,/data-m26-client-guided-welcome-pause/);
  const e2e=read('qa/rc64/client-guided-welcome.spec.mjs');
  assert.match(e2e,/node\.style\.minHeight='154px'/);
  assert.match(e2e,/dialogBox\.y\+dialogBox\.height<=navBox\.y-4/);
});

test('M41 Admin visual certification validates the actual matte UI instead of requiring decorative gradients',()=>{
  const qa=read('qa/admin-interaction/admin-visual-evidence.spec.mjs');
  assert.match(qa,/expect\(vision\.workspaceBackground\)\.toBe\('none'\)/);
  assert.match(qa,/expect\(vision\.surfaceBackgroundImage\)\.toBe\('none'\)/);
  // B12 stays matte, with exact approved warmer forest canvas in Admin.
  assert.match(qa,/expect\(vision\.workspaceBackgroundColor\)\.toBe\('rgb\(13, 25, 19\)'\)/);
  assert.match(qa,/expect\(vision\.navBackgroundColor\)\.toMatch/);
  assert.match(qa,/not\.toMatch\(\/rgb\\\(255/);
});
