#!/usr/bin/env python3
from __future__ import annotations
import json, os, time, mimetypes
from urllib.parse import urlparse
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'recovery'/'RC21_INTEGRATED_QA_REPORT.json'
ART=ROOT/'qa'/'rc21_integrated_artifacts'
CHROMIUM=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium')

AMD_LOADER = r"""
(() => {
  const definitions = new Map();
  const cache = new Map();
  function define(name, deps, factory) {
    if (typeof name !== 'string') throw new Error('AMD_NAMED_MODULE_REQUIRED');
    definitions.set(name, { deps: Array.isArray(deps) ? deps : [], factory });
  }
  define.amd = {};
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const def = definitions.get(name);
    if (!def) throw new Error(`AMD_MODULE_NOT_FOUND:${name}`);
    const exports = {};
    cache.set(name, exports);
    const localRequire = (deps, callback) => {
      if (Array.isArray(deps)) {
        const values = deps.map(load);
        if (callback) callback(...values);
        return values;
      }
      return load(deps);
    };
    const args = def.deps.map((dep) => dep === 'require' ? localRequire : dep === 'exports' ? exports : load(dep));
    const result = def.factory(...args);
    if (result !== undefined) cache.set(name, result);
    return cache.get(name);
  }
  function require(deps, callback) {
    if (Array.isArray(deps)) {
      const values = deps.map(load);
      if (callback) callback(...values);
      return values;
    }
    return load(deps);
  }
  globalThis.define = define;
  globalThis.require = require;
})();
"""

def integrated_html(role: str) -> str:
    css=(ROOT/'src/m26/shell/shell.css').read_text(encoding='utf-8')
    bundle=(ROOT/'qa/rc21_bundle.js').read_text(encoding='utf-8')
    return f"""<!doctype html><html lang='es'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><base href='https://qa.invalid/'><style>{css}</style></head><body><div id='app'></div><script>globalThis.__RC17_ROLE__={json.dumps(role)};{AMD_LOADER}</script><script>{bundle}</script><script>require(['qa/rc17_integrated_app']);</script></body></html>"""

def metrics(page):
    return page.evaluate("""
    () => {
      const visible=(el)=>{const closed=el.closest('details:not([open])');if(closed&&closed!==el)return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
      const controls=[...document.querySelectorAll('button,input,select,textarea,summary')].filter(visible);
      const small=controls.filter(el=>{const r=el.getBoundingClientRect();return r.height<43.5||r.width<43.5}).length;
      const unlabeled=[...document.querySelectorAll('input,select,textarea')].filter(visible).filter(el=>!el.labels?.length&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')).length;
      return {status:document.body.dataset.qaStatus,overflow:document.documentElement.scrollWidth>innerWidth+1,small,unlabeled,unnamed:[...document.querySelectorAll('button')].filter(visible).filter(el=>!(el.textContent||'').trim()&&!el.getAttribute('aria-label')).length,broken:[...document.images].filter(img=>!img.complete||img.naturalWidth===0).length,placeholders:[...document.querySelectorAll('.m26-route-placeholder')].length,route:document.querySelector('.m26-topbar h1')?.textContent||''};
    }
    """)

def set_value(page, selector, value):
    page.locator(selector).fill(str(value))

def navigate(page, route):
    visible=page.locator(f'[data-m26-area="{route}"]:visible')
    if visible.count():
        visible.first.click();return
    more=page.locator('.m26-mobile-more > summary:visible')
    if more.count():
        more.click();page.locator(f'.m26-mobile-more-menu [data-m26-area="{route}"]:visible').first.click();return
    raise RuntimeError(f'M26_QA_ROUTE_NOT_VISIBLE:{route}')

def run_role(browser,role):
    viewport={'width':1440,'height':1000} if role=='coach' else {'width':390,'height':844}
    context=browser.new_context(viewport=viewport,service_workers='block')
    logo=(ROOT/'public/isotipo-iberfit.png').read_bytes()
    context.route('https://qa.invalid/public/isotipo-iberfit.png',lambda route: route.fulfill(status=200,body=logo,headers={'content-type':'image/png','cache-control':'no-store'}))
    context.route('https://qa.invalid/m26/sw.js',lambda route: route.fulfill(status=404,body='disabled in QA'))
    page=context.new_page();page.set_default_timeout(5000);console=[];errors=[]
    page.on('console',lambda m: console.append(m.text) if m.type=='error' else None)
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(integrated_html(role),wait_until='load',timeout=30000)
    try:
        page.wait_for_function("document.body.dataset.qaStatus === 'pass'",timeout=15000)
    except Exception:
        print('RC17_QA_BODY',page.locator('body').inner_text()[:4000]);print('RC17_QA_CONSOLE',console);print('RC17_QA_ERRORS',errors);raise
    routes=['hoy','planificacion','sesion','progreso','actividad','informes'] if role=='client' else ['hoy','clientes','expediente','iri','planificacion','agenda','sesion','progreso','actividad','informes','notas','inteligencia','biblioteca','verificacion']
    route_results=[]
    for route in routes:
        locator=page.locator(f'[data-m26-area="{route}"]')
        if locator.count()==0: route_results.append({'route':route,'ok':False,'error':'NAV_MISSING'});continue
        navigate(page,route);page.wait_for_timeout(80);m=metrics(page);ok=m['status']=='pass' and not m['overflow'] and not m['small'] and not m['unlabeled'] and not m['unnamed'] and not m['broken'] and not m['placeholders'];route_results.append({'route':route,'ok':ok,'metrics':m})
    actions=[]
    if role=='coach':
        navigate(page,'iri');page.wait_for_timeout(50)
        set_value(page,'[data-workflow-form="iri"] input[name="assessmentDate"]','2026-07-19');set_value(page,'[data-workflow-form="iri"] input[name="birthDate"]','1990-01-01');page.locator('[data-workflow-form="iri"] select[name="sexForNorms"]').select_option('female');set_value(page,'[data-workflow-form="iri"] input[name="stepFinalHr"]','150');set_value(page,'[data-workflow-form="iri"] input[name="stepOneMinuteHr"]','110');set_value(page,'[data-workflow-form="iri"] input[name="pushUps"]','12');set_value(page,'[data-workflow-form="iri"] input[name="chairStand30s"]','18');set_value(page,'[data-workflow-form="iri"] input[name="bodyFatPercent"]','24.5');page.locator('[data-workflow-action="complete-iri"]').click();page.wait_for_timeout(300);actions.append(('iri','confirmado' in page.locator('[data-workflow-status="iri"]').inner_text().lower()))
        navigate(page,'planificacion');page.wait_for_timeout(50);set_value(page,'[data-workflow-form="planning"] input[name="name"]','Ciclo QA');set_value(page,'[data-workflow-form="planning"] input[name="startDate"]','2026-07-20');set_value(page,'[data-workflow-form="planning"] input[name="endDate"]','2026-08-20');set_value(page,'[data-workflow-form="planning"] textarea[name="goal"]','Fuerza general');page.locator('[data-workflow-action="validate-plan"]').click();page.wait_for_timeout(300);actions.append(('plan',bool(page.locator('[data-workflow-status="planning"]').inner_text())))
        navigate(page,'agenda');page.wait_for_timeout(50);set_value(page,'[data-workflow-form="appointment"] input[name="startAt"]','2026-07-22T10:00');set_value(page,'[data-workflow-form="appointment"] input[name="endAt"]','2026-07-22T11:00');set_value(page,'[data-workflow-form="appointment"] input[name="location"]','Las Condes');page.locator('[data-workflow-action="create-appointment"]').click();page.wait_for_timeout(300);actions.append(('appointment',bool(page.locator('[data-workflow-status="appointment"]').inner_text())))
        navigate(page,'actividad');page.wait_for_timeout(50)
        for k,v in [('energy',7),('sleep',7),('stress',4),('pain',1)]:set_value(page,f'[data-engagement-form="checkin"] input[name="{k}"]',v)
        page.locator('[data-engagement-action="submit-checkin"]').click();page.wait_for_timeout(300);actions.append(('checkin','confirmado' in page.locator('[data-engagement-status="checkin"]').inner_text().lower()))
        navigate(page,'inteligencia');page.wait_for_timeout(50);page.locator('[data-workflow-action="generate-intelligence"]').click();page.wait_for_timeout(300);actions.append(('intelligence',page.locator('[data-intelligence-preview] article').count()>0))
        navigate(page,'biblioteca');page.wait_for_timeout(50);set_value(page,'[data-library-search]','sentadilla');page.wait_for_timeout(180);actions.append(('library',page.locator('[data-library-text]:visible').count()>0))
        navigate(page,'sesion');page.wait_for_timeout(50);page.locator('[data-workflow-action="open-session-builder"]').click();page.wait_for_timeout(180);actions.append(('builder',page.locator('[data-session-action="add-exercise"]').count()>0));page.locator('[data-session-action="exit-session"]').click();page.wait_for_timeout(120)
        navigate(page,'notas');page.wait_for_timeout(50);set_value(page,'[data-private-note-draft]','Revisar tolerancia de carga en la siguiente sesión.');page.locator('[data-engagement-action="save-private-note"]').click();page.wait_for_timeout(300);actions.append(('private-note','confirmada' in page.locator('[data-engagement-status="private-note"]').inner_text().lower()))
    else:
        navigate(page,'actividad');page.wait_for_timeout(50)
        for k,v in [('energy',6),('sleep',6),('stress',5),('pain',0)]:set_value(page,f'[data-engagement-form="checkin"] input[name="{k}"]',v)
        page.locator('[data-engagement-action="submit-checkin"]').click();page.wait_for_timeout(300);actions.append(('client-checkin','confirmado' in page.locator('[data-engagement-status="checkin"]').inner_text().lower()))
        navigate(page,'sesion');page.wait_for_timeout(50);page.locator('[data-workflow-action="start-published-session"]').click();page.wait_for_timeout(120);page.locator('[data-session-action="start"]').click();page.wait_for_timeout(300);actions.append(('session-start',page.locator('[data-session-action="complete-set"]').count()>0))
        for _ in range(2):
            set_value(page,'[data-set-field="reps"]','8');set_value(page,'[data-set-field="load"]','10 kg');set_value(page,'[data-set-field="rpe"]','7');set_value(page,'[data-set-field="rir"]','3');page.locator('[data-session-action="complete-set"]').click();page.wait_for_timeout(250);page.locator('[data-session-action="next"]').click();page.wait_for_timeout(120)
        set_value(page,'[data-session-feedback-rpe]','7');set_value(page,'[data-session-feedback-comment]','Sesión completada sin dolor.');page.locator('[data-session-action="finish"]').click();page.wait_for_timeout(300);actions.append(('session-finish','sesión completada' in page.locator('body').inner_text().lower()))
    shot=ART/f'{role}_integrated.png';page.screenshot(path=str(shot),full_page=False)
    command_count=page.evaluate('window.__RC17_QA__.commands.length')
    result={'role':role,'routes':route_results,'actions':[{'name':n,'ok':ok} for n,ok in actions],'command_count':command_count,'console_errors':console,'page_errors':errors,'screenshot':str(shot.relative_to(ROOT))}
    result['ok']=all(r['ok'] for r in route_results) and all(a['ok'] for a in result['actions']) and not console and not errors and command_count>= (5 if role=='coach' else 4)
    context.close();return result

def main():
    ART.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        results=[run_role(browser,'coach'),run_role(browser,'client')];browser.close()
    package_version=json.loads((ROOT/'package.json').read_text())['version']
    report={'version':package_version,'generated_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'passed':sum(1 for r in results if r['ok']),'total':len(results),'results':results}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2));return 0 if report['passed']==report['total'] else 1
if __name__=='__main__':raise SystemExit(main())
