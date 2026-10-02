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


test('focused and hydrated login/product fields never flash to a light surface',async({page,context})=>{
  await page.route('**/*.js',(route)=>route.abort());
  await page.goto('/m26/index.html',{waitUntil:'domcontentloaded'});

  await page.evaluate(async()=>{
    const form=document.querySelector('[data-auth-form="login"]');
    form?.removeAttribute('hidden');
    form?.removeAttribute('aria-hidden');

    const links=[...document.querySelectorAll('link[data-iberfit-full-style]')];
    await Promise.all(links.map((link)=>new Promise((resolve)=>{
      const href=link.getAttribute('data-href');
      if(!href){resolve();return;}
      const done=()=>resolve();
      link.addEventListener('load',done,{once:true});
      link.addEventListener('error',done,{once:true});
      link.setAttribute('href',href);
      link.media='all';
      if(link.sheet)queueMicrotask(done);
    })));

    const workspace=document.createElement('div');
    workspace.className='m26-shell';
    workspace.innerHTML='<div class="m26-workspace"><label>Campo QA<input id="m26-product-field-qa" type="text" autocomplete="name" value="Texto visible"></label></div>';
    document.body.append(workspace);
  });

  const email=page.locator('input[name="email"]');
  const password=page.locator('#m26-login-password');
  await email.fill('qa.visual@example.invalid');
  await password.fill('texto-visible-123');
  await email.hover();
  await email.focus();

  const focused=await email.evaluate((input)=>{
    const style=getComputedStyle(input);
    const rgb=(value)=>[...String(value).matchAll(/\d+/g)].slice(0,3).map((match)=>Number(match[0]));
    return {
      background:rgb(style.backgroundColor),
      textFill:rgb(style.webkitTextFillColor||style.color),
      caret:rgb(style.caretColor),
      value:input.value,
    };
  });
  expect(focused.value).toBe('qa.visual@example.invalid');
  expect(Math.max(...focused.background)).toBeLessThan(64);
  expect(Math.min(...focused.textFill)).toBeGreaterThan(180);
  expect(Math.max(...focused.caret)).toBeGreaterThan(120);

  const cdp=await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const {root}=await cdp.send('DOM.getDocument');

  for(const selector of ['#m26-login-password','#m26-product-field-qa']){
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});
    expect(nodeId).toBeTruthy();
    await cdp.send('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['autofill','focus']});
    const paint=await page.locator(selector).evaluate((input)=>{
      const style=getComputedStyle(input);
      return {
        matchesAutofill:input.matches(':autofill')||input.matches(':-webkit-autofill'),
        boxShadow:style.boxShadow,
        webkitBoxShadow:style.webkitBoxShadow,
        textFill:style.webkitTextFillColor,
        backgroundColor:style.backgroundColor,
      };
    });
    expect(paint.matchesAutofill).toBe(true);
    expect(paint.backgroundColor).not.toBe('rgb(255, 255, 255)');
    expect(paint.textFill).not.toBe('rgb(0, 0, 0)');
    expect(paint.boxShadow).toMatch(/rgb\(14, (?:26|27), (?:21|22)\)/);
    expect(paint.webkitBoxShadow).toMatch(/rgb\(14, (?:26|27), (?:21|22)\)/);
  }
});
