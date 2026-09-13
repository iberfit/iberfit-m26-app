import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync('src/m26/shell/shell-render.js','utf8');
const brand=fs.readFileSync('src/m26/design/brand-vision.css','utf8');

test('settings trigger never concatenates the active locale with Ajustes',()=>{
  assert.match(shell,/m26-settings-trigger/u);
  assert.match(shell,/m26-settings-trigger-label/u);
  assert.doesNotMatch(shell,/m26-language-mini/u);
});

test('workspace shortcut hierarchy is external CSS and separates title from supporting copy',()=>{
  assert.match(brand,/IBERFIT PREMIUM UI CRITICAL PHASE 1/u);
  assert.match(brand,/\.m26-shell \.m26-workspace-actions\{[\s\S]*?display:grid;/u);
  assert.match(brand,/\.m26-shell \.m26-workspace-action\{[\s\S]*?grid-template-columns:auto minmax\(0,1fr\) auto;/u);
  assert.match(brand,/\.m26-shell \.m26-workspace-action > span:nth-child\(2\)\{[\s\S]*?flex-direction:column;/u);
  assert.match(brand,/\.m26-shell \.m26-workspace-action > span:nth-child\(2\) > strong,[\s\S]*?display:block;/u);
});

test('Admin Command Center dark bands use explicit high-contrast text',()=>{
  assert.match(brand,/\.m30-admin-command-route > \.m26-admin-hero,[\s\S]*?\.m30-admin-decision-center\{[\s\S]*?color:#f8f2e6 !important;/u);
  assert.match(brand,/\.m30-admin-decision-center :is\(h1,h2,h3,strong\)\{[\s\S]*?color:#fffaf0 !important;/u);
  assert.match(brand,/\.m30-admin-decision-center :is\(p,small\)\{[\s\S]*?rgba\(248,242,230,.74\) !important;/u);
});

test('critical workspace and settings behavior no longer depends only on inline style execution',()=>{
  for(const token of [
    '.m26-settings-menu',
    '.m26-settings-popover',
    '.m26-workspace-home',
    '.m26-workspace-actions',
    '.m26-workspace-action',
  ])assert.ok(brand.includes(token),`missing external critical selector: ${token}`);
});
