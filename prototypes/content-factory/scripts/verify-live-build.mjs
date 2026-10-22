import fs from "node:fs/promises";
import assert from "node:assert/strict";
const root = new URL("../../../public/factory/", import.meta.url);
const html = await fs.readFile(new URL("live.html", root), "utf8");
assert(html.includes("/factory/assets/"));
await fs.rename(new URL("live.html", root), new URL("index.html", root));
const names = await fs.readdir(new URL("assets/", root));
assert(!names.some((n) => /^(wp-|tl-)/.test(n)), "Generated demo images must not ship");
const js = (
  await Promise.all(
    names
      .filter((n) => n.endsWith(".js"))
      .map((n) => fs.readFile(new URL("assets/" + n, root), "utf8")),
  )
).join("");
for (const forbidden of [
  "voyage-content-factory:v1",
  "Simulated plan:",
  "Parent survey · demo",
  "32,700",
  "createSeed",
])
  assert(!js.includes(forbidden), `Demo content in production: ${forbidden}`);
console.log("Live factory bundle: no demo seed, simulation, storage or generated imagery.");
