import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const port = Number(process.env.PORT || 3000);
const username = process.env.DASHBOARD_USER;
const password = process.env.DASHBOARD_PASSWORD;
const apiKey = process.env.CTM_API_KEY;
const apiSecret = process.env.CTM_API_SECRET;
const accountId = process.env.CTM_ACCOUNT_ID || '552231';
const host = 'api.calltrackingmetrics.com';
const cache = new Map();
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
if (!username || !password || password.length < 16) throw Error('Set DASHBOARD_USER and a DASHBOARD_PASSWORD of at least 16 characters');
if (!/^\d+$/.test(accountId)) throw Error('Invalid CTM_ACCOUNT_ID');
function equal(a,b) {
  const x=Buffer.from(a), y=Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x,y);
}
function authorized(req) {
  const value = req.headers.authorization || '';
  if (!value.startsWith('Basic ')) return false;
  try {
    const pair = Buffer.from(value.slice(6),'base64').toString('utf8');
    const colon = pair.indexOf(':');
    return colon > -1 && equal(pair.slice(0,colon),username) && equal(pair.slice(colon+1),password);
  } catch { return false; }
}
function respond(res,status,body,type='application/json; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function utcDay(d){return d.toISOString().slice(0,10);}
async function ctmSummary(range) {
  if (!apiKey || !apiSecret) return {status:'unavailable',reason:'CTM server credentials not configured',dazos:'unverified'};
  const hours = {'24h':24,'48h':48,'7d':168,'30d':720}[range];
  if (!hours) throw Error('Invalid range');
  const cutoff = Date.now()-hours*3600000;
  const from = utcDay(new Date(cutoff-86400000));
  const to = utcDay(new Date(Date.now()+86400000));
  const base = new URL('https://'+host+'/api/v1/accounts/'+accountId+'/calls');
  base.searchParams.set('start_date',from);
  base.searchParams.set('end_date',to);
  base.searchParams.set('per_page','250');
  base.searchParams.set('page','1');
  const auth='Basic '+Buffer.from(apiKey+':'+apiSecret).toString('base64');
  let next=base.toString(), pages=0, total=0, answered=0, missed=0, scored=0, qualified=0, dateUnknown=0;
  const seen = new Set();
  while(next && pages < 50) {
    const url = new URL(next);
    if(url.protocol !== 'https:' || url.hostname !== host || !url.pathname.startsWith('/api/v1/accounts/'+accountId+'/calls')) throw Error('Unsafe CTM pagination URL');
    if(seen.has(next)) throw Error('Repeated CTM page cursor');
    seen.add(next);
    const response = await fetch(url,{headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw Error('CTM returned HTTP '+response.status);
    const body = await response.json();
    if(!Array.isArray(body.calls)) throw Error('CTM response missing calls array');
    pages++;
    for(const call of body.calls) {
      if(!['inbound','incoming'].includes(String(call.direction || '').toLowerCase())) continue;
      const when = Date.parse(call.called_at || call.created_at || '');
      if(!Number.isFinite(when)) {dateUnknown++; continue;}
      if(when < cutoff || when > Date.now()+60000) continue;
      total++;
      const status = String(call.call_status || '').toLowerCase();
      if(status==='answered') answered++;
      if(['missed','unanswered','no-answer'].includes(status)) missed++;
      const score = typeof call.score==='number' ? call.score : (typeof call.score==='string' && call.score.trim()!=='' ? Number(call.score) : NaN);
      if(Number.isFinite(score)) {scored++;if(score>2) qualified++;}
    }
    if(body.next_page) next=body.next_page;
    else if(Number(body.total_pages)>pages) {
      base.searchParams.set('page',String(pages+1));next=base.toString();
    } else next=null;
  }
  if(next) throw Error('CTM pagination exceeded 50 pages; no partial results published');
  return {status:'live',source:'CTM',account_id:accountId,range,refreshed_at:new Date().toISOString(),inbound_calls:total,answered_calls:answered,missed_calls:missed,scored_calls:scored,qualified_scored_calls:qualified,unknown_timestamp_records:dateUnknown,scoring_rule:'Numeric CTM score > 2',status_caveat:'Call statuses other than answered/missed may exist',dazos:'unverified',patient_data_included:false};
}
const server = http.createServer(async(req,res)=>{
  if(!authorized(req)) {
    res.writeHead(401,{'WWW-Authenticate':'Basic realm="Excel Admissions Intelligence"','Cache-Control':'no-store'});
    res.end('Authentication required');return;
  }
  if(req.method!=='GET' && req.method!=='HEAD') return respond(res,405,{error:'Method not allowed'});
  const url = new URL(req.url,'http://localhost');
  if(url.pathname==='/healthz') return respond(res,200,{status:'ok',ctm_configured:Boolean(apiKey&&apiSecret),dazos:'unverified'});
  if(url.pathname==='/api/ctm/summary') {
    const range=url.searchParams.get('range') || '24h';
    if(!['24h','48h','7d','30d'].includes(range)) return respond(res,400,{error:'Unsupported range'});
    const cached=cache.get(range);
    if(cached && Date.now()-cached.time<300000) return respond(res,200,cached.data);
    try {
      const data=await ctmSummary(range);
      if(data.status==='live') cache.set(range,{time:Date.now(),data});
      return respond(res,200,data);
    } catch(err) {
      console.error('CTM summary refresh failed:',err.message);
      return respond(res,503,{status:'unavailable',reason:'CTM refresh failed; no stale numbers substituted',dazos:'unverified'});
    }
  }
  const paths={'/':'index.html','/index.html':'index.html','/live.js':'live.js'};
  const filename=paths[url.pathname];
  if(!filename) return respond(res,404,{error:'Not found'});
  try {
    const file=resolve(process.cwd(),filename);
    const info=await stat(file);
    if(!info.isFile()) throw Error('Not a file');
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    res.end(req.method==='HEAD'?undefined:bytes);
  } catch {respond(res,404,{error:'Not found'});}
});
server.listen(port,'0.0.0.0',()=>console.log('Excel Admissions secure dashboard listening on port '+port));
