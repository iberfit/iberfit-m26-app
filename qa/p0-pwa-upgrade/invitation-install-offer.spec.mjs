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

test('browser install event offers native CTA only after explicit user click',async({page})=>{
  await showClientAfterAuthBootstrap(page);
  const offer=page.locator('[data-m26-invitation-install-offer]');
  await expect(offer).toBeVisible({timeout:10_000});
  await page.evaluate(()=>{
    window.__iberfitNativeInstallCalls=0;
    const event=new Event('beforeinstallprompt',{cancelable:true});
    event.prompt=()=>{
      window.__iberfitNativeInstallCalls+=1;
      return Promise.resolve();
    };
    event.userChoice=Promise.resolve({outcome:'accepted'});
    dispatchEvent(event);
  });
  await expect(offer.locator('[data-m26-install-accept]')).toHaveText('Instalar IBERFIT');
  expect(await page.evaluate(()=>window.__iberfitNativeInstallCalls)).toBe(0);
  await offer.locator('[data-m26-install-accept]').click();
  await expect(offer).toHaveCount(0);
  expect(await page.evaluate(()=>window.__iberfitNativeInstallCalls)).toBe(1);
});

test('Safari iOS invitation shows native add-to-home-screen instructions, never an impossible forced install',async({page})=>{
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'userAgent',{
      configurable:true,
      get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    });
  });
  await showClientAfterAuthBootstrap(page);
  const offer=page.locator('[data-m26-invitation-install-offer]');
  await expect(offer).toBeVisible({timeout:10_000});
  await expect(offer.locator('[data-m26-install-accept]')).toHaveText('Cómo instalarla');
  await offer.locator('[data-m26-install-accept]').click();
  await expect(offer.locator('[data-m26-install-guide]')).toContainText('En Safari, toca Compartir');
  await expect(offer.locator('[data-m26-install-guide]')).toContainText('Añadir a pantalla de inicio');
});

test('client bottom More remains operable when an installation offer is present (mobile touch)',async({page})=>{
  // This is a mobile-only geometry contract even when the parent matrix
  // runs Chromium on desktop and landscape tablet projects.
  await page.setViewportSize({width:390,height:844});
  await showClientAfterAuthBootstrap(page);
  const offer=page.locator('[data-m26-invitation-install-offer]');
  await expect(offer).toBeVisible({timeout:10_000});
  await page.evaluate(()=>{
    const menu=document.createElement('details');
    menu.className='m26-client-bottom-nav-more';
    menu.style.cssText='position:fixed;bottom:12px;right:16px;z-index:800';
    menu.innerHTML='<summary style="display:block;min-width:72px;min-height:48px;background:#C5A059;color:#0B1310">Más</summary>'+
      '<nav class="m26-client-bottom-nav-menu" style="position:absolute;bottom:48px;right:0;min-width:200px;background:#13221C;z-index:800">'+
      '<button type="button" data-m26-area="ajustes" style="min-width:180px;min-height:48px">Ajustes</button></nav>';
    menu.querySelector('button').addEventListener('click',()=>{document.documentElement.dataset.testSettingsClicked='yes';});
    document.querySelector('.m26-shell').append(menu);
  });
  const more=page.locator('.m26-client-bottom-nav-more');
  await more.locator('summary').click();
  await expect(more).toHaveAttribute('open','');
  await expect(offer).toBeHidden();
  const settings=more.locator('button[data-m26-area="ajustes"]');
  await settings.click({timeout:5_000});
  await expect(page.locator('html')).toHaveAttribute('data-test-settings-clicked','yes');
  await more.locator('summary').click();
  await expect(offer).toBeVisible();
});

test('opening native Client settings menu never leaves an install offer intercepting navigation',async({page})=>{
  await showClientAfterAuthBootstrap(page);
  const offer=page.locator('[data-m26-invitation-install-offer]');
  await expect(offer).toBeVisible({timeout:10_000});
  await page.evaluate(()=>{
    const settings=document.createElement('details');
    settings.className='m26-settings-menu';
    settings.innerHTML='<summary>Configuración</summary><button type="button">Idioma</button>';
    document.querySelector('.m26-shell').append(settings);
  });
  const details=page.locator('details.m26-settings-menu');
  await details.locator('summary').click();
  await expect(offer).toBeHidden();
  await details.locator('button').click({timeout:5_000});
  await details.locator('summary').click();
  await expect(offer).toBeVisible();
});
