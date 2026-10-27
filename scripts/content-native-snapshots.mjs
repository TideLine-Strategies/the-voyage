// Host-side reads through the installed, lease-bound Safari controller. No provider APIs.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const bin = path.join(
  os.homedir(),
  "Library/Application Support/Loki/instant-runtime/bin",
);
const nativeCall = (name, args) => {
  const value = JSON.parse(
    execFileSync(path.join(bin, name), args, {
      encoding: "utf8",
      timeout: 20000,
      maxBuffer: 300000,
    }),
  );
  if (value.ok === false)
    throw Error(value.blocker || "Native controller refused");
  return value;
};
export async function nativeSnapshots(
  targets,
  dir,
  project = "voyage-factory-analytics",
  deps = {},
) {
  const call = deps.call || nativeCall,
    sleep =
      deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const snapshots = [],
    blockers = [];
  let lease,
    ownerChanged = false;
  try {
    lease = call("agent-wall", [
      "request",
      "voyage-factory-completion",
      project,
      "auto",
    ]);
    if (lease.status !== "granted" || !lease.windowId) {
      if (lease.status === "queued" && lease.id)
        try {
          call("browser-session", ["cancel", lease.id]);
        } catch {}
      if (project === "voyage-factory-analytics") ownerChanged = true;
      throw Error("Exact Safari window is queued or unavailable");
    }
    const args = ["--window-id", String(lease.windowId), "--lease", lease.id];
    const action = (cmd, extra = []) => {
      const checkpoint = call("agent-wall", ["checkpoint", lease.id]);
      if (checkpoint.yieldRequested)
        throw Error("Browser turn yielded to another waiting task");
      return call("safari-controller", [cmd, ...args, ...extra]);
    };
    let current = action("inspect").url;
    const stateFile = path.join(dir, "native-window.json");
    let old;
    try {
      old = JSON.parse(await fs.readFile(stateFile, "utf8"));
    } catch {}
    if (
      current !== "about:blank" &&
      current !== old?.lastUrl &&
      !targets.some((t) => t.url === current)
    ) {
      ownerChanged = true;
      throw Error("Owner changed the analytics window; preserve it");
    }
    for (const [index, target] of targets.slice(0, 6).entries()) {
      try {
        action("navigate", ["--expected-url", current, "--url", target.url]);
        current = target.url;
        await fs.writeFile(
          stateFile,
          JSON.stringify({ windowId: lease.windowId, lastUrl: current }),
          { mode: 0o600 },
        );
        let rendered;
        for (let attempt = 0; attempt < 6; attempt++) {
          await sleep(1000);
          rendered = action("read", ["--limit", "14000"]);
          if (rendered.url !== current)
            throw Error("Native URL changed or authentication is required");
          if (rendered.text?.length > 350) break;
        }
        if (
          !rendered?.text ||
          /^(Sign in|Log in|Join LinkedIn)/i.test(rendered.text.trim())
        )
          throw Error("Native post authentication/rendering unavailable");
        const images = [];
        for (let view = 0; view < 3; view++) {
          if (view) {
            const scroll = ["--expected-url", current, "--pixels", "650"];
            if (target.platform === "linkedin")
              scroll.push("--selector", "#workspace");
            try {
              const moved = action("scroll", scroll);
              if (
                target.platform === "linkedin" &&
                Number(moved.scrollTop) === 0
              )
                action("scroll", [
                  "--expected-url",
                  current,
                  "--pixels",
                  "650",
                ]);
            } catch {
              try {
                action("scroll", [
                  "--expected-url",
                  current,
                  "--pixels",
                  "650",
                ]);
              } catch {
                break;
              }
            }
          }
          const shot = action("capture"),
            file = path.join(dir, "native-" + index + "-" + view + ".png");
          await fs.copyFile(shot.path, file);
          images.push(file);
        }
        snapshots.push({
          ...target,
          text: rendered.text,
          images,
          observedAt: new Date().toISOString(),
          leaseReceipts: [
            "Safari window " +
              lease.windowId +
              "; lease " +
              lease.id +
              "; exact native URL read and screenshots captured; released after collection",
          ],
        });
      } catch (e) {
        blockers.push(target.url + " — " + e.message);
        if (/Owner changed|yielded|URL changed/.test(e.message)) break;
      }
    }
  } catch (e) {
    blockers.push(e.message);
  } finally {
    if (lease?.status === "granted")
      try {
        call("agent-wall", ["session-release", lease.id]);
      } catch (e) {
        blockers.push("Lease release needs reconciliation: " + e.message);
      }
  }
  if (ownerChanged && project === "voyage-factory-analytics")
    return nativeSnapshots(
      targets,
      dir,
      "voyage-factory-analytics-background",
      deps,
    );
  return { snapshots, blockers };
}
