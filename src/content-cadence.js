import { CONTENT_RESEARCH } from "./content-research.js";
// Three briefs total, not three per destination. IDs survive retries and overlapping ticks.
export const CONTENT_CADENCE = {
  perWeek: 3,
  timeZone: "America/Chicago",
  days: ["Monday", "Wednesday", "Friday"],
  hour: 9,
  approvalRequired: true,
};
const dateKey = (now) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: CONTENT_CADENCE.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
export function cadenceSlots(now = Date.now()) {
  const local = dateKey(now),
    today = new Date(local + "T12:00:00Z"),
    day = today.getUTCDay(),
    monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((day + 6) % 7));
  const week = monday.toISOString().slice(0, 10),
    hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: CONTENT_CADENCE.timeZone,
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date(now)),
    );
  return [0, 2, 4].map((offset, index) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + offset);
    const date = d.toISOString().slice(0, 10);
    return {
      id: "weekly-" + week + "-" + index,
      date,
      week,
      index,
      due: date < local || (date === local && hour >= 9),
    };
  });
}
export async function cadenceState(env, now = Date.now()) {
  const rows = await env.DB.prepare(
    "SELECT id,data_json FROM documents WHERE collection=?",
  )
    .bind("content_editorial")
    .all();
  const slots = cadenceSlots(now).map((s) => {
    const row = rows.results.find((r) => r.id === s.id);
    return { ...s, stage: row ? JSON.parse(row.data_json).stage : null };
  });
  return {
    ...CONTENT_CADENCE,
    slots,
    started: slots.filter((s) => s.stage).length,
    awaitingReview: rows.results.filter(
      (r) => JSON.parse(r.data_json).stage === "approval",
    ).length,
  };
}
export async function seedCadence(env, research, now = Date.now()) {
  if (
    !research?.checkedAt ||
    now - Date.parse(research.checkedAt) > 7 * 86400000
  )
    return { created: 0, held: "Current research required" };
  const backlog = await env.DB.prepare(
    "SELECT id FROM documents WHERE collection=? AND json_extract(data_json,'$.stage') NOT IN ('published')",
  )
    .bind("content_editorial")
    .all();
  if (backlog.results.length >= 6)
    return {
      created: 0,
      held: "Six active pieces already in progress; clear review or steer existing work first",
    };
  let created = 0;
  const briefs = CONTENT_RESEARCH.briefs.filter(
    (b) => b.product === "WonPlace",
  );
  for (const s of cadenceSlots(now).filter((s) => s.due)) {
    if (backlog.results.length + created >= 6) break;
    const n = Math.floor(Date.parse(s.week) / 604800000) * 3 + s.index,
      b = briefs[((n % briefs.length) + briefs.length) % briefs.length];
    const brand = s.index === 0 ? "tideline" : "wonplace";
    const item = {
      title: b.title,
      brand,
      product: b.product,
      audience: b.audience,
      pain: b.pain,
      value: b.value,
      brief:
        b.evidenceNeeded +
        " Use verified public WonPlace preview footage only, clearly labeled fictional demo data. Do not imply unrecorded actions or customer results. Pick a fresh evidence-backed angle; hold if unsupported.",
      copy: "",
      format: "Video",
      stage: "research",
      sourceUrls: ["https://wonplace.tidelinestrats.com/preview"],
      mediaUrl: "",
      mediaAssetId: "",
      cta: "",
      accountId: "",
      approval: null,
      production: {},
      cadence: { week: s.week, date: s.date, slot: s.index },
      createdAt: now,
      updatedAt: now,
      updatedBy: "content-operator",
      activity: [
        {
          at: now,
          by: "content-operator",
          name: "Weekly content plan",
          action: "create_brief",
        },
      ],
    };
    const r = await env.DB.prepare(
      "INSERT OR IGNORE INTO documents(collection,id,data_json,revision,updated_at) SELECT ?,?,?,1,? WHERE (SELECT count(*) FROM documents WHERE collection='content_editorial' AND json_extract(data_json,'$.stage') != 'published') < 6",
    )
      .bind("content_editorial", s.id, JSON.stringify(item), now)
      .run();
    created += r.meta.changes;
  }
  return { created };
}
