import { createRemoteJWKSet, jwtVerify } from "jose";
import { calendarAddress, eventsFromIcs } from "./ical.js";
import { STARTER_SEQUENCES, nextStepDate, sanitizeSequence, stepTask, OUTCOMES } from "./sequences.js";
import { DEFAULT_RULES, EDITABLE, MAX_FILE_BYTES, approvalFlags, calculateProcessing, calculateTotals, closeProblems, detectFileType, sanitizeDeal, sanitizeProcessingSettings, submitProblems } from "./deals.js";
const COLLECTIONS = new Set(["opps", "activities", "activity", "notes", "channels", "messages", "settings", "reads", "vendors", "profiles", "deals", "catalog", "residuals", "sequences", "enrollments", "contacts"]);
// Profile fields each member can fill in about themselves, with maximum lengths.
const PROFILE_FIELDS = { title: 100, phone: 40, location: 100, timezone: 60, hours: 100, contact: 40, linkedin: 300, focus: 300, bio: 1500 };
// Editors only: guests can neither see nor change these.
const EDITOR_COLLECTIONS = new Set(["vendors", "deals", "catalog", "residuals", "sequences", "enrollments"]);
const CRM_COLLECTIONS = new Set(["opps", "activities", "activity", "notes", "contacts"]);
const CHAT_COLLECTIONS = new Set(["channels", "messages"]);
const storageCollection = (actor, collection) => actor.role === "guest" && CHAT_COLLECTIONS.has(collection) ? `guest_${collection}` : collection;

export async function memberForEmail(email, db) {
  if (!email) return null;
  return db.prepare("SELECT id, name, role FROM members WHERE email = ? AND active = 1")
    .bind(String(email).trim()).first();
}

async function memberForId(id, db) {
  return db.prepare("SELECT id, name, role FROM members WHERE id = ? AND active = 1").bind(id).first();
}

async function teamMembers(db) {
  const { results } = await db.prepare("SELECT id, name, role FROM members WHERE active = 1 ORDER BY name").all();
  return results;
}
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;
const MAX_BODY_BYTES = 65536;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const SESSION_MAX_AGE = 180 * 24 * 60 * 60;
const INVITE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function tokenHash(token) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)).then(bytes =>
    [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join(""));
}

function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function memberForSession(request, env) {
  const cookie = request.headers.get("cookie") || "";
  const token = cookie.split(";").map(part => part.trim()).find(part => part.startsWith("voyage_session="))?.slice(15);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await env.DB.prepare("SELECT member_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await tokenHash(token), Date.now()).first();
  return row ? memberForId(row.member_id, env.DB) : null;
}

function invitePage(token, valid) {
  const body = valid
    ? `<form id="open" method="post" action="/invite/${token}"><button type="submit">Open The Voyage</button></form><p id="status" role="status"></p><script>document.getElementById('open').addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;button.textContent='Opening…';try{const response=await fetch(event.target.action,{method:'POST',credentials:'same-origin'});if(!response.ok||!response.redirected)throw Error('Unable to sign in');const check=await fetch('/api/me',{credentials:'same-origin'});if(!check.ok)throw Error('Session was not saved');location.replace('/')}catch(_){document.getElementById('status').textContent='The invitation could not open in this browser. Try a different browser or ask Quan for a new link.';button.disabled=false;button.textContent='Open The Voyage'}})</script>`
    : "<p>This invitation has expired or was already used. Ask Quan for a new link.</p>";
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Voyage invitation</title><style>body{font:16px system-ui;background:#071726;color:#f1f6fa;min-height:100vh;display:grid;place-content:center;text-align:center;padding:24px}button{background:#42b6d4;color:#071726;border:0;border-radius:8px;padding:14px 22px;font:inherit;font-weight:700;cursor:pointer}</style><h1>The Voyage</h1>${body}</html>`, {
    status: valid ? 200 : 410,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" },
  });
}

function signInPage() {
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Voyage</title><style>body{font:16px system-ui;background:#071726;color:#f1f6fa;min-height:100vh;display:grid;place-content:center;text-align:center;padding:24px}p{max-width:30rem;line-height:1.5}</style><h1>The Voyage</h1><p>Open the private invitation sent to your TideLine email to sign in. Ask Quan for a new invitation if your link has expired.</p></html>', {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" },
  });
}

async function handleInvite(request, env, token) {
  if (!INVITE_PATTERN.test(token)) return invitePage("", false);
  const hash = await tokenHash(token);
  const invite = await env.DB.prepare("SELECT member_id, email FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(hash, Date.now()).first();
  const member = invite && await memberForEmail(invite.email, env.DB);
  if (!member || member.id !== invite.member_id) return invitePage("", false);
  if (request.method === "GET") return invitePage(token, true);
  if (request.method !== "POST" || !checkWriteOrigin(request)) return error("Forbidden", 403);
  const now = Date.now();
  const result = await env.DB.prepare("UPDATE invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(now, hash, now).run();
  if (!result.meta.changes) return invitePage("", false);
  await audit(env, member.id, "Signed in", null, null, "Opened invitation link");
  const session = randomToken();
  await env.DB.prepare("INSERT INTO sessions (token_hash, member_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(await tokenHash(session), member.id, now + SESSION_MAX_AGE * 1000, now).run();
  return new Response(null, {
    status: 303,
    headers: {
      "location": "/", "cache-control": "no-store", "referrer-policy": "no-referrer",
      "set-cookie": `voyage_session=${session}; Max-Age=${SESSION_MAX_AGE}; Path=/; Secure; HttpOnly; SameSite=Lax`,
    },
  });
}

// Guests can change existing CRM records and use their private chat space.
export function canWrite(actor, path, method) {
  if (actor.role === "edit") return true;
  if (path[1] === "presence" || path[1] === "muninn" || path[1] === "usage" || path[1] === "me") return true;
  if (path[1] === "document" && (path[2] === "reads" || path[2] === "profiles")) return path[3] === actor.id;
  if (path[1] === "document" && CRM_COLLECTIONS.has(path[2])) return method === "PATCH";
  if (CHAT_COLLECTIONS.has(path[2])) {
    if (path[1] === "collection") return method === "POST";
    return path[1] === "document" && (path[2] !== "channels" || method !== "DELETE");
  }
  return false;
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function error(message, status) {
  return reply({ error: message }, status);
}

// For endpoints where a body is optional: an absent or empty body (as Cloudflare sends for a bare POST) is {}.
async function readOptionalJson(request) {
  if (!request.body) return {};
  const text = await request.text();
  if (!text.trim()) return {};
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Invalid JSON"); }
  if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("Expected a JSON object");
  return data;
}

async function readJson(request) {
  if (!request.body) throw new Error("Missing JSON body");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("JSON body is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error("Invalid JSON"); }
  if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("Expected a JSON object");
  return data;
}

export function validateDocument(collection, id, data, actor, method) {
  if (!COLLECTIONS.has(collection) || !ID_PATTERN.test(id)) throw new Error("Unknown document path");
  if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("Expected an object");
  if (collection === "settings") throw new Error("Team settings cannot be changed here");
  if (collection === "reads" && id !== actor.id) throw new Error("Wrong member");
  if (collection === "profiles") {
    if (id !== actor.id) throw new Error("Wrong member");
    for (const [key, value] of Object.entries(data)) {
      if (key === "updatedTs") continue;
      if (!Object.hasOwn(PROFILE_FIELDS, key) || typeof value !== "string" || value.length > PROFILE_FIELDS[key]) throw new Error(`Invalid profile field: ${key}`);
    }
    data.updatedTs = Date.now();
  }
  if (collection === "messages") {
    if (method === "PATCH") {
      if (Object.keys(data).some(key => key !== "reactions")) throw new Error("Only reactions can be updated");
    } else if (method === "PUT") {
      throw new Error("Messages cannot be replaced");
    } else {
      if (typeof data.text !== "string" || !data.text.trim() || data.text.length > 4000) throw new Error("Invalid message");
      data.by = actor.id;
      data.ts = Date.now();
    }
  }
  if (collection === "channels" && actor.role === "guest") {
    if (method === "PATCH" && Object.keys(data).some(key => key !== "name" && key !== "oppId")) throw new Error("Only chat name and account can be updated");
    if (method === "PUT" || method === "POST") data.by = actor.id;
  }
  if (collection === "activity" && method !== "PATCH") data.by = actor.id;
  if (collection === "notes" && method !== "PATCH") data.by = actor.id;
  if (collection === "catalog" && id === "processing") return sanitizeProcessingSettings(data);
  if (collection === "contacts") return sanitizeContact(data, method);
  if (collection === "sequences") { if (method === "PATCH") throw new Error("Invalid sequence: save the whole sequence"); return sanitizeSequence(data); }
  // One month of actual processing results for one merchant, entered by hand until the partner portal feeds it.
  if (collection === "residuals") {
    const n = (v, max) => { const x = Number(v); if (!Number.isFinite(x) || x < 0 || x > max) throw new Error("Invalid residual amount"); return Math.round(x * 100) / 100; };
    if (method === "PATCH") throw new Error("Invalid residual: replace the whole month");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month || "")) throw new Error("Invalid residual month");
    if (typeof data.oppId !== "string" || !ID_PATTERN.test(data.oppId)) throw new Error("Invalid residual account");
    return { month: data.month, oppId: data.oppId, volume: n(data.volume ?? 0, 1e9), txns: Math.round(n(data.txns ?? 0, 1e7)), residual: n(data.residual ?? 0, 1e7),
      source: data.source === "portal" ? "portal" : "manual", note: typeof data.note === "string" ? data.note.slice(0, 500) : "", by: actor.id, enteredTs: Date.now() };
  }
  if (collection === "vendors" && (method !== "PATCH" || Object.hasOwn(data, "name"))) {
    if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 200) throw new Error("Invalid vendor name");
  }
  return data;
}

async function verifyAccess(request, env) {
  if (!env.POLICY_AUD || env.POLICY_AUD.startsWith("CONFIGURE_") || !env.TEAM_DOMAIN) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  try {
    const keys = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, keys, { issuer: env.TEAM_DOMAIN, audience: env.POLICY_AUD });
    return memberForEmail(payload.email, env.DB);
  } catch {
    return null;
  }
}

function parsePath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") return null;
  return parts;
}

function checkWriteOrigin(request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

async function getDocument(db, collection, id) {
  const row = await db.prepare("SELECT data_json FROM documents WHERE collection = ? AND id = ?").bind(collection, id).first();
  return row ? JSON.parse(row.data_json) : null;
}

async function muninnContext(db, actor) {
  const sections = [];
  for (const [collection, title, limit, budget] of [
    ["opps", "ACCOUNTS", 250, 40000], ["activities", "TASKS AND APPOINTMENTS", 250, 12000],
    ["notes", "MEETING NOTES", 80, 5000], ["messages", "TEAM CHAT", 80, 4000],
    ["activity", "RECENT ACTIVITY", 100, 5000], ["contacts", "CONTACTS", 300, 6000],
    ...(actor.role === "edit" ? [["vendors", "VENDORS AND PARTNERS", 200, 8000]] : []),
  ]) {
    const { results } = await db.prepare("SELECT data_json FROM documents WHERE collection = ? ORDER BY updated_at DESC LIMIT ?")
      .bind(storageCollection(actor, collection), limit).all();
    const lines = results.map(row => JSON.stringify(JSON.parse(row.data_json)).slice(0, 1000));
    sections.push(`${title} (${results.length}):\n${(lines.join("\n") || "none").slice(0, budget)}`);
  }
  return `Today is ${new Date().toISOString().slice(0, 10)}. The person asking is ${actor.name}. Pipeline stages: Prospecting, Discovery, Alignment, Assessment, Validation, Proposal, Business review.\n\n${sections.join("\n\n")}`;
}

function muninnTurns(data) {
  return Array.isArray(data?.turns) ? data.turns.filter(turn =>
    (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string"
  ).slice(-20) : [];
}

async function handleMuninn(request, env, actor) {
  if (request.method === "GET") {
    const thread = await getDocument(env.DB, "assistant_threads", actor.id);
    return reply({ turns: muninnTurns(thread) });
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM documents WHERE collection = 'assistant_threads' AND id = ?").bind(actor.id).run();
    return reply({ turns: [] });
  }
  if (request.method !== "POST") return error("Method not allowed", 405);
  const body = await readJson(request);
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 1000) return error("Question must be 1 to 1000 characters", 400);
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer || answer.length > 4000) return error("Answer must be 1 to 4000 characters", 400);
  const thread = await getDocument(env.DB, "assistant_threads", actor.id);
  const turns = muninnTurns(thread).slice(-10);
  const saved = { turns: [...turns, { role: "user", text: question }, { role: "assistant", text: answer }].slice(-20) };
  await env.DB.prepare("INSERT INTO documents (collection, id, data_json, updated_at) VALUES ('assistant_threads', ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data_json = excluded.data_json, revision = revision + 1, updated_at = excluded.updated_at")
    .bind(actor.id, JSON.stringify(saved), Date.now()).run();
  return reply({ answer, turns: saved.turns });
}

const USAGE_KINDS = new Set(["open", "view", "action"]);
const USAGE_KEEP_MS = 180 * 86400000;

export function deviceFrom(userAgent) {
  const ua = String(userAgent || "");
  const kind = /iPad|Tablet/i.test(ua) ? "Tablet" : /Mobi|iPhone|Android/i.test(ua) ? "Phone" : "Computer";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other browser";
  return `${kind}, ${browser}`;
}

// Every member reports their own page views and action labels; only editors can read them.
// Usage must never break the app, so a missing table (before migration 0004) is ignored on write.
async function handleUsage(request, env, actor) {
  if (request.method === "POST") {
    const body = await readJson(request);
    const events = (Array.isArray(body.events) ? body.events : []).slice(0, 50)
      .filter(event => event && USAGE_KINDS.has(event.kind) && typeof event.view === "string" && event.view);
    const cf = request.cf || {};
    const device = deviceFrom(request.headers.get("user-agent"));
    const now = Date.now();
    try {
      for (const event of events) {
        const ts = Number.isFinite(event.ts) && event.ts <= now && event.ts > now - 86400000 ? event.ts : now;
        await env.DB.prepare("INSERT INTO usage_events (member_id, ts, kind, view, action, device, city, region, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(actor.id, ts, event.kind, event.view.slice(0, 40), typeof event.action === "string" ? event.action.slice(0, 80) : null,
            device, cf.city || null, cf.region || null, cf.country || null).run();
      }
    } catch { return reply({ ok: false }, 202); }
    return reply({ ok: true, saved: events.length });
  }
  if (request.method !== "GET") return error("Method not allowed", 405);
  if (actor.role !== "edit") return error("Not available to guests", 403);
  const days = Math.min(180, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  try {
    await env.DB.prepare("DELETE FROM usage_events WHERE ts < ?").bind(Date.now() - USAGE_KEEP_MS).run();
    const { results } = await env.DB.prepare("SELECT member_id AS who, ts, kind, view, action, device, city, region, country FROM usage_events WHERE ts > ? ORDER BY ts DESC LIMIT 20000")
      .bind(Date.now() - days * 86400000).all();
    return reply({ days, events: results, members: await teamMembers(env.DB) });
  } catch {
    return error("Usage tracking is not set up yet. Apply migration 0004.", 503);
  }
}

// Audit entries are written by the Worker. A missing table (before migration 0005) never blocks a change.
export async function audit(env, memberId, action, collection, docId, label) {
  try {
    await env.DB.prepare("INSERT INTO audit_log (ts, member_id, action, collection, doc_id, label) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(Date.now(), memberId, action, collection, docId, label ? String(label).slice(0, 120) : null).run();
  } catch { /* audit table not created yet */ }
}

// A short, human label for the record being changed. Chat text is never recorded.
async function auditLabel(request, env, actor, path) {
  const pick = data => data && (data.name || data.oppName || data.title || data.type || null);
  if (path[2] === "messages") return "Chat message";
  if (path[2] === "profiles") return "Own profile";
  if (request.method === "DELETE" || request.method === "PATCH") {
    const current = path[3] && await getDocument(env.DB, storageCollection(actor, path[2]), path[3]).catch(() => null);
    if (request.method === "DELETE") return pick(current);
    const body = await request.clone().json().catch(() => null);
    return pick(current) || pick(body);
  }
  return pick(await request.clone().json().catch(() => null));
}

const icsText = value => String(value || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// "10:30", "2pm", "2:15 PM" -> [hour, minute]; bare hours before 8 are read as afternoon.
export function parseTime(text) {
  const match = String(text || "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0), meridiem = (match[3] || "").toLowerCase();
  if (hour > 23 || minute > 59) return null;
  if (meridiem === "p" && hour < 12) hour += 12;
  if (meridiem === "a" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour < 8) hour += 12;
  return [hour, minute];
}

// Private subscription feed of a member's appointments, for Google Calendar, Outlook, or Apple Calendar.
async function calendarFeed(env, file) {
  const token = file.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response("Not found", { status: 404 });
  let feed;
  try { feed = await env.DB.prepare("SELECT member_id FROM calendar_feeds WHERE token_hash = ?").bind(await tokenHash(token)).first(); } catch { feed = null; }
  const member = feed && await memberForId(feed.member_id, env.DB);
  if (!member) return new Response("Not found", { status: 404 });
  const { results } = await env.DB.prepare("SELECT id, data_json FROM documents WHERE collection = 'activities'").all();
  const pad = n => String(n).padStart(2, "0");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const events = results.map(row => ({ id: row.id, ...JSON.parse(row.data_json) }))
    .filter(item => item.kind === "appt" && /^\d{4}-\d{2}-\d{2}$/.test(item.date || "") && ((item.owner || "CK") === member.id || (item.shared || []).includes(member.id)))
    .map(item => {
      const day = item.date.replace(/-/g, "");
      const time = parseTime(item.time);
      let when;
      if (time) {
        const end = new Date(Date.UTC(2000, 0, 1, time[0] + 1, time[1]));
        const endDay = time[0] === 23 ? new Date(Date.parse(item.date) + 86400000).toISOString().slice(0, 10).replace(/-/g, "") : day;
        when = [`DTSTART:${day}T${pad(time[0])}${pad(time[1])}00`, `DTEND:${endDay}T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}00`];
      } else {
        const next = new Date(Date.parse(item.date) + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
        when = [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`];
      }
      return ["BEGIN:VEVENT", `UID:${item.id}@the-voyage`, `DTSTAMP:${stamp}`, ...when,
        `SUMMARY:${icsText(`${item.type || "Meeting"}${item.oppName ? ` with ${item.oppName}` : ""}`)}`,
        `DESCRIPTION:${icsText(`${item.done ? "Completed. " : ""}Open The Voyage for details.`)}`, "END:VEVENT"].join("\r\n");
    });
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TideLine Strategies//The Voyage//EN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsText(`The Voyage: ${member.name}`)}`, ...events, "END:VCALENDAR", ""].join("\r\n");
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

// Deal builder: drafts, approvals, and the close package. Status changes only happen here, never
// through the generic document API, and totals are always recomputed on the server.
async function handleDeals(request, env, actor, path) {
  const now = Date.now(), method = request.method, id = path[2], action = path[3];
  const save = deal => env.DB.prepare("INSERT INTO documents (collection, id, data_json, updated_at) VALUES ('deals', ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data_json = excluded.data_json, revision = revision + 1, updated_at = excluded.updated_at")
    .bind(deal.id, JSON.stringify(deal), now).run();
  const rules = { ...DEFAULT_RULES, ...(await getDocument(env.DB, "catalog", "rules").catch(() => null) || {}) };
  const processing = await getDocument(env.DB, "catalog", "processing").catch(() => null) || {};
  const refresh = deal => { deal.totals = { ...calculateTotals(deal), processing: calculateProcessing(deal.processing, processing) }; deal.flags = approvalFlags(deal, deal.totals, rules); deal.updatedTs = now; return deal; };
  const event = (deal, what, note) => { deal.history = [...(deal.history || []), { ts: now, by: actor.id, action: what, ...(note ? { note: String(note).slice(0, 1000) } : {}) }].slice(-100); };
  if (id && action === "files") return handleDealFiles(request, env, actor, id, path[4]);
  const body = method === "GET" || method === "DELETE" ? {} : await readOptionalJson(request);
  if (!id && method === "POST") {
    const deal = refresh({ ...sanitizeDeal(body), id: crypto.randomUUID(), status: "draft", createdTs: now, createdBy: actor.id });
    deal.owner ||= actor.id;
    event(deal, "Created");
    await save(deal);
    await audit(env, actor.id, "Created", "deals", deal.id, deal.name || "Untitled deal");
    return reply(deal, 201);
  }
  if (!id || !ID_PATTERN.test(id)) return error("Not found", 404);
  const current = await getDocument(env.DB, "deals", id);
  if (!current) return error("Deal not found", 404);
  const deal = { ...current };
  const wrongStatus = allowed => !allowed.includes(deal.status) && error(`This deal is ${deal.status === "pending" ? "waiting for approval" : deal.status === "changes" ? "waiting for changes" : deal.status}. Reopen it first.`, 409);
  if (!action && method === "PUT") {
    if (!EDITABLE.has(deal.status)) return error("Only drafts can be edited. Reopen the deal first.", 409);
    Object.assign(deal, sanitizeDeal(body));
    deal.owner ||= actor.id;
    refresh(deal);
    await save(deal);
    await audit(env, actor.id, "Saved", "deals", id, deal.name);
    return reply(deal);
  }
  if (!action && method === "DELETE") {
    if (!EDITABLE.has(deal.status) && deal.status !== "lost") return error("Only drafts and lost deals can be deleted", 409);
    await env.DB.prepare("DELETE FROM documents WHERE collection = 'deals' AND id = ?").bind(id).run();
    await deleteDealFiles(env, id);
    await audit(env, actor.id, "Deleted", "deals", id, deal.name);
    return reply({ ok: true });
  }
  if (method !== "POST" || !action) return error("Method not allowed", 405);
  const editors = (await teamMembers(env.DB)).filter(member => member.role === "edit");
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (action === "submit") {
    const blocked = wrongStatus(["draft", "changes"]); if (blocked) return blocked;
    refresh(deal);
    const problems = submitProblems(deal, deal.totals);
    if (problems.length) return reply({ error: "Finish the deal before submitting", problems }, 400);
    deal.submittedBy = actor.id; deal.submittedTs = now;
    deal.status = deal.flags.length ? "pending" : "approved";
    event(deal, deal.flags.length ? "Submitted for approval" : "Submitted (within guardrails, auto-approved)", note);
  } else if (action === "approve" || action === "changes") {
    const blocked = wrongStatus(["pending"]); if (blocked) return blocked;
    if (deal.submittedBy === actor.id && editors.some(member => member.id !== actor.id)) return error("Another editor needs to review a deal you submitted", 403);
    if (action === "changes" && !note) return error("Say what needs to change", 400);
    deal.status = action === "approve" ? "approved" : "changes";
    deal.reviewedBy = actor.id; deal.reviewedTs = now;
    event(deal, action === "approve" ? "Approved" : "Changes requested", note);
  } else if (action === "package") {
    const blocked = wrongStatus(["approved"]); if (blocked) return blocked;
    deal.close = sanitizeDeal({ ...deal, close: body.close }).close;
    if (body.terms?.startDate !== undefined) deal.terms = { ...deal.terms, startDate: sanitizeDeal({ terms: { ...deal.terms, startDate: body.terms.startDate } }).terms.startDate };
    event(deal, "Updated close package");
  } else if (action === "won") {
    const blocked = wrongStatus(["approved"]); if (blocked) return blocked;
    if (body.close) deal.close = sanitizeDeal({ ...deal, close: body.close }).close;
    if (body.terms?.startDate !== undefined) deal.terms = { ...deal.terms, startDate: sanitizeDeal({ terms: { ...deal.terms, startDate: body.terms.startDate } }).terms.startDate };
    const problems = closeProblems(deal, { signedDocs: await signedDocCount(env, id) });
    if (problems.length) return reply({ error: "Complete the close package", problems }, 400);
    deal.status = "won"; deal.wonTs = now; deal.closedBy = actor.id;
    event(deal, "Closed won", note);
    const opp = deal.oppId && await getDocument(env.DB, "opps", deal.oppId);
    if (opp) await env.DB.prepare("UPDATE documents SET data_json = ?, revision = revision + 1, updated_at = ? WHERE collection = 'opps' AND id = ?")
      .bind(JSON.stringify({ ...opp, closed: "won", wonDealId: id, wonTs: now, lastTouch: new Date(now).toISOString().slice(0, 10) }), now, deal.oppId).run();
  } else if (action === "lost") {
    const blocked = wrongStatus(["draft", "changes", "pending", "approved"]); if (blocked) return blocked;
    if (!note) return error("Add the reason it was lost", 400);
    deal.status = "lost"; deal.lostTs = now; deal.lostReason = note.slice(0, 500);
    event(deal, "Closed lost", note);
  } else if (action === "reopen") {
    const blocked = wrongStatus(["pending", "approved", "won", "lost"]); if (blocked) return blocked;
    if (deal.status === "won") {
      const opp = deal.oppId && await getDocument(env.DB, "opps", deal.oppId);
      if (opp && opp.wonDealId === id) {
        const { closed, wonDealId, wonTs, ...rest } = opp;
        await env.DB.prepare("UPDATE documents SET data_json = ?, revision = revision + 1, updated_at = ? WHERE collection = 'opps' AND id = ?").bind(JSON.stringify(rest), now, deal.oppId).run();
      }
    }
    deal.status = "draft";
    for (const key of ["wonTs", "lostTs", "lostReason", "reviewedBy", "reviewedTs"]) delete deal[key];
    event(deal, "Reopened", note);
  } else return error("Unknown action", 404);
  deal.updatedTs = now;
  await save(deal);
  await audit(env, actor.id, { submit: "Submitted", approve: "Approved", changes: "Requested changes", package: "Updated close package", won: "Closed won", lost: "Closed lost", reopen: "Reopened" }[action], "deals", id, deal.name);
  return reply(deal);
}

// Contacts: the people at each account. Every task and meeting names who it was with.
const CONTACT_ROLES = new Set(["Owner", "Decision maker", "Manager", "Front desk", "Billing", "Coach", "Other"]);
export function sanitizeContact(data, method) {
  const t = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
  if (method === "PATCH") {
    const out = {};
    for (const [key, max] of [["name", 120], ["title", 120], ["email", 200], ["phone", 40], ["notes", 1000]]) if (Object.hasOwn(data, key)) out[key] = t(data[key], max);
    if (Object.hasOwn(data, "role")) out.role = CONTACT_ROLES.has(data.role) ? data.role : "Other";
    if (Object.hasOwn(data, "primary")) out.primary = Boolean(data.primary);
    if (Object.hasOwn(out, "name") && !out.name) throw new Error("Invalid contact: a name is required");
    return out;
  }
  const out = { oppId: t(data.oppId, 100), name: t(data.name, 120), title: t(data.title, 120), email: t(data.email, 200), phone: t(data.phone, 40),
    role: CONTACT_ROLES.has(data.role) ? data.role : "Other", primary: Boolean(data.primary), notes: t(data.notes, 1000), createdTs: Number(data.createdTs) || Date.now() };
  if (!out.name) throw new Error("Invalid contact: a name is required");
  if (!ID_PATTERN.test(out.oppId)) throw new Error("Invalid contact: pick the account");
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new Error("Invalid contact: check the email address");
  return out;
}
// Saving a task or meeting, or marking one done, requires a contact from the same account.
async function activityContactProblem(request, env, path, method) {
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const existing = path[3] ? await getDocument(env.DB, "activities", path[3]).catch(() => null) : null;
  const merged = { ...(existing || {}), ...body };
  const needed = method !== "PATCH" || (body.done === true && !existing?.done) || Object.hasOwn(body, "contactId");
  if (!needed) return null;
  if (!merged.contactId) return "Pick who this was with: choose a contact or add a new one";
  const contact = await getDocument(env.DB, "contacts", String(merged.contactId)).catch(() => null);
  if (!contact) return "That contact no longer exists";
  if (merged.oppId && contact.oppId !== merged.oppId) return "That contact belongs to a different account";
  return null;
}
async function primaryContactId(env, oppId) {
  const { results } = await env.DB.prepare("SELECT id, data_json FROM documents WHERE collection = 'contacts'").all();
  const list = results.map(row => ({ id: row.id, ...JSON.parse(row.data_json) })).filter(c => c.oppId === oppId);
  return (list.find(c => c.primary) || list.find(c => c.role === "Owner" || c.role === "Decision maker") || list[0])?.id || "";
}

// Sequences: enroll accounts, and move each enrollment forward one task at a time.
const STAGE_NAMES = ["Prospecting", "Discovery", "Alignment", "Assessment", "Validation", "Proposal", "Business review"];
const todayIso = () => new Date().toISOString().slice(0, 10);
const putDoc = (env, collection, id, data) => env.DB.prepare("INSERT INTO documents (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data_json = excluded.data_json, revision = revision + 1, updated_at = excluded.updated_at")
  .bind(collection, id, JSON.stringify(data), Date.now()).run();
const dropDoc = (env, collection, id) => env.DB.prepare("DELETE FROM documents WHERE collection = ? AND id = ?").bind(collection, id).run();
async function templateVars(env, oppId, ownerId) {
  const opp = await getDocument(env.DB, "opps", oppId) || {};
  const owner = await memberForId(ownerId, env.DB), profile = await getDocument(env.DB, "profiles", ownerId) || {};
  return { account: opp.name || "", city: opp.city || "", stage: STAGE_NAMES[opp.stage] || "", my_name: owner?.name || "", my_title: profile.title || "", my_phone: profile.phone || "" };
}
async function scheduleStep(env, sequence, enrollment, index, date) {
  const taskId = crypto.randomUUID();
  const task = stepTask({ ...sequence }, enrollment, index, date, await templateVars(env, enrollment.oppId, enrollment.owner), Date.now());
  task.contactId = enrollment.contactId || await primaryContactId(env, enrollment.oppId);
  await putDoc(env, "activities", taskId, task);
  enrollment.stepIndex = index; enrollment.taskId = taskId; enrollment.nextDue = date;
}
async function removeOpenTask(env, enrollment) {
  if (!enrollment.taskId) return;
  const task = await getDocument(env.DB, "activities", enrollment.taskId);
  if (task && !task.done) await dropDoc(env, "activities", enrollment.taskId);
  enrollment.taskId = null; enrollment.nextDue = null;
}
async function handleSequences(request, env, actor, path) {
  const method = request.method, now = Date.now();
  const body = method === "POST" ? await readOptionalJson(request) : {};
  if (path[1] === "sequences" && path[2] === "starters" && method === "POST") {
    const created = [];
    for (const starter of STARTER_SEQUENCES) { const id = crypto.randomUUID(); await putDoc(env, "sequences", id, { ...sanitizeSequence(starter), createdTs: now, by: actor.id }); created.push(id); }
    await audit(env, actor.id, "Created", "sequences", null, "Starter sequences");
    return reply({ created }, 201);
  }
  if (path[1] === "sequences" && path[3] === "enroll" && method === "POST") {
    const sequence = await getDocument(env.DB, "sequences", path[2]);
    if (!sequence) return error("Sequence not found", 404);
    if (!sequence.steps?.length) return error("Add at least one step to this sequence first", 400);
    sequence.id = path[2];
    const oppIds = [...new Set((Array.isArray(body.oppIds) ? body.oppIds : []).filter(id => typeof id === "string" && ID_PATTERN.test(id)))].slice(0, 500);
    if (!oppIds.length) return error("Pick at least one account", 400);
    const start = /^\d{4}-\d{2}-\d{2}$/.test(body.startDate || "") ? body.startDate : todayIso();
    const { results } = await env.DB.prepare("SELECT data_json FROM documents WHERE collection = 'enrollments'").all();
    const activeOn = new Set(results.map(row => JSON.parse(row.data_json)).filter(e => e.sequenceId === sequence.id && ["active", "paused"].includes(e.status)).map(e => e.oppId));
    let enrolled = 0, skipped = 0;
    for (const oppId of oppIds) {
      const opp = await getDocument(env.DB, "opps", oppId);
      if (!opp || activeOn.has(oppId)) { skipped++; continue; }
      const owner = typeof body.owner === "string" && await memberForId(body.owner, env.DB) ? body.owner : opp.owner || actor.id;
      const enrollment = { id: crypto.randomUUID(), sequenceId: sequence.id, sequenceName: sequence.name, audience: sequence.audience, oppId, oppName: opp.name, owner,
        startDate: start, status: "active", stepIndex: 0, steps: sequence.steps.length, completed: [], createdTs: now, by: actor.id, updatedTs: now };
      await scheduleStep(env, sequence, enrollment, 0, addDaysIso(start, sequence.steps[0].day));
      await putDoc(env, "enrollments", enrollment.id, enrollment);
      enrolled++;
    }
    await audit(env, actor.id, "Enrolled accounts", "sequences", sequence.id, `${sequence.name}: ${enrolled} enrolled`);
    return reply({ enrolled, skipped });
  }
  if (path[1] === "enrollments" && path[3] && method === "POST") {
    const enrollment = await getDocument(env.DB, "enrollments", path[2]);
    if (!enrollment) return error("Enrollment not found", 404);
    enrollment.id = path[2];
    const sequence = await getDocument(env.DB, "sequences", enrollment.sequenceId);
    const action = path[3];
    if (action === "pause" && enrollment.status === "active") { await removeOpenTask(env, enrollment); enrollment.status = "paused"; }
    else if (action === "resume" && enrollment.status === "paused") {
      if (!sequence || !sequence.steps[enrollment.stepIndex]) return error("This sequence has changed; stop and re-enroll instead", 409);
      sequence.id = enrollment.sequenceId; enrollment.status = "active"; await scheduleStep(env, sequence, enrollment, enrollment.stepIndex, todayIso());
    } else if (action === "stop" && ["active", "paused"].includes(enrollment.status)) {
      await removeOpenTask(env, enrollment); enrollment.status = "stopped"; enrollment.stopReason = `Stopped by ${actor.name}`;
    } else if (action === "skip" && enrollment.status === "active") {
      await removeOpenTask(env, enrollment);
      enrollment.completed = [...(enrollment.completed || []), { step: enrollment.stepIndex, outcome: "skipped", ts: now, by: actor.id }];
      if (!sequence || enrollment.stepIndex + 1 >= (sequence.steps?.length || 0)) { enrollment.status = "completed"; }
      else { sequence.id = enrollment.sequenceId; await scheduleStep(env, sequence, enrollment, enrollment.stepIndex + 1, nextStepDate(sequence, enrollment.stepIndex, todayIso())); }
    } else return error(`Can't ${action} an enrollment that is ${enrollment.status}`, 409);
    enrollment.updatedTs = now;
    await putDoc(env, "enrollments", enrollment.id, enrollment);
    await audit(env, actor.id, { pause: "Paused", resume: "Resumed", stop: "Stopped", skip: "Skipped a step" }[action] || action, "enrollments", enrollment.id, `${enrollment.sequenceName}: ${enrollment.oppName}`);
    return reply(enrollment);
  }
  return error("Not found", 404);
}
const addDaysIso = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

// Runs after a successful change to tasks or accounts: advance, pause, or stop sequences.
async function sequenceHooks(env, actor, method, collection, docId, before) {
  try {
    if (collection === "activities" && docId) {
      const task = method === "DELETE" ? null : await getDocument(env.DB, "activities", docId);
      const seq = (task || before)?.seq;
      if (seq?.enrollmentId) {
        const enrollment = await getDocument(env.DB, "enrollments", seq.enrollmentId);
        if (enrollment && enrollment.taskId === docId && enrollment.status === "active") {
          enrollment.id = seq.enrollmentId;
          if (method === "DELETE") { enrollment.status = "paused"; enrollment.taskId = null; enrollment.nextDue = null; enrollment.pauseReason = "Its task was deleted"; }
          else if (task?.done && !before?.done) {
            const sequence = await getDocument(env.DB, "sequences", enrollment.sequenceId);
            enrollment.completed = [...(enrollment.completed || []), { step: enrollment.stepIndex, outcome: OUTCOMES.has(task.outcome) ? task.outcome : "done", ts: Date.now(), by: actor.id }];
            if (!sequence || enrollment.stepIndex + 1 >= (sequence.steps?.length || 0)) { enrollment.status = "completed"; enrollment.taskId = null; enrollment.nextDue = null; }
            else { sequence.id = enrollment.sequenceId; await scheduleStep(env, sequence, enrollment, enrollment.stepIndex + 1, nextStepDate(sequence, enrollment.stepIndex, todayIso())); }
          } else return;
          enrollment.updatedTs = Date.now();
          await putDoc(env, "enrollments", enrollment.id, enrollment);
        }
      }
      // Booking an appointment counts as a win for the sequence: stop it and clear its open task.
      if (method === "POST" || method === "PUT") {
        if (task?.kind === "appt" && task.oppId) await stopEnrollmentsFor(env, task.oppId, "Meeting booked", sequence => sequence?.stopOnMeeting !== false);
      }
    }
    if (collection === "opps" && docId && (method === "PATCH" || method === "PUT") && before) {
      const opp = await getDocument(env.DB, "opps", docId);
      if (opp && opp.stage !== before.stage) await stopEnrollmentsFor(env, docId, `Moved to ${STAGE_NAMES[opp.stage] || "a new stage"}`, sequence => sequence?.stopOnStage && sequence.audience === "prospect");
    }
  } catch { /* sequences are best-effort; never block the change itself */ }
}
async function stopEnrollmentsFor(env, oppId, reason, applies) {
  const { results } = await env.DB.prepare("SELECT id, data_json FROM documents WHERE collection = 'enrollments'").all();
  for (const row of results) {
    const enrollment = { ...JSON.parse(row.data_json), id: row.id };
    if (enrollment.oppId !== oppId || !["active", "paused"].includes(enrollment.status)) continue;
    if (!applies(await getDocument(env.DB, "sequences", enrollment.sequenceId))) continue;
    await removeOpenTask(env, enrollment);
    Object.assign(enrollment, { status: "stopped", stopReason: reason, success: reason === "Meeting booked", updatedTs: Date.now() });
    await putDoc(env, "enrollments", enrollment.id, enrollment);
  }
}

// Documents attached to a deal (signed agreements and supporting files), stored in D1 in 512 KB chunks.
const CHUNK = 512 * 1024;
async function signedDocCount(env, dealId) {
  try { return (await env.DB.prepare("SELECT COUNT(*) AS n FROM deal_files WHERE deal_id = ? AND kind = 'signed'").bind(dealId).first()).n; }
  catch { return 0; }
}
async function deleteDealFiles(env, dealId) {
  try {
    await env.DB.prepare("DELETE FROM deal_file_chunks WHERE file_id IN (SELECT id FROM deal_files WHERE deal_id = ?)").bind(dealId).run();
    await env.DB.prepare("DELETE FROM deal_files WHERE deal_id = ?").bind(dealId).run();
  } catch { /* files table not created yet */ }
}
async function handleDealFiles(request, env, actor, dealId, fileId) {
  const method = request.method;
  const deal = await getDocument(env.DB, "deals", dealId);
  if (!deal) return error("Deal not found", 404);
  const list = async () => (await env.DB.prepare("SELECT id, name, content_type, size, kind, uploaded_by, uploaded_ts FROM deal_files WHERE deal_id = ? ORDER BY uploaded_ts").bind(dealId).all()).results;
  try {
    if (!fileId && method === "GET") return reply({ files: await list() });
    if (!fileId && method === "POST") {
      if (["won", "lost"].includes(deal.status)) return error("Reopen the deal to change its documents", 409);
      const params = new URL(request.url).searchParams;
      const name = (params.get("name") || "document").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 150);
      const kind = params.get("kind") === "other" ? "other" : "signed";
      const declared = Number(request.headers.get("content-length") || 0);
      if (declared > MAX_FILE_BYTES) return error("Files can be up to 15 MB", 413);
      const bytes = new Uint8Array(await request.arrayBuffer());
      if (!bytes.length) return error("The file is empty", 400);
      if (bytes.length > MAX_FILE_BYTES) return error("Files can be up to 15 MB", 413);
      const type = detectFileType(bytes, name);
      if (!type) return error("Upload a PDF, Word document (.docx), or photo (JPG, PNG, HEIC)", 415);
      const id = crypto.randomUUID(), chunks = Math.ceil(bytes.length / CHUNK);
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
      for (let i = 0; i < chunks; i++) {
        await env.DB.prepare("INSERT INTO deal_file_chunks (file_id, idx, data) VALUES (?, ?, ?)").bind(id, i, bytes.slice(i * CHUNK, (i + 1) * CHUNK)).run();
      }
      await env.DB.prepare("INSERT INTO deal_files (id, deal_id, name, content_type, size, sha256, kind, chunks, uploaded_by, uploaded_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, dealId, name, type, bytes.length, sha256, kind, chunks, actor.id, Date.now()).run();
      await audit(env, actor.id, kind === "signed" ? "Attached signed document" : "Attached document", "deals", dealId, `${deal.name}: ${name}`);
      return reply({ files: await list() }, 201);
    }
    if (!fileId || !ID_PATTERN.test(fileId)) return error("Not found", 404);
    const file = await env.DB.prepare("SELECT * FROM deal_files WHERE id = ? AND deal_id = ?").bind(fileId, dealId).first();
    if (!file) return error("File not found", 404);
    if (method === "GET") {
      const parts = [];
      for (let i = 0; i < file.chunks; i++) {
        const row = await env.DB.prepare("SELECT data FROM deal_file_chunks WHERE file_id = ? AND idx = ?").bind(fileId, i).first();
        if (!row) return error("This file is incomplete", 500);
        parts.push(new Uint8Array(row.data));
      }
      const safeName = file.name.replace(/[^\w .()-]/g, "_");
      return new Response(new Blob(parts, { type: file.content_type }), { headers: {
        "content-type": file.content_type, "content-disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; sandbox",
      } });
    }
    if (method === "DELETE") {
      if (["won", "lost"].includes(deal.status)) return error("Reopen the deal to change its documents", 409);
      await env.DB.prepare("DELETE FROM deal_file_chunks WHERE file_id = ?").bind(fileId).run();
      await env.DB.prepare("DELETE FROM deal_files WHERE id = ?").bind(fileId).run();
      await audit(env, actor.id, "Removed document", "deals", dealId, `${deal.name}: ${file.name}`);
      return reply({ files: await list() });
    }
    return error("Method not allowed", 405);
  } catch { return error("Document storage is not set up yet. Apply migration 0006.", 503); }
}

// A member's own outside calendar (Google, Outlook, Apple), shown only to them on the Calendar page.
// The private address stays on the server; the browser only ever gets the provider name and events.
async function handleExternalCalendar(request, env, actor) {
  const provider = url => { const h = new URL(url).hostname; return h.includes("google") ? "Google Calendar" : h.includes("icloud") ? "Apple Calendar" : "Outlook"; };
  try {
    if (request.method === "PUT") {
      const { url } = await readJson(request);
      const address = calendarAddress(url);
      if (!address) return error("Use the private iCal address from Google Calendar, Outlook, or Apple Calendar (it starts with https:// or webcal://).", 400);
      await env.DB.prepare("INSERT INTO external_calendars (member_id, url, updated_at) VALUES (?, ?, ?) ON CONFLICT(member_id) DO UPDATE SET url = excluded.url, updated_at = excluded.updated_at")
        .bind(actor.id, address, Date.now()).run();
      await audit(env, actor.id, "Connected outside calendar", null, null, provider(address));
      return reply({ connected: true, provider: provider(address) });
    }
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM external_calendars WHERE member_id = ?").bind(actor.id).run();
      await audit(env, actor.id, "Disconnected outside calendar", null, null, null);
      return reply({ connected: false });
    }
    if (request.method !== "GET") return error("Method not allowed", 405);
    const row = await env.DB.prepare("SELECT url, updated_at FROM external_calendars WHERE member_id = ?").bind(actor.id).first();
    if (!row) return reply({ connected: false, events: [] });
    const params = new URL(request.url).searchParams;
    const from = Number(params.get("from")) || Date.now() - 45 * 86400000;
    const to = Math.min(Number(params.get("to")) || Date.now() + 120 * 86400000, from + 400 * 86400000);
    const profile = await getDocument(env.DB, "profiles", actor.id).catch(() => null);
    let text;
    try {
      const response = await fetch(row.url, { headers: { accept: "text/calendar" }, redirect: "follow", signal: AbortSignal.timeout(10000), cf: { cacheTtl: 300 } });
      if (!response.ok) throw new Error(String(response.status));
      text = await response.text();
      if (text.length > 5_000_000 || !text.includes("BEGIN:VCALENDAR")) throw new Error("not a calendar");
    } catch {
      return reply({ connected: true, provider: provider(row.url), error: "Couldn't read your calendar right now. Check that the private address is still valid.", events: [] });
    }
    return reply({ connected: true, provider: provider(row.url), events: eventsFromIcs(text, { from, to, fallbackZone: profile?.timezone || "America/Chicago" }) });
  } catch { return error("Calendar connections are not set up yet. Apply migration 0005.", 503); }
}

function currentSessionHash(request) {
  const token = (request.headers.get("cookie") || "").split(";").map(part => part.trim()).find(part => part.startsWith("voyage_session="))?.slice(15);
  return token ? tokenHash(token) : Promise.resolve("");
}

// Every member's own account: details, signed-in devices, and signing out.
async function handleProfile(request, env, actor, path) {
  const current = await currentSessionHash(request);
  if (path[2] === "profile" && request.method === "GET") {
    const member = await env.DB.prepare("SELECT id, name, email, role FROM members WHERE id = ?").bind(actor.id).first();
    const { results } = await env.DB.prepare("SELECT created_at, expires_at, token_hash = ? AS current FROM sessions WHERE member_id = ? AND expires_at > ? ORDER BY created_at DESC")
      .bind(current, actor.id, Date.now()).all();
    return reply({ ...member, devices: results });
  }
  if (path[2] === "signout" && request.method === "POST") {
    const { scope } = await readJson(request);
    const sql = {
      others: "DELETE FROM sessions WHERE member_id = ? AND token_hash != ?",
      this: "DELETE FROM sessions WHERE member_id = ? AND token_hash = ?",
      all: "DELETE FROM sessions WHERE member_id = ? AND ? IS NOT NULL",
    }[scope];
    if (!sql) return error("Expected scope: this, others, or all", 400);
    const result = await env.DB.prepare(sql).bind(actor.id, current).run();
    await audit(env, actor.id, "Signed out", null, null, { this: "This device", others: "Other devices", all: "All devices" }[scope]);
    return reply({ ok: true, signedOut: result.meta.changes });
  }
  if (path[2] === "external-calendar") return handleExternalCalendar(request, env, actor);
  if (path[2] === "calendar") {
    try {
      if (request.method === "GET") {
        const feed = await env.DB.prepare("SELECT created_at FROM calendar_feeds WHERE member_id = ?").bind(actor.id).first();
        return reply({ enabled: Boolean(feed), created_at: feed?.created_at || null });
      }
      if (request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM calendar_feeds WHERE member_id = ?").bind(actor.id).run();
        await audit(env, actor.id, "Turned off calendar link", null, null, null);
        return reply({ enabled: false });
      }
      if (request.method === "POST") {
        const token = randomToken();
        await env.DB.prepare("INSERT INTO calendar_feeds (member_id, token_hash, created_at) VALUES (?, ?, ?) ON CONFLICT(member_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at")
          .bind(actor.id, await tokenHash(token), Date.now()).run();
        await audit(env, actor.id, "Created calendar link", null, null, null);
        return reply({ enabled: true, url: `${new URL(request.url).origin}/cal/${token}.ics` });
      }
    } catch { return error("Calendar links are not set up yet. Apply migration 0005.", 503); }
  }
  return error("Not found", 404);
}

// Editor-only admin view: access, sign-ins, invitations, and storage. Never returns token hashes.
async function handleAdmin(request, env, actor, path) {
  if (actor.role !== "edit") return error("Not available to guests", 403);
  const now = Date.now();
  if (path.length === 3 && path[2] === "signout" && request.method === "POST") {
    const { member } = await readJson(request);
    if (typeof member !== "string" || !ID_PATTERN.test(member)) return error("Expected a member", 400);
    const result = await env.DB.prepare("DELETE FROM sessions WHERE member_id = ?").bind(member).run();
    await audit(env, actor.id, "Signed someone out", "members", member, `${result.meta.changes} device(s)`);
    return reply({ ok: true, signedOut: result.meta.changes });
  }
  if (path.length === 3 && path[2] === "audit" && request.method === "GET") {
    const days = Math.min(365, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
    try {
      await env.DB.prepare("DELETE FROM audit_log WHERE ts < ?").bind(now - 365 * 86400000).run();
      const { results } = await env.DB.prepare("SELECT ts, member_id AS who, action, collection, doc_id, label FROM audit_log WHERE ts > ? ORDER BY ts DESC, id DESC LIMIT 2000")
        .bind(now - days * 86400000).all();
      return reply({ days, entries: results });
    } catch { return error("The audit log is not set up yet. Apply migration 0005.", 503); }
  }
  if (path.length !== 2 || request.method !== "GET") return error("Not found", 404);
  const cookie = (request.headers.get("cookie") || "").split(";").map(part => part.trim()).find(part => part.startsWith("voyage_session="))?.slice(15);
  const currentHash = cookie ? await tokenHash(cookie) : "";
  const all = async (sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
  let usageEvents = null;
  try { usageEvents = (await env.DB.prepare("SELECT COUNT(*) AS n FROM usage_events").first()).n; } catch { /* migration 0004 not applied yet */ }
  return reply({
    now,
    members: await all("SELECT id, name, email, role, active FROM members ORDER BY active DESC, role, name"),
    sessions: await all("SELECT member_id, created_at, expires_at, token_hash = ? AS current FROM sessions WHERE expires_at > ? ORDER BY created_at DESC LIMIT 200", currentHash, now),
    expiredSessions: (await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at <= ?").bind(now).first()).n,
    invites: await all("SELECT member_id, email, expires_at, used_at FROM invites ORDER BY expires_at DESC LIMIT 200"),
    storage: await all("SELECT collection, COUNT(*) AS records, SUM(LENGTH(data_json)) AS bytes, MAX(updated_at) AS updated FROM documents GROUP BY collection ORDER BY collection"),
    usageEvents,
    settings: {
      sessionDays: SESSION_MAX_AGE / 86400, inviteDays: 30,
      cloudflareAccess: Boolean(env.POLICY_AUD && !env.POLICY_AUD.startsWith("CONFIGURE_") && env.TEAM_DOMAIN),
    },
  });
}

async function handleApi(request, env, actor, path) {
  const method = request.method;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return error("Method not allowed", 405);
  if (method !== "GET" && !checkWriteOrigin(request)) return error("Origin not allowed", 403);
  if (EDITOR_COLLECTIONS.has(path[2]) && (path[1] === "collection" || path[1] === "document") && actor.role !== "edit") return error("Not available to guests", 403);
  if (path[2] === "profiles" && method !== "GET" && (path[1] !== "document" || path[3] !== actor.id)) return error("You can only edit your own profile", 403);
  if (path[2] === "deals" && method !== "GET" && (path[1] === "document" || path[1] === "collection")) return error("Use the deal builder to change deals", 403);
  if (path[2] === "enrollments" && method !== "GET" && (path[1] === "document" || path[1] === "collection")) return error("Use the sequence actions to change enrollments", 403);
  if (path[1] === "sequences" || path[1] === "enrollments") return actor.role === "edit" ? handleSequences(request, env, actor, path) : error("Not available to guests", 403);
  if (path[1] === "deals") return actor.role === "edit" ? handleDeals(request, env, actor, path) : error("Not available to guests", 403);
  if (method !== "GET" && !canWrite(actor, path, method)) return error("Guest action not allowed", 403);
  if (path[2] === "activities" && (path[1] === "document" || path[1] === "collection") && ["POST", "PUT", "PATCH"].includes(method)) {
    const problem = await activityContactProblem(request, env, path, method);
    if (problem) return error(problem, 400);
  }
  if (path.length === 2 && path[1] === "me" && method === "GET") return reply(actor);
  if (path.length === 2 && path[1] === "muninn") return handleMuninn(request, env, actor);
  if (path.length === 2 && path[1] === "usage") return handleUsage(request, env, actor);
  if (path[1] === "admin") return handleAdmin(request, env, actor, path);
  if (path.length === 3 && path[1] === "me") return handleProfile(request, env, actor, path);
  if (path.length === 3 && path[1] === "muninn" && path[2] === "context" && method === "GET") {
    return reply({ context: await muninnContext(env.DB, actor) });
  }
  if (path.length === 2 && path[1] === "presence") {
    if (method === "GET") {
      const { results } = await env.DB.prepare("SELECT p.member_id, p.view_name, p.typing_channel FROM presence p JOIN members m ON m.id = p.member_id WHERE p.seen_at > ? AND m.active = 1 AND m.role = ?").bind(Date.now() - 15000, actor.role).all();
      return reply({ peers: results.map(row => ({ who: row.member_id, view: row.view_name, typing: row.typing_channel, isMe: row.member_id === actor.id })) });
    }
    if (method === "POST") {
      const data = await readJson(request);
      await env.DB.prepare("INSERT INTO presence (member_id, view_name, typing_channel, seen_at) VALUES (?, ?, ?, ?) ON CONFLICT(member_id) DO UPDATE SET view_name = excluded.view_name, typing_channel = excluded.typing_channel, seen_at = excluded.seen_at")
        .bind(actor.id, String(data.view || "").slice(0, 40), String(data.typing || "").slice(0, 100), Date.now()).run();
      return reply({ ok: true });
    }
    return error("Method not allowed", 405);
  }
  if (path.length === 3 && path[1] === "collection") {
    const collection = path[2];
    if (!COLLECTIONS.has(collection)) return error("Unknown collection", 404);
    if (collection === "reads") return error("Use a member document", 400);
    if (method === "GET") {
      const limit = Math.min(2000, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 2000));
      const order = collection === "messages" || collection === "activity" ? "ORDER BY json_extract(data_json, '$.ts') DESC" : "ORDER BY updated_at DESC";
      const { results } = await env.DB.prepare(`SELECT id, data_json FROM documents WHERE collection = ? ${order} LIMIT ?`).bind(storageCollection(actor, collection), limit).all();
      return reply({ docs: results.map(row => ({ id: row.id, data: JSON.parse(row.data_json) })) });
    }
    if (method === "POST") {
      const data = validateDocument(collection, crypto.randomUUID(), await readJson(request), actor, "POST");
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO documents (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?)").bind(storageCollection(actor, collection), id, JSON.stringify(data), Date.now()).run();
      return reply({ id }, 201);
    }
    return error("Method not allowed", 405);
  }
  if (path.length === 4 && path[1] === "document") {
    const [, , collection, id] = path;
    if (!COLLECTIONS.has(collection) || !ID_PATTERN.test(id)) return error("Unknown document", 404);
    if (collection === "reads" && id !== actor.id) return error("Forbidden", 403);
    if (method === "GET") {
      if (collection === "settings" && id === "team") return reply({ exists: true, data: { members: await teamMembers(env.DB) } });
      const data = await getDocument(env.DB, storageCollection(actor, collection), id);
      return reply({ exists: data !== null, data });
    }
    if (collection === "settings") return error("Forbidden", 403);
    const stored = storageCollection(actor, collection);
    if (method === "DELETE") {
      if (collection === "messages" || actor.role === "guest" && collection === "channels") {
        const current = await getDocument(env.DB, stored, id);
        if (current && current.by !== actor.id) return error("Forbidden", 403);
      }
      await env.DB.prepare("DELETE FROM documents WHERE collection = ? AND id = ?").bind(stored, id).run();
      return reply({ ok: true });
    }
    const data = validateDocument(collection, id, await readJson(request), actor, method);
    if (method === "PUT") {
      if (actor.role === "guest" && collection === "channels") {
        const result = await env.DB.prepare("INSERT OR IGNORE INTO documents (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?)")
          .bind(stored, id, JSON.stringify(data), Date.now()).run();
        return result.meta.changes ? reply({ id }) : error("Use update for existing chat", 403);
      }
      await env.DB.prepare("INSERT INTO documents (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data_json = excluded.data_json, revision = revision + 1, updated_at = excluded.updated_at")
        .bind(stored, id, JSON.stringify(data), Date.now()).run();
      return reply({ id });
    }
    if (method === "PATCH") {
      if (actor.role === "guest" && collection === "opps" && Object.hasOwn(data, "locations")) {
        const current = await getDocument(env.DB, stored, id);
        if (!current) return error("Document not found", 404);
        const before = current.locations || [];
        if (!Array.isArray(data.locations) || data.locations.length !== before.length ||
          data.locations.some((location, index) => location?.id !== before[index]?.id)) return error("Guests cannot add or remove locations", 403);
      }
      if (actor.role === "guest" && collection === "channels") {
        const current = await getDocument(env.DB, stored, id);
        if (!current || current.by !== actor.id) return error("Forbidden", 403);
      }
      const result = await env.DB.prepare("UPDATE documents SET data_json = json_patch(data_json, ?), revision = revision + 1, updated_at = ? WHERE collection = ? AND id = ?")
        .bind(JSON.stringify(data), Date.now(), stored, id).run();
      return result.meta.changes ? reply({ id }) : error("Document not found", 404);
    }
  }
  return error("Not found", 404);
}

export default {
  async fetch(request, env) {
    const pathName = new URL(request.url).pathname;
    if (pathName.startsWith("/invite/")) return handleInvite(request, env, pathName.slice(8));
    if (pathName.startsWith("/cal/") && request.method === "GET") return calendarFeed(env, pathName.slice(5));
    const actor = await verifyAccess(request, env) || await memberForSession(request, env);
    if (!actor) return request.method === "GET" && pathName === "/" ? signInPage() : error("Sign in with the approved TideLine account", 403);
    const path = parsePath(new URL(request.url).pathname);
    if (!path) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set("cache-control", "private, no-store");
      headers.set("x-content-type-options", "nosniff");
      return new Response(asset.body, { status: asset.status, headers });
    }
    try {
      const change = request.method !== "GET" && (path[1] === "collection" || path[1] === "document") && path[2] !== "reads" && path[2] !== "activity";
      const label = change ? await auditLabel(request, env, actor, path) : null;
      const watched = change && (path[2] === "activities" || path[2] === "opps") && path[3];
      const before = watched ? await getDocument(env.DB, path[2], path[3]).catch(() => null) : null;
      const response = await handleApi(request, env, actor, path);
      if (change && response.ok) {
        const id = path[3] || (await response.clone().json().catch(() => ({}))).id || null;
        if (path[2] === "activities" || path[2] === "opps") await sequenceHooks(env, actor, request.method, path[2], id, before);
        await audit(env, actor.id, { POST: "Created", PUT: "Saved", PATCH: "Updated", DELETE: "Deleted" }[request.method], path[2], id, label);
      }
      return response;
    }
    catch (cause) {
      if (cause instanceof Error && /^(Missing JSON|JSON body|Invalid JSON|Expected|Unknown document|Invalid message|Only reactions|Only chat|Messages cannot|Wrong member|Team settings|Invalid vendor|Invalid profile|Invalid residual|Invalid sequence|Invalid contact)/.test(cause.message)) return error(cause.message, 400);
      return error("Request failed", 500);
    }
  },
};
