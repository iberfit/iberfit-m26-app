import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildDatedTrendEvidence,readDatedTrends,trendGeometry,buildWellbeingBundle,wellbeingBundleDescription} from '../src/m26/workflows/report-trend-contract.js';
const start='2026-01-01',end='2026-03-31';
test('Todas las variables de bienestar conservan sus fechas, valores y cobertura en una evidencia firmada',()=>{
 const labels=['Energía','Sueño','Estrés','Dolor','Fatiga','Motivación'];
 const rows=labels.map((label,j)=>buildDatedTrendEvidence(label,Array.from({length:16},(_,i)=>({date:'2026-01-'+String(i+1+j).padStart(2,'0'),value:(i+j)%11})),start,end));
 const bundled=buildWellbeingBundle(rows,start,end);assert.ok(bundled.text.length<=500);
 assert.deepEqual(readDatedTrends([bundled],start,end),readDatedTrends(rows,start,end));
 assert.match(wellbeingBundleDescription([bundled],start,end),/Motivación/);assert.doesNotMatch(wellbeingBundleDescription([bundled],start,end),/v1\|/u);
 assert.equal(readDatedTrends([{...bundled,text:bundled.text+'|'+bundled.text.split('|')[1]}],start,end).length,0);
 assert.equal(readDatedTrends([bundled,bundled],start,end).length,0);
 assert.equal(readDatedTrends([bundled,rows[0]],start,end).some(s=>s.label==='Energía'),false);
 assert.equal(readDatedTrends([{...bundled,source:'wearableDailySummaries'}],start,end).length,0);
});
test('Elite data transport is identical in browser and Edge',async()=>{
 assert.equal(await readFile(new URL('../src/m26/workflows/report-trend-contract.js',import.meta.url),'utf8'),await readFile(new URL('../supabase/functions/iberfit-evolution-report-emission-v1/report-trend-contract.js',import.meta.url),'utf8'));
});
test('Elite trends keep measured zero and daily means, reject missing and invalid observations',()=>{
 const r=buildDatedTrendEvidence('Energía',[{date:start,value:0},{date:start,value:2},{date:'2026-01-03',value:4},{date:'2026-02-01',value:5},{date:'2026-03-32',value:9},{date:end,value:null}],start,end);
 const [s]=readDatedTrends([r],start,end);
 assert.equal(s.total,3);assert.equal(s.points[0].value,1);
 assert.equal(trendGeometry(s).segments.length,1);
 assert.equal(readDatedTrends([{...r,source:'wearableDailySummaries'}],start,end).length,0);
 assert.equal(readDatedTrends([{...r,text:r.text.replace('2026-01-03','2026-01-01')}],start,end).length,0);
 assert.equal(buildDatedTrendEvidence('Energía',[{date:start,value:0}],start,end),null);
});
test('Elite samples bounded daily measurements preserving endpoints and count',()=>{
 const rows=Array.from({length:28},(_,i)=>({date:'2026-01-'+String(i+1).padStart(2,'0'),value:i*10}));
 const r=buildDatedTrendEvidence('Volumen comparable',rows,start,end);
 const [s]=readDatedTrends([r],start,end);
 assert.equal(s.points.length,10);assert.equal(s.total,28);assert.equal(s.points[0].value,0);assert.equal(s.points.at(-1).value,270);assert.ok(r.text.length<=500);
});

import {buildTrainingCalendarEvidence,readTrainingCalendar} from '../src/m26/workflows/report-trend-contract.js';
import {buildEvolutionReportHtml} from '../src/m26/workflows/evolution-report-document.js';
test('annual calendar preserves exact distinct civil dates, leap day and rejects inconsistent evidence',()=>{
 const start='2024-01-01',end='2024-12-31',dates=['2024-01-01','2024-01-01','2024-02-29','2024-12-31','2025-01-01','2024-02-30'];
 const row=buildTrainingCalendarEvidence(dates,start,end);const c=readTrainingCalendar([row],start,end);
 assert.equal(c.count,3);assert.equal(c.length,366);assert.deepEqual(c.cells.filter(p=>p.active).map(p=>p.date),['2024-01-01','2024-02-29','2024-12-31']);
 assert.equal(c.months[1].days,29);assert.ok(row.text.length<500);
 assert.equal(readTrainingCalendar([row,{label:'Días con entrenamiento confirmado',source:'sessionExecutions',text:'4'}],start,end),null);
 assert.equal(readTrainingCalendar([row],start,end,[{from:start,to:end,count:2}]),null);
 assert.equal(readTrainingCalendar([{...row,text:row.text.replace('3 de','4 de')}],start,end),null);
 const report={id:'year-in-iberfit',ready:true,periodStart:start,periodEnd:end,evidence:[row],summary:'Resumen',conclusions:'Conclusiones',recommendations:'Recomendaciones'};
 const html=buildEvolutionReportHtml({report,audience:'client'});assert.match(html,/Tu calendario de entrenamiento/);assert.doesNotMatch(html,/Registro diario v1:/);
});
