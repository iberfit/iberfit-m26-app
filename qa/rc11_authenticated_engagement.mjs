import fs from 'node:fs';
import {createM26Transport,buildAuthenticatedQaReport,buildCheckinRegisterCommand,buildPrivateNoteCreateCommand,validatedRuntimeRegistry} from '../src/m26/index.js';
const required=['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD','M26_QA_CLIENT_EMAIL','M26_QA_CLIENT_PASSWORD'];
const missing=required.filter((key)=>!process.env[key]);if(missing.length){console.error(`Faltan variables: ${missing.join(', ')}`);process.exit(2);}
const transport=createM26Transport({enabled:true,url:process.env.M26_SUPABASE_URL,publishableKey:process.env.M26_SUPABASE_PUBLISHABLE_KEY,qaOnly:true});
async function login(email,password){const session=await transport.login(email,password);const bootstrap=await transport.bootstrap(session.token);return {session,bootstrap};}
const coach=await login(process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);const client=await login(process.env.M26_QA_CLIENT_EMAIL,process.env.M26_QA_CLIENT_PASSWORD);
const installedCommands=await transport.commandRegistry(coach.session.token);const runtime=validatedRuntimeRegistry(installedCommands);const clientId=client.bootstrap?.clientId||client.bootstrap?.profile?.client_id||client.bootstrap?.user_profile?.client_id||client.bootstrap?.data?.clients?.[0]?.id;
const preflights=[];
if(runtime.registry.length===52&&clientId){
  const checkin=buildCheckinRegisterCommand({clientId,checkin:{energy:7,sleep:7,stress:3,pain:1}},{registry:runtime.registry,role:'client'});
  const privateNote=buildPrivateNoteCreateCommand({clientId,body:'Preflight RC11 sin ejecución'},{registry:runtime.registry,role:'coach'});
  for(const [role,session,command] of [['client',client.session,checkin],['coach',coach.session,privateNote]]){try{const response=await transport.preflight(session.token,command);preflights.push({role,type:command.type,ok:true,response});}catch(error){preflights.push({role,type:command.type,ok:false,error:error.message,status:error.status||null});}}
}else preflights.push({role:'system',type:'ENGAGEMENT_EXTENSION',ok:false,error:`REGISTRY_COUNT_${runtime.registry.length}`});
const report=buildAuthenticatedQaReport({coach,client,installedCommands,preflights,requireEngagement:true});report.executeMutations=false;report.note='RC11 realiza solo login, bootstrap, lectura de catálogo y preflight; no ejecuta mutaciones.';
const output=process.env.M26_QA_REPORT_PATH||'recovery/RC11_AUTHENTICATED_ENGAGEMENT_REPORT.json';fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exit(report.ok?0:1);
