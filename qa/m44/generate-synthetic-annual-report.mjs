// Reproducible synthetic sample, no hosted authentication, DB or Edge calls.
// The public snapshot is derived from the exact production report model.
import {PDFDocument,StandardFonts,rgb} from 'npm:pdf-lib@1.17.1';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import {buildPremiumReportPortfolio} from '../../src/m26/workflows/report-workflow.js';
import {renderEvolutionReportPdf,M44_PDF_TEMPLATE} from '../../supabase/functions/iberfit-evolution-report-emission-v1/pdf-renderer.js';
const clientId='22222222-2222-4222-8222-222222222222',reportId='11111111-1111-4111-8111-111111111111';
const now=new Date('2026-11-25T15:00:00.000Z');
const end=Date.parse('2026-11-25T12:00:00.000Z'),DAY=86400000;
const sessionExecutions=[],appointments=[],checkins=[];
for(let i=0;i<104;i++){
 const completedAt=new Date(end-(364-Math.floor(i*364/103))*DAY).toISOString();
 const appointmentId='demo-appointment-'+i;
 const loadKg=35+Math.floor(i/13)*2.5;
 const rows=[['squat',loadKg],['press',25+Math.floor(i/13)*2.5],['row',30+Math.floor(i/13)*2.5]];
 const results=Object.fromEntries(rows.flatMap(([exerciseId,kg])=>Array.from({length:3},(_,set)=>[exerciseId+'-'+set,{exerciseId,setNumber:set+1,reps:8,loadKg:kg,rpe:7,completed:true}])));
 appointments.push({id:appointmentId,clientId,status:'completed',scheduledAt:completedAt});
 sessionExecutions.push({id:'demo-execution-'+i,clientId,sessionId:'demo-plan',appointmentId,status:'completed',syncStatus:'clean',completedAt,title:'Entrenamiento de fuerza',results});
 if(i%2===0)checkins.push({id:'demo-checkin-'+i,clientId,createdAt:completedAt,energy:7,sleep:7,stress:3,pain:1});
}
const state={collections:{clients:[{id:clientId,name:'Cliente de demostración'}],appointments,sessions:[{id:'demo-plan',clientId,blocks:[{exerciseId:'squat',exerciseName:'Sentadilla'},{exerciseId:'press',exerciseName:'Press de banca'},{exerciseId:'row',exerciseName:'Remo'}]}],sessionExecutions,checkins,iriAssessments:[],wearableDailySummaries:[],reports:[]},pendingOperations:[],conflicts:[],rejectedOperations:[]};
const portfolio=buildPremiumReportPortfolio(state,clientId,{now});
const reports=portfolio.filter(x=>['post-session','weekly','monthly','quarterly','year-in-iberfit'].includes(x.id));
if(reports.length!==5||reports.some(x=>!x.ready))throw Error('SIGNATURE_SAMPLE_NOT_READY');
const dir='qa-output/annual-report-sample';
await Deno.mkdir(dir,{recursive:true});
const manifest=[];
for(const report of reports){
 const total=report.activitySeries.reduce((n,x)=>n+x.count,0);
 if(report.id==='year-in-iberfit'&&(report.title!=='Tu año en IBERFIT'||total!==104))throw Error('ANNUAL_DEMO_SESSION_COUNT');
 const source={reportId,clientId,revision:1,clientName:'Cliente de demostración',reportType:report.id,sourceType:report.sourceType,periodStart:report.periodStart,periodEnd:report.periodEnd,summary:report.summary,conclusions:report.conclusions,recommendations:report.recommendations,evidence:report.evidence,activitySeries:report.activitySeries};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const sourceSha256=await hash(new TextEncoder().encode(JSON.stringify(source)));
const fingerprint='IBERFIT M44 | SYNTHETIC SAMPLE | '+sourceSha256;
const result=await renderEvolutionReportPdf({source,sourceFingerprint:fingerprint,pdfLib:{PDFDocument,StandardFonts,rgb},fontkit,brandImageBytes:await Deno.readFile('public/isotipo-iberfit.png'),brandFonts:{inter:await Deno.readFile('public/m26/fonts/inter-latin-wght-normal.woff2'),serif:await Deno.readFile('public/m26/fonts/source-serif-4-latin-wght-normal.woff2')},generatedAt:now.toISOString()});
// pdf-lib's default load updates producer metadata in memory. Verification must preserve it.
const verified=await PDFDocument.load(result.bytes,{updateMetadata:false});
if(verified.getPageCount()!==result.pages)throw Error('ANNUAL_DEMO_PAGE_COUNT_INVALID');
if(verified.getSubject()!==fingerprint)throw Error('ANNUAL_DEMO_SOURCE_FINGERPRINT_INVALID');
if(verified.getProducer()!==M44_PDF_TEMPLATE)throw Error('ANNUAL_DEMO_PRODUCER_INVALID: '+verified.getProducer());
const filename=report.id==='year-in-iberfit'?'Tu-ano-en-IBERFIT-muestra.pdf':report.id+'.pdf';
await Deno.writeFile(dir+'/'+filename,result.bytes);
manifest.push({file:filename,reportType:report.id,sourceSha256,artifactSha256:await hash(result.bytes),pages:result.pages,bytes:result.bytes.length,template:result.templateVersion,confirmedSessions:total,periodStart:report.periodStart,periodEnd:report.periodEnd});
console.log('SIGNATURE_SAMPLE_OK',report.id,result.pages,result.bytes.length);
}
await Deno.writeTextFile(dir+'/manifest.json',JSON.stringify({synthetic:true,notIssued:true,notProductionCertified:true,gitSha:Deno.env.get('GITHUB_SHA')||null,reports:manifest},null,2));
