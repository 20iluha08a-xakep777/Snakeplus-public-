/* ================================================================
   Snake+ Cloud Sync v3.0.0
   Зависит от: @supabase/supabase-js@2 (подключается в HTML перед этим файлом)
   ================================================================ */
(function(global){
'use strict';

const SUPABASE_URL = 'https://ugyocgrhxvahzzmmqzvu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_COkAdbH9_c4H6VtooRFLng_onF_q9cM';

if(typeof supabase === 'undefined'){
  console.error('[Cloud] supabase-js не подключён. Добавь CDN перед этим файлом.');
  global.Cloud = { init: () => Promise.resolve(null), getUser: () => null };
  return;
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let currentUser = null;
let currentProfile = null;
let syncTimer = null;
const listeners = { auth: [], sync: [] };

function emit(ev, data){ (listeners[ev]||[]).forEach(fn => { try{ fn(data); }catch(e){ console.warn(e); } }); }
function on(ev, fn){ (listeners[ev] = listeners[ev]||[]).push(fn); }

async function init(){
  try{
    const { data: { session } } = await sb.auth.getSession();
    if(session && session.user){
      currentUser = session.user;
      await loadProfile();
    }
    sb.auth.onAuthStateChange(async (ev, session) => {
      if(session && session.user){
        currentUser = session.user;
        await loadProfile();
        emit('auth', { user: currentUser, profile: currentProfile });
      } else {
        currentUser = null;
        currentProfile = null;
        emit('auth', { user: null, profile: null });
      }
    });
  }catch(e){ console.warn('[Cloud] init error', e); }
  return currentUser;
}

async function signInAnonymously(){
  const { data, error } = await sb.auth.signInAnonymously();
  if(error) throw error;
  currentUser = data.user;
  await loadProfile();
  emit('auth', { user: currentUser, profile: currentProfile });
  return currentUser;
}

async function signInWithEmail(email){
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: (typeof location !== 'undefined' ? location.origin : '') }
  });
  if(error) throw error;
}

async function signOut(){
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  emit('auth', { user: null, profile: null });
}

async function loadProfile(){
  if(!currentUser) return null;
  const { data, error } = await sb.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if(error){ console.warn('[Cloud] loadProfile', error.message); return null; }
  currentProfile = data;
  return data;
}

async function updateProfile(patch){
  if(!currentUser) return;
  const { error } = await sb.from('profiles').update(patch).eq('id', currentUser.id);
  if(error) throw error;
  await loadProfile();
}

function collectLocalState(){
  const state = {};
  const keys = [
    'snake_coins_v240','snake_records_v240','snake_owned_skins_v240',
    'snake_owned_themes_v240','snake_owned_games_v240','snake_owned_upgrades_v240',
    'snake_xp_v240','snake_level_v240','snake_stats_v240','snake_ach_v240',
    'snake_daily_v240'
  ];
  for(const k of keys){
    try{
      const v = localStorage.getItem(k);
      if(v !== null){
        try{ state[k] = JSON.parse(v); }catch(e){ state[k] = v; }
      }
    }catch(e){}
  }
  return state;
}

function applyRemoteState(remote){
  if(!remote || typeof remote !== 'object') return;
  for(const k in remote){
    try{
      const v = remote[k];
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      localStorage.setItem(k, str);
    }catch(e){}
  }
}

function mergeProgress(local, remote){
  if(!remote) return local;
  if(!local) return remote;
  const merged = Object.assign({}, remote);

  merged['snake_records_v240'] = Object.assign({}, remote['snake_records_v240']||{});
  const lr = local['snake_records_v240'] || {};
  for(const k in lr){
    merged['snake_records_v240'][k] = Math.max(merged['snake_records_v240'][k]||0, lr[k]||0);
  }

  merged['snake_coins_v240'] = Math.max(remote['snake_coins_v240']||0, local['snake_coins_v240']||0);

  ['snake_owned_skins_v240','snake_owned_themes_v240','snake_owned_games_v240'].forEach(k=>{
    const rs = remote[k]||[], ls = local[k]||[];
    merged[k] = Array.from(new Set([].concat(rs, ls)));
  });

  merged['snake_owned_upgrades_v240'] = Object.assign({}, remote['snake_owned_upgrades_v240']||{});
  const lu = local['snake_owned_upgrades_v240'] || {};
  for(const k in lu){
    merged['snake_owned_upgrades_v240'][k] = Math.max(merged['snake_owned_upgrades_v240'][k]||0, lu[k]||0);
  }

  merged['snake_ach_v240'] = Object.assign({}, remote['snake_ach_v240']||{});
  const la = local['snake_ach_v240'] || {};
  for(const id in la){
    if(!merged['snake_ach_v240'][id] || la[id] < merged['snake_ach_v240'][id]){
      merged['snake_ach_v240'][id] = la[id];
    }
  }

  const rl = remote['snake_level_v240']||0, ll = local['snake_level_v240']||0;
  if(ll > rl){
    merged['snake_level_v240'] = ll;
    merged['snake_xp_v240'] = local['snake_xp_v240']||0;
  } else if(ll === rl){
    merged['snake_xp_v240'] = Math.max(remote['snake_xp_v240']||0, local['snake_xp_v240']||0);
  }

  const rd = (remote['snake_daily_v240']||{}).lastDate || '';
  const ld = (local['snake_daily_v240']||{}).lastDate || '';
  if(ld > rd) merged['snake_daily_v240'] = local['snake_daily_v240'];

  const rs = remote['snake_stats_v240']||{};
  const ls = local['snake_stats_v240']||{};
  const ms = Object.assign({}, rs);
  for(const k in ls){
    if(k === 'modeGames'){
      ms.modeGames = Object.assign({}, rs.modeGames||{});
      for(const m in (ls.modeGames||{})){
        ms.modeGames[m] = Math.max(ms.modeGames[m]||0, ls.modeGames[m]||0);
      }
    } else if(typeof ls[k] === 'number'){
      ms[k] = Math.max(rs[k]||0, ls[k]);
    }
  }
  merged['snake_stats_v240'] = ms;

  return merged;
}

async function push(){
  if(!currentUser) return { ok: false, reason: 'no_auth' };
  try{
    const local = collectLocalState();
    const { data: row, error } = await sb.from('progress').select('data').eq('user_id', currentUser.id).maybeSingle();
    if(error) return { ok: false, reason: error.message };
    const remote = (row && row.data) || {};
    const merged = mergeProgress(local, remote);
    const { error: upErr } = await sb.from('progress').upsert({
      user_id: currentUser.id,
      data: merged,
      updated_at: new Date().toISOString()
    });
    if(upErr) return { ok: false, reason: upErr.message };
    applyRemoteState(merged);
    emit('sync', { ok: true, merged });
    return { ok: true, merged };
  }catch(e){
    return { ok: false, reason: String(e.message||e) };
  }
}

async function pull(){
  if(!currentUser) return null;
  const { data, error } = await sb.from('progress').select('data').eq('user_id', currentUser.id).maybeSingle();
  if(error) return null;
  return (data && data.data) || null;
}

function startAutoSync(intervalMs){
  stopAutoSync();
  syncTimer = setInterval(()=>{ push().catch(()=>{}); }, intervalMs||60000);
}
function stopAutoSync(){
  if(syncTimer){ clearInterval(syncTimer); syncTimer = null; }
}

function getSharePayload(){
  if(!currentProfile) return null;
  return 'snakeplus://user?id=' + currentProfile.snake_id;
}

global.Cloud = {
  sb: sb,
  init: init,
  on: on,
  getUser: () => currentUser,
  getProfile: () => currentProfile,
  signInAnonymously: signInAnonymously,
  signInWithEmail: signInWithEmail,
  signOut: signOut,
  updateProfile: updateProfile,
  loadProfile: loadProfile,
  push: push,
  pull: pull,
  startAutoSync: startAutoSync,
  stopAutoSync: stopAutoSync,
  getSharePayload: getSharePayload
};

})(typeof window !== 'undefined' ? window : this);
