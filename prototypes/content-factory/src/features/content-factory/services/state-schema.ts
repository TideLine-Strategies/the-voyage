import { z } from "zod";
const platform = z.enum(["linkedin", "facebook", "instagram", "youtube", "tiktok", "x"]);
const actor = z.enum(["you", "cody", "muninn", "system"]);
const image = z.enum([
  "wp-beam",
  "wp-smile",
  "wp-coach",
  "wp-floor",
  "wp-parent",
  "tl-operator",
  "tl-field",
  "tl-board",
]);
const approval = z.object({
  by: z.enum(["you", "cody"]),
  at: z.number().finite(),
  revision: z.number().int().positive(),
  signature: z.string(),
});
const strings = z.string();
const number = z.number().finite();
const item = z.object({
  id: strings,
  brand: z.enum(["tideline", "wonplace"]),
  campaign: strings,
  title: strings,
  subtitle: strings,
  stage: z.enum([
    "research",
    "scripting",
    "filming",
    "editing",
    "approval",
    "posting",
    "analytics",
  ]),
  image,
  task: strings,
  progress: number.min(0).max(1),
  owner: actor,
  latestUpdate: strings,
  blockers: z.array(strings),
  paused: z.boolean(),
  replanning: z.boolean().optional(),
  hook: strings,
  script: strings,
  brief: strings,
  goal: strings,
  captions: z.object({
    linkedin: strings,
    facebook: strings,
    instagram: strings,
    youtube: strings,
    tiktok: strings,
    x: strings,
  }),
  destinations: z.array(
    z.object({
      platform,
      handle: strings,
      enabled: z.boolean(),
      configured: z.boolean(),
      sourceOnly: z.boolean().optional(),
      status: z.enum([
        "not_configured",
        "needs_approval",
        "queued",
        "scheduled",
        "published",
        "failed",
        "held",
      ]),
      receipt: z.object({ id: strings, at: number, simulated: z.literal(true) }).optional(),
      note: strings.optional(),
      attempts: number.int().min(0),
    }),
  ),
  schedule: strings,
  thumbnail: image,
  scenes: z
    .array(
      z.object({
        id: strings,
        label: strings,
        duration: number.positive(),
        source: z.enum(["generated", "uploaded", "requested"]),
        image,
        overlay: strings.optional(),
      }),
    )
    .min(1),
  versions: z.array(
    z.object({
      id: strings,
      rev: number.int(),
      label: strings,
      at: number,
      by: actor,
      note: strings,
      duration: number.positive(),
    }),
  ),
  selectedVersionId: strings,
  revision: number.int().positive(),
  approval: approval.nullable(),
  staleApproval: approval
    .extend({ invalidatedAt: number, changes: z.array(strings), invalidatedBy: actor })
    .nullable(),
  activity: z.array(
    z.object({
      id: strings,
      at: number,
      actor,
      text: strings,
      kind: z.enum(["steer", "approval", "gate", "edit", "agent", "posting", "system"]).optional(),
    }),
  ),
  footageRequest: z
    .object({ status: z.enum(["requested", "uploaded"]), note: strings, requestedAt: number })
    .optional(),
  sources: z.array(strings).optional(),
  provenance: strings.optional(),
  createdAt: number,
});
export const stateSchema = z
  .object({
    version: z.literal(1),
    items: z.array(item).min(1),
    selectedId: strings,
    brandFilter: z.enum(["both", "tideline", "wonplace"]),
    factoryPaused: z.boolean(),
    currentUser: z.enum(["you", "cody"]),
  })
  .refine(
    (s) =>
      s.items.some(
        (i) => i.id === s.selectedId && (s.brandFilter === "both" || i.brand === s.brandFilter),
      ) && new Set(s.items.map((i) => i.id)).size === s.items.length,
    "Invalid selection or duplicate item ids",
  );
