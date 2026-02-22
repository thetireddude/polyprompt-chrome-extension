export function getAuthErrorMessage(error, fallbackMessage = "Authentication failed.") {
  const message = typeof error === "string" ? error : error?.message || "";
  const normalized = message.toLowerCase();

  if (normalized.includes("unsupported provider") || normalized.includes("provider is not enabled")) {
    return "Google sign-in is disabled for this Supabase project. Enable Google in Supabase Dashboard > Authentication > Providers, then try again. For local-only testing, set NEXT_PUBLIC_EVENTSNAP_LOCAL_MODE=true.";
  }

  return message || fallbackMessage;
}
