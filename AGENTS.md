# TCG Scout repository guidance

- Preserve the separation between observed asks, completed-sale evidence and modelled values.
- Keep demo records explicitly flagged and isolated from production storage.
- Never add scraping fallbacks for sources that require authorized API access.
- Never automate bids, offers, checkout submission or payment.
- Financial logic belongs in `lib/`, not only in React components.
- Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration` and `npm run build` after material changes.
- Node.js 22.13 or newer is required.
