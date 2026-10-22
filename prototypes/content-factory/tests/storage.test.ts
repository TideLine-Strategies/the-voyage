import { expect, it, vi, afterEach } from "vitest";
import { demoAdapter } from "../src/features/content-factory/services/adapter";
import { createSeed } from "../src/features/content-factory/data/seed";
afterEach(() => vi.unstubAllGlobals());
it("round-trips complete demo state and rejects malformed cached state", () => {
  let raw: string | null = null;
  vi.stubGlobal("localStorage", {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
    removeItem: () => {
      raw = null;
    },
  });
  const state = createSeed();
  demoAdapter.save(state);
  expect(demoAdapter.load()).toEqual(state);
  raw = '{"version":1,"items":null}';
  expect(demoAdapter.load()).toBeNull();
  raw = "broken";
  expect(demoAdapter.load()).toBeNull();
  demoAdapter.clear();
  expect(raw).toBeNull();
});
it("reports unavailable storage while reset remains usable", () => {
  vi.stubGlobal("localStorage", {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
    removeItem() {
      throw Error("blocked");
    },
  });
  expect(demoAdapter.load()).toBeNull();
  expect(() => demoAdapter.save(createSeed())).toThrow(/unavailable/);
  expect(() => demoAdapter.clear()).not.toThrow();
});

it("recovers an interrupted replan without automatically resuming", () => {
  const state = createSeed();
  const item = state.items[0]!;
  item.replanning = true;
  item.paused = true;
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(state) });
  const recovered = demoAdapter.load()!.items[0]!;
  expect(recovered.replanning).toBe(false);
  expect(recovered.paused).toBe(true);
  expect(recovered.task).toBe("Replan interrupted");
  expect(recovered.activity[0]!.text).toMatch(/Refresh interrupted/);
});
