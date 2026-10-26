import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
const allRoles=['client','coach','admin'];
function luminance(hex){
  const c=[1,3,5].map(i=>Number.parseInt(hex.slice(i,i+2),16)/255);
  const linear=c.map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;
}
function contrast(a,b){
  const x=luminance(a),y=luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('B9 shared premium system applies readable tokens to all three authenticated roles',()=>{
  assert.match(css,/--iberfit-v3-text-secondary:#BAC8C0;/u);
  assert.match(css,/--iberfit-color-text-secondary:#BAC8C0;/u);
  for(const role of allRoles){
    assert.ok(css.includes('[data-m26-role="'+role+'"]'),'role scope missing: '+role);
  }
  assert.ok(contrast('#BAC8C0','#1C3026')>=7,'raised Admin background secondary text');
  assert.ok(contrast('#BAC8C0','#203B2E')>=7,'raised Client background secondary text');
  assert.ok(contrast('#BAC8C0','#193329')>=7,'raised Coach background secondary text');
});
test('B9 shared inputs, Auth, mobile navigation and Admin tables remain readable',()=>{
  assert.match(css,/\.m26-auth-card input::placeholder\{color:#ACBCB2!important\}/u);
  assert.match(css,/\.m26-workspace :is\(input,textarea\)::placeholder\{color:#B1BDB5!important\}/u);
  assert.match(css,/\.m26-mobile-nav \.m26-nav-item\{color:#BBC8BF!important\}/u);
  assert.match(css,/\.m26-workspace :is\(\.m26-admin-table,\.iberfit-table-shell\) td\{\s*color:#E0E7E1!important;/u);
  assert.ok(contrast('#BBC8BF','#0B1310')>=7);
  assert.ok(contrast('#ACBCB2','#0E1A15')>=7);
});
test('B9 Coach decisions, Admin density, Client clarity and live states keep role semantics',()=>{
  assert.match(css,/\.m26-coach-home-quick button\{\s*border-color:rgba\(197,160,89,\.28\)!important;/u);
  assert.match(css,/\.m26-coach-home-command-copy h2\{\s*font-weight:650;/u);
  assert.match(css,/\.m26-admin-hero h2\{\s*font-weight:720;/u);
  assert.match(css,/\.m26-client-home-greeting h2\{\s*font-weight:610;/u);
  assert.match(css,/\.m26-client-sessions-empty,\.iberfit-empty-state,\.m26-route-placeholder/u);
  assert.match(css,/\.m26-coach-home-v1 \.m26-coach-home-quick button:focus-visible/u);
  assert.match(css,/@media\(prefers-contrast:more\)/u);
  assert.match(css,/@media\(forced-colors:active\)/u);
  assert.match(css,/touch-action:manipulation/u);
  assert.match(css,/background:#DDC091;/u);
  assert.ok(contrast('#173629','#DDC091')>=7,'warm caramel heading AAA');
  assert.ok(contrast('#304736','#DDC091')>=5.5,'warm caramel secondary copy');
  assert.ok(contrast('#5D4316','#DDC091')>=5,'warm caramel status');
  assert.match(css,/box-shadow:inset 0 1px 0 rgba\(245,245,240,\.025\)!important;/u);
  assert.match(css,/\.m26-nav-item\.is-active\{[\s\S]*?background:rgba\(197,160,89,\.095\)!important;/u);
  assert.match(css,/\.m26-admin-route :is\([\s\S]*?\[data-admin-form="user-delete"\]/u);
  assert.doesNotMatch(css,/glow|glassmorphism/u);
});
