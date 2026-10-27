import { build } from "esbuild";
// Called only by managed release after the protected revision is deployed.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
if (!process.env.AGENT_RELEASE_TASK || !process.env.AGENT_RELEASE_COMMIT)
  throw Error("Managed release required");
const config = process.env.COMPANY_OPERATIONS_CONFIG,
  media = process.env.CONTENT_MEDIA_MANIFEST,
  base = process.env.CONTENT_RESEARCH_BASE;
if (!config || !base || (await fs.stat(config)).mode & 0o077)
  throw Error("Private company configuration and research base required");
const bundles = [
  "content-agent-pass",
  "content-production-pass",
  "content-analytics-pass",
  "content-operator-tick",
  "content-research-refresh",
  "content-sync",
];
const root = path.join(
  os.homedir(),
  "Library/Application Support/TideLine/Content Factory Operator",
);
for (const d of ["src", "scripts"])
  await fs.mkdir(path.join(root, d), { recursive: true, mode: 0o700 });
for (const file of [
  "src/company-ops.js",
  "src/company-metrics.js",
  "src/company-events.js",
  "src/content-ops.js",
  "src/content-cadence.js",
  "src/content.js",
  "src/content-production.js",
  "src/content-platforms.js",
  "src/content-pipeline.js",
  "src/content-package.js",
  "src/content-analytics.js",
  "src/content-agent-docs.js",
  "src/content-media.js",
  "scripts/content-agent-pass.mjs",
  "scripts/content-production-pass.mjs",
  "scripts/content-analytics-pass.mjs",
  "scripts/content-native-snapshots.mjs",
  "scripts/content-native-intake.py",
  "scripts/content-native-browser.py",
  "scripts/content-sync.mjs",
  "scripts/content-research-refresh.mjs",
  "scripts/content-operator-tick.mjs",
])
  if (!bundles.some((name) => file === "scripts/" + name + ".mjs"))
    await fs.copyFile(file, path.join(root, file));
// Install self-contained Node bundles. Shared app features may add dependencies
// that the finite Mac workers do not otherwise install or need at runtime.
for (const script of bundles) {
  const target = path.join(root, "scripts", script + ".mjs"),
    staged = target + ".next-" + process.env.AGENT_RELEASE_TASK;
  await build({
    entryPoints: ["scripts/" + script + ".mjs"],
    outfile: staged,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["cloudflare:workers"],
    logLevel: "warning",
  });
  await fs.rename(staged, target);
}
await fs.writeFile(
  path.join(root, "package.json"),
  JSON.stringify({ type: "module", private: true }),
);
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const label = "com.tideline.content-factory-operator",
  file = path.join(os.homedir(), "Library/LaunchAgents", label + ".plist");
const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>/Users/stewartos/.local/bin/resource-run</string><string>--owner</string><string>content-factory-operator</string><string>--wait</string><string>240</string><string>--</string><string>${escape(process.execPath)}</string><string>scripts/content-operator-tick.mjs</string></array><key>WorkingDirectory</key><string>${escape(root)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>/Users/stewartos/.local/bin:/opt/homebrew/bin:/usr/bin:/bin</string><key>COMPANY_OPERATIONS_CONFIG</key><string>${escape(config)}</string><key>CONTENT_MEDIA_MANIFEST</key><string>${escape(media || "")}</string><key>CONTENT_RESEARCH_BASE</key><string>${escape(base)}</string></dict><key>StartInterval</key><integer>300</integer><key>RunAtLoad</key><true/><key>StandardOutPath</key><string>${escape(root + "/operator.log")}</string><key>StandardErrorPath</key><string>${escape(root + "/operator-error.log")}</string></dict></plist>`;
let previous;
try {
  previous = await fs.readFile(file, "utf8");
} catch {}
const uid = process.getuid();
let loaded = false;
try {
  execFileSync("launchctl", ["print", `gui/${uid}/${label}`], {
    stdio: "ignore",
  });
  loaded = true;
} catch {}
if (loaded && previous !== plist) {
  let tick;
  try {
    tick = JSON.parse(await fs.readFile(path.join(root, "tick.lock"), "utf8"));
  } catch {}
  if (tick?.pid && Date.now() - tick.at < 15 * 60000) {
    let alive = false;
    try {
      process.kill(tick.pid, 0);
      alive = true;
    } catch {}
    if (alive)
      throw Error(
        "Content operator has an active tick; configuration restart deferred for reconciliation",
      );
  }
}
await fs.writeFile(file, plist, { mode: 0o600 });
if (loaded && previous === plist) {
  console.log(
    "Refreshed content operator bundles atomically; existing worker and in-flight work preserved.",
  );
  process.exit(0);
}
try {
  execFileSync("launchctl", ["bootout", `gui/${uid}`, file], {
    stdio: "ignore",
  });
} catch {}
execFileSync("launchctl", ["bootstrap", `gui/${uid}`, file]);
console.log(
  "Installed bounded content operator: five-minute queue checks, six-hour public-feed refresh, one daily analytics decision.",
);
