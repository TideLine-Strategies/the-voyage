import test from "node:test";
import assert from "node:assert/strict";
import { STARTER_SEQUENCES, addDays, fillTemplate, nextStepDate, sanitizeSequence } from "../src/sequences.js";

test("sequence cleanup sorts steps, clamps values, and keeps ids unique", () => {
  const s = sanitizeSequence({ name: " Outreach ", audience: "bogus", steps: [
    { id: "a", day: 7, type: "Email", title: "Later" }, { id: "a", day: -3, type: "Teleport", title: "First" }, { day: 999 }] });
  assert.equal(s.name, "Outreach");
  assert.equal(s.audience, "prospect");
  assert.deepEqual(s.steps.map(x => [x.day, x.type]), [[0, "Phone call"], [7, "Email"], [365, "Phone call"]]);
  assert.equal(new Set(s.steps.map(x => x.id)).size, 3);
  assert.equal(sanitizeSequence({ audience: "upsell", stopOnStage: true }).stopOnStage, false, "upsell never stops on stage change");
});

test("merge fields, dates, and gaps between steps", () => {
  assert.equal(fillTemplate("Hi {{account}} from {{my_name}} {{unknown}}", { account: "Gym", my_name: "Cody" }), "Hi Gym from Cody {{unknown}}");
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  const s = sanitizeSequence({ steps: [{ day: 0 }, { day: 3 }, { day: 10 }] });
  assert.equal(nextStepDate(s, 0, "2026-10-06"), "2026-10-09");
  assert.equal(nextStepDate(s, 1, "2026-10-12"), "2026-10-19", "the gap counts from when the step was actually done");
});

test("starter sequences are valid and contain no customer or pricing details", () => {
  for (const starter of STARTER_SEQUENCES) {
    const s = sanitizeSequence(starter);
    assert.ok(s.steps.length >= 4);
    assert.doesNotMatch(JSON.stringify(starter), /$d/, "no prices in starter templates");
  }
});
