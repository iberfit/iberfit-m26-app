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
    // Chromium may serialize computed colors as color(srgb 0.2 0.1 ...)
    // rather than rgb(51, 26, ...). Integer tokenization reads 0.2 as
    // [0,2] and wrongly reports a light field. Sample actual painted pixels.
    const rgb=(value)=>{
      const canvas=document.createElement('canvas');
      canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw new Error('IBERFIT_QA_CANVAS_COLOR_SAMPLER_UNAVAILABLE');
      ctx.fillStyle='#ff00ff';
      ctx.fillStyle=String(value);
      if(ctx.fillStyle==='#ff00ff')throw new Error('IBERFIT_QA_COLOR_UNPARSABLE');
      ctx.fillRect(0,0,1,1);
      return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3);
    };
    return {
      background:rgb(style.backgroundColor),
      textFill:rgb(style.webkitTextFillColor||style.color),
      caret:rgb(style.caretColor),
      value:input.value,
      colorSamplerSanity:rgb('color(srgb 0.2 0.1 0.1)'),
    };
  });
  expect(focused.value).toBe('qa.visual@example.invalid');
  expect(focused.colorSamplerSanity).toEqual([51,26,26]);
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


test('password visibility toggle stays contained while pressed and after label change',async({page})=>{
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
  });

  const field=page.locator('.m26-password-field');
  const toggle=page.locator('[data-password-toggle]');
  await expect(toggle).toBeVisible();

  const geometry=async()=>page.evaluate(()=>{
    const wrapper=document.querySelector('.m26-password-field')?.getBoundingClientRect();
    const button=document.querySelector('[data-password-toggle]')?.getBoundingClientRect();
    if(!wrapper||!button)return null;
    return {
      wrapper:{left:wrapper.left,right:wrapper.right,top:wrapper.top,bottom:wrapper.bottom,height:wrapper.height},
      button:{left:button.left,right:button.right,top:button.top,bottom:button.bottom,height:button.height,width:button.width},
      centerDelta:Math.abs((button.top+button.height/2)-(wrapper.top+wrapper.height/2)),
    };
  });

  const before=await geometry();
  expect(before).not.toBeNull();
  expect(before.button.left).toBeGreaterThanOrEqual(before.wrapper.left);
  expect(before.button.right).toBeLessThanOrEqual(before.wrapper.right);
  expect(before.button.top).toBeGreaterThanOrEqual(before.wrapper.top);
  expect(before.button.bottom).toBeLessThanOrEqual(before.wrapper.bottom);
  expect(before.centerDelta).toBeLessThanOrEqual(1);
  expect(before.button.width).toBeGreaterThanOrEqual(70);

  const box=await toggle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();

  const pressed=await geometry();
  expect(pressed.button.left).toBeGreaterThanOrEqual(pressed.wrapper.left);
  expect(pressed.button.right).toBeLessThanOrEqual(pressed.wrapper.right);
  expect(pressed.button.top).toBeGreaterThanOrEqual(pressed.wrapper.top);
  expect(pressed.button.bottom).toBeLessThanOrEqual(pressed.wrapper.bottom);
  expect(pressed.centerDelta).toBeLessThanOrEqual(1);

  await page.mouse.up();

  await page.evaluate(()=>{
    const button=document.querySelector('[data-password-toggle]');
    if(button)button.textContent='Ocultar';
  });
  const after=await geometry();
  expect(after.button.left).toBeGreaterThanOrEqual(after.wrapper.left);
  expect(after.button.right).toBeLessThanOrEqual(after.wrapper.right);
  expect(after.button.top).toBeGreaterThanOrEqual(after.wrapper.top);
  expect(after.button.bottom).toBeLessThanOrEqual(after.wrapper.bottom);
  expect(after.centerDelta).toBeLessThanOrEqual(1);
  expect(Math.abs(after.button.width-before.button.width)).toBeLessThanOrEqual(1);
});
