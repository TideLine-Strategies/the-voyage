import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/__local-review");
  await expect(page.getByRole("heading", { name: "Content factory." })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Saved in Voyage");
});
test("real source baseline, usable tools, measured research and no external page requests", async ({
  page,
}, info) => {
  await expect(page.getByRole("region", { name: "Content assembly line" })).toBeVisible();
  await expect(page.locator(".factory-station")).toHaveCount(7);
  await page.getByLabel("Select content").selectOption({ label: "Training / Retaining" });
  await expect(page.locator("#inspector")).toContainText("Families rarely leave a gym");
  await page.getByRole("button", { name: "Close content details" }).click();
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ideas grounded in real problems." }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Assembly line", exact: true }).click();
  const action = page.locator('.factory-station[data-focused="true"] .factory-card-action');
  const bounds = await action.boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
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
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
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
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
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
  await page.getByRole("button", { name: "Automation & media", exact: true }).click();
  await page.getByRole("button", { name: "Research feed", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "This week in our niche" })).toBeVisible();
  await page.getByRole("button", { name: "Media & techniques", exact: true }).click();
  const data = await (await page.request.get("/api/content-ops")).json();
  expect(data.research.observations.length).toBeGreaterThan(2);
  expect(data.docs).toHaveLength(7);
  expect(
    data.insights.weekly.every(
      (x: { publishedAt: string }) => Date.parse(x.publishedAt) <= Date.now(),
    ),
  ).toBe(true);
  const asset = data.media.find(
    (a: { kind: string; brand: string; rightsVerified: boolean }) =>
      a.kind === "branded" && a.brand === "tideline" && a.rightsVerified === true,
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
  expect(await video.evaluate((v: HTMLVideoElement) => v.loop && v.muted && v.autoplay)).toBe(true);
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("real-media-and-research.png") });
});
test("construction receipts move the saved card; filming is a thumbnail and editing loops", async ({
  page,
}) => {
  const ops = await (await page.request.get("/api/content-ops")).json();
  const final = ops.media.find(
    (a: { kind: string; brand: string; rightsVerified: boolean }) =>
      a.kind === "branded" && a.brand === "tideline" && a.rightsVerified === true,
  );
  const request = async (data: unknown) => {
    const response = await page.request.post("/api/content-factory", {
      headers: { origin: process.env["FACTORY_TEST_ORIGIN"] || "http://127.0.0.1:17902" },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const item = await request({
    action: "save",
    item: {
      title: "Local construction acceptance " + Date.now(),
      brand: "tideline",
      stage: "filming",
      product: "WonPlace",
      format: "Video",
      mediaAssetId: final.id,
      sourceUrls: [],
    },
  });
  await page.reload();
  await page.locator(".factory-station-picker button").filter({ hasText: "Filming" }).click();
  const filming = page.getByRole("article", { name: "Filming station" });
  await expect(filming.locator("img")).toHaveCount(1);
  await expect(filming.locator("video")).toHaveCount(0);
  const editing = await request({
    action: "attach_media",
    id: item.id,
    revision: item.revision,
    assetId: final.originalId,
  });
  expect(editing.stage).toBe("editing");
  await page.reload();
  await page.locator(".factory-station-picker button").filter({ hasText: "Editing" }).click();
  const video = page.getByRole("article", { name: "Editing station" }).locator("video");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0);
  const review = await request({
    action: "attach_media",
    id: item.id,
    revision: editing.revision,
    assetId: final.id,
  });
  expect(review.stage).toBe("approval");
  expect(review.approval).toBeNull();
});
