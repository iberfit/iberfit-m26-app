import http from 'node:http';
import {createReadStream,promises as fs} from 'node:fs';
import path from 'node:path';

const DEFAULT_PORT=4186;
const DEFAULT_HOST='127.0.0.1';
const root=await fs.realpath(process.cwd());
const publicRoot=await fs.realpath(path.join(root,'public'));
const rootPrefix=root.endsWith(path.sep)?root:`${root}${path.sep}`;
const publicRootPrefix=publicRoot.endsWith(path.sep)?publicRoot:`${publicRoot}${path.sep}`;

const RELEASES=Object.freeze({
  n1:Object.freeze({version:'m26-p0-browser-n1',previous:'m26-p0-browser-n0',marker:'n1'}),
  n:Object.freeze({version:'m26-p0-browser-n',previous:'m26-p0-browser-n1',marker:'n'}),
});
const OPTIONAL_FAILURE_PATH='/m26/iri-report.html';
let release='n1';
let optionalFail=false;
let optionalFailures=0;
let requests=0;

const MIME=Object.freeze({
  '.css':'text/css; charset=utf-8',
  '.html':'text/html; charset=utf-8',
  '.ico':'image/x-icon',
  '.jpeg':'image/jpeg',
  '.jpg':'image/jpeg',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.png':'image/png',
  '.svg':'image/svg+xml; charset=utf-8',
  '.txt':'text/plain; charset=utf-8',
  '.webp':'image/webp',
  '.woff':'font/woff',
  '.woff2':'font/woff2',
});

function fail(message){
  console.error(`P0_PWA_SERVER_FATAL:${message}`);
  process.exit(1);
}
function isInside(base,prefix,candidate){
  return candidate===base||candidate.startsWith(prefix);
}
async function resolveFromBase(base,prefix,relative){
  let candidate=path.resolve(base,relative);
  if(!isInside(base,prefix,candidate))return {status:403};
  let stat;
  try{stat=await fs.stat(candidate);}
  catch(error){
    if(error?.code==='ENOENT'||error?.code==='ENOTDIR')return {status:404};
    throw error;
  }
  if(stat.isDirectory()){
    candidate=path.join(candidate,'index.html');
    try{stat=await fs.stat(candidate);}
    catch(error){
      if(error?.code==='ENOENT'||error?.code==='ENOTDIR')return {status:404};
      throw error;
    }
  }
  if(!stat.isFile())return {status:404};
  const realCandidate=await fs.realpath(candidate);
  if(!isInside(base,prefix,realCandidate))return {status:403};
  return {status:200,file:realCandidate,size:stat.size};
}
async function resolveRequestPath(pathname){
  if(pathname.includes('\0')||pathname.includes('\\'))return {status:400};
  const relative=pathname.replace(/^\/+/u,'');
  const rootResult=await resolveFromBase(root,rootPrefix,relative);
  if(rootResult.status!==404)return rootResult;
  return resolveFromBase(publicRoot,publicRootPrefix,relative);
}
function send(response,status,body,headers={}){
  const bytes=Buffer.from(String(body),'utf8');
  response.writeHead(status,{
    'Content-Type':'text/plain; charset=utf-8',
    'Content-Length':bytes.length,
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    ...headers,
  });
  response.end(bytes);
}
function sendJson(response,status,value){
  send(response,status,JSON.stringify(value),{'Content-Type':'application/json; charset=utf-8'});
}
async function sendFile(response,request,resolved,pathname){
  const headers={
    'Content-Type':MIME[path.extname(resolved.file).toLowerCase()]||'application/octet-stream',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
  };
  if(pathname==='/m26/iberfit-sw.js')headers['Service-Worker-Allowed']='/';

  const dynamic=pathname==='/m26/sw.js'||
    pathname==='/m26/iberfit-sw.js'||
    pathname==='/m26/app.js'||
    pathname==='/m26/index.html';

  if(dynamic){
    let text=await fs.readFile(resolved.file,'utf8');
    const meta=RELEASES[release];
    if(pathname==='/m26/sw.js'){
      text=text
        .replace(/^const VERSION='[^']+';/mu,`const VERSION='${meta.version}';`)
        .replace(/^const PREVIOUS_VERSION='[^']+';/mu,`const PREVIOUS_VERSION='${meta.previous}';`);
    }else if(pathname==='/m26/iberfit-sw.js'){
      text=`/* P0_BROWSER_RELEASE:${meta.marker} */\n${text}`;
    }else if(pathname==='/m26/app.js'){
      text=`globalThis.__IBERFIT_P0_BROWSER_RELEASE__='${meta.marker}';\n${text}`;
    }else{
      text=text.replace('<head>',`<head>\n  <meta name="iberfit-p0-browser-release" content="${meta.marker}">`);
    }
    const bytes=Buffer.from(text,'utf8');
    response.writeHead(200,{...headers,'Content-Length':bytes.length});
    if(request.method==='HEAD')response.end();
    else response.end(bytes);
    return;
  }

  response.writeHead(200,{...headers,'Content-Length':resolved.size});
  if(request.method==='HEAD'){response.end();return;}
  createReadStream(resolved.file).pipe(response);
}

const rawPort=String(process.argv[2]??DEFAULT_PORT).trim();
const host=String(process.argv[3]??DEFAULT_HOST).trim();
if(!/^\d+$/u.test(rawPort))fail(`INVALID_PORT:${rawPort}`);
const port=Number(rawPort);
if(!Number.isInteger(port)||port<1||port>65535)fail(`INVALID_PORT:${rawPort}`);
if(host!==DEFAULT_HOST)fail(`INVALID_HOST:${host}`);

const server=http.createServer(async(request,response)=>{
  try{
    requests+=1;
    const url=new URL(request.url||'/','http://127.0.0.1');
    if(request.method!=='GET'&&request.method!=='HEAD'){
      send(response,405,'Method Not Allowed',{'Allow':'GET, HEAD'});
      return;
    }
    if(url.pathname==='/__p0/state'){
      sendJson(response,200,{release,optionalFail,optionalFailures,requests});
      return;
    }
    if(url.pathname==='/__p0/release'){
      const next=String(url.searchParams.get('value')||'');
      if(!Object.hasOwn(RELEASES,next)){send(response,400,'Invalid release');return;}
      release=next;
      optionalFail=url.searchParams.get('optionalFail')==='1';
      optionalFailures=0;
      sendJson(response,200,{release,optionalFail,optionalFailures});
      return;
    }
    if(release==='n'&&optionalFail&&url.pathname===OPTIONAL_FAILURE_PATH){
      optionalFailures+=1;
      send(response,503,'P0 optional asset fault injection');
      return;
    }
    const resolved=await resolveRequestPath(url.pathname);
    if(resolved.status!==200){
      send(response,resolved.status,resolved.status===400?'Bad Request':resolved.status===403?'Forbidden':'Not Found');
      return;
    }
    await sendFile(response,request,resolved,url.pathname);
  }catch(error){
    console.error(`P0_PWA_SERVER_REQUEST_ERROR:${error?.stack||error?.message||String(error)}`);
    if(!response.headersSent)send(response,500,'Internal Server Error');
    else response.destroy(error);
  }
});
server.listen(port,host,()=>console.log(`P0_PWA_SERVER_READY=http://${host}:${port}`));
function shutdown(signal){
  console.log(`P0_PWA_SERVER_SHUTDOWN=${signal}`);
  server.close(()=>process.exit());
  setTimeout(()=>process.exit(1),2_000).unref();
}
process.once('SIGINT',()=>shutdown('SIGINT'));
process.once('SIGTERM',()=>shutdown('SIGTERM'));
