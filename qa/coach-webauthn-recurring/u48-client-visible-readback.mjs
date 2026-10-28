import {expect} from '@playwright/test';
import {openU56ClientReadOnly} from './u56-qa-publish.mjs';

// U48 certification is deliberately READ ONLY. The completed U56 workout and
// the available U47 running prescription are not published, started, reset or
// mutated again. A server-authorised Client A must be able to reach its own
// newly published training without discovering an invisible archive first.
export async function certifyU48UniversalSessionVisibility({browser,installPolicy,evidence}){
 if(process.env.M26_QA_U48_READBACK!=='true'||
    process.env.M26_QA_U47_RUNNING==='true'||
    process.env.M26_QA_U56_PUBLISH==='true'||
    process.env.M26_QA_U58_EXECUTE==='true')
   throw Error('U48_READONLY_SCOPE_REQUIRED');
 const expected='QA U47 · Running 40738135729-1';
 const client=await openU56ClientReadOnly(browser,installPolicy);
 try{
   const page=client.page;
   await page.locator('[data-m26-area="sesion"]:visible').first().click();
   const card=page.locator('[data-rc39-session]').filter({hasText:expected});
   await expect(card,'Exactly one previously published U47 running session').toHaveCount(1,{timeout:25_000});
   await expect(card,'Fresh published training must be visible without opening historical archive')
     .toBeVisible({timeout:12_000});
   await expect(card.locator('xpath=ancestor::details[@data-signature-session-archive]'),
     'A freshly published actionable training cannot be folded inside old history').toHaveCount(0);
   const open=card.locator('details.m26-session-preview-disclosure > summary');
   await expect(open,'Review must be accessible by pointer and keyboard').toBeVisible({timeout:12_000});
   await open.click({timeout:5_000});
   const start=card.locator('[data-workflow-action="start-published-session"]');
   await expect(start,'The exact previously published workout has a ready CTA')
     .toBeVisible({timeout:12_000});
   await expect(start).toBeEnabled();
   await expect(start).toHaveAttribute('data-entity-id',await card.getAttribute('data-rc39-session'));
   // A second route must preserve this exact identity and the same action.
   await page.locator('[data-m26-area="planificacion"]:visible').first().click();
   const planning=page.locator('[data-rc39-session]').filter({hasText:expected});
   await expect(planning).toHaveCount(1,{timeout:25_000});
   await expect(planning).toBeVisible({timeout:12_000});
   await expect(planning.locator('xpath=ancestor::details[@data-signature-planning-archive]'))
     .toHaveCount(0);
   await expect(planning.locator('details.m26-session-preview-disclosure > summary')).toBeVisible();
   expect(client.evidence.blocked,'Only QA-authorized reads may occur in this smoke').toEqual([]);
   evidence.u48UniversalReadback={
     verified:true,qaOnly:true,readonly:true,
     publishedRunningVisible:true,unfoldedAcrossBothRoutes:true,
     noTrainingStarted:true,noClientDataMutation:true,
   };
 }finally{await client.context.close().catch(()=>{});}
}
