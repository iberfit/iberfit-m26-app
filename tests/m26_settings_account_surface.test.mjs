import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const indexUrl=new URL('../public/m26/index.html',import.meta.url);

async function indexHtml(){return readFile(indexUrl,'utf8');}

test('settings quick access leaves the topbar on desktop and anchors to the sidebar account zone',async()=>{
  const html=await indexHtml();
  assert.match(html,/data-iberfit-settings-account-surface/u);
  assert.match(html,/data-m26-layout=\"expanded-pointer\"[^}]*\.m26-topbar \.m26-settings-menu\{position:fixed;left:1rem;bottom:/u);
  assert.match(html,/\.m26-settings-popover\{position:fixed;left:17\.35rem;right:auto;top:auto;bottom:/u);
});

test('client and coach desktop navigation do not duplicate Ajustes',async()=>{
  const html=await indexHtml();
  assert.match(html,/data-m26-role=\"coach\"[^}]*data-m26-area=\"ajustes\"\]\{display:none\}/u);
  assert.match(html,/data-m26-role=\"client\"[^}]*:has\(\.m26-nav-item\[data-m26-area=\"ajustes\"\]\)\{display:none\}/u);
});

test('compact touch removes the floating quick-settings control so mobile uses Más',async()=>{
  const html=await indexHtml();
  assert.match(html,/data-m26-layout=\"compact-touch\"[^}]*\.m26-topbar \.m26-settings-menu\{display:none\}/u);
});
