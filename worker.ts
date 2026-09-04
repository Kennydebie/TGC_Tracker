import vinextHandler from 'vinext/server/fetch-handler';

import { runMarktplaatsScout } from './lib/services/marktplaats-scout.ts';

const MAX_SCHEDULE_JITTER_MS = 60_000;

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
    _controller: ScheduledController,
    env: Cloudflare.Env,
    ctx: ExecutionContext,
  ) {
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
