import { MediaLoop } from "./MediaLoop";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Asset, State } from "./OperationsPanel";
import type { Data } from "./LiveFactoryPage";
export const stations = [
  ["research", "Research"],
  ["scripting", "Scripting"],
  ["filming", "Filming"],
  ["editing", "Editing"],
  ["approval", "Human approval"],
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
const descriptions = [
  "Find angles & evidence",
  "Turn insight into a script",
  "Capture real product footage",
  "Assemble and refine",
  "Quan or Cody approves",
  "Deliver to destinations",
  "Measure and learn",
];
const colors = ["#4a91dc", "#9675e5", "#35a382", "#e25b76", "#e6ad4b", "#44a4b6", "#8f79d9"];
const stageOf = (c: Card) => (c.stage === "published" ? "analytics" : c.stage);
const src = (a: Asset) => "/api/content-media/" + a.id;
export function StationBoard({
  cards,
  data,
  ops,
  assets,
  selected,
  onSelect,
  onInspect,
  onPresent,
  onNew,
  onLibrary,
}: {
  cards: Card[];
  data: Data;
  ops: State | null;
  assets: Asset[];
  selected: string;
  onSelect: (id: string) => void;
  onInspect: (id: string) => void;
  onPresent: (id: string) => void;
  onNew: () => void;
  onLibrary: () => void;
}) {
  const [focus, setFocus] = useState("editing"),
    [local, setLocal] = useState(""),
    [detail, setDetail] = useState("brief");
  const strip = useRef<HTMLDivElement>(null);
  const source = (c: Card) => {
    const item = data.items.find((i) => i.id === c.id);
    return (
      assets.find(
        (a) => a.id === item?.mediaAssetId || a.id === item?.production?.captureAssetId,
      ) ||
      assets.find((a) => a.postId === c.id && a.kind === "original") ||
      assets.find((a) =>
        data.brands.some((b) =>
          b.snapshot?.campaigns.some((campaign) =>
            campaign.deliveries.some(
              (d) =>
                d.state === "published" &&
                d.assets?.some((x) => x.sha256 === a.id) &&
                c.id === "posted-" + b.brand + "-" + campaign.id + "-" + d.platform,
            ),
          ),
        ),
      )
    );
  };
  const library = assets
    .filter(
      (a) =>
        a.mime === "video/mp4" &&
        a.kind === "original" &&
        !a.postId &&
        !cards.some((c) => source(c)?.id === a.id),
    )
    .map((a) => ({
      id: a.id,
      title: a.title,
      stage: "editing",
      brand: a.brand,
      detail: a.provenance,
      kind: "library",
    }));
  const all = [...cards, ...library],
    active = all.find((c) => c.id === local) || all.find((c) => c.id === selected) || all[0];
  const getAsset = (c: Card) =>
    c.kind === "library" ? assets.find((a) => a.id === c.id) : source(c);
  useEffect(() => {
    const c = all.find((c) => c.id === selected);
    if (c) {
      setFocus(stageOf(c));
      setLocal(c.id);
    }
  }, [selected]);
  const pick = (c: Card) => {
    setLocal(c.id);
    setFocus(stageOf(c));
    if (c.kind !== "library") onSelect(c.id);
  };
  const focusStation = (id: string) => {
    setFocus(id);
    const c = all.find((c) => stageOf(c) === id);
    if (c) pick(c);
    strip.current?.querySelector('[data-stage="' + id + '"]')?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };
  const activeItem = data.items.find((i) => i.id === active?.id),
    activeAsset = active && getAsset(active),
    activeRun = ops?.runs.find(
      (r) => r.itemId === active?.id && ["pending", "running"].includes(r.status),
    ),
    activeJob = ops?.production?.find((j) => j.itemId === active?.id && j.status === "running");
  const observation = ops?.insights?.own.find(
    (o) => o.url === data.baseline?.posts.find((p) => p.id === active?.id)?.url,
  );
  const preview = (c: Card | undefined, stage: string) => {
    const asset = c && getAsset(c),
      poster = asset && assets.find((a) => a.kind === "poster" && a.originalId === asset.id),
      item = data.items.find((i) => i.id === c?.id);
    if (stage === "research")
      return (
        <div className="cockpit-source-feed">
          <small>LIVE EVIDENCE</small>
          <div>
            {(ops?.insights?.weekly || []).slice(0, 8).map((o) => (
              <p key={o.id}>
                <b>{o.creator}</b>
                <span>{o.title}</span>
                <time>{new Date(o.observedAt).toLocaleDateString()}</time>
              </p>
            ))}
            {!ops?.insights?.weekly?.length && <p>Waiting for dated research.</p>}
          </div>
        </div>
      );
    if (stage === "scripting")
      return (
        <div className="cockpit-script">
          <small>SCRIPT IN PROGRESS</small>
          <p>{item?.copy || c?.detail || "A researched idea arrives here next."}</p>
          <i className="factory-caret" />
        </div>
      );
    if (asset && stage !== "filming")
      return (
        <MediaLoop
          src={src(asset)}
          aria-label={asset.title}
          poster={poster ? src(poster) : undefined}
        />
      );
    if (poster) return <img src={src(poster)} alt={asset?.title} />;
    return (
      <div className={"cockpit-empty cockpit-empty-" + stage}>
        <span aria-hidden="true">
          {stage === "approval" ? "✓" : stage === "posting" ? "↗" : stage === "filming" ? "◉" : "◇"}
        </span>
        <b>
          {stage === "approval"
            ? "Human approval"
            : stage === "posting"
              ? "Locked until approval"
              : stage === "filming"
                ? "Shot plan → footage"
                : "Ready for the next piece"}
        </b>
        <p>
          {stage === "approval"
            ? "The final cut stops here."
            : stage === "posting"
              ? "Only the approved version can be sent."
              : stage === "filming"
                ? "Real footage appears after capture completes."
                : "No content is at this stage yet."}
        </p>
      </div>
    );
  };
  return (
    <section className="factory-line concept-c" aria-label="Content assembly line">
      <div className="factory-station-picker" aria-label="Choose station">
        {stations.map(([id, label], i) => (
          <button
            key={id}
            style={{ "--stage-color": colors[i] } as CSSProperties}
            aria-pressed={focus === id}
            onClick={() => focusStation(id)}
          >
            <span className="stage-number">{i + 1}</span>
            <span>
              <b>{label}</b>
              <small>{descriptions[i]}</small>
            </span>
            <em>{all.filter((c) => stageOf(c) === id).length}</em>
          </button>
        ))}
      </div>
      <div
        className="concept-coverflow"
        ref={strip}
        tabIndex={0}
        aria-label="Browse content stages"
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
          e.preventDefault();
          const index = stations.findIndex(([s]) => s === focus);
          focusStation(
            stations[Math.max(0, Math.min(6, index + (e.key === "ArrowRight" ? 1 : -1)))]![0],
          );
        }}
      >
        {stations.map(([id, label], index) => {
          const entries = all.filter((c) => stageOf(c) === id),
            current = entries.find((c) => c.id === active?.id) || entries[0],
            offset = index - stations.findIndex(([s]) => s === focus),
            running =
              ops?.runs.some((r) => r.step === id && ["pending", "running"].includes(r.status)) ||
              ops?.production?.some(
                (j) =>
                  j.mode === (id === "filming" ? "capture" : id === "posting" ? "dispatch" : id) &&
                  j.status === "running",
              );
          return (
            <article
              className="concept-lane"
              data-stage={id}
              data-focused={focus === id}
              key={id}
              style={
                {
                  "--stage-color": colors[index],
                  "--card-turn": (offset < 0 ? 22 : offset > 0 ? -22 : 0) + "deg",
                  "--card-depth": focus === id ? "36px" : "0px",
                } as CSSProperties
              }
              aria-label={label + " station"}
            >
              {entries
                .filter((c) => c.id !== current?.id)
                .slice(0, 2)
                .map((c, n) => (
                  <button
                    key={c.id}
                    className="concept-back-card"
                    style={{ "--stack": n + 1 } as CSSProperties}
                    onClick={() => {
                      onPresent(c.id);
                    }}
                    aria-label={"Select " + c.title}
                  >
                    <span>{c.title}</span>
                  </button>
                ))}
              <div className="concept-portrait" data-selected={focus === id}>
                <button
                  className="concept-card-select"
                  tabIndex={current ? -1 : 0}
                  aria-hidden={Boolean(current)}
                  onClick={() => {
                    if (current) {
                      onPresent(current.id);
                    } else focusStation(id);
                  }}
                  aria-label={current ? "Select " + current.title : label + " station ready"}
                >
                  <span className="concept-brand">{current?.brand || label}</span>
                  <span className="concept-state" data-running={running}>
                    {running
                      ? "Working"
                      : current?.stage === "published"
                        ? "Published"
                        : current
                          ? "In production"
                          : "Ready"}
                  </span>
                </button>
                <div className="concept-preview">{preview(current, id)}</div>
                {current && (
                  <button
                    className="concept-preview-hit"
                    aria-label={"Present " + current.title}
                    onClick={() => {
                      onPresent(current.id);
                    }}
                  />
                )}
                <button
                  className="concept-card-caption"
                  tabIndex={current ? -1 : 0}
                  aria-hidden={Boolean(current)}
                  onClick={() =>
                    current ? onPresent(current.id) : id === "research" ? onNew() : onLibrary()
                  }
                >
                  <small>{current?.kind === "library" ? "SOURCE LIBRARY" : label}</small>
                  <h3>{current?.title || "Next " + label.toLowerCase() + " piece"}</h3>
                  <span>{current ? current.detail : "Waiting for a verified handoff."}</span>
                </button>
              </div>
              <div className="concept-lane-controls">
                {entries.length > 1 ? (
                  <select
                    aria-label={"Content at " + label}
                    value={current?.id}
                    onChange={(e) => {
                      const c = all.find((c) => c.id === e.target.value);
                      if (c) pick(c);
                    }}
                  >
                    {entries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <small>
                    {id === "approval"
                      ? "Named approval required"
                      : id === "analytics"
                        ? "Results feed the next brief"
                        : "Receipt-driven handoff"}
                  </small>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="concept-learning-loop">
        <span>↶</span> Use results to improve the next brief <span>↵</span>
      </div>
      <div className="concept-cockpit" role="region" aria-label="Selected content cockpit">
        <section className="cockpit-working live-panel">
          <header>
            <div>
              <span className="live-eyebrow">
                {active?.brand || "CONTENT"} /{" "}
                {active ? stageOf(active).replace("scripting", "writing") : "WORKSPACE"}
              </span>
              <h2>{active?.title || "Choose a piece on the line"}</h2>
            </div>
            <button
              onClick={() =>
                active && active.kind !== "library" ? onInspect(active.id) : onLibrary()
              }
            >
              Open details ↗
            </button>
          </header>
          <nav aria-label="Selected content views">
            {["brief", "script", "activity"].map((t) => (
              <button key={t} aria-pressed={detail === t} onClick={() => setDetail(t)}>
                {t}
              </button>
            ))}
          </nav>
          <div className="cockpit-detail">
            {detail === "brief" ? (
              <>
                <p>{active?.detail || "Start with one useful problem for a gym owner."}</p>
                <small>
                  {activeItem?.brief ||
                    activeAsset?.provenance ||
                    "Published source observations are kept separate from new drafts."}
                </small>
              </>
            ) : detail === "script" ? (
              <p>
                {activeItem?.copy ||
                  data.baseline?.posts.find((p) => p.id === active?.id)?.text ||
                  "No script is saved for this piece yet."}
              </p>
            ) : (
              <>
                {activeItem?.activity?.slice(0, 4).map((a, i) => (
                  <p key={i}>
                    <b>{a.name}</b> · {a.action.replaceAll("_", " ")}{" "}
                    <time>{new Date(a.at).toLocaleString()}</time>
                  </p>
                ))}
                {!activeItem?.activity?.length && (
                  <p>
                    {active?.stage === "published"
                      ? "Verified native post; source is preserved unchanged."
                      : "No editorial changes recorded."}
                  </p>
                )}
              </>
            )}
          </div>
          <footer>
            <span className="cockpit-agent">
              <i data-running={!!activeRun || !!activeJob} />
              {activeRun
                ? "Muninn · " + activeRun.step + " " + activeRun.status
                : activeJob
                  ? "Production · " + activeJob.mode
                  : activeItem?.stage === "approval"
                    ? "Waiting for Quan or Cody"
                    : "Ready for your direction"}
            </span>
            <button onClick={onLibrary}>Steer / automation</button>
          </footer>
        </section>
        <section className="cockpit-review live-panel">
          <span className="live-eyebrow">HUMAN IN THE LOOP</span>
          <h2>
            {active?.stage === "published"
              ? "Published source"
              : activeItem?.stage === "approval"
                ? "Ready for review"
                : "Approval checkpoint"}
          </h2>
          <p>
            {active?.stage === "published"
              ? "Preserved native post. New edits become a separate draft."
              : "Quan or Cody approves the exact final version."}
          </p>
          <div className="review-checklist">
            <span data-done={!!activeAsset}>
              Final video <b>{activeAsset ? "✓" : "Pending"}</b>
            </span>
            <span data-done={!!activeItem?.copy}>
              Post copy{" "}
              <b>
                {activeItem?.copy ? "✓" : active?.stage === "published" ? "Published" : "Pending"}
              </b>
            </span>
            <span data-done={!!activeItem?.approval}>
              Human approval{" "}
              <b>
                {active?.stage === "published"
                  ? "Historical source"
                  : activeItem?.approval?.name || "Required"}
              </b>
            </span>
          </div>
          <button
            className="live-primary"
            disabled={!activeItem}
            onClick={() => activeItem && onInspect(activeItem.id)}
          >
            {active?.stage === "published" ? "Source already published" : "Review this version"}
          </button>
          <small>Edits after approval require review again.</small>
        </section>
        <section className="cockpit-analytics live-panel">
          <span className="live-eyebrow">MEASURE & LEARN</span>
          <h2>Performance</h2>
          <div className="cockpit-counters">
            <div>
              <b>{observation?.metrics["reactions"] ?? "—"}</b>
              <small>Selected post reactions</small>
            </div>
            <div>
              <b>{ops?.analytics?.["all"]?.observedPosts ?? "—"}</b>
              <small>Observed posts</small>
            </div>
          </div>
          <div className="cockpit-platforms">
            {ops?.analytics?.["all"]?.platforms.map((p) => (
              <p key={p.platform}>
                <span>{p.platform}</span>
                <b>{p.metrics["reactions"]?.sum ?? "—"}</b>
                <small>{p.posts} posts</small>
              </p>
            ))}
          </div>
          <small>
            Unknown metrics stay unavailable. Cross-platform totals are not unique reach.
          </small>
          <button onClick={onLibrary}>Platform breakdown ↗</button>
        </section>
      </div>
    </section>
  );
}
