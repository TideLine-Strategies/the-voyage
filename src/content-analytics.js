const names = ["linkedin", "facebook", "instagram", "youtube", "tiktok", "x"];
const metrics = [
  "views",
  "reactions",
  "comments",
  "reposts",
  "impressions",
  "clicks",
  "watchSeconds",
  "qualifiedConversations",
];
export function latestKnownObservations(observations) {
  const grouped = new Map();
  for (const o of observations) {
    if (!o.url || !Number.isFinite(Date.parse(o.observedAt))) continue;
    let row = grouped.get(o.url);
    if (!row) {
      row = {
        ...o,
        metrics: Object.fromEntries(metrics.map((k) => [k, null])),
        metricSources: {},
        lastAttemptAt: o.lastAttemptAt || o.observedAt,
      };
      grouped.set(o.url, row);
    }
    const attempted = o.lastAttemptAt || o.observedAt;
    if (Date.parse(attempted) > Date.parse(row.lastAttemptAt))
      row.lastAttemptAt = attempted;
    for (const key of metrics) {
      const value = o.metrics?.[key];
      if (!Number.isFinite(value) || value < 0) continue;
      const source = o.metricSources?.[key] || {
        observedAt: o.observedAt,
        evidence: String(
          o.scope || o.evidence || "Verified source snapshot",
        ).slice(0, 300),
      };
      if (
        !row.metricSources[key] ||
        Date.parse(source.observedAt) >=
          Date.parse(row.metricSources[key].observedAt)
      ) {
        row.metrics[key] = value;
        row.metricSources[key] = source;
      }
    }
  }
  return [...grouped.values()].map((row) => {
    const dates = Object.values(row.metricSources)
      .map((s) => s.observedAt)
      .sort();
    return {
      ...row,
      observedAt: dates.at(-1) || row.observedAt,
      hasMeasurements: dates.length > 0,
    };
  });
}
function platform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return (
      names.find(
        (p) =>
          host ===
          (p === "youtube" ? "youtube.com" : p === "x" ? "x.com" : p + ".com"),
      ) || null
    );
  } catch {
    return null;
  }
}
export function ownAnalytics(observations, brand = "all") {
  const latest = new Map();
  for (const o of latestKnownObservations(observations)) {
    if (brand !== "all" && o.brand !== brand) continue;
    const key = o.url,
      prior = latest.get(key);
    if (!prior || Date.parse(o.observedAt) > Date.parse(prior.observedAt))
      latest.set(key, o);
  }
  const rows = [...latest.values()].filter((o) => platform(o.url));
  const sum = (items) =>
    Object.fromEntries(
      metrics.map((key) => {
        const known = items
          .map((o) => o.metrics?.[key])
          .filter((v) => Number.isFinite(v) && v >= 0);
        return [
          key,
          {
            sum: known.length ? known.reduce((a, b) => a + b, 0) : null,
            reported: known.length,
            posts: items.length,
            observedAt:
              items
                .filter(
                  (o) =>
                    Number.isFinite(o.metrics?.[key]) && o.metrics[key] >= 0,
                )
                .map((o) => o.metricSources?.[key]?.observedAt || o.observedAt)
                .sort()
                .at(-1) || null,
          },
        ];
      }),
    );
  return {
    brand,
    observedPosts: rows.length,
    observedPlatforms: new Set(
      rows
        .filter((o) =>
          Object.values(o.metrics || {}).some(
            (v) => Number.isFinite(v) && v >= 0,
          ),
        )
        .map((o) => platform(o.url)),
    ).size,
    expectedPlatforms: names.length,
    definition:
      "Sum of latest known counters per exact post URL. Counters retain their own observation dates when a refresh cannot read them. These are cumulative counts, not unique people or causal results.",
    metrics: sum(rows),
    platforms: names.map((name) => {
      const items = rows.filter((o) => platform(o.url) === name);
      return {
        platform: name,
        posts: items.length,
        observedAt:
          items
            .map((o) => o.observedAt)
            .sort()
            .at(-1) || null,
        metrics: sum(items),
      };
    }),
  };
}
