import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const SPEC_URL=new URL('./admin-webauthn-recurring.spec.mjs',import.meta.url);
const CHECK_ONLY=process.argv.includes('--check');

const BEFORE_MARKER=`  expect(hitTarget,'Biblioteca must receive touch pointer events').toBe(true);\n\n  const routeStateBeforeTap=await page.evaluate(()=>{`;
const AFTER_MARKER=`  const routeStateAfterTap=await mobileRouteState(page);\n\n  let routeStateAfterDomClick=null;`;

const BEFORE_REPLACEMENT=`  expect(hitTarget,'Biblioteca must receive touch pointer events').toBe(true);\n\n  await page.evaluate(()=>{\n    globalThis.__IBERFIT_ADMIN_MOBILE_EVENT_DIAG__?.cleanup?.();\n    const details=document.querySelector('details.m26-mobile-more');\n    const summary=details?.querySelector?.(':scope > summary')||null;\n    const menu=details?.querySelector?.('.m26-mobile-more-menu')||null;\n    const library=menu?.querySelector?.('[data-m26-area="biblioteca"]')||null;\n    const root=document.querySelector('#app');\n    const records=[];\n    const removers=[];\n    const startedAt=performance.now();\n\n    const describeNode=(node)=>{\n      if(!node)return null;\n      if(node===document)return 'document';\n      if(node===window)return 'window';\n      const tag=String(node.tagName||node.nodeName||'').toLowerCase();\n      const id=node.id?('#'+node.id):'';\n      const cls=String(node.className||'').trim().split(/\\s+/u).filter(Boolean).slice(0,4).map((item)=>'.'+item).join('');\n      const area=node.getAttribute?.('data-m26-area');\n      return tag+id+cls+(area?('[data-m26-area="'+area+'"]'):'');\n    };\n    const stateArea=()=>String(globalThis.__IBERFIT_M26_APP__?.getState?.()?.activeArea||'');\n    const touchList=(value)=>{\n      try{return [...(value||[])].map((item)=>({identifier:Number(item.identifier),clientX:Number(item.clientX),clientY:Number(item.clientY)}));}\n      catch{return [];}\n    };\n    const coords=(event)=>{\n      const changed=touchList(event?.changedTouches);\n      const touch=changed[0]||null;\n      const x=Number.isFinite(Number(event?.clientX))?Number(event.clientX):touch?.clientX;\n      const y=Number.isFinite(Number(event?.clientY))?Number(event.clientY):touch?.clientY;\n      return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;\n    };\n    const hitStack=(event)=>{\n      const point=coords(event);\n      if(!point||typeof document.elementsFromPoint!=='function')return [];\n      return document.elementsFromPoint(point.x,point.y).slice(0,8).map(describeNode);\n    };\n    const record=(scope,capture,event)=>{\n      records.push({\n        dt:Number((performance.now()-startedAt).toFixed(3)),\n        scope,\n        capture:Boolean(capture),\n        type:String(event?.type||''),\n        eventPhase:Number(event?.eventPhase||0),\n        isTrusted:Boolean(event?.isTrusted),\n        defaultPrevented:Boolean(event?.defaultPrevented),\n        target:describeNode(event?.target),\n        currentTarget:describeNode(event?.currentTarget),\n        pointerType:String(event?.pointerType||''),\n        pointerId:event?.pointerId===undefined?null:Number(event.pointerId),\n        isPrimary:event?.isPrimary===undefined?null:Boolean(event.isPrimary),\n        clientX:Number.isFinite(Number(event?.clientX))?Number(event.clientX):null,\n        clientY:Number.isFinite(Number(event?.clientY))?Number(event.clientY):null,\n        button:event?.button===undefined?null:Number(event.button),\n        buttons:event?.buttons===undefined?null:Number(event.buttons),\n        detail:event?.detail===undefined?null:Number(event.detail),\n        touches:touchList(event?.touches),\n        changedTouches:touchList(event?.changedTouches),\n        path:typeof event?.composedPath==='function'?event.composedPath().slice(0,10).map(describeNode):[],\n        hitStack:hitStack(event),\n        moreOpen:Boolean(details?.open||details?.hasAttribute?.('open')),\n        activeArea:stateArea(),\n      });\n    };\n    const add=(scope,node,type,capture)=>{\n      if(!node?.addEventListener)return;\n      const handler=(event)=>record(scope,capture,event);\n      node.addEventListener(type,handler,{capture,passive:true});\n      removers.push(()=>node.removeEventListener(type,handler,capture));\n    };\n    const eventTypes=['pointerdown','pointerup','pointercancel','touchstart','touchend','touchcancel','mousedown','mouseup','click'];\n    for(const [scope,node] of [['document',document],['app',root],['details',details],['summary',summary],['menu',menu],['library',library]]){\n      for(const type of eventTypes){\n        add(scope,node,type,true);\n        add(scope,node,type,false);\n      }\n    }\n    add('details',details,'toggle',true);\n    add('details',details,'toggle',false);\n\n    const observer=details&&typeof MutationObserver==='function'?new MutationObserver((mutations)=>{\n      for(const mutation of mutations){\n        if(mutation.type!=='attributes'||mutation.attributeName!=='open')continue;\n        records.push({\n          dt:Number((performance.now()-startedAt).toFixed(3)),\n          scope:'details-observer',\n          capture:false,\n          type:'open-attribute-mutation',\n          eventPhase:0,\n          isTrusted:null,\n          defaultPrevented:null,\n          target:describeNode(details),\n          currentTarget:null,\n          pointerType:'',\n          pointerId:null,\n          isPrimary:null,\n          clientX:null,\n          clientY:null,\n          button:null,\n          buttons:null,\n          detail:null,\n          touches:[],\n          changedTouches:[],\n          path:[],\n          hitStack:[],\n          moreOpen:Boolean(details?.open||details?.hasAttribute?.('open')),\n          activeArea:stateArea(),\n        });\n      }\n    }):null;\n    observer?.observe?.(details,{attributes:true,attributeFilter:['open']});\n\n    globalThis.__IBERFIT_ADMIN_MOBILE_EVENT_DIAG__={\n      records,\n      bridgePresent:Boolean(globalThis.__IBERFIT_M26_MOBILE_MORE_TOUCH_RETARGET_V1__),\n      bridgeKeys:Object.keys(globalThis.__IBERFIT_M26_MOBILE_MORE_TOUCH_RETARGET_V1__||{}),\n      initial:{\n        moreOpen:Boolean(details?.open||details?.hasAttribute?.('open')),\n        activeArea:stateArea(),\n        maxTouchPoints:Number(navigator.maxTouchPoints||0),\n        coarsePointer:Boolean(matchMedia?.('(pointer: coarse)')?.matches),\n      },\n      cleanup(){\n        observer?.disconnect?.();\n        for(const remove of removers.splice(0))remove();\n      },\n    };\n  });\n\n  const routeStateBeforeTap=await page.evaluate(()=>{`;

const AFTER_REPLACEMENT=`  const routeStateAfterTap=await mobileRouteState(page);\n  const mobileEventDiagAfterTap=await page.evaluate(()=>{\n    const diag=globalThis.__IBERFIT_ADMIN_MOBILE_EVENT_DIAG__||{};\n    diag.cleanup?.();\n    return {\n      bridgePresent:Boolean(diag.bridgePresent),\n      bridgeKeys:[...(diag.bridgeKeys||[])],\n      initial:diag.initial||null,\n      records:[...(diag.records||[])],\n      final:{\n        moreOpen:Boolean(document.querySelector('details.m26-mobile-more')?.open),\n        activeArea:String(globalThis.__IBERFIT_M26_APP__?.getState?.()?.activeArea||''),\n      },\n    };\n  });\n  console.log(\`IBERFIT_ADMIN_MOBILE_EVENT_DIAG=\${JSON.stringify(mobileEventDiagAfterTap)}\`);\n\n  let routeStateAfterDomClick=null;`;

function occurrences(source,needle){
  if(!needle)return 0;
  let count=0;
  let offset=0;
  while(true){
    const index=source.indexOf(needle,offset);
    if(index<0)return count;
    count+=1;
    offset=index+needle.length;
  }
}

const source=await readFile(SPEC_URL,'utf8');
const beforeCount=occurrences(source,BEFORE_MARKER);
const afterCount=occurrences(source,AFTER_MARKER);
if(beforeCount!==1||afterCount!==1){
  throw new Error(`ADMIN_MOBILE_EVENT_DIAG_MARKER_MISMATCH:before=${beforeCount}:after=${afterCount}`);
}

const sourceSha=createHash('sha256').update(source).digest('hex');
if(CHECK_ONLY){
  console.log(JSON.stringify({ok:true,mode:'check',sourceSha,beforeCount,afterCount}));
  process.exit(0);
}

const patched=source.replace(BEFORE_MARKER,BEFORE_REPLACEMENT).replace(AFTER_MARKER,AFTER_REPLACEMENT);
if(patched===source||occurrences(patched,'IBERFIT_ADMIN_MOBILE_EVENT_DIAG=')!==1){
  throw new Error('ADMIN_MOBILE_EVENT_DIAG_PATCH_FAILED');
}
await writeFile(SPEC_URL,patched,'utf8');
const patchedSha=createHash('sha256').update(patched).digest('hex');
console.log(JSON.stringify({ok:true,mode:'inject',sourceSha,patchedSha,beforeCount,afterCount}));
