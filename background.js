/*
  EventSnap Background Service Worker (MV3)
  - Captures visible tab screenshot on demand
  - Calls OpenAI Responses API with image input
  - Syncs to local dashboard API in local-dev mode
  - Handles Supabase auth/session for extension login
  - Syncs saved events to Supabase automatically
*/

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL_NAME = "gpt-4.1-mini";
const DEFAULT_TIMEZONE = "America/Los_Angeles";

const STORAGE_KEYS = {
  openaiKey: "openai_api_key",
  supabaseUrl: "supabase_url",
  supabaseAnonKey: "supabase_anon_key",
  localDashboardUrl: "local_dashboard_url",
  supabaseSession: "supabase_session",
  supabaseUser: "supabase_user"
};

const LOCAL_DEV_USER = {
  id: "local-dev-user",
  email: "local@eventsnap.dev"
};

const LOCAL_DASHBOARD_DISCOVERY_PORT_MIN = 1;
const LOCAL_DASHBOARD_DISCOVERY_PORT_MAX = 65535;
const LOCAL_DASHBOARD_DISCOVERY_BATCH_SIZE = 48;
const LOCAL_DASHBOARD_DISCOVERY_TIMEOUT_MS = 250;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const LOOPBACK_DISCOVERY_HOSTS = ["localhost", "127.0.0.1"];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) return;

  (async () => {
    switch (message.type) {
      case "CAPTURE_EVENT":
        sendResponse(await handleCaptureEvent());
        break;
      case "AUTH_LOGIN":
        sendResponse(await handleAuthLogin());
        break;
      case "AUTH_LOGOUT":
        sendResponse(await handleAuthLogout());
        break;
      case "AUTH_STATUS":
        sendResponse(await handleAuthStatus());
        break;
      case "SYNC_EVENT":
        sendResponse(await handleSyncEvent(message.event));
        break;
      default:
        sendResponse({ ok: false, error: `Unsupported message type: ${message.type}` });
    }
  })().catch((err) => {
    const msg = err && err.message ? err.message : String(err);
    sendResponse({ ok: false, error: msg });
  });

  return true;
});

async function handleCaptureEvent() {
  const { [STORAGE_KEYS.openaiKey]: openaiApiKey } = await chrome.storage.local.get(STORAGE_KEYS.openaiKey);
  if (!openaiApiKey) {
    return { ok: false, error: "Missing OpenAI API key. Please save a key first." };
  }

  const sourceUrl = await getActiveTabUrl();

  const dataUrl = await chrome.tabs.captureVisibleTab(null, {
    format: "jpeg",
    quality: 50
  });

  if (!dataUrl || !dataUrl.startsWith("data:image")) {
    return { ok: false, error: "Failed to capture screenshot." };
  }

  const responseJson = await callOpenAI(openaiApiKey, dataUrl);
  const outputText = extractOutputText(responseJson);

  if (!outputText) {
    return { ok: false, error: "No output text returned by OpenAI." };
  }

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch (_err) {
    return {
      ok: false,
      error: "OpenAI returned invalid JSON.",
      details: outputText
    };
  }

  if (parsed?.event && !parsed.event.timezone) {
    parsed.event.timezone = DEFAULT_TIMEZONE;
  }

  if (parsed?.event && sourceUrl) {
    parsed.event.source_url = sourceUrl;
  }

  return { ok: true, data: parsed, meta: { source_url: sourceUrl || null } };
}

async function handleAuthLogin() {
  const localDashboardUrl = await getLocalDashboardUrl();
  if (await shouldUseLocalDashboardMode(localDashboardUrl)) {
    return buildLocalAuthState(localDashboardUrl);
  }

  const config = await getSupabaseConfig();
  const redirectUrl = chrome.identity.getRedirectURL("supabase-auth");

  const authUrl =
    `${config.url}/auth/v1/authorize` +
    `?provider=google` +
    `&redirect_to=${encodeURIComponent(redirectUrl)}` +
    `&response_type=token` +
    `&prompt=select_account`;

  const redirected = await launchWebAuthFlow({
    url: authUrl,
    interactive: true
  });

  const tokenParts = parseFragmentParams(redirected);
  if (!tokenParts.access_token) {
    throw new Error("No access token returned from OAuth.");
  }

  const expiresIn = Number(tokenParts.expires_in || 3600);
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

  const session = {
    access_token: tokenParts.access_token,
    refresh_token: tokenParts.refresh_token || null,
    token_type: tokenParts.token_type || "bearer",
    expires_at: expiresAt
  };

  const user = await fetchSupabaseUser(config, session.access_token);

  await chrome.storage.local.set({
    [STORAGE_KEYS.supabaseSession]: session,
    [STORAGE_KEYS.supabaseUser]: user
  });

  return {
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email || ""
    }
  };
}

async function handleAuthLogout() {
  const localDashboardUrl = await getLocalDashboardUrl();
  if (await shouldUseLocalDashboardMode(localDashboardUrl)) {
    return buildLocalAuthState(localDashboardUrl);
  }

  await chrome.storage.local.remove([STORAGE_KEYS.supabaseSession, STORAGE_KEYS.supabaseUser]);
  return { ok: true, authenticated: false };
}

async function handleAuthStatus() {
  const localDashboardUrl = await getLocalDashboardUrl();
  if (await shouldUseLocalDashboardMode(localDashboardUrl)) {
    return buildLocalAuthState(localDashboardUrl);
  }

  try {
    const { user } = await getValidSupabaseContext({ requireSession: false });
    if (!user) {
      return { ok: true, authenticated: false };
    }

    return {
      ok: true,
      authenticated: true,
      user: {
        id: user.id,
        email: user.email || ""
      }
    };
  } catch (_err) {
    await chrome.storage.local.remove([STORAGE_KEYS.supabaseSession, STORAGE_KEYS.supabaseUser]);
    return { ok: true, authenticated: false };
  }
}

async function handleSyncEvent(event) {
  if (!event || typeof event !== "object") {
    return { ok: false, error: "Missing event payload." };
  }

  const localDashboardUrl = await getLocalDashboardUrl();
  if (await shouldUseLocalDashboardMode(localDashboardUrl)) {
    return await syncEventToLocalDashboard(localDashboardUrl, event);
  }

  const { config, session, user } = await getValidSupabaseContext({ requireSession: true });
  const payload = normalizeEventForSync(event, user.id);

  const endpoint = `${config.url}/rest/v1/events?on_conflict=user_id,client_event_id`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify([payload])
  });

  if (!resp.ok) {
    const details = await safeReadErrorResponse(resp);
    return { ok: false, error: `Sync failed (${resp.status}): ${details}` };
  }

  const rows = await resp.json();
  return {
    ok: true,
    data: rows && rows.length ? rows[0] : null
  };
}

async function syncEventToLocalDashboard(localDashboardUrl, event) {
  const endpoint = `${localDashboardUrl}/api/local/events`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ event })
  });

  if (!resp.ok) {
    const details = await safeReadErrorResponse(resp);
    return { ok: false, error: `Local dashboard sync failed (${resp.status}): ${details}` };
  }

  const json = await resp.json();
  if (json?.ok === false) {
    return { ok: false, error: json?.error || "Local dashboard rejected the event." };
  }

  return {
    ok: true,
    data: json?.data || null,
    localMode: true
  };
}

async function getActiveTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs?.[0]?.url;
  return typeof url === "string" ? url : null;
}

async function callOpenAI(apiKey, dataUrl) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt =
    "Step 1: Decide if the screenshot contains a real event announcement or invitation. " +
    "Step 2 (only if Step 1 is true): Extract event fields. " +
    "If no event is recognized, return JSON with is_event=false and event=null.";

  const body = {
    model: MODEL_NAME,
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
    const details = await safeReadErrorResponse(resp);
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
    '  "is_event": boolean,',
    '  "event": {',
    '    "title": string|null,',
    '    "start_datetime": string|null,',
    '    "end_datetime": string|null,',
    '    "timezone": string,',
    '    "location": string|null,',
    '    "host": string|null,',
    '    "registration_link": string|null,',
    '    "cost": string|null',
    "  }",
    "}",
    "If is_event is false, set event to null."
  ].join("\n");
}

function extractOutputText(responseJson) {
  if (!responseJson) return "";

  if (typeof responseJson.output_text === "string") {
    return responseJson.output_text.trim();
  }

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

async function getSupabaseConfig() {
  const {
    [STORAGE_KEYS.supabaseUrl]: rawUrl,
    [STORAGE_KEYS.supabaseAnonKey]: anonKey
  } = await chrome.storage.local.get([STORAGE_KEYS.supabaseUrl, STORAGE_KEYS.supabaseAnonKey]);

  const url = sanitizeSupabaseUrl(rawUrl);
  const key = sanitizeSupabaseAnonKey(anonKey);
  if (!url || !key) {
    throw new Error("Missing Supabase config. Save Supabase URL and anon key in the popup first.");
  }

  return { url, anonKey: key };
}

async function hasSupabaseConfig() {
  const {
    [STORAGE_KEYS.supabaseUrl]: rawUrl,
    [STORAGE_KEYS.supabaseAnonKey]: anonKey
  } = await chrome.storage.local.get([STORAGE_KEYS.supabaseUrl, STORAGE_KEYS.supabaseAnonKey]);

  return Boolean(sanitizeSupabaseUrl(rawUrl) && sanitizeSupabaseAnonKey(anonKey));
}

async function shouldUseLocalDashboardMode(localDashboardUrl) {
  if (!localDashboardUrl) return false;
  if (await hasSupabaseConfig()) return false;
  return true;
}

async function getLocalDashboardUrl() {
  const { [STORAGE_KEYS.localDashboardUrl]: rawUrl } = await chrome.storage.local.get(
    STORAGE_KEYS.localDashboardUrl
  );
  const normalized = sanitizeLocalDashboardUrl(rawUrl);
  if (!normalized) return null;

  const parsed = parseUrlSafe(normalized);
  if (!parsed || !isLoopbackHost(parsed.hostname)) {
    return normalized;
  }

  if (await canReachLocalDashboard(normalized)) {
    return normalized;
  }

  const preferredPort = Number(parsed.port);
  const discovered = await discoverLocalDashboardUrl({
    protocol: parsed.protocol,
    preferredHost: parsed.hostname,
    preferredPort: isValidPort(preferredPort) ? preferredPort : null
  });

  if (discovered && discovered !== normalized) {
    await chrome.storage.local.set({ [STORAGE_KEYS.localDashboardUrl]: discovered });
    return discovered;
  }

  return normalized;
}

function sanitizeSupabaseUrl(value) {
  if (!value) return "";
  return String(value).trim().replace(/\/+$/, "");
}

function sanitizeSupabaseAnonKey(value) {
  if (!value) return "";
  return String(value).trim();
}

function sanitizeLocalDashboardUrl(value) {
  if (!value) return "";
  const normalized = String(value).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(normalized)) return "";
  return normalized;
}

function buildLocalAuthState(localDashboardUrl) {
  return {
    ok: true,
    authenticated: true,
    localMode: true,
    localDashboardUrl,
    user: LOCAL_DEV_USER
  };
}

async function discoverLocalDashboardUrl({ protocol, preferredHost, preferredPort }) {
  const protocols = buildLocalDashboardProtocolCandidates(protocol);
  const hosts = buildLocalDashboardHostCandidates(preferredHost);
  const ports = await buildLocalDashboardPortCandidates(preferredPort);

  const preferredCandidates = buildLocalDashboardUrlCandidates({ protocols, hosts, ports });
  const preferredMatch = await findReachableLocalDashboardUrl(preferredCandidates);
  if (preferredMatch) {
    return preferredMatch;
  }

  const scanProtocols = protocols.includes("http:") ? ["http:"] : protocols;
  return await scanLocalDashboardPorts({
    protocols: scanProtocols,
    hosts,
    excludedPorts: new Set(ports)
  });
}

function buildLocalDashboardProtocolCandidates(preferredProtocol) {
  const normalized = String(preferredProtocol || "").toLowerCase() === "https:" ? "https:" : "http:";
  return normalized === "https:" ? ["https:", "http:"] : ["http:"];
}

function buildLocalDashboardHostCandidates(preferredHost) {
  const hosts = [];
  const normalized = String(preferredHost || "").toLowerCase();

  if (LOOPBACK_DISCOVERY_HOSTS.includes(normalized)) {
    hosts.push(normalized);
  }

  for (const host of LOOPBACK_DISCOVERY_HOSTS) {
    if (!hosts.includes(host)) {
      hosts.push(host);
    }
  }

  return hosts;
}

async function buildLocalDashboardPortCandidates(preferredPort) {
  const ports = [];

  if (isValidPort(preferredPort)) {
    ports.push(preferredPort);
  }

  const tabPorts = await readLoopbackPortsFromTabs();
  for (const port of tabPorts) {
    if (!ports.includes(port)) {
      ports.push(port);
    }
  }

  return ports;
}

async function readLoopbackPortsFromTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const ports = [];

    for (const tab of tabs) {
      const parsed = parseUrlSafe(tab?.url);
      if (!parsed || !isLoopbackHost(parsed.hostname)) {
        continue;
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        continue;
      }

      const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
      if (isValidPort(port) && !ports.includes(port)) {
        ports.push(port);
      }
    }

    return ports;
  } catch (_err) {
    return [];
  }
}

function buildLocalDashboardUrlCandidates({ protocols, hosts, ports }) {
  const candidates = [];

  for (const protocolCandidate of protocols) {
    for (const host of hosts) {
      for (const port of ports) {
        if (!isValidPort(port)) {
          continue;
        }
        candidates.push(`${protocolCandidate}//${host}:${port}`);
      }
    }
  }

  return candidates;
}

async function findReachableLocalDashboardUrl(
  candidates,
  { batchSize = LOCAL_DASHBOARD_DISCOVERY_BATCH_SIZE } = {}
) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }

  for (let start = 0; start < candidates.length; start += batchSize) {
    const batch = candidates.slice(start, start + batchSize);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        if (await canReachLocalDashboard(candidate)) {
          return candidate;
        }
        return null;
      })
    );

    const match = results.find(Boolean);
    if (match) {
      return match;
    }
  }

  return null;
}

async function scanLocalDashboardPorts({ protocols, hosts, excludedPorts }) {
  const ports = [];

  for (let port = LOCAL_DASHBOARD_DISCOVERY_PORT_MIN; port <= LOCAL_DASHBOARD_DISCOVERY_PORT_MAX; port += 1) {
    if (excludedPorts?.has(port)) {
      continue;
    }

    ports.push(port);
    if (ports.length < LOCAL_DASHBOARD_DISCOVERY_BATCH_SIZE) {
      continue;
    }

    const match = await probeLocalDashboardPortBatch(protocols, hosts, ports);
    if (match) {
      return match;
    }
    ports.length = 0;
  }

  if (ports.length > 0) {
    return await probeLocalDashboardPortBatch(protocols, hosts, ports);
  }

  return null;
}

async function probeLocalDashboardPortBatch(protocols, hosts, ports) {
  const candidates = buildLocalDashboardUrlCandidates({
    protocols,
    hosts,
    ports
  });
  return await findReachableLocalDashboardUrl(candidates, { batchSize: candidates.length });
}

function parseUrlSafe(value) {
  try {
    return new URL(value);
  } catch (_err) {
    return null;
  }
}

function isValidPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(String(hostname || "").toLowerCase());
}

async function canReachLocalDashboard(baseUrl) {
  const probeUrl = `${baseUrl}/api/local/events`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOCAL_DASHBOARD_DISCOVERY_TIMEOUT_MS);

  try {
    const resp = await fetch(probeUrl, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });

    if (!resp.ok) return false;
    const json = await resp.json();
    return json?.ok === true && Array.isArray(json?.data);
  } catch (_err) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

function launchWebAuthFlow(details) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(details, (redirectedTo) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!redirectedTo) {
        reject(new Error("Authentication was cancelled."));
        return;
      }

      resolve(redirectedTo);
    });
  });
}

function parseFragmentParams(url) {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return {};
  const hashPart = url.slice(hashIndex + 1);
  return Object.fromEntries(new URLSearchParams(hashPart).entries());
}

async function getValidSupabaseContext({ requireSession }) {
  const config = await getSupabaseConfig();
  const {
    [STORAGE_KEYS.supabaseSession]: storedSession,
    [STORAGE_KEYS.supabaseUser]: storedUser
  } = await chrome.storage.local.get([STORAGE_KEYS.supabaseSession, STORAGE_KEYS.supabaseUser]);

  if (!storedSession) {
    if (requireSession) {
      throw new Error("Not signed in to Supabase. Sign in with Google first.");
    }
    return { config, session: null, user: null };
  }

  let session = storedSession;
  const now = Math.floor(Date.now() / 1000);
  const shouldRefresh = !session.expires_at || session.expires_at <= now + 60;

  if (shouldRefresh) {
    if (!session.refresh_token) {
      if (requireSession) {
        throw new Error("Session expired and no refresh token is available. Please sign in again.");
      }
      return { config, session: null, user: null };
    }

    session = await refreshSupabaseSession(config, session.refresh_token);
    await chrome.storage.local.set({ [STORAGE_KEYS.supabaseSession]: session });
  }

  let user = storedUser;
  if (!user || !user.id) {
    user = await fetchSupabaseUser(config, session.access_token);
    await chrome.storage.local.set({ [STORAGE_KEYS.supabaseUser]: user });
  }

  return { config, session, user };
}

async function refreshSupabaseSession(config, refreshToken) {
  const endpoint = `${config.url}/auth/v1/token?grant_type=refresh_token`;
  const resp = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });

  if (!resp.ok) {
    const details = await safeReadErrorResponse(resp);
    throw new Error(`Supabase session refresh failed (${resp.status}): ${details}`);
  }

  const json = await resp.json();
  const expiresIn = Number(json.expires_in || 3600);

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || refreshToken,
    token_type: json.token_type || "bearer",
    expires_at: Math.floor(Date.now() / 1000) + expiresIn
  };
}

async function fetchSupabaseUser(config, accessToken) {
  const endpoint = `${config.url}/auth/v1/user`;
  const resp = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!resp.ok) {
    const details = await safeReadErrorResponse(resp);
    throw new Error(`Failed to fetch Supabase user (${resp.status}): ${details}`);
  }

  return await resp.json();
}

function normalizeEventForSync(event, userId) {
  return {
    user_id: userId,
    client_event_id: sanitizeString(event.id) || String(Date.now()),
    title: sanitizeString(event.title),
    start_datetime: sanitizeString(event.start_datetime),
    end_datetime: sanitizeString(event.end_datetime),
    timezone: sanitizeString(event.timezone) || DEFAULT_TIMEZONE,
    location: sanitizeString(event.location),
    host: sanitizeString(event.host),
    registration_link: sanitizeString(event.registration_link),
    cost: sanitizeString(event.cost),
    source_url: sanitizeString(event.source_url)
  };
}

function sanitizeString(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

async function safeReadErrorResponse(resp) {
  try {
    const json = await resp.json();
    return json?.error?.message || JSON.stringify(json);
  } catch (_err) {
    return await resp.text();
  }
}
