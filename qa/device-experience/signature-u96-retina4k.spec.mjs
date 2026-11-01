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
        for(const family of ['Inter Variable','Source Serif 4 Variable']){
          expect(status.fontFaces.some(f=>f.family.includes(family)&&f.status==='loaded'),
            role+' '+device.key+' actual '+family+' webfont').toBe(true);
        }
        if(role==='client'){
          const week=page.locator('[data-client-week-rail]');
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
