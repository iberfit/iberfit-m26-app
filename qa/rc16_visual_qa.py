#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "qa" / "rc16_visual_artifacts"
REPORT = ROOT / "recovery" / "RC16_VISUAL_QA_REPORT.json"
CHROMIUM = os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium")

@dataclass(frozen=True)
class Case:
    name: str
    role: str
    route: str
    width: int
    height: int
    scenario: str = "normal"

CASES = [
    Case("coach_hoy_desktop", "coach", "hoy", 1440, 960),
    Case("coach_clientes_desktop", "coach", "clientes", 1440, 960),
    Case("coach_expediente_tablet", "coach", "expediente", 820, 1180),
    Case("coach_progreso_desktop", "coach", "progreso", 1440, 960),
    Case("coach_actividad_mobile", "coach", "actividad", 390, 844),
    Case("coach_notas_desktop", "coach", "notas", 1440, 960),
    Case("coach_verificacion_mobile", "coach", "verificacion", 390, 844, "conflict"),
    Case("client_hoy_mobile", "client", "hoy", 390, 844),
    Case("client_progreso_tablet", "client", "progreso", 768, 1024),
    Case("client_actividad_mobile", "client", "actividad", 390, 844),
    Case("builder_desktop", "coach", "builder", 1440, 960),
    Case("builder_mobile", "coach", "builder", 390, 844),
    Case("execution_mobile", "client", "execution", 390, 844),
    Case("paused_mobile", "client", "paused", 390, 844),
    Case("feedback_mobile", "client", "feedback", 390, 844),
]

def browser_metrics(page, case: Case) -> dict[str, Any]:
    return page.evaluate(
        """
        ({width}) => {
          const visible=(el)=>{const closed=el.closest('details:not([open])');if(closed&&closed!==el)return false;const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
          const all=[...document.querySelectorAll('*')].filter(visible);
          const overflows=all.filter((el)=>{
            if(el.closest('.m26-mobile-nav')||getComputedStyle(el).overflowX==='auto')return false;
            const r=el.getBoundingClientRect();return r.left < -1 || r.right > width + 1;
          }).slice(0,20).map((el)=>({tag:el.tagName,className:el.className||'',left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
          const controls=[...document.querySelectorAll('button,input,select,textarea')].filter(visible);
          const smallTargets=controls.filter((el)=>{const r=el.getBoundingClientRect();return r.height<43.5||r.width<43.5}).map((el)=>({tag:el.tagName,text:(el.innerText||el.getAttribute('aria-label')||'').trim().slice(0,60),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}));
          const ids=[...document.querySelectorAll('[id]')].map((el)=>el.id);const duplicateIds=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
          const unnamedButtons=[...document.querySelectorAll('button')].filter(visible).filter((el)=>!(el.innerText||'').trim()&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')).length;
          const unlabeledControls=[...document.querySelectorAll('input,select,textarea')].filter(visible).filter((el)=>!el.labels?.length&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')).length;
          const brokenImages=[...document.images].filter((img)=>!img.complete||img.naturalWidth===0).map((img)=>img.getAttribute('src'));
          const sidebar=document.querySelector('.m26-sidebar');const mobileNav=document.querySelector('.m26-mobile-nav');
          const sidebarVisible=sidebar?visible(sidebar):false;const mobileNavVisible=mobileNav?visible(mobileNav):false;
          const firstControl=controls[0];if(firstControl)firstControl.focus();const focusStyle=firstControl?getComputedStyle(firstControl):null;
          const main=document.querySelector('main');const topbar=document.querySelector('.m26-topbar');
          return {
            status:document.body.dataset.qaStatus,
            documentWidth:document.documentElement.scrollWidth,
            viewportWidth:width,
            horizontalOverflow:document.documentElement.scrollWidth>width+1,
            overflowingElements:overflows,
            smallTargets,
            duplicateIds,
            unnamedButtons,
            unlabeledControls,
            brokenImages,
            domNodes:document.querySelectorAll('*').length,
            sidebarVisible,mobileNavVisible,
            focusOutline:firstControl?{style:focusStyle.outlineStyle,width:focusStyle.outlineWidth}:null,
            mainPresent:Boolean(main),
            mainTop:main?.getBoundingClientRect().top??null,
            topbarBottom:topbar?.getBoundingClientRect().bottom??null,
            qa:window.__RC16_QA__||null,
          };
        }
        """,
        {"width": case.width},
    )


def validate_metrics(metrics: dict[str, Any], case: Case, console_errors: list[str], page_errors: list[str], load_ms: float) -> list[str]:
    errors: list[str] = []
    if metrics.get("status") != "pass": errors.append("QA_STATUS_NOT_PASS")
    if metrics.get("horizontalOverflow"): errors.append("HORIZONTAL_OVERFLOW")
    if metrics.get("overflowingElements"): errors.append("ELEMENT_OUTSIDE_VIEWPORT")
    if metrics.get("smallTargets"): errors.append("TOUCH_TARGET_UNDER_44")
    if metrics.get("duplicateIds"): errors.append("DUPLICATE_IDS")
    if metrics.get("unnamedButtons"): errors.append("UNNAMED_BUTTON")
    if metrics.get("unlabeledControls"): errors.append("UNLABELED_CONTROL")
    if metrics.get("brokenImages"): errors.append("BROKEN_IMAGE")
    if not metrics.get("mainPresent"): errors.append("MAIN_LANDMARK_MISSING")
    focus = metrics.get("focusOutline") or {}
    if focus.get("style") in (None, "none") or float(str(focus.get("width", "0")).replace("px", "") or 0) < 2:
        errors.append("FOCUS_RING_MISSING")
    mobile = case.width <= 900
    if mobile and (metrics.get("sidebarVisible") or not metrics.get("mobileNavVisible")): errors.append("MOBILE_NAV_MODE_INVALID")
    if not mobile and (not metrics.get("sidebarVisible") or metrics.get("mobileNavVisible")): errors.append("DESKTOP_NAV_MODE_INVALID")
    if metrics.get("domNodes", 0) > 650: errors.append("DOM_BUDGET_EXCEEDED")
    if load_ms > 2500: errors.append("LOAD_BUDGET_EXCEEDED")
    if console_errors: errors.append("CONSOLE_ERROR")
    if page_errors: errors.append("PAGE_ERROR")
    return errors


def main() -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    for old in ARTIFACTS.glob("*.png"): old.unlink()
    results: list[dict[str, Any]] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROMIUM, headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        for case in CASES:
            context = browser.new_context(viewport={"width": case.width, "height": case.height}, device_scale_factor=1)
            page = context.new_page(); console_errors: list[str] = []; page_errors: list[str] = []
            page.on("console", lambda msg, bag=console_errors: bag.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda exc, bag=page_errors: bag.append(str(exc)))
            source=(ROOT / "qa" / "rc16_visual_cases" / f"{case.name}.html").read_text(encoding="utf-8")
            url=f"inline://{case.name}"
            started=time.perf_counter(); page.set_content(source, wait_until="load", timeout=15000); load_ms=(time.perf_counter()-started)*1000
            page.wait_for_function("document.body.dataset.qaStatus === 'pass'", timeout=5000)
            metrics=browser_metrics(page,case)
            page.evaluate("document.activeElement?.blur()")
            screenshot=ARTIFACTS/f"{case.name}.png"; page.screenshot(path=str(screenshot), full_page=False)
            errors=validate_metrics(metrics,case,console_errors,page_errors,load_ms)
            results.append({"case":asdict(case),"url":url,"load_ms":round(load_ms,2),"metrics":metrics,"console_errors":console_errors,"page_errors":page_errors,"errors":errors,"screenshot":str(screenshot.relative_to(ROOT)),"ok":not errors})
            context.close()
        browser.close()
    thumbs=[]
    for result in results:
        image=Image.open(ROOT/result["screenshot"]).convert("RGB"); image.thumbnail((320,220))
        canvas=Image.new("RGB",(340,260),"white"); canvas.paste(image,((340-image.width)//2,10)); ImageDraw.Draw(canvas).text((10,235),result["case"]["name"],fill="black"); thumbs.append(canvas)
    cols=3; rows=(len(thumbs)+cols-1)//cols; contact=Image.new("RGB",(cols*340,rows*260),(224,224,224))
    for index,thumb in enumerate(thumbs): contact.paste(thumb,((index%cols)*340,(index//cols)*260))
    contact_path=ARTIFACTS/"RC16_CONTACT_SHEET.png"; contact.save(contact_path)
    report={"version":"26.0.0-hardening-candidate.16","generated_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"chromium":CHROMIUM,"case_count":len(results),"passed":sum(1 for r in results if r["ok"]),"failed":sum(1 for r in results if not r["ok"]),"contact_sheet":str(contact_path.relative_to(ROOT)),"results":results}
    REPORT.parent.mkdir(parents=True,exist_ok=True); REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    for result in results:
        print(f"{'PASS' if result['ok'] else 'FAIL'} {result['case']['name']} {result['load_ms']}ms" + (f" :: {','.join(result['errors'])}" if result['errors'] else ""))
    print(f"\n{report['passed']}/{report['case_count']} PASS")
    return 0 if report["failed"]==0 else 1

if __name__=="__main__":
    raise SystemExit(main())
