import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

// Actual production route renderer + synthetic role/empty state, NEVER authenticated acceptance.
const inventory=JSON.parse(readFileSync(new URL('../visual/signature-360-coverage.json',import.meta.url),'utf8'));
const widths=new Set([320,390,768,1024,1440]);
for(const role of ['client','coach','admin']){
  test('SIGNATURE U25 '+role+' · real body composition, safety and no-freeze',async({page},testInfo)=>{
    const width=testInfo.project.use.viewport?.width;
    test.skip(!widths.has(width),'Canonical viewport sampling only.');
    const pageErrors=[],writes=[];
    page.on('pageerror',error=>pageErrors.push(String(error.message||error).slice(0,250)));
    page.on('request',request=>{if(request.method()!=='GET')writes.push(request.method());});
    await page.goto('/qa/visual/signature-route-shell.fixture.html?role='+role+'&body=real');
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.bodyMode)).toBe('real-synthetic');
    const entries=inventory.roles[role];
    expect(entries.length).toBe(role==='client'?9:17);
    for(const {area} of entries){
      const errorsBefore=pageErrors.length;
      await page.evaluate(area=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.navigate(area),area);
      await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.area()),{message:role+' '+area}).toBe(area);
      if(area==='admin-media-review'){
        // Production loads the Media Factory stylesheet dynamically on first entry.
        // The route is not paint-ready until the genuine stylesheet is available;
        // never assess document overflow against an intentionally unstyled frame.
        await expect.poll(()=>page.evaluate(()=>{
          const sheet=document.querySelector('link[data-m26-media-review-style]');
          return Boolean(sheet?.sheet);
        }),{message:'Admin Media Review production stylesheet must actually load'}).toBe(true);
      }
      const actual=await page.evaluate(()=>{
        const root=document.querySelector('.m26-shell'),main=document.querySelector('.m26-main');
        const body=main?.querySelector('.m26-client-route-shell,.m26-route,.m26-admin-route,.m26-communication-route,.m26-rc39-planning,.m26-rc39-sessions,[data-admin-media-review-route]');
        const title=body?.querySelector('h1,h2,h3')||main?.querySelector('h1,h2,h3');
        const rect=body?.getBoundingClientRect();
        return {role:root?.getAttribute('data-m26-role'),body:Boolean(body),visible:Boolean(rect&&rect.width>10&&rect.height>10),heading:Boolean(title&&title.textContent?.trim()),chars:String(body?.textContent||'').trim().length,placeholder:main?.querySelectorAll('.m26-route-placeholder')?.length||0,inert:main?.hasAttribute('inert')||false,width:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth),viewport:document.documentElement.clientWidth};
      });
      expect(pageErrors.slice(errorsBefore),role+' '+area+' page errors').toEqual([]);
      expect(actual.role,role+' '+area+' role boundary').toBe(role);
      expect(actual.body,role+' '+area+' real route body').toBe(true);
      expect(actual.visible,role+' '+area+' visible content').toBe(true);
      expect(actual.heading,role+' '+area+' heading').toBe(true);
      expect(actual.chars,role+' '+area+' substantive content').toBeGreaterThan(35);
      expect(actual.placeholder,role+' '+area+' no shell placeholder').toBe(0);
      expect(actual.inert,role+' '+area+' no frozen main').toBe(false);
      if(actual.width>actual.viewport+2){
        const offenders=await page.evaluate(()=>[...document.querySelectorAll('.m26-shell,.m26-workspace,.m26-main,.m26-main *')]
          .map(el=>({el,rect:el.getBoundingClientRect()}))
          .filter(({rect})=>rect.width>0&&rect.right>innerWidth+2)
          .sort((a,b)=>b.rect.right-a.rect.right).slice(0,12)
          .map(({el,rect})=>({tag:el.tagName.toLowerCase(),className:String(el.className?.baseVal??el.className??'').slice(0,130),left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)})));
        console.log('SIGNATURE_U25_OVERFLOW_GEOMETRY:'+JSON.stringify({role,area,viewport:actual.viewport,documentWidth:actual.width,offenders}));
      }
      expect(actual.width,role+' '+area+' no document overflow').toBeLessThanOrEqual(actual.viewport+2);
    }
    expect(writes,'Static QA may not mutate external services').toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
