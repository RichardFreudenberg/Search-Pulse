/**
 * functions/index.js
 * ──────────────────
 * Cloud Functions for Search Pulse CRM.
 *
 * The master account's API keys live ONLY here on the server (in env vars,
 * never in the frontend bundle). Every authenticated user can invoke these
 * functions to use AI features — they never see or need their own keys.
 *
 * Access is gated by /userAccess/{uid}.active === true (i.e. the master
 * can revoke any user's licence and they immediately lose AI access).
 *
 * Configure secrets via .env in this folder, or with:
 *   firebase functions:secrets:set OPENAI_KEY
 *   firebase functions:secrets:set CLAUDE_KEY
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions }   = require("firebase-functions/v2");
const admin                  = require("firebase-admin");

admin.initializeApp();

// Region close to the user (Frankfurt is europe-west3, but us-central1 is cheaper
// and adds <100ms — change if you prefer EU residency)
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Throws if the caller is not authenticated or has been revoked. */
async function _requireActiveUser(auth) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const accessSnap = await admin.firestore().collection("userAccess").doc(auth.uid).get();
  if (accessSnap.exists && accessSnap.data().active === false) {
    throw new HttpsError("permission-denied",
      "Your access to Search Pulse has been revoked. Contact the administrator.");
  }
}

/** Returns true if the caller is the workspace owner. */
async function _isOwner(auth) {
  if (!auth) return false;
  const reg = await admin.firestore().collection("config").doc("registration").get();
  return reg.exists && reg.data().ownerUid === auth.uid;
}

// ─── callAI ─────────────────────────────────────────────────────────────────
// Front-end usage:
//   const callAI = firebase.functions().httpsCallable('callAI');
//   const { data } = await callAI({ systemPrompt, userPrompt, maxTokens, temperature });
//   return data.text;

exports.callAI = onCall({ timeoutSeconds: 90, memory: "256MiB" }, async (request) => {
  await _requireActiveUser(request.auth);

  const { systemPrompt, userPrompt, maxTokens = 800, temperature = 0.3 } = request.data || {};
  if (!systemPrompt || !userPrompt) {
    throw new HttpsError("invalid-argument", "systemPrompt and userPrompt are required.");
  }

  const openaiKey = process.env.OPENAI_KEY || "";
  const claudeKey = process.env.CLAUDE_KEY || "";

  // Prefer OpenAI (gpt-4o-mini), fall back to Claude (Haiku)
  if (openaiKey) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model:       "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
        max_tokens:  maxTokens,
        temperature,
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new HttpsError("internal", err.error?.message || `OpenAI ${resp.status}`);
    }
    const data = await resp.json();
    return { text: data.choices?.[0]?.message?.content || "", provider: "openai" };
  }

  if (claudeKey) {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-3-5-haiku-20241022",
        max_tokens: maxTokens,
        system:     systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new HttpsError("internal", err.error?.message || `Claude ${resp.status}`);
    }
    const data = await resp.json();
    return { text: data.content?.[0]?.text || "", provider: "claude" };
  }

  throw new HttpsError("failed-precondition",
    "No AI provider configured on the server. Set OPENAI_KEY or CLAUDE_KEY.");
});

// ─── callApify ──────────────────────────────────────────────────────────────
// Generic proxy for the Apify Handelsregister actor used by officer fetch.
// Frontend posts the full input payload; we add the token server-side.

exports.callApify = onCall({ timeoutSeconds: 120, memory: "256MiB" }, async (request) => {
  await _requireActiveUser(request.auth);

  const apifyToken = process.env.APIFY_KEY || "";
  if (!apifyToken) {
    throw new HttpsError("failed-precondition", "APIFY_KEY not configured on the server.");
  }

  const { actor = "radeance~handelsregister-api", input } = request.data || {};
  if (!input || typeof input !== "object") {
    throw new HttpsError("invalid-argument", "input object is required.");
  }

  // Run the actor synchronously — Apify will block until completion (max 5 min)
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items` +
              `?token=${encodeURIComponent(apifyToken)}&maxTotalChargeUsd=2`;
  const resp = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(input),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new HttpsError("internal", `Apify error ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const items = await resp.json();
  return { items: Array.isArray(items) ? items : [] };
});
