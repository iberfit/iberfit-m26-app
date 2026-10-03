import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guided=fs.readFileSync(new URL('../src/m26/onboarding/guided-tour.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const shell=fs.readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('mobile guided tour clears the bottom navigation and stays below the open Más stacking context',()=>{
  const tourRule=guided.match(/@media\(max-width:900px\)\{\.m26-guided-tour\{z-index:(\d+);bottom:calc\(var\(--iberfit-ux-mobile-nav,4\.35rem\) \+ env\(safe-area-inset-bottom\) \+ \.75rem\)\}\}/u);
  assert.ok(tourRule,'el Genio móvil debe respetar la altura de la navegación inferior');

  const baseNavRule=shell.match(/\.m26-mobile-nav\s*\{\s*z-index:\s*(\d+);\s*isolation:\s*isolate;\s*\}/u);
  assert.ok(baseNavRule,'la navegación móvil cerrada debe mantener su stacking context normal');

  const openNavRule=shell.match(/\.m26-mobile-nav:has\(\.m26-mobile-more\[open\]\)\s*\{\s*z-index:\s*(\d+);\s*\}/u);
  assert.ok(openNavRule,'la navegación móvil debe elevarse sólo cuando Más está abierto');

  const menuRule=shell.match(/\.m26-mobile-more-menu\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*(\d+);[^}]*\}/su);
  assert.ok(menuRule,'Más debe conservar una capa explícita dentro del stacking context elevado');

  const guidedTourZ=Number(tourRule[1]);
  const baseNavZ=Number(baseNavRule[1]);
  const openNavZ=Number(openNavRule[1]);
  const menuZ=Number(menuRule[1]);
  assert.ok([guidedTourZ,baseNavZ,openNavZ,menuZ].every(Number.isFinite));
  assert.ok(baseNavZ<guidedTourZ,'el Genio debe seguir por encima de la barra móvil cuando Más está cerrado');
  assert.ok(openNavZ>guidedTourZ,'Más debe elevar todo su stacking context por encima del Genio mientras está abierto');
  assert.ok(menuZ>0,'el menú debe conservar una capa interna explícita');

  assert.doesNotMatch(
    guided,
    /@media\(max-width:719px\)\{\.m26-guided-tour\{[^}]*bottom:/u,
    'el breakpoint estrecho no debe volver a colocar el Genio sobre la navegación',
  );
});
