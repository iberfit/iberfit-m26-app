import {test,expect} from '@playwright/test';

test('RC64.2B canonical disabled preauth visual',async({page})=>{
  const response=await page.goto('/',{waitUntil:'networkidle'});
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('html')).toHaveAttribute('lang','es-ES');

  const authSurface=page.locator('.m26-auth-page[data-auth-mode="login"][data-auth-state="unavailable"]');
  await expect(authSurface).toBeVisible();
  await expect(page.locator('.m26-auth-card')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#m26-auth-title')).toHaveText('Acceso privado');
  await expect(page.locator('.m26-auth-logo')).toBeVisible();
  await expect(page.locator('[data-auth-form="login"]')).toBeHidden();
  await expect(page.locator('.m26-auth-actions')).toContainText('Acceso no disponible temporalmente.');
  await expect(page).toHaveScreenshot('preauth-disabled.png',{fullPage:true});
});
