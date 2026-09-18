import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/m26/index.html',import.meta.url),'utf8');

test('mobile authenticated navigation stays viewport anchored on long routes',()=>{
  assert.match(html,/data-iberfit-mobile-nav-critical/u);
  assert.match(
    html,
    /\.m26-shell\s*>\s*\.m26-workspace\s*>\s*\.m26-mobile-nav\s*\{[^}]*position:\s*fixed\s*!important;[^}]*bottom:\s*0;[^}]*width:\s*100%;/su,
  );
  assert.match(
    html,
    /\.m26-shell\s*>\s*\.m26-workspace\s*\{[^}]*padding-bottom:\s*calc\(var\(--iberfit-ux-mobile-nav,\s*4\.35rem\)\s*\+\s*env\(safe-area-inset-bottom\)\);/su,
  );
  const critical=html.match(/<style data-iberfit-mobile-nav-critical>([\s\S]*?)<\/style>/u)?.[1]||'';
  assert.equal((critical.match(/!important/gu)||[]).length,1,'critical mobile rail has one narrow cascade override');
});
