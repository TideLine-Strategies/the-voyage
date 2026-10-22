import { useState } from "react";
import { ArrowUpRight, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INSIGHTS, metricsFor, outcomes } from "../data/analytics";
import { PLATFORMS, BRANDS } from "../constants";
import { useFactory } from "../store";
import { DemoTag } from "./bits";
import type { PlatformMetrics } from "../types";
const number = (v: number | null) => (v == null ? "Unavailable" : v.toLocaleString());
const rate = (v: number | null) => (v == null ? "Unavailable" : `${(v * 100).toFixed(1)}%`);
export function AnalyticsPanel() {
  const { state, actions } = useFactory();
  const [tab, setTab] = useState("aggregate");
  const [range, setRange] = useState("30d");
  const [platform, setPlatform] = useState("all");
  const all = metricsFor(state.brandFilter, range);
  const rows = all.filter((r) => platform === "all" || r.platform === platform);
  const reported = rows.filter((r) => r.views !== null);
  const views = reported.length ? reported.reduce((sum, r) => sum + (r.views ?? 0), 0) : null;
  const sum = (key: "watchHours" | "clicks") =>
    rows.some((r) => r[key] !== null) ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null;
  const result = outcomes(state.brandFilter, range);
  const max = Math.max(1, ...rows.map((r) => r.views ?? 0));
  const insights = INSIGHTS.filter(
    (i) =>
      (state.brandFilter === "both" || i.brand === state.brandFilter) &&
      (platform === "all" ||
        i.source
          .toLowerCase()
          .includes(PLATFORMS.find((p) => p.id === platform)?.label.toLowerCase() ?? platform)),
  );
  return (
    <section className="panel mt-6 p-5 sm:p-6" aria-labelledby="analytics-heading">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">THE FEEDBACK LOOP</p>
          <h2 id="analytics-heading" className="mt-1 text-xl font-bold">
            What is earning attention?
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Illustrative data for review. No live platform or CRM connection.
          </p>
        </div>
        <DemoTag>DEMO ANALYTICS</DemoTag>
      </header>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="segmented" role="tablist" aria-label="Analytics view">
          {["aggregate", "platform"].map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === "aggregate" ? "Aggregate" : "By platform"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs font-semibold">
            Example date range
            <select
              aria-label="Analytics date range"
              className="field mt-1"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            Platform
            <select
              aria-label="Analytics platform"
              className="field mt-1"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="all">All platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["Total reported views", number(views)],
          ["Reported watch hours", sum("watchHours")?.toFixed(1) ?? "Unavailable"],
          ["Available link clicks", number(sum("clicks"))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-secondary/30 p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <strong className="mt-1 block text-2xl" data-metric={label}>
              {value}
            </strong>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {reported.length}/{rows.length} platforms report views. These are reported totals, not
        unique people. Missing data stays unavailable; rates are compared only within a platform.
      </p>
      {tab === "aggregate" ? (
        <div className="mt-5 space-y-3" role="tabpanel" aria-label="Aggregate analytics">
          {rows.map((r) => (
            <div
              key={r.platform}
              className="grid grid-cols-[6rem_minmax(0,1fr)_5rem] items-center gap-3 text-sm"
            >
              <span>{PLATFORMS.find((p) => p.id === r.platform)?.label}</span>
              <div className="h-2 rounded bg-secondary">
                <div
                  className="h-full rounded bg-stage-analytics/65"
                  style={{ width: `${((r.views ?? 0) / max) * 100}%` }}
                />
              </div>
              <span className="text-right text-xs">{number(r.views)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto" role="tabpanel" aria-label="Platform analytics">
          <table className="w-full min-w-[650px] text-left text-sm">
            <caption className="sr-only">
              Illustrative platform metrics; rates are never added together
            </caption>
            <thead>
              <tr>
                {["Platform", "Views", "Watch hours", "Completion", "Engagement", "Clicks"].map(
                  (h) => (
                    <th key={h} className="border-b p-2 text-xs text-muted-foreground">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: PlatformMetrics) => (
                <tr key={r.platform}>
                  <th className="border-b p-2 font-semibold">
                    {PLATFORMS.find((p) => p.id === r.platform)?.label}
                  </th>
                  {[
                    number(r.views),
                    r.watchHours?.toFixed(1) ?? "Unavailable",
                    rate(r.completion),
                    rate(r.engagement),
                    number(r.clicks),
                  ].map((v, i) => (
                    <td key={i} className="border-b p-2 text-xs">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6 rounded-xl bg-secondary/50 p-4">
        <p className="text-sm font-semibold">
          Qualified outcomes{" "}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            Illustrative CRM attribution · followers are never leads
          </span>
        </p>
        {platform !== "all" ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Platform-specific CRM attribution is unavailable in this demo. Select All platforms to
            view the brand-level example.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Qualified conversations", result.conversations],
              ["Accounts + next step", result.accounts],
              ["Demos", result.demos],
              ["Paying customers", result.customers],
            ].map(([label, value]) => (
              <div key={label}>
                <strong className="block text-xl">{value}</strong>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {insights.map((i) => (
          <article key={i.id} className="rounded-xl border p-4">
            <p className="text-xs font-bold text-stage-analytics">
              <BarChart3 className="mr-1 inline size-3" />
              {BRANDS[i.brand].label} · demo insight
            </p>
            <h3 className="mt-2 text-sm font-bold">{i.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{i.body}</p>
            <Button
              className="mt-3 h-auto whitespace-normal text-left"
              size="sm"
              variant="outline"
              onClick={() =>
                actions.createIdea(
                  i.brand,
                  i.title,
                  i.body,
                  `${i.source} · ${range} · ${platform} · illustrative DEMO`,
                )
              }
            >
              Turn this insight into a brief <ArrowUpRight className="size-4 shrink-0" />
            </Button>
          </article>
        ))}
        {insights.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No sourced insight for this example filter.
          </p>
        )}
      </div>
    </section>
  );
}
