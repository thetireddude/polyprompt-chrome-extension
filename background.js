const OPENAI_API_KEY = "YOUR_API_KEY";

/*
  EventSnap Background Service Worker (MV3)
  - Captures visible tab screenshot on demand
  - Calls OpenAI Responses API with image input
  - Returns structured JSON to popup
*/

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL_NAME = "gpt-4.1-mini"; // Reasonable default; can be changed later
const SUPABASE_SESSION_KEY = "eventsnap_supabase_session";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "CAPTURE_EVENT") {
    // Keep the message channel open for async work.
    (async () => {
      try {
        if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY_HERE") {
          throw new Error("Missing OpenAI API key. Please set OPENAI_API_KEY in background.js.");
        }

        // Capture the currently visible tab as JPEG (quality ~50).
        const dataUrl = await chrome.tabs.captureVisibleTab(null, {
          format: "jpeg",
          quality: 50
        });

        if (!dataUrl || !dataUrl.startsWith("data:image")) {
          sendResponse({ ok: false, error: "Failed to capture screenshot." });
          return;
        }

        // Send to OpenAI Responses API with image input.
        const responseJson = await callOpenAI(OPENAI_API_KEY, dataUrl);

        // Extract JSON string from the response payload.
        const outputText = extractOutputText(responseJson);
        if (!outputText) {
          sendResponse({ ok: false, error: "No output text returned by OpenAI." });
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(outputText);
        } catch (err) {
          sendResponse({
            ok: false,
            error: "OpenAI returned invalid JSON.",
            details: outputText
          });
          return;
        }

        sendResponse({ ok: true, data: parsed });
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        sendResponse({ ok: false, error: msg });
      }
    })();

    return true; // Required to signal async response
  }

  if (message.type === "AUTH_SIGN_IN") {
    (async () => {
      try {
        const config = message.config || {};
        const session = await signInWithGoogle(config);
        sendResponse({ ok: true, session });
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        sendResponse({ ok: false, error: msg });
      }
    })();

    return true;
  }
});

async function callOpenAI(apiKey, dataUrl) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt =
    "Step 1: Decide if the screenshot contains a real event announcement or invitation. " +
    "Step 2 (only if Step 1 is true): Extract event fields. " +
    "If no event is recognized, return JSON with is_event=false and event=null.";

  const body = {
    model: MODEL_NAME,
    // Enforce JSON-only output (Responses API now uses text.format)
    text: { format: { type: "json_object" } },
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }]
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: userPrompt },
          { type: "input_image", image_url: dataUrl }
        ]
      }
    ]
  };

  const resp = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    let details = "";
    try {
      const errJson = await resp.json();
      details = errJson.error?.message || JSON.stringify(errJson);
    } catch (e) {
      details = await resp.text();
    }
    throw new Error(`OpenAI API error (${resp.status}): ${details}`);
  }

  return await resp.json();
}

function buildSystemPrompt() {
  return [
    "You are an event extraction engine.",
    "Always decide if an event is present before extracting details.",
    "Return JSON only. No prose, no markdown.",
    "Do not hallucinate. If a field is missing or uncertain, return null.",
    "Use timezone default 'America/Los_Angeles' when missing.",
    "Return EXACTLY this JSON schema:",
    "{",
    "  \"is_event\": boolean,",
    "  \"event\": {",
    "    \"title\": string|null,",
    "    \"start_datetime\": string|null,",
    "    \"end_datetime\": string|null,",
    "    \"timezone\": string,",
    "    \"location\": string|null,",
    "    \"host\": string|null,",
    "    \"registration_link\": string|null,",
    "    \"cost\": string|null",
    "  }",
    "}",
    "If is_event is false, set event to null."
  ].join("\n");
}

function extractOutputText(responseJson) {
  if (!responseJson) return "";

  // Some Responses API payloads include output_text as a convenience.
  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text.trim();
  }

  // Otherwise, walk the output array.
  const output = responseJson.output || [];
  for (const item of output) {
    const content = item.content || [];
    for (const part of content) {
      if (part.type === "output_text" && typeof part.text === "string") {
        return part.text.trim();
      }
    }
  }

  return "";
}

function assertSupabaseConfig(config) {
  const url = config?.supabaseUrl;
  const key = config?.supabaseAnonKey;

  if (!url || !key || String(url).includes("YOUR_PROJECT_REF") || String(key).includes("YOUR_SUPABASE")) {
    throw new Error("Set supabaseUrl and supabaseAnonKey in popup.config.local.js before using Google login.");
  }
}

async function signInWithGoogle(config) {
  assertSupabaseConfig(config);

  const redirectTo = chrome.identity.getRedirectURL("supabase-auth");
  const authUrl = new URL(`${config.supabaseUrl}/auth/v1/authorize`);
  authUrl.searchParams.set("provider", "google");
  authUrl.searchParams.set("redirect_to", redirectTo);
  authUrl.searchParams.set("prompt", "select_account");

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true
  });

  if (!callbackUrl) {
    throw new Error("Google sign-in was cancelled.");
  }

  const session = await buildSessionFromCallback(config, callbackUrl);
  if (!session) {
    throw new Error("Could not create an authenticated session.");
  }

  await chrome.storage.local.set({ [SUPABASE_SESSION_KEY]: session });
  return session;
}

async function buildSessionFromCallback(config, callbackUrl) {
  const parsed = parseAuthCallback(callbackUrl);
  if (!parsed.access_token) {
    throw new Error("No access token returned from Supabase.");
  }

  const user = await fetchSupabaseUser(config, parsed.access_token);
  return normalizeSession({
    ...parsed,
    user
  });
}

function parseAuthCallback(callbackUrl) {
  const parsed = new URL(callbackUrl);
  const queryParams = parsed.searchParams;
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const params = mergeSearchParams(queryParams, hashParams);

  const error = params.get("error") || params.get("error_code");
  const errorDescription = params.get("error_description");
  if (error || errorDescription) {
    throw new Error(errorDescription || error || "Google authentication failed.");
  }

  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    token_type: params.get("token_type") || "bearer",
    expires_in: Number(params.get("expires_in") || 3600),
    expires_at: Number(params.get("expires_at") || 0)
  };
}

function mergeSearchParams(searchParams, hashParams) {
  const merged = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    merged.set(key, value);
  }
  for (const [key, value] of hashParams.entries()) {
    merged.set(key, value);
  }
  return merged;
}

function normalizeSession(raw) {
  if (!raw || !raw.access_token) return null;

  const expiresIn = Number(raw.expires_in || 0);
  const explicitExpiresAt = Number(raw.expires_at || 0);
  const fallbackExpiresAt = Math.floor(Date.now() / 1000) + (expiresIn > 0 ? expiresIn : 3600);

  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token || null,
    token_type: raw.token_type || "bearer",
    expires_in: expiresIn > 0 ? expiresIn : 3600,
    expires_at: explicitExpiresAt > 0 ? explicitExpiresAt : fallbackExpiresAt,
    user: raw.user || null
  };
}

async function fetchSupabaseUser(config, accessToken) {
  const { response, payload } = await fetchSupabase(config, "/auth/v1/user", {
    method: "GET",
    accessToken
  });

  if (!response.ok) {
    throw new Error(extractApiMessage(payload, "Could not load account profile."));
  }

  return payload;
}

async function fetchSupabase(config, path, { method = "GET", body, accessToken, headers = {} } = {}) {
  const requestHeaders = {
    apikey: config.supabaseAnonKey,
    ...headers
  };

  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`;
  }

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const payload = await readJsonSafe(response);
  return { response, payload };
}

async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_err) {
    return { message: text };
  }
}

function extractApiMessage(payload, fallback) {
  if (!payload) return fallback;
  return payload.message || payload.msg || payload.error_description || payload.error || fallback;
}
