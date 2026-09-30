import test from "node:test";
import assert from "node:assert/strict";
import worker, { canWrite, memberForEmail, validateDocument } from "../src/worker.js";
import { MEMBERS } from "../src/members.js";

test("only the two approved TideLine identities map to members", () => {
  assert.equal(memberForEmail("Q.STEWART@TIDELINESTRATS.COM")?.id, "QS");
  assert.equal(memberForEmail("c.knudsen@tidelinestrats.com")?.id, "CK");
  assert.equal(memberForEmail("c.kundsen@tidelinestrats.com"), null);
  assert.equal(memberForEmail("other@tidelinestrats.com"), null);
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
          if (sql.includes("FROM documents")) {
            const data = docs.get(`${args[0]}/${args[1]}`);
            return data ? { data_json: JSON.stringify(data) } : null;
          }
          return null;
        },
        async all() { return { results: [...docs.entries()].filter(([key]) => key.startsWith(`${args[0]}/`)).map(([, data]) => ({ data_json: JSON.stringify(data) })) }; },
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

test("member list has unique IDs and emails and a known role", () => {
  assert.equal(new Set(MEMBERS.map(member => member.id)).size, MEMBERS.length);
  assert.equal(new Set(MEMBERS.map(member => member.email.toLowerCase())).size, MEMBERS.length);
  for (const member of MEMBERS) assert.ok(["edit", "view"].includes(member.role), member.id);
  assert.equal(memberForEmail("c.knudsen@tidelinestrats.com")?.role, "edit");
});

test("view-only members can only write their own presence, read marks, and Muninn thread", () => {
  const viewer = { id: "VW", role: "view" };
  assert.equal(canWrite(viewer, ["api", "collection", "opps"]), false);
  assert.equal(canWrite(viewer, ["api", "document", "opps", "a1"]), false);
  assert.equal(canWrite(viewer, ["api", "collection", "messages"]), false);
  assert.equal(canWrite(viewer, ["api", "document", "reads", "QS"]), false);
  assert.equal(canWrite(viewer, ["api", "document", "reads", "VW"]), true);
  assert.equal(canWrite(viewer, ["api", "presence"]), true);
  assert.equal(canWrite(viewer, ["api", "muninn"]), true);
  assert.equal(canWrite({ id: "QS", role: "edit" }, ["api", "document", "opps", "a1"]), true);
});

test("team roster comes from the member list with roles", async () => {
  const response = await worker.fetch(new Request("https://voyage.tidelinestrats.com/api/document/settings/team", {
    headers: { cookie: `voyage_session=${"a".repeat(64)}` },
  }), { DB: muninnDb() });
  const { exists, data } = await response.json();
  assert.equal(exists, true);
  assert.deepEqual(data.members, MEMBERS.map(({ id, name, role }) => ({ id, name, role })));
});
