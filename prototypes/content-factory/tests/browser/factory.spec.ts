import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Content factory." })).toBeVisible();
});
test("selects brands, creates a specific research brief and persists it", async ({ page }) => {
  await page
    .getByRole("group", { name: "Content brand filter" })
    .getByRole("button", { name: "TideLine", exact: true })
    .click();
  await expect(page.locator("#selected-cockpit").getByText("TideLine brand brief")).toBeVisible();
  await page.getByRole("button", { name: "New idea", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("New idea brand").selectOption("wonplace");
  await dialog.getByLabel("Idea title").fill("Coach notes that show beam progress");
  await dialog
    .getByLabel("Angle or evidence")
    .fill("Show one named skill, the coach note, and the parent update before the next class.");
  await dialog.getByRole("button", { name: "Create research brief" }).click();
  await expect(
    page.getByRole("heading", { name: "Coach notes that show beam progress", exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Coach notes that show beam progress", exact: true }).first(),
  ).toBeVisible();
});
test("requires saved edits, records Cody approval and invalidates a changed package", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Send to human review", exact: true }).click();
  await page
    .getByLabel("Item brief")
    .fill("Coaches show parents one concrete milestone after every class.");
  await expect(page.getByRole("button", { name: "Approve this version" })).toBeDisabled();
  await page.getByRole("button", { name: "Save edits", exact: true }).click();
  await page.getByLabel("Demo current user").selectOption("cody");
  await page.getByRole("button", { name: "Approve this version" }).click();
  await expect(page.getByText(/Approved by Cody · revision/)).toBeVisible();
  await page.getByRole("tab", { name: "Script", exact: true }).click();
  await page
    .getByLabel("Hook", { exact: true })
    .fill("Show parents the skill their athlete learned today.");
  await page.getByRole("button", { name: "Save edits", exact: true }).click();
  await expect(page.getByText("Previous approval is stale")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve this version" })).toBeEnabled();
});
test("steering pauses and replans, while factory stop prevents progression", async ({ page }) => {
  await page.getByRole("button", { name: "Steer", exact: true }).click();
  await page
    .getByLabel("Steering direction")
    .fill("Focus the hook on the parent update, not generic retention claims.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText(/Direction: “Focus the hook/)).toBeVisible();
  await expect(page.getByText(/Simulated plan: paused/).first()).toBeVisible();
  await expect(
    page.locator("#selected-cockpit").getByRole("button", { name: "Resume", exact: true }),
  ).toBeEnabled();
  const state = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("voyage-content-factory:v1")!).items.map(
        (i: { id: string; progress: number; stage: string }) => ({
          id: i.id,
          p: i.progress,
          s: i.stage,
        }),
      ),
    );
  const before = await state();
  await page.waitForTimeout(1800);
  expect(await state()).toEqual(before);
  await page.getByRole("button", { name: "Resume factory", exact: true }).click();
  await expect.poll(state).not.toEqual(before);
  await page.getByRole("button", { name: "Pause factory", exact: true }).click();
  const stopped = await state();
  await page.waitForTimeout(1800);
  expect(await state()).toEqual(stopped);
});
test("analytics filters change totals and sourced insights create briefs", async ({ page }) => {
  const metric = page.locator('[data-metric="Total reported views"]');
  const before = await metric.innerText();
  await page.getByLabel("Analytics date range").selectOption("7d");
  await expect(metric).not.toHaveText(before);
  await page.getByRole("tab", { name: "By platform", exact: true }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("Analytics platform").selectOption("instagram");
  await expect(page.getByText(/Platform-specific CRM attribution is unavailable/)).toBeVisible();
  await page.getByLabel("Analytics platform").selectOption("all");
  await page
    .getByRole("button", { name: /Turn this insight into a brief/ })
    .first()
    .click();
  await expect(
    page.locator("#selected-cockpit").getByText("From insight", { exact: true }),
  ).toBeVisible();
});
test("keyboard or direct card selection updates all inspector panels without overflow", async ({
  page,
  isMobile,
}) => {
  if (isMobile) {
    await page.locator('[data-id="wp-confidence"]').click();
    await expect(
      page
        .getByRole("region", { name: "Selected storyboard preview" })
        .getByRole("heading", { name: "Building confidence", exact: true }),
    ).toBeVisible();
  } else {
    const rail = page.getByRole("listbox");
    await rail.focus();
    const before = await rail.getAttribute("aria-activedescendant");
    await page.keyboard.press("ArrowRight");
    await expect(rail).not.toHaveAttribute("aria-activedescendant", before!);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await expect(
    page.getByText("No live platform or CRM connection.", { exact: false }).first(),
  ).toBeVisible();
});

test("requests changes and cannot approve unresolved footage", async ({ page }) => {
  await page.getByRole("button", { name: "Send to human review", exact: true }).click();
  await page
    .getByLabel("Request changes", { exact: true })
    .fill("Show the coach note before the parent message.");
  await page.getByRole("button", { name: "Send back with note", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Send to human review", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Scenes \(5\)/ }).click();
  await page.getByRole("button", { name: "Request real footage", exact: true }).first().click();
  await page.getByRole("button", { name: "Send to human review", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve this version" })).toBeDisabled();
  await expect(page.getByText("Resolve the requested footage before approval.")).toBeVisible();
  await page.getByRole("button", { name: "Simulate footage upload", exact: true }).click();
  await expect(page.getByRole("button", { name: "Approve this version" })).toBeEnabled();
});

test("refresh during steering recovers a paused item with usable controls", async ({ page }) => {
  await page.getByRole("button", { name: "Steer", exact: true }).click();
  await page
    .getByLabel("Steering direction")
    .fill("Tighten the hook around a concrete coach note.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("voyage-content-factory:v1")!);
    return state.items.some((item: { replanning?: boolean }) => item.replanning);
  });
  await page.reload();
  await expect(
    page.locator("#selected-cockpit").getByRole("button", { name: "Resume", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText(/Refresh interrupted the simulated replan/).first()).toBeVisible();
});
