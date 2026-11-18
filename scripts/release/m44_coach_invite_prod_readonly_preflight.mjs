// REAL TRAINING 360 · PROD Coach invite compatibility, metadata only.
// A compatible baseline is never authority to install, grant or deploy.
export const SCHEMA='iberfit.prod.coach-invitation-preflight.v1';
export const FUNCTIONS=Object.freeze({"prepare":{"signature":"public.iberfit_admin_client_invitation_prepare_v26(uuid,text)","hashes":["6d3465abd99d9a10b95ff06b8c8f495c","9590d58f17eab222970db25a1f5cc339"]},"bind":{"signature":"public.iberfit_admin_client_invitation_bind_v26(uuid,uuid)","hashes":["a45e4b070927c45e41bc4bce097d5bb9","cc3d989b905efe1a71eb16632b4ef872"]},"finalize":{"signature":"public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)","hashes":["66743cf255b81523a4733b63d1c98fc0","e3a2b7487aeb70247d0e94956e9ebcec"]}});
export const TABLES=Object.freeze({"client_assignments":"public.client_assignments","coach_assignments":"public.iberfit_coach_client_assignments","client_access":"public.client_access_v26","memberships":"public.iberfit_organization_memberships"});
export const QUERY="WITH expected_functions(key,signature,hash_a,hash_b) AS (VALUES ('prepare','public.iberfit_admin_client_invitation_prepare_v26(uuid,text)','6d3465abd99d9a10b95ff06b8c8f495c','9590d58f17eab222970db25a1f5cc339'),\n('bind','public.iberfit_admin_client_invitation_bind_v26(uuid,uuid)','a45e4b070927c45e41bc4bce097d5bb9','cc3d989b905efe1a71eb16632b4ef872'),\n('finalize','public.iberfit_admin_client_invitation_finalize_v26(uuid,text,text,text)','66743cf255b81523a4733b63d1c98fc0','e3a2b7487aeb70247d0e94956e9ebcec')),\nfunction_state AS (\n SELECT e.key,p.oid IS NOT NULL AS present,\n coalesce(md5(pg_get_functiondef(p.oid)) IN (e.hash_a,e.hash_b),false) AS \"hashOK\",\n coalesce(p.prosecdef,false) AS \"securityDefiner\",\n coalesce(pg_get_userbyid(p.proowner)='postgres',false) AS \"postgresOwner\",\n coalesce(p.proconfig @> ARRAY['search_path=\"\"']::text[],false) AS \"emptySearchPath\",\n coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) AS \"anonCanExecute\",\n coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) AS \"authenticatedCanExecute\"\n FROM expected_functions e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)\n), expected_tables(key,regname) AS (VALUES ('client_assignments','public.client_assignments'),\n('coach_assignments','public.iberfit_coach_client_assignments'),\n('client_access','public.client_access_v26'),\n('memberships','public.iberfit_organization_memberships')),\ntable_state AS (\n SELECT e.key,c.oid IS NOT NULL AS present,coalesce(c.relrowsecurity,false) AS \"rlsEnabled\"\n FROM expected_tables e LEFT JOIN pg_class c ON c.oid=to_regclass(e.regname)\n), settings AS (\n SELECT jsonb_object_agg(key,value #>> '{}') AS k FROM public.iberfit_system_settings\n WHERE key IN ('environment','real_data_allowed','production_blocked')\n)\nSELECT jsonb_build_object(\n 'schema','iberfit.prod.coach-invitation-preflight.v1',\n 'environment',(SELECT k FROM settings),\n 'functions',(SELECT jsonb_object_agg(key,jsonb_build_object(\n  'present',present,'hashOK',\"hashOK\",'securityDefiner',\"securityDefiner\",\n  'postgresOwner',\"postgresOwner\",'emptySearchPath',\"emptySearchPath\",\n  'anonCanExecute',\"anonCanExecute\",'authenticatedCanExecute',\"authenticatedCanExecute\"))\n FROM function_state),\n 'tables',(SELECT jsonb_object_agg(key,jsonb_build_object(\n  'present',present,'rlsEnabled',\"rlsEnabled\")) FROM table_state),\n 'coachGuardAlreadyInstalled',to_regprocedure('private.iberfit_coach_invite_source_guard_v1()') IS NOT NULL\n) AS report";
;
const fail=code=>{throw Error('M44_COACH_PREFLIGHT_'+code);};
const exact=(v,n,label)=>{
 if(!v||typeof v!=='object'||Array.isArray(v)||
  Object.keys(v).sort().join('|')!==[...n].sort().join('|'))fail(label+'_SHAPE');
};
export function evaluateCoachInvitationReadOnlyPreflight(input){
 const r=Array.isArray(input)?input.length===1?input[0]?.report:null:
  Array.isArray(input?.result)?input.result.length===1?input.result[0]?.report:null:
  input?.report??input;
 exact(r,['schema','environment','functions','tables','coachGuardAlreadyInstalled'],'RESPONSE');
 if(r.schema!==SCHEMA)fail('SCHEMA');
 exact(r.environment,['environment','real_data_allowed','production_blocked'],'ENV');
 if(r.environment.environment!=='PRODUCTION'||
  r.environment.real_data_allowed!=='true'||r.environment.production_blocked!=='false')fail('ENV_DRIFT');
 exact(r.functions,Object.keys(FUNCTIONS),'FUNCTION_SET');
 for(const [name,f] of Object.entries(r.functions)){
  exact(f,['present','hashOK','securityDefiner','postgresOwner','emptySearchPath',
   'anonCanExecute','authenticatedCanExecute'],'FUNCTION_'+name);
  if(f.present!==true||f.hashOK!==true||f.securityDefiner!==true||
    f.postgresOwner!==true||f.emptySearchPath!==true||f.anonCanExecute!==false||
    f.authenticatedCanExecute!==true)fail('FUNCTION_DRIFT_'+name);
 }
 exact(r.tables,Object.keys(TABLES),'TABLE_SET');
 for(const [name,t] of Object.entries(r.tables)){
  exact(t,['present','rlsEnabled'],'TABLE_'+name);
  if(t.present!==true||t.rlsEnabled!==true)fail('TABLE_DRIFT_'+name);
 }
 if(r.coachGuardAlreadyInstalled!==false)fail('COACH_GUARD_ALREADY_INSTALLED');
 return Object.freeze({
  compatible:true,readOnly:true,databaseWrites:0,productionReleaseAuthorized:false,
  platformRecoveryVerified:false,hostedAuthRecoveryVerified:false,
  liveCoachClientAcceptanceVerified:false
 });
}
