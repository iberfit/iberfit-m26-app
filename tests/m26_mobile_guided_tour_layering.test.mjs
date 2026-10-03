import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const guided=fs.readFileSync(new URL('../src/m26/onboarding/guided-tour.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const runtimeStatic=fs.readFileSync(new URL('../src/m26/design/runtime-static.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const shell=fs.readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const rc39=fs.readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('mobile guided tour clears the bottom navigation and stays below the effective open Más stacking context',()=>{
  const sourceTourRule=guided.match(/@media\(max-width:900px\)\{\.m26-guided-tour\{z-index:(\d+);bottom:calc\(var\(--iberfit-ux-mobile-nav,4\.35rem\) \+ env\(safe-area-inset-bottom\) \+ \.75rem\)\}\}/u);
  assert.ok(sourceTourRule,'el Genio móvil canónico debe respetar la altura de la navegación inferior');

  const staticTourRule=runtimeStatic.match(/@media\(max-width:900px\)\{\.m26-guided-tour\{z-index:(\d+);bottom:calc\(var\(--iberfit-ux-mobile-nav,4\.35rem\) \+ env\(safe-area-inset-bottom\) \+ \.75rem\)\}\}/u);
  assert.ok(staticTourRule,'runtime-static.css debe conservar el mismo contrato móvil que el módulo canónico');

  const narrowStaticRule=runtimeStatic.match(/@media\(max-width:719px\)\{\.m26-guided-tour\{([^}]*)\}/u);
  assert.ok(narrowStaticRule,'runtime-static.css debe conservar el breakpoint estrecho del Genio');
  assert.doesNotMatch(
    narrowStaticRule[1],
    /(?:^|;)bottom:/u,
    'el breakpoint estrecho no debe volver a colocar el Genio sobre la navegación',
  );

  const baseNavRule=shell.match(/\.m26-mobile-nav\s*\{\s*z-index:\s*(\d+);\s*isolation:\s*isolate;\s*\}/u);
  assert.ok(baseNavRule,'la navegación móvil cerrada debe mantener su stacking context normal');

  const canonicalOpenNavRule=shell.match(/\.m26-mobile-nav:has\(\.m26-mobile-more\[open\]\)\s*\{\s*z-index:\s*(\d+);\s*\}/u);
  assert.ok(canonicalOpenNavRule,'la navegación móvil canónica debe elevarse sólo cuando Más está abierto');

  const effectiveOpenNavRule=rc39.match(/\.m26-shell\[data-m26-mobile-more-open="true"\]\s*>\s*\.m26-workspace\s*>\s*\.m26-mobile-nav\s*\{[^}]*z-index:\s*(\d+)\s*!important;/su);
  assert.ok(effectiveOpenNavRule,'la capa RC39 más específica debe preservar la prioridad real del menú abierto');

  const effectiveMenuRule=rc39.match(/\.m26-shell\[data-m26-mobile-more-open="true"\]\s+\.m26-mobile-more\[open\]\s+\.m26-mobile-more-menu\s*\{[^}]*z-index:\s*(\d+);/su);
  assert.ok(effectiveMenuRule,'la hoja Más debe conservar una capa interna explícita');

  const sourceTourZ=Number(sourceTourRule[1]);
  const staticTourZ=Number(staticTourRule[1]);
  const baseNavZ=Number(baseNavRule[1]);
  const canonicalOpenNavZ=Number(canonicalOpenNavRule[1]);
  const effectiveOpenNavZ=Number(effectiveOpenNavRule[1]);
  const effectiveMenuZ=Number(effectiveMenuRule[1]);
  assert.ok([sourceTourZ,staticTourZ,baseNavZ,canonicalOpenNavZ,effectiveOpenNavZ,effectiveMenuZ].every(Number.isFinite));

  assert.equal(staticTourZ,sourceTourZ,'el CSS estático desplegado no puede divergir del contrato canónico del Genio');
  assert.equal(effectiveOpenNavZ,canonicalOpenNavZ,'una capa más específica no debe rebajar el z-index canónico de Más');
  assert.ok(baseNavZ<staticTourZ,'el Genio debe seguir por encima de la barra móvil cuando Más está cerrado');
  assert.ok(effectiveOpenNavZ>staticTourZ,'Más debe quedar realmente por encima del Genio cuando está abierto');
  assert.ok(effectiveMenuZ>effectiveOpenNavZ,'la hoja Más debe quedar por encima de su propia barra de navegación');
});
