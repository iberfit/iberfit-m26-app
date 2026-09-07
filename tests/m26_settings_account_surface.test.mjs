import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const indexUrl=new URL('../public/m26/index.html',import.meta.url);

async function indexHtml(){return readFile(indexUrl,'utf8');}

test('settings quick access leaves the topbar on desktop and anchors to the sidebar account zone',async()=>{
  const html=await indexHtml();
  assert.ok(html.includes('data-iberfit-settings-account-surface'));
  assert.ok(html.includes('.m26-shell[data-m26-layout="expanded-pointer"] .m26-topbar .m26-settings-menu{position:fixed;left:1rem;bottom:'));
  assert.ok(html.includes('.m26-shell[data-m26-layout="expanded-pointer"] .m26-settings-popover{position:fixed;left:17.35rem;right:auto;top:auto;bottom:'));
});

test('client and coach desktop navigation do not duplicate Ajustes',async()=>{
  const html=await indexHtml();
  assert.ok(html.includes('[data-m26-role="coach"] .m26-sidebar .m26-nav-item[data-m26-area="ajustes"]{display:none}'));
  assert.ok(html.includes('[data-m26-role="client"] .m26-sidebar .m26-nav-group:has(.m26-nav-item[data-m26-area="ajustes"]){display:none}'));
});

test('compact touch removes the floating quick-settings control so mobile uses Más',async()=>{
  const html=await indexHtml();
  assert.ok(html.includes('.m26-shell[data-m26-layout="compact-touch"] .m26-topbar .m26-settings-menu{display:none}'));
});
