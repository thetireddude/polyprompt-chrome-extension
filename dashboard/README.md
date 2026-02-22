# EventSnap Dashboard

## Local Development

No env file is required for local mode.

1. `npm install`
2. `npm run dev`
3. Visit `http://localhost:<port>` (use the port printed by Next)

### Supabase Mode

1. `cp .env.example .env.local`
2. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
3. In Supabase Dashboard, enable Google provider:
   - `Authentication > Providers > Google`
   - Add your Google OAuth client ID/secret in Supabase
   - In Google Cloud OAuth settings, include Supabase callback URL: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Optional:
   - `NEXT_PUBLIC_EVENTSNAP_LOCAL_MODE=false`
5. Restart dev server

## Routes

- `/login`
- `/signup`
- `/dashboard`
- `/dashboard/events/:id`
- `/dashboard/account`
