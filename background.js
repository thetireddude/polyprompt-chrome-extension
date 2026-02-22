const OPENAI_API_KEY = "YOUR_API_KEY";

/*
  EventSnap Background Service Worker (MV3)
  - Captures visible tab screenshot on demand
  - Calls OpenAI Responses API with image input
  - Returns structured JSON to popup
*/

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL_NAME = "gpt-4.1-mini"; // Reasonable default; can be changed later

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "CAPTURE_EVENT") return;

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