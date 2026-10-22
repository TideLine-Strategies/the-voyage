import { cn } from "@/lib/utils";
import { BRANDS, stageIndex } from "../constants";
import type { Actor, Brand, Stage } from "../types";

export const STAGE_BG: Record<Stage, string> = {
  research: "bg-stage-research",
  scripting: "bg-stage-scripting",
  filming: "bg-stage-filming",
  editing: "bg-stage-editing",
  approval: "bg-stage-approval",
  posting: "bg-stage-posting",
  analytics: "bg-stage-analytics",
};
export const STAGE_TEXT: Record<Stage, string> = {
  research: "text-stage-research",
  scripting: "text-stage-scripting",
  filming: "text-stage-filming",
  editing: "text-stage-editing",
  approval: "text-stage-approval",
  posting: "text-stage-posting",
  analytics: "text-stage-analytics",
};

export function StageDot({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-primary-foreground",
        STAGE_BG[stage],
        className,
      )}
    >
      {stageIndex(stage) + 1}
    </span>
  );
}

export function BrandChip({ brand, className }: { brand: Brand; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
        brand === "wonplace"
          ? "bg-brand-wonplace/12 text-brand-wonplace"
          : "bg-brand-tideline/12 text-brand-tideline",
        className,
      )}
    >
      {BRANDS[brand].label}
    </span>
  );
}

export const actorName = (a: Actor) =>
  ({ you: "You", cody: "Cody", muninn: "Muninn", system: "Gate" })[a];

export function relTime(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function Progress({
  value,
  className,
  tone = "bg-primary",
}: {
  value: number;
  className?: string;
  tone?: string;
}) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-out", tone)}
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

export function DemoTag({ children = "DEMO" }: { children?: string }) {
  return (
    <span className="rounded border border-dashed border-warning px-1.5 py-px text-[10px] font-bold tracking-wide text-warning">
      {children}
    </span>
  );
}
