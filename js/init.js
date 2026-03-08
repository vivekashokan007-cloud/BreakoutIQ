// ===================== APP STARTUP =====================
// Runs after all modules load. Order: migrate → load NSE → render weekly → load login → start sync

// Migrate old Firebase localStorage keys (one-time)
(function migrateFromFirebase() {
  const oldUrl  = localStorage.getItem('breakoutiq_fb_url');
  const oldCode = localStorage.getItem('breakoutiq_sync_code');
  if (oldUrl)  localStorage.removeItem('breakoutiq_fb_url');
  if (oldCode) localStorage.removeItem('breakoutiq_sync_code');
})();

// Load saved NSE data on startup
loadNSEFromStorage();

// Load auxiliary data (delivery %, ASM list) from localStorage
loadAuxData();

// Load market health manual inputs from localStorage
loadMarketInputs();

// Init weekly watchlist
renderWeeklyCandidates();

// Load login.json then init sync
loadLoginConfig().then(() => {
  if (githubToken && gistId) startAutoSync();
  refreshSyncUI();
  setTimeout(() => {
    const inp = document.getElementById('github-token-input');
    if (inp && window._tokenFromFile) {
      inp.value = '(loaded from login.json)';
      inp.setAttribute('readonly', true);
      inp.style.opacity = '0.5';
      inp.style.cursor = 'not-allowed';
    }
  }, 200);
});
