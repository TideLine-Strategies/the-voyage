import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/__local-review");
  await expect(page.getByRole("heading", { name: "Content factory." })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Saved in Voyage");
});
test("real source baseline, usable tools, measured research and no external page requests", async ({
  page,
}, info) => {
  await expect(page.getByText("2 verified source posts.")).toBeVisible();
  await expect(page.locator("#inspector")).toContainText("everything-around-the-class");
  await page.locator(".live-cover").filter({ hasText: "Training / Retaining" }).click();
  await expect(page.locator("#inspector")).toContainText("Families rarely leave a gym");
  await expect(page.getByRole("heading", { name: "Useful before promotional." })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Front-desk handoff & question audit" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "What to learn from." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const externals: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).hostname !== "127.0.0.1") externals.push(r.url());
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Content factory." })).toBeVisible();
  expect(externals).toEqual([]);
  await page.screenshot({ path: info.outputPath("real-content-factory.png"), fullPage: true });
});
test("research creates a blank-copy brief and saves to authenticated server across refresh", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Start this brief" }).first().click();
  const title = "Parent-update evidence " + info.project.name + " " + Date.now();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved to Voyage.");
  await page.getByRole("tab", { name: "Post & media" }).click();
  await expect(page.getByLabel("Final post copy — written and reviewed by your team")).toHaveValue(
    "",
  );
  await page.reload();
  await page.getByLabel("Select content").selectOption({ label: title });
  await expect(page.locator("#inspector").getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByLabel("What they can use immediately")).toHaveValue(
    /three-part update worksheet/,
  );
});
test("approval uses server identity, stale edit is invalidated and conflicts cannot overwrite", async ({
  page,
}, info) => {
  await page.getByRole("button", { name: "Start this brief" }).first().click();
  const title = "Approval acceptance " + info.project.name + " " + Date.now();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Stage", { exact: true }).selectOption("approval");
  await page.getByRole("tab", { name: "Post & media" }).click();
  await page.getByLabel("Format", { exact: true }).fill("Text checklist");
  await page
    .getByLabel("Final post copy — written and reviewed by your team")
    .fill("Acceptance test only: reviewed coach update workflow.");
  await page
    .getByLabel("Useful next step / call to action")
    .fill("Use the parent-update worksheet.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved to Voyage.");
  await page.getByRole("tab", { name: "Human review" }).click();
  await page.getByRole("button", { name: "Approve saved package" }).click();
  await expect(page.getByText(/Approved by Local review/)).toBeVisible();
  await page.getByRole("tab", { name: "Post & media" }).click();
  await page
    .getByLabel("Final post copy — written and reviewed by your team")
    .fill("Acceptance test only: changed package.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved to Voyage.");
  await page.getByRole("tab", { name: "Human review" }).click();
  await expect(page.getByText("Previous approval is stale.")).toBeVisible();
  const data = await (await page.request.get("/api/content-factory")).json();
  const item = data.items.find((i: { title: string }) => i.title === title);
  const conflict = await page.request.post("/api/content-factory", {
    headers: { origin: process.env["FACTORY_TEST_ORIGIN"] || "http://127.0.0.1:17902" },
    data: { action: "save", id: item.id, revision: 0, item },
  });
  expect(conflict.status()).toBe(409);
});
test("anonymous requests cannot read sources or modify editorial work", async ({ playwright }) => {
  const request = await playwright.request.newContext({
    baseURL: process.env["FACTORY_TEST_ORIGIN"] || "http://127.0.0.1:17902",
  });
  expect((await request.get("/api/content-factory")).status()).toBe(403);
  expect((await request.get("/factory/")).status()).toBe(403);
  expect((await request.post("/api/content-factory", { data: { action: "save" } })).status()).toBe(
    403,
  );
  await request.dispose();
});
test("dated research, real private video and governed policies are usable", async ({
  page,
}, info) => {
  const panel = page.locator("#production-evidence");
  await expect(panel.getByRole("heading", { name: "This week in our niche" })).toBeVisible();
  await expect(panel.getByText("Run a governed pass", { exact: true })).toBeVisible();
  const data = await (await page.request.get("/api/content-ops")).json();
  expect(data.research.observations.length).toBeGreaterThan(2);
  expect(data.docs).toHaveLength(7);
  expect(
    data.insights.weekly.every(
      (x: { publishedAt: string }) => Date.parse(x.publishedAt) <= Date.now(),
    ),
  ).toBe(true);
  const asset = data.media.find(
    (a: { kind: string; brand: string }) => a.kind === "branded" && a.brand === "tideline",
  );
  expect(asset).toBeTruthy();
  const range = await page.request.get("/api/content-media/" + asset.id, {
    headers: { range: "bytes=0-100" },
  });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(101);
  const video = panel.locator("video").first();
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("real-media-and-research.png") });
});
