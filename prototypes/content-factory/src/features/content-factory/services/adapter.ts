// Service boundary. Today: a local DEMO adapter (localStorage + simulated Muninn).
// Later: swap for a Voyage CRM adapter (content items, approvals) and the local publishing worker.
import { log } from "../logic/gate";
import { stateSchema } from "./state-schema";
import type { ContentItem, FactoryState, Person } from "../types";

export interface MuninnPlan {
  reply: string;
  task: string;
  simulated: true;
}

export interface ContentFactoryAdapter {
  mode: "demo" | "live";
  load(): FactoryState | null;
  save(state: FactoryState): void;
  clear(): void;
  /** Ask Muninn to replan an item with human direction. */
  steer(item: ContentItem, direction: string, by: Person): Promise<MuninnPlan>;
}

const KEY = "voyage-content-factory:v1";

export const demoAdapter: ContentFactoryAdapter = {
  mode: "demo",
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = stateSchema.safeParse(JSON.parse(raw));
      if (!s.success) return null;
      const state = s.data as FactoryState;
      return {
        ...state,
        items: state.items.map((item) =>
          item.replanning
            ? log(
                {
                  ...item,
                  replanning: false,
                  paused: true,
                  task: "Replan interrupted",
                  latestUpdate: "Refresh interrupted the simulated replan. Steer again or resume.",
                },
                "system",
                "Refresh interrupted the simulated replan. The item remains paused; steer again or resume.",
              )
            : item,
        ),
      };
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      throw new Error("Browser storage is unavailable; this demo will not survive a refresh.");
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* Reset still restores in-memory seed. */
    }
  },
  async steer(item, direction) {
    await new Promise((r) => setTimeout(r, 900));
    const d = direction.toLowerCase();
    let task = "Replanning with new direction";
    if (d.includes("hook")) task = "Rewriting opening hook";
    else if (d.includes("overlay") || d.includes("caption")) task = "Reworking caption overlays";
    else if (d.includes("parent")) task = "Adding parent-communication beat";
    else if (d.includes("short") || d.includes("tight")) task = "Tightening cut";
    else if (d.includes("footage")) task = "Re-matching footage";
    return {
      simulated: true,
      task,
      reply: `Simulated plan: paused "${item.task}". Next: ${task.toLowerCase()} → re-check ${item.brand === "wonplace" ? "gym-first voice" : "operator voice"} → hand back for review. Resume when ready.`,
    };
  },
};
