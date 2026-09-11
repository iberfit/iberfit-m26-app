import {INITIAL_ASSESSMENT_MODES,normalizeInitialAssessmentMode} from '../domain/initial-assessment.js';
import {createdClientResultId} from '../workflows/client-onboarding.js';

export const CLIENT_CREATE_HANDOFF_EVENT='m26:open-client-workflow';

function clean(value,max=200){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').trim().slice(0,max);
}

export function buildClientCreateHandoff({result,initialAssessmentMode}={}){
  const mode=normalizeInitialAssessmentMode(initialAssessmentMode);
  if(mode!==INITIAL_ASSESSMENT_MODES.iri)return null;
  const clientId=createdClientResultId(result?.response??result);
  if(!clientId)return null;
  return Object.freeze({
    clientId:clean(clientId),
    role:'coach',
    area:'iri',
  });
}

export function normalizeClientWorkflowHandoff(detail={}){
  const clientId=clean(detail?.clientId);
  const role=clean(detail?.role,40).toLowerCase();
  const area=clean(detail?.area,40).toLowerCase();
  if(!clientId)throw new Error('M26_CLIENT_HANDOFF_CLIENT_REQUIRED');
  if(role!=='coach'||area!=='iri')throw new Error('M26_CLIENT_HANDOFF_TARGET_INVALID');
  return Object.freeze({clientId,role,area});
}

export function dispatchClientCreateHandoff(root,handoff){
  if(!handoff||!root?.dispatchEvent)return false;
  const EventCtor=root.ownerDocument?.defaultView?.CustomEvent||globalThis.CustomEvent;
  if(typeof EventCtor!=='function')return false;
  root.dispatchEvent(new EventCtor(CLIENT_CREATE_HANDOFF_EVENT,{
    bubbles:true,
    detail:handoff,
  }));
  return true;
}

export const __clientCreateHandoffInternals=Object.freeze({clean});
