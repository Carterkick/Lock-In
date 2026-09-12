# Lock In sync worker

A small Cloudflare Worker, free tier. It does two jobs for the Lock In app:

1. Sends a push notification when a habit goes past due and is still
   unchecked — even if the app has not been opened all day.
2. Stores the latest app state so Settings → Backup can restore from the
   cloud without hunting for a file.

One user, no accounts: every request is checked against a single shared
secret. See the main [README.md](../README.md) for the plain-language setup
walkthrough. This file is the technical reference for redeploying or
changing the worker itself.

## Layout

- `wrangler.toml` — Worker config: the KV binding, the cron trigger (every
  15 minutes), and the two non-secret vars (`VAPID_SUBJECT`,
  `VAPID_PUBLIC_KEY`).
- `src/index.js` — the whole worker: HTTP routes plus the cron handler.
- Two Worker secrets, never in a file: `VAPID_PRIVATE_KEY` and
  `SHARED_SECRET`.

## Routes

All routes except `/` require `Authorization: Bearer <SHARED_SECRET>`.

- `GET /` — health check.
- `POST /subscribe` — body: a `PushSubscription` (from
  `registration.pushManager.subscribe()`). Saves it, replacing any previous
  one.
- `POST /unsubscribe` — deletes the saved subscription.
- `POST /state` — body: the app's full state JSON (same shape as the backup
  file). Saved as the cloud backup.
- `GET /state` — returns the saved state JSON, 404 if there isn't one yet.
- `POST /test-push` — sends one push to the saved subscription immediately,
  so you can confirm push works without waiting for a real reminder.

## Redeploying after a change

```
cd worker
npm install
npx wrangler deploy
```

Secrets and the KV namespace id survive a redeploy — you only set those
once (see the main README). `npx wrangler tail` streams the worker's logs
live, useful for watching a cron tick or a request in real time.

## Why this shape

- **KV, not D1 or R2**: the data is one subscription object and one JSON
  blob, both tiny. A key-value store is the simplest thing that holds them,
  and it's on Cloudflare's free tier with no setup beyond
  `wrangler kv namespace create`.
- **`@block65/webcrypto-web-push`**: the standard `web-push` npm package
  calls into Node's `https` module, which does not exist in the Workers
  runtime. This library implements the same RFC 8291 (payload encryption)
  and RFC 8292 (VAPID) using only Web Crypto and `fetch`, so it runs on
  Workers, Node, Deno, and Bun alike.
- **A "pushed today" record per date, in KV**: the cron handler runs every
  15 minutes and has no memory between ticks other than KV. Without this,
  the same past-due habit would get pushed again on every tick until it
  was checked off. The record expires after 48 hours so KV doesn't
  accumulate old dates forever.
