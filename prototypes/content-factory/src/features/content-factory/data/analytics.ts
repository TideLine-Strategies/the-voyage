// ILLUSTRATIVE DEMO analytics. Not pulled from any platform.
import { PLATFORMS } from "../constants";
import type { Brand, BrandFilter, Platform, PlatformMetrics } from "../types";

const BASE: Record<Brand, PlatformMetrics[]> = {
  wonplace: [
    {
      platform: "linkedin",
      views: 8400,
      watchHours: 31.7,
      completion: null,
      engagement: 0.048,
      clicks: 212,
    },
    {
      platform: "facebook",
      views: 18700,
      watchHours: 81.7,
      completion: 0.31,
      engagement: 0.039,
      clicks: 341,
    },
    {
      platform: "instagram",
      views: 52100,
      watchHours: 210.0,
      completion: 0.42,
      engagement: 0.062,
      clicks: null,
    },
    {
      platform: "youtube",
      views: 41300,
      watchHours: 190.0,
      completion: 0.55,
      engagement: 0.051,
      clicks: 188,
    },
    {
      platform: "tiktok",
      views: 96800,
      watchHours: 338.3,
      completion: 0.38,
      engagement: 0.076,
      clicks: null,
    },
    {
      platform: "x",
      views: 12900,
      watchHours: null,
      completion: null,
      engagement: 0.029,
      clicks: 97,
    },
  ],
  tideline: [
    {
      platform: "linkedin",
      views: 24300,
      watchHours: 118.3,
      completion: null,
      engagement: 0.052,
      clicks: 460,
    },
    {
      platform: "facebook",
      views: null,
      watchHours: null,
      completion: null,
      engagement: null,
      clicks: null,
    },
    {
      platform: "instagram",
      views: null,
      watchHours: null,
      completion: null,
      engagement: null,
      clicks: null,
    },
    {
      platform: "youtube",
      views: null,
      watchHours: null,
      completion: null,
      engagement: null,
      clicks: null,
    },
    {
      platform: "tiktok",
      views: null,
      watchHours: null,
      completion: null,
      engagement: null,
      clicks: null,
    },
    {
      platform: "x",
      views: null,
      watchHours: null,
      completion: null,
      engagement: null,
      clicks: null,
    },
  ],
};

export const RANGE_SCALE: Record<string, number> = { "7d": 0.26, "30d": 1, "90d": 2.7 };

/** CRM-sourced outcomes (demo). Followers are never counted as leads. */
export const CRM_OUTCOMES: Record<
  Brand,
  { conversations: number; accounts: number; demos: number; customers: number }
> = {
  wonplace: { conversations: 31, accounts: 18, demos: 9, customers: 3 },
  tideline: { conversations: 14, accounts: 9, demos: 4, customers: 1 },
};

const add = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : a + b);

export function metricsFor(brand: BrandFilter, range: string): PlatformMetrics[] {
  const k = RANGE_SCALE[range] ?? 1;
  const brands: Brand[] = brand === "both" ? ["wonplace", "tideline"] : [brand];
  return PLATFORMS.map(({ id }) => {
    const rows = brands.map((b) => BASE[b].find((r) => r.platform === id)!);
    const views = rows.reduce<number | null>((s, r) => add(s, r.views), null);
    const scale = (n: number | null) => (n == null ? null : Math.round(n * k));
    // Rates are per-platform and never summed; when both brands report, use view-weighted average.
    const rate = (key: "completion" | "engagement") => {
      const r = rows.filter((x) => x[key] != null && x.views != null);
      if (!r.length) return null;
      const w = r.reduce((s, x) => s + x.views!, 0);
      return w ? r.reduce((s, x) => s + x[key]! * x.views!, 0) / w : null;
    };
    return {
      platform: id,
      views: scale(views),
      watchHours: scale(rows.reduce<number | null>((s, r) => add(s, r.watchHours), null)),
      completion: rate("completion"),
      engagement: rate("engagement"),
      clicks: scale(rows.reduce<number | null>((s, r) => add(s, r.clicks), null)),
    };
  });
}

export function series(platform: Platform, range: string): number[] {
  const n = range === "7d" ? 7 : range === "90d" ? 30 : 15;
  let seed = platform.charCodeAt(0) * 31 + platform.length;
  return Array.from({ length: n }, (_, i) => {
    seed = (seed * 9301 + 49297) % 233280;
    return 40 + i * 2 + (seed / 233280) * 30;
  });
}

export function outcomes(brand: BrandFilter, range: string) {
  const k = RANGE_SCALE[range] ?? 1;
  const bs: Brand[] = brand === "both" ? ["wonplace", "tideline"] : [brand];
  const sum = (key: keyof (typeof CRM_OUTCOMES)["wonplace"]) =>
    Math.round(bs.reduce((s, b) => s + CRM_OUTCOMES[b][key], 0) * k);
  return {
    conversations: sum("conversations"),
    accounts: sum("accounts"),
    demos: sum("demos"),
    customers: sum("customers"),
  };
}

export const INSIGHTS = [
  {
    id: "ins1",
    brand: "wonplace" as Brand,
    title: "Skill-progress clips hold attention",
    body: "Videos opening on a named skill milestone show the highest completion on YouTube and Instagram (demo).",
    source: "Analytics · Skill progression series · YouTube + Instagram completion",
  },
  {
    id: "ins2",
    brand: "wonplace" as Brand,
    title: "Parent updates drive clicks on Facebook",
    body: "Posts showing the parent message flow earned the most link clicks on Facebook (demo).",
    source: "Analytics · Parent communication · Facebook clicks",
  },
  {
    id: "ins3",
    brand: "tideline" as Brand,
    title: "Operator lessons start conversations",
    body: "Practical scheduling lessons on the TideLine company page led to qualified conversations logged in CRM (demo).",
    source: "Analytics · TideLine company LinkedIn · CRM conversations",
  },
];
