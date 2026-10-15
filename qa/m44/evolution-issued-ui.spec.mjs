import {test,expect} from '@playwright/test';

const CLIENT='11111111-1111-4111-8111-111111111111';
const REPORT='22222222-2222-4222-8222-222222222222';
const ISSUED='33333333-3333-4333-8333-333333333333';
const PDF='https://gjztkdwfmunnzhtvxrsu.supabase.co/storage/v1/object/sign/iberfit-evolution-issued-reports/qa.pdf?token=synthetic';

async function mount(page,role){
  await page.goto('/qa/rc64/fixture.html');
  await page.evaluate(async ({role,client,report,issuance,url})=>{
    const {createWorkflowController}=await import('/src/m26/app/workflow-controller.js');
    const root=document.createElement('section');
    root.id='m44-issued-qa-root';
    root.innerHTML=
      '<article data-m44-pdf-card>'+
      '<button type="button" data-workflow-action="issue-evolution-pdf" data-entity-id="'+report+'">Emitir PDF</button>'+
      '<button type="button" data-workflow-action="open-issued-evolution-pdf" data-entity-id="'+report+'">Abrir PDF</button>'+
      '<button type="button" data-workflow-action="show-issued-evolution-history" data-entity-id="'+report+'">Historial</button>'+
      '<div data-m44-pdf-history aria-live="polite"></div></article>';
    document.body.replaceChildren(root);
    const state={
      identity:{role,clientId:client},
      selectedClientId:client,
      collections:{
        reports:[{id:report,clientId:client,status:'publicado'}],
        clients:[{id:client}],
      },
    };
    const calls=[],opens=[];
    const origOpen=window.open;
    window.open=()=>{
      const popup={closed:false,location:{replace:x=>opens.push(x)},
        close(){this.closed=true;}};
      opens.push('requested');
      return popup;
    };
    const workflow=createWorkflowController({
      root,store:{getState:()=>state},commandBus:{execute:async()=>({ok:true})},
      catalog:[],mediaMap:{},isOnline:()=>true,
      issueEvolutionReport:async id=>{
        calls.push(['issue',id]);
        return {signedUrl:url,version:1};
      },
      getLatestEvolutionPdf:async id=>{
        calls.push(['latest',id]);return {signedUrl:url,version:1};
      },
      openEvolutionPdfById:async id=>{
        calls.push(['open',id]);return {signedUrl:url,version:1};
      },
      getEvolutionPdfHistory:async id=>{
        calls.push(['history',id]);
        return {reportId:id,manager:role==='coach'||role==='admin',
          items:[{issuanceId:issuance,version:1,withdrawn:false,issuedAt:'2026-10-15T13:00:00Z'}]};
      },
      withdrawEvolutionPdf:async (id,reason)=>{
        calls.push(['withdraw',id,reason]);return {withdrawn:true};
      },
    });
    workflow.mount();
    window.__m44Fixture={calls,opens,workflow,state,restore:()=>{workflow.destroy();window.open=origOpen;}};
  },{role,client:CLIENT,report:REPORT,issuance:ISSUED,url:PDF});
}
async function log(page){return page.evaluate(()=>({
  calls:window.__m44Fixture.calls,
  opens:window.__m44Fixture.opens,
  reason:document.querySelector('[data-m44-withdraw-reason]')?.value,
}));}
test('M44 Coach can issue, open existing PDF, read version history and withdraw with reason',async({page})=>{
  await mount(page,'coach');
  await page.getByRole('button',{name:'Emitir PDF'}).click();
  await expect.poll(async()=> (await log(page)).calls.length).toBe(1);
  await page.getByRole('button',{name:'Historial'}).click();
  await expect(page.locator('[data-m44-version-row]')).toHaveCount(1);
  await page.getByRole('button',{name:'Abrir PDF',exact:true}).last().click();
  await expect.poll(async()=> (await log(page)).opens.filter(x=>x===PDF).length).toBe(2);
  await page.locator('[data-m44-withdraw-reason]').fill('Versión corregida por el Coach');
  await page.getByRole('button',{name:'Retirar esta versión'}).click();
  await expect.poll(async()=> (await log(page)).calls.some(x=>x[0]==='withdraw')).toBe(true);
  const entries=(await log(page)).calls;
  expect(entries).toContainEqual(['issue',REPORT]);
  expect(entries).toContainEqual(['history',REPORT]);
  expect(entries).toContainEqual(['open',ISSUED]);
  expect(entries).toContainEqual(['withdraw',ISSUED,'Versión corregida por el Coach']);
});
test('M44 Admin opens published PDF from history without wrongful Client-only denial',async({page})=>{
  await mount(page,'admin');
  await page.getByRole('button',{name:'Historial'}).click();
  await expect(page.locator('[data-m44-version-row]')).toHaveCount(1);
  await page.getByRole('button',{name:'Abrir PDF',exact:true}).last().click();
  await expect.poll(async()=> (await log(page)).calls.some(x=>x[0]==='open')).toBe(true);
});
test('M44 Cliente reads published PDF but cannot emit or withdraw',async({page})=>{
  await mount(page,'client');
  await page.getByRole('button',{name:'Emitir PDF'}).click();
  await expect.poll(async()=>page.evaluate(()=>document.body.textContent.includes('No se ha podido completar')||
     document.body.textContent.includes('informe oficial'))).toBe(true);
  let result=await log(page);
  expect(result.calls.filter(x=>x[0]==='issue')).toHaveLength(0);
  await page.getByRole('button',{name:'Abrir PDF',exact:true}).first().click();
  await expect.poll(async()=> (await log(page)).calls.some(x=>x[0]==='latest')).toBe(true);
  await page.getByRole('button',{name:'Historial'}).click();
  await expect(page.locator('[data-m44-version-row]')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Retirar esta versión'})).toHaveCount(0);
});
