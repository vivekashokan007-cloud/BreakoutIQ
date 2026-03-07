// ===================== MULTI-DEVICE SYNC — GitHub Gist =====================
// Syncs watchlist, trades, and dayLog calendar across devices via GitHub Gist API.
// Token loaded from login.json (gitignored) or entered manually in UI.


// ===================== LOGIN.JSON CONFIG =====================
// Loads GitHub token (and optional gist_id) from login.json at startup.
// login.json format: { "github_token": "ghp_...", "gist_id": "optional" }
// If login.json is missing the UI manual-entry fallback still works.
async function loadLoginConfig() {
  try {
    const res = await fetch('login.json');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.github_token) {
      githubToken = cfg.github_token;
      localStorage.setItem(GH_TOKEN_KEY, githubToken);
    }
    if (cfg.gist_id) {
      gistId = cfg.gist_id;
      localStorage.setItem(GIST_ID_KEY, gistId);
    }
    window._tokenFromFile = !!cfg.github_token;
  } catch(e) { /* login.json absent — manual entry still works */ }
}

// ===================== MULTI-DEVICE SYNC =====================
const GH_TOKEN_KEY  = 'breakoutiq_gh_token';
const GIST_ID_KEY   = 'breakoutiq_gist_id';
const LAST_SYNC_KEY = 'breakoutiq_last_sync';

let githubToken  = localStorage.getItem(GH_TOKEN_KEY) || '';
let gistId       = localStorage.getItem(GIST_ID_KEY)  || '';
let syncInterval = null;

// --- Helpers ---
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function ghHeaders() {
  return { 'Authorization': 'Bearer ' + githubToken, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' };
}
function gistAPIUrl(id) { return 'https://api.github.com/gists/' + (id || gistId); }

// --- UI ---
function openSyncModal() {
  document.getElementById('syncModal').classList.add('open');
  refreshSyncUI();
}
function closeSyncModal() {
  document.getElementById('syncModal').classList.remove('open');
}
function showSyncPanel(id, btn) {
  document.querySelectorAll('.sync-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sync-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  btn.classList.add('active');
}

function refreshSyncUI() {
  const statusEl  = document.getElementById('sync-status-box');
  const statusTxt = document.getElementById('sync-status-text');
  const syncBtn   = document.getElementById('sync-now-btn');
  const headerDot = document.getElementById('sync-header-dot');
  const headerLbl = document.getElementById('sync-header-label');
  const headerBtn = document.getElementById('sync-header-btn');
  const gistEl    = document.getElementById('gist-id-display');

  if (gistEl) gistEl.textContent = gistId || '—';

  // Prefill setup fields if already configured
  const tokenInput = document.getElementById('github-token-input');
  const gistInput  = document.getElementById('github-gist-input');
  if (tokenInput && githubToken) tokenInput.value = githubToken;
  if (gistInput  && gistId)     gistInput.value  = gistId;

  if (!githubToken || !gistId) {
    statusEl.className = 'sync-status-box warning';
    statusTxt.textContent = 'GitHub Gist not configured — go to ⚙️ GitHub Setup tab';
    syncBtn.disabled = true;
    headerDot.className = 'sync-dot';
    headerLbl.textContent = 'Sync';
    headerBtn.className = 'sync-btn';
  } else {
    statusEl.className = 'sync-status-box ok';
    statusTxt.textContent = '✅ GitHub Gist connected — Gist ID: ' + gistId.substring(0, 10) + '…';
    syncBtn.disabled = false;
    headerDot.className = 'sync-dot on';
    headerLbl.textContent = gistId.substring(0, 6);
    headerBtn.className = 'sync-btn connected';
  }

  // Last sync time
  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  const lastSyncEl = document.getElementById('last-sync-time');
  if (lastSyncEl && lastSync) {
    const d = new Date(lastSync);
    lastSyncEl.textContent = 'Last synced: ' + d.toLocaleString('en-IN', {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  }
}

function copyGistId() {
  if (!gistId) { showNotif('No Gist', 'Connect GitHub first', true); return; }
  navigator.clipboard.writeText(gistId).then(() => showNotif('Copied!', 'Gist ID copied to clipboard'));
}

function copyToken() {
  if (!githubToken) return;
  navigator.clipboard.writeText(githubToken).then(() => showNotif('Copied!', 'Token copied'));
}

function joinWithGistId() {
  const input = document.getElementById('join-gist-input').value.trim();
  if (!input || input.length < 10) { showNotif('Invalid Gist ID', 'Paste the full Gist ID', true); return; }
  if (!githubToken) { showNotif('No Token', 'Set up GitHub token first', true); return; }
  gistId = input;
  localStorage.setItem(GIST_ID_KEY, gistId);
  refreshSyncUI();
  pullFromGithub(() => showNotif('Linked!', 'Now syncing with Gist ' + gistId.substring(0,8) + '…'));
}

// --- GitHub Gist Operations ---
async function saveGithubConfig() {
  const token  = document.getElementById('github-token-input').value.trim();
  const manual = document.getElementById('github-gist-input').value.trim();
  if (!token || !token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
    showGithubTestResult('❌ Invalid token — must start with ghp_ or github_pat_', false); return;
  }
  showGithubTestResult('⏳ Connecting to GitHub…', null);
  try {
    let resolvedId = manual;
    if (!resolvedId) {
      // Create a new private gist
      const res = await fetch('https://api.github.com/gists', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
        body: JSON.stringify({ description: 'BreakoutIQ Sync Data', public: false, files: { 'breakoutiq.json': { content: '{}' } } })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' — check token permissions (needs gist scope)');
      const data = await res.json();
      resolvedId = data.id;
    } else {
      // Validate existing gist is accessible
      const res = await fetch(gistAPIUrl(resolvedId), {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }
      });
      if (!res.ok) throw new Error('Cannot access Gist — check ID and token');
    }
    githubToken = token;
    gistId      = resolvedId;
    localStorage.setItem(GH_TOKEN_KEY, githubToken);
    localStorage.setItem(GIST_ID_KEY,  gistId);
    showGithubTestResult('✅ Connected! Gist ID: ' + gistId.substring(0,10) + '…', true);
    refreshSyncUI();
    startAutoSync();
    setTimeout(() => { document.querySelector('.sync-tab').click(); }, 1200);
  } catch(e) {
    showGithubTestResult('❌ ' + e.message, false);
  }
}

function showGithubTestResult(msg, ok) {
  const el = document.getElementById('github-test-result');
  el.style.display = 'block';
  el.style.color = ok === true ? 'var(--accent2)' : ok === false ? 'var(--danger)' : 'var(--text2)';
  el.textContent = msg;
}

function clearGithubConfig() {
  if (!confirm('Disconnect GitHub Gist sync?')) return;
  githubToken = ''; gistId = '';
  localStorage.removeItem(GH_TOKEN_KEY);
  localStorage.removeItem(GIST_ID_KEY);
  stopAutoSync();
  refreshSyncUI();
  showNotif('Disconnected', 'GitHub sync removed');
}

async function syncNow() {
  if (!githubToken || !gistId) return;
  const btn = document.getElementById('sync-now-btn');
  const headerDot = document.getElementById('sync-header-dot');
  btn.textContent = '⏳ Syncing...'; btn.disabled = true;
  headerDot.className = 'sync-dot spin';

  try {
    await pushToGithub();
    await pullFromGithub();
    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    refreshSyncUI();
    btn.textContent = '✅ Synced!';
    headerDot.className = 'sync-dot on';
    setTimeout(() => { btn.textContent = '☁️ Sync Now'; btn.disabled = false; }, 1500);
  } catch(e) {
    btn.textContent = '❌ Failed — Retry'; btn.disabled = false;
    headerDot.className = 'sync-dot';
    showNotif('Sync Failed', 'Check internet / token', true);
  }
}

async function pushToGithub() {
  // File 1: watchlist + trades
  const payload = { watchlist, trades, updatedAt: Date.now(), device: navigator.userAgent.substring(0, 40) };
  // File 2: dayLog calendar (lightweight — just datekeys + stock counts)
  const logPayload = { dayLog, updatedAt: Date.now() };
  const res = await fetch(gistAPIUrl(), {
    method: 'PATCH',
    headers: ghHeaders(),
    body: JSON.stringify({
      files: {
        'breakoutiq.json':     { content: JSON.stringify(payload) },
        'breakoutiq-log.json': { content: JSON.stringify(logPayload) }
      }
    })
  });
  if (!res.ok) throw new Error('Push failed: ' + res.status);
}

async function pullFromGithub(cb) {
  const res = await fetch(gistAPIUrl(), { headers: ghHeaders() });
  if (!res.ok) throw new Error('Pull failed: ' + res.status);
  const gist = await res.json();

  // ── Pull watchlist + trades ────────────────────────────────
  const raw = gist.files && gist.files['breakoutiq.json'] && gist.files['breakoutiq.json'].content;
  if (raw && raw !== '{}') {
    let data;
    try { data = JSON.parse(raw); } catch(e) { data = null; }
    if (data) {
      const remoteTs = data.updatedAt || 0;
      const localTs  = parseInt(localStorage.getItem('breakoutiq_local_ts') || '0');
      if (remoteTs > localTs) {
        if (Array.isArray(data.watchlist)) {
          watchlist = [...new Set([...watchlist, ...data.watchlist])];
          localStorage.setItem('watchlist', JSON.stringify(watchlist));
          renderWatchlist();
          document.getElementById('stat-watch').textContent = watchlist.length;
        }
        if (Array.isArray(data.trades)) {
          const localIds  = new Set(trades.map(t => t.id));
          const newTrades = data.trades.filter(t => !localIds.has(t.id));
          trades = [...trades, ...newTrades].sort((a,b) => b.id - a.id);
          localStorage.setItem('trades', JSON.stringify(trades));
          renderTrades();
          updateJournalStats();
          document.getElementById('stat-trades').textContent = trades.filter(t => !t.exit).length;
        }
        showNotif('Synced ☁️', 'Data updated from GitHub Gist');
      }
      localStorage.setItem('breakoutiq_local_ts', Date.now());
    }
  }

  // ── Pull dayLog calendar ───────────────────────────────────
  const logRaw = gist.files && gist.files['breakoutiq-log.json'] && gist.files['breakoutiq-log.json'].content;
  if (logRaw && logRaw !== '{}') {
    let logData;
    try { logData = JSON.parse(logRaw); } catch(e) { logData = null; }
    if (logData && logData.dayLog) {
      let newEntries = 0;
      for (const [datekey, record] of Object.entries(logData.dayLog)) {
        if (!dayLog[datekey]) {
          dayLog[datekey] = record;
          if (db) await dbPut('daylog', record);
          newEntries++;
        }
      }
      if (newEntries > 0) {
        renderDataCalendar();
        renderStorageBanner();
      }
    }
  }

  if (cb) cb();
}

function startAutoSync() {
  stopAutoSync();
  if (!githubToken || !gistId) return;
  syncInterval = setInterval(() => {
    pushToGithub().catch(console.warn);
  }, 5 * 60 * 1000);
}

function stopAutoSync() {
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
}
