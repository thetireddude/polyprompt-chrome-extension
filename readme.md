## Supabase OAuth Redirect URL for Chrome Extension

This extension uses `chrome.identity.getRedirectURL("supabase-auth")` as the `redirectTo` URL for Supabase Google login.

In Supabase Dashboard, go to `Authentication` -> `URL Configuration` -> `Redirect URLs` and add:

`https://<YOUR_EXTENSION_ID>.chromiumapp.org/supabase-auth`

To find `<YOUR_EXTENSION_ID>`:
- Open `chrome://extensions`
- Enable `Developer mode`
- Copy the `Extension ID` for this extension

If this redirect URL is not allowlisted, the OAuth flow may fall back to your app/site URL (for example `http://localhost:3000/dashboard`). Closing that window can produce the error: `user did not authorize access`.

No custom success page is required. When the redirect URL is configured correctly, the OAuth window closes automatically after successful authorization.
