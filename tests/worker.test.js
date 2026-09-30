import test from "node:test";
import assert from "node:assert/strict";
import worker, { canWrite, memberForEmail, validateDocument } from "../src/worker.js";

test("membership resolves from the active SQL roster", async () => {
  const db = muninnDb();
  assert.equal((await memberForEmail("Q.STEWART@TIDELINESTRATS.COM", db))?.id, "QS");
  assert.equal((await memberForEmail("guest@example.com", db))?.role, "guest");
  assert.equal(await memberForEmail("other@example.com", db), null);
});

test("client cannot impersonate a chat author or edit a message body", () => {
  const actor = { id: "QS" };
  const message = validateDocument("messages", "m1", { by: "CK", text: "Hello", ts: 1 }, actor, "POST");
  assert.equal(message.by, "QS");
  assert.ok(message.ts > 1);
  assert.throws(() => validateDocument("messages", "m1", { text: "Changed" }, actor, "PATCH"));
  assert.throws(() => validateDocument("reads", "CK", { marks: {} }, actor, "PUT"));
  assert.throws(() => validateDocument("settings", "team", { members: [] }, actor, "PUT"));
});

test("worker refuses requests without a verified member session", async () => {
  const request = new Request("https://voyage.tidelinestrats.com/api/collection/opps");
  const response = await worker.fetch(request, { POLICY_AUD: "CONFIGURE_ACCESS_AUD_BEFORE_DEPLOY", TEAM_DOMAIN: "https://example.cloudflareaccess.com" });
  assert.equal(response.status, 403);
});

test("unauthenticated site root only shows invitation instructions", async () => {
  const response = await worker.fetch(new Request("https://voyage.tidelinestrats.com/"), {});
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /private invitation/);
  assert.doesNotMatch(html, /Team chat|Pipeline/);
});

function muninnDb() {
  const docs = new Map();
  return {
    docs,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (sql.includes("FROM sessions")) return { member_id: "QS" };
          if (sql.includes("FROM members WHERE email")) return ({
            "q.stewart@tidelinestrats.com": { id: "QS", name: "Quan", role: "edit" },
            "guest@example.com": { id: "MJ", name: "Mary", role: "guest" },
          })[String(args[0]).toLowerCase()] || null;
          if (sql.includes("FROM members WHERE id")) return ({ QS: { id: "QS", name: "Quan", role: "edit" }, MJ: { id: "MJ", name: "Mary", role: "guest" } })[args[0]] || null;
          if (sql.includes("FROM documents")) {
            const data = docs.get(`${args[0]}/${args[1]}`);
            return data ? { data_json: JSON.stringify(data) } : null;
          }
          return null;
        },
        async all() {
          if (sql.includes("FROM members")) return { results: [{ id: "MJ", name: "Mary", role: "guest" }, { id: "QS", name: "Quan", role: "edit" }] };
          return { results: [...docs.entries()].filter(([key]) => key.startsWith(`${args[0]}/`)).map(([key, data]) => ({ id: key.split("/")[1], data_json: JSON.stringify(data) })) };
        },
        async run() {
          if (sql.startsWith("INSERT INTO documents")) docs.set(`assistant_threads/${args[0]}`, JSON.parse(args[1]));
          if (sql.startsWith("DELETE FROM documents")) docs.delete(`assistant_threads/${args[0]}`);
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

function muninnRequest(method, body) {
  return new Request("https://voyage.tidelinestrats.com/api/muninn", {
    method,
    headers: { cookie: `voyage_session=${"a".repeat(64)}`, origin: "https://voyage.tidelinestrats.com", "content-type": "application/json" },
    ...(body && { body: JSON.stringify(body) }),
  });
}

test("Muninn serves live SQL context and stores a member conversation without an API key", async () => {
  const db = muninnDb();
  db.docs.set("opps/a1", { name: "Sample Gym", stage: 0 });
  const env = { DB: db };
  const context = await worker.fetch(new Request("https://voyage.tidelinestrats.com/api/muninn/context", {
    headers: { cookie: `voyage_session=${"a".repeat(64)}` },
  }), env);
  assert.match((await context.json()).context, /Sample Gym/);
  const invalid = await worker.fetch(muninnRequest("POST", { question: "Which accounts?" }), env);
  assert.equal(invalid.status, 400);
  const response = await worker.fetch(muninnRequest("POST", { question: "Which accounts?", answer: "Sample Gym is in the pipeline." }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).answer, "Sample Gym is in the pipeline.");
  const history = await worker.fetch(muninnRequest("GET"), env);
  assert.equal((await history.json()).turns.length, 2);
  await worker.fetch(muninnRequest("DELETE"), env);
  assert.equal(db.docs.has("assistant_threads/QS"), false);
});

test("guest policy allows edits to existing CRM records and separate chat", () => {
  const guest = { id: "MJ", role: "guest" };
  assert.equal(canWrite(guest, ["api", "collection", "opps"], "POST"), false);
  assert.equal(canWrite(guest, ["api", "document", "opps", "a1"], "PATCH"), true);
  assert.equal(canWrite(guest, ["api", "document", "opps", "a1"], "PUT"), false);
  assert.equal(canWrite(guest, ["api", "document", "opps", "a1"], "DELETE"), false);
  assert.equal(canWrite(guest, ["api", "document", "activities", "a1"], "PATCH"), true);
  assert.equal(canWrite(guest, ["api", "document", "notes", "n1"], "PATCH"), true);
  assert.equal(canWrite(guest, ["api", "collection", "messages"], "POST"), true);
  assert.equal(canWrite(guest, ["api", "document", "reads", "QS"], "PATCH"), false);
  assert.equal(canWrite(guest, ["api", "document", "reads", "MJ"], "PATCH"), true);
  assert.equal(canWrite(guest, ["api", "presence"], "POST"), true);
  assert.equal(canWrite(guest, ["api", "muninn"], "POST"), true);
  assert.equal(canWrite({ id: "QS", role: "edit" }, ["api", "collection", "opps"], "POST"), true);
});

test("team roster comes from SQL without exposing email addresses", async () => {
  const response = await worker.fetch(new Request("https://voyage.tidelinestrats.com/api/document/settings/team", {
    headers: { cookie: `voyage_session=${"a".repeat(64)}` },
  }), { DB: muninnDb() });
  const { exists, data } = await response.json();
  assert.equal(exists, true);
  assert.deepEqual(data.members, [{ id: "MJ", name: "Mary", role: "guest" }, { id: "QS", name: "Quan", role: "edit" }]);
});
