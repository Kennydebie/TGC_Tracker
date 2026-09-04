import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorReliabilityScore,
  calculateLeadTimeMinutes,
  canCommunityCreateBuyRecommendation,
  classifySignal,
  clusterCommunitySignals,
  communityDealAdjustment,
  communityMomentumScore,
  extractPrice,
  extractProductCandidates,
  extractRetailerAndMarketplace,
  extractUrls,
  hypeRiskScore,
  isCommunityFetchAllowed,
  mentionAcceleration,
  normaliseCommunitySignal,
  redactPersonalData,
  signalAgeMinutes,
  signalDivergenceScore,
  sourceReliabilityScore,
} from '../lib/community.ts';
import { communityRepositoryInternals } from '../lib/repositories/community.ts';

const now = Date.UTC(2026, 8, 4, 14, 30);

async function signal(
  id: string,
  platform: 'reddit' | 'discord',
  community: string,
  occurredAt: string,
  text = 'Amazon DE Spiritforged booster display restocked €109 https://www.amazon.de/dp/B0RFTSPRT1',
) {
  const result = await normaliseCommunitySignal(
    {
      platform,
      community,
      externalId: id,
      authorExternalId: `author-${id}`,
      occurredAt,
      text,
    },
    { authorSalt: 'unit-test-salt', now },
  );
  assert.ok(result);
  return result;
}

void test('extracts canonical Pokémon and Riftbound community aliases', () => {
  assert.equal(
    extractProductCandidates('PE ETB below MSRP')[0]?.canonicalProductId,
    'pokemon-prismatic-etb',
  );
  assert.equal(
    extractProductCandidates('Spiritforged booster display live')[0]
      ?.canonicalProductId,
    'riftbound-spiritforged-display',
  );
});

void test('extracts EUR, GBP and USD price mentions', () => {
  assert.deepEqual(extractPrice('live at €109,95'), {
    price: 109.95,
    currency: 'EUR',
  });
  assert.deepEqual(extractPrice('now 89 GBP'), {
    price: 89,
    currency: 'GBP',
  });
  assert.deepEqual(extractPrice('$125 deal'), {
    price: 125,
    currency: 'USD',
  });
});

void test('extracts marketplace and retailer from source-backed text', () => {
  const urls = extractUrls('https://www.amazon.de/dp/B0RFTSPRT1');
  assert.deepEqual(
    extractRetailerAndMarketplace(
      'Spiritforged at Amazon DE and at Card Castle',
      urls,
    ),
    { marketplace: 'Amazon DE', retailer: 'amazon de and at card castle' },
  );
});

void test('allows known HTTPS domains but blocks lookalikes and unsafe URLs', () => {
  const urls = extractUrls(
    'https://www.amazon.de/dp/B0RFTSPRT1 http://amazon.de/bad https://amazon.de.evil.test/x',
  );
  assert.equal(urls.length, 2);
  assert.equal(urls[0]?.fetchAllowed, true);
  assert.equal(urls[1]?.fetchAllowed, false);
  assert.equal(isCommunityFetchAllowed('amazon.de.evil.test'), false);
  assert.equal(isCommunityFetchAllowed('shop.example', ['shop.example']), true);
});

void test('classifies multilingual actionable signals deterministically', () => {
  assert.equal(
    classifySignal('weer op voorraad: Pokémon 151'),
    'RESTOCK_REPORT',
  );
  assert.equal(
    classifySignal('Prismatic sold out everywhere'),
    'SOLD_OUT_REPORT',
  );
  assert.equal(classifySignal('possible reprint wave 2'), 'REPRINT_RUMOR');
});

void test('official domains create references, not market verification', () => {
  const official = extractUrls(
    'reprint https://www.pokemon.com/us/pokemon-news/example',
  );
  assert.equal(
    classifySignal(
      'reprint https://www.pokemon.com/us/pokemon-news/example',
      official,
    ),
    'REPRINT_CONFIRMED_REFERENCE',
  );
  assert.equal(classifySignal('reprint confirmed trust me'), 'REPRINT_RUMOR');
});

void test('mention velocity compares 24h activity to the prior daily baseline', () => {
  assert.equal(mentionAcceleration(186, 552), 205);
  assert.equal(mentionAcceleration(0, 100), 0);
});

void test('momentum rewards independent authors and communities', () => {
  const common = {
    mentionVelocity: 90,
    sourceReliability: 80,
    actionableRatio: 0.7,
    sentimentShift: 40,
    linkDiversity: 50,
  };
  const diverse = communityMomentumScore({
    ...common,
    uniqueAuthors: 40,
    uniqueCommunities: 5,
  });
  const concentrated = communityMomentumScore({
    ...common,
    uniqueAuthors: 1,
    uniqueCommunities: 1,
    repeatedTextRatio: 0.8,
    singleSourceRatio: 1,
  });
  assert.ok(diverse > concentrated);
});

void test('divergence rises when community demand leads constrained supply', () => {
  const early = signalDivergenceScore({
    communityMomentum: 92,
    priceMomentum: 4,
    sellerCountMomentum: -21,
    stockBreadthMomentum: -18,
    independentCommunities: 5,
  });
  const pricedIn = signalDivergenceScore({
    communityMomentum: 92,
    priceMomentum: 35,
    sellerCountMomentum: 20,
    stockBreadthMomentum: 20,
    independentCommunities: 1,
  });
  assert.ok(early > pricedIn);
});

void test('hype risk increases for repeated low-diversity promotion', () => {
  const score = hypeRiskScore({
    mentionAcceleration: 100,
    lowHistoryAuthorRatio: 0.85,
    repeatedTextRatio: 0.9,
    repeatedLinkRatio: 0.9,
    dominantSourceRatio: 0.95,
    crossPostRatio: 0.8,
    marketplaceSalesMomentum: 0,
    sellerCountMomentum: 0,
    priceMomentum: 0,
  });
  assert.ok(score >= 75);
});

void test('author and community reliability score only verifiable outcomes', () => {
  assert.equal(authorReliabilityScore({ verified: 27, false: 4 }), 85);
  assert.equal(
    sourceReliabilityScore({ verified: 284, false: 39, medianLeadMinutes: 7 }),
    89,
  );
  assert.equal(authorReliabilityScore({ verified: 0, false: 0 }), null);
});

void test('deduplicates repeated messages into one event', async () => {
  const at = new Date(now - 5 * 60_000).toISOString();
  const first = await signal('one', 'discord', 'guild-a', at);
  const duplicate = { ...first, id: first.id };
  const clusters = clusterCommunitySignals([first, duplicate]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.signals.length, 1);
});

void test('clusters same-window Reddit and Discord reports cross-platform', async () => {
  const at = new Date(Date.UTC(2026, 8, 4, 14, 3)).toISOString();
  const discord = await signal('discord-one', 'discord', 'guild-a', at);
  const reddit = await signal(
    'reddit-one',
    'reddit',
    'community-a',
    new Date(Date.UTC(2026, 8, 4, 14, 7)).toISOString(),
  );
  const clusters = clusterCommunitySignals([discord, reddit]);
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0]?.platforms.sort(), ['discord', 'reddit']);
  assert.equal(clusters[0]?.communities.length, 2);
});

void test('normalisation redacts personal data and pseudonymises authors', async () => {
  const normalised = await signal(
    'privacy',
    'reddit',
    'community-a',
    new Date(now).toISOString(),
    'Spiritforged deal €109 contact test@example.com or +31 6 1234 5678',
  );
  assert.match(normalised.rawExcerpt, /\[redacted email\]/);
  assert.match(normalised.rawExcerpt, /\[redacted phone\]/);
  assert.match(normalised.authorReliabilityId ?? '', /^author:[a-f0-9]{24}$/);
  assert.equal(redactPersonalData('a@b.com'), '[redacted email]');
});

void test('signal age and lead time reject invalid timestamps', () => {
  assert.equal(
    signalAgeMinutes(new Date(now - 12 * 60_000).toISOString(), now),
    12,
  );
  assert.equal(signalAgeMinutes('invalid', now), null);
  assert.equal(
    calculateLeadTimeMinutes(
      '2026-09-04T14:03:00.000Z',
      '2026-09-04T14:11:00.000Z',
    ),
    8,
  );
});

void test('community adjustment is capped and cannot manufacture profit', () => {
  assert.equal(
    communityDealAdjustment({
      momentum: 100,
      divergence: 100,
      reliability: 100,
      hypeRisk: 0,
    }),
    10,
  );
  assert.equal(
    canCommunityCreateBuyRecommendation({
      hasVerifiedMarketEvidence: false,
      conservativeProfit: 100,
      roi: 1,
    }),
    false,
  );
  assert.equal(
    canCommunityCreateBuyRecommendation({
      hasVerifiedMarketEvidence: true,
      conservativeProfit: -1,
      roi: -0.01,
    }),
    false,
  );
});

void test('community alert taxonomy never defines a Critical BUY alert', () => {
  assert.deepEqual(communityRepositoryInternals.COMMUNITY_ALERT_TYPES, [
    'COMMUNITY_EARLY_SIGNAL',
    'COMMUNITY_CONFIRMED_DEAL',
    'COMMUNITY_RESTOCK_CLUSTER',
    'COMMUNITY_SUPPLY_WARNING',
    'COMMUNITY_REPRINT_RUMOR',
    'COMMUNITY_HYPE_WARNING',
    'COMMUNITY_OFFICIAL_REFERENCE',
  ]);
  assert.equal(
    communityRepositoryInternals.COMMUNITY_ALERT_TYPES.some((kind) =>
      kind.includes('CRITICAL_BUY'),
    ),
    false,
  );
});

void test('normalised facts remain derived from source text', async () => {
  const result = await signal(
    'facts',
    'discord',
    'guild-a',
    new Date(now).toISOString(),
    'Amazon DE Spiritforged booster display restocked, 6 boxes, €109 English',
  );
  assert.equal(result.price, 109);
  assert.equal(result.marketplace, 'Amazon DE');
  assert.equal(result.quantity, 6);
  assert.equal(result.language, 'English');
  assert.equal(result.verificationStatus, 'unverified');
});
