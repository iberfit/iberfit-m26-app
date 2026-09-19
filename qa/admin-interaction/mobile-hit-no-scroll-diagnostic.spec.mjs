import {test,expect} from '@playwright/test';

function isMobileProject(name=''){
  return String(name).includes('mobile');
}

function targetInfo(node,input){
  if(!node)return null;
  const rect=node.getBoundingClientRect?.();
  return {
    tag:String(node.tagName||node.nodeName||''),
    classes:String(node.className||''),
    name:String(node.getAttribute?.('name')||''),
    sameInput:node===input,
    rect:rect?{top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,width:rect.width,height:rect.height}:null,
  };
}

test('diagnose exact raw mouse click without scroll before capture render race',async({page},testInfo)=>{
  test.skip(!isMobileProject(testInfo.project.name),'mobile-only diagnostic');
  await page.goto('/qa/admin-interaction/client-form-continuity.fixture.html',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_CLIENT_FORM_QA__?.mounted===true)).toBe(true);

  const name=page.locator('[data-admin-form="client-create"] input[name="name"]');
  await expect(name).toBeVisible();
  const box=await name.boundingBox();
  expect(box,'Control must expose a stable pointer box').not.toBeNull();
  const point={x:box.x+box.width/2,y:box.y+box.height/2};

  const before=await page.evaluate(({x,y})=>{
    const input=document.querySelector('[data-admin-form="client-create"] input[name="name"]');
    const nav=document.querySelector('.m26-mobile-nav');
    const hit=document.elementFromPoint(x,y);
    return {
      scrollY,
      viewport:{width:innerWidth,height:innerHeight},
      point:{x,y},
      input:targetInfoLocal(input,input),
      nav:targetInfoLocal(nav,input),
      hit:targetInfoLocal(hit,input),
      stack:document.elementsFromPoint(x,y).slice(0,8).map((node)=>targetInfoLocal(node,input)),
      active:targetInfoLocal(document.activeElement,input),
      layout:String(document.querySelector('#qa-root')?.dataset?.m26Layout||''),
      inputMode:String(document.querySelector('#qa-root')?.dataset?.m26Input||''),
    };
    function targetInfoLocal(node,inputNode){
      if(!node)return null;
      const rect=node.getBoundingClientRect?.();
      return {
        tag:String(node.tagName||node.nodeName||''),
        classes:String(node.className||''),
        name:String(node.getAttribute?.('name')||''),
        sameInput:node===inputNode,
        rect:rect?{top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,width:rect.width,height:rect.height}:null,
      };
    }
  },point);

  await page.evaluate(()=>{
    const root=document.querySelector('#qa-root');
    const input=document.querySelector('[data-admin-form="client-create"] input[name="name"]');
    if(!root||!input)throw new Error('M26_NO_SCROLL_DIAGNOSTIC_SURFACE_MISSING');
    globalThis.__M26_NO_SCROLL_EVENTS__=[];
    const describe=(node)=>({
      tag:String(node?.tagName||node?.nodeName||''),
      classes:String(node?.className||''),
      name:String(node?.getAttribute?.('name')||''),
      sameInput:node===input,
    });
    const record=(phase,event)=>globalThis.__M26_NO_SCROLL_EVENTS__.push({
      phase,
      type:event.type,
      pointerType:String(event.pointerType||''),
      clientX:event.clientX,
      clientY:event.clientY,
      target:describe(event.target),
      active:describe(document.activeElement),
      defaultPrevented:event.defaultPrevented,
    });
    document.addEventListener('pointerdown',(event)=>record('document-down',event),{capture:true,once:true});
    root.addEventListener('pointerdown',(event)=>record('root-before-force',event),{capture:true,once:true});
    root.addEventListener('pointerdown',()=>{
      globalThis.__M26_NO_SCROLL_FORCE_RETURN__=globalThis.__IBERFIT_CLIENT_FORM_QA__?.forceExternalRender?.();
    },{capture:true,once:true});
    root.addEventListener('pointerup',(event)=>record('root-up',event),{capture:true,once:true});
  });

  await page.mouse.move(point.x,point.y);
  await page.mouse.down();
  const during=await page.evaluate(()=>({
    scrollY,
    activeTag:document.activeElement?.tagName||'',
    activeName:document.activeElement?.getAttribute?.('name')||'',
    events:globalThis.__M26_NO_SCROLL_EVENTS__||[],
    forceReturn:globalThis.__M26_NO_SCROLL_FORCE_RETURN__,
  }));
  await page.mouse.up();
  await page.waitForTimeout(150);

  const after=await page.evaluate(({x,y})=>{
    const input=document.querySelector('[data-admin-form="client-create"] input[name="name"]');
    const nav=document.querySelector('.m26-mobile-nav');
    const describe=(node)=>{
      if(!node)return null;
      const rect=node.getBoundingClientRect?.();
      return {tag:String(node.tagName||node.nodeName||''),classes:String(node.className||''),name:String(node.getAttribute?.('name')||''),sameInput:node===input,rect:rect?{top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right}:null};
    };
    return {
      scrollY,
      active:describe(document.activeElement),
      input:describe(input),
      nav:describe(nav),
      hit:describe(document.elementFromPoint(x,y)),
      events:globalThis.__M26_NO_SCROLL_EVENTS__||[],
      forceReturn:globalThis.__M26_NO_SCROLL_FORCE_RETURN__,
    };
  },point);

  console.log('M26_MOBILE_NO_SCROLL_DIAGNOSTIC='+JSON.stringify({project:testInfo.project.name,before,during,after}));
  expect(before.input,'input must exist before raw pointer').toBeTruthy();
});
