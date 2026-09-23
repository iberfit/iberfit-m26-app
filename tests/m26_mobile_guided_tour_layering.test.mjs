import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guided=fs.readFileSync(new URL('../src/m26/onboarding/guided-tour.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const shell=fs.readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('mobile guided tour clears the bottom navigation and stays below the Más sheet',()=>{
  const tourRule=guided.match(/@media\(max-width:900px\)\{\.m26-guided-tour\{z-index:(\d+);bottom:calc\(var\(--iberfit-ux-mobile-nav,4\.35rem\) \+ env\(safe-area-inset-bottom\) \+ \.75rem\)\}\}/u);
  assert.ok(tourRule,'el Genio móvil debe respetar la altura de la navegación inferior');

  const menuRule=shell.match(/\.m26-mobile-more-menu\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*(\d+);[^}]*\}/su);
  assert.ok(menuRule,'Más debe conservar una capa móvil explícita');

  const guidedTourZ=Number(tourRule[1]);
  const mobileMoreZ=Number(menuRule[1]);
  assert.ok(Number.isFinite(guidedTourZ)&&Number.isFinite(mobileMoreZ));
  assert.ok(guidedTourZ<mobileMoreZ,'Más debe quedar por encima del Genio mientras está abierto');

  assert.doesNotMatch(
    guided,
    /@media\(max-width:719px\)\{\.m26-guided-tour\{[^}]*bottom:/u,
    'el breakpoint estrecho no debe volver a colocar el Genio sobre la navegación',
  );
});
