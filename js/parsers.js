// ===================== NSE PARSERS & DATA DISPLAY =====================
// Bhavcopy upload (xlsx/csv), parse, renderStorageBanner, renderDataCalendar

// ---- Storage banner ----
function renderStorageBanner() {
  const banner = document.getElementById('nse-storage-banner');
  if (!banner) return;
  const dates    = Object.keys(nseDataByDate).filter(k => !k.startsWith('UNKNOWN')).sort();
  const count    = dates.length;
  if (count === 0) { banner.style.display = 'none'; return; }

  // Anchor coverage from Jan 2025 to today
  const CAL_START  = '20250101';
  const todayDs    = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const fullYear   = getExpectedTradingDays(CAL_START, todayDs);
  const uploaded   = new Set(dates);
  const yearGaps   = fullYear.filter(d => !uploaded.has(d));
  const coveragePct = fullYear.length > 0 ? Math.round(count / fullYear.length * 100) : 0;

  // Within-range gaps (dates between first and last upload that are missing)
  const first = dates[0], last = dates[dates.length - 1];
  const inRange    = getExpectedTradingDays(first, last);
  const inRangeGaps = inRange.filter(d => !uploaded.has(d));

  const savedStr = (() => {
    const s = localStorage.getItem(NSE_SAVEDAT_KEY);
    return s ? new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
  })();

  const barCol  = coveragePct >= 80 ? 'var(--accent2)' : coveragePct >= 50 ? 'var(--warn)' : 'var(--danger)';
  const logCount = Object.keys(dayLog).length;

  banner.style.display = 'block';
  banner.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
        <div style="width:10px;height:10px;border-radius:50%;background:${barCol};flex-shrink:0;box-shadow:0 0 6px rgba(0,168,90,0.4);animation:pulse 2s infinite;"></div>
        <div style="min-width:0;">
          <div style="font-size:0.78rem;font-weight:700;color:${barCol};">
            📦 NSE Calendar — Jan 2025 Onwards &nbsp;
            <span style="font-size:0.85rem;">${count}/${fullYear.length} (${coveragePct}%)</span>
          </div>
          <div style="font-size:0.62rem;color:var(--text3);margin-top:2px;">
            ${formatDateKey(first)} → ${formatDateKey(last)} · ${logCount} in log · ${savedStr}
          </div>
        </div>
      </div>
      <button onclick="clearAllNSEStorage()" style="background:rgba(212,42,69,0.08);border:1px solid rgba(212,42,69,0.2);color:var(--danger);padding:6px 10px;border-radius:6px;font-family:'JetBrains Mono';font-size:0.65rem;cursor:pointer;white-space:nowrap;min-height:36px;flex-shrink:0;">🗑 Clear OHLCV</button>
    </div>
    <div style="margin-top:10px;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
      <div style="height:100%;width:${coveragePct}%;background:${barCol};border-radius:3px;transition:width 0.5s;"></div>
    </div>
    <div style="font-size:0.62rem;color:var(--text3);margin-top:5px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
      <span>${coveragePct >= 80 ? '✅ Good coverage' : coveragePct >= 50 ? '⚠️ Upload more for accuracy' : '❌ Need more data'}</span>
      ${inRangeGaps.length > 0
        ? `<span style="color:var(--danger);">⚠️ ${inRangeGaps.length} gap${inRangeGaps.length>1?'s':''} in your range:
            ${inRangeGaps.slice(0,3).map(d=>formatDateKey(d)).join(', ')}${inRangeGaps.length>3?' +more':''}</span>`
        : '<span style="color:var(--accent2);">✅ No gaps in your range</span>'}
    </div>`;
}

// =====================================================================
//  DATA CALENDAR — Visual month-by-month upload history
// =====================================================================
function renderDataCalendar() {
  const calEl = document.getElementById('data-calendar');
  if (!calEl) return;

  const allUploaded = Object.keys(nseDataByDate).filter(k => !k.startsWith('UNKNOWN')).sort();
  const logDates    = Object.keys(dayLog).sort();
  const uploadedSet = new Set(allUploaded);
  const logSet      = new Set(logDates);
  const monthNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Always anchor calendar from Jan 2025 to today
  const CAL_START = '20250101';
  const todayDs   = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const fullYearDays = getExpectedTradingDays(CAL_START, todayDs);
  const totalExpected = fullYearDays.length;
  const totalUploaded = allUploaded.length;
  const coveragePct   = totalExpected > 0 ? Math.round(totalUploaded / totalExpected * 100) : 0;
  const barCol        = coveragePct >= 80 ? 'var(--accent2)' : coveragePct >= 50 ? 'var(--warn)' : 'var(--danger)';

  // Build months from Jan 2025 to current month, newest first
  const months = [];
  let cy = 2025, cm = 1;
  const now = new Date();
  const ly = now.getFullYear(), lm = now.getMonth() + 1;
  while (cy * 100 + cm <= ly * 100 + lm) {
    months.push(`${cy}${String(cm).padStart(2,'0')}`);
    if (++cm > 12) { cm = 1; cy++; }
  }
  months.reverse();

  let html = '';
  const allMissingByMonth = {};

  months.forEach(mo => {
    const year  = +mo.slice(0,4), month = +mo.slice(4,6) - 1;
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    let mUploaded = 0, mGaps = 0, mExpected = 0;
    const missingDates = [];
    let cells = '';

    for (let i = 0; i < startOffset; i++) cells += '<div></div>';
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const ds    = `${year}${String(month+1).padStart(2,'0')}${String(d).padStart(2,'0')}`;
      const isUp  = uploadedSet.has(ds);
      const isLog = logSet.has(ds) && !isUp;
      const isTrd = isNSETradingDay(ds);
      const isHol = NSE_HOLIDAYS.has(ds);
      const isFut = ds > todayDs;

      if (isTrd && !isFut) {
        mExpected++;
        if (isUp) mUploaded++;
        else if (!isLog) { mGaps++; missingDates.push(ds); }
      }

      const logs = dayLog[ds];
      const tip  = isUp  ? `${formatDateKey(ds)} ✓ ${logs?.stock_count||''} stocks` :
                   isLog ? `${formatDateKey(ds)} logged` :
                   isHol ? `${formatDateKey(ds)} NSE Holiday` :
                   isFut ? `${formatDateKey(ds)} Future` :
                   !isTrd? `${formatDateKey(ds)} Weekend` :
                           `${formatDateKey(ds)} ← download this`;
      const cls  = isUp ? 'cal-uploaded' : isLog ? 'cal-logonly' : (isHol||!isTrd||isFut) ? 'cal-off' : 'cal-missing';
      cells += `<div class="cal-day ${cls}" title="${tip}">${d}${isUp ? '<div class="cal-dot"></div>' : ''}</div>`;
    }

    if (missingDates.length > 0) allMissingByMonth[`${monthNames[month]} ${year}`] = missingDates;

    const moLabel = mExpected > 0 ? `${mUploaded}/${mExpected}` : '—';
    html += `
    <div class="cal-month-block">
      <div class="cal-month-header">
        <span class="cal-month-name">${monthNames[month]} ${year}</span>
        <div class="cal-month-stats">
          <span class="cal-stat ${mGaps===0&&mExpected>0?'green':''}">
            ${moLabel} ${mGaps===0&&mExpected>0?'✓':''}
          </span>
          ${mGaps > 0 ? `<span class="cal-stat red">${mGaps} missing</span>` : ''}
        </div>
      </div>
      <div class="cal-dow-header"><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div></div>
      <div class="cal-grid">${cells}</div>
    </div>`;
  });

  // Missing days actionable list
  const missingMonths = Object.keys(allMissingByMonth);
  let missingHtml = '';
  if (missingMonths.length > 0) {
    const totalMissing = missingMonths.reduce((s,m) => s + allMissingByMonth[m].length, 0);
    missingHtml = `
    <div style="margin-top:16px;border:1px solid rgba(212,42,69,0.2);border-radius:10px;overflow:hidden;">
      <div style="background:rgba(212,42,69,0.06);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--danger);">⚠️ ${totalMissing} missing trading days — download these from NSE</span>
        <button onclick="this.closest('div').nextElementSibling.style.display=this.closest('div').nextElementSibling.style.display==='none'?'block':'none';this.textContent=this.textContent==='▼ Show'?'▲ Hide':'▼ Show';"
          style="font-size:0.65rem;background:transparent;border:none;color:var(--danger);cursor:pointer;font-family:inherit;">▼ Show</button>
      </div>
      <div style="display:none;padding:12px 14px;background:var(--card);">
        ${missingMonths.map(m => `
          <div style="margin-bottom:10px;">
            <div style="font-size:0.65rem;font-weight:700;color:var(--text2);letter-spacing:1px;margin-bottom:4px;">${m}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${allMissingByMonth[m].map(d =>
                `<span style="background:rgba(212,42,69,0.08);border:1px solid rgba(212,42,69,0.2);padding:2px 7px;border-radius:4px;font-size:0.62rem;color:var(--danger);">${formatDateKey(d)}</span>`
              ).join('')}
            </div>
          </div>`).join('')}
        <div style="margin-top:10px;padding:8px 10px;background:var(--bg3);border-radius:6px;font-size:0.65rem;color:var(--text3);">
          💡 Go to nseindia.com → Market Data → Historical Data → Daily Reports → CM UDiFF Bhavcopy (zip)
        </div>
      </div>
    </div>`;
  }

  calEl.innerHTML = `
    <div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:0.72rem;font-weight:700;color:var(--text);">NSE CALENDAR — JAN 2025 ONWARDS</span>
        <span style="font-size:0.78rem;font-weight:700;color:${barCol};">${totalUploaded}/${totalExpected} (${coveragePct}%)</span>
      </div>
      <div style="height:7px;background:var(--border);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${coveragePct}%;background:${barCol};border-radius:4px;transition:width 0.5s;"></div>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px;font-size:0.63rem;color:var(--text2);">
      <span><span class="cal-legend-dot" style="background:var(--accent2);"></span> Uploaded</span>
      <span><span class="cal-legend-dot" style="background:rgba(26,92,255,0.3);"></span> History only</span>
      <span><span class="cal-legend-dot" style="background:var(--danger);"></span> Missing</span>
      <span><span class="cal-legend-dot" style="background:var(--border);"></span> Holiday/Weekend</span>
    </div>
    ${html}
    ${missingHtml}`;
}


function handleDrop(e) {
  e.preventDefault();
  handleFileUpload(e.dataTransfer.files);
}

function handleFileUpload(files) {
  if (!files || files.length === 0) return;
  const total   = files.length;
  let processed = 0;
  let pending   = total;

  const dropZone = document.getElementById('drop-zone');
  function updateProgress() {
    processed++;
    const pct = Math.round(processed / total * 100);
    if (dropZone) dropZone.innerHTML =
      `<div style="font-size:1.2rem;margin-bottom:6px;">⏳</div>` +
      `<div style="font-weight:700;color:var(--accent);margin-bottom:8px;">Processing ${processed}/${total} files...</div>` +
      `<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;width:80%;margin:0 auto;">` +
        `<div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width 0.2s;"></div>` +
      `</div>` +
      `<div style="font-size:0.65rem;color:var(--text3);margin-top:6px;">${pct}% — please wait</div>`;
    pending--;
    if (pending === 0) finishUpload(dropZone, total);
  }

  Array.from(files).forEach(file => {
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = e => {
        parseUDiFFXlsx(e.target.result, file.name);
        if (!uploadedFileNames.includes(file.name)) uploadedFileNames.push(file.name);
        updateProgress();
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = e => {
        parseNSEBhavcopy(e.target.result, file.name);
        if (!uploadedFileNames.includes(file.name)) uploadedFileNames.push(file.name);
        updateProgress();
      };
      reader.readAsText(file);
    }
  });
}

async function finishUpload(dropZone, totalFiles) {
  if (dropZone) dropZone.innerHTML =
    `<div style="font-size:2.5rem;margin-bottom:10px;">📁</div>` +
    `<div style="font-weight:700;color:var(--text);font-size:0.9rem;margin-bottom:4px;">Tap to browse files</div>` +
    `<div style="font-size:0.7rem;color:var(--text3);">Supports new <strong style="color:var(--accent);">.xlsx</strong> UDiFF format &amp; old .csv format</div>`;

  await saveNSEToStorage();

  // Log every uploaded date — batch-safe (skips already-logged dates)
  const allDates = Object.keys(nseDataByDate).filter(k => !k.startsWith('UNKNOWN')).sort();
  let newDays = 0;
  for (const datekey of allDates) {
    const dayData    = nseDataByDate[datekey];
    const stockCount = Object.keys(dayData).length;
    if (!dayLog[datekey]) {
      await logDayUpload(datekey, stockCount, []);
      newDays++;
    }
  }
  // Log upload event once per batch (not once per file)
  if (totalFiles > 0) {
    const lastName = uploadedFileNames[uploadedFileNames.length - 1] || '';
    await logUploadHistory(lastName, allDates[allDates.length - 1] || '', allDates.length);
  }

  renderUploadedFiles(true);
  renderDataCalendar();
  renderStorageBanner();
  document.getElementById('csv-upload').value = '';

  const days = allDates.length;
  const msg  = totalFiles > 1
    ? `${days} trading days loaded (${newDays} new)`
    : `${days} trading days loaded`;
  showNotif('✅ Upload complete', msg);
}

// =====================================================================
//  PARSER A — New NSE UDiFF format (.xlsx)
//  Filename: BhavCopy_NSE_CM_0_0_0_20260201_F_0000.xlsx
//  Columns:  TckrSymb | SctySrs | OpnPric | HghPric | LwPric
//            ClsPric  | PrvsClsgPric | TtlTradgVol | TradDt
// =====================================================================
function parseUDiFFXlsx(arrayBuffer, fileName) {
  try {
    const workbook  = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet     = workbook.Sheets[sheetName];
    const rows      = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });

    if (!rows || rows.length === 0) { showNotif('Empty File', `${fileName} has no data`, true); return; }

    let dateKey = extractDateFromFilename(fileName);

    rows.forEach(row => {
      const sym    = (row['TckrSymb']    || '').trim();
      const series = (row['SctySrs']     || '').trim();
      const open   = parseFloat(row['OpnPric'])      || 0;
      const high   = parseFloat(row['HghPric'])      || 0;
      const low    = parseFloat(row['LwPric'])        || 0;
      const close  = parseFloat(row['ClsPric'])      || 0;
      const prev   = parseFloat(row['PrvsClsgPric']) || 0;
      const vol    = parseFloat(row['TtlTradgVol'])  || 0;
      const rawDt  = row['TradDt'] || row['BizDt']   || '';

      if (!sym || series !== 'EQ' || close <= 0) return;

      if (!dateKey && rawDt) {
        const s = typeof rawDt === 'string' ? rawDt : String(rawDt);
        dateKey = normaliseDateStr(s) || extractDateFromFilename(s);
      }
      if (!dateKey) dateKey = 'UNKNOWN_' + Math.random();

      if (!nseDataByDate[dateKey]) nseDataByDate[dateKey] = {};
      nseDataByDate[dateKey][sym] = { open, high, low, close, prev, vol };
    });

    updateDataQuality();
  } catch(err) {
    console.error('XLSX parse error:', err);
    showNotif('Parse Error', `Could not read ${fileName}`, true);
  }
}

// =====================================================================
//  PARSER B — Old NSE CM Bhavcopy format (.csv)
//  Filename: cm27FEB2026bhav.csv
//  Columns:  SYMBOL | SERIES | OPEN | HIGH | LOW | CLOSE
//            PREVCLOSE | TOTTRDQTY | TIMESTAMP
// =====================================================================
function parseNSEBhavcopy(csvText, fileName) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return;

  const header = lines[0].trim().split(',').map(h => h.trim().replace(/"/g,'').toUpperCase());
  const col = name => header.indexOf(name);

  const iSym  = col('SYMBOL')    >= 0 ? col('SYMBOL')    : col('TCKRSYMB')     >= 0 ? col('TCKRSYMB')     : 0;
  const iSer  = col('SERIES')    >= 0 ? col('SERIES')    : col('SCTYSRS')      >= 0 ? col('SCTYSRS')      : 1;
  const iOpen = col('OPEN')      >= 0 ? col('OPEN')      : col('OPNPRIC')      >= 0 ? col('OPNPRIC')      : 2;
  const iHigh = col('HIGH')      >= 0 ? col('HIGH')      : col('HGHPRIC')      >= 0 ? col('HGHPRIC')      : 3;
  const iLow  = col('LOW')       >= 0 ? col('LOW')       : col('LWPRIC')       >= 0 ? col('LWPRIC')        : 4;
  const iClose= col('CLOSE')     >= 0 ? col('CLOSE')     : col('CLSPRIC')      >= 0 ? col('CLSPRIC')      : 5;
  const iPrev = col('PREVCLOSE') >= 0 ? col('PREVCLOSE') : col('PRVSCLSGPRIC') >= 0 ? col('PRVSCLSGPRIC') : 7;
  const iVol  = col('TOTTRDQTY') >= 0 ? col('TOTTRDQTY') : col('TTLTRADGVOL')  >= 0 ? col('TTLTRADGVOL')  : 8;
  const iDate = col('TIMESTAMP') >= 0 ? col('TIMESTAMP') : col('TRADDT')       >= 0 ? col('TRADDT')       : 10;

  let dateKey = extractDateFromFilename(fileName);

  lines.slice(1).forEach(line => {
    if (!line.trim()) return;
    const parts = line.split(',').map(p => p.trim().replace(/"/g,''));
    if (parts.length < 8) return;

    const sym    = parts[iSym];
    const series = parts[iSer];
    const open   = parseFloat(parts[iOpen])  || 0;
    const high   = parseFloat(parts[iHigh])  || 0;
    const low    = parseFloat(parts[iLow])   || 0;
    const close  = parseFloat(parts[iClose]) || 0;
    const prev   = parseFloat(parts[iPrev])  || 0;
    const vol    = parseFloat(parts[iVol])   || 0;
    const rawDate= parts[iDate];

    if (!sym || series !== 'EQ' || close <= 0) return;

    if (!dateKey && rawDate) dateKey = normaliseDateStr(rawDate);
    if (!dateKey) dateKey = 'UNKNOWN_' + Math.random();

    if (!nseDataByDate[dateKey]) nseDataByDate[dateKey] = {};
    nseDataByDate[dateKey][sym] = { open, high, low, close, prev, vol };
  });

  updateDataQuality();
}

function extractDateFromFilename(name) {
  const monthMap = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
  let m;
  // NEW format: BhavCopy_NSE_CM_0_0_0_20260201_F_0000.xlsx → 20260201
  m = name.match(/(\d{8})/);
  if (m) {
    const raw = m[1];
    // Validate it looks like a real date (year 2020+, month 01-12, day 01-31)
    const y = raw.substring(0,4), mo = raw.substring(4,6), d = raw.substring(6,8);
    if (+y >= 2020 && +mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) return raw; // already YYYYMMDD
  }
  // OLD format: cm01FEB2025bhav.csv
  m = name.match(/cm(\d{2})([A-Z]{3})(\d{4})/i);
  if (m) return `${m[3]}${monthMap[m[2].toUpperCase()] || '00'}${m[1]}`;
  // OLD format: cm01022025bhav.csv (ddmmyyyy)
  m = name.match(/cm(\d{2})(\d{2})(\d{4})/i);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  // DD-MM-YYYY
  m = name.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  return null;
}

function normaliseDateStr(str) {
  // Handles DD-Mon-YYYY, DD/MM/YYYY, YYYY-MM-DD
  const monthMap = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
  let m;
  m = str.match(/(\d{2})-([A-Z]{3})-(\d{4})/i);
  if (m) return `${m[3]}${monthMap[m[2].toUpperCase()] || '00'}${m[1]}`;
  m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  return null;
}

function updateDataQuality() {
  const days = Object.keys(nseDataByDate).filter(k => !k.startsWith('UNKNOWN')).length;
  const bar    = document.getElementById('quality-bar');
  const label  = document.getElementById('quality-label');
  const detail = document.getElementById('quality-detail');
  const pill   = document.getElementById('nse-quality-pill');
  const pct = Math.min(days / 25 * 100, 100);
  bar.style.width = pct + '%';

  let col, txt, det;
  if (days === 0) {
    col='var(--danger)'; txt='No files'; det='Upload files to enable analysis';
  } else if (days < 5) {
    col='var(--danger)'; txt=`${days} day${days>1?'s':''} — Basic`; det='Price & change only. Upload 15+ days for volume & RSI.';
  } else if (days < 15) {
    col='var(--warn)'; txt=`${days} days — Good`; det='Volume ratio enabled. Upload 15+ days for RSI & MA.';
  } else if (days < 25) {
    col='var(--accent2)'; txt=`${days} days — Strong`; det='RSI & MA enabled. Upload 25 days for max accuracy.';
  } else {
    col='var(--accent2)'; txt=`${days} days — Max ✓`; det='Full mode: RSI, volume ratio, consolidation, MA crossover.';
  }

  bar.style.background = col;
  label.style.color = col; label.textContent = txt;
  detail.textContent = det;

  if (pill) {
    pill.textContent = txt;
    pill.style.background = col === 'var(--accent2)' ? 'rgba(0,168,90,0.1)' : col === 'var(--warn)' ? 'rgba(201,128,0,0.1)' : 'rgba(212,42,69,0.1)';
    pill.style.color = col;
    pill.style.borderColor = col === 'var(--accent2)' ? 'rgba(0,168,90,0.25)' : col === 'var(--warn)' ? 'rgba(201,128,0,0.25)' : 'rgba(212,42,69,0.25)';
  }
}

function renderUploadedFiles(notify = true) {
  const wrap = document.getElementById('uploaded-files-list');
  const tags = document.getElementById('file-tags');
  const unique = [...new Set(uploadedFileNames)];
  if (unique.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const days = Object.keys(nseDataByDate).filter(k => !k.startsWith('UNKNOWN')).length;
  tags.innerHTML = unique.slice(-10).map(f =>
    `<span style="background:rgba(26,92,255,0.08);border:1px solid rgba(26,92,255,0.2);padding:3px 8px;border-radius:4px;font-size:0.62rem;color:var(--accent);">${f.replace(/\.csv$/i,'')}</span>`
  ).join('') + (unique.length > 10 ? `<span style="font-size:0.7rem;color:var(--text3);">+${unique.length-10} more</span>` : '');
  if (notify) showNotif('💾 Saved!', `${days} trading days stored locally`);
}

function clearNSEData() {
  nseDataByDate    = {};
  uploadedFileNames = [];
  const tags = document.getElementById('file-tags');
  if (tags) tags.innerHTML = '';
  const filesList = document.getElementById('uploaded-files-list');
  if (filesList) filesList.style.display = 'none';
  const resultsWrap = document.getElementById('nse-results-wrap');
  if (resultsWrap) resultsWrap.style.display = 'none';
  const nseEmpty = document.getElementById('nse-empty');
  if (nseEmpty) nseEmpty.style.display = 'block';
  const csvUpload = document.getElementById('csv-upload');
  if (csvUpload) csvUpload.value = '';
  updateDataQuality();
}
