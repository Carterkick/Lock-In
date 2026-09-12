# Lock In — setup

Five files. Put them on the web, open the link on your phone, add it to your home screen. About 10 minutes.

## 1. Put the files online

Free option, no card needed: **GitHub Pages**.

1. Go to github.com and make a new repository named `lock-in`. Set it to **Public**.
2. On the repo page, click **Add file → Upload files**.
3. Drag in all five files: `index.html`, `manifest.webmanifest`, `sw.js`, `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png`. Keep them loose, not inside a folder.
4. Click **Commit changes**.
5. Go to **Settings → Pages**. Under "Branch", pick `main` and `/ (root)`, then **Save**.
6. Wait about a minute, then refresh. GitHub shows your link at the top:
   `https://YOURUSERNAME.github.io/lock-in/`

It has to be an `https://` link. The app needs that to install and work offline.

If you already host the Brazos Aerials site somewhere, you can drop these files in a `/lockin/` folder there instead and skip GitHub entirely.

## 2. Add it to your phone

**iPhone:** open the link in **Safari** (not Chrome), tap the share button, then **Add to Home Screen**.

**Android:** open the link in Chrome, tap the three dots, then **Install app** or **Add to Home Screen**.

You get a maroon icon on your home screen. It opens full screen with no browser bar, and works with no signal.

## 3. Turn on pop-up reminders

Open the app, go to **Settings → Reminders → Turn on**, and allow it when your phone asks.

These fire when a habit goes past due, but only while the app is open or recently used. Setting up push notifications below covers the rest: alerts that reach you even with the app closed all day.

## 4. Push notifications and cloud backup (one-time, technical, ~15 minutes)

This step is optional, but it's what makes reminders reach your phone when
Lock In hasn't been opened, and what backs your data up automatically. It
needs a computer with a terminal, not just your phone. Skip it if you're
happy with pop-up reminders and manual backup files.

It uses **Cloudflare Workers**, a free tier that needs no credit card. The
worker code lives in this repo's `worker/` folder.

1. **Make a Cloudflare account.** Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and sign up. Free plan, no card needed.

2. **Install and log in to Wrangler**, Cloudflare's command-line tool, from the `worker/` folder of this repo:
   ```
   cd worker
   npm install
   npx wrangler login
   ```
   This opens a browser tab to approve access. Approve it.

3. **Create the KV namespace** the worker stores data in:
   ```
   npx wrangler kv namespace create LOCKIN_KV
   ```
   It prints an `id`. Open `worker/wrangler.toml` and paste that id in place of `REPLACE_WITH_KV_NAMESPACE_ID`.

4. **The keys.** A VAPID keypair (for push) and a shared secret (for auth) were generated as part of building this. The public half is already committed, in `worker/wrangler.toml`'s `VAPID_PUBLIC_KEY` and in `index.html`'s `VAPID_PUBLIC_KEY` constant — nothing to do there. The two secret values were given to you separately in chat, never committed:
   - `VAPID_PRIVATE_KEY` — set it on the worker only (next step). Don't put it in any file.
   - `SHARED_SECRET` — set it on the worker (next step) **and** paste the same value into the app later, in Settings → Backup → Cloud sync → Shared secret. It's what proves a request to the worker is really from your phone.

   Prefer a fresh set instead of reusing values that passed through a chat? Run `node scripts/generate-keys.mjs` from `worker/` and it prints a brand new matched set. Then replace `VAPID_PUBLIC_KEY` in both `worker/wrangler.toml` and `index.html` with the new public key, and use the new private key and secret in the next step instead.

5. **Set the two secrets** on the worker (it will prompt you to paste each value):
   ```
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put SHARED_SECRET
   ```

6. **Deploy the worker:**
   ```
   npx wrangler deploy
   ```
   It prints a URL like `https://lock-in-sync.your-name.workers.dev`. That's your worker URL.

7. **Wire the app up.** If you edited `index.html` in step 4, upload it to GitHub again (Add file → Upload files → Commit). Then on your phone: **Settings → Backup → Cloud sync**, paste in the worker URL and the shared secret from step 4.

8. **Turn on push.** Still in Settings, under **Push notifications**, tap **Turn on** and allow it when asked.
   - **iPhone:** this only works from the home-screen app, not from Safari. If you see a message about adding to your home screen, do that first (Share → Add to Home Screen), reopen from the new icon, then try again.

9. **Verify it without waiting for a real reminder.** Tap **Send a test** right below the push toggle. Your phone should buzz with a notification within a few seconds. If it doesn't, double check the worker URL and secret match what you set with `wrangler secret put`, and that you tapped Turn on and allowed notifications.

Cloud backup starts working the moment the worker URL and secret are saved — no extra step. The app pushes its state (not photos) to the worker a few seconds after any change, and Settings → Backup → Cloud sync shows when it last succeeded.

**Redeploying after you change the worker's code:** edit `worker/src/index.js`, then from `worker/`, run `npx wrangler deploy` again. Secrets and the KV namespace stay put; you don't need to redo steps 3–5.

## Your data

Everything saves on your phone first, in the browser's storage. If you skipped step 4 above, nothing ever leaves your phone and nobody else can see it — but that also means if you clear your browser data or switch phones, it's gone. Go to **Settings → Backup → Save a backup file** every few weeks. Restoring takes one tap on the same screen.

If you did set up cloud sync, your habits, points, meals, and streaks also live in your own Cloudflare account, and Settings → Backup → Cloud sync → Restore from cloud brings them back without hunting for a file. Either way, **progress photos never leave this phone** — they're too large for either backup path, so keep those originals in your camera roll.

Don't use private browsing. It throws the data away when you close the tab.

## Changing things

Everything in the app is editable in Settings — habits, points, due times, which days each one counts, your schedule blocks, calorie and protein targets, and rewards.

To change the app itself, edit `index.html` and upload it again. Everything is in that one file. Changing the sync worker is separate — see `worker/README.md` for how it's laid out and how to redeploy it.
