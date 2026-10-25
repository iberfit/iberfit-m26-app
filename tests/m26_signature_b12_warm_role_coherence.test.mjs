import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync('src/m26/design/iberfit-premium-v3.css','utf8');
const b12=css.slice(css.indexOf('/* SIGNATURE B12 |'));
test('SIGNATURE B12 warm layer exists in existing last-loaded canonical premium stylesheet',()=>{
  assert.ok(b12.length>1800);
  assert.match(b12,/--iberfit-signature-caramel:#DDC091/u);
  assert.match(b12,/--iberfit-signature-ivory:#F7F0E3/u);
  assert.match(b12,/--iberfit-signature-muted:#C9C6B9/u);
  assert.doesNotMatch(b12,/position:\s*(fixed|sticky)|z-index\s*:/u);
});
test('warm vocabulary is shared but density and treatments remain role specific',()=>{
  for(const role of ['client','coach','admin'])
    assert.ok(b12.includes('.m26-shell[data-m26-role="'+role+'"]'));
  assert.match(b12,/--iberfit-v3-panel:#1D3629/u);
  assert.match(b12,/--iberfit-v3-panel:#192F24/u);
  assert.match(b12,/--iberfit-v3-panel:#1C3026/u);
  assert.match(b12,/m26-rc39-session-card/u);
  assert.match(b12,/m26-admin-table/u);
});
test('Coach touch editing and accessible focus are preserved on 320/390px',()=>{
  assert.match(b12,/@media\(max-width:680px\)/u);
  assert.match(b12,/\[data-session-action="save-draft"\]/u);
  assert.match(b12,/\[data-session-action="preview"\]/u);
  assert.match(b12,/font-size:16px/u);
  assert.match(b12,/min-height:48px/u);
  assert.match(b12,/:focus-visible/u);
  assert.match(b12,/@media\(forced-colors:active\)/u);
});
const luminance=hex=>{
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
const contrast=(a,b)=>{
 const high=Math.max(luminance(a),luminance(b));
 const low=Math.min(luminance(a),luminance(b));
 return (high+.05)/(low+.05);
};
test('SIGNATURE warm text, muted labels and caramel retain high contrast on raised forest',()=>{
  for(const ink of ['#F7F0E3','#C9C6B9','#DDC091'])
    assert.ok(contrast(ink,'#22382C')>=7,ink+' lacks AA/AAA normal text contrast');
  assert.ok(contrast('#173629','#DDC091')>=7,'Client caramel journey must preserve dark ink');
});
