# EventSnap Dashboard

## Setup

Google OAuth now always uses Supabase. The dashboard no longer falls back to a local test account.

1. `npm install`
2. `cp .env.example .env.local`
3. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. In Supabase Dashboard, enable Google provider:
   - `Authentication > Providers > Google`
   - Add your Google OAuth client ID/secret in Supabase
   - In Google Cloud OAuth settings, include Supabase callback URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`
5. Run `npm run dev`

## Chrome Extension OAuth + Sync

1. Copy `popup.config.example.js` to `popup.config.local.js` and set:
   - `supabaseUrl`
   - `supabaseAnonKey`
2. Add the Chrome redirect URL to Supabase `Authentication > URL Configuration > Redirect URLs`:
   - `https://<your-extension-id>.chromiumapp.org/supabase-auth`
3. Ensure your `events` table insert policy allows authenticated users to insert rows where `user_id = auth.uid()`.

## Routes

- `/login`
- `/signup`
- `/dashboard`
- `/dashboard/events/:id`
- `/dashboard/account`
