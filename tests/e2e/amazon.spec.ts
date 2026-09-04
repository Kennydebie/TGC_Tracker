import { expect, test, type Page } from '@playwright/test';

const prismatic = '[data-amazon-opportunity="amazon-fixture-prismatic-de"]';
const riftbound = '[data-amazon-opportunity="amazon-fixture-riftbound-fr"]';
const review = '[data-amazon-opportunity="amazon-fixture-review-de"]';

async function open(page: Page, path: string) {
  const response = await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-scout-hydrated',
    'true',
  );
  return response;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/signin-with-chatgpt?return_to=%2Famazon');
  await page.waitForURL('/amazon');
  await expect(page.locator('html')).toHaveAttribute(
    'data-scout-hydrated',
    'true',
  );
});

test('Amazon Scout page loads in Merchant Realms', async ({ page }) => {
  await expect(
    page.getByRole('heading', { name: 'Amazon Scout' }),
  ).toBeVisible();
  await expect(
    page
      .getByLabel('Amazon Scout status')
      .getByText('AMAZON SCOUT · MERCHANT REALMS'),
  ).toBeVisible();
  await expect(page.getByText('Every 15 min')).toBeVisible();
  await expect(page.getByText('Every 3h')).toBeVisible();
});

test('missing Keepa key shows an honest required state', async ({ page }) => {
  await expect(
    page.getByRole('heading', { name: 'Keepa API key required' }),
  ).toBeVisible();
  await expect(page.getByText('API not connected')).toBeVisible();
  await expect(page.getByText('FIXTURE DATA · isolated')).toBeVisible();
});

test('recorded Amazon fixture appears without becoming a live metric', async ({
  page,
}) => {
  const card = page.locator(prismatic).first();
  await expect(card).toContainText(
    'Pokémon Prismatic Evolutions Elite Trainer Box',
  );
  await expect(card).toContainText('FIXTURE');
  await expect(
    page.getByText('Products monitored').locator('..'),
  ).toContainText('0');
});

test('market selector filters opportunity cards', async ({ page }) => {
  await page.getByLabel('Marketplace', { exact: true }).selectOption('FR');
  await expect(page.locator(prismatic)).toHaveCount(0);
  await page.getByRole('tab', { name: 'New' }).click();
  await expect(page.locator(riftbound).first()).toBeVisible();
  await page.getByLabel('Marketplace', { exact: true }).selectOption('DE');
  await page.getByRole('tab', { name: 'Best deals' }).click();
  await expect(page.locator(prismatic).first()).toBeVisible();
});

test('cross-Amazon comparison highlights the cheapest delivered market', async ({
  page,
}) => {
  const comparison = page.getByLabel('EU market comparison');
  await expect(comparison.getByText('CHEAPEST DELIVERED · DE')).toBeVisible();
  await expect(
    comparison.getByRole('cell', { name: 'Amazon DE' }),
  ).toBeVisible();
  await expect(comparison.getByText('No Keepa coverage').first()).toBeVisible();
});

test('near historical low is visible with percentile evidence', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Historical low' }).click();
  const card = page.locator(prismatic).first();
  await expect(card).toContainText('Historical percentile');
  await expect(card).toContainText('lower than 100%');
});

test('price drop renders previous, current and percentage', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Price drops' }).click();
  const card = page.locator(prismatic).first();
  await expect(card).toContainText('€ 74,95 → € 54,99');
  await expect(card).toContainText('-26,6%');
});

test('manual Amazon URL creates a watch without fetching HTML', async ({
  page,
}) => {
  await page
    .getByLabel('Amazon product URL')
    .fill('https://www.amazon.de/dp/B0DPKPRSM1?ref_=fixture');
  await page.getByRole('button', { name: 'Add to Watchlist' }).click();
  await expect(
    page.getByText(/ASIN saved.*did not fetch Amazon HTML/),
  ).toBeVisible();
  await expect(page.getByText(/1 personal URL watches/)).toBeVisible();
});

test('Shadow Buy persists and appears in existing Shadow Mode', async ({
  page,
}) => {
  await open(page, '/shadow');
  const selector =
    '[data-economics-surface="shadow"][data-deal-id="amazon-fixture-prismatic-de"]';
  const before = await page.locator(selector).count();
  await open(page, '/amazon');
  await page
    .locator(prismatic)
    .first()
    .getByRole('button', { name: 'Shadow Buy' })
    .click();
  await expect(page.getByText(/saved to Shadow Mode/)).toBeVisible();
  await open(page, '/shadow');
  await expect(page.locator(selector)).toHaveCount(before + 1);
});

test('Open Amazon is limited to the verified marketplace hostname', async ({
  page,
}) => {
  const link = page
    .locator(prismatic)
    .first()
    .getByRole('link', { name: 'Open Amazon' });
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute(
    'href',
    'https://www.amazon.de/dp/B0DPKPRSM1',
  );
});

test('quantity and accessory mismatch is routed to Review', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Review' }).click();
  const card = page.locator(review).first();
  await expect(card).toContainText('NEEDS REVIEW');
  await expect(card).toContainText('42%');
  await card.getByRole('button', { name: 'Inspect' }).click();
  await expect(card).toContainText('empty or accessory');
});

test('unknown shipping removes delivered cost and raises visible risk', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'New' }).click();
  const card = page.locator(riftbound).first();
  await expect(card).toContainText('Unknown · UNKNOWN');
  await expect(card).toContainText('Delivered NL Unknown');
  await expect(card).toContainText('Risk 43/100');
});

test('no Live badge is shown without authenticated Keepa success', async ({
  page,
}) => {
  const status = page.getByLabel('Amazon Scout status');
  await expect(status.getByText('Live Keepa authenticated')).toHaveCount(0);
  await expect(status.getByText('API not connected')).toBeVisible();
});

test('Amazon economics remain identical after Shadow Buy', async ({ page }) => {
  const card = page.locator(prismatic).first();
  await expect(card).toContainText('€ 33,02');
  await expect(card).toContainText('54,1%');
  await card.getByRole('button', { name: 'Shadow Buy' }).click();
  await open(page, '/shadow');
  const shadow = page
    .locator(
      '[data-economics-surface="shadow"][data-deal-id="amazon-fixture-prismatic-de"]',
    )
    .first();
  await expect(shadow).toContainText('€ 33,02');
  await expect(shadow).toContainText('54,1%');
});
