import {test,expect} from '@playwright/test';

test('Chromium autofill keeps login fields on the dark IBERFIT surface',async({page,context})=>{
  await page.route('**/*.js',(route)=>route.abort());
  await page.goto('/m26/index.html',{waitUntil:'domcontentloaded'});

  await page.evaluate(()=>{
    const form=document.querySelector('[data-auth-form="login"]');
    form?.removeAttribute('hidden');
    form?.removeAttribute('aria-hidden');
  });

  const password=page.locator('#m26-login-password');
  await expect(password).toBeVisible();

  const cdp=await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const {root}=await cdp.send('DOM.getDocument');
  const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#m26-login-password'});
  expect(nodeId).toBeTruthy();
  await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['autofill']});

  const paint=await password.evaluate((input)=>{
    const style=getComputedStyle(input);
    return {
      matchesAutofill:input.matches(':autofill')||input.matches(':-webkit-autofill'),
      boxShadow:style.boxShadow,
      webkitBoxShadow:style.webkitBoxShadow,
      webkitTextFillColor:style.webkitTextFillColor,
      colorScheme:style.colorScheme,
      transitionDuration:style.transitionDuration,
    };
  });

  expect(paint.matchesAutofill).toBe(true);
  expect(paint.colorScheme).toContain('dark');
  expect(paint.boxShadow).toContain('rgb(14, 26, 21)');
  expect(paint.webkitBoxShadow).toContain('rgb(14, 26, 21)');
  expect(paint.webkitTextFillColor).toBe('rgb(245, 245, 240)');
  expect(paint.transitionDuration).not.toBe('0s');
});
