// ===================== EXPORT / IMPORT / BACKUP =====================
// Full export, watchlist+journal export, NSE-only export, JSON import, dateStamp

// ===================== EXPORT / IMPORT =====================
function exportAllData() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    watchlist,
    trades,
    nseDataByDate,
    uploadedFileNames,
    weeklyCandidates,
    gistId,
  };
  downloadJSON(payload, 'BreakoutIQ_Full_' + dateStamp() + '.json');
  showBackupResult('✅ Full export downloaded');
}

function exportWatchlistJournal() {
  const payload = { version: 2, exportedAt: new Date().toISOString(), watchlist, trades };
  downloadJSON(payload, 'BreakoutIQ_WatchJournal_' + dateStamp() + '.json');
  showBackupResult('✅ Watchlist + Journal exported');
}

function exportNSEOnly() {
  const payload = { version: 2, exportedAt: new Date().toISOString(), nseDataByDate, uploadedFileNames };
  downloadJSON(payload, 'BreakoutIQ_NSE_' + dateStamp() + '.json');
  showBackupResult('✅ NSE data exported');
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function importFromFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      let msg = [];

      if (Array.isArray(data.watchlist)) {
        watchlist = [...new Set([...watchlist, ...data.watchlist])];
        localStorage.setItem('watchlist', JSON.stringify(watchlist));
        renderWatchlist();
        document.getElementById('stat-watch').textContent = watchlist.length;
        msg.push(watchlist.length + ' watchlist items');
      }
      if (Array.isArray(data.trades)) {
        const localIds = new Set(trades.map(t => t.id));
        const newTrades = data.trades.filter(t => !localIds.has(t.id));
        trades = [...trades, ...newTrades].sort((a,b) => b.id - a.id);
        localStorage.setItem('trades', JSON.stringify(trades));
        renderTrades(); updateJournalStats();
        document.getElementById('stat-trades').textContent = trades.filter(t => !t.exit).length;
        msg.push(trades.length + ' journal trades');
      }
      if (data.nseDataByDate && typeof data.nseDataByDate === 'object') {
        // Merge NSE data
        Object.entries(data.nseDataByDate).forEach(([date, stocks]) => {
          if (!nseDataByDate[date]) nseDataByDate[date] = {};
          Object.assign(nseDataByDate[date], stocks);
        });
        if (Array.isArray(data.uploadedFileNames)) {
          uploadedFileNames = [...new Set([...uploadedFileNames, ...data.uploadedFileNames])];
        }
        saveNSEToStorage();
        updateDataQuality();
        renderUploadedFiles(false);
        renderStorageBanner();
        const days = Object.keys(nseDataByDate).filter(k => !k.startsWith('UNKNOWN')).length;
        msg.push(days + ' NSE trading days');
      }
      if (Array.isArray(data.weeklyCandidates)) {
        const localIds = new Set(weeklyCandidates.map(c => c.id));
        const newCands = data.weeklyCandidates.filter(c => !localIds.has(c.id));
        weeklyCandidates = [...weeklyCandidates, ...newCands];
        saveWeeklyCandidates();
        renderWeeklyCandidates();
        msg.push(weeklyCandidates.length + ' weekly candidates');
      }
      // Note: legacy syncCode field from old Firebase exports is ignored

      showBackupResult('✅ Imported: ' + msg.join(', '));
      showNotif('Import Done', msg.join(', '));
      input.value = '';
    } catch(err) {
      showBackupResult('❌ Invalid file — must be a BreakoutIQ .json export');
    }
  };
  reader.readAsText(file);
}

function showBackupResult(msg) {
  const el = document.getElementById('backup-result');
  const txt = document.getElementById('backup-result-text');
  el.style.display = 'flex';
  el.className = 'sync-status-box ' + (msg.startsWith('✅') ? 'ok' : 'error');
  txt.textContent = msg;
  setTimeout(() => el.style.display = 'none', 4000);
}

function dateStamp() {
  const d = new Date();
  return d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
}
