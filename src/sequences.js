// Sequences (cadences): reusable series of outreach steps. Enrolling an account creates one task at a
// time; finishing a step schedules the next one, keeping the gap between steps. Booking a meeting or
// (for prospecting) moving the account to a new stage stops the sequence.

export const AUDIENCES = new Set(["prospect", "upsell"]);
export const STEP_TYPES = ["Cold call", "Phone call", "Email", "VITO letter", "Text", "LinkedIn", "In-person visit", "Video"];
export const OUTCOMES = new Set(["done", "connected", "voicemail", "no-answer", "sent", "skipped"]);

const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";

export function sanitizeSequence(input) {
  const s = input && typeof input === "object" ? input : {};
  const steps = (Array.isArray(s.steps) ? s.steps : []).slice(0, 30).map((step, i) => ({
    id: /^[\w-]{1,40}$/.test(step?.id || "") ? step.id : `s${i + 1}`,
    day: Math.max(0, Math.min(365, Math.round(Number(step?.day) || 0))),
    type: STEP_TYPES.includes(step?.type) ? step.type : "Phone call",
    title: text(step?.title, 120),
    script: text(step?.script, 4000),
  })).sort((a, b) => a.day - b.day);
  const ids = new Set();
  for (const step of steps) { while (ids.has(step.id)) step.id += "x"; ids.add(step.id); }
  return {
    name: text(s.name, 100) || "Untitled sequence",
    audience: AUDIENCES.has(s.audience) ? s.audience : "prospect",
    description: text(s.description, 500),
    stopOnMeeting: s.stopOnMeeting !== false,
    stopOnStage: s.audience === "upsell" ? false : s.stopOnStage !== false,
    active: s.active !== false,
    steps,
  };
}

export const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Merge fields in step titles and scripts: {{contact}}, {{account}}, {{city}}, {{my_name}}, {{my_title}}, {{my_phone}}, {{stage}}.
export function fillTemplate(template, vars) {
  return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (vars[key] ?? "") === "" ? match : String(vars[key]));
}

// The task a step becomes.
export function stepTask(sequence, enrollment, stepIndex, date, vars, now) {
  const step = sequence.steps[stepIndex];
  return {
    kind: "task", type: step.type, oppId: enrollment.oppId, oppName: vars.account || "", date, time: "",
    notes: [fillTemplate(step.title, vars), fillTemplate(step.script, vars)].filter(Boolean).join("\n\n").slice(0, 4000),
    owner: enrollment.owner, shared: [], done: false, doneTs: null, createdTs: now,
    seq: { enrollmentId: enrollment.id, sequenceId: sequence.id, stepId: step.id, step: stepIndex + 1, of: sequence.steps.length, name: sequence.name },
  };
}

// When the next step is due: the same gap as in the template, counted from when this step was done.
export function nextStepDate(sequence, doneIndex, doneDate) {
  const gap = sequence.steps[doneIndex + 1].day - sequence.steps[doneIndex].day;
  return addDays(doneDate, Math.max(0, gap));
}

// Ready-made, fully scripted sequences live in sequence-library.js.
export { SEQUENCE_LIBRARY as STARTER_SEQUENCES } from "./sequence-library.js";
