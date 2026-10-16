// Events contain semantic page/action labels, never form values or customer records.
export const COMPANIES = Object.freeze({ tideline: 'TideLine', wonplace: 'WonPlace', loki: 'Loki', voyage: 'Voyage' });
const token = /^[a-zA-Z0-9_.:-]{1,100}$/;
export function companyEvent(value, now = Date.now()) {
  if (!value || !token.test(value.id || '') || !['activity','presence','incident','source'].includes(value.kind)) throw Error('Invalid company event');
  const clean = (v, n = 100) => String(v || '').replace(/[\r\n]/g, ' ').slice(0,n);
  const event = { id: value.id, kind: value.kind, at: now, source: clean(value.source || 'application'), userId: clean(value.userId), userName: clean(value.userName), sessionId: clean(value.sessionId), page: clean(value.page,50), action: clean(value.action), code: clean(value.code), severity: ['info','warning','error'].includes(value.severity) ? value.severity : 'info', ticketId: token.test(value.ticketId || '') ? value.ticketId : null };
  if (value.kind === 'presence' && (!token.test(event.userId) || !token.test(event.sessionId))) throw Error('Invalid presence');
  return event;
}
export function snapshotFrom(events, now=Date.now()) {
  const sessions = new Map();
  for (const event of [...events].reverse()) if (event.kind === 'presence' && !sessions.has(event.sessionId)) sessions.set(event.sessionId,event);
  return {asOf:now,events:events.slice(-200).reverse(),activeUsers:[...sessions.values()].filter(e=>e.action!=='left'&&now-e.at<90000),coverage:'Active means visible and active within 90 seconds. Recent events are retained for 7 days, capped at 2000 per company. Staff activity only; portal visitors and historical sessions are not yet instrumented.'};
}
