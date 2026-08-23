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
  } finally {
    await aliceContext?.close();
    await bobContext?.close();
  }
});
