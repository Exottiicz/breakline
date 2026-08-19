window.BREAKLINE_CONFIG = {
  supabaseUrl: 'https://tdqhwuwcemwefdwqphmy.supabase.co',
  supabaseAnonKey: 'sb_publishable_ukS2JGRk77fmHncaSYufgg_y4LMcX4G'
};

// Load the operator identity layer after the main app has initialized.
// Keeping this separate lets us add identity/reputation features without
// replacing the existing Breakline application code.
window.addEventListener('load', () => {
  if (document.querySelector('script[data-breakline-identity]')) return;
  const script = document.createElement('script');
  script.src = 'operator-identity.js';
  script.dataset.breaklineIdentity = 'true';
  script.defer = true;
  document.body.appendChild(script);
});
