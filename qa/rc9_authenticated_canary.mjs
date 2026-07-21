import fs from 'node:fs';
import { createM26Transport,validateCommandCatalog,buildAuthenticatedQaReport } from '../src/m26/index.js';
const required=['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_COACH_EMAIL','M26_QA_COACH_PASSWORD','M26_QA_CLIENT_EMAIL','M26_QA_CLIENT_PASSWORD'];
const missing=required.filter((key)=>!process.env[key]);if(missing.length){console.error(`Faltan variables: ${missing.join(', ')}`);process.exit(2);}
const transport=createM26Transport({enabled:true,url:process.env.M26_SUPABASE_URL,publishableKey:process.env.M26_SUPABASE_PUBLISHABLE_KEY,qaOnly:true});
async function login(email,password){const session=await transport.login(email,password);const bootstrap=await transport.bootstrap(session.token);return {session,bootstrap};}
const coach=await login(process.env.M26_QA_COACH_EMAIL,process.env.M26_QA_COACH_PASSWORD);
const client=await login(process.env.M26_QA_CLIENT_EMAIL,process.env.M26_QA_CLIENT_PASSWORD);
const installedCommands=await transport.commandRegistry(coach.session.token);
const preflights=[];
for(const roleContext of [{name:'coach',...coach},{name:'client',...client}]){
  const raw=process.env[`M26_QA_${roleContext.name.toUpperCase()}_PREFLIGHT_COMMAND`];if(!raw)continue;
  try{const command=JSON.parse(raw);const response=await transport.preflight(roleContext.session.token,command);preflights.push({role:roleContext.name,ok:true,response});}
  catch(error){preflights.push({role:roleContext.name,ok:false,error:error.message,status:error.status||null});}
}
const report=buildAuthenticatedQaReport({coach,client,installedCommands,preflights});
report.commandCatalogDirect=validateCommandCatalog(installedCommands);
const output=process.env.M26_QA_REPORT_PATH||'recovery/RC9_AUTHENTICATED_QA_REPORT.json';fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exit(report.ok?0:1);
