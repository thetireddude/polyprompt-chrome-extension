# EventSnap

EventSnap now includes:

- A Chrome extension (this repo root) for capture + OpenAI extraction + local save + automatic Supabase sync
- A Next.js dashboard (`dashboard/`) with Google login, events CRUD, analytics, account settings, and API tokens
- Supabase schema migration (`supabase/migrations/20260221140000_eventsnap_init.sql`)

## 1) Local Development (No Supabase Required)

This repo now supports a local bridge mode where the extension syncs directly to the dashboard API.

1. Start dashboard:
   - `cd dashboard`
   - `npm install`
   - `npm run dev`
2. Open dashboard:
   - `http://localhost:<port>` (use the port printed by Next)
3. Load extension unpacked from repo root.
4. In extension popup, set:
   - **Local Dashboard Bridge (Dev) -> Dashboard URL** to your dashboard URL (for example `http://localhost`)
   - If your saved port is busy, the extension now auto-falls back to any reachable local dashboard port.
5. Save an event in the extension.
6. Open dashboard Events page and confirm it appears.

Local mode stores data in:
- `dashboard/.eventsnap-local/store.json`

## 2) Supabase Setup (Optional / Cloud Sync)

1. Create a Supabase project.
2. In Supabase SQL Editor, run:
   - `supabase/migrations/20260221140000_eventsnap_init.sql`
3. In Supabase Auth:
   - Enable Google provider.
   - Add redirect URLs:
     - `http://localhost:<port>/auth/callback` (match your current Next dev port)
     - `https://<YOUR_EXTENSION_ID>.chromiumapp.org/supabase-auth`
   - Add additional redirect URLs for deployed dashboard later.

## 3) Dashboard Setup (Supabase Mode)

1. `cd dashboard`
2. Copy env file:
   - `cp .env.example .env.local`
3. Fill `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Install and run:
   - `npm install`
   - `npm run dev`
5. Open `http://localhost:<port>/login` (match the port printed by Next).

## 4) Extension Setup (Supabase Mode)

1. Open Chrome -> `chrome://extensions`
2. Enable Developer mode.
3. Load unpacked extension from this repo root.
4. Copy extension ID from Chrome and add this Supabase redirect URL:
   - `https://<EXTENSION_ID>.chromiumapp.org/supabase-auth`
5. In extension popup:
   - Save OpenAI API key.
   - Save Supabase URL + anon key.
   - Click **Sign in with Google**.

## 5) Data Flow

1. Capture event in extension.
2. OpenAI extracts structured event fields.
3. Event saves locally in `chrome.storage.local`.
4. Extension auto-syncs to Supabase when signed in.
5. Dashboard loads the same events via Supabase RLS-protected tables.

## Notes

- Screenshots are not persisted in Supabase.
- `source_url` is included in the event schema and capture flow.
- Extension local storage remains active even if cloud sync fails.
