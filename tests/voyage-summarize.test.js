import test from "node:test";
import assert from "node:assert/strict";
import { SENTINEL, agentCommand, extractJson, isVoyagePrompt } from "../scripts/voyage-summarize.mjs";

test("only prompts copied from the app are accepted", () => {
  assert.equal(isVoyagePrompt(`${SENTINEL}\nYou help a salesperson...`), true);
  assert.equal(isVoyagePrompt(`\n  ${SENTINEL}\nnotes`), true);
  assert.equal(isVoyagePrompt("hunter2"), false);
  assert.equal(isVoyagePrompt(""), false);
  assert.equal(isVoyagePrompt(null), false);
});

test("extractJson handles fences and surrounding chatter", () => {
  assert.deepEqual(extractJson('{"headline":"ok"}'), { headline: "ok" });
  assert.deepEqual(extractJson('Sure! Here it is:\n```json\n{"keyPoints":["a"]}\n```\nAnything else?'), { keyPoints: ["a"] });
  assert.throws(() => extractJson("no json here"), /no JSON/);
  assert.throws(() => extractJson("{not valid}"), /not valid JSON/);
  assert.throws(() => extractJson(""), /no JSON/);
});

test("agent commands turn tools off and read the prompt from stdin", () => {
  const claude = agentCommand("claude", "unused");
  assert.deepEqual(claude.args.slice(0, 1), ["-p"]);
  assert.equal(claude.args[claude.args.indexOf("--tools") + 1], "");
  const codex = agentCommand("codex", "out.txt");
  assert.ok(codex.args.includes("read-only"));
  assert.equal(codex.args.at(-1), "-");
  assert.equal(codex.outFile, "out.txt");
  assert.throws(() => agentCommand("gpt", "x"), /Unknown agent/);
});
