import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
import {captureEvidenceScreenshot} from './reliable-screenshot.mjs';

const OUT='recovery/device-experience/m41-premium';
const SOURCE_STYLES=[
  '/src/m26/design/tokens.css','/src/m26/design/typography.css',
  '/src/m26/design/icons.css','/src/m26/design/primitives.css',
  '/src/m26/design/role-surfaces.css','/src/m26/design/premium-ux.css',
  '/src/m26/design/signature-ux-v2.css','/src/m26/design/dark-iberfit-v2.css',
  '/src/m26/design/iberfit-premium-v3.css','/src/m26/rc39/rc39.css',
  '/src/m26/ui/client-bottom-nav.css',
];
const TASKS=[
  {role:'client',path:'/qa/rc13_visual_cases/client_hoy_mobile.html',material:'#1d3629'},
  {role:'coach',path:'/qa/rc13_visual_cases/coach_planificacion_desktop.html',material:'#192f24'},
  {role:'admin',path:'/qa/admin-interaction/fixture.html?route=users',material:'#1c3026'},
];
function luminance([r,g,b]){
  const linear=v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4};
  return .2126*linear(r)+.7152*linear(g)+.0722*linear(b);
}
function contrast(rgbA,rgbB){
  const a=luminance(rgbA),b=luminance(rgbB);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test('M41 premium surfaces stay distinct, accessible and device-safe across real CSS',async({page},testInfo)=>{
  await mkdir(OUT,{recursive:true});
  const viewport=page.viewportSize();
  const evidence=[];
  for(const task of TASKS){
    const response=await page.goto(task.path,{waitUntil:'domcontentloaded',timeout:15_000});
    expect(response?.ok(),task.role+' fixture must load').toBeTruthy();
    for(const href of SOURCE_STYLES)await page.addStyleTag({url:href});
    await page.emulateMedia({reducedMotion:'reduce'});
    const shell=page.locator('.m26-shell[data-m26-role="'+task.role+'"]').first();
    await expect(shell).toBeVisible();
    const snapshot=await shell.evaluate(node=>{
      const css=getComputedStyle(node);
      const body=document.documentElement;
      return {
        role:node.getAttribute('data-m26-role'),
        material:css.getPropertyValue('--iberfit-v3-panel').trim().toLowerCase(),
        sourceAccent:css.getPropertyValue('--iberfit-v3-gold').trim().toLowerCase(),
        font:css.getPropertyValue('--iberfit-font-family-ui').trim(),
        documentWidth:body.scrollWidth,
        viewportWidth:body.clientWidth,
        stackedNav:Boolean(document.querySelector('.m26-mobile-nav,.m26-client-bottom-nav')),
      };
    });
    expect(snapshot.role).toBe(task.role);
    expect(snapshot.material).toBe(task.material);
    // B12: exact premium caramel remains a brand token; never relax role/device checks.
    expect(snapshot.sourceAccent).toBe('#ddc091');
    expect(snapshot.font).toContain('Inter Variable');
    expect(snapshot.documentWidth,task.role+' overflows at '+viewport.width).toBeLessThanOrEqual(snapshot.viewportWidth+2);

    const screenshot=OUT+'/'+testInfo.project.name+'-'+task.role+'.png';
    await captureEvidenceScreenshot(page,{path:screenshot,animations:'disabled',caret:'hide',fullPage:true});
    evidence.push({role:task.role,synthetic:true,viewport,material:snapshot.material,screenshot});
  }

  // The warm-paper Client status is intentionally distinct from a white
  // form regression; its actual rendered foreground/background must be AA.
  await page.goto(TASKS[0].path,{waitUntil:'domcontentloaded'});
  for(const href of SOURCE_STYLES)await page.addStyleTag({url:href});
  const proof=await page.evaluate(()=>{
    const route=document.querySelector('.m26-main');
    if(!route)return null;
    const node=document.createElement('section');
    node.className='m26-client-home-clear';
    node.innerHTML='<span aria-hidden="true">✓</span><div><strong>Día de recuperación</strong><small>Un momento para cuidar el progreso</small></div>';
    route.appendChild(node);
    const colors=els=>els.map(el=>getComputedStyle(el).color.match(/\d+(?:\.\d+)?/g)?.slice(0,3).map(Number)||[]);
    const bg=getComputedStyle(node).backgroundColor.match(/\d+(?:\.\d+)?/g)?.slice(0,3).map(Number);
    return {background:bg,foregrounds:colors([node.querySelector('strong'),node.querySelector('small')]),width:node.getBoundingClientRect().width,scrollWidth:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth};
  });
  expect(proof).not.toBeNull();
  expect(proof.background).toEqual([245,245,240]);
  for(const foreground of proof.foregrounds)expect(contrast(proof.background,foreground)).toBeGreaterThanOrEqual(4.5);
  expect(proof.scrollWidth).toBeLessThanOrEqual(proof.viewport+2);
  await writeFile(OUT+'/'+testInfo.project.name+'.json',JSON.stringify({schema:'iberfit.m41.visual-contract.v1',project:testInfo.project.name,synthetic:true,roles:evidence,paperAA:true},null,2)+'\n');
});
