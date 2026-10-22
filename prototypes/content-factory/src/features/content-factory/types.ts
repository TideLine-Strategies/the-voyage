// Typed domain model for the Voyage Content Factory.
// These shapes are the contract for future Voyage CRM APIs and the local publishing worker.

export type Brand = "tideline" | "wonplace";
export type BrandFilter = Brand | "both";

export type Stage =
  "research" | "scripting" | "filming" | "editing" | "approval" | "posting" | "analytics";

export type Platform = "linkedin" | "facebook" | "instagram" | "youtube" | "tiktok" | "x";

export type Person = "you" | "cody";
export type Actor = Person | "muninn" | "system";

export type DeliveryStatus =
  | "not_configured" // destination not connected; held
  | "needs_approval" // waiting on the human gate
  | "queued" // approved, waiting for dispatch
  | "scheduled" // accepted by the provider for a future time
  | "published" // published with a (simulated) receipt
  | "failed"
  | "held"; // held for reconciliation / stop

export interface Receipt {
  id: string;
  at: number;
  simulated: true;
}

export interface Destination {
  platform: Platform;
  handle: string;
  enabled: boolean;
  configured: boolean;
  /** Source-only record (e.g. TideLine company LinkedIn): never re-posted to itself. */
  sourceOnly?: boolean;
  status: DeliveryStatus;
  receipt?: Receipt;
  note?: string;
  attempts: number;
}

export type SceneSource = "generated" | "uploaded" | "requested";

export interface Scene {
  id: string;
  label: string;
  duration: number;
  source: SceneSource;
  image: ImageKey;
  overlay?: string;
}

export interface Version {
  id: string;
  rev: number;
  label: string;
  at: number;
  by: Actor;
  note: string;
  duration: number;
}

export interface Approval {
  by: Person;
  at: number;
  revision: number;
  signature: string;
}

export interface StaleApproval extends Approval {
  invalidatedAt: number;
  changes: string[];
  invalidatedBy: Actor;
}

export interface Activity {
  id: string;
  at: number;
  actor: Actor;
  text: string;
  kind?: "steer" | "approval" | "gate" | "edit" | "agent" | "posting" | "system";
}

export interface FootageRequest {
  status: "requested" | "uploaded";
  note: string;
  requestedAt: number;
}

export type MetricKey = "views" | "watchHours" | "completion" | "engagement" | "clicks";

export interface PlatformMetrics {
  platform: Platform;
  views: number | null;
  watchHours: number | null;
  completion: number | null; // rate 0-1
  engagement: number | null; // rate 0-1
  clicks: number | null;
}

export type ImageKey =
  | "wp-beam"
  | "wp-smile"
  | "wp-coach"
  | "wp-floor"
  | "wp-parent"
  | "tl-operator"
  | "tl-field"
  | "tl-board";

export interface ContentItem {
  id: string;
  brand: Brand;
  campaign: string;
  title: string;
  subtitle: string;
  stage: Stage;
  image: ImageKey;
  task: string;
  progress: number; // 0..1 within current stage
  owner: Actor;
  latestUpdate: string;
  blockers: string[];
  paused: boolean;
  replanning?: boolean;
  hook: string;
  script: string;
  brief: string;
  goal: string;
  captions: Record<Platform, string>;
  destinations: Destination[];
  schedule: string; // ISO local datetime (demo)
  thumbnail: ImageKey;
  scenes: Scene[];
  versions: Version[];
  selectedVersionId: string;
  revision: number;
  approval: Approval | null;
  staleApproval: StaleApproval | null;
  activity: Activity[];
  footageRequest?: FootageRequest;
  sources?: string[];
  provenance?: string;
  createdAt: number;
}

export interface FactoryState {
  version: 1;
  items: ContentItem[];
  selectedId: string;
  brandFilter: BrandFilter;
  factoryPaused: boolean;
  currentUser: Person;
}
