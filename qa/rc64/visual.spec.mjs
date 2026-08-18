import {test,expect} from '@playwright/test';

test('RC64.2B canonical disabled preauth visual',async({page})=>{
  const response=await page.goto('/',{waitUntil:'networkidle'});
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator('html')).toHaveAttribute('lang','es-ES');
  await expect(page.getByRole('heading',{name:'Entrenamiento personal con criterio'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Entrar'})).toBeDisabled();
  await expect(page.locator('.m26-notice.is-warning')).toBeVisible();
  await expect(page).toHaveScreenshot('preauth-disabled.png',{fullPage:true});
});
