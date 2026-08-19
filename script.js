(() => {
  'use strict';
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const config = window.BREAKLINE_CONFIG || {};
  const hasSupabase = Boolean(window.supabase && config.supabaseUrl && config.supabaseAnonKey);
  const db = hasSupabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  const state = { user:null, profileName:'', authMode:'login', builds:[], filter:'ALL', search:'', sort:'trending', saved:new Set(JSON.parse(localStorage.getItem('breakline_saved') || '[]')) };

  const toast = (message,type='info') => { const el=$('#toast'); if(!el)return; el.textContent=message; el.dataset.type=type; el.classList.add('show'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.remove('show'),3200); };
  const openModal = m => { if(!m)return; if(typeof m.showModal==='function'&&!m.open)m.showModal(); else m.setAttribute('open',''); };
  const closeModal = m => { if(!m)return; if(typeof m.close==='function'&&m.open)m.close(); else m.removeAttribute('open'); };
  const escapeHtml = v => String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  const formatKoen = v => `₭ ${Number(v||0).toLocaleString('en-US')}`;

  function setAuthMode(mode) {
    state.authMode=mode;
    const title=$('#auth-title'), eyebrow=$('#auth-eyebrow'), submit=$('#auth-submit'), toggle=$('#auth-toggle'), name=$('#auth-name'), note=$('#auth-note');
    if(!title)return;
    const login=mode==='login';
    eyebrow.innerHTML=`<span></span> ${login?'OPERATOR LOGIN':'OPERATOR ACCESS'}`;
    title.innerHTML=login?'Welcome <em>back.</em>':'Join the <em>line.</em>';
    submit.innerHTML=login?'LOG IN <b>→</b>':'CREATE PROFILE <b>→</b>';
    toggle.innerHTML=login?'NEW HERE? <b>CREATE AN ACCOUNT</b>':'ALREADY HAVE AN ACCOUNT? <b>LOG IN</b>';
    name.style.display=login?'none':'';
    name.required=!login;
    note.textContent=login?'Use the email and password for your abiBUILDS account.':'Create a profile to publish builds, save favorites, and earn reputation.';
  }

  function setAuthUi(){
    const login=$('[data-open-auth]'), submitNote=$('#submit-note');
    if(login)login.textContent=state.user?`LOG OUT (${state.profileName||'OPERATOR'})`:'LOG IN';
    if(submitNote)submitNote.textContent=state.user?`Signed in as ${state.profileName||state.user.email}. Your build will publish to the community.`:'Sign in first to publish a build.';
  }

  async function refreshSession(){
    if(!db)return setAuthUi();
    const {data,error}=await db.auth.getSession();
    if(error)console.warn('Supabase session error:',error.message);
    state.user=data?.session?.user||null;
    state.profileName=state.user?.user_metadata?.operator_name||state.user?.user_metadata?.name||'';
    setAuthUi();
  }

  async function handleAuth(event){
    event.preventDefault();
    if(!db)return toast('Supabase is not configured.','error');
    const email=$('#auth-email')?.value.trim(), password=$('#auth-password')?.value, name=$('#auth-name')?.value.trim();
    if(!email||!password||(state.authMode==='signup'&&!name))return;
    const button=$('#auth-submit'); if(button)button.disabled=true;
    try{
      let data,error;
      if(state.authMode==='login'){
        ({data,error}=await db.auth.signInWithPassword({email,password}));
      }else{
        ({data,error}=await db.auth.signUp({email,password,options:{data:{operator_name:name}}}));
      }
      if(error)throw error;
      state.user=data.user||null;
      state.profileName=state.user?.user_metadata?.operator_name||name||'';
      setAuthUi();
      if(state.authMode==='login'){
        closeModal($('#auth-modal')); toast('Logged in successfully.','success');
      }else if(data.session){
        closeModal($('#auth-modal')); toast('Account created. You are signed in.','success');
      }else{
        toast('Account created. Check your email to confirm it, then log in.','success');
        setAuthMode('login');
      }
      $('#auth-form')?.reset();
    }catch(error){
      const msg=error?.message||'Authentication failed.';
      toast(msg,'error');
      const note=$('#auth-note'); if(note)note.textContent=msg;
    }finally{if(button)button.disabled=false;}
  }

  async function logOut(){ if(!db||!state.user)return; const {error}=await db.auth.signOut(); if(error)return toast(error.message,'error'); state.user=null;state.profileName='';setAuthUi();toast('Logged out.','success'); }

  function buildMatches(b){ const type=String(b.type||'').toUpperCase(), hay=[b.title,b.type,b.weapon,b.notes,b.author].join(' ').toLowerCase(); return (state.filter==='ALL'||type===state.filter||(state.filter==='BUDGET'&&type==='BUDGET'))&&(!state.search||hay.includes(state.search.toLowerCase())); }
  function sortBuilds(bs){ return [...bs].sort((a,b)=>state.sort==='newest'?new Date(b.created_at||0)-new Date(a.created_at||0):state.sort==='price-low'?Number(a.price||0)-Number(b.price||0):state.sort==='price-high'?Number(b.price||0)-Number(a.price||0):(Number(b.likes||0)-Number(a.likes||0))||(new Date(b.created_at||0)-new Date(a.created_at||0))); }
  function renderBuilds(){ const grid=$('#build-grid');if(!grid)return;const visible=sortBuilds(state.builds).filter(buildMatches);const count=$('#build-count');if(count)count.textContent=visible.length;if(!visible.length){grid.innerHTML='<div class="empty-state">NO BUILDS MATCH YOUR SEARCH.</div>';return;}grid.innerHTML=visible.map((b,i)=>{const id=escapeHtml(b.id),type=escapeHtml(b.type||'BUILD'),saved=state.saved.has(String(b.id));return `<article class="build-card ${i===0?'featured':''}"><div class="card-visual weapon-${(i%3)+1}"><span class="tier">COMMUNITY</span><button type="button" class="save ${saved?'saved':''}" data-save-build="${id}">${saved?'♥':'♡'}</button><div class="weapon-silhouette ${type.toLowerCase().includes('smg')?'smg':type.toLowerCase().includes('dmr')?'dmr':'ar'}"></div><span class="tag top">${type==='BUDGET'?'BUDGET KING':i===0?'TOP PICK':'COMMUNITY'}</span></div><div class="card-body"><div class="card-meta"><span>${type}</span><span class="up">▲ ${Number(b.likes||0)} likes</span></div><h3>${escapeHtml(b.title)}</h3><p>${escapeHtml(b.weapon)}</p><div class="card-foot"><span class="price">${formatKoen(b.price)}</span><span class="author">BY <b>${escapeHtml(b.author||'OPERATOR')}</b></span></div></div></article>`;}).join(''); }
  async function loadBuilds(){ if(!db){state.builds=[];return renderBuilds();}const {data,error}=await db.from('builds').select('*').order('likes',{ascending:false}).order('created_at',{ascending:false}).limit(100);if(error){console.warn(error.message);state.builds=[];}else state.builds=data||[];renderBuilds(); }
  async function submitBuild(e){e.preventDefault();if(!db)return toast('Supabase is not configured.','error');if(!state.user){closeModal($('#submit-modal'));setAuthMode('login');openModal($('#auth-modal'));return toast('Log in first to publish a build.','error');}const payload={title:$('#build-title')?.value.trim(),type:$('#build-type')?.value,weapon:$('#build-weapon')?.value.trim(),price:Number($('#build-price')?.value||0),notes:$('#build-notes')?.value.trim(),author:state.profileName||state.user.email?.split('@')[0]||'OPERATOR',user_id:state.user.id};try{const {error}=await db.from('builds').insert(payload);if(error)throw error;$('#build-form')?.reset();closeModal($('#submit-modal'));await loadBuilds();toast('Build published successfully.','success');}catch(err){toast(err.message||'Could not publish the build.','error');}}

  function setup(){
    setAuthMode('login');
    document.addEventListener('click',async e=>{
      const auth=e.target.closest('[data-open-auth]'), submit=e.target.closest('[data-open-submit]'), close=e.target.closest('[data-close]'), toggle=e.target.closest('#auth-toggle'), save=e.target.closest('[data-save-build]');
      if(auth){e.preventDefault();if(state.user)return logOut();setAuthMode('login');openModal($('#auth-modal'));}
      if(submit){e.preventDefault();openModal($('#submit-modal'));}
      if(toggle){e.preventDefault();setAuthMode(state.authMode==='login'?'signup':'login');}
      if(close)closeModal(close.closest('dialog'));
      if(save){e.preventDefault();const id=String(save.dataset.saveBuild);state.saved.has(id)?state.saved.delete(id):state.saved.add(id);localStorage.setItem('breakline_saved',JSON.stringify([...state.saved]));renderBuilds();}
    });
    $$('.filter[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{$$('.filter[data-filter]').forEach(x=>x.classList.toggle('selected',x===btn));state.filter=btn.dataset.filter;renderBuilds();}));
    $('#build-search')?.addEventListener('input',e=>{state.search=e.target.value.trim();renderBuilds();});
    $('#auth-form')?.addEventListener('submit',handleAuth);
    $('#build-form')?.addEventListener('submit',submitBuild);
    ['#auth-modal','#submit-modal'].forEach(s=>$(s)?.addEventListener('click',e=>{if(e.target===$(s))closeModal($(s));}));
    refreshSession().then(loadBuilds);
    if(db)db.auth.onAuthStateChange((_event,session)=>{state.user=session?.user||null;state.profileName=state.user?.user_metadata?.operator_name||'';setAuthUi();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
