import { expect, test, type Page } from '@playwright/test';

const prismatic = '[data-deal-id="pe-etb-pair"]';

const marktplaatsDashboard = {
  accessMode: 'public_monitor',
  intervalMinutes: 15,
  status: 'healthy',
  reason: null,
  lastScanAt: '2026-09-04T12:15:00.000Z',
  nextScanAt: '2026-09-04T12:30:00.000Z',
  automaticRetryAt: null,
  parserConfidence: 0.98,
  metrics: {
    queries: 18,
    pagesFetched: 18,
    listingsParsed: 42,
    newListings: 1,
    qualified: 0,
    review: 1,
    duplicates: 6,
    priceDrops: 1,
    alerts: 0,
    errors: 0,
  },
  listings: [
    {
      id: 'listing:marktplaats-public:m1234567890',
      sourceListingId: 'm1234567890',
      sourceListingUrl:
        'https://www.marktplaats.nl/v/hobby/pokemon/m1234567890-prismatic-etb',
      title: 'Pokémon Prismatic Evolutions ETB sealed',
      price: 49,
      location: 'Heerlen',
      seller: 'Public seller',
      snippet: 'Ongeopend en ophalen mogelijk.',
      thumbnailUrl: null,
      listingTimestampText: 'Vandaag',
      delivery: 'Ophalen of Verzenden',
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      availability: 'active',
      foundByQueries: ['pokemon kaarten'],
      assessment: {
        game: 'Pokémon',
        productType: 'Elite Trainer Box',
        sealedStatus: 'sealed',
        quantity: 1,
        riskFlags: [],
        reviewRequired: true,
        matchConfidence: 96,
      },
      distanceKm: 18,
      pickupCost: {
        oneWayDistanceKm: 18,
        roundTripDistanceKm: 36,
        travelTimeHours: 0.6,
        fuelCost: 8.28,
        parking: 0,
        tolls: 0,
        travelTimeCost: 10.8,
        total: 19.08,
      },
      economics: {
        modelVersion: 'deal-economics-v2',
        itemPrice: 49,
        inboundShipping: 0,
        buyerFees: 0,
        paymentFees: 0,
        importCosts: 0,
        travelCost: 19.08,
        acquisitionLabor: 0,
        expectedSalePrice: 0,
        sellerFees: 0,
        exitPaymentFees: 0,
        outboundShipping: 0,
        packaging: 0,
        expectedReturnLoss: 0,
        sellingLabor: 0,
        liquidityHaircut: 0,
        estimatedHours: 1,
        expectedHoldingDays: 90,
        requiredProfit: 25,
        nonItemAcquisitionCosts: 19.08,
        allInCost: 68.08,
        conservativeNetExit: 0,
        conservativeProfit: -68.08,
        roi: -1,
        profitPerHour: -68.08,
        capitalVelocity: -1 / 90,
        maximumItemPrice: -44.08,
        maximumAllInCost: -25,
      },
      score: 49,
      riskScore: 49,
      priority: 'REVIEW',
      isNew: true,
      priceDrop: { from: 65, to: 49, percentage: 16 / 65 },
    },
  ],
};

async function open(page: Page, path: string) {
  const response = await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-scout-hydrated',
    'true',
  );
  return response;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/signin-with-chatgpt?return_to=%2F');
  await page.waitForURL('/');
  await expect(page.locator('html')).toHaveAttribute(
    'data-scout-hydrated',
    'true',
  );
  await expect(page.getByLabel('Account and sign out')).toBeVisible();
});

test('primary navigation loads every product surface', async ({ page }) => {
  await page.context().clearCookies();
  await open(page, '/');
  await expect(page.getByLabel('Sign in with ChatGPT')).toBeVisible();
  const paths = [
    '/deals',
    '/marktplaats',
    '/lot-lab',
    '/market',
    '/releases',
    '/scanner',
    '/portfolio',
    '/watchlist',
    '/shadow',
    '/alerts',
    '/sources',
    '/review',
    '/settings',
  ];
  for (const path of paths) {
    const link = page.locator(
      `nav[aria-label="Primary navigation"] a[href="${path}"]`,
    );
    await expect(link, path).toBeVisible();
    await link.click();
    await page.waitForURL(path);
    await expect(page.locator('html')).toHaveAttribute(
      'data-scout-hydrated',
      'true',
    );
    await expect(page.locator('main.main-content')).toBeVisible();
  }
});

test('Marktplaats Scout shows live metrics, local pickup and safe manual handoff', async ({
  page,
}) => {
  await page.route('**/api/marktplaats', (route) =>
    route.fulfill({ json: { data: marktplaatsDashboard } }),
  );
  await open(page, '/marktplaats');
  await expect(page.getByText('Public monitor', { exact: true })).toBeVisible();
  await expect(page.getByText('15 minutes', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Pokémon Prismatic Evolutions ETB sealed'),
  ).toBeVisible();
  await expect(page.getByText('€ 19,08')).toBeVisible();
  await expect(page.locator('.price-drop')).toContainText('€ 65,00 → € 49,00');
  const outbound = page.getByRole('link', { name: 'OPEN ON MARKTPLAATS' });
  await expect(outbound).toHaveAttribute('target', '_blank');
  await expect(outbound).toHaveAttribute(
    'href',
    /^https:\/\/www\.marktplaats\.nl\/v\//,
  );
  await page.getByRole('tab', { name: 'Needs review' }).click();
  await expect(
    page.getByText('Pokémon Prismatic Evolutions ETB sealed'),
  ).toBeVisible();
});

test('Marktplaats Scout clearly reports a blocked source and delayed retry', async ({
  page,
}) => {
  await page.route('**/api/marktplaats', (route) =>
    route.fulfill({
      json: {
        data: {
          ...marktplaatsDashboard,
          status: 'blocked',
          reason: 'Automated access was refused with HTTP 403.',
          automaticRetryAt: '2026-09-04T18:15:00.000Z',
          listings: [],
        },
      },
    }),
  );
  await open(page, '/marktplaats');
  await expect(page.getByRole('heading', { name: 'Blocked' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('HTTP 403');
  await expect(page.getByText('Automatic retry')).toBeVisible();
});

test('deal search and filters change the result set', async ({ page }) => {
  await open(page, '/deals');
  const search = page.getByPlaceholder('Search listings and products');
  await search.fill('Prismatic');
  await expect(page.locator('[data-economics-surface="deals"]')).toHaveCount(1);
  await search.fill('nothing-matches-this');
  await expect(page.getByText('No bounty matches these rules')).toBeVisible();
});

test('deal cards and compact table are real alternate views', async ({
  page,
}) => {
  await open(page, '/deals');
  await expect(
    page.locator('[data-economics-surface="deals"]').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Table view' }).click();
  await expect(page.getByRole('table').getByText('All-in')).toBeVisible();
  await page.getByRole('button', { name: 'Card view' }).click();
  await expect(
    page.locator('[data-economics-surface="deals"]').first(),
  ).toBeVisible();
});

test('inspect opens a deal detail with evidence and risk tabs', async ({
  page,
}) => {
  await open(page, '/deals');
  await page
    .locator(prismatic)
    .getByRole('button', { name: /Inspect deal/ })
    .click();
  const dialog = page.locator('[data-economics-surface="deal-detail"]');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Prismatic Evolutions Elite Trainer Box × 2'),
  ).toBeVisible();
  await dialog.getByRole('tab', { name: 'Evidence' }).click();
  await expect(
    dialog.getByText(/fictional demonstration transaction/i).first(),
  ).toBeVisible();
  await dialog.getByRole('tab', { name: 'Risks' }).click();
  await expect(
    dialog.getByText('Packaging condition requires photo check'),
  ).toBeVisible();
});

test('Prismatic economics show exact item and all-in maximums', async ({
  page,
}) => {
  await open(page, '/deals');
  await page
    .locator(prismatic)
    .getByRole('button', { name: /Inspect deal/ })
    .click();
  const dialog = page.locator('[data-economics-surface="deal-detail"]');
  await expect(dialog.getByText(/€\s*118,00/).first()).toBeVisible();
  await expect(dialog.getByText(/€\s*126,45/).first()).toBeVisible();
  await expect(dialog.getByText(/€\s*121,50/).first()).toBeVisible();
  await expect(dialog.getByText(/€\s*129,95/).first()).toBeVisible();
  await expect(
    dialog.getByText(
      /Item price €\s*118,00 is compared with maximum item price €\s*121,50/,
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      /All-in cost €\s*126,45 is compared with maximum all-in cost €\s*129,95/,
    ),
  ).toBeVisible();
});

test('the same deal economics remain consistent across surfaces', async ({
  page,
}) => {
  await open(page, '/');
  const dashboardText = (
    await page.locator(prismatic).first().innerText()
  ).replaceAll(/\s/g, '');
  expect(dashboardText).toContain('€126,45');
  expect(dashboardText).toContain('€28,50');
  expect(dashboardText).toContain('22,5%');

  await open(page, '/deals');
  const dealCard = page.locator(prismatic);
  const trackingButton = dealCard.getByRole('button', {
    name: /^(Track|Tracked)$/,
  });
  if ((await trackingButton.innerText()).trim() === 'Track') {
    await trackingButton.click();
    await expect(
      dealCard.getByRole('button', { name: 'Tracked' }),
    ).toBeVisible();
  }
  await open(page, '/watchlist');
  const watchText = (
    await page
      .locator(
        '[data-economics-surface="watchtower"][data-deal-id="pe-etb-pair"]',
      )
      .first()
      .innerText()
  ).replaceAll(/\s/g, '');
  expect(watchText).toContain('€126,45');
  expect(watchText).toContain('€129,95');

  await open(page, '/alerts');
  const alertText = (await page.locator(prismatic).innerText()).replaceAll(
    /\s/g,
    '',
  );
  expect(alertText).toContain('€126,45');
  expect(alertText).toContain('€28,50');
});

test('tracking persists after a full reload', async ({ page }) => {
  await open(page, '/deals');
  const card = page.locator(prismatic);
  const track = card.getByRole('button', { name: /^(Track|Tracked)$/ });
  await expect(track).toBeVisible();
  if ((await track.innerText()).trim() === 'Tracked') await track.click();
  await expect(card.getByRole('button', { name: 'Track' })).toBeVisible();
  await card.getByRole('button', { name: 'Track' }).click();
  await expect(card.getByRole('button', { name: 'Tracked' })).toBeVisible();
  await page.reload();
  await expect(
    page.locator(prismatic).getByRole('button', { name: 'Tracked' }),
  ).toBeVisible();
});

test('Shadow buy is persisted and appears in Shadow Mode', async ({ page }) => {
  await open(page, '/shadow');
  const before = await page
    .locator('[data-economics-surface="shadow"][data-deal-id="pe-etb-pair"]')
    .count();
  await open(page, '/deals');
  await page
    .locator(prismatic)
    .getByRole('button', { name: /Inspect deal/ })
    .click();
  await page.getByRole('button', { name: 'Shadow buy' }).click();
  await expect(page.getByText(/saved to Shadow Mode/)).toBeVisible();
  await open(page, '/shadow');
  await expect(
    page.locator(
      '[data-economics-surface="shadow"][data-deal-id="pe-etb-pair"]',
    ),
  ).toHaveCount(before + 1);
  const shadowText = (
    await page
      .locator('[data-economics-surface="shadow"][data-deal-id="pe-etb-pair"]')
      .first()
      .innerText()
  ).replaceAll(/\s/g, '');
  expect(shadowText).toContain('€28,50');
});

test('listing recheck updates the visible verification timestamp', async ({
  page,
}) => {
  await open(page, '/deals');
  const card = page.locator(prismatic);
  const before = await card.locator('.verification-line').innerText();
  await card.getByRole('button', { name: 'Open listing' }).click();
  await expect(page.getByText(/Demo listing rechecked/)).toBeVisible();
  await expect(card.locator('.verification-line')).not.toHaveText(before);
});

test('review resolution is confirmed before the queue row disappears', async ({
  page,
}) => {
  await open(page, '/review');
  const firstRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: 'Review' }) })
    .first();
  const record = await firstRow.getByRole('cell').nth(1).innerText();
  await firstRow.getByRole('button', { name: 'Review' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Original listing title')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save resolution' }).click();
  await expect(page.getByText(/Resolution saved before/)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: record })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: record })).toHaveCount(
    0,
  );
});

test('scanner honestly simulates a fixture and clears the candidate', async ({
  page,
}) => {
  await open(page, '/scanner');
  await expect(page.getByText(/No image recognition occurs/)).toBeVisible();
  await page.getByRole('button', { name: 'Simulate Demo Scan' }).click();
  await expect(page.getByText('SIMULATED · not image-derived')).toBeVisible();
  await page.getByRole('button', { name: 'Correct match' }).click();
  await expect(page.getByText('No scan yet')).toBeVisible();
});

test('EUR is the only available display currency', async ({ page }) => {
  await open(page, '/settings');
  await expect(page.getByText('GBP (£)')).toHaveCount(0);
  const setting = page.locator('label').filter({ hasText: 'Currency' }).last();
  await expect(setting.getByRole('textbox')).toHaveValue('EUR (€)');
  await expect(setting).not.toContainText('GBP');
  await expect(page.getByLabel('Currency').first()).toContainText('EUR');
});

test('account settings persist after reload', async ({ page }) => {
  await open(page, '/settings');
  const postcode = page.getByRole('textbox', { name: 'Postcode' });
  await postcode.fill('3511 QA');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved to your account.')).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute(
    'data-scout-hydrated',
    'true',
  );
  await expect(page.getByRole('textbox', { name: 'Postcode' })).toHaveValue(
    '3511 QA',
  );
});

test('purchase and completed sale persist through the inventory workflow', async ({
  page,
}) => {
  await open(page, '/portfolio');
  await page.getByRole('button', { name: 'Record purchase' }).click();
  const purchase = page.getByRole('dialog');
  await purchase.getByRole('spinbutton', { name: 'Quantity' }).fill('1');
  await purchase.getByRole('spinbutton', { name: 'Item price' }).fill('10');
  await purchase
    .getByRole('spinbutton', { name: 'Acquisition costs' })
    .fill('2');
  await purchase.getByRole('button', { name: 'Save purchase' }).click();
  await expect(
    page.getByText('Purchase and inventory lot saved.'),
  ).toBeVisible();
  await expect(page.getByText('Persisted demo lot').last()).toBeVisible();

  await page.getByRole('button', { name: 'Record sale' }).click();
  const sale = page.getByRole('dialog');
  await sale.getByRole('spinbutton', { name: 'Gross proceeds' }).fill('20');
  await sale.getByRole('spinbutton', { name: 'Selling costs' }).fill('2');
  await sale.getByRole('button', { name: 'Save completed sale' }).click();
  await expect(
    page.getByText('Completed sale saved and realised profit calculated.'),
  ).toBeVisible();
});

test('missing eBay credentials are reported without a scraping fallback', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/scans/run', {
    data: { source: 'ebay' },
  });
  expect(response.status()).toBe(424);
  const payload = (await response.json()) as {
    status: string;
    requirement: string;
  };
  expect(payload.status).toBe('credentials_required');
  expect(payload.requirement).toContain('EBAY_CLIENT_ID');
  await open(page, '/sources');
  await expect(page.getByText('No scraping fallback')).toBeVisible();
});

test('demo and production records are explicitly separated', async ({
  page,
  request,
}) => {
  const response = await request.get('/api/deals');
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as {
    demoCount: number;
    productionCount: number;
    data: { dataMode: string }[];
  };
  expect(payload.demoCount).toBeGreaterThan(0);
  expect(payload.productionCount).toBe(0);
  expect(payload.data.every((item) => item.dataMode === 'demo')).toBe(true);
  await open(page, '/deals');
  await expect(
    page.getByText('DEMO · fictional listing').first(),
  ).toBeVisible();
});

test('unknown application routes return a real 404', async ({ page }) => {
  const response = await page.goto('/this-route-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByText('This TCG Scout page does not exist.'),
  ).toBeVisible();
});

test('representative visible actions produce navigation or observable state', async ({
  page,
}) => {
  await open(page, '/');
  await page.getByPlaceholder('Search the market…').fill('Riftbound');
  await page.getByPlaceholder('Search the market…').press('Enter');
  await expect(page).toHaveURL(/\/deals\?q=Riftbound/);
  await expect(
    page.getByPlaceholder('Search listings and products'),
  ).toHaveValue('Riftbound');

  await open(page, '/releases');
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await expect(page.locator('[data-release-view="calendar"]')).toBeVisible();
  await page.getByRole('tab', { name: 'Compact table' }).click();
  await expect(page.locator('[data-release-view="table"]')).toBeVisible();

  await open(page, '/sources');
  await page.getByRole('button', { name: 'Test connection' }).first().click();
  await expect(page.getByRole('status').last()).toContainText(
    /Not connected|Connected/,
  );

  await open(page, '/settings');
  await page.getByRole('button', { name: 'Reset defaults' }).click();
  await expect(page.getByText(/Defaults restored locally/)).toBeVisible();
});
