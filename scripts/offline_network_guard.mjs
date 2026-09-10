import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import dns from 'node:dns';
import {syncBuiltinESMExports} from 'node:module';

const CODE='OFFLINE_TEST_NETWORK_FORBIDDEN';
function denied(channel='network'){
  const error=new Error(`${CODE}:${channel}`);
  error.code=CODE;
  throw error;
}
function deny(channel){return function(){return denied(channel);};}

http.request=deny('http.request');
http.get=deny('http.get');
https.request=deny('https.request');
https.get=deny('https.get');
net.connect=deny('net.connect');
net.createConnection=deny('net.createConnection');
net.Socket.prototype.connect=deny('net.Socket.connect');
tls.connect=deny('tls.connect');
dgram.createSocket=deny('dgram.createSocket');
dns.lookup=deny('dns.lookup');
dns.resolve=deny('dns.resolve');
dns.resolve4=deny('dns.resolve4');
dns.resolve6=deny('dns.resolve6');
if(dns.promises){
  dns.promises.lookup=async()=>denied('dns.promises.lookup');
  dns.promises.resolve=async()=>denied('dns.promises.resolve');
  dns.promises.resolve4=async()=>denied('dns.promises.resolve4');
  dns.promises.resolve6=async()=>denied('dns.promises.resolve6');
}
syncBuiltinESMExports();

globalThis.fetch=async()=>denied('fetch');
if(typeof globalThis.WebSocket==='function'){
  globalThis.WebSocket=class OfflineNetworkForbiddenWebSocket{constructor(){denied('WebSocket');}};
}

process.env.M26_OFFLINE_NETWORK_GUARD='active';