import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {__iriReportInternals} from '../src/m26/workflows/iri-report-document.js';

test('IRI sincroniza disabled y aria-disabled',async()=>{
  const [route,controller]=await Promise.all([
    readFile(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8'),
  ]);
  assert.match(route,/data-workflow-action="iri-prev" disabled aria-disabled="true"/);
  assert.match(controller,/previous\.disabled=disabled;previous\.setAttribute\?\.\('aria-disabled',disabled\?'true':'false'\)/);
});

test('informe IRI elimina document.write y monta DOM parseado',async()=>{
  const source=await readFile(new URL('../src/m26/workflows/iri-report-document.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/document\.write\s*\(/);
  assert.doesNotMatch(source,/document\.open\?\.\(\)/);
  assert.doesNotMatch(source,/document\.close\?\.\(\)/);
  assert.match(source,/parseFromString\(String\(html\|\|''\),'text\/html'\)/);
  assert.match(source,/doc\.importNode\(parsed\.documentElement,true\)/);
  assert.match(source,/doc\.replaceChild\(imported,doc\.documentElement\)/);
});

test('montaje IRI reemplaza el documento y falla cerrado sin parser',()=>{
  class Parser{parseFromString(html,type){assert.equal(type,'text/html');return {documentElement:{html}};}}
  const original={};
  let replacement=null;
  const document={
    documentElement:original,
    importNode(node,deep){assert.equal(deep,true);return {...node,imported:true};},
    replaceChild(next,current){assert.equal(current,original);replacement=next;},
  };
  assert.equal(__iriReportInternals.mountIriReportDocument({document,DOMParser:Parser},'<html><body>IBERFIT</body></html>'),document);
  assert.equal(replacement.imported,true);
  assert.match(replacement.html,/IBERFIT/);
  assert.throws(()=>__iriReportInternals.mountIriReportDocument({document:{documentElement:{}}},'<html></html>'),/M26_IRI_REPORT_POPUP_BLOCKED/);
});
