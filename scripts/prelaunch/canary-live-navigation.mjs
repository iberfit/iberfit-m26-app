// A live Canary login may keep background GETs active indefinitely.
// Certification therefore waits for a complete document and a visible,
// interactive login surface rather than global network silence. The caller
// still enforces exact SHA, QA runtime, UI, errors, privacy and read-only rules.
export async function navigateCanaryLiveForCertification(page,url,{
  navigationTimeoutMs=45_000,
  readinessTimeoutMs=30_000,
}={}){
  const response=await page.goto(url,{
    waitUntil:'domcontentloaded',
    timeout:navigationTimeoutMs,
  });
  // The load event and the usable login are separate requirements.
  // Fail closed if either never materializes; do not swallow timeouts.
  await page.waitForFunction(()=>document.readyState==='complete',null,{
    timeout:readinessTimeoutMs,
  });
  await page.locator('form[data-auth-form="login"]').waitFor({
    state:'visible',
    timeout:readinessTimeoutMs,
  });
  return response;
}
