/**
 * SIGNATURE U48R — read-only proof of the EXACT already completed U47 QA run.
 * U48's first real ACK is permanent and MUST NOT be repeated. Separate fresh
 * authenticated Client bootstrap + independently WebAuthn-protected Coach
 * bootstrap; no backend mutation, no privileged fallback and no PROD writes.
 */
import {expect} from '@playwright/test';
import {openU56ClientReadOnly} from './u56-qa-publish.mjs';

const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const CLIENT='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const SESSION='4d244c01-8966-40f1-8cc7-9e6ec46d1708';
const EXECUTION='16145839-2e7d-48e2-bf0c-e94325f5c54c';
const TITLE='QA U47 · Running 40738135729-1';
const FEEDBACK='IBERFIT QA U48 · running sintético';

function onlyOneRecord(items,type,id){
 const matches=(Array.isArray(items)?items:[]).filter(row=>
   String(row?.entityType||row?.entity_type||'')===type&&
   String(row?.entityId||row?.entity_id||row?.id||'')===id);
 expect(matches,'One exact canonical '+type+' is required').toHaveLength(1);
 return matches[0];
}

export async function certifyU48CompletedReadback({
 browser,installPolicy,evidence,coachPage,cdp,setDevice,
}){
 if(process.env.M26_QA_U48_COMPLETED_READBACK!=='true'||
    process.env.M26_QA_U48_RUNNING==='true'||
    process.env.M26_QA_U48_READBACK==='true'||
    process.env.M26_QA_U47_RUNNING==='true'||
    process.env.M26_QA_U56_PUBLISH==='true'||
    process.env.M26_QA_U58_EXECUTE==='true'||
    process.env.M26_QA_ONLY!=='true'||
    process.env.M26_PROJECT_REF!=='gjztkdwfmunnzhtvxrsu'||
    process.env.GITHUB_RUN_ATTEMPT!=='1')
   throw Error('U48R_READONLY_TRUSTED_CANARY_ONLY');
 expect(coachPage,'Readback requires independent real Coach WebAuthn').toBeTruthy();
 const client=await openU56ClientReadOnly(browser,installPolicy);
 let snapshot=null;
 const errors=[];
 const {page,context}=client;
 page.on('pageerror',error=>errors.push(String(error?.message||'CLIENT_PAGE_ERROR').slice(0,120)));
 page.on('response',async response=>{
   try{
     const u=new URL(response.url());
     if(u.origin!==QA||u.pathname!=='/rest/v1/rpc/iberfit_bootstrap_v26'
       ||response.status()!==200)return;
     const data=await response.json();
     if(String(data?.user?.clientId||'')===CLIENT&&
        ['client','cliente'].includes(String(data?.user?.role||'').toLowerCase()))
       snapshot=data.data||null;
   }catch{}
 });
 const result={readOnly:true,qaOnly:true,oneOriginalExecution:true,
   clientHistoryConfirmed:false,coachMfaReadbackConfirmed:false,
   noAdditionalWrite:true,verified:false};
 evidence.u48CompletedReadback=result;
 try{
   expect(client.clientId).toBe(CLIENT);
   // A fresh bootstrap, not an optimistic Client state retained from U48.
   await page.reload({waitUntil:'domcontentloaded',timeout:30_000});
   await expect(page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible({timeout:45_000});
   await expect(page.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:30_000});
   await expect.poll(()=>snapshot,{timeout:20_000}).not.toBeNull();
   const session=onlyOneRecord(snapshot?.m26Entities,'session',SESSION);
   const execution=onlyOneRecord(snapshot?.m26Entities,'session_execution',EXECUTION);
   const historical=(snapshot?.sessionExecutions||[])
     .filter(row=>String(row?.id||'')===EXECUTION);
   expect(historical,'Exactly one Client-safe legacy execution').toHaveLength(1);
   expect(String(session?.clientId||session?.body?.clientId||'')).toBe(CLIENT);
   expect(String(session?.body?.title||'')).toBe(TITLE);
   expect(String(session?.status||session?.body?.status||'')).toBe('completada');
   expect(String(execution?.status||execution?.body?.status||'')).toBe('completada');
   expect(String(execution?.body?.sessionId||'')).toBe(SESSION);
   expect(String(execution?.clientId||execution?.body?.clientId||'')).toBe(CLIENT);
   expect(Number(execution?.revision)).toBe(4);
   expect(Number(historical[0]?.revision)).toBe(4);
   // Do not weaken the existing Client projection in a QA readback.
   expect(historical[0]?.clientId??historical[0]?.client_id??null).toBeNull();
   expect(historical[0]?.sessionId??historical[0]?.session_id??null).toBeNull();
   const welcome=page.locator('[data-m26-client-guided-welcome]');
   if(await welcome.isVisible().catch(()=>false)){
     const pause=page.locator('[data-m26-client-guided-welcome-pause]').first();
     if(await pause.isVisible().catch(()=>false))await pause.click();
   }
   await page.locator('[data-m26-area="sesion"]:visible').first().click({timeout:30_000});
   const history=page.locator('[data-m43-session-history] [data-m43-completed-session]')
     .filter({hasText:TITLE});
   await expect(history,'Client must retain the completed U47 in real history')
     .toHaveCount(1,{timeout:30_000});
   const sessionCard=page.locator('[data-rc39-session="'+SESSION+'"]');
   await expect(sessionCard.locator('[data-workflow-action="start-published-session"]'),
     'A completed occurrence must not be started again').toHaveCount(0);
   expect(client.evidence.blocked).toEqual([]);
   expect(client.pageErrors).toEqual([]);
   expect(errors).toEqual([]);
   result.clientHistoryConfirmed=true;

   // Old Coach snapshot is deliberately stale when another device finishes.
   // Force a genuine fresh, authorized Coach read without redoing WebAuthn.
   await setDevice(coachPage,cdp,{name:'u48r-coach-readback',width:1440,height:1000,mobile:false,touch:false});
   await coachPage.reload({waitUntil:'domcontentloaded',timeout:30_000});
   await expect(coachPage.locator('.m26-shell[data-m26-role="coach"]'),
     'Coach must keep verified WebAuthn on reload').toBeVisible({timeout:55_000});
   await expect(coachPage.locator('[data-m26-interactive="ready"]')).toHaveCount(1,{timeout:40_000});
   const picker=coachPage.locator('[data-m26-client-select]').first();
   await expect(picker.locator('option[value="'+CLIENT+'"]'),
     'Coach cannot read arbitrary or unassigned Client').toHaveCount(1,{timeout:25_000});
   await picker.selectOption(CLIENT);
   const dossier=coachPage.locator('[data-m26-area="expediente"]:visible').first();
   await expect(dossier).toBeVisible({timeout:20_000});
   // Playwright waits for scheduled navigations after click: unlike the old
   // 8-second timeout this bound preserves the actual navigation completion.
   await dossier.click({timeout:35_000});
   const workspace=coachPage.locator('[data-coach-client-workspace][data-client-id="'+CLIENT+'"]');
   await expect(workspace,'Coach must read Client A after independent MFA')
     .toBeVisible({timeout:45_000});
   await expect(workspace,'Coach must read persisted U48 feedback, not stale pre-finish snapshot')
     .toContainText(FEEDBACK,{timeout:30_000});
   await expect(workspace).toContainText('RPE 7');
   result.coachMfaReadbackConfirmed=true;
   expect(evidence.blocked||[],'No prohibited Coach request').toEqual([]);
   result.verified=true;
 }finally{
   await context.close().catch(()=>{});
 }
}
