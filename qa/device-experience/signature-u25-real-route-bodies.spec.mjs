import {test,expect} from '@playwright/test';
import axe from 'axe-core';
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
    // The standard Admin fixture intentionally denies capabilities. For layout
    // coverage, opt in to the separate fictitious Admin permission set; the
    // fail-closed default is still checked by U106. No real Auth/RLS is used.
    const adminOptIn=role==='admin'?'&adminSurface=authorized-synthetic':'';
    await page.goto('/qa/visual/signature-route-shell.fixture.html?role='+role+'&body=real'+adminOptIn);
    await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.bodyMode)).toBe('real-synthetic');
    if(role==='admin')await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.adminSurface))
      .toBe('authorized-synthetic');
    const entries=inventory.roles[role];

    // U60: exercise the genuine route renderer, not mock page markup. Only two
    // canonical device projects attach retina visual evidence and run axe;
    // all projects still sweep the full 43-route responsive matrix.
    const visualEvidenceProject=['device-mobile-chromium','device-desktop-chromium'].includes(testInfo.project.name);
    const priorityAreas=role==='client'?new Set(['hoy','sesion'])
      :role==='coach'?new Set(['hoy','sesion'])
      :new Set(['admin-inicio','admin-usuarios','admin-clientes','admin-operaciones']);
    if(visualEvidenceProject)await page.addScriptTag({content:axe.source});

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
        return {role:root?.getAttribute('data-m26-role'),body:Boolean(body),visible:Boolean(rect&&rect.width>10&&rect.height>10),heading:Boolean(title&&title.textContent?.trim()),chars:String(body?.textContent||'').trim().length,placeholder:main?.querySelectorAll('.m26-route-placeholder')?.length||0,
          permissionDenied:Boolean([...main?.querySelectorAll('h1,h2,h3')||[]]
            .some(h=>h.textContent?.trim()==='Permiso insuficiente')),
          inert:main?.hasAttribute('inert')||false,width:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth),viewport:document.documentElement.clientWidth};
      });
      expect(pageErrors.slice(errorsBefore),role+' '+area+' page errors').toEqual([]);
      expect(actual.role,role+' '+area+' role boundary').toBe(role);
      expect(actual.body,role+' '+area+' real route body').toBe(true);
      expect(actual.visible,role+' '+area+' visible content').toBe(true);
      expect(actual.heading,role+' '+area+' heading').toBe(true);
      expect(actual.chars,role+' '+area+' substantive content').toBeGreaterThan(35);
      expect(actual.placeholder,role+' '+area+' no shell placeholder').toBe(0);
      if(role==='admin')expect(actual.permissionDenied,'Admin '+area+' must be the real authorized synthetic body, not a denial screen').toBe(false);
      expect(actual.inert,role+' '+area+' no frozen main').toBe(false);
      // U110: authorized Admin data must expose the final action column on touch.
      if(role==='admin'&&area==='admin-clientes'){
        const region=page.locator('.m26-admin-table[role="region"]').first();
        await expect(region).toBeVisible();
        const table=await region.evaluate(el=>{
          const headings=[...el.querySelectorAll('thead th')],last=headings.at(-1);
          const before=el.scrollLeft;
          el.scrollLeft=el.scrollWidth;
          const after=el.scrollLeft,scrollRect=el.getBoundingClientRect();
          const lastRect=last?.getBoundingClientRect();
          const result={label:el.getAttribute('aria-label'),tabindex:el.tabIndex,
            headings:headings.map(h=>h.textContent.trim()),
            columnScopes:headings.every(h=>h.scope==='col'),
            scrollable:el.scrollWidth>el.clientWidth+2,
            scrolled:after>before,
            finalColumnVisible:Boolean(lastRect&&lastRect.right<=scrollRect.right+2&&lastRect.left>=scrollRect.left-2)};
          el.scrollLeft=before;
          return result;
        });
        expect(table.tabindex,'Admin table keyboard focus').toBe(0);
        expect(table.label).toBeTruthy();
        expect(table.columnScopes).toBe(true);
        expect(table.headings.at(-1)).toBe('Gestión');
        if(width<=390){
          expect(table.scrollable,'Admin table should scroll rather than squash columns').toBe(true);
          expect(table.scrolled,'Admin table must scroll sideways').toBe(true);
          expect(table.finalColumnVisible,'Admin final action column fully inspectable').toBe(true);
        }
      }

      // U94: real calendar date semantics must survive all device widths
      // without implying unverified sessions, health outcomes or writes.
      if(role==='client'&&area==='hoy'){
        const week=page.locator('[data-client-week-rail]');
        const primary=page.locator('.m26-client-home-primary-zone');
        const compass=page.locator('[data-client-home-compass]');
        await expect(primary).toBeVisible();
        await expect(compass).toBeVisible();
        const positions=await Promise.all([primary,week,compass].map(x=>x.boundingBox()));
        expect(positions.every(Boolean)).toBe(true);
        expect(positions[1].y,'week follows action').toBeGreaterThan(positions[0].y);
        if(width>=1000){
          expect(positions[2].x,'desktop context right of week').toBeGreaterThan(positions[1].x+positions[1].width-2);
          expect(Math.abs(positions[2].y-positions[1].y),'desktop week and context share a row').toBeLessThanOrEqual(2);
        }else{
          expect(positions[2].y,'touch context follows week').toBeGreaterThan(positions[1].y);
        }
        await expect(week).toBeVisible();
        await expect(week.locator('li time[datetime]')).toHaveCount(7);
        await expect(week.locator('button[data-m26-area="planificacion"]')).toHaveCount(1);
        expect(await week.locator('li.has-confirmed').count()).toBe(0);
      }

      if(visualEvidenceProject&&priorityAreas.has(area)){
        const checked=await page.evaluate(async()=>{
          const main=document.querySelector('.m26-main');
          if(!main)return [{id:'no-main',impact:'critical',nodes:1}];
          const result=await window.axe.run(main,{
            runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']},
          });
          return result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,
            targets:v.nodes.slice(0,8).map(n=>({selector:n.target,html:n.html?.slice(0,160),
              failure:n.failureSummary?.slice(0,260)}))}));
        });
        if(checked.length&&role==='client'&&area==='hoy'){
          const tree=await page.evaluate(()=>{
            const el=document.querySelector('summary[data-m26-client-guide="secondary-actions"] > span');
            if(!el)return {error:'MISSING_GUIDE'};
            const a=[];let x=el;
            while(x&&a.length<9){
              const c=getComputedStyle(x);
              a.push({tag:x.tagName,cls:x.className,opacity:c.opacity,filter:c.filter,
                visibility:c.visibility,display:c.display,color:c.color,background:c.backgroundColor,
                pointerEvents:c.pointerEvents,ariaHidden:x.getAttribute('aria-hidden')});
              x=x.parentElement;
            }
            return a;
          });
          console.log('SIGNATURE_U90_GUIDE_OPACITY_TREE:'+JSON.stringify(tree));
        }
        expect(checked,role+' '+area+' P0 visual accessibility').toEqual([]);
        const isMobile=width<=390;
        const geometry=await page.evaluate(()=>{
          const root=document.querySelector('.m26-shell'),main=document.querySelector('.m26-main');
          const route=main?.querySelector('.m26-client-route-shell,.m26-route,.m26-admin-route,.m26-communication-route,.m26-rc39-planning,.m26-rc39-sessions');
          const h=route?.querySelector('h1,h2,h3');
          if(!route||!h)return null;
          const title=getComputedStyle(h),surface=getComputedStyle(route);
          const rect=route.getBoundingClientRect();
          return {
            titleFont:title.fontFamily,
            titleSize:parseFloat(title.fontSize),
            titleVisible:h.getBoundingClientRect().width>0,
            routeMinWidth:surface.minWidth,
            routeWidth:rect.width,
            viewport:document.documentElement.clientWidth,
            role:root?.dataset.m26Role,
          };
        });
        expect(geometry,role+' '+area+' layout evidence').not.toBeNull();
        expect(geometry?.titleVisible).toBe(true);
        expect(geometry?.titleSize).toBeGreaterThanOrEqual(14);
        expect(geometry?.routeWidth).toBeGreaterThan(50);
        expect(geometry?.routeWidth).toBeLessThanOrEqual(geometry?.viewport+2);
        expect(geometry?.role).toBe(role);
        if(isMobile)expect(geometry?.routeWidth).toBeGreaterThan(250);
        const image=await page.screenshot({fullPage:true,animations:'disabled',caret:'hide'});
        await testInfo.attach('signature-u60-'+role+'-'+area+'-'+testInfo.project.name+'.png',{
          body:image,contentType:'image/png'
        });
      }

      if(actual.width>actual.viewport+2){
        const offenders=await page.evaluate(()=>[...document.querySelectorAll('.m26-shell,.m26-workspace,.m26-main,.m26-main *')]
          .map(el=>({el,rect:el.getBoundingClientRect()}))
          .filter(({rect})=>rect.width>0&&rect.right>innerWidth+2)
          .sort((a,b)=>b.rect.right-a.rect.right).slice(0,12)
          .map(({el,rect})=>({tag:el.tagName.toLowerCase(),className:String(el.className?.baseVal??el.className??'').slice(0,130),left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)})));
        const roots=await page.evaluate(()=>{
          const keys=['html','body','.m26-shell','.m26-workspace','.m26-main','.m26-media-review-route','.m26-media-control-tools','.m26-media-control-summary','.m26-media-review-hero'];
          return keys.map((selector)=>{
            const el=document.querySelector(selector);
            if(!el)return {selector,present:false};
            const rect=el.getBoundingClientRect();
            return {selector,present:true,left:Math.round(rect.left),right:Math.round(rect.right),
              width:Math.round(rect.width),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
              boxSizing:getComputedStyle(el).boxSizing};
          });
        });
        console.log('SIGNATURE_U25_OVERFLOW_GEOMETRY:'+JSON.stringify({role,area,viewport:actual.viewport,documentWidth:actual.width,offenders,roots}));
      }
      expect(actual.width,role+' '+area+' no document overflow').toBeLessThanOrEqual(actual.viewport+2);
    }
    expect(writes,'Static QA may not mutate external services').toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
