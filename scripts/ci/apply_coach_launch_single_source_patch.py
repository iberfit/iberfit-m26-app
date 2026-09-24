from pathlib import Path


def replace_once(path, old, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}: {old[:140]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')


def replace_block(path, start, end, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    i=text.find(start)
    j=text.find(end,i+len(start))
    if i<0 or j<0:
        raise SystemExit(f'{path}: deterministic block markers not found')
    p.write_text(text[:i]+new+text[j:],encoding='utf-8')


# role-projection: preserve only the safe fields required by the canonical execution truth,
# and retain the current user's own membership status in projected identity.
replace_once(
    'src/m26/security/role-projection.js',
    "sessionExecutions:[['sessionId',['sessionId','session_id']],['appointmentId',['appointmentId','appointment_id']],['title',['title','sessionTitle','session_title']],['startedAt',['startedAt','started_at']],['completedAt',['completedAt','completed_at']],['updatedAt',['updatedAt','updated_at']],['currentBlockIndex',['currentBlockIndex','current_block_index']],['currentSetIndex',['currentSetIndex','current_set_index']],['feedback',['feedback']],['results',['results','resultados']]],",
    "sessionExecutions:[['sessionId',['sessionId','session_id']],['appointmentId',['appointmentId','appointment_id']],['title',['title','sessionTitle','session_title']],['startedAt',['startedAt','started_at']],['completedAt',['completedAt','completed_at','remoteConfirmedAt','remote_confirmed_at','localClosedAt','local_closed_at']],['executionStatus',['executionStatus','execution_status']],['remoteConfirmedAt',['remoteConfirmedAt','remote_confirmed_at']],['localClosedAt',['localClosedAt','local_closed_at']],['updatedAt',['updatedAt','updated_at']],['currentBlockIndex',['currentBlockIndex','current_block_index']],['currentSetIndex',['currentSetIndex','current_set_index']],['feedback',['feedback']],['results',['results','resultados']]],",
)
replace_once(
    'src/m26/security/role-projection.js',
    "for(const key of ['name','displayName','firstName','lastName','email'])",
    "for(const key of ['name','displayName','firstName','lastName','email','status'])",
)

# Admin: move readiness ownership to the shared domain module and use published sessions +
# completed session-execution records instead of appointment status text.
replace_once(
    'src/m26/admin/view-model.js',
    "import {readIberfitExperiencePreferences} from '../ui/preferences.js';",
    "import {readIberfitExperiencePreferences} from '../ui/preferences.js';\nimport {deriveCoachLaunchJourney,isCoachLaunchPlanningPublished} from '../onboarding/coach-launch-journey.js';\nimport {sessionExecutionIsCompleted} from '../domain/session-execution-truth.js';\nexport {deriveCoachLaunchJourney} from '../onboarding/coach-launch-journey.js';",
)
replace_block(
    'src/m26/admin/view-model.js',
    'export function deriveCoachLaunchJourney(',
    'export function buildCoach360Rows',
    '',
)
replace_once(
    'src/m26/admin/view-model.js',
    "export function buildCoach360Rows({coaches=[],users=[],clients=[],assignments=[],appointments=[],now=new Date()}={}){",
    "export function buildCoach360Rows({coaches=[],users=[],clients=[],assignments=[],appointments=[],planningSessions=[],sessionExecutions=[],now=new Date()}={}){",
)
replace_once(
    'src/m26/admin/view-model.js',
    "    const clientIds=[...new Set(ownAssignments.map((assignment)=>recordId(assignment?.clientId)).filter(Boolean))];",
    "    const clientIds=[...new Set(ownAssignments.map((assignment)=>recordId(assignment?.clientId)).filter(Boolean))];\n    const clientIdSet=new Set(clientIds);\n    const coachPlanningSessions=(planningSessions||[]).filter((session)=>clientIdSet.has(recordId(session?.clientId??session?.client_id))&&isCoachLaunchPlanningPublished(session));\n    const coachExecutions=(sessionExecutions||[]).filter((execution)=>recordId(execution?.startedBy??execution?.started_by)===coachId);",
)
replace_once(
    'src/m26/admin/view-model.js',
    "    const launchJourney=deriveCoachLaunchJourney({coach,user,assignments:ownAssignments,sessions});",
    "    const launchJourney=deriveCoachLaunchJourney({coach,user,assignments:ownAssignments,planningSessions:coachPlanningSessions,sessionExecutions:coachExecutions});",
)
replace_once(
    'src/m26/admin/view-model.js',
    "      completedCount:sessions.filter((session)=>/complet|realiz|done/i.test(session.status)).length,",
    "      completedCount:coachExecutions.filter(sessionExecutionIsCompleted).length,",
)
replace_once(
    'src/m26/admin/view-model.js',
    "const coachProfiles360=buildCoach360Rows({coaches,users,clients,assignments:rawAssignments,appointments:clone(state.collections?.appointments||[]),now:rawNow});",
    "const coachProfiles360=buildCoach360Rows({coaches,users,clients,assignments:rawAssignments,appointments:clone(state.collections?.appointments||[]),planningSessions:clone(state.collections?.sessions||[]),sessionExecutions:clone(state.collections?.sessionExecutions||[]),now:rawNow});",
)

# Coach: consume the same Journey, using own bootstrap identity plus confirmed executions
# actually started by this Coach. No synthetic completion record is created.
replace_once(
    'src/m26/rc39/view-model.js',
    "import {deriveCoachLaunchJourney} from '../admin/view-model.js';",
    "import {deriveCoachLaunchJourney,isCoachLaunchPlanningPublished} from '../onboarding/coach-launch-journey.js';\nimport {confirmedSessionExecutionsForClient} from '../domain/session-execution-truth.js';",
)
replace_block(
    'src/m26/rc39/view-model.js',
    'function hasConfirmedCompletedSession(',
    'function nextCoachAction',
    "function confirmedCompletedSessions(state,clients,coachId){\n  const completed=[];\n  for(const client of clients){\n    const id=recordClientId(client);\n    if(!id)continue;\n    for(const execution of confirmedSessionExecutionsForClient(state,id)){\n      const startedBy=String(execution?.startedBy??execution?.started_by??'').trim();\n      if(startedBy===coachId)completed.push(execution);\n    }\n  }\n  return completed;\n}\n",
)
replace_block(
    'src/m26/rc39/view-model.js',
    'export function deriveCoachSelfLaunchJourney(',
    'const compactAppointment=',
    """export function deriveCoachSelfLaunchJourney({state,identity=null,now=new Date()}={}){
  const sourceIdentity=identity||state?.identity||{};
  const role=String(sourceIdentity?.role||'').trim().toLowerCase();
  if(role!=='coach')return null;
  const coachId=String(sourceIdentity?.id||'').trim();
  if(!coachId)return null;
  const clients=list(state?.collections?.clients);
  const sessions=list(state?.collections?.sessions);
  const parsedNow=now instanceof Date&&!Number.isNaN(now.getTime())?now:new Date(now);
  const effectiveNow=Number.isNaN(parsedNow.getTime())?new Date():parsedNow;
  const authenticatedAt=state?.hydration?.serverTime||effectiveNow.toISOString();
  const accountStatus=String(sourceIdentity?.status||'').trim();
  const email=String(sourceIdentity?.email||'').trim();
  const name=String(sourceIdentity?.name||sourceIdentity?.displayName||'').trim();
  const user=Object.freeze({id:coachId,userId:coachId,primaryRole:'coach',roles:Object.freeze(['coach']),status:accountStatus,lastAccessAt:authenticatedAt});
  const coach=Object.freeze({id:coachId,userId:coachId,name,email,status:accountStatus});
  const assignments=Object.freeze(clients.map((client)=>Object.freeze({coachUserId:coachId,clientId:recordClientId(client),status:'active'})).filter((item)=>item.clientId));
  const planningEvidence=sessions.filter(isCoachLaunchPlanningPublished);
  const completedExecutions=confirmedCompletedSessions(state,clients,coachId);
  const base=deriveCoachLaunchJourney({user,coach,assignments,planningSessions:planningEvidence,sessionExecutions:completedExecutions});
  const profileVerified=base.milestones.find((item)=>item.id==='profile')?.complete===true;
  return Object.freeze({...base,source:'authenticated-coach-bootstrap',coachId,profileVerified,accountStatusVerified:base.accountActive===true,clientEvidenceCount:assignments.length,publishedPlanningEvidenceCount:planningEvidence.length,completedSessionEvidence:completedExecutions.length>0,nextCoachAction:nextCoachAction(base.milestones)});
}
""",
)
replace_once(
    'src/m26/rc39/view-model.js',
    "adminTitle:'Verificación administrativa pendiente',adminCopy:'Tu perfil profesional y el estado operativo de la cuenta no forman parte del bootstrap Coach actual. IBERFIT los mantiene pendientes en lugar de asumirlos.'",
    "adminTitle:'Verificación operativa pendiente',adminCopy:'IBERFIT solo valida perfil y cuenta cuando el bootstrap autenticado aporta tu email y una membresía activa. Si falta alguna evidencia, la mantiene pendiente.'",
)
replace_once(
    'src/m26/rc39/view-model.js',
    "adminTitle:'Administrative verification pending',adminCopy:'Your professional profile and operational account status are not exposed by the current Coach bootstrap. IBERFIT keeps them pending instead of assuming them.'",
    "adminTitle:'Operational verification pending',adminCopy:'IBERFIT only validates profile and account when the authenticated bootstrap provides your email and an active membership. Missing evidence stays pending.'",
)
replace_once(
    'src/m26/rc39/view-model.js',
    "adminTitle:'Vérification administrative en attente',adminCopy:'Votre profil professionnel et l’état opérationnel du compte ne sont pas exposés par le bootstrap Coach actuel. IBERFIT les laisse en attente au lieu de les supposer.'",
    "adminTitle:'Vérification opérationnelle en attente',adminCopy:'IBERFIT valide le profil et le compte uniquement lorsque le bootstrap authentifié fournit votre e-mail et une adhésion active. Toute preuve manquante reste en attente.'",
)
replace_once(
    'src/m26/rc39/view-model.js',
    "adminTitle:'Verificação administrativa pendente',adminCopy:'O seu perfil profissional e o estado operacional da conta não são expostos pelo bootstrap Coach atual. O IBERFIT mantém-nos pendentes em vez de os assumir.'",
    "adminTitle:'Verificação operacional pendente',adminCopy:'O IBERFIT só valida perfil e conta quando o bootstrap autenticado fornece o seu email e uma associação ativa. Evidência em falta permanece pendente.'",
)

# Progressive onboarding: tour remains local guidance; readiness comes from the Coach Journey.
replace_once(
    'src/m26/onboarding/progressive-onboarding.js',
    "import {coachLaunchReadiness} from './coach-launch-readiness.js';",
    "import {coachLaunchReadiness} from './coach-launch-readiness.js';\nimport {deriveCoachSelfLaunchJourney} from '../rc39/view-model.js';",
)
replace_once(
    'src/m26/onboarding/progressive-onboarding.js',
    "      readiness?.planningReady===true,\n      readiness?.nextRequirement||'',",
    "      readiness?.planningReady===true,\n      readiness?.sessionReady===true,\n      readiness?.profileReady===true,\n      readiness?.accountReady===true,\n      readiness?.nextRequirement||'',",
)
replace_once(
    'src/m26/onboarding/progressive-onboarding.js',
    "    const readiness=coachLaunchReadiness({\n      role:context.role,\n      progress,\n      collections:canonicalState?.collections||null,\n    });",
    "    const launchJourney=context.role==='coach'\n      ?deriveCoachSelfLaunchJourney({state:canonicalState,identity:canonicalState?.identity})\n      :null;\n    const readiness=coachLaunchReadiness({\n      role:context.role,\n      progress,\n      journey:launchJourney,\n    });",
)
replace_once(
    'src/m26/onboarding/progressive-onboarding.js',
    "'Recorrido de interfaz completado; puesta en marcha pendiente. IBERFIT no marca al Coach como listo hasta validar cliente y planificación.'",
    "'Recorrido de interfaz completado; puesta en marcha pendiente. IBERFIT no marca al Coach como listo hasta validar los seis hitos operativos.'",
)
