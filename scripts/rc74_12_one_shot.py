from pathlib import Path


def replace_once_or_verify(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old in text:
        if text.count(old) != 1:
            raise SystemExit(f'PATCH_CONTRACT_FAILED:{path}:old_count={text.count(old)}')
        p.write_text(text.replace(old, new, 1), encoding='utf-8')
        return
    if new not in text:
        raise SystemExit(f'PATCH_CONTRACT_FAILED:{path}:anchor_missing')


replace_once_or_verify(
    'src/m26/modules/route-render.js',
    '<button type="button" data-workflow-action="iri-prev" disabled>Anterior</button>',
    '<button type="button" data-workflow-action="iri-prev" disabled aria-disabled="true">Anterior</button>',
)

replace_once_or_verify(
    'src/m26/app/workflow-controller.js',
    '    const previous=form.querySelector?.(\'[data-workflow-action="iri-prev"]\');if(previous)previous.disabled=bounded===0;\n',
    '    const previous=form.querySelector?.(\'[data-workflow-action="iri-prev"]\');if(previous){const disabled=bounded===0;previous.disabled=disabled;previous.setAttribute?.(\'aria-disabled\',disabled?\'true\':\'false\');}\n',
)

report = Path('src/m26/workflows/iri-report-document.js')
text = report.read_text(encoding='utf-8')
helper_anchor = "export function prepareIriReportPrintTarget(openWindow=globalThis.open){\n"
helper = """function mountIriReportDocument(popup,html){
  const doc=popup?.document;
  const Parser=popup?.DOMParser||doc?.defaultView?.DOMParser||globalThis.DOMParser;
  if(!doc?.documentElement||typeof Parser!=='function'||typeof doc.importNode!=='function'||typeof doc.replaceChild!=='function')throw new Error('M26_IRI_REPORT_POPUP_BLOCKED');
  const parsed=new Parser().parseFromString(String(html||''),'text/html');
  if(!parsed?.documentElement)throw new Error('M26_IRI_REPORT_RENDER_FAILED');
  const imported=doc.importNode(parsed.documentElement,true);
  doc.replaceChild(imported,doc.documentElement);
  return doc;
}
"""
if 'function mountIriReportDocument(' not in text:
    if text.count(helper_anchor) != 1:
        raise SystemExit('PATCH_CONTRACT_FAILED:report-helper-anchor')
    text = text.replace(helper_anchor, helper + helper_anchor, 1)

legacy = """  const popup=printTarget||prepareIriReportPrintTarget(openWindow);
  if(!popup?.document||typeof popup.document.write!=='function')throw new Error('M26_IRI_REPORT_POPUP_BLOCKED');
  try{
    popup.document.open?.();
    popup.document.write(directIriReportHtml(html,variant));
    popup.document.close?.();
    bindDirectIriReportWindow(popup);
  }catch(error){try{popup.close?.();}catch{}throw error;}
"""
modern = """  const popup=printTarget||prepareIriReportPrintTarget(openWindow);
  if(!popup?.document)throw new Error('M26_IRI_REPORT_POPUP_BLOCKED');
  try{
    mountIriReportDocument(popup,directIriReportHtml(html,variant));
    bindDirectIriReportWindow(popup);
  }catch(error){try{popup.close?.();}catch{}throw error;}
"""
if legacy in text:
    if text.count(legacy) != 1:
        raise SystemExit('PATCH_CONTRACT_FAILED:report-legacy-block')
    text = text.replace(legacy, modern, 1)
elif modern not in text:
    raise SystemExit('PATCH_CONTRACT_FAILED:report-render-anchor')

if 'document.write' in text or 'document.open?.()' in text or 'document.close?.()' in text:
    raise SystemExit('PATCH_CONTRACT_FAILED:legacy-api-remains')

internals_old = 'waitForReportAssets,bindDirectIriReportWindow,rawDataPages});'
internals_new = 'waitForReportAssets,bindDirectIriReportWindow,mountIriReportDocument,rawDataPages});'
if internals_old in text:
    if text.count(internals_old) != 1:
        raise SystemExit('PATCH_CONTRACT_FAILED:report-internals')
    text = text.replace(internals_old, internals_new, 1)
elif internals_new not in text:
    raise SystemExit('PATCH_CONTRACT_FAILED:report-internals-anchor')
report.write_text(text, encoding='utf-8')

test = Path('tests/m26_rc74_12_iri_a11y_report_render.test.mjs')
if not test.exists():
    test.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {__iriReportInternals} from '../src/m26/workflows/iri-report-document.js';

test('IRI sincroniza disabled y aria-disabled',async()=>{
  const [route,controller]=await Promise.all([
    readFile(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8'),
  ]);
  assert.match(route,/data-workflow-action=\"iri-prev\" disabled aria-disabled=\"true\"/);
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
""", encoding='utf-8')
