// Lock In sync worker.
//
// One user, no accounts: every request is checked against a single shared
// secret (SHARED_SECRET, a Worker secret). It does two jobs:
//
//   1. Holds the one push subscription and sends a push when a habit goes
//      past due and unfinished (the `scheduled` cron handler, every 15 min).
//   2. Holds the latest app state blob so Settings can restore from the
//      cloud instead of hunting for a backup file (the /state routes).
//
// Everything lives in one KV namespace, under three keys:
//   "sub"          - the current PushSubscription JSON, or absent
//   "state"        - the latest app state JSON (same shape as the export
//                    file), or absent
//   "stateUpdated" - ms timestamp of the last state write
//   "pushed:<date>"- { habitId: true, ... } habits already pushed for that
//                    Chicago-local date, so a habit is never pushed twice
//                    in one day even across many cron ticks

import { buildPushPayload } from "@block65/webcrypto-web-push";

const CHI_TZ = "America/Chicago";
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, init, origin) {
  return new Response(JSON.stringify(data), {
    ...(init || {}),
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin),
      ...((init && init.headers) || {}),
    },
  });
}

// Not a high-value secret, but a constant-time-ish compare costs nothing.
function secretsMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authOk(request, env) {
  const header = request.headers.get("authorization") || "";
  const m = /^Bearer (.+)$/.exec(header);
  if (!m || !env.SHARED_SECRET) return false;
  return secretsMatch(m[1], env.SHARED_SECRET);
}

function toMin(t) {
  if (typeof t !== "string" || !t.includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// The app's own dkey() format (YYYY-MM-DD) and getDay() weekday, but read
// in America/Chicago local time instead of the Worker's UTC clock.
function chicagoNow(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: CHI_TZ,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0; // some ICU builds print midnight as "24"
  return {
    dateKey: parts.year + "-" + parts.month + "-" + parts.day,
    weekday: WEEKDAY_INDEX[parts.weekday],
    minutes: hour * 60 + Number(parts.minute),
  };
}

async function sendPush(env, sub, data) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  const payload = await buildPushPayload(
    { data: JSON.stringify(data), options: { ttl: 3600, urgency: "normal" } },
    sub,
    vapid
  );
  return fetch(sub.endpoint, payload);
}

async function handleTestPush(env) {
  const subRaw = await env.LOCKIN_KV.get("sub");
  if (!subRaw) return { ok: false, error: "No push subscription saved yet. Turn on push in the app first." };
  let sub;
  try { sub = JSON.parse(subRaw); } catch { return { ok: false, error: "Saved subscription is corrupt." }; }
  try {
    const res = await sendPush(env, sub, {
      title: "Lock In",
      body: "Test push. If your phone just buzzed, it works.",
    });
    if (res.status === 404 || res.status === 410) {
      await env.LOCKIN_KV.delete("sub");
      return { ok: false, status: res.status, error: "That subscription is gone. Turn push on again in the app." };
    }
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

// The cron entry point: find habits that are due, unfinished, not a flex
// day, and not already pushed today, and push once for each.
async function checkAndNotify(env) {
  const subRaw = await env.LOCKIN_KV.get("sub");
  if (!subRaw) return;
  const stateRaw = await env.LOCKIN_KV.get("state");
  if (!stateRaw) return;

  let sub, state;
  try {
    sub = JSON.parse(subRaw);
    state = JSON.parse(stateRaw);
  } catch {
    return;
  }

  const { dateKey, weekday, minutes } = chicagoNow(new Date());
  const day = (state.days && state.days[dateKey]) || {};
  const done = day.done || {};
  const habits = Array.isArray(state.habits) ? state.habits : [];

  const pushedKey = "pushed:" + dateKey;
  const pushedRaw = await env.LOCKIN_KV.get(pushedKey);
  const pushed = pushedRaw ? JSON.parse(pushedRaw) : {};
  let changed = false;

  for (const h of habits) {
    if (!h || !h.id) continue;
    const days = Array.isArray(h.days) ? h.days : [];
    if (!days.includes(weekday)) continue; // not scheduled today
    const flexDays = Array.isArray(h.flexDays) ? h.flexDays : [];
    if (flexDays.includes(weekday)) continue; // deliberately untimed today
    const due = toMin(h.due);
    if (due == null) continue; // no due time to be "past"
    if (done[h.id] != null) continue; // already checked off
    if (pushed[h.id]) continue; // already pushed once today
    if (minutes < due) continue; // not due yet

    try {
      const res = await sendPush(env, sub, {
        title: "Lock In",
        body: "Have you done " + (h.name || "this") + " yet?",
      });
      if (res.status === 404 || res.status === 410) {
        // The browser dropped the subscription (uninstalled, cleared data).
        await env.LOCKIN_KV.delete("sub");
        return;
      }
      if (res.ok) {
        pushed[h.id] = true;
        changed = true;
      }
    } catch {
      // Network hiccup talking to the push service. Leave it unmarked so
      // the next cron tick (in 15 minutes) tries again.
    }
  }

  if (changed) {
    await env.LOCKIN_KV.put(pushedKey, JSON.stringify(pushed), { expirationTtl: 60 * 60 * 48 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    try {
      if (url.pathname === "/" && request.method === "GET") {
        return json({ ok: true, service: "lock-in-sync" }, {}, origin);
      }

      if (url.pathname === "/subscribe" && request.method === "POST") {
        if (!authOk(request, env)) return json({ error: "unauthorized" }, { status: 401 }, origin);
        const sub = await request.json();
        if (!sub || typeof sub.endpoint !== "string" || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
          return json({ error: "not a push subscription" }, { status: 400 }, origin);
        }
        await env.LOCKIN_KV.put("sub", JSON.stringify(sub));
        return json({ ok: true }, {}, origin);
      }

      if (url.pathname === "/unsubscribe" && request.method === "POST") {
        if (!authOk(request, env)) return json({ error: "unauthorized" }, { status: 401 }, origin);
        await env.LOCKIN_KV.delete("sub");
        return json({ ok: true }, {}, origin);
      }

      if (url.pathname === "/state" && request.method === "POST") {
        if (!authOk(request, env)) return json({ error: "unauthorized" }, { status: 401 }, origin);
        const body = await request.text();
        if (body.length > 2_000_000) return json({ error: "state too large" }, { status: 413 }, origin);
        try { JSON.parse(body); } catch { return json({ error: "not valid JSON" }, { status: 400 }, origin); }
        await env.LOCKIN_KV.put("state", body);
        await env.LOCKIN_KV.put("stateUpdated", String(Date.now()));
        return json({ ok: true }, {}, origin);
      }

      if (url.pathname === "/state" && request.method === "GET") {
        if (!authOk(request, env)) return json({ error: "unauthorized" }, { status: 401 }, origin);
        const state = await env.LOCKIN_KV.get("state");
        if (!state) return json({ error: "no backup yet" }, { status: 404 }, origin);
        const updated = await env.LOCKIN_KV.get("stateUpdated");
        return new Response(state, {
          headers: {
            "content-type": "application/json",
            "x-updated": updated || "",
            ...corsHeaders(origin),
          },
        });
      }

      if (url.pathname === "/test-push" && request.method === "POST") {
        if (!authOk(request, env)) return json({ error: "unauthorized" }, { status: 401 }, origin);
        return json(await handleTestPush(env), {}, origin);
      }

      return json({ error: "not found" }, { status: 404 }, origin);
    } catch (err) {
      return json({ error: "server error", detail: String((err && err.message) || err) }, { status: 500 }, origin);
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(checkAndNotify(env));
  },
};
