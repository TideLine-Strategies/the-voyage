// Controllable DEMO progression. Every step is simulated and labeled as such.
import { platformLabel, STAGES, stageIndex, stageLabel } from "../constants";
import type { Actor, ContentItem, Stage } from "../types";
import { canDispatch, log, uid } from "./gate";

const TASKS: Partial<Record<Stage, string[]>> = {
  research: ["Collecting sources", "Clustering angles", "Scoring evidence"],
  scripting: ["Drafting hook options", "Tightening script", "Checking brand voice"],
  filming: ["Generating scenes", "Generating voiceover", "Matching b-roll to beats"],
  editing: ["Assembling cut", "Adding caption overlays", "Refining opening hook"],
  analytics: ["Pulling platform reports", "Reconciling metrics", "Drafting insights"],
};

const STEP = 0.07;

export function tickItem(item: ContentItem, factoryPaused: boolean, now = Date.now()): ContentItem {
  if (factoryPaused || item.paused || item.replanning) return item;
  if (item.stage === "approval") return item; // only humans move this forward
  if (item.stage === "filming" && item.footageRequest?.status === "requested") return item;
  if (item.stage === "posting") return tickPosting(item, factoryPaused, now);
  if (item.stage === "analytics") {
    if (item.progress >= 1) return item;
    const p = Math.min(1, item.progress + STEP / 2);
    const tasks = TASKS.analytics!;
    return {
      ...item,
      progress: p,
      task:
        p >= 1
          ? "Insights ready"
          : (tasks[Math.min(tasks.length - 1, Math.floor(p * tasks.length))] ?? "Working"),
    };
  }

  const p = item.progress + STEP;
  const tasks = TASKS[item.stage]!;
  if (p < 1) {
    const task = tasks[Math.min(tasks.length - 1, Math.floor(p * tasks.length))] ?? "Working";
    const changed = task !== item.task;
    const next = {
      ...item,
      progress: p,
      task,
      owner: "muninn" as const,
      latestUpdate: changed ? `${task}…` : item.latestUpdate,
    };
    return changed ? log(next, "muninn", `${task} (simulated)`, "agent", now) : next;
  }

  const ni = stageIndex(item.stage) + 1;
  const nextStage = STAGES[ni]?.id;
  if (!nextStage) return item;
  let next: ContentItem = { ...item, stage: nextStage, progress: 0 };
  if (nextStage === "approval") {
    if (!next.versions.some((v) => v.id === next.selectedVersionId)) {
      const version = {
        id: uid("version"),
        rev: next.revision,
        label: "Demo cut 1",
        at: now,
        by: "muninn" as const,
        note: "Simulated storyboard assembly; no video rendered",
        duration: next.scenes.reduce((n, s) => n + s.duration, 0),
      };
      next = { ...next, versions: [version, ...next.versions], selectedVersionId: version.id };
    }
    next = {
      ...next,
      progress: 1,
      owner: "you",
      task: "Awaiting human approval",
      latestUpdate: "Final package ready — You or Cody must approve",
    };
  } else if (nextStage === "filming" && item.scenes.some((s) => s.source === "requested")) {
    next = {
      ...next,
      task: "Waiting on real footage",
      footageRequest: {
        status: "requested",
        note: "Real gym footage needed for scenes marked ‘requested’. Muninn cannot film people.",
        requestedAt: now,
      },
      blockers: ["Needs uploaded human footage"],
    };
  } else {
    next = { ...next, task: TASKS[nextStage]?.[0] ?? "Preparing next stage" };
  }
  return log(
    next,
    "muninn",
    `Finished ${stageLabel(item.stage)} → ${stageLabel(nextStage)} (simulated)`,
    "agent",
    now,
  );
}

function tickPosting(item: ContentItem, factoryPaused: boolean, now: number): ContentItem {
  const gate = canDispatch(item, factoryPaused);
  if (!gate.ok) return { ...item, blockers: [gate.reason!] };
  const live = item.destinations.filter((d) => d.enabled && d.configured && !d.sourceOnly);
  const idx = item.destinations.findIndex(
    (d) =>
      d.enabled &&
      d.configured &&
      !d.sourceOnly &&
      (d.status === "queued" || d.status === "scheduled"),
  );
  if (idx === -1) {
    const failed = live.filter((d) => d.status === "failed");
    if (failed.length)
      return {
        ...item,
        blockers: [
          `${failed.map((f) => platformLabel(f.platform)).join(", ")} failed — retry or hold`,
        ],
        task: "Some deliveries need attention",
      };
    const unresolved = item.destinations.filter(
      (d) => d.enabled && !d.sourceOnly && (d.status !== "published" || !d.receipt?.simulated),
    );
    if (unresolved.length)
      return {
        ...item,
        task: "Deliveries held",
        blockers: [
          "Selected destinations need connection or reconciliation; nothing was published there.",
        ],
      };
    const next = {
      ...item,
      stage: "analytics" as Stage,
      progress: 0,
      task: "Pulling platform reports",
      blockers: [],
    };
    return log(
      next,
      "muninn",
      "All approved destinations resolved → Analytics (simulated)",
      "posting",
      now,
    );
  }
  const d = item.destinations[idx];
  if (!d) return item;
  const dests = [...item.destinations];
  let msg = "";
  if (d.status === "queued") {
    dests[idx] = {
      ...d,
      status: "scheduled",
      attempts: d.attempts + 1,
      note: "Accepted by provider for the scheduled time (simulated)",
    };
    msg = `${platformLabel(d.platform)}: scheduled at provider (simulated)`;
  } else {
    const fails = d.platform === "x" && item.brand === "wonplace" && d.attempts <= 1;
    if (fails) {
      dests[idx] = {
        ...d,
        status: "failed",
        note: "Provider rejected media length (simulated failure)",
      };
      msg = `${platformLabel(d.platform)}: failed — other platforms unaffected (simulated)`;
    } else {
      dests[idx] = {
        ...d,
        status: "published",
        receipt: {
          id: `SIM-${d.platform.toUpperCase()}-${uid("r").slice(-5)}`,
          at: now,
          simulated: true,
        },
        note: "Simulated receipt — not a real post",
      };
      msg = `${platformLabel(d.platform)}: published with simulated receipt`;
    }
  }
  const done = live.length
    ? dests.filter(
        (x) =>
          live.some((l) => l.platform === x.platform) &&
          (x.status === "published" || x.status === "failed"),
      ).length / live.length
    : 1;
  return log(
    {
      ...item,
      destinations: dests,
      progress: done,
      task: "Dispatching approved package",
      blockers: [],
    },
    "muninn",
    msg,
    "posting",
    now,
  );
}

export function retryDestination(
  item: ContentItem,
  platform: string,
  actor: Actor = "you",
): ContentItem {
  return log(
    {
      ...item,
      destinations: item.destinations.map((d) =>
        d.platform === platform && d.status === "failed"
          ? { ...d, status: "queued", attempts: d.attempts + 1, note: "Retry queued" }
          : d,
      ),
      blockers: [],
    },
    actor,
    `Retry queued for ${platformLabel(platform as never)}`,
    "posting",
  );
}
