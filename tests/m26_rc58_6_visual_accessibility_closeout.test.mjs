import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

const clientNav=read('src/m26/ui/client-bottom-nav.css');
const shell=read('src/m26/shell/shell.css');
const report=read('public/m26/iri-report.css');
const sw=read('public/m26/sw.js');
const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
const closeout=read('docs/RC58_6_VISUAL_ACCESSIBILITY_CLOSEOUT.md');

test('RC58.6 restaura foco visible de teclado en navegacion Cliente',()=>{
  assert.doesNotMatch(
    clientNav,
    /:focus-visible\s*\{[^}]*outline\s*:\s*(?:0|none)/gu
  );

  assert.match(
    clientNav,
    /\.m26-client-bottom-nav-item:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--iberfit-color-focus,\s*#f2dca8\);[^}]*outline-offset:\s*3px;/u
  );

  assert.match(
    clientNav,
    /\.m26-client-bottom-nav-menu button:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--iberfit-color-focus,\s*#f2dca8\);[^}]*outline-offset:\s*3px;/u
  );
});

test('RC58.6 mantiene touch target minimo en controles IRI interactivos',()=>{
  assert.match(
    shell,
    /\.m26-timer-actions button\{[^}]*min-height:var\(--m26-touch-target,44px\)/u
  );

  assert.match(
    report,
    /\.iri-report-toolbar button\{[^}]*min-height:44px/u
  );

  assert.match(
    report,
    /\.iri-report-error button\{[^}]*min-height:44px/u
  );
});

test('RC58.6 da foco explicito a controles independientes del informe',()=>{
  assert.match(
    report,
    /\.iri-report-toolbar button:focus-visible,.iri-report-error button:focus-visible\{outline:3px solid #f2dca8;outline-offset:3px\}/u
  );
});

test('RC58.6 conserva foco en forced colors sin depender de sombras',()=>{
  assert.match(clientNav,/@media \(forced-colors: active\)/u);
  assert.match(clientNav,/outline:\s*3px solid Highlight/u);
  assert.match(report,/@media \(forced-colors:active\)/u);
  assert.match(report,/outline-color:Highlight/u);
});

test('RC58.6 invalida cache PWA anterior y conserva genealogia',()=>{
  assert.match(sw,/m26-rc58-6/u);
  assert.match(sw,/m26-rc58-5c-b/u);
  assert.doesNotMatch(sw,/const VERSION='m26-rc58-6'/u);
});

test('RC58.6 cierra RC58 sin mezclar rails posteriores',()=>{
  assert.match(roadmap,/RC58=CLOSED_RC58_6_VISUAL_ACCESSIBILITY/u);
  assert.match(closeout,/RC58_6_VISUAL_ACCESSIBILITY_CLOSEOUT=PASS/u);
  assert.match(closeout,/BUSINESS_LOGIC_CHANGED=FALSE/u);
  assert.match(closeout,/PRODUCTION_TOUCHED=FALSE/u);
  assert.match(closeout,/SUPABASE_TOUCHED=FALSE/u);
  assert.match(closeout,/CANARY_REMOTE_TOUCHED=FALSE/u);
  assert.match(closeout,/COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE/u);
});