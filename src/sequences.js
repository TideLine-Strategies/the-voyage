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

// Merge fields in step titles and scripts: {{account}}, {{city}}, {{my_name}}, {{my_title}}, {{my_phone}}, {{stage}}.
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

// Generic starters a team can copy and edit. Kept free of customer or pricing details (public repo).
export const STARTER_SEQUENCES = [
  {
    name: "New studio outreach", audience: "prospect",
    description: "Two weeks of mixed touches to book a discovery call with a new prospect.",
    steps: [
      { day: 0, type: "Cold call", title: "Intro call to {{account}}", script: "Ask for the owner. Goal: a 20-minute discovery call.\nOpener: \"Hi, this is {{my_name}} with TideLine Strategies. We help studios like {{account}} take repetitive admin off the front desk. Do you have two minutes?\"" },
      { day: 0, type: "Email", title: "Intro email", script: "Subject: Less admin at {{account}}\n\nHi,\n\nI just tried to reach you by phone. We help {{city}} studios cut front-desk busywork: makeups, attendance, billing follow-up.\n\nWould 20 minutes next week be worth it to see if it fits {{account}}?\n\n{{my_name}}\n{{my_title}}\n{{my_phone}}" },
      { day: 3, type: "Phone call", title: "Follow-up call", script: "Reference the email. Ask what takes the most staff time each week." },
      { day: 5, type: "VITO letter", title: "VITO letter to the owner of {{account}}", script: [
        "Mail or email to the owner (the Very Important Top Officer). One page, results first, a specific ask. Fill in the brackets.",
        "",
        "Subject: [Number] hours a week back for {{account}}'s front desk",
        "",
        "Dear [Owner's name],",
        "",
        "Studios like {{account}} lose [number] staff hours every week to work that happens between systems: makeups, late adds, re-keying rosters, and chasing balances.",
        "",
        "At [comparable studio], we took [specific task] off the front desk with automation that still asks a staff member to approve every change. In the first [weeks], their team got back an estimated [number] hours a week.",
        "",
        "I'd like 20 minutes to show you what that could look like at {{account}}. I'll call your office on [day] at [time]. If another time is better, reply with what works.",
        "",
        "{{my_name}}",
        "{{my_title}}, TideLine Strategies",
        "{{my_phone}}",
        "",
        "P.S. We measure your team's time for two weeks first, so every savings number is proven, not promised.",
      ].join("\n") },
      { day: 8, type: "Email", title: "Value email", script: "Subject: An idea for {{account}}\n\nHi,\n\nOne thing we see at studios like yours: makeups and late adds eat hours every week. We automate that with a staff approval on every change.\n\nOpen to a quick look?\n\n{{my_name}}" },
      { day: 12, type: "Phone call", title: "Last call attempt", script: "Try a different time of day. Leave a short voicemail with your number." },
      { day: 16, type: "Email", title: "Close the loop", script: "Subject: Should I close your file?\n\nHi,\n\nI haven't been able to connect, so I'll assume now isn't the right time. If that changes, just reply and I'll set something up.\n\n{{my_name}}" },
    ],
  },
  {
    name: "Existing client check-in and upsell", audience: "upsell",
    description: "For current clients: check in, review how it's going, and offer what they don't have yet.",
    steps: [
      { day: 0, type: "Email", title: "Check-in with {{account}}", script: "Subject: How are things going at {{account}}?\n\nHi,\n\nChecking in to see how everything is running. Anything slowing your team down that we can help with?\n\n{{my_name}}" },
      { day: 4, type: "Phone call", title: "Usage review call", script: "Ask: what's working, what still takes manual effort, any new locations or programs coming up. Note opportunities." },
      { day: 10, type: "Email", title: "Add-on idea", script: "Subject: An idea based on our call\n\nHi,\n\nBased on what you shared, here's something that could save your team more time. Happy to walk you through it.\n\n{{my_name}}" },
      { day: 14, type: "Phone call", title: "Follow up on the add-on", script: "Ask if they reviewed the idea. Offer a short demo or a trial." },
    ],
  },
];
