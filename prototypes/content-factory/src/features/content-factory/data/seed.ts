// Realistic DEMO seed across all stages and both brands.
import { packageSignature } from "../logic/gate";
import type {
  Brand,
  ContentItem,
  Destination,
  FactoryState,
  ImageKey,
  Platform,
  Scene,
  Stage,
} from "../types";

const MIN = 60_000;

export function defaultDestinations(brand: Brand): Destination[] {
  if (brand === "wonplace") {
    const h: Record<Platform, string> = {
      linkedin: "WonPlace page",
      facebook: "WonPlace",
      instagram: "@wonplaceapp",
      youtube: "@wonplaceapp",
      tiktok: "@wonplaceapp",
      x: "@wonplaceapp",
    };
    return (Object.keys(h) as Platform[]).map((p) => ({
      platform: p,
      handle: h[p],
      enabled: true,
      configured: true,
      status: "needs_approval",
      attempts: 0,
    }));
  }
  return [
    {
      platform: "linkedin",
      handle: "TideLine company page",
      enabled: true,
      configured: true,
      sourceOnly: true,
      status: "held",
      attempts: 0,
      note: "Source-only example — existing TideLine company LinkedIn route; never dispatched to itself",
    },
    ...(["facebook", "instagram", "youtube", "tiktok", "x"] as Platform[]).map((p) => ({
      platform: p,
      handle: "TideLine · not connected",
      enabled: true,
      configured: false,
      status: "not_configured" as const,
      attempts: 0,
      note: "Destination not connected — held until connected",
    })),
  ];
}

export function defaultCaptions(brand: Brand, title: string): Record<Platform, string> {
  if (brand === "wonplace")
    return {
      linkedin: `${title}: how gyms keep athletes by making skill progress visible to parents. Built by TideLine.`,
      facebook: `Parents stay when they can see progress. ${title} — here's how our coaches share it every week.`,
      instagram: `From wobbles to wow 🤸 ${title} #gymnastics #coaching`,
      youtube: `${title} | Showing skill progress so athletes (and parents) stay`,
      tiktok: `POV: your kid's coach sends a progress update 📲 #gymtok`,
      x: `Retention in gyms isn't magic. It's visible progress + proactive parent updates.`,
    };
  return {
    linkedin: `${title} — a practical system for owner-led service businesses.`,
    facebook: `${title}: one operator lesson you can use this week.`,
    instagram: `${title} #smallbusiness #operations`,
    youtube: `${title} | Operator lesson`,
    tiktok: `${title} in 30 seconds`,
    x: `${title}. Thread on what actually worked.`,
  };
}

function scenes(brand: Brand, requested = false): Scene[] {
  const wp: [string, ImageKey, string][] = [
    ["Stronger today", "wp-smile", "Stronger today than last month"],
    ["Handstand check", "wp-coach", "Coach logs the skill"],
    ["Small steps", "wp-floor", "Small steps, big changes"],
    ["Beam balance", "wp-beam", ""],
    ["Parent update", "wp-parent", "Parents see it the same day"],
  ];
  const tl: [string, ImageKey, string][] = [
    ["Monday board", "tl-operator", "Every job, one board"],
    ["Process wall", "tl-board", "Lead → schedule → follow up"],
    ["Follow-up text", "tl-field", "Customers hear back same day"],
    ["Pipeline view", "tl-board", ""],
  ];
  const src = brand === "wonplace" ? wp : tl;
  return src.map(([label, image, overlay], i) => ({
    id: `sc${i}`,
    label,
    image,
    overlay,
    duration: [4, 6, 7, 9, 6][i] ?? 5,
    source: requested && i === 1 ? "requested" : i === 3 ? "uploaded" : "generated",
  }));
}

interface Spec {
  id: string;
  brand: Brand;
  stage: Stage;
  title: string;
  campaign: string;
  image: ImageKey;
  progress?: number;
  task: string;
  subtitle?: string;
  hook?: string;
  requested?: boolean;
  blockers?: string[];
}

function make(s: Spec, now: number): ContentItem {
  const versions = [
    {
      id: "v1",
      rev: 1,
      label: "Cut 1",
      at: now - 160 * MIN,
      by: "muninn" as const,
      note: "First assembly from script",
      duration: 34,
    },
    {
      id: "v2",
      rev: 2,
      label: "Cut 2",
      at: now - 70 * MIN,
      by: "muninn" as const,
      note: "Tightened to 32s, stronger opening",
      duration: 32,
    },
  ];
  return {
    id: s.id,
    brand: s.brand,
    campaign: s.campaign,
    title: s.title,
    subtitle: s.subtitle ?? "",
    stage: s.stage,
    image: s.image,
    task: s.task,
    progress: s.progress ?? 0.3,
    owner: s.stage === "approval" ? "you" : "muninn",
    latestUpdate: `${s.task}…`,
    blockers: s.blockers ?? [],
    paused: false,
    hook:
      s.hook ??
      (s.brand === "wonplace"
        ? "Parents don't leave gyms. They leave when they can't see progress."
        : "Your schedule is your sales team."),
    script:
      s.brand === "wonplace"
        ? "1. Open on an athlete holding a handstand.\n2. Coach taps the skill as 'achieved' in WonPlace.\n3. Parent gets the update before pickup.\n4. Close: visible progress keeps athletes training — and retaining."
        : "1. Open on a messy whiteboard.\n2. Show the one-board weekly schedule.\n3. Same-day follow-up text template.\n4. Close: systems, not hustle, win repeat work.",
    brief:
      s.brand === "wonplace"
        ? "Show program directors how visible skill progress plus proactive parent updates reduce drop-off between sessions."
        : "Teach one operator system with real product proof, aimed at owners who are the bottleneck.",
    goal: s.brand === "wonplace" ? "Awareness → Retention" : "Trust → Qualified conversation",
    captions: defaultCaptions(s.brand, s.title),
    destinations: defaultDestinations(s.brand),
    schedule: "2026-10-28T17:30",
    thumbnail: s.image,
    scenes: scenes(s.brand, s.requested),
    versions,
    selectedVersionId: "v2",
    revision: 3,
    approval: null,
    staleApproval: null,
    activity: [
      {
        id: `${s.id}a3`,
        at: now - 2 * MIN,
        actor: "muninn",
        text: `${s.task} (simulated)`,
        kind: "agent",
      },
      {
        id: `${s.id}a2`,
        at: now - 14 * MIN,
        actor: "you",
        text: "Added a new scene and updated caption.",
        kind: "edit",
      },
      {
        id: `${s.id}a1`,
        at: now - 38 * MIN,
        actor: "cody",
        text: "Looks good — perhaps a stronger closing line?",
        kind: "steer",
      },
    ],
    sources:
      s.brand === "wonplace"
        ? [
            "Coach interviews (3)",
            "Parent survey · demo",
            "Enrollment drop-off notes",
            "Competitor gym posts",
          ]
        : [
            "Operator call notes",
            "Scheduling teardown",
            "Customer follow-up examples",
            "Forum threads",
          ],
    createdAt: now - 3 * 24 * 60 * MIN,
  };
}

export function createSeed(now = Date.now()): FactoryState {
  const specs: Spec[] = [
    {
      id: "wp-confidence",
      brand: "wonplace",
      stage: "research",
      title: "Building confidence",
      campaign: "Skill progression series",
      image: "wp-smile",
      progress: 0.4,
      task: "Clustering angles",
    },
    {
      id: "tl-quotes",
      brand: "tideline",
      stage: "research",
      title: "Quotes that close",
      campaign: "Operator lessons",
      image: "tl-field",
      progress: 0.2,
      task: "Collecting sources",
    },
    {
      id: "wp-wobbles",
      brand: "wonplace",
      stage: "scripting",
      title: "From wobbles to wow",
      campaign: "Skill progression series",
      image: "wp-floor",
      progress: 0.55,
      task: "Tightening script",
      hook: "Every wobble is data. Here's how coaches turn it into a level-up.",
    },
    {
      id: "tl-board",
      brand: "tideline",
      stage: "scripting",
      title: "One board, every job",
      campaign: "Operator lessons",
      image: "tl-board",
      progress: 0.3,
      task: "Drafting hook options",
    },
    {
      id: "wp-scenes",
      brand: "wonplace",
      stage: "filming",
      title: "Coach check-ins, on camera",
      campaign: "Parent communication",
      image: "wp-coach",
      progress: 0.5,
      task: "Waiting on real footage",
      requested: true,
      blockers: ["Needs uploaded human footage"],
    },
    {
      id: "tl-proof",
      brand: "tideline",
      stage: "filming",
      title: "Real product proof: follow-ups",
      campaign: "Product proof",
      image: "tl-operator",
      progress: 0.35,
      task: "Generating voiceover",
    },
    {
      id: "tl-missed",
      brand: "tideline",
      stage: "editing",
      title: "The missed-call gap",
      campaign: "Product proof",
      image: "tl-field",
      progress: 0.45,
      task: "Adding caption overlays",
      hook: "Every missed call needs an owner and a next step.",
    },
    {
      id: "wp-training",
      brand: "wonplace",
      stage: "editing",
      title: "Training / Retaining",
      subtitle: "How consistent progress builds confidence — and keeps athletes in the gym.",
      campaign: "Training / Retaining",
      image: "wp-beam",
      progress: 0.6,
      task: "Refining opening hook",
    },
    {
      id: "wp-progress",
      brand: "wonplace",
      stage: "approval",
      title: "Progress keeps them here",
      campaign: "Training / Retaining",
      image: "wp-parent",
      progress: 1,
      task: "Awaiting human approval",
    },
    {
      id: "tl-sched",
      brand: "tideline",
      stage: "approval",
      title: "Your schedule is your sales team",
      campaign: "Operator lessons",
      image: "tl-operator",
      progress: 1,
      task: "Awaiting human approval",
    },
    {
      id: "wp-stronger",
      brand: "wonplace",
      stage: "posting",
      title: "Stronger athletes, brighter futures",
      campaign: "Skill progression series",
      image: "wp-floor",
      progress: 0.3,
      task: "Dispatching approved package",
    },
    {
      id: "tl-lesson",
      brand: "tideline",
      stage: "posting",
      title: "Same-day follow-up",
      campaign: "Operator lessons",
      image: "tl-field",
      progress: 0.5,
      task: "Dispatching approved package",
    },
    {
      id: "wp-levels",
      brand: "wonplace",
      stage: "analytics",
      title: "Level-up day",
      campaign: "Skill progression series",
      image: "wp-smile",
      progress: 0.7,
      task: "Drafting insights",
    },
    {
      id: "tl-bottleneck",
      brand: "tideline",
      stage: "analytics",
      title: "Stop being the bottleneck",
      campaign: "Operator lessons",
      image: "tl-board",
      progress: 1,
      task: "Insights ready",
    },
  ];
  const items = specs.map((s) => make(s, now));
  for (const it of items) {
    if (it.id === "wp-training")
      it.subtitle = "How consistent progress builds confidence — and keeps athletes in the gym.";
    if (it.stage === "posting" || it.stage === "analytics") {
      it.approval = {
        by: it.brand === "wonplace" ? "cody" : "you",
        at: now - 90 * MIN,
        revision: it.revision,
        signature: packageSignature(it),
      };
      it.destinations = it.destinations.map((d) => {
        if (d.sourceOnly || !d.configured) return d;
        if (it.stage === "analytics")
          return {
            ...d,
            status: "published",
            receipt: {
              id: `SIM-${d.platform.toUpperCase()}-${it.id.slice(-4)}`,
              at: now - 80 * MIN,
              simulated: true,
            },
            note: "Simulated receipt — not a real post",
          };
        return {
          ...d,
          status: d.platform === "linkedin" || d.platform === "facebook" ? "scheduled" : "queued",
        };
      });
    }
    if (it.id === "tl-lesson") it.blockers = [];
  }
  return {
    version: 1,
    items,
    selectedId: "wp-training",
    brandFilter: "both",
    factoryPaused: true,
    currentUser: "you",
  };
}

export function newIdea(
  brand: Brand,
  title: string,
  angle: string,
  now = Date.now(),
  provenance?: string,
): ContentItem {
  const it = make(
    {
      id: `idea-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      brand,
      stage: "research",
      title,
      campaign: brand === "wonplace" ? "New ideas" : "Operator lessons",
      image: brand === "wonplace" ? "wp-floor" : "tl-operator",
      progress: 0,
      task: "Collecting sources",
    },
    now,
  );
  return {
    ...it,
    brief: angle || it.brief,
    ...(provenance ? { provenance } : {}),
    revision: 1,
    versions: [],
    selectedVersionId: "",
    activity: [
      {
        id: `${it.id}-c`,
        at: now,
        actor: "you",
        text: provenance ? `Created brief from insight: ${provenance}` : "Created new idea",
        kind: "system",
      },
    ],
  };
}
