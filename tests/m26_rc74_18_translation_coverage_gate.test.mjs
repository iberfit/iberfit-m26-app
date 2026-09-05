import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  analyzeIberfitTranslationCoverage,
  assertIberfitTranslationCoverage,
} from '../scripts/lib/m26_translation_coverage.mjs';
import {
  IBERFIT_LANGUAGE_CATALOG,
  iberfitLanguageOptions,
  iberfitTranslationCoverage,
} from '../src/m26/ui/i18n.js';

const source=fs.readFileSync(new URL('../src/m26/ui/i18n.js',import.meta.url),'utf8');

test('RC74.18 mide cobertura real de los cuatro catálogos contra la referencia española',()=>{
  const report=assertIberfitTranslationCoverage(source);
  assert.equal(report.complete,true);
  assert.deepEqual(report.reports.map(({language,complete})=>({language,complete})),[
    {language:'es',complete:true},
    {language:'en',complete:true},
    {language:'fr',complete:true},
    {language:'pt',complete:true},
  ]);
  assert.ok(report.referenceKeys.length>50);
  for(const language of report.reports){
    assert.equal(language.missing.length,0);
    assert.equal(language.extra.length,0);
    assert.equal(language.blank.length,0);
    assert.equal(language.translated,language.total);
  }
});

test('RC74.18 runtime y gate estático comparten la misma verdad de cobertura',()=>{
  assert.doesNotMatch(source,/\bcomplete\s*:\s*true\b/u);
  assert.equal(IBERFIT_LANGUAGE_CATALOG.some((item)=>Object.hasOwn(item,'complete')),false);
  const staticReport=assertIberfitTranslationCoverage(source);
  const runtime=iberfitTranslationCoverage();
  assert.deepEqual(runtime.map(({language,complete,total,translated})=>({language,complete,total,translated})),staticReport.reports.map(({language,complete,total,translated})=>({language,complete,total,translated})));
});

test('RC74.18 el gate falla de forma cerrada si un idioma pierde una clave',()=>{
  const broken=source.replace("'settings.privacy':'Privacy',",'');
  const report=analyzeIberfitTranslationCoverage(broken);
  const english=report.reports.find((item)=>item.language==='en');
  assert.deepEqual(english.missing,['settings.privacy']);
  assert.equal(english.complete,false);
  assert.throws(()=>assertIberfitTranslationCoverage(broken),/M26_TRANSLATION_COVERAGE_INCOMPLETE/);
});

test('RC74.18 locales declarados son válidos para Intl y los cuatro idiomas siguen disponibles',()=>{
  assert.deepEqual(iberfitLanguageOptions().map((item)=>item.value),['es','en','fr','pt']);
  for(const language of IBERFIT_LANGUAGE_CATALOG){
    for(const locale of language.locales){
      assert.doesNotThrow(()=>new Intl.DateTimeFormat(locale).format(new Date('2026-09-04T12:00:00Z')));
      assert.doesNotThrow(()=>new Intl.NumberFormat(locale).format(1234.5));
    }
  }
});
