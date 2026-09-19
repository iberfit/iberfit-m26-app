import {test,expect} from '@playwright/test';

function isMobileProject(name=''){
  return String(name).includes('mobile');
}

test('diagnose mobile Admin input hit-testing during capture render race',async({page},testInfo)=>{
  test.skip(!isMobileProject(testInfo.project.name),'mobile-only diagnostic');
  await page.goto('/qa/admin-interaction/client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  const name=page.locator('[data-admin-form="client-create"] input[name="name"]');
  await expect(name).toBeVisible();
  await name.scrollIntoViewIfNeeded();
  const box=await name.boundingBox();
  expect(box).not.toBeNull();
  const point={x:box.x+box.width/2,y:box.y+box.height/2};

  await page.evaluate(({x,y})=>{
    const root=document.querySelector('#qa-root');
    const input=document.querySelector('[data-admin-form="client-create"] input[name="name"]');
    if(!root||!input)throw new Error('M26_HIT_DIAGNOSTIC_SURFACE_MISSING');
    const describe=(node)=>{
      if(!node)return null;
      const rect=node.getBoundingClientRect?.();
      const style=node.nodeType===1?getComputedStyle(node):null;
      return {
        tag:String(node.tagName||node.nodeName||''),
        id:String(node.id||''),
        classes:String(node.className||''),
        name:String(node.getAttribute?.('name')||''),
        role:String(node.getAttribute?.('role')||''),
        sameInput:node===input,
        containsInput:Boolean(node.contains?.(input)),
        rect:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height,top:rect.top,right:rect.right,bottom:rect.bottom,left:rect.left}:null,
        style:style?{
          position:style.position,zIndex:style.zIndex,pointerEvents:style.pointerEvents,
          opacity:style.opacity,display:style.display,visibility:style.visibility,
          overflow:style.overflow,transform:style.transform,
        }:null,
      };
    };
    const snapshot=(label)=>({
      label,
      active:describe(document.activeElement),
      input:describe(input),
      root:describe(root),
      nav:describe(document.querySelector('.m26-mobile-nav')),
      more:describe(document.querySelector('details.m26-mobile-more')),
      hit:describe(document.elementFromPoint(x,y)),
      hitStack:document.elementsFromPoint(x,y).slice(0,12).map(describe),
      scroll:{x:scrollX,y:scrollY,innerWidth,innerHeight,docWidth:document.documentElement.scrollWidth,docHeight:document.documentElement.scrollHeight},
      layout:String(root.dataset?.m26Layout||''),
      inputMode:String(root.dataset?.m26Input||''),
    });
    const diagnostic={point:{x,y},events:[],before:snapshot('before'),stableInput:input};
    const record=(phase,event)=>diagnostic.events.push({
      phase,
      type:event.type,
      pointerType:String(event.pointerType||''),
      clientX:event.clientX,clientY:event.clientY,
      defaultPrevented:event.defaultPrevented,
      target:describe(event.target),
      path:event.composedPath().slice(0,12).map(describe),
      active:describe(document.activeElement),
    });
    document.addEventListener('pointerdown',(event)=>record('document-capture',event),{capture:true,once:true});
    root.addEventListener('pointerdown',(event)=>record('root-capture-before-force',event),{capture:true,once:true});
    root.addEventListener('pointerdown',()=>{
      diagnostic.beforeForce=snapshot('before-force');
      diagnostic.forceReturn=globalThis.__IBERFIT_CLIENT_FORM_QA__?.forceExternalRender?.();
      diagnostic.afterForce=snapshot('after-force');
    },{capture:true,once:true});
    root.addEventListener('pointerup',(event)=>record('root-pointerup',event),{capture:true,once:true});
    globalThis.__M26_HIT_DIAGNOSTIC__=diagnostic;
  },point);

  await page.mouse.move(point.x,point.y);
  await page.mouse.down();
  const afterDown=await page.evaluate(()=>{
    const d=globalThis.__M26_HIT_DIAGNOSTIC__;
    const input=document.querySelector('[data-admin-form="client-create"] input[name="name"]');
    return {
      activeTag:document.activeElement?.tagName||'',
      activeName:document.activeElement?.getAttribute?.('name')||'',
      stableSame:d?.stableInput===input,
      hitTag:document.elementFromPoint(d.point.x,d.point.y)?.tagName||'',
      hitClass:String(document.elementFromPoint(d.point.x,d.point.y)?.className||''),
    };
  });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const result=await page.evaluate((afterDown)=>{
    const d=globalThis.__M26_HIT_DIAGNOSTIC__||{};
    const input=document.querySelector('[data-admin-form="client-create"] input[name="name"]');
    const top=document.elementFromPoint(d.point.x,d.point.y);
    return {
      project:{width:innerWidth,height:innerHeight,maxTouchPoints:navigator.maxTouchPoints},
      point:d.point,
      before:d.before,
      beforeForce:d.beforeForce,
      afterForce:d.afterForce,
      events:d.events,
      afterDown,
      afterUp:{
        activeTag:document.activeElement?.tagName||'',
        activeName:document.activeElement?.getAttribute?.('name')||'',
        stableSame:d.stableInput===input,
        topTag:top?.tagName||'',
        topClass:String(top?.className||''),
      },
    };
  },afterDown);

  console.log('M26_MOBILE_HIT_DIAGNOSTIC='+JSON.stringify(result));
  expect(result.before?.hit,'input center must have a hit target').toBeTruthy();
});
