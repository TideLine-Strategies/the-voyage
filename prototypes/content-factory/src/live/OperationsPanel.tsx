import { MediaLoop } from "./MediaLoop";
import { useEffect, useState, useCallback } from "react";
type Metrics = Record<string, number | null>;
type Evidence = {
  id: string;
  creator: string;
  title: string;
  url: string;
  publishedAt: string | null;
  observedAt: string;
  metrics: Metrics;
  scope: string;
};
type Fact = {
  id: string;
  title: string;
  url: string;
  summary: string;
  status: string;
  limitation: string;
  sourceDate: string | null;
};
export type Asset = {
  id: string;
  title: string;
  brand: string;
  kind: string;
  mime: string;
  profileUrl: string;
  postId: string;
  originalId: string | null;
  avatarId: string | null;
  provenance: string;
  rights: string;
  techniques?: string[];
  promptStatus?: string;
  posterAssetId?: string;
};
type Run = {
  itemId?: string;
  id: string;
  step: string;
  status: string;
  requestedName: string;
  error?: string;
  decision?: {
    verdict: string;
    summary: string;
    evidenceIds: string[];
    nextActions: string[];
    cautions: string[];
    learning: string;
    draftCopy?: string;
    shotList?: string[];
  };
  model?: string;
};
type Doc = {
  step: string;
  version: string;
  instructions: string;
  living: {
    passes: number;
    lastOutcome?: string;
    lessons: { runId: string; text: string; outcome: string }[];
  };
};
type Counter = { sum: number | null; reported: number; posts: number; observedAt?: string | null };
type Analytics = {
  observedPosts: number;
  observedPlatforms: number;
  expectedPlatforms: number;
  definition: string;
  metrics: Record<string, Counter>;
  platforms: {
    platform: string;
    posts: number;
    observedAt: string | null;
    metrics: Record<string, Counter>;
  }[];
};
export type State = {
  observations?: Evidence[];
  control?: { paused: boolean; name?: string };
  cadence?: {
    perWeek: number;
    timeZone: string;
    started: number;
    awaitingReview: number;
    slots: { date: string; stage: string | null }[];
  };
  analyticsStatus?: {
    checkedAt: string;
    observations: number;
    measuredPosts?: number;
    blockers: string[];
  } | null;
  production?: {
    id: string;
    itemId: string;
    mode: string;
    status: string;
    reason?: string;
    startedAt: number;
    finishedAt?: number;
  }[];
  analytics?: Record<string, Analytics>;
  pipeline?: { eventId: string; step: string; status: string; reason: string; at: number }[];
  media: Asset[];
  research: {
    checkedAt: string;
    coverage: string;
    metricsAccess: string;
    creators: Fact[];
    complaints: Fact[];
    features: Fact[];
  } | null;
  insights: {
    windowStart: string;
    windowEnd: string;
    weekly: Evidence[];
    own: Evidence[];
    limitations: string[];
    excludedUndated: number;
  } | null;
  docs: Doc[];
  runs: Run[];
  operator: { lastSeenAt: number | null; available: boolean };
};
export function OperationsPanel({
  itemId,
  onMedia,
  onState,
  onAttach,
  onPresent,
  brand,
  requestedPanel,
  onPanelChange,
}: {
  itemId: string;
  onMedia: (assets: Asset[]) => void;
  onState: (state: State) => void;
  onAttach: (assetId: string) => void;
  onPresent: (assetId: string) => void;
  brand: string;
  requestedPanel?: string;
  onPanelChange?: (panel: string) => void;
}) {
  const [panel, setPanel] = useState("runs");
  useEffect(() => {
    if (requestedPanel) setPanel(requestedPanel);
  }, [requestedPanel]);
  const [data, setData] = useState<State | null>(null),
    [status, setStatus] = useState("Reading production evidence…"),
    [step, setStep] = useState("research"),
    [direction, setDirection] = useState(""),
    [busy, setBusy] = useState(false);
  const read = useCallback(async () => {
    try {
      const r = await fetch("/api/content-ops", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw Error("Production evidence is not available");
      const v: State = await r.json();
      setData(v);
      onMedia(v.media);
      onState(v);
      setStatus("Evidence loaded");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }, [onMedia, onState]);
  useEffect(() => {
    void read();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void read();
    }, 60000);
    return () => clearInterval(timer);
  }, [read]);
  async function run() {
    setBusy(true);
    try {
      const r = await fetch("/api/content-ops", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run", step, itemId: itemId || "", direction }),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      setStatus(
        "Queued for the bounded decision worker. The result and step lessons will appear here.",
      );
      await read();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const totals = data?.analytics?.[brand];
  const sourceLinks = new Map<string, { title: string; url: string }>(
    [
      ...(data?.insights?.weekly || []),
      ...(data?.insights?.own || []),
      ...(data?.research?.complaints || []),
      ...(data?.research?.features || []),
      ...(data?.research?.creators || []),
    ].map((s) => [s.id, s]),
  );
  return (
    <section className="live-panel factory-operations" id="production-evidence">
      <div className="live-panel-head">
        <div>
          <span className="live-eyebrow">PRODUCTION / REAL EVIDENCE</span>
          <h2>Keep the line moving.</h2>
        </div>
        <button onClick={() => void read()}>Refresh evidence</button>
      </div>
      <p aria-live="polite">
        {status} · Operator {data?.operator.available ? "connected" : "not recently connected"}
        {data?.operator.lastSeenAt
          ? " · " + new Date(data.operator.lastSeenAt).toLocaleString()
          : ""}
      </p>
      <nav className="factory-dock" aria-label="Production details">
        {[
          ["runs", "Runs & steering"],
          ["research", "Research feed"],
          ["media", "Media & techniques"],
          ["analytics", "Platform analytics"],
          ["policies", "Agent instructions"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={panel === id}
            onClick={() => {
              setPanel(id!);
              onPanelChange?.(id!);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {data && (
        <div className="factory-operations-body">
          {panel === "runs" && (
            <>
              <details>
                <summary>Completion receipts</summary>
                {data.production?.map((j) => (
                  <p key={j.id}>
                    <b>
                      {j.mode} · {j.status}
                    </b>{" "}
                    · {j.reason || "Actual production worker"}
                    {j.status === "running" && (
                      <button
                        onClick={async () => {
                          const response = await fetch("/api/content-ops", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ action: "cancel_production", id: j.id }),
                          });
                          if (!response.ok) setStatus((await response.json()).error);
                          await read();
                        }}
                      >
                        Stop production
                      </button>
                    )}
                  </p>
                ))}
                {data.pipeline?.map((r) => (
                  <p key={r.eventId}>
                    <b>
                      {r.step} · {r.status}
                    </b>{" "}
                    · {r.reason} · {new Date(r.at).toLocaleString()}
                  </p>
                ))}
              </details>
              <div className="live-form">
                <label className="live-field">
                  Workflow step
                  <select
                    aria-label="Workflow step"
                    value={step}
                    onChange={(e) => setStep(e.target.value)}
                  >
                    {data.docs.map((d) => (
                      <option key={d.step} value={d.step}>
                        {d.step}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="live-field">
                  Direction for this pass
                  <textarea
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                    placeholder="Steer this pass with the evidence or correction you want considered."
                  />
                </label>
              </div>
              <button
                className="live-primary"
                disabled={busy || !data.research}
                onClick={() => void run()}
              >
                Run {step} pass
              </button>
              <p className="live-muted">
                {itemId
                  ? "Uses the selected saved item."
                  : "Library-only pass; select an editorial card to move that item."}{" "}
                Human approval and native publication receipts remain separate gates.
              </p>
              <div className="live-research-grid">
                {data.runs.map((r) => (
                  <article className="live-research-card" key={r.id}>
                    <small>
                      {r.step} · {r.status} · {r.requestedName}
                    </small>
                    <h3>
                      {r.decision?.summary || r.error || "Waiting for the signed local worker"}
                    </h3>
                    {["pending", "running"].includes(r.status) && (
                      <button
                        onClick={async () => {
                          const response = await fetch("/api/content-ops", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ action: "cancel", id: r.id }),
                          });
                          if (!response.ok) setStatus((await response.json()).error);
                          await read();
                        }}
                      >
                        Stop this pass
                      </button>
                    )}
                    {r.decision && (
                      <details>
                        <summary>Decision, evidence & learning</summary>
                        <p>
                          {r.decision.verdict} · {r.decision.cautions.join(" ")}
                        </p>
                        <ul>
                          {r.decision.nextActions.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                        <pre>{r.decision.draftCopy}</pre>
                        <ol>
                          {r.decision.shotList?.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ol>
                        <p>{r.decision.learning}</p>
                        {r.decision.evidenceIds.map((id) => {
                          const source = sourceLinks.get(id);
                          return source ? (
                            <p key={id}>
                              <a href={source.url} target="_blank" rel="noreferrer">
                                {source.title}
                              </a>
                            </p>
                          ) : (
                            <span key={id}>{id}</span>
                          );
                        })}
                      </details>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {panel === "research" && (
            <>
              <h3>This week in our niche</h3>
              <p className="live-muted">{data.research?.coverage}</p>
              <div className="live-research-grid">
                {data.insights?.weekly.map((s) => (
                  <article className="live-research-card" key={s.id}>
                    <small>
                      {s.creator} ·{" "}
                      {s.publishedAt
                        ? new Date(s.publishedAt).toLocaleDateString()
                        : "Publication date unavailable"}
                    </small>
                    <h3>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    </h3>
                    <p>{s.metrics["views"] ?? "Unknown"} observed views</p>
                    <details>
                      <summary>Source scope</summary>
                      <p>{s.scope}</p>
                      <p>Observed {new Date(s.observedAt).toLocaleString()}</p>
                    </details>
                  </article>
                ))}
              </div>
              <details>
                <summary>Incumbent complaints & product proof</summary>
                {[...(data.research?.complaints || []), ...(data.research?.features || [])].map(
                  (f) => (
                    <article className="live-research-card" key={f.id}>
                      <h3>
                        <a href={f.url} target="_blank" rel="noreferrer">
                          {f.title}
                        </a>
                      </h3>
                      <p>{f.summary}</p>
                      <small>{f.limitation}</small>
                    </article>
                  ),
                )}
              </details>
            </>
          )}
          {panel === "media" && (
            <>
              <h3>Real footage & production techniques</h3>
              <p className="live-muted">
                Private, verified files. Original and derivative identities stay linked. Prompts are
                attributed to their source; missing prompts stay pending.
              </p>
              <div className="live-research-grid">
                {data.media
                  .filter(
                    (a) =>
                      a.kind !== "avatar" &&
                      a.kind !== "poster" &&
                      (brand === "all" || a.brand === brand),
                  )
                  .map((a) => (
                    <article className="live-research-card" key={a.id}>
                      <small>
                        {a.brand} · {a.kind}
                      </small>
                      <h3>
                        <button className="presentation-title-link" onClick={() => onPresent(a.id)}>
                          {a.title}
                        </button>
                      </h3>
                      <div className="published-preview-target">
                        {a.mime === "video/mp4" ? (
                          <MediaLoop
                            aria-label={a.title}
                            autoPlay
                            muted
                            loop
                            playsInline
                            controls
                            preload="metadata"
                            src={"/api/content-media/" + a.id}
                            style={{ width: "100%", borderRadius: 8 }}
                          />
                        ) : (
                          <img src={"/api/content-media/" + a.id} alt={a.title} />
                        )}
                        <button
                          className="concept-preview-hit"
                          aria-label={"Present " + a.title}
                          onClick={() => onPresent(a.id)}
                        />
                      </div>
                      <details>
                        <summary>How it was made</summary>
                        <p>{a.provenance}</p>
                        {a.techniques?.map((t) => (
                          <p key={t}>{t}</p>
                        ))}
                        <p>{a.promptStatus || "Prompts not supplied."}</p>
                        <p>{a.rights}</p>
                        <a href={a.profileUrl} target="_blank" rel="noreferrer">
                          Publisher profile
                        </a>
                      </details>
                      <button
                        disabled={!itemId || a.mime !== "video/mp4"}
                        onClick={() => onAttach(a.id)}
                      >
                        Attach to selected card
                      </button>
                    </article>
                  ))}
              </div>
            </>
          )}
          {panel === "analytics" && (
            <>
              <h3>Platform observations</h3>
              {data.analyticsStatus && (
                <details>
                  <summary>
                    Last native collection ·{" "}
                    {new Date(data.analyticsStatus.checkedAt).toLocaleString()} ·{" "}
                    {data.analyticsStatus.observations} posts checked ·{" "}
                    {data.analyticsStatus.measuredPosts ?? "Unknown"} with readable counters
                  </summary>
                  {data.analyticsStatus.blockers.map((b, i) => (
                    <p key={i}>{b}</p>
                  ))}
                </details>
              )}
              {totals && (
                <>
                  <p>
                    {totals.observedPosts} observed posts · {totals.observedPlatforms}/
                    {totals.expectedPlatforms} platforms with measurements
                  </p>
                  <div className="live-research-grid">
                    {totals.platforms.map((p) => (
                      <article className="live-research-card" key={p.platform}>
                        <h3>{p.platform}</h3>
                        <p>{p.posts ? p.posts + " observed posts" : "No platform observations"}</p>
                        {["views", "impressions", "reactions", "comments", "reposts", "clicks"].map(
                          (k) => (
                            <p key={k}>
                              {k}: {p.metrics[k]?.sum ?? "Unavailable"}
                              {p.metrics[k]?.reported
                                ? " · " +
                                  p.metrics[k]!.reported +
                                  "/" +
                                  p.posts +
                                  " posts reporting"
                                : ""}
                              {p.metrics[k]?.observedAt && (
                                <small>
                                  {" "}
                                  · as of {new Date(p.metrics[k]!.observedAt!).toLocaleString()}
                                </small>
                              )}
                            </p>
                          ),
                        )}
                        <small>
                          {p.observedAt
                            ? "Observed " + new Date(p.observedAt).toLocaleString()
                            : "Awaiting an authorized source"}
                        </small>
                      </article>
                    ))}
                  </div>
                  <details>
                    <summary>Aggregate known counts</summary>
                    <p>{totals.definition}</p>
                    {Object.entries(totals.metrics).map(([k, c]) => (
                      <p key={k}>
                        {k}: {c.sum ?? "Unavailable"} · {c.reported}/{c.posts} observed posts
                        reporting. Coverage is partial when platforms are missing.
                      </p>
                    ))}
                  </details>
                </>
              )}
              <p>{data.research?.metricsAccess}</p>
              <div className="live-research-grid">
                {data.insights?.own.map((s) => (
                  <article className="live-research-card" key={s.id}>
                    <h3>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    </h3>
                    <p>
                      Reactions: {s.metrics["reactions"] ?? "Unavailable"} · Reposts:{" "}
                      {s.metrics["reposts"] ?? "Unavailable"}
                    </p>
                    <p>
                      Impressions: {s.metrics["impressions"] ?? "Unavailable"} · Clicks:{" "}
                      {s.metrics["clicks"] ?? "Unavailable"}
                    </p>
                    <small>Observed {new Date(s.observedAt).toLocaleString()}</small>
                    <details>
                      <summary>Measurement scope</summary>
                      <p>{s.scope}</p>
                    </details>
                  </article>
                ))}
              </div>
              <details>
                <summary>Aggregate coverage & limits</summary>
                <p>
                  {data.insights?.own.length || 0} observed posts. Missing platform denominators
                  prevent a reliable aggregate rate or unique reach total.
                </p>
                {data.insights?.limitations.map((l) => (
                  <p key={l}>{l}</p>
                ))}
              </details>
            </>
          )}
          {panel === "policies" && (
            <>
              <h3>Agent instructions & living notes</h3>
              {data.docs.map((d) => (
                <details key={d.step}>
                  <summary>
                    {d.step} · {d.living.passes} passes · {d.living.lastOutcome || "not run"}
                  </summary>
                  <small>Policy {d.version}</small>
                  <pre>{d.instructions}</pre>
                  {d.living.lessons.map((l) => (
                    <p key={l.runId}>
                      <b>{l.outcome}</b> · {l.text}
                    </p>
                  ))}
                </details>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
