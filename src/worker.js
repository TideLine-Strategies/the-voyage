import { createRemoteJWKSet, jwtVerify } from "jose";

const MEMBERS = new Map([
  ["c.knudsen@tidelinestrats.com", { id: "CK", name: "Cody" }],
  ["q.stewart@tidelinestrats.com", { id: "QS", name: "Quan" }],
]);
const COLLECTIONS = new Set(["opps", "activities", "activity", "notes", "channels", "messages", "settings", "reads", "assistant_threads"]);
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
  return row ? [...MEMBERS.values()].find(member => member.id === row.member_id) || null : null;
}

function invitePage(token, valid) {
  const body = valid
    ? `<form method="post" action="/invite/${token}"><button type="submit">Open The Voyage</button></form>`
    : "<p>This invitation has expired or was already used. Ask Quan for a new link.</p>";
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Voyage invitation</title><style>body{font:16px system-ui;background:#071726;color:#f1f6fa;min-height:100vh;display:grid;place-content:center;text-align:center;padding:24px}button{background:#42b6d4;color:#071726;border:0;border-radius:8px;padding:14px 22px;font:inherit;font-weight:700;cursor:pointer}</style><h1>The Voyage</h1>${body}</html>`, {
    status: valid ? 200 : 410,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" },
  });
}

async function handleInvite(request, env, token) {
  if (!INVITE_PATTERN.test(token)) return invitePage("", false);
  const hash = await tokenHash(token);
  const invite = await env.DB.prepare("SELECT member_id, email FROM invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(hash, Date.now()).first();
  const member = invite && memberForEmail(invite.email);
  if (!member || member.id !== invite.member_id) return invitePage("", false);
  if (request.method === "GET") return invitePage(token, true);
  if (request.method !== "POST" || !checkWriteOrigin(request)) return error("Forbidden", 403);
  const now = Date.now();
  const result = await env.DB.prepare("UPDATE invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(now, hash, now).run();
  if (!result.meta.changes) return invitePage("", false);
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

export function memberForEmail(email) {
  return MEMBERS.get(String(email || "").toLowerCase()) || null;
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function error(message, status) {
  return reply({ error: message }, status);
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
  if ((collection === "reads" || collection === "assistant_threads") && id !== actor.id) throw new Error("Wrong member");
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
  if (collection === "activity" && method !== "PATCH") data.by = actor.id;
  if (collection === "notes" && method !== "PATCH") data.by = actor.id;
  return data;
}

async function verifyAccess(request, env) {
  if (!env.POLICY_AUD || env.POLICY_AUD.startsWith("CONFIGURE_") || !env.TEAM_DOMAIN) return null;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  try {
    const keys = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, keys, { issuer: env.TEAM_DOMAIN, audience: env.POLICY_AUD });
    return memberForEmail(payload.email);
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

async function handleApi(request, env, actor, path) {
  const method = request.method;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return error("Method not allowed", 405);
  if (method !== "GET" && !checkWriteOrigin(request)) return error("Origin not allowed", 403);
  if (path.length === 2 && path[1] === "me" && method === "GET") return reply(actor);
  if (path.length === 2 && path[1] === "presence") {
    if (method === "GET") {
      const { results } = await env.DB.prepare("SELECT member_id, view_name, typing_channel FROM presence WHERE seen_at > ?").bind(Date.now() - 15000).all();
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
    if (collection === "reads" || collection === "assistant_threads") return error("Use a member document", 400);
    if (method === "GET") {
      const limit = Math.min(2000, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 2000));
      const order = collection === "messages" || collection === "activity" ? "ORDER BY json_extract(data_json, '$.ts') DESC" : "ORDER BY updated_at DESC";
      const { results } = await env.DB.prepare(`SELECT id, data_json FROM documents WHERE collection = ? ${order} LIMIT ?`).bind(collection, limit).all();
      return reply({ docs: results.map(row => ({ id: row.id, data: JSON.parse(row.data_json) })) });
    }
    if (method === "POST") {
      const data = validateDocument(collection, crypto.randomUUID(), await readJson(request), actor, "POST");
      const id = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO documents (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?)").bind(collection, id, JSON.stringify(data), Date.now()).run();
      return reply({ id }, 201);
    }
    return error("Method not allowed", 405);
  }
  if (path.length === 4 && path[1] === "document") {
    const [, , collection, id] = path;
    if (!COLLECTIONS.has(collection) || !ID_PATTERN.test(id)) return error("Unknown document", 404);
    if ((collection === "reads" || collection === "assistant_threads") && id !== actor.id) return error("Forbidden", 403);
    if (method === "GET") {
      const data = await getDocument(env.DB, collection, id);
      return reply({ exists: data !== null, data });
    }
    if (collection === "settings") return error("Forbidden", 403);
    if (method === "DELETE") {
      if (collection === "messages") {
        const current = await getDocument(env.DB, collection, id);
        if (current && current.by !== actor.id) return error("Forbidden", 403);
      }
      await env.DB.prepare("DELETE FROM documents WHERE collection = ? AND id = ?").bind(collection, id).run();
      return reply({ ok: true });
    }
    const data = validateDocument(collection, id, await readJson(request), actor, method);
    if (method === "PUT") {
      await env.DB.prepare("INSERT INTO documents (collection, id, data_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data_json = excluded.data_json, revision = revision + 1, updated_at = excluded.updated_at")
        .bind(collection, id, JSON.stringify(data), Date.now()).run();
      return reply({ id });
    }
    if (method === "PATCH") {
      const result = await env.DB.prepare("UPDATE documents SET data_json = json_patch(data_json, ?), revision = revision + 1, updated_at = ? WHERE collection = ? AND id = ?")
        .bind(JSON.stringify(data), Date.now(), collection, id).run();
      return result.meta.changes ? reply({ id }) : error("Document not found", 404);
    }
  }
  return error("Not found", 404);
}

export default {
  async fetch(request, env) {
    const pathName = new URL(request.url).pathname;
    if (pathName.startsWith("/invite/")) return handleInvite(request, env, pathName.slice(8));
    const actor = await verifyAccess(request, env) || await memberForSession(request, env);
    if (!actor) return error("Sign in with the approved TideLine account", 403);
    const path = parsePath(new URL(request.url).pathname);
    if (!path) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set("cache-control", "private, no-store");
      headers.set("x-content-type-options", "nosniff");
      return new Response(asset.body, { status: asset.status, headers });
    }
    try { return await handleApi(request, env, actor, path); }
    catch (cause) {
      if (cause instanceof Error && /^(Missing JSON|JSON body|Invalid JSON|Expected|Unknown document|Invalid message|Only reactions|Messages cannot|Wrong member|Team settings)/.test(cause.message)) return error(cause.message, 400);
      return error("Request failed", 500);
    }
  },
};
