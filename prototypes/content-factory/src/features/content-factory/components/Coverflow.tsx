import { ChevronLeft, ChevronRight, CornerLeftUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { STAGES, stageIndex } from "../constants";
import { useFactory } from "../store";
import type { Stage } from "../types";
import { CardPreview } from "./CardPreview";
import { StageDot, STAGE_TEXT } from "./bits";

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

export function Coverflow() {
  const { visible, selected, actions } = useFactory();
  const mobile = useIsMobile();
  const reduced = useReducedMotion();
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const ordered = useMemo(
    () =>
      [...visible].sort(
        (a, b) => stageIndex(a.stage) - stageIndex(b.stage) || a.createdAt - b.createdAt,
      ),
    [visible],
  );
  const sel = Math.max(
    0,
    ordered.findIndex((i) => i.id === selected?.id),
  );
  const go = (d: number) => {
    const n = ordered[Math.min(ordered.length - 1, Math.max(0, sel + d))];
    if (n) actions.select(n.id);
  };
  const canvasRef = useRef<HTMLDivElement>(null);
  const [railWidth, setRailWidth] = useState(1100);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setRailWidth(el.clientWidth));
    observer.observe(el);
    setRailWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [mobile]);
  const spread = Math.max(55, Math.min(112, (railWidth / 2 - 190) / 5));
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobile) return;
    stripRef.current?.querySelector(`[data-id="${selected?.id}"]`)?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selected?.id, mobile, reduced]);

  const rail = (
    <div className="no-scrollbar flex gap-1 overflow-x-auto px-1 pb-1 md:grid md:grid-cols-7 md:overflow-visible">
      {STAGES.map((s) => {
        const count = visible.filter((i) => i.stage === s.id).length;
        const active = selected?.stage === s.id;
        return (
          <button
            key={s.id}
            onClick={() => {
              const first = ordered.find((i) => i.stage === s.id);
              if (first) actions.select(first.id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(s.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) actions.move(id, s.id);
            }}
            className={cn(
              "flex min-w-[150px] items-start gap-2 rounded-xl px-2 py-1.5 text-left transition-colors md:min-w-0",
              active ? "bg-card shadow-card/0 ring-1 ring-border" : "hover:bg-card/60",
              dragOver === s.id && "ring-2 ring-primary",
            )}
          >
            <StageDot stage={s.id} />
            <span className="min-w-0">
              <span className={cn("block truncate text-sm font-bold", active && STAGE_TEXT[s.id])}>
                {s.label} <span className="font-medium text-muted-foreground">· {count}</span>
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{s.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  if (mobile) {
    return (
      <section aria-label="Content pipeline" className="space-y-2">
        {rail}
        <div
          ref={stripRef}
          className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 py-3"
        >
          {ordered.map((it) => (
            <button
              key={it.id}
              data-id={it.id}
              onClick={() => actions.select(it.id)}
              aria-pressed={it.id === selected?.id}
              className={cn(
                "aspect-[9/16] w-36 shrink-0 snap-center rounded-2xl shadow-card transition-transform",
                it.id === selected?.id && "w-44 ring-2 ring-primary",
              )}
            >
              <CardPreview item={it} active={it.id === selected?.id} />
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Content pipeline — assembly line" className="space-y-1">
      {rail}
      <div
        ref={canvasRef}
        className="relative h-[400px] select-none outline-none [perspective:1400px] focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={0}
        role="listbox"
        aria-label="Content items. Use left and right arrows to move."
        aria-activedescendant={selected ? `card-${selected.id}` : undefined}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(1);
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            go(-1);
          }
        }}
      >
        <div className="absolute inset-0 [transform-style:preserve-3d]">
          {ordered.map((it, idx) => {
            const o = idx - sel;
            const a = Math.abs(o);
            const sgn = Math.sign(o);
            const x = o === 0 ? 0 : sgn * (150 + (a - 1) * spread);
            const stageShift =
              o === 0
                ? 0
                : sgn * (stageIndex(it.stage) !== stageIndex(ordered[sel]!.stage) ? 14 : 0);
            const hidden = a > 8;
            return (
              <button
                key={it.id}
                id={`card-${it.id}`}
                role="option"
                aria-selected={o === 0}
                aria-label={`${it.title}, ${STAGES[stageIndex(it.stage)]!.label}, ${it.brand}, ${it.campaign}, ${it.task}, ${Math.round(it.progress * 100)} percent, ${it.owner}, ${it.latestUpdate}${it.blockers.length ? ", blocked: " + it.blockers.join(", ") : ""}`}
                tabIndex={-1}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}
                onClick={() => actions.select(it.id)}
                className={cn(
                  "group absolute left-1/2 top-1/2 aspect-[9/16] rounded-2xl",
                  o === 0
                    ? "w-[200px] shadow-card-active ring-2 ring-card"
                    : "w-[150px] shadow-card hover:brightness-110",
                  !reduced && "ease-spring transition-all duration-700",
                )}
                style={{
                  transform: `translate(-50%, -50%) translateX(${x + stageShift}px) translateZ(${o === 0 ? 40 : -a * 30 - 60}px) rotateY(${o === 0 ? 0 : -sgn * 42}deg)`,
                  zIndex: 100 - a,
                  opacity: hidden ? 0 : 1 - Math.max(0, a - 5) * 0.2,
                  pointerEvents: hidden ? "none" : undefined,
                }}
              >
                <CardPreview item={it} active={o === 0} />
              </button>
            );
          })}
        </div>
        <button
          aria-label="Previous item"
          onClick={() => go(-1)}
          className="absolute left-2 top-1/2 z-[200] grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card shadow-card transition hover:scale-105"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          aria-label="Next item"
          onClick={() => go(1)}
          className="absolute right-2 top-1/2 z-[200] grid size-10 -translate-y-1/2 place-items-center rounded-full bg-card shadow-card transition hover:scale-105"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="flex items-center gap-3 px-10 text-sm text-muted-foreground">
        <CornerLeftUp className="size-4 shrink-0 text-stage-research" />
        <div className="h-px flex-1 bg-gradient-to-r from-stage-research/50 to-stage-analytics/50" />
        <span>Analytics → Research: results improve the next brief</span>
        <div className="h-px flex-1 bg-gradient-to-r from-stage-research/50 to-stage-analytics/50" />
      </div>
    </section>
  );
}
