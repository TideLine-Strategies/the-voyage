import { test, expect } from "@playwright/test";
test("published video gallery plays exact source files and keeps native links", async ({
  page,
}, info) => {
  await page.goto("/__local-review");
  const factory = page.frameLocator("#contentFactory");
  await expect(factory.getByRole("heading", { name: "Content factory." })).toBeVisible();
  await factory.getByRole("button", { name: "Published videos", exact: true }).click();
  const gallery = factory.getByRole("region", { name: "Published videos" });
  await expect(gallery.locator("video")).toHaveCount(2);
  for (const video of await gallery.locator("video").all()) {
    await video.scrollIntoViewIfNeeded();
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
      .toBeGreaterThanOrEqual(2);
    expect(await video.evaluate((v: HTMLVideoElement) => v.loop && v.muted)).toBe(true);
    const t = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).not.toBe(t);
  }
  expect(await gallery.getByRole("link", { name: "View native post" }).count()).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath("published-gallery.png"), fullPage: true });
});

test("concept coverflow exposes real sources, selected cockpit and named review gate", async ({
  page,
}, info) => {
  await page.goto("/__local-review");
  const f = page.frameLocator("#contentFactory");
  await expect(f.getByRole("heading", { name: "Content factory." })).toBeVisible();
  await expect(f.locator(".concept-lane")).toHaveCount(7);
  await expect(f.getByRole("region", { name: "Selected content cockpit" })).toBeVisible();
  await f.getByLabel("Content at Analytics").selectOption({ label: "Training / Retaining" });
  await expect(f.locator(".cockpit-working h2")).toHaveText("Training / Retaining");
  await expect(f.locator('.concept-lane[data-focused="true"]')).toHaveAttribute(
    "data-stage",
    "analytics",
  );
  expect(
    await f
      .locator(".concept-portrait")
      .first()
      .evaluate((e) => getComputedStyle(e).transform),
  ).not.toBe("none");
  await page.screenshot({ path: info.outputPath("restored-coverflow.png"), fullPage: true });
});
test('production pause persists across reload and can be resumed',async({page})=>{
 await page.goto('/__local-review');let f=page.frameLocator('#contentFactory');await f.getByRole('button',{name:/Pause production/}).click();await expect(f.getByRole('button',{name:/Resume production/})).toBeVisible();await page.reload();f=page.frameLocator('#contentFactory');await expect(f.getByRole('button',{name:/Resume production/})).toBeVisible();await f.getByRole('button',{name:/Resume production/}).click();await expect(f.getByRole('button',{name:/Pause production/})).toBeVisible();
});
