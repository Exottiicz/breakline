(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const config = window.BREAKLINE_CONFIG || {};
  const hasSupabase = Boolean(window.supabase && config.supabaseUrl && config.supabaseAnonKey);
  const db = hasSupabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

  const state = {
    user: null,
    profileName: '',
    builds: [],
    filter: 'ALL',
    search: '',
    sort: 'trending',
    saved: new Set(JSON.parse(localStorage.getItem('breakline_saved') || '[]'))
  };

  const toast = (message, type = 'info') => {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 3200);
  };

  const openModal = (modal) => {
    if (!modal) return;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open', '');
  };

  const closeModal = (modal) => {
    if (!modal) return;
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' }[ch]));

  const formatKoen = (value) => `₭ ${Number(value || 0).toLocaleString('en-US')}`;

  function setAuthUi() {
    const login = $('[data-open-auth]');
    const submitNote = $('#submit-note');
    const authNote = $('#auth-note');
    if (login) login.textContent = state.user ? `LOG OUT (${state.profileName || 'OPERATOR'})` : 'LOG IN';
    if (submitNote) submitNote.textContent = state.user
      ? `Signed in as ${state.profileName || state.user.email}. Your build will publish to the community.`
      : 'Sign in first to publish to the community.';
    if (authNote) authNote.textContent = state.user
      ? `Signed in as ${state.profileName || state.user.email}.`
      : 'Your profile is stored securely when Supabase is connected.';
  }

  async function refreshSession() {
    if (!db) return setAuthUi();
    const { data, error } = await db.auth.getSession();
    if (error) console.warn('Supabase session error:', error.message);
    state.user = data?.session?.user || null;
    state.profileName = state.user?.user_metadata?.operator_name || state.user?.user_metadata?.name || '';
    setAuthUi();
  }

  function buildMatches(build) {
    const type = String(build.type || '').toUpperCase();
    const haystack = [build.title, build.type, build.weapon, build.notes, build.author].join(' ').toLowerCase();
    const matchesFilter = state.filter === 'ALL' || type === state.filter || (state.filter === 'BUDGET' && type === 'BUDGET');
    const matchesSearch = !state.search || haystack.includes(state.search.toLowerCase());
    return matchesFilter && matchesSearch;
  }

  function sortBuilds(builds) {
    return [...builds].sort((a, b) => {
      if (state.sort === 'newest') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (state.sort === 'price-low') return Number(a.price || 0) - Number(b.price || 0);
      if (state.sort === 'price-high') return Number(b.price || 0) - Number(a.price || 0);
      return (Number(b.likes || 0) - Number(a.likes || 0)) || (new Date(b.created_at || 0) - new Date(a.created_at || 0));
    });
  }

  function renderBuilds() {
    const grid = $('#build-grid');
    const count = $('#build-count');
    if (!grid) return;

    const visible = sortBuilds(state.builds).filter(buildMatches);
    if (count) count.textContent = visible.length;

    if (!visible.length) {
      grid.innerHTML = '<div class="empty-state">NO BUILDS MATCH YOUR SEARCH.</div>';
      return;
    }

    grid.innerHTML = visible.map((build, index) => {
      const id = escapeHtml(build.id);
      const type = escapeHtml(build.type || 'BUILD');
      const tag = type === 'BUDGET' ? 'BUDGET KING' : index === 0 ? 'TOP PICK' : 'COMMUNITY';
      const saved = state.saved.has(String(build.id));
      return `
        <article class="build-card ${index === 0 ? 'featured' : ''}" data-build-id="${id}">
          <div class="card-visual weapon-${(index % 3) + 1}">
            <span class="tier">COMMUNITY</span>
            <button class="save ${saved ? 'saved' : ''}" data-save-build="${id}" aria-label="Save build">${saved ? '♥' : '♡'}</button>
            <div class="weapon-silhouette ${type.toLowerCase().includes('smg') ? 'smg' : type.toLowerCase().includes('dmr') ? 'dmr' : 'ar'}"></div>
            <span class="tag ${tag === 'BUDGET KING' ? 'budget' : 'top'}">${tag}</span>
          </div>
          <div class="card-body">
            <div class="card-meta"><span>${type}</span><span class="up">▲ ${Number(build.likes || 0)} likes</span></div>
            <h3>${escapeHtml(build.title)}</h3>
            <p>${escapeHtml(build.weapon)}</p>
            <div class="card-foot"><span class="price">${formatKoen(build.price)}</span><span class="author">BY <b>${escapeHtml(build.author || 'OPERATOR')}</b></span></div>
          </div>
        </article>`;
    }).join('');
  }

  async function loadBuilds() {
    if (!db) {
      state.builds = [];
      renderBuilds();
      return;
    }
    const { data, error } = await db.from('builds').select('*').order('likes', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    if (error) {
      console.warn('Could not load builds:', error.message);
      toast('Community builds could not be loaded. Check the Supabase table/policies.', 'error');
      state.builds = [];
    } else {
      state.builds = data || [];
    }
    renderBuilds();
  }

  async function signUp(event) {
    event.preventDefault();
    if (!db) return toast('Supabase is not configured.', 'error');
    const name = $('#auth-name')?.value.trim();
    const email = $('#auth-email')?.value.trim();
    const password = $('#auth-password')?.value;
    if (!name || !email || !password) return;

    const button = $('#auth-form button[type="submit"]') || $('#auth-form .primary-btn');
    if (button) button.disabled = true;
    try {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: { data: { operator_name: name } }
      });
      if (error) throw error;
      state.user = data.user || null;
      state.profileName = name;
      setAuthUi();
      if (data.session) {
        closeModal($('#auth-modal'));
        toast('Profile created. You are signed in.', 'success');
      } else {
        toast('Account created. Check your email to confirm it, then log in.', 'success');
      }
      $('#auth-form')?.reset();
    } catch (error) {
      toast(error.message || 'Could not create the account.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function logOut() {
    if (!db || !state.user) return;
    const { error } = await db.auth.signOut();
    if (error) return toast(error.message, 'error');
    state.user = null;
    state.profileName = '';
    setAuthUi();
    toast('Logged out.', 'success');
  }

  async function submitBuild(event) {
    event.preventDefault();
    if (!db) return toast('Supabase is not configured.', 'error');
    if (!state.user) {
      closeModal($('#submit-modal'));
      openModal($('#auth-modal'));
      return toast('Log in first to publish a build.', 'error');
    }

    const payload = {
      title: $('#build-title')?.value.trim(),
      type: $('#build-type')?.value,
      weapon: $('#build-weapon')?.value.trim(),
      price: Number($('#build-price')?.value || 0),
      notes: [$('#build-notes')?.value.trim(), $('#gunsmith-code')?.value.trim() ? `Gunsmith: ${$('#gunsmith-code').value.trim()}` : '', $('#loadout-code')?.value.trim() ? `Loadout: ${$('#loadout-code').value.trim()}` : ''].filter(Boolean).join(' | '),
      author: state.profileName || state.user.user_metadata?.operator_name || state.user.email?.split('@')[0] || 'OPERATOR',
      user_id: state.user.id
    };

    if (!payload.title || !payload.weapon || payload.price < 0) return toast('Please complete the required build fields.', 'error');
    const button = $('#build-form .primary-btn');
    if (button) button.disabled = true;
    try {
      const { error } = await db.from('builds').insert(payload);
      if (error) throw error;
      $('#build-form')?.reset();
      closeModal($('#submit-modal'));
      await loadBuilds();
      location.hash = 'builds';
      toast('Build published successfully.', 'success');
    } catch (error) {
      toast(error.message || 'Could not publish the build. Check your Supabase policies.', 'error');
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function toggleSave(id) {
    const key = String(id);
    if (state.saved.has(key)) state.saved.delete(key);
    else state.saved.add(key);
    localStorage.setItem('breakline_saved', JSON.stringify([...state.saved]));
    renderBuilds();
    toast(state.saved.has(key) ? 'Build saved.' : 'Build removed from saved builds.', 'success');

    if (db && state.saved.has(key) && state.user) {
      const build = state.builds.find(item => String(item.id) === key);
      if (build) {
        const { error } = await db.from('builds').update({ likes: Number(build.likes || 0) + 1 }).eq('id', build.id);
        if (!error) {
          build.likes = Number(build.likes || 0) + 1;
          renderBuilds();
        }
      }
    }
  }

  function scrollToHash(hash) {
    const id = hash.replace('#', '');
    if (!id) return window.scrollTo({ top: 0, behavior: 'smooth' });
    const target = document.getElementById(id);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (id === 'squads' || id === 'market') toast(`${id.toUpperCase()} is coming soon.`, 'info');
  }

  function setup() {
    document.addEventListener('click', async (event) => {
      const openAuth = event.target.closest('[data-open-auth]');
      const openSubmit = event.target.closest('[data-open-submit]');
      const close = event.target.closest('[data-close]');
      const save = event.target.closest('[data-save-build]');
      const navLink = event.target.closest('a[href^="#"]');

      if (openAuth) {
        event.preventDefault();
        if (state.user) return logOut();
        openModal($('#auth-modal'));
      }
      if (openSubmit) {
        event.preventDefault();
        openModal($('#submit-modal'));
      }
      if (close) closeModal(close.closest('dialog'));
      if (save) {
        event.preventDefault();
        await toggleSave(save.dataset.saveBuild);
      }
      if (navLink) {
        const href = navLink.getAttribute('href');
        if (href === '#') {
          event.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          event.preventDefault();
          scrollToHash(href);
        }
      }
    });

    document.addEventListener('click', (event) => {
      const filter = event.target.closest('[data-filter]');
      if (!filter) return;
      $$('.filter[data-filter]').forEach(btn => btn.classList.toggle('selected', btn === filter));
      state.filter = filter.dataset.filter;
      renderBuilds();
    });

    $('#build-search')?.addEventListener('input', (event) => {
      state.search = event.target.value.trim();
      renderBuilds();
    });

    $('.sort')?.addEventListener('click', () => {
      const options = ['trending', 'newest', 'price-low', 'price-high'];
      const labels = ['TRENDING', 'NEWEST', 'PRICE LOW', 'PRICE HIGH'];
      const next = (options.indexOf(state.sort) + 1) % options.length;
      state.sort = options[next];
      $('.sort').innerHTML = `SORT: ${labels[next]} <b>⌄</b>`;
      renderBuilds();
    });

    $('#auth-form')?.addEventListener('submit', signUp);
    $('#build-form')?.addEventListener('submit', submitBuild);

    ['#auth-modal', '#submit-modal'].forEach(selector => {
      const modal = $(selector);
      modal?.addEventListener('click', event => {
        if (event.target === modal) closeModal(modal);
      });
    });

    $('.icon-btn')?.addEventListener('click', () => {
      $('#build-search')?.focus();
      scrollToHash('#builds');
    });

    $$('.primary-btn').forEach(button => {
      const text = button.textContent.toUpperCase();
      if (text.includes('START A BUILD')) button.addEventListener('click', event => { event.preventDefault(); openModal($('#submit-modal')); });
      if (text.includes('SHARE BUILD')) button.addEventListener('click', event => { event.preventDefault(); openModal($('#submit-modal')); });
    });

    refreshSession().then(loadBuilds);
    if (db) db.auth.onAuthStateChange((_event, session) => {
      state.user = session?.user || null;
      state.profileName = state.user?.user_metadata?.operator_name || state.user?.user_metadata?.name || '';
      setAuthUi();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
})();
