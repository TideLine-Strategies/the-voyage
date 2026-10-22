import { CheckCircle2, FileSearch, Lock, Pause, Play, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORMS } from "../constants";
import { IMAGES } from "../images";
import { hasValidApproval } from "../logic/gate";
import type { ContentItem, DeliveryStatus } from "../types";
import { actorName, BrandChip, STAGE_BG } from "./bits";

export const DELIVERY_DOT: Record<DeliveryStatus, string> = {
  not_configured: "bg-muted-foreground/40",
  needs_approval: "bg-stage-approval",
  queued: "bg-ink-foreground/70",
  scheduled: "bg-stage-research",
  published: "bg-success",
  failed: "bg-destructive",
  held: "bg-warning",
};

export function CardPreview({ item, active }: { item: ContentItem; active: boolean }) {
  const approved = hasValidApproval(item);
  const dur = item.versions.find((v) => v.id === item.selectedVersionId)?.duration ?? 30;
  return (
    <div className="relative size-full overflow-hidden rounded-[inherit] bg-ink">
      <img
        src={IMAGES[item.thumbnail]}
        alt=""
        className={cn(
          "absolute inset-0 size-full object-cover transition-transform duration-700",
          active && "scale-105",
          item.stage === "posting" && !approved && "blur-sm brightness-75",
        )}
        draggable={false}
      />
      <div className="scrim absolute inset-0" />

      <div className="absolute inset-x-2 top-2 flex items-start justify-between gap-1">
        <BrandChip brand={item.brand} className="bg-card/90" />
        {item.paused && (
          <span className="flex items-center gap-1 rounded-md bg-warning px-1.5 py-0.5 text-[10px] font-bold text-ink">
            <Pause className="size-3" /> Paused
          </span>
        )}
      </div>

      {/* Stage-specific preview */}
      <div className="absolute inset-x-2 top-10 text-ink-foreground">
        {item.stage === "research" && (
          <div className="space-y-1">
            {(item.sources ?? []).slice(0, active ? 4 : 2).map((s) => (
              <div
                key={s}
                className="flex items-center gap-1 rounded-md bg-card/90 px-1.5 py-1 text-[9px] font-medium text-foreground"
              >
                <FileSearch className="size-3 shrink-0 text-stage-research" />
                <span className="truncate">{s}</span>
              </div>
            ))}
          </div>
        )}
        {item.stage === "scripting" && (
          <div className="rotate-[-3deg] rounded-md bg-card p-2 font-serif text-[11px] italic leading-snug text-foreground shadow-card">
            “{item.hook}”
          </div>
        )}
        {item.stage === "filming" && (
          <div className="grid grid-cols-2 gap-1">
            {item.scenes.slice(0, 4).map((s) => (
              <div key={s.id} className="relative aspect-[9/12] overflow-hidden rounded bg-ink">
                {s.source === "requested" ? (
                  <div className="grid size-full place-items-center bg-warning/90 p-1 text-center text-[8px] font-bold text-ink">
                    <UploadCloud className="size-3" />
                    Footage requested
                  </div>
                ) : (
                  <img
                    src={IMAGES[s.image]}
                    alt=""
                    className="size-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {item.stage === "approval" && (
          <div className="mx-auto mt-6 w-fit rounded-lg bg-card/95 px-2 py-1.5 text-center text-[10px] font-semibold text-foreground">
            <CheckCircle2 className="mx-auto mb-0.5 size-4 text-stage-approval" />
            You or Cody must approve
          </div>
        )}
        {item.stage === "posting" && (
          <div className="mt-6 text-center">
            {approved ? null : (
              <div className="mx-auto w-fit text-[11px] font-semibold">
                <Lock className="mx-auto mb-1 size-5" /> Locked until approval
              </div>
            )}
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-2.5 text-ink-foreground">
        {item.stage === "editing" && active && (
          <div className="mb-2 rounded bg-ink/70 px-1.5 py-1 text-center text-[11px] font-bold">
            {item.scenes[0]?.overlay}
          </div>
        )}
        <p className="mb-1 truncate text-[8px] font-semibold uppercase tracking-wider opacity-90">
          {item.campaign}
        </p>
        <div className={cn("font-bold leading-tight", active ? "text-lg" : "text-[13px]")}>
          {item.title}
        </div>
        <p className="mt-1 truncate text-[9px] font-semibold">{item.task}</p>
        <p className="truncate text-[8px] opacity-85">
          {actorName(item.owner)} · {Math.round(item.progress * 100)}% · {item.latestUpdate}
        </p>
        {item.blockers.length > 0 && (
          <p className="mt-1 line-clamp-1 rounded bg-warning px-1 py-0.5 text-[8px] font-semibold text-ink">
            {item.blockers.join(" · ")}
          </p>
        )}
        {item.stage === "posting" && (
          <div className="mt-1.5 flex gap-1">
            {item.destinations.map((d) => (
              <span
                key={d.platform}
                title={`${d.platform}: ${d.status}`}
                className="flex items-center gap-0.5 rounded bg-card/90 px-1 py-0.5 text-[8px] font-bold uppercase text-foreground"
              >
                <span className={cn("size-1.5 rounded-full", DELIVERY_DOT[d.status])} />
                {PLATFORMS.find((p) => p.id === d.platform)!.short}
              </span>
            ))}
          </div>
        )}
        {item.stage === "analytics" && (
          <div className="mt-1 text-[10px] opacity-90">Total reported views · DEMO</div>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
          {(item.stage === "editing" || item.stage === "approval") && (
            <Play className="size-3 fill-current" />
          )}
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-foreground/25">
            <div
              className={cn("h-full transition-[width] duration-700", STAGE_BG[item.stage])}
              style={{ width: `${item.progress * 100}%` }}
            />
          </div>
          <span className="tabular-nums">0:{String(dur).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  );
}
