import test from "node:test";
import assert from "node:assert/strict";
import worker, { memberForEmail, validateDocument } from "../src/worker.js";

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

test("Muninn requires a server credential and keeps member conversation in SQL", async () => {
  const db = muninnDb();
  db.docs.set("opps/a1", { name: "Sample Gym", stage: 0 });
  const env = { DB: db, OPENAI_API_KEY: "test-only" };
  const missing = await worker.fetch(muninnRequest("POST", { question: "Which accounts?" }), { DB: db });
  assert.equal(missing.status, 503);
  const originalFetch = globalThis.fetch;
  let upstream;
  globalThis.fetch = async (url, init) => {
    upstream = { url, init };
    return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: "Sample Gym is in the pipeline." }] }] });
  };
  try {
    const response = await worker.fetch(muninnRequest("POST", { question: "Which accounts?" }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).answer, "Sample Gym is in the pipeline.");
    assert.equal(upstream.url, "https://api.openai.com/v1/responses");
    const payload = JSON.parse(upstream.init.body);
    assert.equal(payload.store, false);
    assert.equal(payload.model, "gpt-5.3-codex");
    assert.match(payload.input[0].content, /Sample Gym/);
    assert.equal(upstream.init.headers.authorization, "Bearer test-only");
    const history = await worker.fetch(muninnRequest("GET"), env);
    assert.equal((await history.json()).turns.length, 2);
    await worker.fetch(muninnRequest("DELETE"), env);
    assert.equal(db.docs.has("assistant_threads/QS"), false);
  } finally { globalThis.fetch = originalFetch; }
});
