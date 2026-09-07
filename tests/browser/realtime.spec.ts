import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const password = "correct-horse-42";

async function register(page: Page, username: string): Promise<void> {
  await page.goto("/");
  await page.getByRole("tab", { name: "Register" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("heading", { name: "Conversations", exact: true }),
  ).toBeVisible();
}

async function startConversation(page: Page, username: string): Promise<void> {
  await page
    .getByRole("navigation", { name: "Workspace" })
    .getByRole("button", { name: "Find people" })
    .click();
  await page.getByLabel("Search users by username").fill(username);
  const result = page
    .locator("section[aria-live='polite']")
    .filter({ hasText: username });
  await expect(result.getByText(username, { exact: true })).toBeVisible();
  await result.getByRole("button", { name: "Start chat" }).click();
  await expect(page.getByRole("heading", { name: username })).toBeVisible();
  await expect(page.getByLabel("Live connection: live")).toBeVisible();
  await expect(page.getByText("Online", { exact: true })).toBeVisible();
}

async function send(page: Page, content: string): Promise<void> {
  await page.getByLabel("Message composer").fill(content);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(content, { exact: true })).toBeVisible();
}

test("two browser sessions deliver, queue, reconnect, and recover durable messages", async ({
  browser,
}) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const aliceName = `browser_alice_${suffix}`;
  const bobName = `browser_bob_${suffix}`;
  let aliceContext: BrowserContext | undefined;
  let bobContext: BrowserContext | undefined;

  try {
    aliceContext = await browser.newContext();
    bobContext = await browser.newContext();
    const alice = await aliceContext.newPage();
    const bob = await bobContext.newPage();

    await register(alice, aliceName);
    await register(bob, bobName);
    await startConversation(alice, bobName);
    await startConversation(bob, aliceName);

    await send(alice, "live from alice");
    await expect(
      bob.getByText("live from alice", { exact: true }),
    ).toBeVisible();

    const aliceSecondary = await aliceContext.newPage();
    await aliceSecondary.goto("/");
    await expect(
      aliceSecondary.getByRole("heading", {
        name: "Conversations",
        exact: true,
      }),
    ).toBeVisible();
    await aliceSecondary.close();
    await expect(bob.getByText("Online", { exact: true })).toBeVisible();
    await send(bob, "live from bob");
    await expect(
      alice.getByText("live from bob", { exact: true }),
    ).toBeVisible();

    await bobContext.setOffline(true);
    await expect(bob.getByLabel("Live connection: offline")).toBeVisible();
    await send(alice, "recover me from postgres");
    await bobContext.setOffline(false);
    await expect(bob.getByLabel("Live connection: live")).toBeVisible();
    await expect(
      bob.getByText("recover me from postgres", { exact: true }),
    ).toBeVisible();

    await aliceContext.setOffline(true);
    await expect(alice.getByLabel("Live connection: offline")).toBeVisible();
    await expect(bob.getByText(/Last seen/)).toBeVisible();
    await send(alice, "queued with one client id");
    await expect(
      alice.getByText("queued with one client id", { exact: true }),
    ).toBeVisible();
    await expect(alice.getByText("Queued", { exact: true })).toBeVisible();

    await aliceContext.setOffline(false);
    await expect(alice.getByLabel("Live connection: live")).toBeVisible();
    await expect(
      bob.getByText("queued with one client id", { exact: true }),
    ).toBeVisible();
    await expect(
      bob.getByText("queued with one client id", { exact: true }),
    ).toHaveCount(1);
    await expect(bob.getByText("Online", { exact: true })).toBeVisible();
  } finally {
    await aliceContext?.close();
    await bobContext?.close();
  }
});

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`typing appears, expires, stops, and recovers at ${viewport.width}px`, async ({
    browser,
  }, testInfo) => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
    const aliceName = `typing_alice_${suffix}`;
    const bobName = `typing_bob_${suffix}`;
    const aliceContext = await browser.newContext({ viewport });
    const bobContext = await browser.newContext({ viewport });
    try {
      const alice = await aliceContext.newPage();
      const bob = await bobContext.newPage();
      await register(alice, aliceName);
      await register(bob, bobName);
      await startConversation(alice, bobName);
      await startConversation(bob, aliceName);
      const composer = alice.getByLabel("Message composer");
      const typing = bob.getByRole("status");

      await composer.fill("draft");
      await expect(typing).toHaveText("Typing…");
      await expect(
        bob.getByLabel(`${aliceName} is online`).last(),
      ).toBeVisible();
      await bob.screenshot({
        path: testInfo.outputPath("typing-header.png"),
        fullPage: true,
      });
      await composer.pressSequentially(" continues", { delay: 300 });
      await expect(typing).toHaveText("Typing…");
      await expect(typing).toHaveText("Online", { timeout: 6_000 });

      await composer.fill("clear this");
      await expect(typing).toHaveText("Typing…");
      await composer.clear();
      await expect(typing).toHaveText("Online");

      await composer.fill("delivered after typing");
      await expect(typing).toHaveText("Typing…");
      await alice.getByRole("button", { name: "Send message" }).click();
      await expect(
        bob.getByText("delivered after typing", { exact: true }),
      ).toBeVisible();
      await expect(typing).toHaveText("Online");

      await composer.fill("connection interruption");
      await expect(typing).toHaveText("Typing…");
      await aliceContext.setOffline(true);
      await expect(alice.getByLabel("Live connection: offline")).toBeVisible();
      await expect(typing).not.toHaveText("Typing…");
      await composer.fill("offline draft");
      await aliceContext.setOffline(false);
      await expect(alice.getByLabel("Live connection: live")).toBeVisible();
      await expect(typing).toHaveText("Online");
      await composer.fill("fresh input");
      await expect(typing).toHaveText("Typing…");
      await alice
        .getByRole("navigation", { name: "Workspace" })
        .getByRole("button", { name: "Find people" })
        .click();
      await expect(typing).toHaveText("Online");
    } finally {
      await Promise.allSettled([aliceContext.close(), bobContext.close()]);
    }
  });
}
