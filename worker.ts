import vinextHandler from 'vinext/server/fetch-handler';

import { runMarktplaatsScout } from './lib/services/marktplaats-scout.ts';
import { runAmazonScout } from './lib/services/amazon-scout.ts';
import {
  AMAZON_MARKETPLACES,
  type AmazonMarketplaceCode,
} from './lib/amazon.ts';

const MAX_SCHEDULE_JITTER_MS = 60_000;
const AMAZON_DISCOVERY_CRON = '0 */3 * * *';

function configuredAmazonMarkets(value?: string) {
  return (value ?? 'NL,DE,BE,FR,IT,ES')
    .split(',')
    .map((market) => market.trim().toUpperCase())
    .filter(
      (market): market is AmazonMarketplaceCode =>
        market in AMAZON_MARKETPLACES &&
        AMAZON_MARKETPLACES[market as AmazonMarketplaceCode].keepaDomainId !==
          null,
    );
}

async function runScheduledMarktplaatsScout(env: Cloudflare.Env) {
  // Each run starts 0-60 seconds after its cron boundary. The difference
  // between consecutive random offsets gives the requested ~15m ±60s cadence.
  const jitterMs = Math.floor(Math.random() * (MAX_SCHEDULE_JITTER_MS + 1));
  await new Promise((resolve) => setTimeout(resolve, jitterMs));
  return runMarktplaatsScout({ db: env.DB });
}

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    return vinextHandler.fetch(request, env, ctx);
  },
  scheduled(
    controller: ScheduledController,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
    const amazonMode =
      controller.cron === AMAZON_DISCOVERY_CRON ? 'discovery' : 'watched';
    const amazonJob = runAmazonScout({
      db: env.DB,
      apiKey: env.KEEPA_API_KEY,
      mode: amazonMode,
      markets: configuredAmazonMarkets(env.AMAZON_MARKETS),
    }).then((result) => {
      console.log(
        JSON.stringify({
          service: 'amazon-scout',
          event: 'scheduled_scan_finished',
          mode: amazonMode,
          ...result,
        }),
      );
    });
    ctx.waitUntil(amazonJob);
    if (controller.cron !== AMAZON_DISCOVERY_CRON)
      ctx.waitUntil(
        runScheduledMarktplaatsScout(env).then((result) => {
          console.log(
            JSON.stringify({
              service: 'marktplaats-scout',
              event: 'scheduled_scan_finished',
              ...result,
            }),
          );
        }),
      );
  },
};

export default worker;
