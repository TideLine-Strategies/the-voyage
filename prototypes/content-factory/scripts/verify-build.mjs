import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const config = JSON.parse(
  readFileSync(new URL("../.output/server/wrangler.json", import.meta.url), "utf8"),
);
assert.equal(
  config.name,
  "voyage-content-factory-prototype",
  "Prototype must never inherit the CRM Worker name",
);
assert.equal(config.workers_dev, false, "Prototype is not automatically published");
assert.equal(config.routes?.length ?? 0, 0, "No live domain routes are allowed");
for (const key of [
  "account_id",
  "vars",
  "d1_databases",
  "durable_objects",
  "kv_namespaces",
  "r2_buckets",
  "ai",
  "vectorize",
  "queues",
  "workflows",
  "hyperdrive",
  "services",
  "dispatch_namespaces",
  "secrets_store_secrets",
  "migrations",
]) {
  const value = config[key];
  assert.ok(
    value == null ||
      (Array.isArray(value)
        ? value.length === 0
        : typeof value === "object" && Object.keys(value).length === 0),
    `Unexpected inherited binding/config: ${key}`,
  );
}
assert.equal(config.assets?.binding, "ASSETS");
console.log(
  "Production build isolated: prototype name, no live routes, credentials or remote bindings.",
);
