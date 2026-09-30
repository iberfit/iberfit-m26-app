const TRANSIENT_SCREENSHOT_ERROR=/Protocol error \(Page\.captureScreenshot\): Unable to capture screenshot|Page\.captureScreenshot[^\n]*Unable to capture screenshot/iu;

export function isTransientScreenshotError(error){
  return TRANSIENT_SCREENSHOT_ERROR.test(String(error?.message||error||''));
}

export async function captureEvidenceScreenshot(page,options,{maxAttempts=2,settleMs=150}={}){
  if(typeof page?.screenshot!=='function')throw new Error('IBERFIT_QA_SCREENSHOT_PAGE_REQUIRED');
  const attempts=Math.max(1,Math.min(3,Math.trunc(Number(maxAttempts)||2)));
  const delay=Math.max(0,Math.min(1000,Math.trunc(Number(settleMs)||150)));

  for(let attempt=1;attempt<=attempts;attempt+=1){
    try{
      return await page.screenshot(options);
    }catch(error){
      if(!isTransientScreenshotError(error)||attempt===attempts)throw error;
      if(typeof page.waitForTimeout==='function')await page.waitForTimeout(delay);
      else if(delay>0)await new Promise((resolve)=>setTimeout(resolve,delay));
      try{
        await page.evaluate(async()=>{
          await document.fonts?.ready;
          await new Promise((resolve)=>requestAnimationFrame(()=>resolve()));
        });
      }catch{}
    }
  }

  throw new Error('IBERFIT_QA_SCREENSHOT_UNREACHABLE');
}
