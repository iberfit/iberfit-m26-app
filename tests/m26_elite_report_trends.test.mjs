import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildDatedTrendEvidence,readDatedTrends,trendGeometry} from '../src/m26/workflows/report-trend-contract.js';
const start='2026-01-01',end='2026-03-31';
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
