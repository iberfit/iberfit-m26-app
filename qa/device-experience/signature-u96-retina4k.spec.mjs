import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

/*
 * U96 · Genuine IBERFIT renderer, canonical shell, self-hosted web fonts and
 * SVG icons measured at native physical resolution. This is synthetic QA:
 * no authentication, real client records, network writes or Stitch approval.
 * 1920 × 1080 CSS at DPR 2 = 3840 × 2160 PHYSICAL ("4K").
 */
const root='qa-evidence/signature-u96-retina4k';
const devices=[
  {key:'mobile',width:390,height:844,dpr:3,touch:true,mobile:true},
  {key:'tablet',width:820,height:1180,dpr:2,touch:true,mobile:true},
  {key:'desktop4k',width:1920,height:1080,dpr:2,touch:false,mobile:false},
];
const roles=['client','coach','admin'];
test('SIGNATURE U96 · 3 roles × 3 devices at native Retina/4K without rasterizing the interface',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='device-desktop-4k-chromium','Run once as an isolated 4K contract, no replicated CI browser matrix.');
  await mkdir(root,{recursive:true});
  const rows=[];
  for(const device of devices){
    const context=await browser.newContext({
      viewport:{width:device.width,height:device.height},
      deviceScaleFactor:device.dpr,
      isMobile:device.mobile,hasTouch:device.touch,
      locale:'es-CL',timezoneId:'America/Santiago',
      reducedMotion:'reduce',serviceWorkers:'block',
      baseURL:'http://127.0.0.1:4216',
    });
    try{
      for(const role of roles){
        const page=await context.newPage();
        const errors=[],writes=[];
        page.on('pageerror',e=>errors.push(String(e?.message||e)));
        page.on('request',r=>{
          if(!['GET','HEAD'].includes(r.method()))writes.push(r.method());
        });
        await page.goto('/qa/visual/signature-route-shell.fixture.html?role='+role+'&body=real');
        await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.bodyMode)).toBe('real-synthetic');
        const main=page.locator('.m26-main');
        await expect(main).toBeVisible();
        // Load the actual bundled variable fonts (not system-fallback screenshots).
        await page.evaluate(async()=>{
          await Promise.all([
            document.fonts.load('600 16px "Inter Variable"'),
            document.fonts.load('600 24px "Source Serif 4 Variable"'),
          ]);
          await document.fonts.ready;
        });
        const status=await page.evaluate(()=>{
          const fontFaces=[...document.fonts].map(f=>({family:f.family,status:f.status}));
          const mark=document.querySelector('img[src="/public/isotipo-iberfit.png"]');
          const mobileBrand=document.querySelector('.m26-topbar-brand-mark');
          const shell=document.querySelector('.m26-shell');
          const heading=document.querySelector('.m26-main h1,.m26-main h2,.m26-main h3');
          return {
            role:shell?.getAttribute('data-m26-role')||null,
            width:document.documentElement.clientWidth,
            overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth,document.body.scrollWidth-innerWidth),
            heading:heading?.textContent?.trim()||'',
            headingFont:heading?getComputedStyle(heading).fontFamily:'',
            svgIcons:document.querySelectorAll('svg[viewBox]').length,
            mark:mark?{loaded:mark.complete&&mark.naturalWidth>0,width:mark.naturalWidth,height:mark.naturalHeight,css:mark.getBoundingClientRect().width}:null,
            mobileBrand:mobileBrand?{visible:getComputedStyle(mobileBrand).display!=='none',width:mobileBrand.getBoundingClientRect().width,height:mobileBrand.getBoundingClientRect().height,loaded:mobileBrand.complete&&mobileBrand.naturalWidth===173&&mobileBrand.naturalHeight===192,top:mobileBrand.getBoundingClientRect().top,left:mobileBrand.getBoundingClientRect().left,right:mobileBrand.getBoundingClientRect().right,centerY:mobileBrand.getBoundingClientRect().top+mobileBrand.getBoundingClientRect().height/2,titleLeft:mobileBrand.nextElementSibling?.getBoundingClientRect().left,titleCenterY:(mobileBrand.nextElementSibling?.getBoundingClientRect().top||0)+(mobileBrand.nextElementSibling?.getBoundingClientRect().height||0)/2,headingDisplay:getComputedStyle(mobileBrand.parentElement).display,headingDirection:getComputedStyle(mobileBrand.parentElement).flexDirection}:null,
            fontFaces,
          };
        });
        expect(status.role).toBe(role);
        expect(status.width).toBe(device.width);
        expect(status.overflow,role+' '+device.key+' overflow').toBeLessThanOrEqual(2);
        expect(status.heading.length,role+' '+device.key+' actual route title').toBeGreaterThan(2);
        expect(status.svgIcons,role+' '+device.key+' vector UI icons').toBeGreaterThan(0);
        expect(status.mark,role+' '+device.key+' official logo element').not.toBeNull();
        expect(status.mark.loaded).toBe(true);
        expect(status.mark.width).toBe(173);
        expect(status.mark.height).toBe(192);
        expect(status.mark.css).toBeLessThanOrEqual(device.dpr===3?57:86);
        expect(status.mobileBrand).not.toBeNull();
        if(device.key==='mobile'){
          expect(status.mobileBrand.visible,role+' mobile official mark visible').toBe(true);
          expect(status.mobileBrand.loaded).toBe(true);
          expect(status.mobileBrand.width).toBe(34);
          expect(status.mobileBrand.height).toBe(38);
          expect(status.mobileBrand.headingDisplay).toBe('flex');
          expect(status.mobileBrand.headingDirection).toBe('row');
          expect(status.mobileBrand.titleLeft,'brand must precede mobile heading in the same row').toBeGreaterThanOrEqual(status.mobileBrand.right+5);
          expect(Math.abs(status.mobileBrand.centerY-status.mobileBrand.titleCenterY),'brand and title must share one visual baseline').toBeLessThanOrEqual(10);
        }else{
          expect(status.mobileBrand.visible,role+' no duplicate brand outside compact mobile').toBe(false);
        }
        for(const family of ['Inter Variable','Source Serif 4 Variable']){
          expect(status.fontFaces.some(f=>f.family.includes(family)&&f.status==='loaded'),
            role+' '+device.key+' actual '+family+' webfont').toBe(true);
        }
        if(role==='client'){
          const week=page.locator('[data-client-week-rail]');
          const compass=page.locator('[data-client-home-compass]');
          if(device.width>=1000){
            const actionBox=await page.locator('.m26-client-home-primary-zone').boundingBox();
            expect(actionBox,'visible Client primary card').not.toBeNull();
            expect(actionBox.height,'desktop CTA should hug its actual content').toBeLessThan(260);
          }
          await expect(compass).toBeVisible();
          const weekBox=await week.boundingBox();
          const contextBox=await compass.boundingBox();
          if(device.width>=1000){
            expect(contextBox?.x).toBeGreaterThanOrEqual((weekBox?.x||0)+(weekBox?.width||0)-2);
            expect(Math.abs((weekBox?.y||0)-(contextBox?.y||0))).toBeLessThanOrEqual(2);
          }else{
            expect(weekBox?.y).toBeLessThan(contextBox?.y);
          }
          await expect(week).toBeVisible();
          await expect(week.locator('li time[datetime]')).toHaveCount(7);
        }
        const png=await page.screenshot({type:'png',scale:'device',fullPage:false,animations:'disabled',caret:'hide'});
        expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
        const physical={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
        expect(physical.width,role+' '+device.key+' physical width').toBe(device.width*device.dpr);
        expect(physical.height,role+' '+device.key+' physical height').toBe(device.height*device.dpr);
        const filename=role+'-'+device.key+'-'+physical.width+'x'+physical.height+'-SYNTHETIC.png';
        await writeFile(path.join(root,filename),png);
        rows.push({role,device:device.key,css:{width:device.width,height:device.height},dpr:device.dpr,
          physical,vectorIcons:status.svgIcons,fontsLoaded:true,officialIsotipo:true,
          overflowPx:status.overflow,screenshot:filename,authenticated:false,stitchParityCertified:false});
        expect(errors,role+' '+device.key+' JS errors').toEqual([]);
        expect(writes,role+' '+device.key+' no network writes').toEqual([]);
        await page.close();
      }
    }finally{await context.close();}
  }
  expect(rows).toHaveLength(9);
  const summary={schema:'iberfit.signature.u96.retina4k-synthetic.v1',
    sourceCommit:process.env.GITHUB_SHA||null,
    approved:false,productionReady:false,authenticated:false,
    designParityCertified:false,realRenderer:true,roles,devices:devices.map(({key,width,height,dpr})=>({key,width,height,dpr})),rows};
  await writeFile(path.join(root,'manifest.json'),JSON.stringify(summary,null,2)+'\n','utf8');
});


// U101 · The genuine pinned FullCalendar draws Coach Agenda at native
// tablet/desktop resolution. This is isolated visual evidence: events are
// synthetic and do not emulate or claim any authenticated booking/publishing.
test('SIGNATURE U101 · genuine Coach day and week calendar at 820 tablet / 1440 desktop',async({browser},testInfo)=>{
  test.skip(testInfo.project.name!=='device-desktop-4k-chromium','one isolated CI screenshot batch');
  for(const device of [{name:'tablet820',width:820,height:1180,dpr:2,touch:true},{name:'desktop1440',width:1440,height:900,dpr:2,touch:false}]){
    const context=await browser.newContext({
      baseURL:'http://127.0.0.1:4216',
      viewport:{width:device.width,height:device.height},
      deviceScaleFactor:device.dpr,hasTouch:device.touch,isMobile:device.touch,
      locale:'es-CL',timezoneId:'America/Santiago',reducedMotion:'reduce',
      serviceWorkers:'block',
    });
    try{
      const page=await context.newPage();
      const writes=[],errors=[];
      page.on('request',req=>{if(!['GET','HEAD'].includes(req.method()))writes.push(req.method());});
      page.on('pageerror',e=>errors.push(String(e?.message||e)));
      await page.goto('/qa/visual/signature-route-shell.fixture.html?role=coach&body=real');
      await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__?.bodyMode)).toBe('real-synthetic');
      await page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.navigate('agenda'));
      await expect.poll(()=>page.evaluate(()=>globalThis.__IBERFIT_SIGNATURE_ROUTE_QA__.area())).toBe('agenda');
      const host=page.locator('[data-rc62-agenda-calendar]');
      await expect(host).toBeVisible();
      const ready=await page.evaluate(async()=>{
        const {loadFullCalendarStandard,fullCalendarCoachOptions}=await import('/src/m26/agenda/fullcalendar-agenda.js');
        const FullCalendar=await loadFullCalendarStandard();
        const el=document.querySelector('[data-rc62-agenda-calendar]');
        if(!el||!FullCalendar?.Calendar)throw new Error('U101_REAL_COACH_CALENDAR_MISSING');
        const events=[
          {id:'synthetic-a',title:'Sesión · ejemplo A',start:'2026-11-02T14:00:00Z',end:'2026-11-02T15:00:00Z'},
          {id:'synthetic-b',title:'Sesión · ejemplo B',start:'2026-11-03T16:00:00Z',end:'2026-11-03T17:00:00Z'},
        ];
        const options=fullCalendarCoachOptions({events,compact:false,initialDate:'2026-11-02T12:00:00Z'});
        const calendar=new FullCalendar.Calendar(el,options);
        calendar.render();
        return {view:calendar.view.type,timeZone:options.timeZone,editable:options.editable,selectable:options.selectable};
      });
      expect(ready).toEqual({view:'timeGridWeek',timeZone:'America/Santiago',editable:false,selectable:false});
      await expect(host.locator('.fc-toolbar-title')).toBeVisible();
      await expect(host.locator('.fc-timegrid-event')).toHaveCount(2);
      const palette=await host.evaluate(el=>{
        const root=getComputedStyle(el),toolbar=getComputedStyle(el.querySelector('.fc-toolbar-title'));
        return {background:root.getPropertyValue('--fc-page-bg-color').trim(),titleFamily:toolbar.fontFamily};
      });
      expect(palette.background).toBe('#101E17');
      expect(palette.titleFamily).toMatch(/Source Serif 4|Georgia/);
      for(const view of ['week','day']){
        if(view==='day'){
          await host.locator('.fc-timeGridDay-button').click();
          await expect(host.locator('.fc-view')).toHaveAttribute('class',/fc-timegrid-day-view/);
        }else{
          await expect(host.locator('.fc-view')).toHaveAttribute('class',/fc-timegrid-week-view/);
        }
        const box=await host.boundingBox();
        expect(box?.width).toBeGreaterThan(350);
        const buffer=await host.screenshot({type:'png',scale:'device',animations:'disabled',caret:'hide'});
        const physical=buffer.readUInt32BE(16);
        expect(Math.abs(physical-box.width*device.dpr)).toBeLessThanOrEqual(3);
        const filename='coach-agenda-'+device.name+'-'+view+'-DPR2-SYNTHETIC.png';
        await writeFile(path.join(root,filename),buffer);
      }
      expect(errors).toEqual([]);
      expect(writes).toEqual([]);
      await page.close();
    }finally{await context.close();}
  }
});
