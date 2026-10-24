import { MediaLoop } from "./MediaLoop";
import { useState } from "react";
import type { Asset, State } from "./OperationsPanel";
import type { Data } from "./LiveFactoryPage";
export const stations = [
  ["research", "Research"],
  ["scripting", "Writing"],
  ["filming", "Filming"],
  ["editing", "Editing"],
  ["approval", "Human review"],
  ["posting", "Posting"],
  ["analytics", "Analytics"],
] as const;
type Card = {
  id: string;
  title: string;
  stage: string;
  brand: string;
  detail: string;
  kind: string;
};
const mediaSrc = (id: string) => "/api/content-media/" + id;
export function StationBoard({
  cards,
  data,
  ops,
  assets,
  selected,
  onSelect,
  onNew,
  onLibrary,
}: {
  cards: Card[];
  data: Data;
  ops: State | null;
  assets: Asset[];
  selected: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onLibrary: () => void;
}) {
  const [focus, setFocus] = useState("research");
  const observed = ops?.insights?.weekly || [];
  const source = (card: Card) => {
    const item = data.items.find((i) => i.id === card.id);
    return (
      assets.find(
        (a) => a.id === item?.mediaAssetId || a.id === item?.production?.captureAssetId,
      ) || assets.find((a) => a.postId === card.id && a.kind === "original")
    );
  };
  const orphan = assets.filter(
    (a) =>
      a.mime === "video/mp4" &&
      a.kind === "original" &&
      !a.postId &&
      !cards.some((c) => source(c)?.id === a.id),
  );
  return (
    <section className="factory-line" aria-label="Content assembly line">
      <div className="factory-station-picker" aria-label="Choose station">
        {stations.map(([id, label]) => (
          <button key={id} aria-pressed={focus === id} onClick={() => setFocus(id)}>
            {label}
            <b>
              {cards.filter((c) => (c.stage === "published" ? "analytics" : c.stage) === id)
                .length + (id === "editing" ? orphan.length : 0)}
            </b>
          </button>
        ))}
      </div>
      <div className="factory-stations">
        {stations.map(([id, label], index) => {
          const entries = cards.filter(
            (c) => (c.stage === "published" ? "analytics" : c.stage) === id,
          );
          const jobs =
            ops?.runs.filter(
              (r) =>
                r.step === (id === "filming" ? "capture" : id) &&
                ["pending", "running"].includes(r.status),
            ) || [];
          const current = entries.find((c) => c.id === selected) || entries[0];
          const asset = current ? source(current) : id === "editing" ? orphan[0] : undefined;
          const poster =
            asset && assets.find((a) => a.kind === "poster" && a.originalId === asset.id);
          const metrics = current
            ? ops?.insights?.own.find(
                (s) => s.url === data.baseline?.posts.find((p) => p.id === current.id)?.url,
              )
            : undefined;
          return (
            <article
              className="factory-station"
              data-focused={focus === id}
              key={id}
              aria-label={label + " station"}
            >
              <header>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h2>{label}</h2>
                <i
                  data-running={jobs.some((j) => j.status === "running")}
                  title={jobs.length ? jobs[0]?.status : "No active run"}
                />
              </header>
              <div className="factory-content-card" data-selected={current?.id === selected}>
                <div className="factory-card-top">
                  <span>{current?.brand || asset?.brand || "Ready"}</span>
                  <small>
                    {jobs[0]?.status || (current ? "Saved" : asset ? "Constructed" : "Waiting")}
                  </small>
                </div>
                <div className="factory-card-window">
                  {id === "research" ? (
                    <div className="factory-source-feed">
                      <small>Observed sources</small>
                      <div>
                        {observed.length ? (
                          observed.slice(0, 8).map((s) => (
                            <p key={s.id}>
                              <b>{s.creator}</b>
                              {s.title}
                              <time>{new Date(s.observedAt).toLocaleDateString()}</time>
                            </p>
                          ))
                        ) : (
                          <p>Waiting for a dated research import.</p>
                        )}
                      </div>
                    </div>
                  ) : id === "scripting" ? (
                    <div
                      className="factory-writing"
                      data-running={jobs.some((j) => j.status === "running")}
                    >
                      <small>
                        {jobs.length ? "Decision worker " + jobs[0]?.status : "Latest saved script"}
                      </small>
                      <p>
                        {current
                          ? data.items.find((i) => i.id === current.id)?.copy || current.detail
                          : "No writing run is active. A researched brief arrives here next."}
                      </p>
                      <span className="factory-caret" aria-hidden="true" />
                    </div>
                  ) : asset && id === "filming" ? (
                    <div className="factory-waiting">
                      {poster ? (
                        <img src={mediaSrc(poster.id)} alt={asset.title} />
                      ) : (
                        <p>Shot plan ready · footage pending</p>
                      )}
                    </div>
                  ) : asset ? (
                    <MediaLoop
                      aria-label={asset.title}
                      src={mediaSrc(asset.id)}
                      poster={poster ? mediaSrc(poster.id) : undefined}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : id === "approval" ? (
                    <div className="factory-gate">
                      <b>Human approval</b>
                      <p>
                        {current
                          ? "Review the saved copy, evidence and final cut."
                          : "A finished cut stops here before posting."}
                      </p>
                      <span>Quan or Cody</span>
                    </div>
                  ) : id === "analytics" ? (
                    <div className="factory-metrics">
                      <b>{metrics?.metrics["reactions"] ?? "—"}</b>
                      <span>Observed reactions</span>
                      <p>Impressions: {metrics?.metrics["impressions"] ?? "Unavailable"}</p>
                      <small>
                        {metrics
                          ? new Date(metrics.observedAt).toLocaleString()
                          : "Waiting for platform observations"}
                      </small>
                    </div>
                  ) : (
                    <div className="factory-waiting">
                      <span>{id === "posting" ? "↗" : id === "filming" ? "◉" : "▱"}</span>
                      <p>
                        {id === "posting"
                          ? "Approved packages wait for the publisher and its native receipts."
                          : id === "filming"
                            ? "A script and proposed shots arrive here. Verified footage moves it onward."
                            : "Waiting for constructed footage."}
                      </p>
                    </div>
                  )}
                </div>
                <div className="factory-card-caption">
                  <h3>
                    {current?.title ||
                      asset?.title ||
                      (id === "research" ? "Your next useful brief" : "Ready for the next piece")}
                  </h3>
                  <p>
                    {current?.detail ||
                      (asset
                        ? asset.provenance
                        : jobs.length
                          ? "An actual queued run is visible in Automation."
                          : "No editorial item is at this station.")}
                  </p>
                </div>
                <button
                  className="factory-card-action"
                  onClick={() =>
                    current ? onSelect(current.id) : id === "research" ? onNew() : onLibrary()
                  }
                >
                  {current
                    ? "Open card"
                    : id === "research"
                      ? "Create brief"
                      : asset
                        ? "Media & techniques"
                        : "Inspect station"}{" "}
                  →
                </button>
              </div>
              {entries.length > 1 && (
                <select
                  aria-label={"Content at " + label}
                  value={current?.id}
                  onChange={(e) => onSelect(e.target.value)}
                >
                  {entries.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
              <small className="factory-station-note">
                {id === "approval"
                  ? "Named approval · no automatic bypass"
                  : id === "analytics"
                    ? "Unknown metrics stay unknown"
                    : jobs.length
                      ? jobs.length + " queued / running"
                      : "Receipt-driven movement"}
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}
