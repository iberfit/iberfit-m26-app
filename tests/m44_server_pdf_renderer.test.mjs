import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEvolutionReportPdf,M44_PDF_TEMPLATE} from '../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js';
test('M44 server PDF renderer rejects unsigned input and missing execution evidence',async()=>{
 assert.equal(M44_PDF_TEMPLATE,'iberfit-evolution-a4-brand-v2');
 await assert.rejects(()=>renderEvolutionReportPdf({}),/M44_PDF_RENDER_INPUT_INVALID/);
 await assert.rejects(()=>renderEvolutionReportPdf({source:{},pdfLib:{PDFDocument:{},StandardFonts:{},rgb:()=>{}}}),
  /M44_PDF_SOURCE_NOT_CANONICAL/);
});
test('M44 server PDF is composed exclusively from public snapshot fields',async()=>{
 const {readFile}=await import('node:fs/promises');
 const s=await readFile(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js',import.meta.url),'utf8');
 assert.doesNotMatch(s,/source\.coachComment/);
 for(const key of ['source.summary','source.conclusions','source.recommendations','source.evidence','source.activitySeries'])
 assert.ok(s.includes(key),key);
 assert.match(s,/No se rellenan mediciones ausentes/);
});


test('M44 official PDF cannot be emitted with fallback typographic system',async()=>{
 const {readFile}=await import('node:fs/promises');
 const src=await readFile(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js',import.meta.url),'utf8');
 assert.match(src,/M44_PDF_BRAND_FONTS_REQUIRED/);
 assert.match(src,/doc\.registerFontkit\(fontkit\)/);
 assert.match(src,/doc\.embedFont\(brandFonts\.inter/);
 assert.match(src,/doc\.embedFont\(brandFonts\.serif/);
});
