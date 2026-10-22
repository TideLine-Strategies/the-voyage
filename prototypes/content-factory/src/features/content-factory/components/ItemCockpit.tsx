import {
  Bot,
  Clock,
  Film,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Undo2,
  UploadCloud,
  User,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { BRANDS, FUNNEL, PLATFORMS, STAGES, stageLabel } from "../constants";
import { IMAGES } from "../images";
import { uid } from "../logic/gate";
import { useFactory } from "../store";
import type { ContentItem, Platform } from "../types";
import { actorName, BrandChip, DemoTag, Progress, relTime, STAGE_TEXT, StageDot } from "./bits";

const CAPTION_FMT: Record<Platform, { max: number; fmt: string }> = {
  linkedin: { max: 3000, fmt: "Feed video · 9:16 → 4:5 crop" },
  facebook: { max: 2200, fmt: "Reel · 9:16" },
  instagram: { max: 2200, fmt: "Reel · 9:16 · cover from thumbnail" },
  youtube: { max: 100, fmt: "Short · title ≤100 chars" },
  tiktok: { max: 2200, fmt: "9:16 · sound on" },
  x: { max: 280, fmt: "Video post · ≤280 chars" },
};

export function ItemCockpit() {
  const { selected: item, state, actions, resetKey } = useFactory();
  if (!item)
    return <div className="panel p-6 text-muted-foreground">No items for this brand yet.</div>;
  return (
    <Cockpit
      key={`${item.id}:${resetKey}`}
      item={item}
      user={state.currentUser}
      factoryPaused={state.factoryPaused}
      actions={actions}
    />
  );
}

function Cockpit({
  item,
  user,
  factoryPaused,
  actions,
}: {
  item: ContentItem;
  user: "you" | "cody";
  factoryPaused: boolean;
  actions: ReturnType<typeof useFactory>["actions"];
}) {
  const [tab, setTab] = useState("brief");
  const [direction, setDirection] = useState("");
  const [composer, setComposer] = useState(false);
  // Keep drafts only for editable text fields
  const [text, setText] = useState({
    hook: item.hook,
    script: item.script,
    brief: item.brief,
    schedule: item.schedule,
    captions: item.captions,
  });
  const dirty =
    text.hook !== item.hook ||
    text.script !== item.script ||
    text.brief !== item.brief ||
    text.schedule !== item.schedule ||
    PLATFORMS.some((p) => text.captions[p.id] !== item.captions[p.id]);
  useEffect(() => {
    actions.setDraftDirty(item.id, dirty);
  }, [dirty, item.id, actions]);
  useEffect(() => () => actions.setDraftDirty(item.id, false), [item.id, actions]);
  const save = () =>
    actions.edit(item.id, {
      hook: text.hook,
      script: text.script,
      brief: text.brief,
      schedule: text.schedule,
      captions: text.captions,
    });
  const discard = () =>
    setText({
      hook: item.hook,
      script: item.script,
      brief: item.brief,
      schedule: item.schedule,
      captions: item.captions,
    });
  const autonomous = item.stage !== "approval";

  return (
    <div className="panel flex min-w-0 flex-col p-4 sm:p-5">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-4">
        <img
          src={IMAGES[item.thumbnail]}
          alt=""
          className="aspect-[9/16] w-16 rounded-lg object-cover sm:w-20"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <BrandChip brand={item.brand} />
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {item.campaign}
            </span>
            {item.provenance && (
              <span className="rounded-md bg-stage-analytics/10 px-2 py-0.5 text-[11px] font-medium text-stage-analytics">
                From insight
              </span>
            )}
          </div>
          <h2 className="mt-1 truncate text-2xl font-bold tracking-tight">{item.title}</h2>
          {item.subtitle && <p className="text-sm text-muted-foreground">{item.subtitle}</p>}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Vertical 9:16</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              0:{item.versions.find((v) => v.id === item.selectedVersionId)?.duration ?? "—"}
            </span>
            <span>{item.goal}</span>
            <span>rev {item.revision}</span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <StageDot stage={item.stage} className="size-4 text-[9px]" />
              <span className="hidden sm:inline">{stageLabel(item.stage)}</span>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to stage (gate enforced)</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STAGES.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => actions.move(item.id, s.id)}
                disabled={s.id === item.stage}
              >
                <StageDot stage={s.id} className="mr-1 size-4 text-[9px]" /> {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Muninn active task */}
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border bg-secondary/50 p-3">
            <div className="flex items-center gap-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-ink-foreground">
                <Bot className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Muninn ·{" "}
                  {autonomous
                    ? factoryPaused
                      ? "factory paused"
                      : item.paused
                        ? "paused"
                        : item.replanning
                          ? "replanning"
                          : "working"
                    : "waiting on a human"}
                  {autonomous && !factoryPaused && !item.paused && (
                    <span className="live-dot size-1.5 rounded-full bg-success" />
                  )}
                  <DemoTag>SIMULATED</DemoTag>
                </div>
                <div className="truncate text-sm font-semibold">{item.task}</div>
              </div>
            </div>
            <Progress value={item.progress} className="mt-3" />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{stageLabel(item.stage)}</span>
              <span>{Math.round(item.progress * 100)}%</span>
            </div>
            <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{item.latestUpdate}</p>
            {item.blockers.length > 0 && (
              <div className="mt-2 rounded-md bg-warning-soft px-2 py-1.5 text-xs font-medium text-foreground">
                Blocked: {item.blockers.join(" · ")}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {item.paused ? (
                <Button
                  size="sm"
                  onClick={() => actions.resumeItem(item.id)}
                  disabled={item.replanning}
                >
                  <Play className="size-4" /> Resume
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-primary-soft text-primary hover:bg-primary-soft/70"
                  onClick={() => actions.pauseItem(item.id)}
                  disabled={!autonomous}
                >
                  <Pause className="size-4" /> Pause item
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setComposer((c) => !c)}
                aria-expanded={composer}
              >
                <SlidersHorizontal className="size-4" /> Steer
              </Button>
              <Button size="sm" variant="outline" onClick={() => actions.retry(item.id)}>
                <RotateCcw className="size-4" /> Retry
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => actions.sendBack(item.id)}
                disabled={item.stage === "research"}
              >
                <Undo2 className="size-4" /> Send back
              </Button>
            </div>
          </div>

          {(composer || direction) && (
            <form
              className="rounded-xl border p-2"
              onSubmit={(e) => {
                e.preventDefault();
                actions.steer(item.id, direction);
                setDirection("");
              }}
            >
              <Textarea
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
                placeholder="Give direction… e.g. stronger hook, focus on parent update, add text overlay"
                className="min-h-16 resize-none border-0 shadow-none focus-visible:ring-0"
                aria-label="Steering direction"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  As {actorName(user)} · pauses and replans the task
                </span>
                <Button size="sm" type="submit" disabled={!direction.trim()}>
                  <Send className="size-4" /> Send
                </Button>
              </div>
            </form>
          )}

          <div>
            <h3 className="mb-2 text-sm font-bold">Activity trail</h3>
            <ol className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {item.activity.slice(0, 20).map((a) => (
                <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 text-xs">
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full",
                      a.actor === "muninn"
                        ? "bg-ink text-ink-foreground"
                        : a.actor === "system"
                          ? "bg-warning-soft"
                          : "bg-muted",
                    )}
                  >
                    {a.actor === "muninn" ? (
                      <Bot className="size-3" />
                    ) : (
                      <User className="size-3" />
                    )}
                  </span>
                  <span
                    className={cn(
                      a.kind === "gate" && "font-semibold text-destructive",
                      a.kind === "steer" && "font-medium",
                    )}
                  >
                    <b className="mr-1">{actorName(a.actor)}</b>
                    {a.text}
                  </span>
                  <span className="whitespace-nowrap text-muted-foreground">{relTime(a.at)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="min-w-0">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="brief">Brief</TabsTrigger>
            <TabsTrigger value="script">Script</TabsTrigger>
            <TabsTrigger value="scenes">Scenes ({item.scenes.length})</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
          </TabsList>

          <TabsContent value="brief" className="space-y-3">
            <div className="rounded-xl bg-secondary/60 p-3 text-xs">
              <div className="mb-1 font-bold">{BRANDS[item.brand].label} brand brief</div>
              <p>{BRANDS[item.brand].promise}</p>
              <p className="mt-1 text-muted-foreground">Audience: {BRANDS[item.brand].audience}</p>
              <p className="mt-1 text-muted-foreground">Voice: {BRANDS[item.brand].voice}</p>
              {BRANDS[item.brand].credit && (
                <p className="mt-1 font-medium">Credit line: {BRANDS[item.brand].credit}</p>
              )}
            </div>
            <label className="block text-xs font-semibold">
              Item brief
              <Textarea
                value={text.brief}
                onChange={(e) => setText({ ...text, brief: e.target.value })}
                className="mt-1 min-h-16 text-sm font-normal"
              />
            </label>
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              {FUNNEL.map((f, i) => (
                <span key={f} className="flex items-center gap-1">
                  <span className="rounded bg-muted px-1.5 py-0.5">{f}</span>
                  {i < FUNNEL.length - 1 && "→"}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Followers are audience, never leads. A lead starts at a qualified conversation logged
              on a CRM Account.
            </p>
            <div>
              <div className="mb-1 text-xs font-semibold">Destinations</div>
              <ul className="divide-y rounded-xl border">
                {item.destinations.map((d) => (
                  <li
                    key={d.platform}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <span className="min-w-0">
                      <b>{PLATFORMS.find((p) => p.id === d.platform)!.label}</b>{" "}
                      <span className="text-muted-foreground">· {d.handle}</span>
                      {(d.sourceOnly || !d.configured) && (
                        <span className="block text-[11px] text-warning">
                          {d.sourceOnly
                            ? "Source-only record — never re-posted to itself"
                            : "Not connected — held"}
                        </span>
                      )}
                    </span>
                    <Switch
                      checked={d.enabled}
                      disabled={d.sourceOnly}
                      aria-label={`Include ${d.platform}`}
                      onCheckedChange={(v) =>
                        actions.edit(item.id, {
                          destinations: item.destinations.map((x) =>
                            x.platform === d.platform ? { ...x, enabled: v } : x,
                          ),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
            </div>
            <label className="block text-xs font-semibold">
              Schedule{" "}
              <span className="font-normal text-muted-foreground">
                (demo time, not a provider booking)
              </span>
              <Input
                type="datetime-local"
                value={text.schedule}
                onChange={(e) => setText({ ...text, schedule: e.target.value })}
                className="mt-1"
              />
            </label>
          </TabsContent>

          <TabsContent value="script" className="space-y-3">
            <label className="block text-xs font-semibold">
              Hook
              <Textarea
                value={text.hook}
                onChange={(e) => setText({ ...text, hook: e.target.value })}
                className="mt-1 min-h-14 font-serif text-base font-normal italic"
                aria-label="Hook"
              />
            </label>
            <label className="block text-xs font-semibold">
              Script
              <Textarea
                value={text.script}
                onChange={(e) => setText({ ...text, script: e.target.value })}
                className="mt-1 min-h-28 text-sm font-normal"
                aria-label="Script"
              />
            </label>
            <div className="text-xs font-semibold">Platform captions</div>
            <div className="space-y-2">
              {PLATFORMS.map((p) => {
                const v = text.captions[p.id];
                const f = CAPTION_FMT[p.id];
                return (
                  <div key={p.id} className="rounded-lg border p-2">
                    <div className="mb-1 flex justify-between text-[11px]">
                      <b>{p.label}</b>
                      <span
                        className={cn(
                          "text-muted-foreground",
                          v.length > f.max && "font-bold text-destructive",
                        )}
                      >
                        {f.fmt} · {v.length}/{f.max}
                      </span>
                    </div>
                    <Textarea
                      value={v}
                      onChange={(e) =>
                        setText({ ...text, captions: { ...text.captions, [p.id]: e.target.value } })
                      }
                      className="min-h-12 text-xs"
                      aria-label={`${p.label} caption`}
                    />
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="scenes" className="space-y-3">
            {item.footageRequest?.status === "requested" && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-warning-soft p-3 text-xs">
                <span>
                  <b>Real footage requested.</b> Demo upload only; no file is sent.{" "}
                  {item.footageRequest.note}
                </span>
                <Button size="sm" variant="outline" onClick={() => actions.uploadFootage(item.id)}>
                  <UploadCloud className="size-4" /> Simulate footage upload
                </Button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {item.scenes.map((s, i) => (
                <div key={s.id} className="space-y-1">
                  <div
                    className={cn(
                      "relative aspect-[9/16] overflow-hidden rounded-lg",
                      item.thumbnail === s.image && "ring-2 ring-primary",
                    )}
                  >
                    <img
                      src={IMAGES[s.image]}
                      alt={s.label}
                      className={cn(
                        "size-full object-cover",
                        s.source === "requested" && "opacity-30",
                      )}
                    />
                    <span className="absolute left-1 top-1 rounded bg-card px-1 text-[10px] font-bold">
                      {i + 1}
                    </span>
                    {s.overlay && (
                      <span className="absolute inset-x-1 bottom-1 rounded bg-ink/70 px-1 text-[9px] font-bold text-ink-foreground">
                        {s.overlay}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    0:0{s.duration} ·{" "}
                    <span className={cn(s.source === "requested" && "font-bold text-warning")}>
                      {s.source}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      className="text-left text-[10px] font-semibold text-primary hover:underline disabled:text-muted-foreground"
                      disabled={item.thumbnail === s.image}
                      onClick={() => actions.edit(item.id, { thumbnail: s.image })}
                    >
                      {item.thumbnail === s.image ? "Thumbnail" : "Set thumbnail"}
                    </button>
                    {s.source === "generated" && (
                      <button
                        className="text-left text-[10px] text-muted-foreground hover:underline"
                        onClick={() => actions.requestFootage(item.id, s.id)}
                      >
                        Request real footage
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scenes and voice can be generated (simulated). Shots of real athletes, coaches or
              parents must come from uploaded human footage — Muninn never films people.
            </p>
          </TabsContent>

          <TabsContent value="versions" className="space-y-3">
            <ul className="space-y-2">
              {item.versions.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  No cuts yet — they appear after Editing.
                </li>
              )}
              {item.versions.map((v) => (
                <li
                  key={v.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border p-2 text-xs",
                    v.id === item.selectedVersionId && "border-primary bg-primary-soft",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Film className="size-4 shrink-0" />
                    <span className="min-w-0">
                      <b>{v.label}</b> · 0:{v.duration} · {actorName(v.by)} · {relTime(v.at)}
                      <span className="block truncate text-muted-foreground">{v.note}</span>
                    </span>
                  </span>
                  {v.id === item.selectedVersionId ? (
                    <span className="text-[11px] font-bold text-primary">In package</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => actions.edit(item.id, { selectedVersionId: v.id })}
                    >
                      Use
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const rev = item.versions.length + 1;
                const v = {
                  id: uid("v"),
                  rev,
                  label: `Cut ${rev}`,
                  at: Date.now(),
                  by: "muninn" as const,
                  note: "New cut from current script (simulated)",
                  duration: 31,
                };
                actions.edit(item.id, { versions: [...item.versions, v], selectedVersionId: v.id });
              }}
            >
              Generate new cut
            </Button>
            <div className="rounded-xl bg-secondary/60 p-3 text-xs">
              <div className="mb-1 font-bold">Approval record</div>
              {item.approval ? (
                <p>
                  Approved by {actorName(item.approval.by)} · rev {item.approval.revision} ·{" "}
                  {new Date(item.approval.at).toLocaleString()}
                </p>
              ) : (
                <p className="text-muted-foreground">No valid approval.</p>
              )}
              {item.staleApproval && (
                <p className="mt-1 text-destructive">
                  Stale: {actorName(item.staleApproval.by)}'s approval of rev{" "}
                  {item.staleApproval.revision} invalidated by{" "}
                  {actorName(item.staleApproval.invalidatedBy)} —{" "}
                  {item.staleApproval.changes.join(", ")}
                </p>
              )}
            </div>
          </TabsContent>

          {dirty && (
            <div className="sticky bottom-0 mt-3 flex items-center justify-between gap-2 rounded-xl bg-ink p-2 pl-3 text-xs text-ink-foreground">
              <span>
                Unsaved edits{item.approval ? " — saving will invalidate the approval" : ""}
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-ink-foreground hover:bg-ink-foreground/10 hover:text-ink-foreground"
                  onClick={discard}
                >
                  Discard
                </Button>
                <Button size="sm" onClick={save}>
                  Save edits
                </Button>
              </span>
            </div>
          )}
        </Tabs>
      </div>
      <span className={cn("sr-only", STAGE_TEXT[item.stage])}>{item.stage}</span>
    </div>
  );
}
