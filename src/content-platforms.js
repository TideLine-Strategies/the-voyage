import { latestKnownObservations } from "./content-analytics.js";
export async function analyticsTargets(env) {
  const rows = await env.DB.prepare(
    "SELECT id,data_json FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 2",
  )
    .bind("content_snapshots")
    .all();
  const targets = [];
  for (const r of rows.results) {
    const s = JSON.parse(r.data_json);
    for (const c of s.campaigns || [])
      for (const d of c.deliveries || [])
        if (d.state === "published" && d.url)
          targets.push({
            url: d.url,
            brand: s.brand,
            platform: d.platform,
            profileUrl: s.channels.find((p) => p.platform === d.platform)
              ?.profileUrl,
          });
  }
  const baseline = await env.DB.prepare(
    "SELECT data_json FROM documents WHERE collection=? AND id=?",
  )
    .bind("content_baseline", "linkedin")
    .first();
  for (const p of baseline ? JSON.parse(baseline.data_json).posts : [])
    targets.push({
      url: p.url,
      brand: "tideline",
      platform: "linkedin",
      profileUrl: "https://www.linkedin.com/company/tideline-strategies-llc/",
    });
  return [...new Map(targets.map((t) => [t.url, t])).values()].slice(0, 40);
}
export async function platformObservations(env) {
  const r = await env.DB.prepare(
    "SELECT data_json FROM documents WHERE collection=? ORDER BY updated_at DESC LIMIT 100",
  )
    .bind("content_platform_observations")
    .all();
  return r.results.map((r) => JSON.parse(r.data_json));
}
export async function ingestPlatformObservations(env, body) {
  const targets = await analyticsTargets(env),
    known = new Map(targets.map((t) => [t.url, t]));
  if (!Array.isArray(body.observations) || body.observations.length > 40)
    throw Error("Bounded exact-post observations required");
  let accepted = 0;
  for (const o of body.observations) {
    const target = known.get(o.url);
    if (
      !target ||
      o.brand !== target.brand ||
      !o.evidence ||
      typeof o.evidence !== "string" ||
      !Array.isArray(o.leaseReceipts) ||
      !o.leaseReceipts.length ||
      !Number.isFinite(Date.parse(o.observedAt)) ||
      Math.abs(Date.now() - Date.parse(o.observedAt)) > 3600000
    )
      throw Error(
        "Fresh exact native post evidence and browser lease receipts required",
      );
    const metrics = Object.fromEntries(
      [
        "views",
        "reactions",
        "comments",
        "reposts",
        "impressions",
        "clicks",
        "watchSeconds",
        "qualifiedConversations",
      ].map((k) => [
        k,
        Number.isFinite(o.metrics?.[k]) && o.metrics[k] >= 0
          ? o.metrics[k]
          : null,
      ]),
    );
    const value = {
      id: "platform-" + target.brand + "-" + accepted,
      kind: "own-post",
      brand: target.brand,
      creator: target.brand,
      title: String(o.title || "Published post").slice(0, 250),
      url: target.url,
      observedAt: o.observedAt,
      publishedAt: null,
      metrics,
      scope: String(o.evidence).slice(0, 1500),
      leaseReceipts: o.leaseReceipts
        .slice(0, 8)
        .map((v) => String(v).slice(0, 500)),
    };
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(target.url),
    );
    const id = [...new Uint8Array(hash)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    const prior = await env.DB.prepare(
      "SELECT data_json FROM documents WHERE collection=? AND id=?",
    )
      .bind("content_platform_observations", id)
      .first();
    const preserved = latestKnownObservations([
      ...(prior ? [JSON.parse(prior.data_json)] : []),
      value,
    ])[0];
    await env.DB.prepare(
      "INSERT INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json,revision=documents.revision+1,updated_at=excluded.updated_at",
    )
      .bind(
        "content_platform_observations",
        id,
        JSON.stringify(preserved),
        Date.now(),
      )
      .run();
    accepted++;
  }
  const status = {
    checkedAt: new Date().toISOString(),
    observations: accepted,
    measuredPosts: body.observations.filter((o) =>
      Object.values(o.metrics || {}).some((v) => Number.isFinite(v) && v >= 0),
    ).length,
    blockers: (Array.isArray(body.blockers) ? body.blockers : [])
      .slice(0, 12)
      .map((b) => String(b).slice(0, 1500)),
  };
  await env.DB.prepare(
    "INSERT INTO documents(collection,id,data_json,revision,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(collection,id) DO UPDATE SET data_json=excluded.data_json,revision=documents.revision+1,updated_at=excluded.updated_at",
  )
    .bind(
      "content_analytics_status",
      "current",
      JSON.stringify(status),
      Date.now(),
    )
    .run();
  return { accepted };
}
