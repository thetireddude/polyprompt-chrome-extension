// popus.config.local.js

(() => {
  const config = {
    supabaseUrl: "https://npwssxjuqvfvclffxerw.supabase.co",
    supabaseAnonKey: "sb_publishable_FuwD5RGSI3Jo6R-03LP9IA_MH6f1JJn",
    dashboardUrl: "https://polysync-seven.vercel.app"
  };

  // Freeze to prevent accidental mutation
  Object.freeze(config);

  // Make available in ALL JS contexts (service worker safe)
  globalThis.EVENTSNAP_CONFIG = config;
})();