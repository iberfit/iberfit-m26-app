const VERSION='m26-rc63-2';
const PREVIOUS_VERSION='m26-rc63-1';
// Historical compatibility markers retained for regression evidence: m26-rc63-2, m26-rc63-1, m26-rc62-3, m26-rc62-2, m26-rc62-1, m26-rc61-2, m26-rc61-1, m26-rc60-2b, m26-rc60-2a, m26-rc60-1, m26-rc59-6, m26-rc59-5, m26-rc59-4, m26-rc59-3, m26-rc59-2, m26-rc59-1, m26-rc59-0c3, m26-rc59-0c1, m26-rc59-0c-design, m26-rc59-0b, m26-rc59-0a, m26-rc58-6, m26-rc58-5c-b, m26-rc28, m26-rc27, m26-rc23, m26-rc19, m26-rc17.
const SHELL=`iberfit-${VERSION}-shell`;
const OFFLINE='/m26/offline.html';
const APP_SHELL=/* RC58_GENERATED_APP_SHELL */["/baseline_m25_2/exercise-catalog-m25.json","/m26/app.js","/m26/fonts/inter-latin-wght-normal.woff2","/m26/fonts/source-serif-4-latin-wght-normal.woff2","/m26/icons/apple-touch-icon-180.png","/m26/icons/icon-192.png","/m26/icons/icon-512.png","/m26/icons/icon-maskable-192.png","/m26/icons/icon-maskable-512.png","/m26/index.html","/m26/iri-report.css","/m26/iri-report.html","/m26/manifest.webmanifest","/m26/offline.css","/m26/offline.html","/m26/offline.js","/m26/preauth-critical.css","/m26/vendor/echarts-6.1.0.esm.min.js","/public/iberfit/exercises/iberfit-exercise-media-v1.json","/public/iberfit/exercises/iberfit-exercise-media-v2.json","/public/isotipo-iberfit.png","/public/vendor/repdb/iberfit-canonical-media-map-v1.json","/src/m26/admin/admin-state.js","/src/m26/admin/admin.css","/src/m26/admin/command-catalog.js","/src/m26/admin/command-center.js","/src/m26/admin/controller.js","/src/m26/admin/index.js","/src/m26/admin/navigation.js","/src/m26/admin/permission-policy.js","/src/m26/admin/route-render.js","/src/m26/admin/service.js","/src/m26/admin/shell-enhancer.js","/src/m26/admin/transport.js","/src/m26/admin/view-model.js","/src/m26/agenda/fullcalendar-agenda.js","/src/m26/app/access-ui.js","/src/m26/app/application.js","/src/m26/app/index.js","/src/m26/app/password-recovery.js","/src/m26/app/session-vault.js","/src/m26/app/webauthn.js","/src/m26/app/workflow-controller.js","/src/m26/canonical-store.js","/src/m26/command-bus.js","/src/m26/command-catalog.js","/src/m26/communication/command-catalog.js","/src/m26/communication/communication.css","/src/m26/communication/controller.js","/src/m26/communication/index.js","/src/m26/communication/route-render.js","/src/m26/communication/service.js","/src/m26/communication/state.js","/src/m26/communication/transport.js","/src/m26/communication/view-model.js","/src/m26/data-experience/data-trust.js","/src/m26/data-experience/echarts-element.js","/src/m26/data-experience/index.js","/src/m26/data-experience/longitudinal-ui.js","/src/m26/design/adaptive-layout.css","/src/m26/design/auth-native.css","/src/m26/design/icons.css","/src/m26/design/icons.js","/src/m26/design/premium-ux.css","/src/m26/design/primitives.css","/src/m26/design/primitives.js","/src/m26/design/role-surfaces.css","/src/m26/design/role-surfaces.js","/src/m26/design/tokens.css","/src/m26/design/tokens.generated.js","/src/m26/design/typography.css","/src/m26/domain/appointment.js","/src/m26/domain/civil-date.js","/src/m26/domain/client-profile.js","/src/m26/domain/modality.js","/src/m26/engagement/activity-capabilities.js","/src/m26/engagement/activity-drafts.js","/src/m26/engagement/adherence-engine.js","/src/m26/engagement/challenge-metrics.js","/src/m26/engagement/command-builders.js","/src/m26/engagement/command-service.js","/src/m26/engagement/conflict-center.js","/src/m26/engagement/engagement-controller.js","/src/m26/engagement/exercise-performance-engine.js","/src/m26/engagement/index.js","/src/m26/engagement/progress-engine.js","/src/m26/exercises/castellano.js","/src/m26/exercises/catalog.js","/src/m26/exercises/index.js","/src/m26/exercises/search.js","/src/m26/experience/adaptive-experience.js","/src/m26/experience/client-experience.js","/src/m26/experience/coach-cockpit.js","/src/m26/guidance/contextual-guidance.js","/src/m26/index.js","/src/m26/intelligence/adaptive-context.js","/src/m26/intelligence/decision-brief.js","/src/m26/intelligence/index.js","/src/m26/intelligence/live-session-intelligence.js","/src/m26/intelligence/longitudinal-aggregation.js","/src/m26/intelligence/session-engine.js","/src/m26/library/exercise-media-observability.js","/src/m26/library/exercise-media-ui.js","/src/m26/library/exercise-media.js","/src/m26/library/exercise-video-player.js","/src/m26/modules/domain-selectors.js","/src/m26/modules/index.js","/src/m26/modules/route-render.js","/src/m26/modules/route-view-model.js","/src/m26/motion/motion-controller.js","/src/m26/norms/evidence-registry.js","/src/m26/norms/iri-scoring.js","/src/m26/norms/norms-engine.js","/src/m26/onboarding/progressive-onboarding.js","/src/m26/platform/id.js","/src/m26/platform/index.js","/src/m26/platform/key-value-store.js","/src/m26/platform/latest-task.js","/src/m26/platform/offline-command-repository.js","/src/m26/platform/pwa.js","/src/m26/privacy/device-data.js","/src/m26/production-state.js","/src/m26/productivity/bulk-preparation.js","/src/m26/productivity/coach-productivity.js","/src/m26/productivity/large-list-policy.js","/src/m26/productivity/session-reuse.js","/src/m26/publication/client-content.js","/src/m26/publication/index.js","/src/m26/qa/authenticated-canary.js","/src/m26/quality/runtime-observability.js","/src/m26/rc39/agenda-extension.js","/src/m26/rc39/calendar.js","/src/m26/rc39/controller.js","/src/m26/rc39/multi-role.js","/src/m26/rc39/rc39.css","/src/m26/rc39/route-render.js","/src/m26/rc39/session-policy.js","/src/m26/rc39/shell-enhancer.js","/src/m26/rc39/transport.js","/src/m26/rc39/view-model.js","/src/m26/rc42/rc42.css","/src/m26/rc44/rc44.css","/src/m26/security/index.js","/src/m26/security/role-projection.js","/src/m26/shared/application-context.js","/src/m26/shared/index.js","/src/m26/shared/integration-context.js","/src/m26/shared/permission-set.js","/src/m26/shell/index.js","/src/m26/shell/navigation.js","/src/m26/shell/role-policy.js","/src/m26/shell/route-guard.js","/src/m26/shell/shell-controller.js","/src/m26/shell/shell-render.js","/src/m26/shell/shell-view-model.js","/src/m26/shell/shell.css","/src/m26/supabase-transport.js","/src/m26/telemetry/bounded-timeline.js","/src/m26/telemetry/canonical-telemetry.js","/src/m26/telemetry/durable-outbox.js","/src/m26/telemetry/index.js","/src/m26/telemetry/persistence-contract.js","/src/m26/telemetry/remote-sync.js","/src/m26/ui/action-state.js","/src/m26/ui/castellano.js","/src/m26/ui/client-360.js","/src/m26/ui/client-bottom-nav.css","/src/m26/ui/design-system.js","/src/m26/ui/i18n.js","/src/m26/ui/index.js","/src/m26/ui/interactive-audit.js","/src/m26/ui/native-workspace.js","/src/m26/ui/preferences.js","/src/m26/vendor/fullcalendar-7.0.2/all.global.js","/src/m26/vendor/fullcalendar-7.0.2/es.global.js","/src/m26/vendor/fullcalendar-7.0.2/monarch.global.js","/src/m26/vendor/fullcalendar-7.0.2/monarch.purple.css","/src/m26/vendor/fullcalendar-7.0.2/monarch.theme.css","/src/m26/vendor/fullcalendar-7.0.2/skeleton.css","/src/m26/vendor/fuse-7.5.0.basic.min.js","/src/m26/wearables/bridge-service.js","/src/m26/wearables/connection-state.js","/src/m26/wearables/contracts.js","/src/m26/wearables/controller.js","/src/m26/wearables/device-layer.js","/src/m26/wearables/free-policy.js","/src/m26/wearables/historical-acquisition.js","/src/m26/wearables/index.js","/src/m26/wearables/live-telemetry.js","/src/m26/wearables/native-transport.js","/src/m26/wearables/normalization.js","/src/m26/wearables/remote-sync.js","/src/m26/wearables/view-model.js","/src/m26/workflows/agenda-workflow.js","/src/m26/workflows/client-onboarding.js","/src/m26/workflows/confirmed-execution.js","/src/m26/workflows/draft-store.js","/src/m26/workflows/index.js","/src/m26/workflows/iri-external-report-controller.js","/src/m26/workflows/iri-external-report.css","/src/m26/workflows/iri-first-session.js","/src/m26/workflows/iri-profile.js","/src/m26/workflows/iri-protocol-catalog.js","/src/m26/workflows/iri-report-document.js","/src/m26/workflows/iri-report-page.js","/src/m26/workflows/iri-workflow.js","/src/m26/workflows/planning-workflow.js","/src/m26/workflows/publication-workflow.js","/src/m26/workflows/report-workflow.js","/src/m26/workflows/session-builder.js","/src/m26/workflows/session-controller.js","/src/m26/workflows/session-execution.js","/src/m26/workflows/session-recovery.js","/src/m26/workflows/session-timer.js","/src/m26/workflows/session-ui.js"];
const NEVER_CACHE_PREFIXES=['/auth/v1/','/api/','/rest/v1/','/rpc/','/functions/'];
const NEVER_CACHE_MEDIA_PREFIXES=['/public/iberfit/exercises/video/'];
const CACHEABLE_PREFIXES=['/m26/','/src/m26/','/baseline_m25_2/','/public/iberfit/exercises/','/public/vendor/repdb/'];
const CACHE_FIRST_PATHS=new Set(['/m26/manifest.webmanifest','/public/isotipo-iberfit.png','/baseline_m25_2/exercise-catalog-m25.json','/public/iberfit/exercises/iberfit-exercise-media-v1.json','/public/iberfit/exercises/iberfit-exercise-media-v2.json','/public/vendor/repdb/iberfit-canonical-media-map-v1.json','/m26/icons/icon-192.png','/m26/icons/icon-512.png','/m26/icons/icon-maskable-192.png','/m26/icons/icon-maskable-512.png','/m26/icons/apple-touch-icon-180.png']);
function isRuntimeConfig(pathname){return pathname==='/m26/runtime-config.js'||pathname==='/m26/runtime-config.example.js';}
function isProtected(request,url){return request.method!=='GET'||url.origin!==self.location.origin||NEVER_CACHE_PREFIXES.some((prefix)=>url.pathname.startsWith(prefix))||NEVER_CACHE_MEDIA_PREFIXES.some((prefix)=>url.pathname.startsWith(prefix))||isRuntimeConfig(url.pathname);}
function isCacheablePath(pathname){return CACHEABLE_PREFIXES.some((prefix)=>pathname.startsWith(prefix))||pathname==='/public/isotipo-iberfit.png';}
function shouldStore(response){return response?.ok&&response.type!=='opaqueredirect'&&!/no-store/i.test(response.headers?.get?.('cache-control')||'');}
async function fetchShellAsset(cache,url){
  const response=await fetch(
    url,
    {
      cache:'reload',
      credentials:'same-origin',
      redirect:'error',
    }
  );
  if(!response.ok)throw new Error(`M26_SW_SHELL_MISSING:${url}`);
  await cache.put(url,response);
}
async function installShell(){
  const cache=await caches.open(SHELL);
  const queue=[...APP_SHELL];
  const workerCount=Math.min(8,Math.max(1,queue.length));
  await Promise.all(
    Array.from(
      {length:workerCount},
      async()=>{
        while(queue.length){
          const url=queue.shift();
          if(!url)continue;
          await fetchShellAsset(cache,url);
        }
      }
    )
  );
}
async function cacheFirst(request,event){
  const cache=await caches.open(SHELL);
  const cached=await cache.match(request);
  const update=fetch(
    request,
    {
      credentials:'same-origin',
      redirect:'error',
    }
  )
    .then((response)=>{
      if(shouldStore(response)){
        event.waitUntil(cache.put(request,response.clone()));
      }
      return response;
    })
    .catch(()=>null);
  return cached||await update||Response.error();
}
async function networkFirst(request,{fallback=null,event}={}){
  try{
    const response=await fetch(
      request,
      {
        credentials:'same-origin',
        redirect:'error',
      }
    );
    if(shouldStore(response)){
      const copy=response.clone();
      event?.waitUntil(
        caches
          .open(SHELL)
          .then((cache)=>cache.put(request,copy))
      );
    }
    return response;
  }catch{
    const cached=await caches.match(request);
    if(cached)return cached;
    if(fallback){
      const offline=await caches.match(fallback);
      if(offline)return offline;
    }
    return Response.error();
  }
}
self.addEventListener('install',(event)=>event.waitUntil(installShell()));
self.addEventListener(
  'activate',
  (event)=>event.waitUntil(
    caches
      .keys()
      .then(
        (keys)=>Promise.all(
          keys
            .filter(
              (key)=>
                key.startsWith('iberfit-m26-') &&
                key!==SHELL
            )
            .map((key)=>caches.delete(key))
        )
      )
      .then(()=>self.clients.claim())
  )
);
self.addEventListener(
  'message',
  (event)=>{
    if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
  }
);
self.addEventListener(
  'fetch',
  (event)=>{
    const request=event.request;
    const url=new URL(request.url);

    if(isProtected(request,url)||!isCacheablePath(url.pathname))return;

    if(request.mode==='navigate'){
      if(!url.pathname.startsWith('/m26/'))return;

      event.respondWith(
        networkFirst(
          request,
          {
            fallback:'/m26/index.html',
            event,
          }
        ).then(
          async(response)=>
            response.ok
              ?response
              :await caches.match(OFFLINE)||response
        )
      );
      return;
    }

    if(
      CACHE_FIRST_PATHS.has(url.pathname) ||
      /\.(?:png|webp|woff2|webmanifest)$/iu.test(url.pathname) ||
      /^\/public\/iberfit\/exercises\/images\/[A-Za-z0-9][A-Za-z0-9._:-]{0,199}\/(?:main|start|peak)\.webp$/u.test(url.pathname) ||
      /^\/public\/vendor\/repdb\/images\/flat\/[a-z0-9-]+-(?:main|start|peak)\.webp$/u.test(url.pathname)
    ){
      event.respondWith(cacheFirst(request,event));
      return;
    }

    event.respondWith(networkFirst(request,{event}));
  }
);
