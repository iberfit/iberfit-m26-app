import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8').replace(/\r\n?/gu,'\n');

const html=read('public/m26/index.html');
const access=read('src/m26/app/access-ui.js');
const polish=read('src/m26/design/product-polish.css');

test('product polish remains additive and attached to the canonical surface',()=>{
  assert.match(html,/href="\/src\/m26\/design\/product-polish\.css"\s+data-iberfit-product-polish="true"/u);
  assert.match(html,/src="\/public\/isotipo-iberfit\.png"/u);
  assert.match(html,/>Entrenamiento personal con criterio<\/h1>/u);
  assert.match(polish,/IBERFIT M26 · Product polish layer/u);
  assert.doesNotMatch(polish,/https?:\/\//iu,'polish CSS must not add external dependencies');
  assert.doesNotMatch(polish,/pjhmrhejsoofmouedavw|gjztkdwfmunnzhtvxrsu/iu,'presentation layer must not know backend project refs');
});

test('access polish improves mobile form semantics without changing auth contracts',()=>{
  for(const source of [html,access]){
    assert.match(source,/name="email"[\s\S]*?inputmode="email"[\s\S]*?autocapitalize="none"[\s\S]*?spellcheck="false"/u);
    assert.match(source,/name="password"[\s\S]*?autocomplete="current-password"/u);
  }
  assert.match(access,/enterkeyhint="send"/u);
  assert.match(access,/enterkeyhint="next"/u);
  assert.match(access,/enterkeyhint="go"/u);
  assert.match(access,/enterkeyhint="done"/u);
  assert.match(access,/data-auth-form="login"/u);
  assert.match(access,/data-auth-action="forgot-password"/u);
});

test('polish preserves accessibility, responsive navigation and reduced motion',()=>{
  assert.match(polish,/\.m26-sidebar\s*\{[\s\S]*?position:\s*sticky/iu);
  assert.match(polish,/\.m26-mobile-nav[\s\S]*?safe-area-inset/iu);
  assert.match(polish,/@media\s*\(prefers-reduced-motion:\s*reduce\)/iu);
  assert.match(polish,/focus-visible/iu);
  assert.match(polish,/min-height:\s*3(?:\.0)?5rem/iu);
  assert.doesNotMatch(polish,/\.m26-main\s*\{[\s\S]{0,180}?display:\s*none/iu);
});
