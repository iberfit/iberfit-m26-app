import test from 'node:test';
import assert from 'node:assert/strict';
import {renderEvolutionReportPdf,M44_PDF_TEMPLATE,validateOfficialActivitySeries,validateOfficialReassessmentSource} from '../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js';
test('M44 server PDF renderer rejects unsigned input and missing execution evidence',async()=>{
 assert.equal(M44_PDF_TEMPLATE,'iberfit-evolution-a4-brand-v3');
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

test('M44 PDF prints the complete approved evidence collection and embeds provenance',async()=>{
 const {readFile}=await import('node:fs/promises');
 const src=await readFile(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js',import.meta.url),'utf8');
 const qa=await readFile(new URL('../qa/m44/pdf-issuer-smoke.mjs',import.meta.url),'utf8');
 assert.match(src,/source\.evidence\.entries\(\)/);
 assert.doesNotMatch(src,/source\.evidence\.slice\(0,12\)/);
 assert.match(src,/M44_PDF_EVIDENCE_VOLUME_REVIEW_REQUIRED/);
 assert.match(qa,/evidence:Array\.from\(\{length:20\}/);
 assert.match(qa,/doc\.getSubject\(\)!==sourceFingerprint/);
});


test('GX05 preview and official PDF agree on activity chronology and counts',async()=>{
 const {buildEvolutionReportHtml}=await import('../src/m26/workflows/evolution-report-document.js');
 const start='2026-10-01',end='2026-10-15';
 const basic={id:'monthly',ready:true,periodStart:start,periodEnd:end,title:'Informe',summary:'Resumen',conclusions:'Interpretación',recommendations:'Revisión',evidence:[{label:'Sesiones',text:'2 confirmadas',source:'sessionExecutions'}]};
 const valid=[{from:'2026-10-01',to:'2026-10-05',count:0},{from:'2026-10-06',to:'2026-10-15',count:2}];
 assert.equal(validateOfficialActivitySeries(valid,start,end),true);
 assert.match(buildEvolutionReportHtml({report:{...basic,activitySeries:valid}}),/Total representado: 2 sesiones confirmadas/);
 const invalid=[[{from:'2026-09-30',to:'2026-10-01',count:1}],[{from:'2026-10-01',to:'2026-10-32',count:1}],[{from:'2026-10-01',to:'2026-10-02',count:null}],[{from:'2026-10-01',to:'2026-10-02',count:'2'}],[{from:'2026-10-01',to:'2026-10-05',count:1},{from:'2026-10-05',to:'2026-10-15',count:2}],Array.from({length:14},(_,i)=>({from:'2026-10-'+String(i+1).padStart(2,'0'),to:'2026-10-'+String(i+1).padStart(2,'0'),count:1}))];
 for(const activitySeries of invalid){
  assert.equal(validateOfficialActivitySeries(activitySeries,start,end),false);
  assert.throws(()=>buildEvolutionReportHtml({report:{...basic,activitySeries}}),/ACTIVITY_INVALID/);
  await assert.rejects(()=>renderEvolutionReportPdf({source:{...basic,reportId:'11111111-1111-4111-8111-111111111111',activitySeries},pdfLib:{PDFDocument:{},StandardFonts:{},rgb:()=>{}}}),/M44_PDF_ACTIVITY_SERIES_INVALID/);
 }
});


test('GX05 official report uses public labels, civil dates and bounded chart/title geometry',async()=>{
 const calls=[];
 const font={widthOfTextAtSize:(t,size)=>t.length*size*.55};
 const pdfLib={PDFDocument:{create:async()=>({
  registerFontkit(){},embedFont:async()=>font,
  addPage:()=>({drawRectangle(){},drawLine(){},drawText(t,o){calls.push({t,...o});}}),
  setTitle(){},setCreator(){},setProducer(){},setSubject(){},setCreationDate(){},
  save:async()=>new Uint8Array(2048),
 })},StandardFonts:{TimesRomanBold:'x',HelveticaBold:'y'},rgb:()=>0};
 const source={reportId:'11111111-1111-4111-8111-111111111111',periodStart:'2026-10-01',periodEnd:'2026-10-31',
  reportType:'monthly',sourceType:'session_execution_period',clientName:'Cliente sintético',summary:'Resumen',
  conclusions:'Conclusiones',recommendations:'Próximos pasos',coachComment:'PRIVADO NO EMITIR',
  evidence:[{label:'W'.repeat(120),text:'2 sesiones',source:'sessionExecutions',quality:'confirmada'}],
  activitySeries:[{from:'2026-10-01',to:'2026-10-15',count:0},{from:'2026-10-16',to:'2026-10-31',count:2}]};
 const staticFont=new Uint8Array(1001);staticFont[1]=1;
 await renderEvolutionReportPdf({source,pdfLib,brandFonts:{inter:staticFont,serif:staticFont,interBold:staticFont,serifBold:staticFont},fontkit:{},generatedAt:'2026-11-25'});
 for(const label of ['Informe mensual','16/10','2026-10-16 a 2026-10-31','Total representado: 2','Sesiones IBERFIT confirmadas'])
  assert.ok(calls.some(row=>row.t.includes(label)),label);
 assert.ok(!calls.some(row=>row.t.includes('PRIVADO NO EMITIR')));
 const longLabels=calls.filter(row=>row.t.includes('WWWW'));
 assert.ok(longLabels.length>1);
 assert.ok(longLabels.every(row=>row.x+row.font.widthOfTextAtSize(row.t,row.size)<=553));
 assert.ok(calls.some(row=>row.t==='2'));
});


test('Signature V3 keeps all report modes, verified activity and no private Coach comment',async()=>{
 const {M44_ACCEPTED_REPLAY_TEMPLATES}=await import('../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js');
 assert.deepEqual(M44_ACCEPTED_REPLAY_TEMPLATES,['iberfit-evolution-a4-brand-v2','iberfit-evolution-a4-brand-v3']);
});

const reevaluationSource={reportId:'11111111-1111-4111-8111-111111111111',reportType:'reassessment',periodStart:'2026-10-01',periodEnd:'2026-11-20',
 clientName:'Cliente sintético',summary:'Comparación revisada',conclusions:'Interpretación profesional',recommendations:'Revisar próximos pasos',
 evidence:[{label:'Movilidad de cadena posterior · izquierda',text:'2026-10-01: -8 cm · 2026-11-20: -3 cm. Comparación profesional revisada; no acredita por sí sola un logro.',source:'gx-professional:22222222-2222-4222-8222-222222222222:1',quality:'revisada'}],activitySeries:[]};
test('reevaluation renderer requires the exact reviewed comparison shape and full envelope',async()=>{
 const src=reevaluationSource,row=src.evidence[0],pdfLib={PDFDocument:{},StandardFonts:{},rgb:()=>{}};
 assert.equal(validateOfficialReassessmentSource(src),true);
 for(const bad of [{...src,periodStart:'2026-09-30'},{...src,assessmentRevision:1},{...src,activitySeries:[{from:src.periodStart,to:src.periodEnd,count:1}]},{...src,evidence:[{...row,quality:'confirmada'}]},{...src,evidence:[{...row,text:row.text.replace('-3 cm','-3 kg')}]},{...src,evidence:[{...row,source:'gx-professional:22222222-2222-4222-8222-222222222222:2147483648'}]},{...src,evidence:[row,{...row,label:'Otro indicador'}]},{...src,evidence:[{...row,privateNote:'secret'}]}]){
  assert.equal(validateOfficialReassessmentSource(bad),false);
  await assert.rejects(()=>renderEvolutionReportPdf({source:bad,pdfLib}),/M44_PDF_REASSESSMENT_SOURCE_INVALID/);
 }
 for(const source of ['connected360:apple-coach-trends','  CONNECTED360:future-source '])await assert.rejects(()=>renderEvolutionReportPdf({source:{...src,reportType:'monthly',evidence:[{...row,source}]},pdfLib}),/M44_PDF_DEVICE_PUBLICATION_NOT_AUTHORIZED/);
});
test('reevaluation PDF uses public vocabulary and does not print internal publication UUID or private note',async()=>{
 const calls=[],font={widthOfTextAtSize:(t,size)=>t.length*size*.55};
 const pdfLib={PDFDocument:{create:async()=>({registerFontkit(){},embedFont:async()=>font,addPage:()=>({drawRectangle(){},drawLine(){},drawText(t){calls.push(t);}}),setTitle(){},setCreator(){},setProducer(){},setSubject(){},setCreationDate(){},save:async()=>new Uint8Array(2048)})},StandardFonts:{},rgb:()=>0};
 const staticFont=new Uint8Array(1001);staticFont[1]=1;
 await renderEvolutionReportPdf({source:{...reevaluationSource,coachComment:'PRIVATE-DO-NOT-EMIT'},pdfLib,brandFonts:{inter:staticFont,serif:staticFont,interBold:staticFont,serifBold:staticFont},fontkit:{},generatedAt:'2026-11-28'});
 const text=calls.join(' ');
 for(const label of ['Informe de reevaluación','Comparaciones revisadas','Comparación profesional contrastada','-8 cm','-3 cm'])assert.ok(text.includes(label),label);
 assert.doesNotMatch(text,/22222222|gx-professional:|PRIVATE-DO-NOT-EMIT/u);
});
