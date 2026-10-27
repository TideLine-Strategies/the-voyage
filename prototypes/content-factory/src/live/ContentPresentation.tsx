import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
export type PresentedContent = {
  id: string;
  title: string;
  brand: string;
  stage: string;
  copy: string;
  detail: string;
  brief: string;
  src?: string;
  poster?: string;
  provenance?: string;
  sourceUrls: string[];
  editable: boolean;
};
function HudIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = {
    heart:
      "M20.8 4.6c-2-2-5.1-1.8-6.8.3L12 7.3 10 5C8.3 2.8 5.2 2.6 3.2 4.6c-2.1 2-2.1 5.3 0 7.4L12 21l8.8-9c2.1-2.1 2.1-5.4 0-7.4Z",
    comment: "M21 11a9 9 0 0 1-9 9H4l-2 2v-9a9 9 0 1 1 19-2Z",
    bookmark: "M6 3h12v18l-6-4-6 4Z",
    share: "m14 4 8 7-8 7v-4c-5 0-8 2-12 6 1-8 4-12 12-12Z",
    search: "M20 20l-5-5m2-6a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={paths[kind]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function ContentPresentation({
  content,
  onClose,
  onDetails,
}: {
  content: PresentedContent;
  onClose: () => void;
  onDetails: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    heading = useId();
  const [hud, setHud] = useState(true),
    [playing, setPlaying] = useState(true),
    [muted, setMuted] = useState(true),
    [duration, setDuration] = useState(0),
    [time, setTime] = useState(0),
    [landscape, setLandscape] = useState(false),
    [error, setError] = useState(false);
  useEffect(() => {
    const old = document.activeElement as HTMLElement | null,
      root = document.querySelector<HTMLElement>(".live-shell"),
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (root) root.inert = true;
    document.dispatchEvent(new CustomEvent("factory-presentation", { detail: { open: true } }));
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const controls = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>("button,a[href],input") || [],
        ).filter((e) => !e.hasAttribute("disabled") && e.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
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
      document.body.style.overflow = overflow;
      if (root) root.inert = false;
      document.dispatchEvent(new CustomEvent("factory-presentation", { detail: { open: false } }));
      const previous =
        Array.from(document.querySelectorAll<HTMLButtonElement>("button[aria-label]")).find(
          (button) =>
            button.getAttribute("aria-label") === "Present " + content.title &&
            button.getClientRects().length > 0,
        ) || (old?.isConnected ? old : null);
      requestAnimationFrame(() => {
        if (!document.querySelector('[role="dialog"]:not([hidden])'))
          previous?.focus({ preventScroll: true });
      });
    };
  }, []);
  const clock = (s: number) =>
    Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  return createPortal(
    <div
      className="presentation-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="content-presentation"
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
      >
        <header className="presentation-header">
          <div>
            <span className="live-eyebrow">
              {content.brand} / {content.stage.replaceAll("_", " ")}
            </span>
            <h2 id={heading}>{content.title}</h2>
          </div>
          <button aria-label="Close content preview" onClick={onClose}>
            Close ×
          </button>
        </header>
        <div className="presentation-workspace">
          <section className="presentation-screen" aria-label="Full content preview">
            <div className="presentation-phone">
              <div className="presentation-footage">
                {content.src && !error ? (
                  <video
                    ref={video}
                    src={content.src}
                    poster={content.poster}
                    autoPlay
                    muted={muted}
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={content.title + " full preview"}
                    onLoadedMetadata={(e) => {
                      setDuration(e.currentTarget.duration);
                      setLandscape(e.currentTarget.videoWidth > e.currentTarget.videoHeight);
                    }}
                    onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onError={() => setError(true)}
                  />
                ) : content.poster ? (
                  <img src={content.poster} alt={content.title + " thumbnail"} />
                ) : (
                  <div className="presentation-draft">
                    <span>
                      {error
                        ? "VIDEO UNAVAILABLE"
                        : content.stage === "published"
                          ? "NO LOCAL PREVIEW"
                          : "NOT FILMED YET"}
                    </span>
                    <h3>{content.title}</h3>
                    <p>{content.copy || content.detail || content.brief}</p>
                    <small>
                      {error
                        ? "The stored video could not load. Details and source links are available alongside."
                        : content.stage === "published"
                          ? "Published source has not been imported. Use the native post link alongside."
                          : "Draft / planning preview · no finished footage claimed"}
                    </small>
                  </div>
                )}
              </div>
              {hud && (
                <div className="tiktok-hud" aria-label="TikTok HUD wireframe">
                  <div className="hud-status">
                    <span>9:41</span>
                    <span>◔ ▰</span>
                  </div>
                  <div className="hud-top">
                    <span>LIVE</span>
                    <span>Following</span>
                    <b>For You</b>
                    <HudIcon kind="search" />
                  </div>
                  <div className="hud-rail">
                    <div className="hud-avatar">
                      {content.brand === "wonplace" ? "W" : "T"}
                      <i>+</i>
                    </div>
                    {["heart", "comment", "bookmark", "share"].map((kind) => (
                      <div key={kind}>
                        <HudIcon kind={kind} />
                        <small>—</small>
                      </div>
                    ))}
                    <div className="hud-record">♪</div>
                  </div>
                  <div className="hud-caption">
                    <b>{content.brand === "wonplace" ? "WonPlace" : "TideLine"}</b>
                    <p>{content.copy || content.title}</p>
                    <small>♫ Audio preview</small>
                  </div>
                  <div className="hud-bottom">
                    <span>
                      ⌂<small>Home</small>
                    </span>
                    <span>
                      ⌕<small>Discover</small>
                    </span>
                    <span className="hud-create">＋</span>
                    <span>
                      □<small>Inbox</small>
                    </span>
                    <span>
                      ♙<small>Profile</small>
                    </span>
                  </div>
                  <div className="hud-home-indicator" />
                </div>
              )}
            </div>
            <div className="presentation-transport">
              {content.src && !error && (
                <>
                  <button
                    onClick={() => {
                      const v = video.current;
                      if (!v) return;
                      if (v.paused) void v.play().catch(() => {});
                      else v.pause();
                    }}
                    aria-label={playing ? "Pause preview" : "Play preview"}
                  >
                    {playing ? "Ⅱ" : "▶"}
                  </button>
                  <input
                    aria-label="Preview position"
                    type="range"
                    min="0"
                    max={duration || 1}
                    step="0.1"
                    value={Math.min(time, duration || 1)}
                    onChange={(e) => {
                      if (video.current) video.current.currentTime = Number(e.target.value);
                    }}
                  />
                  <small>
                    {clock(time)} / {clock(duration)}
                  </small>
                  <button
                    onClick={() => setMuted(!muted)}
                    aria-label={muted ? "Unmute preview" : "Mute preview"}
                  >
                    {muted ? "Sound off" : "Sound on"}
                  </button>
                </>
              )}
              <button aria-pressed={hud} onClick={() => setHud(!hud)}>
                {hud ? "Hide TikTok HUD" : "Show TikTok HUD"}
              </button>
            </div>
            <small className="presentation-disclaimer">
              TikTok layout wireframe · illustrative controls, no engagement data.
              {landscape ? " Landscape source fitted inside 9:16; no crop applied." : ""}
            </small>
          </section>
          <aside className="presentation-details">
            <span className="live-eyebrow">CONTENT DETAILS</span>
            <h3>{content.title}</h3>
            <dl>
              <div>
                <dt>Brand</dt>
                <dd>{content.brand === "wonplace" ? "WonPlace" : "TideLine"}</dd>
              </div>
              <div>
                <dt>Stage</dt>
                <dd>{content.stage}</dd>
              </div>
            </dl>
            {content.detail && (
              <section>
                <h4>Purpose</h4>
                <p>{content.detail}</p>
              </section>
            )}
            {content.copy && (
              <section>
                <h4>Post copy</h4>
                <p>{content.copy}</p>
              </section>
            )}
            {content.brief && (
              <details>
                <summary>Brief & production notes</summary>
                <p>{content.brief}</p>
              </details>
            )}
            {content.provenance && (
              <details>
                <summary>Media provenance</summary>
                <p>{content.provenance}</p>
              </details>
            )}
            {!!content.sourceUrls.length && (
              <details>
                <summary>Sources & native posts</summary>
                {content.sourceUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {url} ↗
                  </a>
                ))}
              </details>
            )}
            <button onClick={onDetails}>
              {content.editable ? "Edit / review this version" : "Open source details"}
            </button>
            <p className="presentation-gate">This preview does not approve or publish content.</p>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
