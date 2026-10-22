import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Bot,
  Building2,
  ChevronRight,
  Compass,
  Factory,
  Home,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Coverflow } from "./components/Coverflow";
import { ItemCockpit } from "./components/ItemCockpit";
import { ApprovalPanel } from "./components/ApprovalPanel";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { ScenePreview } from "./components/ScenePreview";
import { FactoryProvider, useFactory } from "./store";
import { BRANDS } from "./constants";
import type { Brand, BrandFilter } from "./types";
export default function FactoryPage() {
  return (
    <FactoryProvider>
      <FactoryWorkspace />
      <Toaster richColors position="bottom-right" />
    </FactoryProvider>
  );
}
function FactoryWorkspace() {
  const { state, actions, visible, dirtyItemId } = useFactory();
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [brand, setBrand] = useState<Brand>("wonplace");
  const [title, setTitle] = useState("");
  const [angle, setAngle] = useState("");
  const [notice, setNotice] = useState("");
  const review = visible.filter((i) => i.stage === "approval").length;
  return (
    <div className="factory-layout">
      <a className="skip-link" href="#factory-main">
        Skip to content factory
      </a>
      <aside className="factory-sidebar">
        <a className="voyage-wordmark" href="#factory-main">
          Voyage<span>THE WORKSPACE</span>
        </a>
        <nav aria-label="Voyage workspace">
          {[
            { label: "Home", icon: Home },
            { label: "Accounts", icon: Compass },
            { label: "Content", icon: Factory },
            { label: "Company", icon: Building2 },
            { label: "Muninn", icon: Bot },
          ].map(({ label, icon: Icon }) => (
            <button
              key={label}
              aria-current={label === "Content" ? "page" : undefined}
              onClick={() =>
                label === "Content"
                  ? document.querySelector("#factory-main")?.scrollIntoView()
                  : label === "Muninn"
                    ? document
                        .querySelector("#selected-cockpit")
                        ?.scrollIntoView({ block: "start" })
                    : setNotice(label)
              }
            >
              <Icon className="size-4" />
              <span>{label}</span>
              {label === "Content" && <ChevronRight className="ml-auto size-3" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="demo-pill">LOCAL DEMO</span>
          <p>Built by TideLine</p>
          <p className="mt-1">Content, with a next step.</p>
        </div>
      </aside>
      <main id="factory-main" className="factory-main">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">CONTENT / PRODUCTION</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
              Content factory<span className="text-primary">.</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Good ideas in. Useful content out. A human in the loop.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold">
              Reviewing as
              <select
                className="field mt-1"
                aria-label="Demo current user"
                value={state.currentUser}
                onChange={(e) => actions.setUser(e.target.value as "you" | "cody")}
              >
                <option value="you">You</option>
                <option value="cody">Cody</option>
              </select>
            </label>
            <Button variant="outline" onClick={actions.toggleFactory}>
              {state.factoryPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
              {state.factoryPaused ? "Resume factory" : "Pause factory"}
            </Button>
            <Button onClick={() => setIdeaOpen(true)}>
              <Plus className="size-4" />
              New idea
            </Button>
          </div>
        </header>
        {notice && (
          <div
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm"
            role="status"
          >
            <p>
              <strong>{notice}</strong> stays in your existing Voyage CRM. This separate prototype
              contains Content only.{" "}
              <a
                className="font-semibold text-primary underline"
                href="https://voyage.tidelinestrats.com/"
                target="_blank"
                rel="noreferrer"
              >
                Open Voyage
              </a>
            </p>
            <button aria-label="Dismiss workspace notice" onClick={() => setNotice("")}>
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="segmented" role="group" aria-label="Content brand filter">
            {(["both", "tideline", "wonplace"] as BrandFilter[]).map((b) => (
              <button
                key={b}
                aria-pressed={state.brandFilter === b}
                onClick={() => actions.setBrand(b)}
              >
                {b === "both" ? "Both brands" : BRANDS[b].label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{visible.length} pieces</span>
            <span className="rounded-full bg-warning-soft px-2 py-1 font-semibold text-foreground">
              {review} awaiting review
            </span>
            <Button size="sm" variant="ghost" onClick={actions.reset}>
              <RotateCcw className="size-3" />
              Reset demo
            </Button>
          </div>
        </div>
        <div className="mb-5 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed bg-card/60 px-4 py-2.5 text-xs">
          <p>
            <span className="demo-pill mr-2">DEMO MODE</span>
            {state.factoryPaused
              ? "Paused for review. Progression and dispatch are stopped."
              : "Simulated activity is running. You can interrupt every working stage."}
          </p>
          <span className="text-muted-foreground">
            Local memory · no real posts, accounts or analytics
          </span>
        </div>
        <Coverflow />
        <div className="mb-4 mt-8 flex items-end justify-between">
          <div>
            <p className="eyebrow">SELECTED ITEM</p>
            <h2 className="mt-1 text-xl font-bold">Make the next version better</h2>
          </div>
          <span className="text-xs text-muted-foreground">Saved locally in this browser</span>
        </div>
        <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)]">
          <div className="min-w-0" id="selected-cockpit">
            <ScenePreview />
            <ItemCockpit />
          </div>
          <ApprovalPanel key={state.selectedId} />
        </div>
        <AnalyticsPanel />
        <footer className="py-6 text-center text-xs text-muted-foreground">
          Useful content → product proof → qualified conversation → Account + next step → demo →
          customer.
        </footer>
      </main>
      <Dialog.Root open={ideaOpen} onOpenChange={setIdeaOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-6 shadow-card">
            <Dialog.Title className="text-2xl font-bold">Start with a useful idea</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-muted-foreground">
              Create a local research brief for one brand. Nothing is posted or sent.
            </Dialog.Description>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (actions.createIdea(brand, title.trim(), angle.trim())) {
                  setTitle("");
                  setAngle("");
                  setIdeaOpen(false);
                }
              }}
            >
              <label className="block text-sm font-semibold">
                Brand
                <select
                  className="field mt-1 w-full"
                  aria-label="New idea brand"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as Brand)}
                >
                  <option value="wonplace">WonPlace</option>
                  <option value="tideline">TideLine</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Idea title
                <input
                  className="field mt-1 w-full"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="A specific lesson your customer can use"
                />
              </label>
              <label className="block text-sm font-semibold">
                Angle or evidence
                <textarea
                  className="field mt-1 min-h-28 w-full"
                  value={angle}
                  onChange={(e) => setAngle(e.target.value)}
                  placeholder="Who is this for, what should they learn, and what proves it?"
                />
              </label>
              {dirtyItemId && (
                <p className="text-sm text-primary">
                  Save or discard the current item's edits first.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button type="submit" disabled={!title.trim() || !!dirtyItemId}>
                  Create research brief
                </Button>
              </div>
            </form>
            <Dialog.Close className="absolute right-4 top-4" aria-label="Close new idea">
              <X className="size-5" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
