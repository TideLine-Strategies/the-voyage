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
test("production pause persists across reload and can be resumed", async ({ page }) => {
  await page.goto("/__local-review");
  let f = page.frameLocator("#contentFactory");
  await f.getByRole("button", { name: /Pause production/ }).click();
  await expect(f.getByRole("button", { name: /Resume production/ })).toBeVisible();
  await page.reload();
  f = page.frameLocator("#contentFactory");
  await expect(f.getByRole("button", { name: /Resume production/ })).toBeVisible();
  await f.getByRole("button", { name: /Resume production/ }).click();
  await expect(f.getByRole("button", { name: /Pause production/ })).toBeVisible();
});
test("any constructed card presents full video, details and an optional TikTok wireframe", async ({
  page,
}, info) => {
  await page.goto("/__local-review");
  const f = page.frameLocator("#contentFactory");
  const trigger = f.locator('[data-stage="analytics"] .concept-preview-hit');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const dialog = f.getByRole("dialog", { name: "Everything around the class", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("TikTok HUD wireframe")).toBeVisible();
  const phoneBounds = await dialog.locator(".presentation-phone").boundingBox();
  const railBounds = await dialog.locator(".hud-rail").boundingBox();
  expect(railBounds!.y).toBeGreaterThan(phoneBounds!.y + phoneBounds!.height * 0.12);
  expect(railBounds!.y + railBounds!.height).toBeLessThan(phoneBounds!.y + phoneBounds!.height);
  await expect(dialog.getByText("CONTENT DETAILS", { exact: true })).toBeVisible();
  const video = dialog.locator("video");
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  const time = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).not.toBe(time);
  expect(
    await f
      .locator(".live-shell video")
      .evaluateAll((videos) => videos.every((v) => (v as HTMLVideoElement).paused)),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Hide TikTok HUD" }).click();
  await expect(dialog.getByLabel("TikTok HUD wireframe")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Show TikTok HUD" }).click();
  await dialog.getByRole("button", { name: "Pause preview", exact: true }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await dialog.getByRole("button", { name: "Play preview", exact: true }).click();
  await page.screenshot({ path: info.outputPath("content-presentation.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await f.getByRole("button", { name: "Published videos", exact: true }).click();
  await f.getByRole("button", { name: "Present Training / Retaining", exact: true }).click();
  await expect(f.getByRole("dialog", { name: "Training / Retaining", exact: true })).toBeVisible();
});
test("unfilmed content presents its actual draft rather than a fabricated video", async ({
  page,
}) => {
  await page.goto("/__local-review");
  const f = page.frameLocator("#contentFactory");
  await f.getByRole("button", { name: "New brief", exact: true }).click();
  await f.getByLabel("Title", { exact: true }).fill("Draft HUD acceptance");
  await f.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(f.getByRole("status")).toHaveText("Saved to Voyage.");
  await f.getByRole("button", { name: "Close content details" }).click();
  await f.getByRole("button", { name: "Present Draft HUD acceptance", exact: true }).click();
  const dialog = f.getByRole("dialog", { name: "Draft HUD acceptance", exact: true });
  await expect(dialog.getByText("NOT FILMED YET", { exact: true })).toBeVisible();
  await expect(dialog.locator("video")).toHaveCount(0);
  await expect(dialog.getByLabel("TikTok HUD wireframe")).toBeVisible();
  await dialog.getByRole("button", { name: "Close content preview" }).click();
});
