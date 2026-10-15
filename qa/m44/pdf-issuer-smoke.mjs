import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import {renderEvolutionReportPdf,M44_PDF_TEMPLATE} from '../../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js';

const source={
 reportId:'11111111-1111-4111-8111-111111111111',
 clientId:'22222222-2222-4222-8222-222222222222',
 revision:3,clientName:'Persona QA - IBERFIT',
 reportType:'monthly',periodStart:'2026-09-15',periodEnd:'2026-10-15',
 summary:'Historial confirmado. No atribuimos mejoria sin mediciones comparables. '.repeat(30),
 conclusions:'Interpretacion profesional fundada en registros verificables. '.repeat(35),
 recommendations:'Mantener trabajo progresivo y acordar la siguiente sesion con Coach. '.repeat(25),
 evidence:Array.from({length:12},(_,i)=>({
  label:'Registro verificado '+(i+1),
  text:'Evidencia de entrenamiento confirmada. '.repeat(14),
  source:'sessionExecutions',quality:'confirmada',
 })),
 activitySeries:Array.from({length:13},(_,i)=>({
  from:'2026-10-'+String(i+1).padStart(2,'0'),
  to:'2026-10-'+String(i+2).padStart(2,'0'),
  count:i%3,
 })),
};
const result=await renderEvolutionReportPdf({
 source,pdfLib:{PDFDocument,StandardFonts,rgb},fontkit,
 brandFonts:{
  inter:await Deno.readFile('public/m26/fonts/inter-latin-wght-normal.woff2'),
  serif:await Deno.readFile('public/m26/fonts/source-serif-4-latin-wght-normal.woff2'),
 },
 generatedAt:'2026-10-15T12:00:00.000Z',
});
if(!(result.bytes instanceof Uint8Array)||result.bytes.length<1024||
 !new TextDecoder().decode(result.bytes.slice(0,8)).startsWith('%PDF-'))throw Error('M44_RENDERED_BYTES_NOT_A_PDF');
const doc=await PDFDocument.load(result.bytes);
const pages=doc.getPages();
if(pages.length!==result.pages||pages.length<5)throw Error('M44_PDF_PAGINATION_MISMATCH');
if(result.templateVersion!==M44_PDF_TEMPLATE)throw Error('M44_PDF_TEMPLATE_MISMATCH');
if(!String(doc.getTitle()||'').includes('IBERFIT'))throw Error('M44_PDF_BRANDING_NOT_PRESENT');
const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',result.bytes));
if(digest.length!==32)throw Error('M44_PDF_HASH_INVALID');
console.log(JSON.stringify({ok:true,report:'synthetic only',
 pages:pages.length,bytes:result.bytes.length,sha256Bytes:digest.length,template:M44_PDF_TEMPLATE}));
