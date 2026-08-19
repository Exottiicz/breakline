(() => {
  'use strict';
  const config = window.BREAKLINE_CONFIG || {};
  const db = window.supabase && config.supabaseUrl && config.supabaseAnonKey
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;
  if (!db) return;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'
  }[c]));

  async function getUser() {
    const { data } = await db.auth.getUser();
    return data?.user || null;
  }

  async function getProfile(id) {
    // Keep the core profile query independent of optional avatar columns.
    const { data, error } = await db.from('profiles')
      .select('id,operator_name,bio,favorite_game,reputation,is_founder,created_at')
      .eq('id', id).maybeSingle();
    if (error) { console.warn('Profile bridge:', error.message); return null; }
    return data;
  }

  async function getHistory(id) {
    const { data, error } = await db.from('operator_name_history')
      .select('operator_name,started_at,ended_at')
      .eq('user_id', id).order('started_at', { ascending: true });
    if (error) { console.warn('Name history:', error.message); return []; }
    return data || [];
  }

  async function getBadges(id) {
    const { data, error } = await db.from('operator_badges')
      .select('awarded_at,badges(name,icon,description)')
      .eq('user_id', id).order('awarded_at', { ascending: true });
    if (error) { console.warn('Badges:', error.message); return []; }
    return (data || []).map(x => x.badges).filter(Boolean);
  }

  function ensureButton() {
    let button = $('#profile-button');
    const auth = $('#auth-button');
    if (!auth) return null;
    if (!button) {
      button = document.createElement('button');
      button.id = 'profile-button';
      button.type = 'button';
      button.className = 'login';
      button.setAttribute('aria-label', 'Open operator profile');
      auth.insertAdjacentElement('beforebegin', button);
    }
    return button;
  }

  async function syncButton() {
    const button = ensureButton();
    if (!button) return;
    const user = await getUser();
    if (!user) {
      button.style.setProperty('display', 'none', 'important');
      return;
    }
    const profile = await getProfile(user.id);
    if (!profile) {
      button.style.setProperty('display', 'none', 'important');
      return;
    }
    button.style.setProperty('display', 'inline-flex', 'important');
    button.style.visibility = 'visible';
    button.innerHTML = `<span>◉</span><span>${esc(profile.operator_name || 'OPERATOR')}</span>`;
  }

  async function openProfile(id) {
    const profile = await getProfile(id);
    if (!profile) return;
    const [history, badges] = await Promise.all([getHistory(id), getBadges(id)]);
    let modal = $('#profile-identity-modal');
    if (!modal) {
      modal = document.createElement('dialog');
      modal.id = 'profile-identity-modal';
      modal.className = 'modal';
      document.body.appendChild(modal);
    }
    const standing = Number(profile.reputation || 0) >= 750 ? 'EXCELLENT' :
      Number(profile.reputation || 0) >= 400 ? 'TRUSTED' :
      Number(profile.reputation || 0) >= 150 ? 'ESTABLISHED' : 'NEW OPERATOR';
    modal.innerHTML = `<button class="modal-close" data-profile-identity-close aria-label="Close">×</button>
      <div class="modal-inner">
        <p class="eyebrow"><span></span> OPERATOR IDENTITY</p>
        <h2>${esc(profile.operator_name || 'OPERATOR')} ${profile.is_founder ? '<em>★</em>' : ''}</h2>
        <div class="profile-stats">
          <b>${Number(profile.reputation || 0)}<small>REPUTATION</small></b>
          <b>${esc(standing)}<small>STANDING</small></b>
          <b>${esc(profile.favorite_game || '—')}<small>FAVORITE GAME</small></b>
        </div>
        <p>${esc(profile.bio || 'No operator bio yet.')}</p>
        <h3>PREVIOUSLY KNOWN AS</h3>
        <div class="history-list">${history.length ? history.map(x => `<span class="history-item">${esc(x.operator_name)}</span>`).join('') : '<span class="history-item">No previous names recorded</span>'}</div>
        <h3>BADGES</h3>
        <div class="history-list">${badges.length ? badges.map(x => `<span class="history-item" title="${esc(x.description)}">${esc(x.icon || '◆')} ${esc(x.name)}</span>`).join('') : '<span class="history-item">No badges earned yet</span>'}</div>
      </div>`;
    if (!modal.open) modal.showModal();
  }

  function bind() {
    if (!$('#profile-identity-bridge-style')) {
      const style = document.createElement('style');
      style.id = 'profile-identity-bridge-style';
      style.textContent = '.history-list{display:flex;flex-wrap:wrap;gap:7px}.history-item{display:inline-flex;padding:7px 9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);font:500 11px var(--mono,monospace)}#profile-button{gap:7px;align-items:center;min-width:104px;justify-content:center}';
      document.head.appendChild(style);
    }
    window.addEventListener('click', async e => {
      const button = e.target.closest('#profile-button');
      if (button) {
        e.preventDefault();
        e.stopPropagation();
        const user = await getUser();
        if (user) await openProfile(user.id);
      }
      const close = e.target.closest('[data-profile-identity-close]');
      if (close) close.closest('dialog')?.close();
    }, true);
    db.auth.onAuthStateChange(() => setTimeout(syncButton, 150));
    syncButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
