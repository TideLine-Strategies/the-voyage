// Pure rules for the mandatory human approval gate and pipeline movement.
// No React or storage. Live reuse also requires authenticated server commands, a due schedule and provider checks.
import { PLATFORMS, platformLabel, STAGES, stageIndex } from "../constants";
import type { Activity, Actor, ContentItem, Person, Stage } from "../types";

let counter = 0;
export const uid = (p = "id") => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const isHuman = (a: Actor): a is Person => a === "you" || a === "cody";

export const log = (
  item: ContentItem,
  actor: Actor,
  text: string,
  kind: Activity["kind"] = "system",
  at = Date.now(),
): ContentItem => ({
  ...item,
  activity: [{ id: uid("act"), at, actor, text, kind }, ...item.activity].slice(0, 60),
});

/** Everything a human signs off on: version, captions per platform, destinations, schedule, thumbnail. */
export function packageSignature(item: ContentItem): string {
  return JSON.stringify({
    v: item.versions.find((v) => v.id === item.selectedVersionId),
    brief: item.brief,
    scenes: item.scenes,
    hook: item.hook,
    script: item.script,
    c: PLATFORMS.map((p) => item.captions[p.id]),
    d: [...item.destinations]
      .sort((a, b) => a.platform.localeCompare(b.platform))
      .map(({ platform, handle, enabled, configured, sourceOnly }) => ({
        platform,
        handle,
        enabled,
        configured,
        sourceOnly: !!sourceOnly,
      })),
    s: item.schedule,
    t: item.thumbnail,
  });
}

export function describeChanges(before: ContentItem, after: ContentItem): string[] {
  const out: string[] = [];
  if (
    JSON.stringify(before.versions.find((v) => v.id === before.selectedVersionId)) !==
    JSON.stringify(after.versions.find((v) => v.id === after.selectedVersionId))
  )
    out.push("Video version changed");
  if (before.brief !== after.brief) out.push("Brief edited");
  if (JSON.stringify(before.scenes) !== JSON.stringify(after.scenes)) out.push("Scenes changed");
  if (before.hook !== after.hook) out.push("Hook edited");
  if (before.script !== after.script) out.push("Script edited");
  for (const p of PLATFORMS)
    if (before.captions[p.id] !== after.captions[p.id]) out.push(`${p.label} caption edited`);
  for (const p of PLATFORMS) {
    const identity = (i: ContentItem) =>
      i.destinations
        .filter((d) => d.platform === p.id)
        .map(({ handle, enabled, configured, sourceOnly }) => ({
          handle,
          enabled,
          configured,
          sourceOnly: !!sourceOnly,
        }));
    if (JSON.stringify(identity(before)) !== JSON.stringify(identity(after)))
      out.push(`${p.label} destination changed`);
  }
  if (before.schedule !== after.schedule) out.push("Schedule changed");
  if (before.thumbnail !== after.thumbnail) out.push("Thumbnail changed");
  return out;
}

export const hasValidApproval = (item: ContentItem) =>
  !!item.approval &&
  isHuman(item.approval.by) &&
  item.approval.revision === item.revision &&
  item.approval.signature === packageSignature(item);

export function canApprove(item: ContentItem, actor: Actor): { ok: boolean; reason?: string } {
  if (!isHuman(actor))
    return { ok: false, reason: "Only You or Cody can approve. Muninn cannot approve." };
  if (item.stage !== "approval") return { ok: false, reason: "Item is not in Human approval." };
  if (hasValidApproval(item)) return { ok: false, reason: "This revision is already approved." };
  if (!item.versions.some((v) => v.id === item.selectedVersionId))
    return { ok: false, reason: "Choose a video version first." };
  if (!item.hook.trim() || !item.script.trim() || !Number.isFinite(Date.parse(item.schedule)))
    return { ok: false, reason: "Complete the hook, script and schedule first." };
  if (
    item.footageRequest?.status === "requested" ||
    item.scenes.some((s) => s.source === "requested")
  )
    return { ok: false, reason: "Resolve the requested footage before approval." };
  if (
    PLATFORMS.some(
      (p) =>
        !item.captions[p.id]?.trim() ||
        item.destinations.filter((d) => d.platform === p.id).length !== 1,
    )
  )
    return { ok: false, reason: "Review all six captions and destination records." };
  return { ok: true };
}

function resetDeliveries(item: ContentItem, status: "needs_approval" | "queued"): ContentItem {
  return {
    ...item,
    destinations: item.destinations.map((d) => {
      const { receipt: _receipt, note: _note, ...clean } = d;
      if (d.sourceOnly)
        return {
          ...clean,
          status: "held",
          note: "Source-only example — existing company LinkedIn route; never dispatched to itself",
        };
      if (!d.configured)
        return {
          ...clean,
          status: "not_configured",
          note: "Destination not connected — held until connected",
        };
      if (!d.enabled) return { ...clean, status: "held", note: "Not selected in this package" };
      return { ...clean, status, attempts: 0 };
    }),
  };
}

export function approve(item: ContentItem, actor: Actor, at = Date.now()): ContentItem {
  const check = canApprove(item, actor);
  if (!check.ok) throw new Error(check.reason);
  const person = actor as Person;
  let next: ContentItem = {
    ...item,
    approval: { by: person, at, revision: item.revision, signature: packageSignature(item) },
    staleApproval: null,
    stage: "posting",
    progress: 0,
    owner: "muninn",
    task: "Dispatching approved package",
    latestUpdate: `Approved by ${person === "you" ? "You" : "Cody"} (rev ${item.revision})`,
    blockers: [],
  };
  next = resetDeliveries(next, "queued");
  return log(
    next,
    person,
    `Approved rev ${item.revision} — exact package locked for posting.`,
    "approval",
    at,
  );
}

export function requestChanges(
  item: ContentItem,
  actor: Actor,
  note: string,
  at = Date.now(),
): ContentItem {
  if (!isHuman(actor)) throw new Error("Only a human can request changes.");
  let next: ContentItem = {
    ...item,
    stage: "editing",
    progress: 0.2,
    approval: null,
    owner: "muninn",
    task: "Applying requested changes",
    latestUpdate: `Changes requested: ${note}`,
    blockers: [],
  };
  next = resetDeliveries(next, "needs_approval");
  return log(next, actor, `Requested changes: ${note || "(no note)"}`, "gate", at);
}

/**
 * Apply a material edit. If an approval existed and the package changes, the approval becomes
 * stale, the item returns to Human approval, and deliveries go back to needs_approval.
 */
export function applyEdit(
  item: ContentItem,
  patch: Partial<ContentItem>,
  actor: Actor,
  at = Date.now(),
): ContentItem {
  const editable = [
    "hook",
    "script",
    "brief",
    "captions",
    "destinations",
    "schedule",
    "thumbnail",
    "scenes",
    "selectedVersionId",
    "versions",
  ] as const;
  const safePatch = Object.fromEntries(
    editable
      .filter((k) => Object.prototype.hasOwnProperty.call(patch, k))
      .map((k) => [k, patch[k]]),
  );
  const draft: ContentItem = { ...item, ...safePatch };
  const changes = describeChanges(item, draft);
  if (changes.length === 0) return item;
  let next: ContentItem = { ...draft, revision: item.revision + 1 };
  next = log(next, actor, changes.join(" · "), "edit", at);
  const wasApproved = !!item.approval;
  const afterPosting = stageIndex(item.stage) >= stageIndex("posting");
  if (wasApproved) {
    next = {
      ...next,
      staleApproval: { ...item.approval!, invalidatedAt: at, changes, invalidatedBy: actor },
      approval: null,
      stage: "approval",
      progress: 1,
      owner: actor,
      task: "Awaiting human re-approval",
      latestUpdate: "Approval invalidated by a material edit",
    };
    if (next.stage === "approval") next = resetDeliveries(next, "needs_approval");
    next = log(
      next,
      "system",
      `Approval by ${item.approval!.by === "you" ? "You" : "Cody"} (rev ${item.approval!.revision}) is stale. Returned to Human approval.`,
      "gate",
      at,
    );
  }
  return next;
}

export type MoveResult = { item: ContentItem; blocked?: string };

/** Moves (including drag/drop) can never skip the human gate. */
export function moveToStage(
  item: ContentItem,
  target: Stage,
  actor: Actor,
  at = Date.now(),
): MoveResult {
  if (target === item.stage) return { item };
  const ti = stageIndex(target);
  const gate = stageIndex("approval");
  const targetStage = STAGES[ti];
  if (!targetStage) return { item, blocked: "Unknown stage" };
  if (ti > gate && !hasValidApproval(item)) {
    const routed =
      stageIndex(item.stage) < gate
        ? {
            ...item,
            stage: "approval" as Stage,
            progress: 1,
            task: "Awaiting human approval",
            owner: "you" as Actor,
          }
        : item;
    return {
      item: log(
        routed,
        "system",
        `Move to ${targetStage.label} blocked — needs a valid human approval.`,
        "gate",
        at,
      ),
      blocked: "Posting is locked until You or Cody approve this exact version.",
    };
  }
  let next: ContentItem = {
    ...item,
    stage: target,
    progress: target === "approval" ? 1 : 0,
    blockers: [],
  };
  if (ti <= gate && item.approval) {
    next = {
      ...next,
      staleApproval: {
        ...item.approval,
        invalidatedAt: at,
        changes: [`Moved back to ${targetStage.label}`],
        invalidatedBy: actor,
      },
      approval: null,
    };
    next = resetDeliveries(next, "needs_approval");
  }
  if (target === "approval") next = { ...next, task: "Awaiting human approval", owner: "you" };
  return { item: log(next, actor, `Moved to ${targetStage.label}`, "system", at) };
}

export function canDispatch(
  item: ContentItem,
  factoryPaused: boolean,
): { ok: boolean; reason?: string } {
  if (item.stage !== "posting") return { ok: false, reason: "Item is not in Posting" };
  if (item.replanning) return { ok: false, reason: "Item is replanning" };
  if (factoryPaused) return { ok: false, reason: "Factory stopped" };
  if (item.paused) return { ok: false, reason: "Item paused" };
  if (!hasValidApproval(item)) return { ok: false, reason: "No valid human approval" };
  return { ok: true };
}

export function sendBack(item: ContentItem, actor: Actor, at = Date.now()): ContentItem {
  const i = stageIndex(item.stage);
  if (i === 0) return item;
  const target = STAGES[Math.min(i - 1, stageIndex("editing"))]?.id;
  if (!target) return item;
  return moveToStage(item, target, actor, at).item;
}
