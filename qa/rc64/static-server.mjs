import http from 'node:http';
import {createReadStream,promises as fs} from 'node:fs';
import path from 'node:path';

const DEFAULT_PORT=4173;
const DEFAULT_HOST='127.0.0.1';

function fail(message){
  console.error(`RC64_STATIC_SERVER_FATAL:${message}`);
  process.exit(1);
}

const rawPort=String(process.argv[2]??DEFAULT_PORT).trim();
const host=String(process.argv[3]??DEFAULT_HOST).trim();

if(!/^\d+$/u.test(rawPort))fail(`INVALID_PORT:${rawPort}`);
const port=Number(rawPort);
if(!Number.isInteger(port)||port<1||port>65535)fail(`INVALID_PORT:${rawPort}`);
if(host!==DEFAULT_HOST)fail(`INVALID_HOST:${host}`);

const root=await fs.realpath(process.cwd());
const rootPrefix=root.endsWith(path.sep)?root:`${root}${path.sep}`;
const publicRoot=await fs.realpath(path.join(root,'public'));
const publicRootPrefix=publicRoot.endsWith(path.sep)?publicRoot:`${publicRoot}${path.sep}`;

const MIME=Object.freeze({
  '.css':'text/css; charset=utf-8',
  '.html':'text/html; charset=utf-8',
  '.ico':'image/x-icon',
  '.jpeg':'image/jpeg',
  '.jpg':'image/jpeg',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.map':'application/json; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.png':'image/png',
  '.svg':'image/svg+xml; charset=utf-8',
  '.txt':'text/plain; charset=utf-8',
  '.webp':'image/webp',
  '.woff':'font/woff',
  '.woff2':'font/woff2',
});

function sendText(response,status,text,extraHeaders={}){
  const body=Buffer.from(String(text),'utf8');
  response.writeHead(status,{
    'Content-Type':'text/plain; charset=utf-8',
    'Content-Length':body.length,
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    ...extraHeaders,
  });
  response.end(body);
}

function isInside(base,prefix,candidate){
  return candidate===base||candidate.startsWith(prefix);
}

async function resolveFromBase(base,prefix,relative){
  let candidate=path.resolve(base,relative);
  if(!isInside(base,prefix,candidate))return {status:403};

  let stat;
  try{
    stat=await fs.stat(candidate);
  }catch(error){
    if(error?.code==='ENOENT'||error?.code==='ENOTDIR')return {status:404};
    throw error;
  }

  if(stat.isDirectory()){
    candidate=path.join(candidate,'index.html');
    try{
      stat=await fs.stat(candidate);
    }catch(error){
      if(error?.code==='ENOENT'||error?.code==='ENOTDIR')return {status:404};
      throw error;
    }
  }

  if(!stat.isFile())return {status:404};

  let realCandidate;
  try{
    realCandidate=await fs.realpath(candidate);
  }catch(error){
    if(error?.code==='ENOENT'||error?.code==='ENOTDIR')return {status:404};
    throw error;
  }

  if(!isInside(base,prefix,realCandidate))return {status:403};
  return {status:200,file:realCandidate,size:stat.size};
}

async function resolveRequestPath(requestUrl){
  let pathname;
  try{
    pathname=decodeURIComponent(new URL(requestUrl,'http://127.0.0.1').pathname);
  }catch{
    return {status:400};
  }

  if(pathname.includes('\0')||pathname.includes('\\'))return {status:400};

  const relative=pathname.replace(/^\/+/u,'');

  const rootResult=await resolveFromBase(root,rootPrefix,relative);
  if(rootResult.status!==404)return rootResult;

  return resolveFromBase(publicRoot,publicRootPrefix,relative);
}

const server=http.createServer(async(request,response)=>{
  try{
    if(request.method!=='GET'&&request.method!=='HEAD'){
      sendText(response,405,'Method Not Allowed',{'Allow':'GET, HEAD'});
      return;
    }

    const resolved=await resolveRequestPath(request.url||'/');
    if(resolved.status!==200){
      const text=resolved.status===400?'Bad Request':
        resolved.status===403?'Forbidden':'Not Found';
      sendText(response,resolved.status,text);
      return;
    }

    const contentType=MIME[path.extname(resolved.file).toLowerCase()]||'application/octet-stream';
    response.writeHead(200,{
      'Content-Type':contentType,
      'Content-Length':resolved.size,
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
    });

    if(request.method==='HEAD'){
      response.end();
      return;
    }

    const stream=createReadStream(resolved.file);
    stream.on('error',(error)=>{
      if(!response.headersSent){
        sendText(response,500,'Internal Server Error');
      }else{
        response.destroy(error);
      }
    });
    stream.pipe(response);
  }catch(error){
    console.error(`RC64_STATIC_SERVER_REQUEST_ERROR:${error?.message||String(error)}`);
    if(!response.headersSent){
      sendText(response,500,'Internal Server Error');
    }else{
      response.destroy(error);
    }
  }
});

server.on('clientError',(error,socket)=>{
  console.error(`RC64_STATIC_SERVER_CLIENT_ERROR:${error?.message||String(error)}`);
  if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(port,host,()=>{
  console.log(`RC64_STATIC_SERVER_READY=http://${host}:${port}`);
});

function shutdown(signal){
  server.close((error)=>{
    if(error){
      console.error(`RC64_STATIC_SERVER_CLOSE_ERROR:${error.message}`);
      process.exitCode=1;
    }
    process.exit();
  });
  setTimeout(()=>process.exit(1),2_000).unref();
  console.log(`RC64_STATIC_SERVER_SHUTDOWN=${signal}`);
}

process.once('SIGINT',()=>shutdown('SIGINT'));
process.once('SIGTERM',()=>shutdown('SIGTERM'));