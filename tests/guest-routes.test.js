import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import worker, { deviceFrom } from "../src/worker.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of ["0001_initial.sql", "0002_invite_sessions.sql"]) sqlite.exec(fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  const db = {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: result.changes } }; },
      };
    },
  };
  const token = id => id.repeat(64);
  const addSession = id => sqlite.prepare("INSERT INTO sessions (token_hash, member_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(createHash("sha256").update(token(id)).digest("hex"), id === "a" ? "QS" : id === "b" ? "MJ" : "JK", Date.now() + 86400000, Date.now());
  addSession("a");
  sqlite.exec(fs.readFileSync(new URL("../migrations/0003_open_member_ids.sql", import.meta.url), "utf8"));
  sqlite.prepare("INSERT INTO members (id,name,email,role) VALUES (?,?,?,?)").run("MJ", "Mary", "mary@example.com", "guest");
  sqlite.prepare("INSERT INTO members (id,name,email,role) VALUES (?,?,?,?)").run("JK", "Jack", "jack@example.com", "guest");
  addSession("b"); addSession("c");
  sqlite.prepare("UPDATE sessions SET member_id = ? WHERE token_hash = ?").run("MJ", createHash("sha256").update(token("b")).digest("hex"));
  sqlite.prepare("UPDATE sessions SET member_id = ? WHERE token_hash = ?").run("JK", createHash("sha256").update(token("c")).digest("hex"));
  const seed = (collection, id, data) => sqlite.prepare("INSERT INTO documents (collection,id,data_json,updated_at) VALUES (?,?,?,?)")
    .run(collection, id, JSON.stringify(data), Date.now());
  const call = async (who, method, path, data) => worker.fetch(new Request(`https://voyage.example${path}`, {
    method,
    headers: { cookie: `voyage_session=${token(who)}`, ...(method !== "GET" ? { origin: "https://voyage.example" } : {}), ...(data ? { "content-type": "application/json" } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  }), { DB: db });
  return { sqlite, call, seed };
}

test("guest sees the full CRM and Muninn context but only the guest chat", async () => {
  const { call, seed } = fixture();
  seed("opps", "account", { name: "Gym", stage: 1 });
  seed("notes", "note", { text: "Meeting details" });
  seed("messages", "private", { ch: "general", text: "Editor secret", by: "QS", ts: 1 });
  seed("guest_messages", "guest", { ch: "general", text: "Guest hello", by: "MJ", ts: 2 });
  assert.equal((await (await call("b", "GET", "/api/me")).json()).role, "guest");
  assert.equal((await (await call("b", "GET", "/api/collection/opps")).json()).docs[0].data.name, "Gym");
  assert.equal((await (await call("b", "GET", "/api/collection/notes")).json()).docs[0].data.text, "Meeting details");
  const guestMessages = (await (await call("b", "GET", "/api/collection/messages")).json()).docs;
  assert.deepEqual(guestMessages.map(message => message.data.text), ["Guest hello"]);
  assert.equal((await (await call("a", "GET", "/api/collection/messages")).json()).docs[0].data.text, "Editor secret");
  assert.equal((await (await call("b", "GET", "/api/document/messages/private")).json()).exists, false);
  const context = (await (await call("b", "GET", "/api/muninn/context")).json()).context;
  assert.match(context, /Gym|Meeting details|Guest hello/);
  assert.doesNotMatch(context, /Editor secret/);
});

test("guest changes existing CRM records but cannot create, delete, or change location membership", async () => {
  const { call, seed, sqlite } = fixture();
  seed("opps", "account", { name: "Gym", stage: 1, locations: [{ id: "loc1", city: "Austin" }] });
  seed("activities", "task", { kind: "task", done: false });
  assert.equal((await call("b", "PATCH", "/api/document/opps/account", { stage: 2 })).status, 200);
  assert.equal((await call("b", "PATCH", "/api/document/activities/task", { done: true })).status, 200);
  assert.equal((await call("b", "PATCH", "/api/document/opps/account", { locations: [{ id: "loc1", city: "Dallas" }] })).status, 200);
  assert.equal((await call("b", "PATCH", "/api/document/opps/account", { locations: [] })).status, 403);
  assert.equal((await call("b", "PATCH", "/api/document/opps/account", { locations: [{ id: "loc2" }] })).status, 403);
  assert.equal((await call("b", "POST", "/api/collection/opps", { name: "New" })).status, 403);
  assert.equal((await call("b", "PUT", "/api/document/notes/new", { text: "New" })).status, 403);
  assert.equal((await call("b", "DELETE", "/api/document/activities/task")).status, 403);
  assert.equal(JSON.parse(sqlite.prepare("SELECT data_json FROM documents WHERE collection='opps' AND id='account'").get().data_json).stage, 2);
  assert.equal(JSON.parse(sqlite.prepare("SELECT data_json FROM documents WHERE collection='activities' AND id='task'").get().data_json).done, true);
});

test("guest chat ownership, presence grouping, and revoked access", async () => {
  const { call, seed, sqlite } = fixture();
  seed("guest_messages", "mary-msg", { ch: "general", text: "Mary", by: "MJ", ts: 1 });
  seed("guest_messages", "jack-msg", { ch: "general", text: "Jack", by: "JK", ts: 2 });
  assert.equal((await call("b", "DELETE", "/api/document/messages/jack-msg")).status, 403);
  assert.equal((await call("b", "DELETE", "/api/document/messages/mary-msg")).status, 200);
  assert.equal((await call("b", "PUT", "/api/document/channels/new-chat", { name: "Guest chat", by: "JK" })).status, 200);
  const created = await call("b", "POST", "/api/collection/channels", { name: "Another guest chat", by: "JK" });
  assert.equal(created.status, 201);
  assert.equal((await (await call("c", "GET", `/api/document/channels/${(await created.json()).id}`)).json()).data.by, "MJ");
  assert.equal((await call("c", "PATCH", "/api/document/channels/new-chat", { name: "Hijack" })).status, 403);
  assert.equal((await call("b", "PATCH", "/api/document/channels/new-chat", { by: "JK" })).status, 400);
  assert.equal((await (await call("b", "GET", "/api/document/channels/new-chat")).json()).data.by, "MJ");
  assert.equal((await call("b", "DELETE", "/api/document/channels/new-chat")).status, 403);
  await call("a", "POST", "/api/presence", { view: "team", typing: "general" });
  await call("b", "POST", "/api/presence", { view: "team", typing: "general" });
  const peers = (await (await call("b", "GET", "/api/presence")).json()).peers;
  assert.deepEqual(peers.map(peer => peer.who), ["MJ"]);
  sqlite.prepare("UPDATE members SET active = 0 WHERE id = 'MJ'").run();
  assert.equal((await call("b", "GET", "/api/me")).status, 403);
});

test("vendors are editor-only: editors manage them, guests cannot see or change them", async () => {
  const { call, seed } = fixture();
  seed("vendors", "photo", { name: "Jordan Lee", kind: "Photographer", email: "jordan@example.com" });
  const created = await call("a", "POST", "/api/collection/vendors", { name: "Print Shop", kind: "Printer" });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await call("a", "PATCH", `/api/document/vendors/${id}`, { phone: "555-0100" })).status, 200);
  const names = (await (await call("a", "GET", "/api/collection/vendors")).json()).docs.map(doc => doc.data.name).sort();
  assert.deepEqual(names, ["Jordan Lee", "Print Shop"]);
  assert.equal((await call("a", "POST", "/api/collection/vendors", { name: " " })).status, 400);
  assert.equal((await call("a", "PATCH", `/api/document/vendors/${id}`, { name: "" })).status, 400);
  assert.match((await (await call("a", "GET", "/api/muninn/context")).json()).context, /Jordan Lee/);
  assert.equal((await call("b", "GET", "/api/collection/vendors")).status, 403);
  assert.equal((await call("b", "GET", "/api/document/vendors/photo")).status, 403);
  assert.equal((await call("b", "PATCH", "/api/document/vendors/photo", { name: "Changed" })).status, 403);
  assert.equal((await call("b", "POST", "/api/collection/vendors", { name: "New" })).status, 403);
  assert.equal((await call("b", "DELETE", "/api/document/vendors/photo")).status, 403);
  assert.doesNotMatch((await (await call("b", "GET", "/api/muninn/context")).json()).context, /Jordan Lee/);
  assert.equal((await call("a", "DELETE", `/api/document/vendors/${id}`)).status, 200);
});

test("usage: everyone reports their own events, only editors read them", async () => {
  const { call, sqlite } = fixture();
  const before = await call("b", "POST", "/api/usage", { events: [{ kind: "view", view: "accounts" }] });
  assert.equal(before.status, 202);
  assert.equal((await call("a", "GET", "/api/usage")).status, 503);
  sqlite.exec(fs.readFileSync(new URL("../migrations/0004_usage_events.sql", import.meta.url), "utf8"));
  const saved = await call("b", "POST", "/api/usage", { events: [
    { kind: "open", view: "dash" },
    { kind: "view", view: "accounts", ts: 1 },
    { kind: "action", view: "accounts", action: "Saved".repeat(40) },
    { kind: "nonsense", view: "accounts" },
    { kind: "view" },
  ] });
  assert.equal((await saved.json()).saved, 3);
  assert.equal((await call("b", "GET", "/api/usage")).status, 403);
  const { events, members } = await (await call("a", "GET", "/api/usage?days=7")).json();
  assert.equal(events.length, 3);
  assert.ok(events.every(event => event.who === "MJ"));
  assert.ok(events.every(event => event.ts > Date.now() - 60000), "client timestamps outside the last day are replaced");
  assert.equal(events.find(event => event.kind === "action").action.length, 80);
  assert.ok(members.some(member => member.id === "MJ" && !("email" in member)));
  sqlite.prepare("INSERT INTO usage_events (member_id, ts, kind, view) VALUES ('QS', ?, 'view', 'dash')").run(Date.now() - 200 * 86400000);
  await call("a", "GET", "/api/usage?days=180");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE member_id = 'QS'").get().n, 0);
});

test("usage device labels", () => {
  assert.equal(deviceFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), "Phone, Safari");
  assert.equal(deviceFrom("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0"), "Computer, Edge");
  assert.equal(deviceFrom(""), "Computer, Other browser");
});

test("admin: editors see access, invitations, and storage without secrets; guests are refused", async () => {
  const { call, seed, sqlite } = fixture();
  seed("opps", "account", { name: "Gym", stage: 1 });
  sqlite.prepare("INSERT INTO invites (token_hash, member_id, email, expires_at) VALUES ('secret-hash', 'JK', 'jack@example.com', ?)").run(Date.now() + 86400000);
  assert.equal((await call("b", "GET", "/api/admin")).status, 403);
  assert.equal((await call("b", "POST", "/api/admin/signout", { member: "QS" })).status, 403);
  const response = await call("a", "GET", "/api/admin");
  assert.equal(response.status, 200);
  const text = await response.clone().text();
  assert.doesNotMatch(text, /secret-hash|token_hash/);
  const data = await response.json();
  assert.ok(data.members.some(member => member.id === "MJ" && member.role === "guest"));
  assert.ok(data.sessions.some(session => session.member_id === "QS" && session.current === 1));
  assert.equal(data.invites.find(invite => invite.member_id === "JK").email, "jack@example.com");
  assert.equal(data.storage.find(row => row.collection === "opps").records, 1);
  assert.equal(data.usageEvents, null);
  const out = await call("a", "POST", "/api/admin/signout", { member: "MJ" });
  assert.equal((await out.json()).signedOut, 1);
  assert.equal((await call("b", "GET", "/api/me")).status, 403);
});

test("profile: every member sees their own account and devices and can sign out", async () => {
  const { call, sqlite } = fixture();
  const profile = await (await call("b", "GET", "/api/me/profile")).json();
  assert.equal(profile.id, "MJ");
  assert.equal(profile.email, "mary@example.com");
  assert.equal(profile.devices.length, 1);
  assert.equal(profile.devices[0].current, 1);
  assert.doesNotMatch(JSON.stringify(profile), /token_hash/);
  sqlite.prepare("INSERT INTO sessions (token_hash, member_id, expires_at, created_at) VALUES ('other-device', 'MJ', ?, ?)").run(Date.now() + 86400000, Date.now());
  assert.equal((await call("b", "POST", "/api/me/signout", { scope: "bogus" })).status, 400);
  assert.equal((await (await call("b", "POST", "/api/me/signout", { scope: "others" })).json()).signedOut, 1);
  assert.equal((await call("b", "GET", "/api/me")).status, 200);
  assert.equal((await (await call("b", "POST", "/api/me/signout", { scope: "this" })).json()).signedOut, 1);
  assert.equal((await call("b", "GET", "/api/me")).status, 403);
  assert.equal((await call("a", "GET", "/api/me")).status, 200, "other members stay signed in");
});

test("profiles: anyone can read the directory, but each member edits only their own", async () => {
  const { call } = fixture();
  assert.equal((await call("b", "PUT", "/api/document/profiles/MJ", { title: "Sales", phone: "555-0100", bio: "Hi" })).status, 200);
  assert.equal((await call("a", "PUT", "/api/document/profiles/QS", { title: "Founder", timezone: "America/Chicago" })).status, 200);
  const docs = (await (await call("b", "GET", "/api/collection/profiles")).json()).docs;
  assert.deepEqual(docs.map(doc => doc.id).sort(), ["MJ", "QS"]);
  assert.ok(docs.find(doc => doc.id === "MJ").data.updatedTs > 0);
  assert.equal((await call("a", "PUT", "/api/document/profiles/MJ", { title: "Changed by someone else" })).status, 403);
  assert.equal((await call("a", "DELETE", "/api/document/profiles/MJ")).status, 403);
  assert.equal((await call("b", "PATCH", "/api/document/profiles/QS", { title: "Nope" })).status, 403);
  assert.equal((await call("a", "POST", "/api/collection/profiles", { title: "Random id" })).status, 403);
  assert.equal((await call("b", "PATCH", "/api/document/profiles/MJ", { role: "edit" })).status, 400);
  assert.equal((await call("b", "PATCH", "/api/document/profiles/MJ", { bio: "x".repeat(1501) })).status, 400);
  assert.equal((await call("b", "PATCH", "/api/document/profiles/MJ", { hours: "9–5" })).status, 200);
});
