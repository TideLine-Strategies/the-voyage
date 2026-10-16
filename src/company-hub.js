import { DurableObject } from 'cloudflare:workers';
import { companyEvent, snapshotFrom } from './company-events.js';
export class CompanyHub extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, at INTEGER NOT NULL, data TEXT NOT NULL)');
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS measurements (metric TEXT NOT NULL, at INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT \'\', value REAL NOT NULL, PRIMARY KEY(metric,at,currency))');
  }
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
    for(const socket of this.ctx.getWebSockets()) {
      try { if(socket.deserializeAttachment()?.expiresAt<=Date.now())socket.close(1008,'Reconnect to verify access');else socket.send(snapshot); } catch { socket.close(1011,'Reconnect'); }
    }
    return {accepted:events.length};
  }
  async fetch(request) {
    if(request.headers.get('upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    const [client,server]=Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);server.serializeAttachment({expiresAt:Date.now()+60000});
    server.send(JSON.stringify({type:'snapshot',...this.snapshot()}));
    return new Response(null,{status:101,webSocket:client});
  }
  webSocketMessage(socket,message) {
    if(socket.deserializeAttachment()?.expiresAt<=Date.now())return socket.close(1008,'Reconnect to verify access');
    if(message==='snapshot')socket.send(JSON.stringify({type:'snapshot',...this.snapshot()}));
  }
  webSocketClose(socket,code,reason) { socket.close(code,reason); }
  webSocketError(socket) { socket.close(1011,'Reconnect'); }
}
