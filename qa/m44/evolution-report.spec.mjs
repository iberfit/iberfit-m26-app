import {test,expect} from '@playwright/test';
import {buildEvolutionReportHtml} from '../../src/m26/workflows/evolution-report-document.js';

const synthetic={
  id:'monthly',ready:true,title:'Tu evolución · Octubre 2026',
  periodStart:'2026-09-15',periodEnd:'2026-10-15',
  summary:'Periodo con tres entrenamientos registrados y confirmados. Las observaciones muestran lo realizado sin atribuir causalidad a una única sesión.',
  conclusions:'El historial muestra continuidad registrada, pero la interpretación debe considerar la planificación real, las circunstancias y los datos ausentes.',
  recommendations:'Revisar el próximo bloque con la persona y mantener un registro comparable.',
  evidence:[
    {label:'Sesiones IBERFIT confirmadas',text:'3',source:'sessionExecutions',quality:'confirmada'},
    {label:'Primera ejecución',text:'15 de septiembre de 2026',source:'sessionExecutions',quality:'confirmada'},
    {label:'Última ejecución',text:'14 de octubre de 2026',source:'sessionExecutions',quality:'confirmada'},
  ],
  activitySeries:[
    {from:'2026-09-15',to:'2026-09-21',count:1},
    {from:'2026-09-22',to:'2026-09-28',count:0},
    {from:'2026-09-29',to:'2026-10-05',count:1},
    {from:'2026-10-06',to:'2026-10-12',count:0},
    {from:'2026-10-13',to:'2026-10-15',count:1},
  ],
  sourceType:'session_execution_period',coachComment:'Solo uso profesional; no entregar esta nota privada.',
};
const html=buildEvolutionReportHtml({
  report:synthetic,clientName:'Persona de prueba IBERFIT',
  coachName:'Equipo IBERFIT',publicationStatus:'published',
});
// Serve the real typography, stylesheet and official isotipo from the repo,
 // rather than testing a fallback-font approximation.
async function mount(page,markup=html){
  await page.goto('/qa/rc64/fixture.html');
  await page.setContent(markup,{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>!!document.querySelector('[data-m44-report-css]')?.sheet)).toBe(true);
  await page.evaluate(async()=>{
    await document.fonts.ready;
    const logo=document.querySelector('.m44-brand img');
    if(logo)await logo.decode();
  });
}

test('M44 report is readable without horizontal clipping and contains a table and meaningful date axes',async({page})=>{
  await mount(page);
  await expect(page.locator('.m44-sheet')).toHaveCount(5);
  await expect(page.locator('.m44-activity-table tbody tr')).toHaveCount(5);
  await expect(page.locator('.m44-activity-date')).toHaveCount(5);
  await expect(page.locator('.m44-cover')).toContainText('CONSULTA DE INFORME PUBLICADO EN PLATAFORMA');
  const info=await page.evaluate(()=>({
    innerWidth:window.innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    chartLabels:[...document.querySelectorAll('.m44-activity-date')].map(node=>node.textContent),
    privateNote:document.body.textContent.includes('Solo uso profesional'),
    pageCount:document.querySelectorAll('.m44-sheet').length,
  }));
  expect(info.scrollWidth).toBeLessThanOrEqual(info.innerWidth+3);
  expect(info.chartLabels).toEqual(['09/15','09/22','09/29','10/06','10/13']);
  expect(info.privateNote).toBe(false);
  expect(info.pageCount).toBe(5);
});
test('M44 printing at true A4 remains free of hidden text and footer collisions',async({page})=>{
  await mount(page);
  await page.emulateMedia({media:'print'});
  const pages=await page.evaluate(()=>[...document.querySelectorAll('.m44-sheet')].map((sheet)=> {
    const content=sheet.querySelector('.m44-page-content'),footer=sheet.querySelector('.m44-foot');
    const bounds=sheet.getBoundingClientRect();
    const foot=footer?.getBoundingClientRect();
    const body=content?.getBoundingClientRect();
    return {
      sheetWidth:bounds.width,sheetHeight:bounds.height,
      overflow:!!content&&(content.scrollHeight>content.clientHeight+2),
      overlap:!!foot&&!!body&&body.bottom>foot.top+2,
    };
  }));
  for(const [idx,result] of pages.entries()){
    expect(result.sheetWidth, 'width sheet '+idx).toBeGreaterThan(790);
    expect(result.sheetHeight,'height sheet '+idx).toBeGreaterThan(1110);
    expect(result.overflow,'content overflow sheet '+idx).toBe(false);
    expect(result.overlap,'footer overlap sheet '+idx).toBe(false);
  }
  const pdf=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true});
  expect(pdf.length).toBeGreaterThan(10_000);
  const pagesInPdf=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/gu)||[]).length;
  expect(pagesInPdf).toBe(5);
});


test('M44 official brand font assets and logo are loaded in the real DOM',async({page,request})=>{
  await mount(page);
  for(const path of [
    '/m26/fonts/inter-latin-wght-normal.woff2',
    '/m26/fonts/source-serif-4-latin-wght-normal.woff2',
    '/public/isotipo-iberfit.png',
  ]){
    const response=await request.get(path);
    expect(response.status(),path).toBe(200);
    expect((await response.body()).byteLength,path).toBeGreaterThan(300);
  }
  const proof=await page.evaluate(()=>({
    titleFont:getComputedStyle(document.querySelector('.m44-cover h1')).fontFamily,
    bodyFont:getComputedStyle(document.body).fontFamily,
    logoReady:document.querySelector('.m44-brand img')?.naturalWidth>0,
    serifLoaded:document.fonts.check('16px "Source Serif 4 Variable"'),
    interLoaded:document.fonts.check('16px "Inter Variable"'),
  }));
  expect(proof.titleFont).toContain('Source Serif 4 Variable');
  expect(proof.bodyFont).toContain('Inter Variable');
  expect(proof.logoReady).toBe(true);
  expect(proof.serifLoaded).toBe(true);
  expect(proof.interLoaded).toBe(true);
});
