// UX preflight only: the server independently enforces JWT assignment and
// published-document authorization; frontend role checks cannot grant access.
const MANAGERS=new Set(['coach','admin']);
const CLIENTS=new Set(['client','cliente']);
const PUBLISHED=new Set(['publicado','published']);
function value(record,...keys){
 const body=record?.body&&typeof record.body==='object'?record.body:{};
 return keys.map(k=>record?.[k]??body[k]).find(v=>v!==undefined&&v!==null)||'';
}
export function evolutionPdfActionScope({state,role,clientId,reportId,action}={}){
 const roleName=String(role||'').trim().toLowerCase();
 const client=String(clientId||'').trim(),id=String(reportId||'').trim();
 const manager=MANAGERS.has(roleName),customer=CLIENTS.has(roleName);
 const deny=code=>Object.freeze({allowed:false,code});
 if(!manager&&!customer)return deny('M44_PDF_READER_ROLE_DENIED');
 if(!client||!id)return deny('M44_PDF_CLIENT_CONTEXT_REQUIRED');
 if(!['issue','open','history'].includes(action))return deny('M44_PDF_ACTION_NOT_ALLOWED');
 if(action==='issue'&&!manager)return deny('M44_PDF_ISSUE_ROLE_DENIED');
 if(manager&&!(state?.collections?.clients||[]).some(c=>String(c?.id||'')===client))
   return deny('M44_PDF_CLIENT_SCOPE_DENIED');
 const record=(state?.collections?.reports||[]).find(item=>
   String(value(item,'id'))===id&&
   String(value(item,'clientId','client_id'))===client
 );
 if(!record)return deny('M44_PDF_REPORT_NOT_VISIBLE');
 const status=String(value(record,'status','estado')).trim().toLowerCase();
 if(action==='issue'||action==='open'||customer){
   if(!PUBLISHED.has(status))return deny('M44_PDF_PUBLISHED_REPORT_REQUIRED');
 }
 return Object.freeze({allowed:true,code:null,manager,reportId:id,clientId:client});
}
