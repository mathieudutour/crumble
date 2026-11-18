import { expect, test, type Page } from "@playwright/test";

/** Shares the first phone's household, and returns its key. */
async function shareHousehold(page: Page): Promise<string> {
  await page.goto("/#foyer");
  await page.getByRole("button", { name: /Partager avec mon foyer/ }).click();
  const read = () =>
    page.evaluate(
      () =>
        (
          JSON.parse(localStorage.getItem("crumble/v1") ?? "null") as {
            sync?: { key?: string };
          } | null
        )?.sync?.key ?? null,
    );
  await expect.poll(read).not.toBeNull();
  return (await read())!;
}

test("a shared household: the second phone joins and sees what an agent does", async ({
  browser,
  request,
}) => {
  const a = await (await browser.newContext()).newPage();
  const key = await shareHousehold(a);

  const b = await (await browser.newContext()).newPage();
  await b.goto(`/#rejoindre=${key}`);
  await b.getByRole("button", { name: "Rejoindre le foyer" }).click();
  await expect(b.locator(".sync-badge")).toBeVisible();

  // An agent keeps a dish for the household; the other phone says so.
  const agent = await (
    await request.post(`/api/households/${key}/agents`, { data: { label: "Hermes" } })
  ).json();
  const mcp = (body: object, token = agent.token) =>
    request.post("/api/mcp", {
      headers: { authorization: `Bearer ${token}` },
      data: { jsonrpc: "2.0", ...body },
    });
  const tools = await (await mcp({ id: 1, method: "tools/list" })).json();
  expect(tools.result.tools.map((t: { name: string }) => t.name)).toEqual(
    expect.arrayContaining(["get_week_plan", "generate_week_plan", "get_shopping_list"]),
  );
  const found = await (
    await mcp({
      id: 2,
      method: "tools/call",
      params: { name: "search_dishes", arguments: { query: "" } },
    })
  ).json();
  const dish = found.result.structuredContent.dishes[0];
  const kept = await mcp({
    id: 3,
    method: "tools/call",
    params: { name: "set_dish_preference", arguments: { dish_id: dish.id, preference: "like" } },
  });
  expect(kept.ok()).toBe(true);
  await expect(b.locator(".toast")).toContainText(`Hermes · ${dish.name} : gardé`);
  expect((await mcp({ id: 3, method: "tools/list" }, "nope.nope")).status()).toBe(401);
});

test("an app added to the home screen opens the household Safari had", async ({ browser }) => {
  const safari = await browser.newContext();
  const key = await shareHousehold(await safari.newPage());

  // iOS copies Safari's cookies into the new app, and no other storage.
  const installed = await browser.newContext({
    storageState: { cookies: await safari.cookies(), origins: [] },
  });
  await installed.addInitScript(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  const b = await installed.newPage();
  await b.goto("/#foyer");
  await expect(b.locator(".sync-badge")).toBeVisible();
  await expect
    .poll(() => b.evaluate(() => JSON.parse(localStorage.getItem("crumble/v1")!).sync?.key))
    .toBe(key);
});

test("pasting an invitation link joins its household", async ({ browser }) => {
  const key = await shareHousehold(await (await browser.newContext()).newPage());
  // Like the app on an iPhone's home screen: no link to tap, its own storage.
  const b = await (await browser.newContext()).newPage();
  await b.goto("/#foyer");
  await b.getByRole("button", { name: "Rejoindre avec un lien" }).click();
  await b
    .getByLabel("Lien d’invitation", { exact: true })
    .fill(`Rejoins notre foyer : https://crumble.example/#rejoindre=${key}`);
  await b.getByRole("button", { name: "Rejoindre le foyer" }).click();
  await expect(b.locator(".sync-badge")).toBeVisible();
});
