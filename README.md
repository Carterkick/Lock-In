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

## 3. Turn on reminders

Open the app, go to **Settings → Reminders → Turn on**, and allow it when your phone asks.

These fire when a habit goes past due, but only while the app is open or recently used. For alerts that reach you with your phone in your pocket, keep your calendar alerts running. The two work together: the calendar tells you when to start, the app catches what you missed.

## Your data

Everything saves on your phone, in the browser's storage. Nothing goes to a server and nobody else can see it.

That means: if you clear your browser data or switch phones, it's gone. Go to **Settings → Backup → Save a backup file** every few weeks. Restoring takes one tap on the same screen.

Don't use private browsing. It throws the data away when you close the tab.

## Changing things

Everything in the app is editable in Settings — habits, points, due times, which days each one counts, your schedule blocks, calorie and protein targets, and rewards.

To change the app itself, edit `index.html` and upload it again. Everything is in that one file.
