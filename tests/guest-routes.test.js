import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import worker, { deviceFrom, parseTime } from "../src/worker.js";

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
  seed("contacts", "c1", { oppId: "account", name: "Pat Owner", role: "Owner" });
  seed("activities", "task", { kind: "task", done: false, contactId: "c1" });
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

const migrate = (sqlite, name) => sqlite.exec(fs.readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));

test("audit log: the server records changes with labels, never chat text; only editors read it", async () => {
  const { call, seed, sqlite } = fixture();
  assert.equal((await call("a", "POST", "/api/collection/opps", { name: "Before migration" })).status, 201, "changes work before the audit table exists");
  migrate(sqlite, "0005_audit_calendar.sql");
  seed("opps", "gym", { name: "Sample Gym", stage: 1 });
  const created = await (await call("a", "POST", "/api/collection/opps", { name: "New Studio", stage: 0 })).json();
  await call("b", "PATCH", "/api/document/opps/gym", { stage: 2 });
  await call("a", "DELETE", `/api/document/opps/${created.id}`);
  await call("a", "POST", "/api/collection/messages", { ch: "general", text: "secret plans" });
  await call("a", "PUT", "/api/document/reads/QS", { marks: {} });
  await call("b", "POST", "/api/collection/opps", { name: "Guest cannot create" });
  assert.equal((await call("b", "GET", "/api/admin/audit")).status, 403);
  const { entries } = await (await call("a", "GET", "/api/admin/audit?days=7")).json();
  const lines = entries.map(e => `${e.who} ${e.action} ${e.collection} ${e.label}`);
  assert.ok(lines.includes("QS Created opps New Studio"));
  assert.ok(lines.includes("MJ Updated opps Sample Gym"));
  assert.ok(lines.includes("QS Deleted opps New Studio"));
  assert.ok(lines.includes("QS Created messages Chat message"));
  assert.ok(!lines.some(line => /secret plans|reads|Guest cannot create/.test(line)));
  assert.ok(entries.find(e => e.action === "Created" && e.label === "New Studio").doc_id === created.id);
  await call("b", "POST", "/api/me/signout", { scope: "this" });
  const after = (await (await call("a", "GET", "/api/admin/audit")).json()).entries;
  assert.ok(after.some(e => e.who === "MJ" && e.action === "Signed out"));
});

test("calendar link: private feed of a member's own appointments", async () => {
  const { call, seed, sqlite } = fixture();
  assert.equal((await call("a", "POST", "/api/me/calendar")).status, 503, "explains the missing migration");
  migrate(sqlite, "0005_audit_calendar.sql");
  seed("activities", "a1", { kind: "appt", type: "Discovery", oppName: "Sample Gym", date: "2026-10-20", time: "2pm", owner: "QS" });
  seed("activities", "a2", { kind: "appt", type: "Demo", oppName: "Shared Studio", date: "2026-10-21", time: "", owner: "CK", shared: ["QS"] });
  seed("activities", "a3", { kind: "appt", type: "Proposal", oppName: "Not Mine", date: "2026-10-22", time: "10:00", owner: "CK" });
  seed("activities", "a4", { kind: "task", type: "Cold call", oppName: "Task Only", date: "2026-10-20", owner: "QS" });
  assert.equal((await (await call("a", "GET", "/api/me/calendar")).json()).enabled, false);
  const { url } = await (await call("a", "POST", "/api/me/calendar")).json();
  const path = new URL(url).pathname;
  const feed = await worker.fetch(new Request(`https://voyage.example${path}`), { DB: { prepare: sql => fixtureDb(sqlite, sql) } });
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get("content-type"), /text\/calendar/);
  const ics = await feed.text();
  assert.match(ics, /SUMMARY:Discovery with Sample Gym/);
  assert.match(ics, /DTSTART:20261020T140000/);
  assert.match(ics, /SUMMARY:Demo with Shared Studio[\s\S]*?|DTSTART;VALUE=DATE:20261021/);
  assert.match(ics, /SUMMARY:Demo with Shared Studio/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261021/);
  assert.doesNotMatch(ics, /Not Mine|Task Only/);
  assert.doesNotMatch(JSON.stringify(sqlite.prepare("SELECT * FROM calendar_feeds").all()), new RegExp(path.slice(5, 69)));
  const second = (await (await call("a", "POST", "/api/me/calendar")).json()).url;
  assert.notEqual(second, url);
  assert.equal((await worker.fetch(new Request(`https://voyage.example${path}`), { DB: { prepare: sql => fixtureDb(sqlite, sql) } })).status, 404, "old link stops working");
  await call("a", "DELETE", "/api/me/calendar");
  assert.equal((await worker.fetch(new Request(`https://voyage.example${new URL(second).pathname}`), { DB: { prepare: sql => fixtureDb(sqlite, sql) } })).status, 404);
  assert.equal((await worker.fetch(new Request("https://voyage.example/cal/not-a-token.ics"), { DB: { prepare: sql => fixtureDb(sqlite, sql) } })).status, 404);
});

function fixtureDb(sqlite, sql) {
  let args = [];
  return {
    bind(...values) { args = values; return this; },
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: result.changes } }; },
  };
}

test("appointment times", () => {
  assert.deepEqual(parseTime("10:30"), [10, 30]);
  assert.deepEqual(parseTime("2pm"), [14, 0]);
  assert.deepEqual(parseTime("2:15 PM"), [14, 15]);
  assert.deepEqual(parseTime("3"), [15, 0], "bare afternoon hours");
  assert.deepEqual(parseTime("12am"), [0, 0]);
  assert.equal(parseTime("tomorrow"), null);
  assert.equal(parseTime(""), null);
});

test("outside calendar: a member connects their own, sees only their events, and the address stays private", async () => {
  const { call, sqlite } = fixture();
  migrate(sqlite, "0005_audit_calendar.sql");
  const secret = "https://calendar.google.com/calendar/ical/mary%40example.com/private-abc123/basic.ics";
  assert.equal((await call("b", "PUT", "/api/me/external-calendar", { url: "https://evil.example/cal.ics" })).status, 400);
  const put = await (await call("b", "PUT", "/api/me/external-calendar", { url: secret.replace("https://", "webcal://") })).json();
  assert.equal(put.provider, "Google Calendar");
  const originalFetch = globalThis.fetch;
  let fetched;
  globalThis.fetch = async url => { fetched = url; return new Response("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261007T150000Z\r\nDTEND:20261007T160000Z\r\nSUMMARY:Dentist\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"); };
  try {
    const response = await call("b", "GET", `/api/me/external-calendar?from=${Date.UTC(2026, 9, 1)}&to=${Date.UTC(2026, 10, 1)}`);
    const text = await response.text();
    assert.equal(fetched, secret);
    assert.doesNotMatch(text, /private-abc123|calendar\.google\.com/);
    const data = JSON.parse(text);
    assert.deepEqual(data.events.map(e => e.title), ["Dentist"]);
    assert.equal((await (await call("a", "GET", "/api/me/external-calendar")).json()).connected, false, "Quan doesn't see Mary's calendar");
    globalThis.fetch = async () => new Response("nope", { status: 404 });
    const broken = await (await call("b", "GET", "/api/me/external-calendar")).json();
    assert.equal(broken.connected, true);
    assert.match(broken.error, /Couldn't read/);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal((await (await call("b", "DELETE", "/api/me/external-calendar")).json()).connected, false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM external_calendars").get().n, 0);
});

test("deal workflow: draft, guardrails, review by the other editor, close package, won, reopen", async () => {
  const { call, seed, sqlite } = fixture();
  sqlite.prepare("INSERT INTO members (id,name,email,role) VALUES ('CK','Cody','c@example.com','edit') ON CONFLICT(id) DO NOTHING").run();
  sqlite.prepare("INSERT INTO sessions (token_hash, member_id, expires_at, created_at) VALUES (?, 'CK', ?, ?)").run(createHash("sha256").update("d".repeat(64)).digest("hex"), Date.now() + 86400000, Date.now());
  seed("opps", "gym", { name: "Sample Gym", stage: 5 });
  const draft = { name: "Sample Gym annual", oppId: "gym", expectedClose: "2026-10-30",
    lines: [{ name: "Platform", billing: "monthly", qty: 1, price: 100, listPrice: 100, discount: 25 }], terms: { months: 12 } };
  assert.equal((await call("b", "POST", "/api/deals", draft)).status, 403, "guests can't build deals");
  assert.equal((await call("b", "GET", "/api/collection/deals")).status, 403, "or see them");
  const created = await (await call("a", "POST", "/api/deals", { ...draft, status: "won", totals: { tcv: 1 } })).json();
  assert.equal(created.status, "draft");
  assert.equal(created.totals.mrr, 75);
  assert.equal(created.flags.length, 2);
  assert.equal((await call("a", "PATCH", `/api/document/deals/${created.id}`, { status: "won" })).status, 403, "no shortcuts around the workflow");
  assert.equal((await call("a", "POST", `/api/deals/${created.id}/won`)).status, 409);
  const submitted = await (await call("a", "POST", `/api/deals/${created.id}/submit`)).json();
  assert.equal(submitted.status, "pending");
  assert.equal((await call("a", "PUT", `/api/deals/${created.id}`, draft)).status, 409, "locked while waiting for approval");
  assert.equal((await call("a", "POST", `/api/deals/${created.id}/approve`)).status, 403, "can't approve your own deal");
  assert.equal((await call("d", "POST", `/api/deals/${created.id}/changes`, {})).status, 400, "needs a note");
  assert.equal((await (await call("d", "POST", `/api/deals/${created.id}/changes`, { note: "Max 15% please" })).json()).status, "changes");
  const fixed = await (await call("a", "PUT", `/api/deals/${created.id}`, { ...draft, lines: [{ ...draft.lines[0], discount: 10 }] })).json();
  assert.deepEqual(fixed.flags, []);
  assert.equal((await (await call("a", "POST", `/api/deals/${created.id}/submit`)).json()).status, "approved", "within guardrails is auto-approved");
  const incomplete = await call("a", "POST", `/api/deals/${created.id}/won`, { close: { agreementSigned: true } });
  assert.equal(incomplete.status, 400);
  assert.ok((await incomplete.json()).problems.length >= 4);
  const closeBody = { terms: { startDate: "2026-11-01" }, close: { agreementSigned: true, signedDate: "2026-10-28", signerName: "Pat", signerEmail: "pat@gym.example", billingEmail: "ap@gym.example" } };
  const noDoc = await call("a", "POST", `/api/deals/${created.id}/won`, closeBody);
  assert.deepEqual((await noDoc.json()).problems, ["Attach the signed agreement"], "can't close without the signed document");
  migrate(sqlite, "0006_deal_files.sql");
  const upload = await worker.fetch(new Request(`https://voyage.example/api/deals/${created.id}/files?name=signed.pdf&kind=signed`, { method: "POST", headers: { cookie: `voyage_session=${"a".repeat(64)}`, origin: "https://voyage.example" }, body: new TextEncoder().encode("%PDF-1.7 signed") }), { DB: { prepare: sql => fixtureDb(sqlite, sql) } });
  assert.equal(upload.status, 201);
  const won = await (await call("a", "POST", `/api/deals/${created.id}/won`, closeBody)).json();
  assert.equal(won.status, "won");
  assert.deepEqual(won.history.map(h => h.action), ["Created", "Submitted for approval", "Changes requested", "Submitted (within guardrails, auto-approved)", "Closed won"]);
  const opp = JSON.parse(sqlite.prepare("SELECT data_json FROM documents WHERE collection='opps' AND id='gym'").get().data_json);
  assert.equal(opp.closed, "won");
  assert.equal(opp.wonDealId, created.id);
  assert.equal((await call("a", "DELETE", `/api/deals/${created.id}`)).status, 409, "won deals can't be deleted");
  assert.equal((await (await call("a", "POST", `/api/deals/${created.id}/reopen`, { note: "Customer changed seats" })).json()).status, "draft");
  assert.equal(JSON.parse(sqlite.prepare("SELECT data_json FROM documents WHERE collection='opps' AND id='gym'").get().data_json).closed, undefined);
  assert.equal((await call("a", "POST", `/api/deals/${created.id}/lost`, {})).status, 400, "lost needs a reason");
  assert.equal((await (await call("a", "POST", `/api/deals/${created.id}/lost`, { note: "Went with a competitor" })).json()).status, "lost");
});

test("residuals and processing settings are editor-only and validated", async () => {
  const { call } = fixture();
  const month = { month: "2026-09", oppId: "gym", volume: 1000, txns: 10, residual: 12.5, by: "MJ" };
  assert.equal((await call("b", "PUT", "/api/document/residuals/gym-2026-09", month)).status, 403);
  assert.equal((await call("b", "GET", "/api/collection/residuals")).status, 403);
  assert.equal((await call("a", "PUT", "/api/document/residuals/gym-2026-09", { ...month, month: "2026-13" })).status, 400);
  assert.equal((await call("a", "PUT", "/api/document/residuals/gym-2026-09", { ...month, residual: -1 })).status, 400);
  assert.equal((await call("a", "PUT", "/api/document/residuals/gym-2026-09", month)).status, 200);
  const saved = (await (await call("a", "GET", "/api/document/residuals/gym-2026-09")).json()).data;
  assert.deepEqual([saved.residual, saved.by, saved.source], [12.5, "QS", "manual"]);
  assert.equal((await call("a", "PUT", "/api/document/catalog/processing", { sharePct: 20, cardPct: "abc", extra: "dropped" })).status, 200);
  const s = (await (await call("a", "GET", "/api/document/catalog/processing")).json()).data;
  assert.deepEqual([s.sharePct, s.cardPct, s.extra], [20, 0, undefined]);
  assert.equal((await call("b", "GET", "/api/document/catalog/processing")).status, 403);
});

test("deal documents: editors upload, list, download, and remove; types are checked; guests are refused", async () => {
  const { call, sqlite } = fixture();
  migrate(sqlite, "0006_deal_files.sql");
  const dealId = (await (await call("a", "POST", "/api/deals", { name: "Doc test", lines: [] })).json()).id;
  const send = (who, body, query = "name=agreement.pdf&kind=signed") => worker.fetch(new Request(`https://voyage.example/api/deals/${dealId}/files?${query}`, {
    method: "POST", headers: { cookie: `voyage_session=${who.repeat(64)}`, origin: "https://voyage.example" }, body }), { DB: { prepare: sql => fixtureDb(sqlite, sql) } });
  const big = new Uint8Array(1200 * 1024); big.set(new TextEncoder().encode("%PDF-1.7"));
  assert.equal((await send("b", big)).status, 403, "guests can't upload");
  assert.equal((await send("a", new TextEncoder().encode("<html><script>alert(1)</script>"), "name=evil.pdf")).status, 415, "content is checked, not the name");
  const up = await send("a", big);
  assert.equal(up.status, 201);
  const [file] = (await up.json()).files;
  assert.deepEqual([file.name, file.kind, file.size, file.content_type], ["agreement.pdf", "signed", big.length, "application/pdf"]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM deal_file_chunks WHERE file_id = ?").get(file.id).n, 3, "stored in 512 KB chunks");
  const dl = await call("a", "GET", `/api/deals/${dealId}/files/${file.id}`);
  assert.match(dl.headers.get("content-disposition"), /^attachment/);
  assert.deepEqual(new Uint8Array(await dl.arrayBuffer()), big, "downloads byte-for-byte");
  assert.equal((await call("b", "GET", `/api/deals/${dealId}/files/${file.id}`)).status, 403);
  assert.equal((await (await call("a", "DELETE", `/api/deals/${dealId}/files/${file.id}`)).json()).files.length, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM deal_file_chunks").get().n, 0);
});

test("sequences: enroll, advance on done, keep the gap, stop on a booked meeting, and pause on delete", async () => {
  const { call, seed, sqlite } = fixture();
  seed("opps", "gym", { name: "Sample Gym", city: "Elgin", stage: 0, owner: "QS" });
  seed("opps", "dojo", { name: "Dojo", stage: 0, owner: "QS" });
  seed("contacts", "gym-owner", { oppId: "gym", name: "Gina Owner", role: "Owner" });
  seed("contacts", "dojo-owner", { oppId: "dojo", name: "Dan Owner", role: "Owner", primary: true });
  await call("a", "PUT", "/api/document/profiles/QS", { title: "Founder", phone: "555-0100" });
  assert.equal((await call("a", "PUT", "/api/document/sequences/seq", { name: "Outreach", steps: [
    { id: "call", day: 0, type: "Cold call", title: "Call {{account}}", script: "Hi, this is {{my_name}}, {{my_title}}" },
    { id: "mail", day: 2, type: "Email", title: "Email {{account}} in {{city}}" },
    { id: "last", day: 5, type: "Phone call", title: "Last try" }] })).status, 200);
  assert.equal((await call("b", "POST", "/api/sequences/seq/enroll", { oppIds: ["gym"] })).status, 403, "guests can't enroll");
  assert.equal((await call("a", "PATCH", "/api/document/enrollments/x", { status: "completed" })).status, 403, "no shortcuts");
  const res = await (await call("a", "POST", "/api/sequences/seq/enroll", { oppIds: ["gym", "dojo", "missing"], startDate: "2026-10-06" })).json();
  assert.deepEqual(res, { enrolled: 2, skipped: 1 });
  assert.equal((await (await call("a", "POST", "/api/sequences/seq/enroll", { oppIds: ["gym"] })).json()).skipped, 1, "not enrolled twice");
  const all = (await (await call("a", "GET", "/api/collection/enrollments")).json()).docs.map(d => ({ id: d.id, ...d.data }));
  const gym = all.find(e => e.oppId === "gym"), dojo = all.find(e => e.oppId === "dojo");
  const task1 = (await (await call("a", "GET", `/api/document/activities/${gym.taskId}`)).json()).data;
  assert.equal(task1.date, "2026-10-06");
  assert.equal(task1.type, "Cold call");
  assert.match(task1.notes, /Call Sample Gym/);
  assert.match(task1.notes, /Hi, this is Quan, Founder/);
  assert.deepEqual([task1.seq.step, task1.seq.of], [1, 3]);
  assert.equal((await call("b", "PATCH", `/api/document/activities/${gym.taskId}`, { done: true, doneTs: Date.now(), outcome: "voicemail" })).status, 200, "a guest completing the task still advances it");
  const afterDone = (await (await call("a", "GET", `/api/document/enrollments/${gym.id}`)).json()).data;
  assert.equal(afterDone.stepIndex, 1);
  assert.deepEqual(afterDone.completed.map(c => c.outcome), ["voicemail"]);
  const task2 = (await (await call("a", "GET", `/api/document/activities/${afterDone.taskId}`)).json()).data;
  const expected = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  assert.equal(task2.date, expected, "next step keeps the 2-day gap from when it was done");
  assert.match(task2.notes, /Email Sample Gym in Elgin/);
  await call("a", "POST", "/api/collection/activities", { kind: "appt", type: "Discovery", oppId: "gym", date: "2026-10-20", contactId: "gym-owner" });
  const stopped = (await (await call("a", "GET", `/api/document/enrollments/${gym.id}`)).json()).data;
  assert.deepEqual([stopped.status, stopped.stopReason, stopped.success], ["stopped", "Meeting booked", true]);
  assert.equal((await (await call("a", "GET", `/api/document/activities/${afterDone.taskId}`)).json()).exists, false, "its open task is cleared");
  await call("a", "DELETE", `/api/document/activities/${dojo.taskId}`);
  assert.equal((await (await call("a", "GET", `/api/document/enrollments/${dojo.id}`)).json()).data.status, "paused");
  const resumed = await (await call("a", "POST", `/api/enrollments/${dojo.id}/resume`)).json();
  assert.equal(resumed.status, "active");
  assert.ok(resumed.taskId);
  const skipped = await (await call("a", "POST", `/api/enrollments/${dojo.id}/skip`)).json();
  assert.equal(skipped.stepIndex, 1);
  await call("a", "PATCH", "/api/document/opps/dojo", { stage: 1 });
  assert.equal((await (await call("a", "GET", `/api/document/enrollments/${dojo.id}`)).json()).data.stopReason, "Moved to Discovery");
  const starters = await (await call("a", "POST", "/api/sequences/starters")).json();
  assert.equal(starters.created.length, 2);
});

test("contacts: every task and meeting names who it was with, from the same account", async () => {
  const { call, seed } = fixture();
  seed("opps", "gym", { name: "Gym", stage: 0 });
  seed("opps", "other", { name: "Other", stage: 0 });
  seed("activities", "old", { kind: "task", type: "Email", oppId: "gym", done: false });
  assert.equal((await call("a", "POST", "/api/collection/contacts", { oppId: "gym", name: " " })).status, 400, "name required");
  assert.equal((await call("a", "POST", "/api/collection/contacts", { oppId: "gym", name: "Pat", email: "nope" })).status, 400, "email checked");
  const pat = (await (await call("a", "POST", "/api/collection/contacts", { oppId: "gym", name: "Pat Owner", title: "Owner", role: "Owner", email: "pat@gym.example" })).json()).id;
  const otherC = (await (await call("a", "POST", "/api/collection/contacts", { oppId: "other", name: "Olive" })).json()).id;
  assert.equal((await call("b", "POST", "/api/collection/contacts", { oppId: "gym", name: "Guest add" })).status, 403, "guests can't create contacts");
  assert.equal((await call("b", "PATCH", `/api/document/contacts/${pat}`, { phone: "555-0100" })).status, 200, "guests can update existing contacts");
  const task = { kind: "task", type: "Cold call", oppId: "gym", date: "2026-10-07" };
  assert.match(await (await call("a", "POST", "/api/collection/activities", task)).text(), /Pick who this was with/);
  assert.match(await (await call("a", "POST", "/api/collection/activities", { ...task, contactId: otherC })).text(), /different account/);
  assert.match(await (await call("a", "POST", "/api/collection/activities", { ...task, contactId: "ghost" })).text(), /no longer exists/);
  assert.equal((await call("a", "POST", "/api/collection/activities", { ...task, contactId: pat })).status, 201);
  assert.equal((await call("b", "PATCH", "/api/document/activities/old", { notes: "Edited" })).status, 200, "older tasks can still be edited");
  assert.equal((await call("b", "PATCH", "/api/document/activities/old", { done: true })).status, 400, "but not completed without a contact");
  assert.equal((await call("b", "PATCH", "/api/document/activities/old", { done: true, contactId: pat })).status, 200);
});

test("bare POSTs with an empty body (as Cloudflare sends them) work for sequence and deal actions", async () => {
  const { sqlite } = fixture();
  const bare = (path) => worker.fetch(new Request(`https://voyage.example${path}`, {
    method: "POST", headers: { cookie: `voyage_session=${"a".repeat(64)}`, origin: "https://voyage.example" }, body: new Uint8Array(0) }), { DB: { prepare: sql => fixtureDb(sqlite, sql) } });
  const starters = await bare("/api/sequences/starters");
  assert.equal(starters.status, 201, await starters.clone().text());
  sqlite.prepare("INSERT INTO documents (collection,id,data_json,updated_at) VALUES ('opps','gym',?,?)").run(JSON.stringify({ name: "Gym", stage: 0 }), Date.now());
  const seqId = sqlite.prepare("SELECT id FROM documents WHERE collection = 'sequences' LIMIT 1").get().id;
  const enroll = await worker.fetch(new Request(`https://voyage.example/api/sequences/${seqId}/enroll`, { method: "POST",
    headers: { cookie: `voyage_session=${"a".repeat(64)}`, origin: "https://voyage.example", "content-type": "application/json" }, body: JSON.stringify({ oppIds: ["gym"] }) }), { DB: { prepare: sql => fixtureDb(sqlite, sql) } });
  assert.equal((await enroll.json()).enrolled, 1);
  const enrollmentId = sqlite.prepare("SELECT id FROM documents WHERE collection = 'enrollments' LIMIT 1").get().id;
  for (const action of ["pause", "resume", "skip", "stop"]) assert.equal((await bare(`/api/enrollments/${enrollmentId}/${action}`)).status, 200, action);
  const dealId = JSON.parse(await (await worker.fetch(new Request("https://voyage.example/api/deals", { method: "POST",
    headers: { cookie: `voyage_session=${"a".repeat(64)}`, origin: "https://voyage.example", "content-type": "application/json" }, body: JSON.stringify({ name: "X" }) }), { DB: { prepare: sql => fixtureDb(sqlite, sql) } })).text()).id;
  assert.notEqual((await bare(`/api/deals/${dealId}/submit`)).status, 500);
  assert.equal((await bare(`/api/deals/${dealId}/submit`)).status, 400, "reports what's missing instead of Invalid JSON");
});
