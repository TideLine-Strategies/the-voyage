import { describe, it, expect } from "vitest";
import { createSeed, newIdea } from "../src/features/content-factory/data/seed";
import {
  approve,
  applyEdit,
  canApprove,
  canDispatch,
  hasValidApproval,
  moveToStage,
  packageSignature,
} from "../src/features/content-factory/logic/gate";
import { tickItem, retryDestination } from "../src/features/content-factory/logic/simulation";
import { metricsFor, outcomes } from "../src/features/content-factory/data/analytics";
import type { ContentItem, Actor } from "../src/features/content-factory/types";
const fixture = () => createSeed(1792650000000).items.find((i) => i.id === "wp-progress")!;
describe("exact human package gate", () => {
  it.each(["you", "cody"] as Actor[])("allows %s to approve the saved package", (by) => {
    const item = approve(fixture(), by);
    expect(item.stage).toBe("posting");
    expect(hasValidApproval(item)).toBe(true);
    expect(item.approval?.by).toBe(by);
  });
  it("never lets Muninn approve or pass a forged signer", () => {
    expect(() => approve(fixture(), "muninn")).toThrow(/Only/);
    const i = approve(fixture(), "you");
    i.approval!.by = "muninn" as never;
    expect(hasValidApproval(i)).toBe(false);
  });
  const changes: Record<string, (i: ContentItem) => Partial<ContentItem>> = {
    hook: (i) => ({ hook: i.hook + " changed" }),
    script: (i) => ({ script: i.script + " changed" }),
    brief: (i) => ({ brief: i.brief + " changed" }),
    caption: (i) => ({ captions: { ...i.captions, instagram: "A new caption" } }),
    schedule: () => ({ schedule: "2026-11-10T11:00" }),
    thumbnail: () => ({ thumbnail: "wp-coach" }),
    version: () => ({ selectedVersionId: "v1" }),
    versionContent: (i) => ({
      versions: i.versions.map((v) => (v.id === i.selectedVersionId ? { ...v, duration: 99 } : v)),
    }),
    scenes: (i) => ({ scenes: i.scenes.map((s, n) => (n ? s : { ...s, overlay: "New scene" })) }),
    handle: (i) => ({
      destinations: i.destinations.map((d, n) => (n ? d : { ...d, handle: "another account" })),
    }),
    enabled: (i) => ({
      destinations: i.destinations.map((d, n) => (n ? d : { ...d, enabled: false })),
    }),
    configured: (i) => ({
      destinations: i.destinations.map((d, n) => (n ? d : { ...d, configured: false })),
    }),
    sourceOnly: (i) => ({
      destinations: i.destinations.map((d, n) => (n ? d : { ...d, sourceOnly: true })),
    }),
    removed: (i) => ({ destinations: i.destinations.slice(1) }),
  };
  it.each(Object.keys(changes))("invalidates approval for a %s edit", (key) => {
    const i = approve(fixture(), "cody");
    const next = applyEdit(i, changes[key]!(i), "you");
    expect(next.stage).toBe("approval");
    expect(next.approval).toBeNull();
    expect(next.staleApproval?.by).toBe("cody");
    expect(next.revision).toBe(i.revision + 1);
    expect(hasValidApproval(next)).toBe(false);
    expect(canDispatch(next, false).ok).toBe(false);
  });
  it("returns previously published items to review", () => {
    const i = approve(fixture(), "you");
    i.stage = "analytics";
    expect(applyEdit(i, { hook: "New hook" }, "you").stage).toBe("approval");
  });
  it("saves brief-only edits, ignores no-ops and ignores privileged patch fields", () => {
    const i = fixture();
    expect(applyEdit(i, { brief: "A concrete new brief" }, "you").brief).toBe(
      "A concrete new brief",
    );
    expect(applyEdit(i, { hook: i.hook }, "you")).toBe(i);
    const a = approve(i, "you").approval;
    const n = applyEdit(i, { hook: "Changed", stage: "posting", approval: a }, "you");
    expect(n.stage).toBe("approval");
    expect(n.approval).toBeNull();
  });
  it("does not treat platform row order or receipt status as a package edit", () => {
    const i = fixture();
    expect(packageSignature({ ...i, destinations: [...i.destinations].reverse() })).toBe(
      packageSignature(i),
    );
  });
  it("requires a real version identity and resolution of footage requests", () => {
    const i = fixture();
    expect(canApprove({ ...i, selectedVersionId: "missing" }, "you").ok).toBe(false);
    expect(
      canApprove(
        { ...i, scenes: i.scenes.map((s, n) => (n ? s : { ...s, source: "requested" })) },
        "you",
      ).ok,
    ).toBe(false);
  });
  it.each(["posting", "analytics"] as const)(
    "blocks drag/move directly to %s without approval",
    (stage) => {
      const i = createSeed().items[0]!;
      const r = moveToStage(i, stage, "muninn");
      expect(r.blocked).toMatch(/locked/);
      expect(r.item.stage).toBe("approval");
    },
  );
  it("global stop, item pause, replanning and stage all stop dispatch", () => {
    const i = approve(fixture(), "you");
    expect(canDispatch(i, true).ok).toBe(false);
    expect(canDispatch({ ...i, paused: true }, false).ok).toBe(false);
    expect(canDispatch({ ...i, replanning: true }, false).ok).toBe(false);
    expect(canDispatch({ ...i, stage: "analytics" }, false).ok).toBe(false);
    expect(tickItem(i, true)).toBe(i);
    expect(tickItem({ ...i, paused: true }, false).destinations).toEqual(i.destinations);
  });
});
describe("honest simulated progression", () => {
  it("does not resolve unconfigured TideLine routes into success", () => {
    const i = createSeed().items.find((i) => i.id === "tl-sched")!;
    let next = approve(i, "you");
    next = tickItem(next, false);
    expect(next.stage).toBe("posting");
    expect(next.task).toBe("Deliveries held");
    expect(
      next.destinations.filter((d) => !d.sourceOnly).every((d) => d.status === "not_configured"),
    ).toBe(true);
    expect(next.destinations[0]?.receipt).toBeUndefined();
  });
  it("keeps independent receipts when X fails and retries only that platform", () => {
    let i = approve(fixture(), "cody");
    for (let n = 0; n < 15; n++) i = tickItem(i, false);
    expect(i.stage).toBe("posting");
    expect(i.destinations.find((d) => d.platform === "x")?.status).toBe("failed");
    const fb = i.destinations.find((d) => d.platform === "facebook")?.receipt;
    expect(fb?.simulated).toBe(true);
    i = retryDestination(i, "x");
    for (let n = 0; n < 4; n++) i = tickItem(i, false);
    expect(i.stage).toBe("analytics");
    expect(i.destinations.find((d) => d.platform === "facebook")?.receipt).toEqual(fb);
    expect(i.destinations.every((d) => d.receipt?.id.startsWith("SIM-"))).toBe(true);
  });
  it("stops a new brief at the gate and creates an explicit simulated version", () => {
    let i = newIdea("wonplace", "Skill updates", "Show the parent update", 1792650000000);
    for (let n = 0; n < 100; n++) i = tickItem(i, false);
    expect(i.stage).toBe("approval");
    expect(i.versions.some((v) => v.id === i.selectedVersionId)).toBe(true);
    expect(i.approval).toBeNull();
    expect(canApprove(i, "you").ok).toBe(true);
  });
  it("seeds all stages and brands, paused for review, with collision-free ideas", () => {
    const s = createSeed();
    expect(new Set(s.items.map((i) => i.stage)).size).toBe(7);
    expect(new Set(s.items.map((i) => i.brand)).size).toBe(2);
    expect(s.factoryPaused).toBe(true);
    expect(newIdea("wonplace", "A", "", 1).id).not.toBe(newIdea("wonplace", "B", "", 1).id);
  });
  it("keeps unavailable metrics null and scales example date ranges", () => {
    const tl = metricsFor("tideline", "30d");
    expect(tl.find((r) => r.platform === "instagram")?.views).toBeNull();
    expect(tl.find((r) => r.platform === "linkedin")?.completion).toBeNull();
    expect(metricsFor("wonplace", "7d")[0]!.views).toBeLessThan(
      metricsFor("wonplace", "30d")[0]!.views!,
    );
    expect(outcomes("wonplace", "7d").conversations).toBeLessThan(
      outcomes("wonplace", "90d").conversations,
    );
  });
});
