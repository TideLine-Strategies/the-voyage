import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { createSeed, newIdea } from "./data/seed";
import {
  approve,
  applyEdit,
  canApprove,
  log,
  moveToStage,
  requestChanges,
  sendBack,
} from "./logic/gate";
import { retryDestination, tickItem } from "./logic/simulation";
import { demoAdapter, type ContentFactoryAdapter } from "./services/adapter";
import type { Brand, BrandFilter, ContentItem, FactoryState, Person, Stage } from "./types";

const TICK_MS = 1600;

function useFactoryState(adapter: ContentFactoryAdapter) {
  const [state, setState] = useState<FactoryState>(() => adapter.load() ?? createSeed());
  const [dirtyItemId, setDirtyItemId] = useState<string | null>(null);
  const dirtyRef = useRef(dirtyItemId);
  dirtyRef.current = dirtyItemId;
  const [resetKey, setResetKey] = useState(0);
  const sequence = useRef(0);
  const steering = useRef(new Map<string, number>());
  const ref = useRef(state);
  ref.current = state;

  const warnedStorage = useRef(false);
  useEffect(() => {
    try {
      adapter.save(state);
    } catch {
      if (!warnedStorage.current) {
        toast.warning("Browser storage is unavailable; changes will reset on refresh.");
        warnedStorage.current = true;
      }
    }
  }, [state, adapter]);

  useEffect(() => {
    if (state.factoryPaused) return;
    const t = setInterval(() => {
      setState((s) =>
        s.factoryPaused ? s : { ...s, items: s.items.map((i) => tickItem(i, s.factoryPaused)) },
      );
    }, TICK_MS);
    return () => clearInterval(t);
  }, [state.factoryPaused]);

  const update = useCallback((id: string, fn: (i: ContentItem, s: FactoryState) => ContentItem) => {
    setState((s) => ({ ...s, items: s.items.map((i) => (i.id === id ? fn(i, s) : i)) }));
  }, []);

  const actions = useMemo(
    () => ({
      setDraftDirty: (id: string, dirty: boolean) =>
        setDirtyItemId((current) => (dirty ? id : current === id ? null : current)),
      select: (id: string) => {
        if (dirtyRef.current && id !== ref.current.selectedId) {
          toast.error("Save or discard your edits before switching items");
          return;
        }
        setState((s) => ({ ...s, selectedId: id }));
      },
      setBrand: (b: BrandFilter) => {
        if (dirtyRef.current) {
          toast.error("Save or discard your edits before changing brands");
          return;
        }
        setState((s) => {
          const visible = s.items.filter((i) => b === "both" || i.brand === b);
          const keep = visible.some((i) => i.id === s.selectedId);
          return {
            ...s,
            brandFilter: b,
            selectedId: keep
              ? s.selectedId
              : ((visible.find((i) => i.stage === "editing") ?? visible[0])?.id ?? s.selectedId),
          };
        });
      },
      setUser: (u: Person) => setState((s) => ({ ...s, currentUser: u })),
      toggleFactory: () =>
        setState((s) => {
          const paused = !s.factoryPaused;
          toast(
            paused ? "Factory stopped — no progression or dispatch" : "Factory resumed (simulated)",
          );
          return { ...s, factoryPaused: paused };
        }),
      pauseItem: (id: string) =>
        update(id, (i, s) => log({ ...i, paused: true }, s.currentUser, "Paused item", "steer")),
      resumeItem: (id: string) =>
        update(id, (i, s) =>
          log({ ...i, paused: false, replanning: false }, s.currentUser, "Resumed item", "steer"),
        ),
      retry: (id: string) =>
        update(id, (i, s) => {
          if (i.stage === "posting") {
            let n = i;
            for (const d of i.destinations)
              if (d.status === "failed") n = retryDestination(n, d.platform, s.currentUser);
            return n;
          }
          return log(
            { ...i, progress: Math.max(0, i.progress - 0.3), paused: false, blockers: [] },
            s.currentUser,
            `Retry: re-running “${i.task}”`,
            "steer",
          );
        }),
      retryDestination: (id: string, platform: string) =>
        update(id, (i, s) => retryDestination(i, platform, s.currentUser)),
      sendBack: (id: string) => update(id, (i, s) => sendBack(i, s.currentUser)),
      edit: (id: string, patch: Partial<ContentItem>) => {
        const before = ref.current.items.find((i) => i.id === id);
        update(id, (i, s) => applyEdit(i, patch, s.currentUser));
        if (before?.approval) toast.warning("Approval invalidated — returned to Human approval");
      },
      move: (id: string, stage: Stage) => {
        const it = ref.current.items.find((i) => i.id === id);
        if (!it) return;
        const r = moveToStage(it, stage, ref.current.currentUser);
        if (r.blocked) toast.error(r.blocked);
        update(id, () => r.item);
      },
      approve: (id: string) => {
        if (dirtyRef.current === id) {
          toast.error("Save or discard your edits before approval");
          return;
        }
        const it = ref.current.items.find((i) => i.id === id)!;
        const c = canApprove(it, ref.current.currentUser);
        if (!c.ok) {
          toast.error(c.reason);
          return;
        }
        update(id, (i, s) => approve(i, s.currentUser));
        toast.success("Approved — posting unlocked for this exact package");
      },
      requestChanges: (id: string, note: string) => {
        update(id, (i, s) => requestChanges(i, s.currentUser, note));
        toast("Sent back to Editing with your note");
      },
      requestFootage: (id: string, sceneId: string) =>
        update(id, (i, s) =>
          log(
            {
              ...applyEdit(
                i,
                {
                  scenes: i.scenes.map((sc) =>
                    sc.id === sceneId ? { ...sc, source: "requested" } : sc,
                  ),
                },
                s.currentUser,
              ),
              footageRequest: {
                status: "requested",
                note: "Local footage request — no message sent to the gym team.",
                requestedAt: Date.now(),
              },
              blockers: ["Needs uploaded human footage"],
            },
            s.currentUser,
            "Marked a scene as needing real footage (demo)",
            "system",
          ),
        ),
      uploadFootage: (id: string) =>
        update(id, (i, s) =>
          log(
            {
              ...applyEdit(
                i,
                {
                  scenes: i.scenes.map((sc) =>
                    sc.source === "requested" ? { ...sc, source: "uploaded" } : sc,
                  ),
                },
                s.currentUser,
              ),
              ...(i.footageRequest
                ? { footageRequest: { ...i.footageRequest, status: "uploaded" as const } }
                : {}),
              blockers: [],
            },
            s.currentUser,
            "Simulated human-footage upload; no file transferred",
            "system",
          ),
        ),
      steer: async (id: string, text: string) => {
        const it = ref.current.items.find((i) => i.id === id);
        const by = ref.current.currentUser;
        if (!it || !text.trim()) return;
        update(id, (i) =>
          log(
            { ...i, paused: true, replanning: true, task: "Replanning…" },
            by,
            `Direction: “${text}”`,
            "steer",
          ),
        );
        const token = ++sequence.current;
        steering.current.set(id, token);
        let plan;
        try {
          plan = await adapter.steer(it, text, by);
        } catch {
          if (steering.current.get(id) === token)
            update(id, (i) =>
              log(
                { ...i, replanning: false, paused: true, task: "Replan failed — retry steering" },
                "system",
                "Simulated replan failed; item remains paused",
                "gate",
              ),
            );
          return;
        }
        if (steering.current.get(id) !== token) return;
        update(id, (i) =>
          log(
            { ...i, replanning: false, task: plan.task, latestUpdate: plan.reply },
            "muninn",
            plan.reply,
            "agent",
          ),
        );
      },
      createIdea: (brand: Brand, title: string, angle: string, provenance?: string) => {
        if (dirtyRef.current) {
          toast.error("Save or discard your edits before creating a brief");
          return false;
        }
        const it = newIdea(brand, title, angle, Date.now(), provenance);
        it.activity = it.activity.map((a) => ({ ...a, actor: ref.current.currentUser }));
        setState((s) => ({
          ...s,
          items: [it, ...s.items],
          selectedId: it.id,
          brandFilter: s.brandFilter === "both" || s.brandFilter === brand ? s.brandFilter : brand,
        }));
        toast.success(`“${title}” added to Research`);
        return true;
      },
      reset: () => {
        steering.current.clear();
        setDirtyItemId(null);
        setResetKey((k) => k + 1);
        adapter.clear();
        setState(createSeed());
        toast("Demo reset");
      },
    }),
    [update, adapter],
  );

  return { state, actions, dirtyItemId, resetKey };
}

type Ctx = ReturnType<typeof useFactoryState>;
const FactoryCtx = createContext<Ctx | null>(null);

export function FactoryProvider({
  children,
  adapter = demoAdapter,
}: {
  children: ReactNode;
  adapter?: ContentFactoryAdapter;
}) {
  if (adapter.mode !== "demo")
    throw new Error(
      "Live adapters require server-authorized approvals and dispatch; this build supports demo mode only.",
    );
  const v = useFactoryState(adapter);
  return <FactoryCtx.Provider value={v}>{children}</FactoryCtx.Provider>;
}

export function useFactory() {
  const c = useContext(FactoryCtx);
  if (!c) throw new Error("useFactory outside FactoryProvider");
  const { state } = c;
  const visible = state.items.filter(
    (i) => state.brandFilter === "both" || i.brand === state.brandFilter,
  );
  const selected = state.items.find((i) => i.id === state.selectedId) ?? visible[0];
  return { ...c, visible, selected };
}
