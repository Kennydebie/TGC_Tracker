import { expect, test, type Page } from '@playwright/test';

const spiritforged = '[data-community-event="fixture-event-spiritforged-109"]';
const prismatic = '[data-community-event="fixture-event-prismatic-hype"]';

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-scout-hydrated',
    'true',
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/signin-with-chatgpt?return_to=%2Fcommunity');
  await page.waitForURL('/community');
  await expect(page.locator('html')).toHaveAttribute(
    'data-scout-hydrated',
    'true',
  );
});

test('Community Radar page loads as Whispers & Signals', async ({ page }) => {
  await expect(
    page.getByRole('heading', { name: 'Community Radar', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('COMMUNITY RADAR · WHISPERS & SIGNALS'),
  ).toBeVisible();
  await expect(
    page.getByText('Listen early. Verify before acting.'),
  ).toBeVisible();
});

test('Reddit disconnected state remains honest', async ({ page }) => {
  const status = page.getByLabel('Community Radar status');
  await expect(status.getByText('Reddit', { exact: true })).toBeVisible();
  await expect(
    status.getByText('credentials required', { exact: true }),
  ).toBeVisible();
  await expect(status.getByText(/No HTML scraping fallback/)).toBeVisible();
});

test('Discord disconnected state requires an official bot', async ({
  page,
}) => {
  const status = page.getByLabel('Community Radar status');
  await expect(status.getByText('Discord', { exact: true })).toBeVisible();
  await expect(status.getByText('bot required', { exact: true })).toBeVisible();
  await expect(
    status.getByText(/explicit guild\/channel allowlists/),
  ).toBeVisible();
});

test('isolated fictional signals appear without a Live claim', async ({
  page,
}) => {
  await expect(
    page.getByText('FICTIONAL FIXTURE DATA · isolated'),
  ).toBeVisible();
  await expect(
    page.getByText(
      'FICTIONAL FIXTURE · Amazon DE Spiritforged display €109 live, 12 left.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Live', { exact: true })).toHaveCount(0);
});

test('trending product card exposes momentum and divergence', async ({
  page,
}) => {
  const card = page.locator(spiritforged);
  await expect(card).toContainText('Riftbound Spiritforged Booster Display');
  await expect(card).toContainText('92');
  await expect(card).toContainText('Divergence');
  await expect(card).toContainText('EARLY SIGNAL');
  await expect(
    card.getByRole('button', { name: 'View signals' }),
  ).toBeVisible();
});

test('Why Trending view explains composition and market changes', async ({
  page,
}) => {
  await page
    .locator(spiritforged)
    .getByRole('button', { name: 'Investigate' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('WHY IS THIS TRENDING?')).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Signal composition' }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('heading', { name: 'Source distribution' }),
  ).toBeVisible();
  await expect(
    dialog.getByText('Community adjustment is capped'),
  ).toBeVisible();
});

test('signal timeline demonstrates measured lead time', async ({ page }) => {
  await page
    .locator(spiritforged)
    .getByRole('button', { name: 'View signals' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Signal timeline' }),
  ).toBeVisible();
  await expect(dialog.getByText('First €109 restock report')).toBeVisible();
  await expect(dialog.getByText('Marketplace price verified')).toBeVisible();
  await expect(dialog.getByText('Confirmed deal alert created')).toBeVisible();
  await expect(dialog.getByText('+8m')).toBeVisible();
});

test('duplicate and cross-platform reports appear as one clustered event', async ({
  page,
}) => {
  await expect(page.locator(spiritforged)).toHaveCount(1);
  await page
    .locator(spiritforged)
    .getByRole('button', { name: 'View signals' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText('Independent confirmation', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText('Cross-platform report')).toBeVisible();
  await expect(dialog.getByText('Fictional EU Restock Guild')).toBeVisible();
});

test('reprint rumor remains explicitly unconfirmed', async ({ page }) => {
  await page.getByRole('tab', { name: 'Reprint watch' }).click();
  const rumor = page
    .locator('.community-reprint-card')
    .filter({ hasText: 'Unconfirmed Prismatic reprint rumor' });
  await expect(
    rumor.getByRole('heading', { name: 'UNCONFIRMED REPRINT RUMOR' }),
  ).toBeVisible();
  await expect(rumor).toContainText('No authoritative source was found');
});

test('official-domain reference upgrades only the reference status', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Reprint watch' }).click();
  const reference = page
    .locator('.community-reprint-card')
    .filter({ hasText: 'official-domain announcement reference' });
  await expect(
    reference.getByRole('heading', { name: 'REPRINT CONFIRMED REFERENCE' }),
  ).toBeVisible();
  await expect(reference).toContainText('requires separate verification');
});

test('actionable community report can trigger market verification', async ({
  page,
}) => {
  await page
    .locator(spiritforged)
    .getByRole('button', { name: 'Investigate' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Verify market' })
    .click();
  await expect(
    page.getByText(/Fixture market evidence confirmed/),
  ).toBeVisible();
});

test('community-only signal cannot become a Critical BUY', async ({ page }) => {
  const card = page.locator(prismatic);
  await expect(card).toContainText('No buy recommendation');
  await expect(card.getByText(/Critical BUY/i)).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Shadow Buy' })).toHaveCount(0);
});

test('market-confirmed opportunity shows normal economics before an alert', async ({
  page,
}) => {
  const card = page.locator(spiritforged);
  await expect(card).toContainText('MARKET EVIDENCE CONFIRMED');
  await expect(card).toContainText('€ 28,00');
  await expect(card).toContainText('24% ROI');
  await expect(card.getByRole('button', { name: 'Shadow Buy' })).toBeVisible();
});

test('Watchtower saves configurable Community Radar gates', async ({
  page,
}) => {
  await page
    .locator(spiritforged)
    .getByRole('button', { name: 'Investigate' })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Momentum ≥').fill('85');
  await dialog.getByLabel('Divergence ≥').fill('75');
  await dialog.getByLabel('Hype risk ≤').fill('45');
  await dialog.getByRole('button', { name: 'Watch' }).click();
  await expect(
    page.getByText('Community thresholds saved to Watchtower.'),
  ).toBeVisible();
});

test('Reddit source configuration persists without claiming a connection', async ({
  page,
}) => {
  await page.getByRole('tab', { name: 'Information sources' }).click();
  await page.getByRole('button', { name: 'Add source' }).click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('Fixture EU source configuration');
  await page.getByLabel('Community name').fill('FixtureCommunity');
  await page.getByRole('button', { name: 'Save allowlisted source' }).click();
  await expect(page.getByText(/Community source saved/)).toBeVisible();
  await open(page, '/community');
  await page.getByRole('tab', { name: 'Information sources' }).click();
  await expect(page.getByText('Fixture EU source configuration')).toBeVisible();
  await expect(
    page.getByText('credentials required', { exact: true }).first(),
  ).toBeVisible();
});

test('Shadow Mode records the Community Radar lead-time context', async ({
  page,
}) => {
  await page
    .locator(spiritforged)
    .getByRole('button', { name: 'Shadow Buy' })
    .click();
  await expect(page.getByText(/8-minute community lead/)).toBeVisible();
  await open(page, '/shadow');
  await expect(
    page.getByText('Riftbound Spiritforged Booster Display').first(),
  ).toBeVisible();
});
