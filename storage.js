// ===================== INDEXEDDB STORAGE ENGINE =====================
// Multi-year unlimited storage. Uses IndexedDB not localStorage to avoid 5MB cap.

// =====================================================================
//  INDEXEDDB — Unlimited multi-year storage engine
// =====================================================================
const DB_NAME = 'BreakoutIQ', DB_VERSION = 2;
let db = null;

let nseDataByDate    = {};
let uploadedFileNames = [];
let dayLog           = {};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('ohlcv'))
        d.createObjectStore('ohlcv',    { keyPath: 'datekey' });
      if (!d.objectStoreNames.contains('daylog'))
        d.createObjectStore('daylog',   { keyPath: 'datekey' });
      if (!d.objectStoreNames.contains('uploads'))
        d.createObjectStore('uploads',  { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function dbPut(store, record) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(record);
    req.onsuccess = () => res(); req.onerror = e => rej(e.target.error);
  });
}

function dbGetAll(store) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = e => res(e.target.result); req.onerror = e => rej(e.target.error);
  });
}

function dbDelete(store, key) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => res(); req.onerror = e => rej(e.target.error);
  });
}

function dbClearStore(store) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => res(); req.onerror = e => rej(e.target.error);
  });
}

async function saveNSEToStorage() {
  if (!db) return;
  const dates = Object.keys(nseDataByDate).filter(k => !k.startsWith('UNKNOWN'));
  for (const datekey of dates) {
    await dbPut('ohlcv', { datekey, data: nseDataByDate[datekey], savedAt: Date.now() });
  }
  localStorage.setItem(NSE_NAMES_KEY,   JSON.stringify(uploadedFileNames));
  localStorage.setItem(NSE_SAVEDAT_KEY, new Date().toISOString());
  renderStorageBanner();
}

async function loadNSEFromStorage() {
  try {
    await openDB();

    // --- MIGRATION: move old localStorage data → IndexedDB ---
    const oldData = localStorage.getItem(NSE_STORAGE_KEY);
    if (oldData) {
      try {
        const parsed = JSON.parse(oldData);
        for (const [datekey, data] of Object.entries(parsed)) {
          if (!datekey.startsWith('UNKNOWN'))
            await dbPut('ohlcv', { datekey, data, savedAt: Date.now() });
        }
        localStorage.removeItem(NSE_STORAGE_KEY);
        showNotif('Storage Upgraded ✓', 'Data moved to IndexedDB — no more 5MB limit');
      } catch(me) { console.warn('Migration failed:', me); }
    }

    // Load OHLCV
    const rows = await dbGetAll('ohlcv');
    nseDataByDate = {};
    rows.forEach(r => { nseDataByDate[r.datekey] = r.data; });

    // Load filenames
    const names = localStorage.getItem(NSE_NAMES_KEY);
    uploadedFileNames = names ? JSON.parse(names) : [];

    // Load day log
    const logRows = await dbGetAll('daylog');
    dayLog = {};
    logRows.forEach(r => { dayLog[r.datekey] = r; });

    if (Object.keys(nseDataByDate).length > 0) {
      updateDataQuality();
      renderUploadedFiles(false);
      renderStorageBanner();
      renderDataCalendar();
    }
  } catch(e) {
    console.warn('IndexedDB load failed, trying localStorage:', e);
    try {
      const raw = localStorage.getItem(NSE_STORAGE_KEY);
      if (raw) { nseDataByDate = JSON.parse(raw); updateDataQuality(); renderStorageBanner(); }
    } catch(e2) {}
  }
}

async function logDayUpload(datekey, stockCount, topSignals) {
  if (!db || !datekey || datekey.startsWith('UNKNOWN')) return;
  const existing = dayLog[datekey] || {};
  const record = {
    datekey,
    uploaded_at: existing.uploaded_at || new Date().toISOString(),
    stock_count: stockCount,
    top_signals: topSignals || [],
    breakout_count: 0,
    notes: existing.notes || '',
  };
  dayLog[datekey] = record;
  await dbPut('daylog', record);
}

async function logUploadHistory(fileName, datekey, stockCount) {
  if (!db) return;
  await dbPut('uploads', { fileName, datekey, stockCount, uploadedAt: new Date().toISOString() });
}

async function clearAllNSEStorage() {
  if (!confirm('Clear all saved OHLCV data?\n\nDay log history is preserved — you\'ll still see which dates you\'ve worked with.')) return;
  if (db) await dbClearStore('ohlcv');
  localStorage.removeItem(NSE_STORAGE_KEY);
  localStorage.removeItem(NSE_NAMES_KEY);
  localStorage.removeItem(NSE_SAVEDAT_KEY);
  clearNSEData();
  document.getElementById('nse-storage-banner').style.display = 'none';
  renderDataCalendar();
  showNotif('Cleared', 'OHLCV data removed. History log preserved.');
}
