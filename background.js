importScripts("vendor/supabase.js");

const OPENAI_API_KEY = "YOUR_API_KEY";

/*
  EventSnap Background Service Worker (MV3)
  - Captures visible tab screenshot on demand
  - Calls OpenAI Responses API with image input
  - Returns structured JSON to popup
*/

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL_NAME = "gpt-4.1-mini"; // Reasonable default; can be changed later
const SUPABASE_CLIENTS = new Map();
const SUPABASE_STORAGE_PREFIX = "eventsnap_supabase_auth:";

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

  if (message.type === "AUTH_GET_SESSION") {
    (async () => {
      try {
        const config = message.config || {};
        const session = await getCurrentSession(config);
        sendResponse({ ok: true, session });
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        sendResponse({ ok: false, error: msg });
      }
    })();

    return true;
  }

  if (message.type === "AUTH_SIGN_OUT") {
    (async () => {
      try {
        const config = message.config || {};
        await signOut(config);
        sendResponse({ ok: true });
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

function assertSupabaseLibrary() {
  if (typeof globalThis.supabase?.createClient !== "function") {
    throw new Error("Supabase client library is missing. Ensure vendor/supabase.js is bundled with the extension.");
  }
}

function getProjectRef(supabaseUrl) {
  const host = new URL(String(supabaseUrl)).hostname;
  return host.split(".")[0] || "project";
}

function createChromeStorageAdapter(namespace) {
  const toKey = (key) => `${namespace}${key}`;

  return {
    async getItem(key) {
      const namespacedKey = toKey(key);
      const result = await chrome.storage.local.get([namespacedKey]);
      return result[namespacedKey] ?? null;
    },
    async setItem(key, value) {
      const namespacedKey = toKey(key);
      await chrome.storage.local.set({ [namespacedKey]: value });
    },
    async removeItem(key) {
      const namespacedKey = toKey(key);
      await chrome.storage.local.remove(namespacedKey);
    }
  };
}

function getSupabaseClient(config) {
  assertSupabaseConfig(config);
  assertSupabaseLibrary();

  const cacheKey = `${config.supabaseUrl}|${config.supabaseAnonKey}`;
  if (SUPABASE_CLIENTS.has(cacheKey)) {
    return SUPABASE_CLIENTS.get(cacheKey);
  }

  const projectRef = getProjectRef(config.supabaseUrl);
  const namespace = `${SUPABASE_STORAGE_PREFIX}${projectRef}:`;
  const storage = createChromeStorageAdapter(namespace);

  const client = globalThis.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storage,
      storageKey: `${projectRef}-auth-token`
    }
  });

  SUPABASE_CLIENTS.set(cacheKey, client);
  return client;
}

async function signInWithGoogle(config) {
  const supabase = getSupabaseClient(config);
  const redirectTo = chrome.identity.getRedirectURL("supabase-auth");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: "select_account"
      }
    }
  });

  if (error) {
    throw new Error(error.message || "Could not start Google sign-in.");
  }
  if (!data?.url) {
    throw new Error("Supabase did not return an OAuth URL.");
  }

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: data.url,
    interactive: true
  });

  if (!callbackUrl) {
    throw new Error("Google sign-in was cancelled.");
  }

  await completeAuthCallback(supabase, callbackUrl);

  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message || "Could not load authenticated session.");
  }
  if (!session) {
    throw new Error("Could not create an authenticated session.");
  }

  if (!session.user) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      throw new Error(userError.message || "Could not load account profile.");
    }
    return { ...session, user: userData?.user || null };
  }

  return session;
}

async function completeAuthCallback(supabase, callbackUrl) {
  const parsed = new URL(callbackUrl);
  const queryParams = parsed.searchParams;
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const params = mergeSearchParams(queryParams, hashParams);

  const providerError = params.get("error") || params.get("error_code");
  const errorDescription = params.get("error_description");
  if (providerError || errorDescription) {
    throw new Error(errorDescription || providerError || "Google authentication failed.");
  }

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      throw new Error(error.message || "Could not exchange auth code for a session.");
    }
    return;
  }

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) {
    throw new Error("No auth code returned and no fallback token pair was provided.");
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  if (error) {
    throw new Error(error.message || "Could not finalize sign-in session.");
  }
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

async function getCurrentSession(config) {
  const supabase = getSupabaseClient(config);
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw new Error(error.message || "Could not read auth session.");
  }

  if (!session) {
    return null;
  }

  if (!session.user) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
      throw new Error(userError.message || "Could not load account profile.");
    }

    return { ...session, user: userData?.user || null };
  }

  return session;
}

async function signOut(config) {
  const supabase = getSupabaseClient(config);
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message || "Could not sign out.");
  }
}
