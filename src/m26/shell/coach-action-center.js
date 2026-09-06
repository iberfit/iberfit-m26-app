import {createRouteViewModel} from '../modules/route-view-model.js';
import {iberfitDomainTranslate} from '../ui/i18n-domain.js';
import {guardClientSelection,resolveM26Route} from './route-guard.js';

const ACTION_CENTER_TITLE_ID='m26-coach-action-center-title';
const ACTION_CENTER_CARD_SELECTOR='.m26-coach-priority-card';

function tr(key,params={}){
  return iberfitDomainTranslate(key,{params});
}

function coachTodayViewModel(shellVm,state){
  if(shellVm?.mode!=='authenticated')return null;
  if(shellVm?.identity?.role!=='coach')return null;
  if(shellVm?.activeArea!=='hoy')return null;
  return createRouteViewModel(shellVm,state,new Date());
}

function priorityPanel(root){
  const panels=[...(root?.querySelectorAll?.('.m26-panel.m26-panel-soft')||[])];
  return panels.find((panel)=>{
    if(panel.querySelector?.(ACTION_CENTER_CARD_SELECTOR))return true;
    return String(panel.querySelector?.('h2')?.textContent||'').trim()==='Qué requiere tu decisión';
  })||null;
}

function setText(node,value){
  if(node)node.textContent=String(value||'');
}

function enhancePriorityCard(card,item){
  if(!card||!item)return;
  const action=item.actionCtaLabel||tr('coach.actionCenter.cta.manual-attention');
  const client=item.clientName||tr('coach.client');
  const targetArea=String(item.nextAction?.area||'expediente').trim()||'expediente';

  card.dataset.coachActionType=item.actionType||'manual-attention';
  card.dataset.m26ClientId=String(item.clientId||'');

  const eyebrow=card.querySelector?.('.m26-eyebrow');
  setText(eyebrow,item.actionTypeLabel||item.stageLabel||tr('coach.actionCenter.type.manual-attention'));

  const next=card.querySelector?.('.m26-client-next');
  if(next){
    const why=card.ownerDocument?.createElement?.('p');
    if(why){
      why.dataset.m26ActionWhy='true';
      why.innerHTML=`<strong>${tr('coach.actionCenter.whyLabel')}:</strong> `;
      why.append?.(card.ownerDocument.createTextNode(item.attentionWhy||tr('coach.actionCenter.why.manual-attention')));
      next.parentNode?.insertBefore?.(why,next);
    }
    setText(next,`${tr('coach.actionCenter.nextLabel')}: ${action}`);
  }

  const button=card.querySelector?.('[data-m26-select-client]');
  if(button){
    button.dataset.m26CoachAction='true';
    button.dataset.m26ClientId=String(item.clientId||'');
    button.dataset.m26TargetArea=targetArea;
    button.classList?.remove?.('m26-text-action');
    button.classList?.add?.('m26-primary-action');
    button.textContent=action;
    button.setAttribute?.('aria-label',tr('coach.actionCenter.ctaAria',{action,client}));
  }
}

export function enhanceCoachActionCenter({root,shellVm,state}={}){
  const routeVm=coachTodayViewModel(shellVm,state);
  if(!routeVm?.coachCockpit)return false;

  const cockpit=routeVm.coachCockpit;
  const panel=priorityPanel(root);
  if(!panel)return false;

  panel.dataset.m26CoachActionCenter='true';
  panel.setAttribute?.('aria-labelledby',ACTION_CENTER_TITLE_ID);

  const heading=panel.querySelector?.('.m26-panel-heading');
  const eyebrow=heading?.querySelector?.('.m26-eyebrow');
  const title=heading?.querySelector?.('h2');
  const summary=heading?.querySelector?.('.m26-badge');
  setText(eyebrow,tr('coach.actionCenter.eyebrow'));
  if(title){
    title.id=ACTION_CENTER_TITLE_ID;
    setText(title,tr('coach.actionCenter.title'));
  }
  setText(summary,tr('coach.actionCenter.summary',{count:Number(cockpit.attentionCount||0)}));

  const items=Array.isArray(cockpit.items)?cockpit.items.slice(0,6):[];
  const cards=[...(panel.querySelectorAll?.(ACTION_CENTER_CARD_SELECTOR)||[])];
  cards.forEach((card,index)=>enhancePriorityCard(card,items[index]));

  if(!items.length){
    const empty=panel.querySelector?.('.m26-empty');
    if(empty){
      setText(empty.querySelector?.('h3'),tr('coach.actionCenter.emptyTitle'));
      setText(empty.querySelector?.('p'),tr('coach.actionCenter.emptyBody'));
    }
  }

  return true;
}

export function resolveCoachActionNavigation(state,{clientId,targetArea='expediente'}={}){
  if(String(state?.identity?.role||'').trim().toLowerCase()!=='coach'){
    throw new Error('M26_COACH_ACTION_FORBIDDEN');
  }
  const safeClientId=guardClientSelection(state,clientId);
  const requested=String(targetArea||'expediente').trim()||'expediente';
  const candidate={...state,selectedClientId:safeClientId};
  const decision=resolveM26Route(candidate,requested);
  if(!decision.allowed)throw new Error(decision.reason||'M26_ROUTE_FORBIDDEN');
  return Object.freeze({clientId:safeClientId,area:decision.area});
}

export const __coachActionCenterInternals=Object.freeze({
  coachTodayViewModel,
  priorityPanel,
  enhancePriorityCard,
});
