window.BREAKLINE_CONFIG = {
  supabaseUrl: 'https://tdqhwuwcemwefdwqphmy.supabase.co',
  supabaseAnonKey: 'sb_publishable_ukS2JGRk77fmHncaSYufgg_y4LMcX4G'
};

// Load the operator identity layer after the main app has initialized.
window.addEventListener('load', () => {
  if (document.querySelector('script[data-breakline-identity]')) return;
  const script = document.createElement('script');
  script.src = 'operator-identity.js';
  script.dataset.breaklineIdentity = 'true';
  script.defer = true;
  document.body.appendChild(script);

  // Resilient compatibility bridge for the existing Breakline app.
  if (!document.querySelector('script[data-breakline-profile-bridge]')) {
    const bridge = document.createElement('script');
    bridge.src = 'profile-identity-bridge.js';
    bridge.dataset.breaklineProfileBridge = 'true';
    bridge.defer = true;
    document.body.appendChild(bridge);
  }
});
