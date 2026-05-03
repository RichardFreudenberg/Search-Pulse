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

// ─── researchCompany ────────────────────────────────────────────────────────
// One-click comprehensive company research. Combines:
//   1. Tavily web search for fresh info (website, HQ, news, people)
//   2. OpenAI extraction into a structured JSON shape the UI can render
// The result is cached on the shared pipeline doc by the frontend so every
// user benefits from one user's research run.

exports.researchCompany = onCall({ timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
  await _requireActiveUser(request.auth);

  const { name, city, hrNumber, industry } = request.data || {};
  if (!name || typeof name !== "string") {
    throw new HttpsError("invalid-argument", "name (string) is required");
  }

  const tavilyKey = process.env.TAVILY_KEY || "";
  const openaiKey = process.env.OPENAI_KEY || "";
  if (!tavilyKey) throw new HttpsError("failed-precondition", "TAVILY_KEY not configured on server");
  if (!openaiKey) throw new HttpsError("failed-precondition", "OPENAI_KEY not configured on server");

  // ── 1. Tavily web search ────────────────────────────────────────────────
  const query = `${name}${city ? " " + city : ""} German company website headquarters owners products`;
  const tResp = await fetch("https://api.tavily.com/search", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:        tavilyKey,
      query,
      search_depth:   "basic",
      include_answer: true,
      max_results:    8,
    }),
  });
  if (!tResp.ok) {
    const txt = await tResp.text().catch(() => "");
    throw new HttpsError("internal", `Tavily ${tResp.status}: ${txt.slice(0, 200)}`);
  }
  const tavily = await tResp.json();

  // Build context block for the LLM
  const ctx = (tavily.results || [])
    .map((r, i) => `[${i + 1}] ${r.title}\n   URL: ${r.url}\n   ${(r.content || "").slice(0, 400)}`)
    .join("\n\n");

  // ── 2. OpenAI structured extraction ─────────────────────────────────────
  const systemPrompt = `You are a research assistant for a search-fund investor analysing German SMEs.
Extract STRUCTURED information about the target company from the web-search results provided.

Return ONLY valid JSON with this exact schema (use null for any field you cannot reliably determine):
{
  "website": "https://www.example.de" or null,
  "hq_address": "Street, Postcode City, Country" or null,
  "founded_year": 1995 or null,
  "ownership_type": "Family-owned" | "PE-backed" | "Public" | "Subsidiary" | "Independent" | "Unknown",
  "key_executives": [{"name": "Anna Müller", "role": "CEO"}, ...],
  "products_services": "1-2 sentence description of what they sell",
  "main_customers": "Brief description: B2B/B2C, industries served, geography",
  "recent_news": ["Headline 1 (year)", "Headline 2 (year)"]
}

Be conservative — never fabricate data. If only partial info is available, return what's confirmed and null the rest.
Only include news from 2023 or later. Limit recent_news to 3 items max. Limit key_executives to 4 max.`;

  const userPrompt = `**Company:** ${name}
${city     ? `**City:** ${city}`        : ""}
${hrNumber ? `**HR Number:** ${hrNumber}` : ""}
${industry ? `**Industry:** ${industry}` : ""}

**Web search results:**
${ctx || "(no results)"}

${tavily.answer ? `**Search engine summary:** ${tavily.answer}` : ""}

Extract the structured information now.`;

  const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model:           "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_tokens:      900,
      temperature:     0.1,
    }),
  });
  if (!aiResp.ok) {
    const err = await aiResp.json().catch(() => ({}));
    throw new HttpsError("internal", err.error?.message || `OpenAI ${aiResp.status}`);
  }
  const aiBody = await aiResp.json();

  let enrichment;
  try {
    enrichment = JSON.parse(aiBody.choices?.[0]?.message?.content || "{}");
  } catch (e) {
    throw new HttpsError("internal", "Could not parse AI response as JSON");
  }

  // ── 3. Return enrichment + sources ──────────────────────────────────────
  return {
    enrichment,
    sources: (tavily.results || []).slice(0, 6).map(r => ({
      title: r.title,
      url:   r.url,
    })),
  };
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
