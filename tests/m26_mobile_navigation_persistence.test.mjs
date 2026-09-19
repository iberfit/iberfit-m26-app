import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/m26/index.html',import.meta.url),'utf8');
const shellCss=fs.readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');

test('mobile authenticated navigation stays viewport anchored on long routes without weakening CSP',()=>{
  assert.doesNotMatch(html,/data-iberfit-mobile-nav-critical/u);
  assert.equal([...html.matchAll(/<style\b/giu)].length,1,'authenticated navigation must not add inline CSS beyond the canonical preauth style');
  assert.match(
    shellCss,
    /\.m26-mobile-nav\s*\{[^}]*display:\s*grid;[^}]*position:\s*fixed;[^}]*left:\s*0;[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*100vw;/su,
  );
  assert.match(
    shellCss,
    /\.m26-workspace\s*\{[^}]*padding-bottom:\s*calc\(var\(--iberfit-ux-mobile-nav,\s*4\.35rem\)\s*\+\s*env\(safe-area-inset-bottom\)\);/su,
  );
  assert.doesNotMatch(
    shellCss,
    /\.m26-mobile-nav\s*\{[^}]*position:\s*relative/su,
    'later mobile rules must never move the persistent rail back into document flow',
  );
});
