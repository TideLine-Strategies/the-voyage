import type { Brand, DeliveryStatus, Platform, Stage } from "./types";

export const STAGES: { id: Stage; label: string; hint: string }[] = [
  { id: "research", label: "Research", hint: "Find angles & evidence" },
  { id: "scripting", label: "Scripting", hint: "Hook and script" },
  { id: "filming", label: "Filming / Generation", hint: "Generate scenes or request footage" },
  { id: "editing", label: "Editing", hint: "Assemble and refine" },
  { id: "approval", label: "Human approval", hint: "You or Cody approve" },
  { id: "posting", label: "Posting", hint: "Deliver to destinations" },
  { id: "analytics", label: "Analytics", hint: "Measure and learn" },
];

export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.id === s);
export const stageLabel = (s: Stage) => STAGES[stageIndex(s)]!.label;

export const PLATFORMS: { id: Platform; label: string; short: string }[] = [
  { id: "linkedin", label: "LinkedIn", short: "in" },
  { id: "facebook", label: "Facebook", short: "f" },
  { id: "instagram", label: "Instagram", short: "ig" },
  { id: "youtube", label: "YouTube", short: "yt" },
  { id: "tiktok", label: "TikTok", short: "tt" },
  { id: "x", label: "X", short: "x" },
];
export const platformLabel = (p: Platform) => PLATFORMS.find((x) => x.id === p)!.label;

export const BRANDS: Record<
  Brand,
  { label: string; promise: string; audience: string; voice: string; credit?: string }
> = {
  tideline: {
    label: "TideLine",
    promise: "Practical systems for owner-led service businesses.",
    audience: "Owners and operators of service businesses (trades, home services, studios).",
    voice:
      "Useful operator lessons and real product proof that build trust and qualified conversations.",
  },
  wonplace: {
    label: "WonPlace",
    promise:
      "Run classes, enrollment, skill progress and parent communication in one gym-first place.",
    audience: "Gym owners, coaches and program directors.",
    voice:
      "Gym-first and concrete. Talk about classes, levels, skills and parents — never generic fitness.",
    credit: "Built by TideLine.",
  },
};

export const FUNNEL = [
  "Useful content",
  "Product proof",
  "Qualified conversation",
  "CRM Account + next step",
  "Demo",
  "Paying customer",
];

export const DELIVERY_LABEL: Record<DeliveryStatus, string> = {
  not_configured: "Not connected · held",
  needs_approval: "Needs approval",
  queued: "Queued",
  scheduled: "Scheduled at provider",
  published: "Published · receipt",
  failed: "Failed",
  held: "Held for reconciliation",
};
