import {readTrakrReport} from './company-trakr.js';
import { DurableObject } from 'cloudflare:workers';
import { companyEvent, snapshotFrom } from './company-events.js';
export class CompanyHub extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS task_presence (id TEXT PRIMARY KEY, data TEXT NOT NULL, sequence INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at INTEGER NOT NULL, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS measurements (metric TEXT NOT NULL, at INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT \'\', value REAL NOT NULL, PRIMARY KEY(metric,at,currency))');
  }
  async trakrReport(){return this.ctx.blockConcurrencyWhile(async()=>{try{return await readTrakrReport(this.env);}catch{return {source:'Trakr Pro',status:'unavailable',financials:null};}});}
  snapshot(includeHistory=false) {
    const rows=this.ctx.storage.sql.exec('SELECT data FROM events WHERE at>? ORDER BY seq LIMIT 2000',Date.now()-7*86400000).toArray();
    const measurements=includeHistory?this.ctx.storage.sql.exec('SELECT metric,at,currency,value FROM measurements WHERE at>? ORDER BY at LIMIT 10000',Date.now()-30*86400000).toArray():[];
    return {...snapshotFrom(rows.map(row=>JSON.parse(row.data))),measurements};
  }
  ingest(values,measurements=[]) {
    const events=values.map(value=>companyEvent(value));
    this.ctx.storage.transactionSync(()=>{
      for(const p of measurements)this.ctx.storage.sql.exec('INSERT OR REPLACE INTO measurements(metric,at,currency,value) VALUES(?,?,?,?)',p.metric,p.at,p.currency||'',p.value);
      this.ctx.storage.sql.exec('DELETE FROM measurements WHERE at<? OR rowid NOT IN (SELECT rowid FROM measurements ORDER BY at DESC LIMIT 10000)',Date.now()-30*86400000);
      for(const event of events){
        this.ctx.storage.sql.exec('INSERT OR IGNORE INTO events(id,at,data) VALUES(?,?,?)',event.id,event.at,JSON.stringify(event));
        if(event.kind==='incident'&&event.ticketId){const prior=this.ctx.storage.sql.exec('SELECT data FROM events WHERE id=?',event.id).toArray()[0];const saved=JSON.parse(prior.data);if(saved.kind==='incident'&&!saved.ticketId)this.ctx.storage.sql.exec('UPDATE events SET data=? WHERE id=?',JSON.stringify({...saved,ticketId:event.ticketId}),event.id);}
      }
      this.ctx.storage.sql.exec('DELETE FROM events WHERE at<? OR seq NOT IN (SELECT seq FROM events ORDER BY seq DESC LIMIT 2000)',Date.now()-7*86400000);
    });
    const snapshot=JSON.stringify({type:'snapshot',...this.snapshot(),measurements});
    for(const socket of this.ctx.getWebSockets('company')) {
      try { if(socket.deserializeAttachment()?.expiresAt<=Date.now())socket.close(1008,'Reconnect to verify access');else socket.send(snapshot); } catch { socket.close(1011,'Reconnect'); }
    }
    return {accepted:events.length};
  }
  taskSnapshot() {
    this.ctx.storage.sql.exec('DELETE FROM task_presence WHERE expires_at<=?',Date.now());
    return {type:'task-presence',asOf:Date.now(),tasks:this.ctx.storage.sql.exec('SELECT data,sequence,expires_at FROM task_presence ORDER BY id LIMIT 64').toArray().map(r=>({...JSON.parse(r.data),sequence:r.sequence,expiresAt:r.expires_at}))};
  }
  broadcastTasks() {
    const data=JSON.stringify(this.taskSnapshot());
    for(const socket of this.ctx.getWebSockets('tickets'))try{if(socket.deserializeAttachment()?.expiresAt<=Date.now())socket.close(1008,'Reconnect to verify access');else socket.send(data);}catch{socket.close(1011,'Reconnect');}
  }
  publishTask(value,expectedSequence) {
    this.taskSnapshot();
    const prior=this.ctx.storage.sql.exec('SELECT data,sequence FROM task_presence WHERE id=?',value.taskId).toArray()[0];
    if(expectedSequence!==undefined&&expectedSequence!==(prior?.sequence||0))return {accepted:false,error:'Task draft changed; read before retrying',sequence:prior?.sequence||0};
    if(value.origin==='coordinator'&&prior){const old=JSON.parse(prior.data);if(old.origin==='tools'&&Date.now()-old.updatedAt<60000)return {accepted:true,sequence:prior.sequence};}
    if(!prior&&this.taskSnapshot().tasks.length>=64)return {accepted:false,error:'Collaboration room is full'};
    const sequence=(prior?.sequence||0)+1,expires=Date.now()+(value.origin==='coordinator'?90000:60000);
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO task_presence(id,data,sequence,expires_at) VALUES(?,?,?,?)',value.taskId,JSON.stringify(value),sequence,expires);
    this.broadcastTasks();return {accepted:true,sequence,expiresAt:expires};
  }
  markTaskConflict(id) {
    const row=this.ctx.storage.sql.exec('SELECT data,sequence,expires_at FROM task_presence WHERE id=?',id).toArray()[0];
    if(row){const data={...JSON.parse(row.data),status:'conflict',detail:'Ticket changed; draft kept. Read the latest revision.'};this.ctx.storage.sql.exec('UPDATE task_presence SET data=?,sequence=sequence+1 WHERE id=?',JSON.stringify(data),id);this.broadcastTasks();}
  }
  removeTask(id) {this.ctx.storage.sql.exec('DELETE FROM task_presence WHERE id=?',id);this.broadcastTasks();return {accepted:true};}
  async fetch(request) {
    if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    const [client,server]=Object.values(new WebSocketPair());
    const tickets=new URL(request.url).pathname==='/tickets';
    this.ctx.acceptWebSocket(server,tickets?['tickets']:['company']);server.serializeAttachment({expiresAt:Date.now()+60000,tickets});
    server.send(JSON.stringify(tickets?this.taskSnapshot():{type:'snapshot',...this.snapshot()}));
    return new Response(null,{status:101,webSocket:client});
  }
  webSocketMessage(socket,message) {
    if(socket.deserializeAttachment()?.expiresAt<=Date.now())return socket.close(1008,'Reconnect to verify access');
    if(message==='snapshot')socket.send(JSON.stringify(socket.deserializeAttachment()?.tickets?this.taskSnapshot():{type:'snapshot',...this.snapshot()}));
  }
  webSocketClose(socket,code,reason) { socket.close(code,reason); }
  webSocketError(socket) { socket.close(1011,'Reconnect'); }
}
