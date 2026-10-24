import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/m26/library/exercise-media-ui.js',import.meta.url),'utf8');
const rule=css.split('/* SIGNATURE_COACH_B9_MEDIA_CONTRAST_BEGIN */')[1]?.split('/* SIGNATURE_COACH_B9_MEDIA_CONTRAST_END */')[0]||'';
function contrast(hex1,hex2){
  const lum=hex=>{
    const channels=[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)/255)
      .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
    return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
  };
  const a=lum(hex1),b=lum(hex2);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
test('B9 Coach media fallback uses accessible 4.5:1 text contrast rather than pale gold on gold',()=>{
  assert.ok(rule.length>600);
  const sections=rule.split('}');
  const main=sections.find(s=>s.includes('.m26-exercise-media-fallback{'))||'';
  const span=sections.find(s=>s.includes('.m26-exercise-media-fallback span{'))||'';
  const small=sections.find(s=>s.includes('.m26-exercise-media-fallback small{'))||'';
  const bg=main.match(/background-color:(#[0-9a-f]{6})/iu)?.[1];
  const title=span.match(/color:(#[0-9a-f]{6})/iu)?.[1];
  const caption=small.match(/color:(#[0-9a-f]{6})/iu)?.[1];
  assert.ok(bg&&title&&caption,'Explicit forest/cream palette required');
  assert.ok(contrast(bg,title)>=4.5,'Title contrast must be AA: '+contrast(bg,title));
  assert.ok(contrast(bg,caption)>=4.5,'Caption contrast must be AA: '+contrast(bg,caption));
  assert.match(main,/border:1px dashed/u);
  assert.doesNotMatch(rule,/!important|display:\s*none|visibility:\s*hidden|opacity:\s*0(?:[;}\s]|$)/u);
});
test('B9 only styles missing-image Coach Builder placeholders, preserving real images',()=>{
  assert.match(rule,/\.m26-shell\[data-m26-role="coach"\] \.m26-session-builder-v2 \.m26-exercise-media-fallback/u);
  assert.doesNotMatch(rule,/\.m26-exercise-media(?:\s|>|\{|,)|\bimg\s*\{/u);
  assert.match(source,/class="m26-exercise-media-fallback/u);
  assert.match(source,/role="img" aria-label="Sin referencia visual validada para/u);
  assert.match(source,/Sin referencia visual/u);
  assert.match(rule,/@media\(forced-colors:active\)/u);
  assert.match(rule,/color:CanvasText/u);
});
