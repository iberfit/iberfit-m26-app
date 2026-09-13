import {test,expect} from '@playwright/test';

test('RC64.2B canonical disabled preauth visual',async({page})=>{
  const response=await page.goto('/',{waitUntil:'networkidle'});
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('html')).toHaveAttribute('lang','es-ES');

  const authSurface=page.locator('.m26-auth-page[data-auth-mode="login"][data-auth-state="unavailable"]');
  await expect(authSurface).toBeVisible();
  await expect(page.locator('#m26-auth-title')).toBeVisible();
  await expect(page.locator('.m26-auth-logo')).toBeVisible();
  await expect(page.locator('[data-auth-form="login"] .m26-primary-action')).toBeDisabled();
  await expect(page.locator('.m26-notice.is-warning')).toContainText('El acceso no está disponible');
  await expect(page).toHaveScreenshot('preauth-disabled.png',{fullPage:true});
});
