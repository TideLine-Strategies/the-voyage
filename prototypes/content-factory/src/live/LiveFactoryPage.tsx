import { MediaLoop } from "./MediaLoop";
import { StationBoard } from "./StationBoard";
import { OperationsPanel, type Asset, type State } from "./OperationsPanel";
import { useEffect, useState, useRef } from "react";
type Source = {
  id: string;
  title: string;
  url: string;
  kind: string;
  learning: string;
  engagement: Record<string, number | string> | null;
  checkedAt: string;
  limitation: string;
};
type Brief = {
  id: string;
  title: string;
  category: string;
  product: string;
  audience: string;
  pain: string;
  value: string;
  evidenceNeeded: string;
  sourceIds: string[];
  status: string;
};
export type Item = {
  production?: {
    captureAssetId?: string;
    finalAssetId?: string;
    campaignId?: string;
    steps?: Record<string, unknown>;
  };
  id: string;
  revision: number;
  title: string;
  brand: string;
  product: string;
  audience: string;
  pain: string;
  value: string;
  brief: string;
  copy: string;
  format: string;
  stage: string;
  sourceUrls: string[];
  mediaUrl: string;
  mediaAssetId: string;
  mediaRightsVerified?: boolean;
  mediaProfileUrl?: string;
  cta: string;
  accountId: string;
  approval?: { name: string; at: number } | null;
  approvalStale?: boolean;
  changeRequest?: string;
  activity?: { at: number; name: string; action: string }[];
};
type Published = {
  id: string;
  title: string;
  text: string;
  url: string;
  publishedAt: string | null;
  observedAt: string;
  reactions: number | null;
  reposts: number | null;
  note: string;
};
export type Data = {
  actor: { id: string; name: string };
  items: Item[];
  baseline: { posts: Published[]; checkedAt: string } | null;
  research: {
    positioning: string;
    mix: string;
    guardrails: string[];
    keywords: Record<string, string[]>;
    sources: Source[];
    briefs: Brief[];
  };
  brands: {
    brand: string;
    stale: boolean;
    snapshot: {
      checkedAt: string;
      campaigns: {
        id: string;
        title: string;
        sourceStatus: string;
        sourceUrl: string | null;
        deliveries: {
          platform: string;
          state: string;
          url: string | null;
          caption: string;
          blockers: string[];
        }[];
      }[];
    } | null;
  }[];
  publishing: { enabled: boolean; reason: string };
  metrics: null;
};
const stages = [
  ["research", "Research"],
  ["scripting", "Scripting"],
  ["filming", "Capture"],
  ["editing", "Editing"],
  ["approval", "Human review"],
  ["posting", "Posting"],
  ["published", "Published"],
] as const;
const blank = (): Item => ({
  id: "",
  revision: 0,
  title: "",
  brand: "tideline",
  product: "WonPlace",
  audience: "Gym owners and front-desk / admin staff",
  pain: "",
  value: "",
  brief: "",
  copy: "",
  format: "",
  stage: "research",
  sourceUrls: [],
  mediaUrl: "",
  mediaAssetId: "",
  cta: "",
  accountId: "",
});
async function api(body?: unknown) {
  const r = await fetch("/api/content-factory", {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    ...(body
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "Content is unavailable");
  return value;
}
export function LiveFactoryPage() {
  const [campaignLink, setCampaignLink] = useState("");
  const [pane, setPane] = useState("line");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [ops, setOps] = useState<State | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [data, setData] = useState<Data | null>(null),
    [message, setMessage] = useState("Reading your content…"),
    [brand, setBrand] = useState("all"),
    [selected, setSelected] = useState(""),
    [draft, setDraft] = useState<Item | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("brief"),
    [note, setNote] = useState("");
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const refresh = async () => {
    try {
      const value: Data = await api();
      setData(value);
      setSelected((current) => current || value.baseline?.posts[0]?.id || "");
      setMessage("Saved in Voyage · current editor: " + value.actor.name);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    }, 60000);
    try {
      const theme = localStorage.getItem("voyage-theme");
      if (theme) document.documentElement.dataset["theme"] = theme;
    } catch {}
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  useEffect(() => {
    if (dirty || !draft?.id) return;
    const current = data?.items.find((i) => i.id === draft.id);
    if (current && current.revision !== draft.revision) setDraft(current);
  }, [data, dirty, draft?.id, draft?.revision]);
  useEffect(() => {
    if (!inspectorOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.getElementById("inspector");
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href]") || [],
      ).filter((e) => !e.hasAttribute("disabled") && e.getClientRects().length > 0);
    controls()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!dirtyRef.current || window.confirm("Discard your unsaved edits?"))
          setInspectorOpen(false);
      }
      if (e.key === "Tab") {
        const list = controls(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [inspectorOpen]);
  const posts = data?.baseline?.posts || [];
  const cards = [
    ...(data?.items || [])
      .filter((x) => brand === "all" || x.brand === brand)
      .map((x) => ({
        id: x.id,
        title: x.title,
        stage: x.stage,
        brand: x.brand,
        detail: x.value || x.pain,
        kind: "item",
      })),
    ...(brand === "wonplace"
      ? []
      : posts.map((x) => ({
          id: x.id,
          title: x.title,
          stage: "published",
          brand: "tideline",
          detail: x.text,
          kind: "published",
        }))),
  ];
  const published = posts.find((p) => p.id === selected);
  const activeIndex = Math.max(
    0,
    cards.findIndex((x) => x.id === selected),
  );
  const mayLeave = () => !dirty || window.confirm("Discard your unsaved edits?");
  function choose(id: string) {
    if (!mayLeave()) return;
    setInspectorOpen(true);
    setSelected(id);
    setDraft(data?.items.find((i) => i.id === id) || null);
    setDirty(false);
    setNote("");
  }
  function newItem(brief?: Brief) {
    if (!mayLeave()) return;
    setInspectorOpen(true);
    setSelected("new");
    setDraft({
      ...blank(),
      ...(brief
        ? {
            title: brief.title,
            product: brief.product,
            audience: brief.audience,
            pain: brief.pain,
            value: brief.value,
            brief: brief.evidenceNeeded,
            sourceUrls: brief.sourceIds.map(
              (id) => data!.research.sources.find((s) => s.id === id)!.url,
            ),
          }
        : {}),
    });
    setDirty(true);
    setTab("brief");
    document.getElementById("inspector")?.scrollIntoView({ behavior: "smooth" });
  }
  function edit(key: keyof Item, value: unknown) {
    setDraft((old) => (old ? { ...old, [key]: value } : old));
    setDirty(true);
  }
  async function command(action: string) {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const saved: Item = await api({
        action,
        ...(draft.id ? { id: draft.id, revision: draft.revision } : {}),
        ...(action === "save" ? { item: draft } : {}),
        ...(action === "request_changes" ? { note } : {}),
      });
      setDraft(saved);
      setSelected(saved.id);
      setDirty(false);
      setNote("");
      await refresh();
      setMessage(
        action === "approve"
          ? "Approval recorded for this exact saved package. No post was sent."
          : "Saved to Voyage.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = (key: keyof Item, label: string, multiline = false) => (
    <label className="live-field" key={key}>
      {label}
      {multiline ? (
        <textarea
          value={String(draft?.[key] || "")}
          onChange={(e) => edit(key, e.target.value)}
          rows={key === "copy" ? 12 : 3}
        />
      ) : (
        <input value={String(draft?.[key] || "")} onChange={(e) => edit(key, e.target.value)} />
      )}
    </label>
  );
  return (
    <div className="live-shell">
      <aside className="live-sidebar">
        <a className="live-logo" href="/">
          <i className="factory-voyage-mark" />
          <span>Voyage</span>
        </a>
        <nav aria-label="Workspace">
          <a href="/">Workspace</a>
          <a href="/?view=accounts">Accounts</a>
          <a aria-current="page" href="/factory/">
            Content
          </a>
          <a href="/?view=company">Company</a>
        </nav>
        <small>
          TideLine Strategies
          <br />
          Gym operations first.
          <br />
          Real evidence, useful content.
        </small>
      </aside>
      <main className="live-main">
        <header className="live-header">
          <div>
            <span className="live-eyebrow">TIDELINE / CONTENT OPERATIONS</span>
            <h1>Content factory.</h1>
            <p>Help gym owners solve the work around the class.</p>
          </div>
          <div>
            <button
              onClick={() => {
                if (mayLeave()) {
                  setDirty(false);
                  setDraft(null);
                  void refresh();
                }
              }}
            >
              Refresh sources
            </button>
            <button className="live-primary" disabled={!data} onClick={() => newItem()}>
              New brief
            </button>
          </div>
        </header>
        <div className="live-status" role="status">
          {message}
        </div>
        {!data ? (
          <section className="live-panel">
            <p>Content requires your approved TideLine sign-in.</p>
            <a href="/login">Sign in</a>
          </section>
        ) : (
          <>
            <div className="live-toolbar">
              <div role="group" aria-label="Brand filter">
                {["all", "tideline", "wonplace"].map((b) => (
                  <button
                    key={b}
                    aria-pressed={brand === b}
                    onClick={() => {
                      if (mayLeave()) {
                        setBrand(b);
                        setSelected("");
                        setDraft(null);
                        setDirty(false);
                      }
                    }}
                  >
                    {b === "all" ? "Both brands" : b === "tideline" ? "TideLine" : "WonPlace"}
                  </button>
                ))}
              </div>
              <label className="live-selector">
                Select content
                <select
                  aria-label="Select content"
                  value={selected}
                  onChange={(e) => choose(e.target.value)}
                >
                  <option value="">Choose a record</option>
                  {cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                {cards.length} real records · {data.items.length} editorial items
              </span>
            </div>
            <nav className="factory-dock" aria-label="Content controls">
              {[
                ["line", "Assembly line"],
                ["research", "Ideas"],
                ["operations", "Automation & media"],
                ["deliveries", "Publishing"],
                ["sources", "Source library"],
              ].map(([id, label]) => (
                <button key={id} aria-pressed={pane === id} onClick={() => setPane(id!)}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="factory-pane" hidden={pane !== "line"}>
              <StationBoard
                cards={cards}
                data={data}
                ops={ops}
                assets={assets.filter((a) => brand === "all" || a.brand === brand)}
                selected={selected}
                onSelect={choose}
                onNew={() => newItem()}
                onLibrary={() => setPane("operations")}
              />
            </div>
            <section
              id="inspector"
              className="live-panel factory-inspector"
              role="dialog"
              aria-modal="true"
              aria-label="Content details"
              hidden={!inspectorOpen}
            >
              <header className="factory-inspector-bar">
                <strong>Content details</strong>
                <button
                  onClick={() => {
                    if (mayLeave()) setInspectorOpen(false);
                  }}
                  aria-label="Close content details"
                >
                  Close ×
                </button>
              </header>
              {published ? (
                <>
                  <span className="live-eyebrow">
                    PUBLISHED LINKEDIN BASELINE · TIDELINE → WONPLACE
                  </span>
                  <h2>{published.title}</h2>
                  <pre>{published.text}</pre>
                  {assets
                    .filter(
                      (a) =>
                        a.postId === published.id &&
                        a.kind === "original" &&
                        a.mime === "video/mp4",
                    )
                    .map((a) => (
                      <div key={a.id}>
                        <MediaLoop
                          controls
                          autoPlay
                          muted
                          loop
                          preload="metadata"
                          playsInline
                          src={"/api/content-media/" + a.id}
                          style={{ width: "100%", maxWidth: 850, borderRadius: 12 }}
                        />
                        <p className="live-muted">{a.provenance}</p>
                      </div>
                    ))}
                  <a href={published.url} target="_blank" rel="noreferrer">
                    Open the actual LinkedIn post ↗
                  </a>
                  <p className="live-muted">
                    Observed {published.observedAt}. {published.note} These are source posts, not
                    new AI drafts.
                  </p>
                </>
              ) : draft ? (
                <>
                  <div className="live-panel-head">
                    <div>
                      <span className="live-eyebrow">
                        {draft.id ? "SAVED EDITORIAL WORK" : "NEW BRIEF"} ·{" "}
                        {dirty ? "UNSAVED CHANGES" : "UP TO DATE"}
                      </span>
                      <h2>{draft.title || "New content brief"}</h2>
                      {draft.id && (
                        <a
                          href={"/?view=content&contentItem=" + encodeURIComponent(draft.id)}
                          onClick={(e) => {
                            if (!mayLeave()) e.preventDefault();
                          }}
                        >
                          Ask Muninn about this item ↗
                        </a>
                      )}
                    </div>
                    <button
                      className="live-primary"
                      disabled={busy || !dirty}
                      onClick={() => void command("save")}
                    >
                      Save changes
                    </button>
                  </div>
                  <div className="live-tabs" role="tablist">
                    {["brief", "copy", "review"].map((t) => (
                      <button
                        role="tab"
                        aria-selected={tab === t}
                        key={t}
                        onClick={() => setTab(t)}
                      >
                        {t === "brief"
                          ? "Brief & evidence"
                          : t === "copy"
                            ? "Post & media"
                            : "Human review"}
                      </button>
                    ))}
                  </div>
                  {tab === "brief" ? (
                    <div className="live-form">
                      {field("title", "Title")}
                      <label className="live-field">
                        Publishing brand
                        <select
                          aria-label="Publishing brand"
                          value={draft.brand}
                          onChange={(e) => edit("brand", e.target.value)}
                        >
                          <option value="tideline">TideLine</option>
                          <option value="wonplace">WonPlace</option>
                        </select>
                      </label>
                      {field("product", "Product or service")}
                      {field("audience", "Who this helps")}
                      {field("pain", "Specific operating problem", true)}
                      {field("value", "What they can use immediately", true)}
                      {field("brief", "Evidence or recording needed", true)}
                      <label className="live-field">
                        Evidence URLs (one per line)
                        <textarea
                          value={draft.sourceUrls.join("\n")}
                          onChange={(e) =>
                            edit("sourceUrls", e.target.value.split("\n").filter(Boolean))
                          }
                        />
                      </label>
                      <label className="live-field">
                        Stage
                        <select
                          aria-label="Stage"
                          value={draft.stage}
                          onChange={(e) => edit("stage", e.target.value)}
                        >
                          {stages
                            .filter(([id]) => id !== "published")
                            .map(([id, l]) => (
                              <option key={id} value={id}>
                                {l}
                              </option>
                            ))}
                        </select>
                      </label>
                      {field("accountId", "Related CRM account ID (optional)")}
                    </div>
                  ) : tab === "copy" ? (
                    <>
                      {field("format", "Format")}
                      {field("copy", "Final post copy — written and reviewed by your team", true)}
                      <label className="live-field">
                        Verified publisher-branded footage
                        <select
                          aria-label="Verified footage"
                          value={draft.mediaAssetId || ""}
                          onChange={(e) => edit("mediaAssetId", e.target.value)}
                        >
                          <option value="">Choose verified footage</option>
                          {assets
                            .filter((a) => a.kind === "branded" && a.brand === draft.brand)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      {draft.mediaAssetId && (
                        <MediaLoop
                          controls
                          autoPlay
                          muted
                          loop
                          preload="metadata"
                          src={"/api/content-media/" + draft.mediaAssetId}
                          style={{ width: "100%", maxWidth: 800 }}
                        />
                      )}
                      {field("mediaUrl", "Real media or recording URL")}
                      {field("cta", "Useful next step / call to action", true)}
                      <p className="live-muted">
                        No generated copy, scenes, people or product screens are prefilled. Use real
                        approved recordings and redact family information.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Review the saved text, evidence, media and next step together. Approval
                        records your signed-in identity, becomes stale when the package changes, and
                        queues the exact saved package for native publication.
                      </p>
                      {draft.approval ? (
                        <p className="live-success">
                          Approved by {draft.approval.name} ·{" "}
                          {new Date(draft.approval.at).toLocaleString()}
                        </p>
                      ) : (
                        <p>
                          {draft.approvalStale
                            ? "Previous approval is stale."
                            : "This package has not been approved."}
                        </p>
                      )}
                      <button
                        disabled={
                          busy ||
                          dirty ||
                          !draft.id ||
                          draft.stage !== "approval" ||
                          !draft.copy ||
                          !draft.value ||
                          !draft.cta ||
                          !draft.sourceUrls.length ||
                          !draft.product ||
                          (Boolean(draft.mediaAssetId) && !draft.mediaRightsVerified)
                        }
                        onClick={() => void command("approve")}
                      >
                        Approve saved package
                      </button>
                      <label className="live-field">
                        Request changes
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
                      </label>
                      <button
                        disabled={busy || dirty || !note.trim() || !draft.id}
                        onClick={() => void command("request_changes")}
                      >
                        Send back with note
                      </button>
                      {draft.changeRequest && <p>Change request: {draft.changeRequest}</p>}
                      <label className="live-field">
                        Existing publisher campaign
                        <select
                          value={campaignLink}
                          onChange={(e) => setCampaignLink(e.target.value)}
                        >
                          <option value="">Select a real campaign</option>
                          {data.brands
                            .find((b) => b.brand === draft.brand)
                            ?.snapshot?.campaigns.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.title}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        disabled={dirty || busy || !draft.id || !campaignLink}
                        onClick={async () => {
                          try {
                            const saved = await api({
                              action: "link_campaign",
                              id: draft.id,
                              revision: draft.revision,
                              campaignId: campaignLink,
                            });
                            setDraft(saved);
                            setMessage("Linked to the existing publisher campaign.");
                            await refresh();
                          } catch (e) {
                            setMessage((e as Error).message);
                          }
                        }}
                      >
                        Link saved campaign
                      </button>
                      <p className="live-muted">{data.publishing.reason}</p>
                      {draft.activity?.map((a, i) => (
                        <p className="live-muted" key={i}>
                          {a.name} · {a.action} · {new Date(a.at).toLocaleString()}
                        </p>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <>
                  <h2>Select a post or create a brief.</h2>
                  <p>
                    Published sources stay unchanged. Research becomes a working brief only when you
                    choose it.
                  </p>
                </>
              )}
            </section>
            <div className="factory-pane" hidden={pane !== "operations"}>
              <OperationsPanel
                itemId={draft?.id || ""}
                onMedia={setAssets}
                onState={setOps}
                brand={brand}
                onAttach={async (assetId) => {
                  if (!draft?.id || dirty) {
                    setMessage("Save the selected item before attaching footage.");
                    return;
                  }
                  try {
                    const value = await api({
                      action: "attach_media",
                      id: draft.id,
                      revision: draft.revision,
                      assetId,
                    });
                    setDraft(value);
                    setMessage("Verified footage attached; card advanced.");
                    await refresh();
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              />
            </div>
            <div className="live-columns factory-pane" hidden={pane !== "deliveries"}>
              <section className="live-panel">
                <span className="live-eyebrow">STRATEGY / CURRENT PRIORITY</span>
                <h2>Useful before promotional.</h2>
                <p>{data.research.positioning}</p>
                <p>{data.research.mix}</p>
                <ul>
                  {data.research.guardrails.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <h3>Ready-to-use worksheets</h3>
                <p>
                  <a href="/factory-tools/front-desk-handoff.csv" download>
                    Front-desk handoff &amp; question audit
                  </a>
                  <br />
                  <a href="/factory-tools/parent-update.txt" download>
                    Coach-to-parent update worksheet
                  </a>
                  <br />
                  <a href="/factory-tools/trial-follow-up.csv" download>
                    Trial-family follow-up tracker
                  </a>
                </p>
                <p className="live-muted">
                  Blank operational tools you can use today. Store completed family records in your
                  approved system.
                </p>
                <h3>Search language</h3>
                {Object.entries(data.research.keywords).map(([k, v]) => (
                  <details key={k}>
                    <summary>
                      {k === "gymOwners"
                        ? "Gym owners"
                        : k === "adminStaff"
                          ? "Admin staff"
                          : "Future partners"}
                    </summary>
                    <p>{v.join(" · ")}</p>
                  </details>
                ))}
              </section>
              <section className="live-panel">
                <span className="live-eyebrow">MEASUREMENT / ACTUAL EVIDENCE</span>
                <h2>Build the baseline.</h2>
                <p>
                  {posts.length} verified source posts. Reach, saves, watch time and attributed
                  revenue are unavailable until measured.
                </p>
                <p>
                  Measure useful conversations, requested walkthroughs and accounts with an agreed
                  next step. Reactions and followers are not leads.
                </p>
                <a href="/?view=accounts">Open Accounts and record a real next step ↗</a>
                <h3>Current publishing queue</h3>
                {data.brands.map((b) => (
                  <details key={b.brand}>
                    <summary>
                      {b.brand === "wonplace" ? "WonPlace" : "TideLine"} ·{" "}
                      {b.stale ? "source needs refresh" : "source current"}
                    </summary>
                    {b.snapshot ? (
                      b.snapshot.campaigns.map((c, i) => (
                        <div key={i}>
                          <b>{c.title}</b>
                          <p>
                            Queue snapshot: {c.sourceStatus}. LinkedIn baseline above is
                            independently observed.
                          </p>
                          {c.deliveries.map((d, j) => (
                            <p key={j}>
                              {d.platform} · {d.state}
                              {d.url && (
                                <>
                                  {" "}
                                  ·{" "}
                                  <a href={d.url} target="_blank" rel="noreferrer">
                                    Receipt
                                  </a>
                                </>
                              )}
                            </p>
                          ))}
                        </div>
                      ))
                    ) : (
                      <p>No snapshot imported.</p>
                    )}
                  </details>
                ))}
              </section>
            </div>
            <section className="live-panel factory-pane" hidden={pane !== "research"}>
              <span className="live-eyebrow">RESEARCH / EDUCATIONAL + MARKETING</span>
              <h2>Ideas grounded in real problems.</h2>
              <p>These are research directions, not prewritten posts or customer claims.</p>
              <div className="live-research-grid">
                {data.research.briefs.map((b) => (
                  <article className="live-research-card" key={b.id}>
                    <small>
                      {b.category} · {b.product}
                    </small>
                    <h3>{b.title}</h3>
                    <p>{b.pain}</p>
                    <b>Give them this now</b>
                    <p>{b.value}</p>
                    <details>
                      <summary>Evidence needed</summary>
                      <p>{b.evidenceNeeded}</p>
                    </details>
                    <button onClick={() => newItem(b)}>Start this brief</button>
                  </article>
                ))}
              </div>
            </section>
            <section className="live-panel factory-pane" hidden={pane !== "sources"}>
              <span className="live-eyebrow">SOURCE LIBRARY / VERIFIED LINKS</span>
              <h2>What to learn from.</h2>
              <p>
                High reach, useful education and relevant industry research are different signals.
                Counts are dated snapshots; results do not transfer automatically to TideLine.
              </p>
              <div className="live-research-grid">
                {data.research.sources.map((s) => (
                  <article className="live-research-card" key={s.id}>
                    <small>{s.kind}</small>
                    <h3>
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title} ↗
                      </a>
                    </h3>
                    <p>{s.learning}</p>
                    {s.engagement ? (
                      <p>
                        {Object.entries(s.engagement)
                          .filter(([k]) => k !== "basis")
                          .map(([k, v]) => `${Number(v).toLocaleString()} ${k}`)
                          .join(" · ")}
                        <br />
                        <small>{s.engagement["basis"]}</small>
                      </p>
                    ) : (
                      <p className="live-muted">Engagement unavailable · relevance example</p>
                    )}
                    <small>
                      Checked {s.checkedAt}. {s.limitation}
                    </small>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
