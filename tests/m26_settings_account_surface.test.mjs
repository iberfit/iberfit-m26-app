import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const shellUrl=new URL('../src/m26/shell/shell-render.js',import.meta.url);
const settingsSurfaceUrl=new URL('../src/m26/design/icons.css',import.meta.url);
const routeUrl=new URL('../src/m26/modules/route-render.js',import.meta.url);
const shellCssUrl=new URL('../src/m26/shell/shell.css',import.meta.url);
const rc39CssUrl=new URL('../src/m26/rc39/rc39.css',import.meta.url);

async function read(url){return readFile(url,'utf8');}

test('settings and account controls live in the sidebar footer instead of competing in the topbar',async()=>{
  const [shell,css]=await Promise.all([read(shellUrl),read(settingsSurfaceUrl)]);
  assert.match(shell,/function sidebarAccount\(vm\)[\s\S]*m26-sidebar-footer[\s\S]*\$\{settingsMenu\(vm\)\}[\s\S]*m26-sidebar-logout/u);
  assert.match(shell,/<div class="m26-topbar-actions">\$\{productivity\.launcher\}\$\{clientSelector\(vm\)\}\$\{operationStatus\(vm\.operations\)\}<\/div>/u);
  assert.doesNotMatch(shell,/m26-topbar-actions[^\n]*settingsMenu\(vm\)/u);
  assert.match(css,/\.m26-sidebar-footer \.m26-settings-menu/u);
  assert.doesNotMatch(css,/\.m26-topbar \.m26-settings-menu/u);
});

test('desktop navigation removes the duplicate settings destination semantically rather than hiding it with CSS',async()=>{
  const [shell,css]=await Promise.all([read(shellUrl),read(settingsSurfaceUrl)]);
  assert.match(shell,/map\.delete\(settingsAreaForRole\(vm\.identity\.role\)\)/u);
  assert.doesNotMatch(css,/:has\(\.m26-nav-item\[data-m26-area="ajustes"\]\)/u);
});

test('compact layouts use navigation More for Settings while preserving one semantic shell logout',async()=>{
  const [shell,css]=await Promise.all([read(shellUrl),read(settingsSurfaceUrl)]);
  assert.match(shell,/mobileAccountSlot='<div class="m26-mobile-more-account"><\/div>'/u);
  assert.match(shell,/@media\(max-width:900px\)\{\.m26-sidebar\{display:none\}/u);
  assert.equal((shell.match(/data-m26-action="logout"/gu)||[]).length,1);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*\.m26-sidebar-footer \.m26-settings-menu\{display:none\}/u);
});

test('full settings surface is grouped, spacious and keeps safe account recovery and device clearing',async()=>{
  const [route,css]=await Promise.all([read(routeUrl),read(shellCssUrl)]);
  for(const id of [
    'm26-settings-experience',
    'm26-settings-notifications',
    'm26-settings-privacy',
    'm26-settings-account',
  ])assert.match(route,new RegExp(`id="${id}"`,'u'));
  assert.match(route,/m26-settings-layout/u);
  assert.match(route,/m26-settings-rail/u);
  assert.match(route,/m26-settings-content/u);
  assert.match(route,/data-m26-action="account-password-recovery"/u);
  assert.match(route,/data-m26-action="logout-clear-device"/u);
  assert.match(css,/\.m26-settings-layout\{/u);
  assert.match(css,/grid-template-columns:minmax\(10rem,13rem\) minmax\(0,1fr\)/u);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*\.m26-settings-rail\{display:none\}/u);
});


test('tablet keeps Settings reachable for Coach and Admin while Client keeps it in Más',async()=>{
  const [rc39,route]=await Promise.all([read(rc39CssUrl),read(routeUrl)]);
  assert.match(rc39,/@media \(min-width:720px\) and \(max-width:1179px\)/u);
  assert.match(rc39,/\.m26-shell\[data-m26-role="coach"\] \.m26-sidebar-footer[\s\S]*display:block/u);
  assert.match(rc39,/\.m26-shell\[data-m26-role="admin"\] \.m26-sidebar-footer \.m26-settings-menu\{display:block!important/u);
  assert.match(rc39,/\.m26-settings-trigger-label[\s\S]*font-size:\.59rem/u);
  assert.match(rc39,/\.m26-settings-popover[\s\S]*left:6rem/u);
  assert.match(route,/CLIENT_BOTTOM_NAV_MORE_KINDS = Object\.freeze\(\['informes','actividad','mensajes','retos','ajustes'\]\)/u);
  assert.match(route,/data-m26-area="ajustes"><span>Ajustes<\/span><small>Preferencias y privacidad<\/small>/u);
});


test('tablet Coach/Admin restaura grid aunque el shell base pase a block bajo 900px',()=>{
  assert.match(
    rc39Css,
    /@media \(min-width:720px\) and \(max-width:1179px\)[\s\S]*\.m26-shell\[data-m26-role="coach"\],\.m26-shell\[data-m26-role="admin"\]\{display:grid;grid-template-columns:5\.25rem minmax\(0,1fr\)\}/,
  );
});
