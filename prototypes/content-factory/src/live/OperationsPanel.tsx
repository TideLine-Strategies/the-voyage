import { useEffect, useState, useRef, useCallback } from "react";
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
};
type Run = {
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
type State = {
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
}: {
  itemId: string;
  onMedia: (assets: Asset[]) => void;
}) {
  const active = useRef(false);
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
      active.current = v.runs.some((r) => r.status === "pending" || r.status === "running");
      onMedia(v.media);
      setStatus("Evidence loaded");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }, [onMedia]);
  useEffect(() => {
    void read();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && active.current) void read();
    }, 15000);
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
    <section className="live-panel" id="production-evidence">
      <span className="live-eyebrow">LIVE EVIDENCE / LEARNING WORKFLOW</span>
      <div className="live-panel-head">
        <h2>Research that earns the next step.</h2>
        <button onClick={() => void read()}>Refresh evidence</button>
      </div>
      <p aria-live="polite">{status}</p>
      {data && (
        <>
          <div className="live-columns">
            <div>
              <h3>This week in our niche</h3>
              {data.insights ? (
                <>
                  <p className="live-muted">
                    {new Date(data.insights.windowStart).toLocaleDateString()}–
                    {new Date(data.insights.windowEnd).toLocaleDateString()} · source publication
                    dates
                  </p>
                  {data.insights.weekly.map((s) => (
                    <article className="live-research-card" key={s.id}>
                      <small>
                        {s.creator} · {new Date(s.publishedAt!).toLocaleDateString()}
                      </small>
                      <h3>
                        <a href={s.url} target="_blank" rel="noreferrer">
                          {s.title} ↗
                        </a>
                      </h3>
                      <p>
                        {s.metrics["views"] === null
                          ? "Views unavailable"
                          : Number(s.metrics["views"]).toLocaleString() + " observed views"}
                      </p>
                      <small>{s.scope}</small>
                    </article>
                  ))}
                  {!data.insights.weekly.length && (
                    <p>
                      No verified publication in this week’s sample. Older references are not
                      current winners.
                    </p>
                  )}
                </>
              ) : (
                <p>No current research observation has arrived.</p>
              )}
            </div>
            <div>
              <h3>Our posts: measured, not guessed</h3>
              {data.insights?.own.map((s) => (
                <article className="live-research-card" key={s.id}>
                  <h3>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.title}
                    </a>
                  </h3>
                  <p>
                    {s.metrics["reactions"] ?? "Unknown"} reactions ·{" "}
                    {s.metrics["reposts"] ?? "Unknown"} reposts
                  </p>
                  <p>
                    Impressions: {s.metrics["impressions"] ?? "Unavailable"} · Clicks:{" "}
                    {s.metrics["clicks"] ?? "Unavailable"}
                  </p>
                  <small>
                    {s.scope} Observed {new Date(s.observedAt).toLocaleString()}.
                  </small>
                </article>
              ))}
              <p>{data.research?.metricsAccess}</p>
              <ul>
                {data.insights?.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </div>
          <h3>Incumbent complaints → product evidence</h3>
          <p>
            Customer feedback identifies a question to investigate. It does not establish that every
            customer has that problem, or that a competitor lacks the feature.
          </p>
          <div className="live-research-grid">
            {data.research?.complaints.map((c) => (
              <article className="live-research-card" key={c.id}>
                <h3>
                  <a href={c.url} target="_blank" rel="noreferrer">
                    {c.title}
                  </a>
                </h3>
                <p>{c.summary}</p>
                <small>
                  {c.sourceDate
                    ? new Date(c.sourceDate).toLocaleDateString()
                    : "Individual review date unverified"}{" "}
                  · {c.limitation}
                </small>
              </article>
            ))}
          </div>
          <h3>Features worth proving on screen</h3>
          <div className="live-research-grid">
            {data.research?.features.map((f) => (
              <article className="live-research-card" key={f.id}>
                <small>{f.status}</small>
                <h3>
                  <a href={f.url} target="_blank" rel="noreferrer">
                    {f.title}
                  </a>
                </h3>
                <p>{f.summary}</p>
                <small>{f.limitation}</small>
              </article>
            ))}
          </div>
          <h3>Creators to study</h3>
          <p>{data.research?.coverage}</p>
          {data.research?.creators.map((c) => (
            <details key={c.id}>
              <summary>{c.title}</summary>
              <p>{c.summary}</p>
              <a href={c.url} target="_blank" rel="noreferrer">
                Creator channel ↗
              </a>
              <p className="live-muted">{c.limitation}</p>
            </details>
          ))}
          <h3>Run a governed pass</h3>
          <p className="live-muted">
            Decision worker:{" "}
            {data.operator.available
              ? "recently connected"
              : data.operator.lastSeenAt
                ? "not recently connected"
                : "not connected yet"}
            .{" "}
            {data.operator.lastSeenAt &&
              "Last seen " + new Date(data.operator.lastSeenAt).toLocaleString()}
            . Queued work waits for the signed local operator.
          </p>
          <p>
            Rules validate dates, source identity, media hashes and approval state. The decision
            worker handles judgment, records its evidence and updates the step’s living notes. A
            pass never grants approval or sends a post.
          </p>
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
                placeholder="Which gym-owner or admin problem should we investigate?"
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
              : "No saved item selected; the pass uses the current evidence library."}
          </p>
          <div className="live-columns">
            <div>
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
            </div>
            <div>
              <h3>Decisions & experiments</h3>
              {data.runs.map((r) => (
                <article className="live-research-card" key={r.id}>
                  <small>
                    {r.step} · {r.status} · requested by {r.requestedName}
                  </small>
                  {r.decision ? (
                    <>
                      <h3>{r.decision.verdict.replaceAll("_", " ")}</h3>
                      <p>{r.decision.summary}</p>
                      <ul>
                        {r.decision.nextActions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                      {r.decision.draftCopy && (
                        <details open>
                          <summary>Draft copy · human review required</summary>
                          <pre>{r.decision.draftCopy}</pre>
                          <button
                            onClick={() => {
                              void navigator.clipboard.writeText(r.decision!.draftCopy!);
                            }}
                          >
                            Copy draft
                          </button>
                        </details>
                      )}
                      {!!r.decision.shotList?.length && (
                        <details>
                          <summary>Proposed shots · not recorded</summary>
                          <ol>
                            {r.decision.shotList.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ol>
                        </details>
                      )}
                      <p className="live-muted">{r.decision.cautions.join(" ")}</p>
                      <p>
                        {r.decision.evidenceIds.map((id) => {
                          const s = sourceLinks.get(id);
                          return s ? (
                            <a key={id} href={s.url} target="_blank" rel="noreferrer">
                              {s.title} ·{" "}
                            </a>
                          ) : (
                            <span key={id}>{id} · </span>
                          );
                        })}
                      </p>
                      <small>
                        Decision engine: {r.model}. Learning: {r.decision.learning}
                      </small>
                    </>
                  ) : (
                    <p>{r.error || "Waiting for the local decision worker."}</p>
                  )}
                </article>
              ))}
            </div>
          </div>
          <h3>Real footage & publisher branding</h3>
          <p>
            Original masters remain unchanged. Every branded derivative is linked to the exact
            publisher avatar and profile.
          </p>
          <div className="live-research-grid">
            {data.media
              .filter((a) => a.kind !== "avatar")
              .map((a) => (
                <article className="live-research-card" key={a.id}>
                  <small>
                    {a.brand} · {a.kind}
                  </small>
                  <h3>{a.title}</h3>
                  {a.mime === "video/mp4" ? (
                    <video
                      controls
                      preload="metadata"
                      playsInline
                      src={"/api/content-media/" + a.id}
                      style={{ width: "100%", borderRadius: 8 }}
                    />
                  ) : (
                    <img
                      src={"/api/content-media/" + a.id}
                      alt={a.title}
                      style={{ width: "100%" }}
                    />
                  )}
                  <p>{a.provenance}</p>
                  {a.avatarId && (
                    <img
                      src={"/api/content-media/" + a.avatarId}
                      alt={a.brand + " publisher avatar"}
                      width={40}
                      height={40}
                    />
                  )}
                  <a href={a.profileUrl} target="_blank" rel="noreferrer">
                    Verified publisher page ↗
                  </a>
                  <p className="live-muted">{a.rights}</p>
                </article>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
