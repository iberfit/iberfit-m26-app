import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {navigationForRole} from '../src/m26/shell/navigation.js';
import {
  IBERFIT_LUCIDE_VERSION,
  areaIconName,
  renderIberfitIcon,
  iconRegistryAudit,
} from '../src/m26/design/icons.js';
import {IBERFIT_DESIGN_TOKENS} from '../src/m26/design/tokens.generated.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const index=read('public/m26/index.html');
const typography=read('src/m26/design/typography.css');
const iconCss=read('src/m26/design/icons.css');
const shellRender=read('src/m26/shell/shell-render.js');
const provenance=read('third_party/RC58_2_ASSET_PROVENANCE.md');
const lucideLicense=read('third_party/lucide-1.27.0-LICENSE.txt');
const interLicense=read('third_party/inter-OFL-1.1.txt');
const sourceSerifLicense=read('third_party/source-serif-4-OFL-1.1.txt');

test('fonts son locales y no existe dependencia CDN runtime',()=>{
  const inter='public/m26/fonts/inter-latin-wght-normal.woff2';
  const serif='public/m26/fonts/source-serif-4-latin-wght-normal.woff2';
  assert.ok(fs.statSync(inter).size>20_000);
  assert.ok(fs.statSync(serif).size>20_000);
  assert.match(typography,/\/m26\/fonts\/inter-latin-wght-normal\.woff2/);
  assert.match(typography,/\/m26\/fonts\/source-serif-4-latin-wght-normal\.woff2/);
  assert.match(typography,/font-display:\s*swap/);
  assert.doesNotMatch(typography,/https?:\/\/|@import/i);
  assert.doesNotMatch(index,/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg/i);
  assert.doesNotMatch(index,/rel="preload" href="\/m26\/fonts\/inter-latin-wght-normal\.woff2"/);
  assert.match(index,/href="\/src\/m26\/design\/typography\.css"[^>]*data-iberfit-full-style[^>]*media="not all"/);
});

test('tokens usan Inter Variable y Source Serif 4 Variable con fallback',()=>{
  assert.match(IBERFIT_DESIGN_TOKENS.typography.family.ui,/Inter Variable/);
  assert.match(IBERFIT_DESIGN_TOKENS.typography.family.editorial,/Source Serif 4 Variable/);
  assert.match(IBERFIT_DESIGN_TOKENS.typography.family.ui,/system-ui/);
  assert.match(IBERFIT_DESIGN_TOKENS.typography.family.editorial,/Georgia/);
});

test('Lucide local cubre toda navegación Cliente Coach Admin',()=>{
  assert.equal(IBERFIT_LUCIDE_VERSION,'1.27.0');
  assert.equal(iconRegistryAudit().ok,true);
  for(const role of ['client','coach','admin']){
    const nav=navigationForRole(role);
    const items=[...nav.primary,...nav.context,...nav.tools,...nav.mobile];
    for(const item of items){
      const name=areaIconName(item.key);
      assert.ok(name,`icon missing ${role}:${item.key}`);
      const svg=renderIberfitIcon(name,{className:'m26-nav-icon'});
      assert.match(svg,/^<svg/);
      assert.match(svg,/aria-hidden="true"/);
      assert.doesNotMatch(svg,/<script|foreignObject|on[a-z]+\s*=|(?:href|src)\s*=/i);
    }
  }
});

test('icono con significado propio exige label explícito y escapa atributos',()=>{
  const svg=renderIberfitIcon('shield-check',{className:'x" onclick="evil',label:'Seguro " ahora'});
  assert.match(svg,/role="img"/);
  assert.match(svg,/aria-label="Seguro &quot; ahora"/);
  assert.doesNotMatch(svg,/ onclick=/);
});

test('shell conserva etiquetas internacionalizables y añade iconografía decorativa',()=>{
  assert.match(shellRender,/areaIconName\(item\.key\)/);
  assert.match(shellRender,/renderIberfitIcon/);
  assert.match(shellRender,/const label=areaText\(item,'label'\)/);
  assert.match(shellRender,/<span>\$\{escapeHtml\(label\)\}<\/span>/);
  assert.match(iconCss,/\.m26-nav-item/);
  assert.match(iconCss,/\.m26-nav-icon/);
});

test('licencias y provenance están versionadas',()=>{
  assert.match(lucideLicense,/ISC License/);
  assert.match(interLicense,/SIL OPEN FONT LICENSE/i);
  assert.match(sourceSerifLicense,/SIL OPEN FONT LICENSE/i);
  assert.match(provenance,/LUCIDE_VERSION=1\.27\.0/);
  assert.match(provenance,/INTER_PACKAGE_VERSION=5\.3\.0/);
  assert.match(provenance,/SOURCE_SERIF_4_PACKAGE_VERSION=5\.3\.0/);
  assert.match(provenance,/RUNTIME_REMOTE_FONT_REQUESTS=FALSE/);
});