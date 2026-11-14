import {test,expect} from '@playwright/test';

// A real Chromium browser against the existing local PWA shell, without
// backend credentials or any live write operations.
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    try{Object.defineProperty(navigator,'userAgent',{
      configurable:true,
      get:()=> 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    });}catch{}
  });
});

async function showClientAfterAuthBootstrap(page){
  await page.goto('/m26/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.m26-auth-page')).toHaveAttribute('data-auth-state','unavailable',{timeout:15_000});
  await page.evaluate(()=>{
    const root=document.querySelector('#app');
    root.innerHTML='<main class="m26-shell" data-m26-role="client"><h1>Mi espacio</h1></main>';
  });
}

test('new client sees SIGNATURE PWA offer, Android instructions, can dismiss without losing client view',async({page})=>{
  await showClientAfterAuthBootstrap(page);
  const offer=page.locator('[data-m26-invitation-install-offer]');
  await expect(offer).toBeVisible({timeout:10_000});
  await expect(offer.locator('h2')).toContainText('IBERFIT como aplicación');
  await expect(offer.locator('[data-m26-install-accept]')).toContainText('Cómo instalarla');
  await offer.locator('[data-m26-install-accept]').click();
  await expect(offer.locator('[data-m26-install-guide]')).toContainText('Chrome');
  await offer.locator('[data-m26-install-dismiss]').first().click();
  await expect(offer).toHaveCount(0);
  await expect(page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible();
  const dismissed=await page.evaluate(()=>Number(localStorage.getItem('iberfit.m26.pwa.welcome-dismissed-until.v1')||0));
  expect(dismissed).toBeGreaterThan(Date.now()+20*24*60*60*1000);
});

test('a running workout conceals the install offer without freezing training',async({page})=>{
  await showClientAfterAuthBootstrap(page);
  const offer=page.locator('[data-m26-invitation-install-offer]');
  await expect(offer).toBeVisible({timeout:10_000});
  await page.evaluate(()=>{
    const live=document.createElement('section');
    live.className='m26-session-live-v3';
    live.setAttribute('data-session-live-state','active');
    document.querySelector('.m26-shell').append(live);
  });
  await expect(offer).toBeHidden();
  await page.evaluate(()=>document.querySelector('.m26-session-live-v3')?.remove());
  await expect(offer).toBeVisible();
  await expect(page.locator('.m26-shell[data-m26-role="client"]')).toBeVisible();
});
