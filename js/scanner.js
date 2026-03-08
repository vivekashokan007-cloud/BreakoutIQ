// ===================== SCANNER ENGINE =====================
// analyzeNSEData (breakout), analyzeCoilStocks (pre-breakout), renderCombinedResults
// WARNING: Do not edit without understanding the full filter chain.

function analyzeNSEData() {
  const allDates = Object.keys(nseDataByDate).sort();
  const dates    = allDates.filter(k => !k.startsWith('UNKNOWN'));

  if (allDates.length === 0) { showNotif('No Data', 'Please upload files first', true); return; }

  const minP    = +document.getElementById('nse-minprice').value  || 100;
  const maxP    = +document.getElementById('nse-maxprice').value  || 1500;
  const minVol  = +document.getElementById('nse-vol').value       || 1.5;
  const minChg  = +document.getElementById('nse-chg').value       || 1.0;
  const capital = +document.getElementById('nse-capital').value   || 110000;
  const numDays = allDates.length;

  // ---- Consistency gate ----
  // Stock must appear in at least 70% of available days to have reliable history
  const MIN_PRESENCE = numDays >= 10 ? Math.floor(numDays * 0.70) : Math.floor(numDays * 0.50);
  // Minimum score to show up in results (avoids noisy low-signal stocks)
  const MIN_SCORE = 50;
  // Minimum R:R required
  const MIN_RR = 1.5;
  // Minimum SL distance — stops tighter than 3% get triggered by intraday noise
  const MIN_SL_PCT = 0.03;

  const latestDate = allDates[allDates.length - 1];
  const latestData = nseDataByDate[latestDate];
  if (!latestData) { showNotif('Error', 'Could not read latest date data', true); return; }

  // Build per-symbol historical arrays
  const symbolHistory = {};
  allDates.forEach(d => {
    const dayData = nseDataByDate[d];
    Object.entries(dayData).forEach(([sym, data]) => {
      if (!symbolHistory[sym]) symbolHistory[sym] = [];
      symbolHistory[sym].push({ date: d, ...data });
    });
  });

  const results = [];

  Object.entries(latestData).forEach(([sym, today]) => {
    // ---- ASM/GSM filter — skip SEBI-regulated stocks entirely ----
    if (asmSymbols.has(sym)) return;

    // ---- Price range filter ----
    if (today.close < minP || today.close > maxP) return;

    const hist = (symbolHistory[sym] || []).sort((a,b) => a.date.localeCompare(b.date));
    const n = hist.length;

    // ---- Consistency gate: skip stocks with too sparse history ----
    // This prevents newly listed / suspended stocks from polluting results
    if (n < MIN_PRESENCE) return;

    // ---- Price change % ----
    const prevClose = today.prev > 0 ? today.prev : (n >= 2 ? hist[n-2].close : today.close);
    const changePct = prevClose > 0 ? ((today.close - prevClose) / prevClose * 100) : 0;
    if (changePct < minChg) return;

    // ---- Volume ratio (required if we have enough data) ----
    let volRatio = null;
    if (n >= 5) {
      // 20-day rolling avg volume (industry standard — more stable than all-days avg)
      const pastVols = hist.slice(0, -1).slice(-20).map(d => d.vol).filter(v => v > 0);
      const avgVol = pastVols.length > 0 ? pastVols.reduce((s,v)=>s+v,0) / pastVols.length : 0;
      volRatio = avgVol > 0 ? today.vol / avgVol : null;
    }
    // If we have enough data and volume is weak → skip
    if (n >= 5 && volRatio !== null && volRatio < minVol) return;
    // If we don't have 5 days yet → also skip (can't validate volume)
    if (n < 5) return;

    // ---- RSI (14) ----
    let rsi = null;
    if (n >= 15) {
      rsi = calcRSI14(hist.map(d => d.close));
      // RSI 75-80 is the highest win-rate zone per backtest — don't block it
      if (rsi !== null && rsi > 85) return;
      // RSI < 45 = weak momentum — skip
      if (rsi !== null && rsi < 45) return;
    }

    // ---- Moving averages ----
    let ma5 = null, ma20 = null, ma50 = null, ema200 = null, maCross = '—';
    if (n >= 5)  ma5  = hist.slice(-5).reduce((s,d)=>s+d.close,0)  / 5;
    if (n >= 20) {
      ma20    = hist.slice(-20).reduce((s,d)=>s+d.close,0) / 20;
      maCross = (today.close > ma20) ? 'Above MA20 ✓' : 'Below MA20';
    }
    if (n >= 50) {
      ma50 = hist.slice(-50).reduce((s,d)=>s+d.close,0) / 50;
    }
    // EMA200 — needs 200+ days of data; calculated via Wilder's exponential smoothing
    if (n >= 200) {
      const k = 2 / 201;
      let ema = hist.slice(0, 200).reduce((s,d)=>s+d.close,0) / 200;
      for (let i = 200; i < n; i++) ema = hist[i].close * k + ema * (1 - k);
      ema200 = +ema.toFixed(2);
    }
    const aboveEMA200 = ema200 !== null ? today.close > ema200 : null; // null = not enough data

    // ---- Consolidation: 10-day range ----
    let consolidation = '—';
    if (n >= 10) {
      const last10  = hist.slice(-10);
      const highMax = Math.max(...last10.map(d => d.high||d.close));
      const lowMin  = Math.min(...last10.map(d => d.low||d.close));
      const rangePct = lowMin > 0 ? (highMax - lowMin) / lowMin * 100 : 999;
      consolidation = rangePct < 6 ? `Tight ${rangePct.toFixed(1)}% ✓` : `Wide ${rangePct.toFixed(1)}%`;
    }

    // ---- Near day's high ----
    const nearHigh = today.high > 0 && (today.close / today.high) >= 0.97;

    // ---- Dynamic Stop Loss ----
    // Use lowest low of last 3 candles as SL (more realistic than fixed %)
    // Add 0.5% buffer below that low
    let sl;
    if (n >= 3) {
      const last3Lows = hist.slice(-3).map(d => d.low || d.close);
      const recentLow = Math.min(...last3Lows);
      sl = +(recentLow * 0.995).toFixed(2); // 0.5% below the recent 3-day low
      // Safety cap: SL can't be more than 8% below close (position sizing would be tiny)
      // and must be at least 1% below close (otherwise risk is too small to matter)
      const maxSL = today.close * 0.92;
      const minSL = today.close * 0.99;
      if (sl < maxSL) sl = +maxSL.toFixed(2);
      if (sl > minSL) sl = +(today.close * 0.985).toFixed(2); // default 1.5% below
    } else {
      sl = +(today.close * 0.96).toFixed(2); // fallback fixed 4%
    }

    const riskPerShare = today.close - sl;
    if (riskPerShare <= 0) return;
    // SL too tight — intraday noise will stop you out
    if ((today.close - sl) / today.close < MIN_SL_PCT) return; // invalid SL

    // ---- Dynamic Target using minimum 1:1.5 R:R ----
    // Target = close + (risk * minRR) gives exactly 1.5 R:R
    // We use 1.5 as floor — if recent momentum suggests more, use 2.0
    // Target: floor 6%, soft-cap 8% for realistic 1-week hold
    const rrMultiplier = (rsi !== null && rsi >= 60 && maCross.includes('✓')) ? 2.0 : 1.5;
    let target = +(today.close + riskPerShare * rrMultiplier).toFixed(2);
    const minTarget = +(today.close * 1.06).toFixed(2); // 6% floor
    const maxTarget = +(today.close * 1.08).toFixed(2); // 8% soft-cap
    if (target < minTarget) target = minTarget;
    if (target > maxTarget) target = maxTarget;

    // ---- Actual R:R ----
    const rrRaw = ((target - today.close) / riskPerShare).toFixed(1);
    const rr    = +rrRaw;

    // ---- Hard R:R filter ----
    if (rr < MIN_RR) return;

    // ---- Position sizing (2% rule) ----
    const maxRisk = capital * 0.02;
    const shares  = riskPerShare > 0 ? Math.floor(maxRisk / riskPerShare) : 0;
    if (shares < 1) return; // can't even buy 1 share with 2% rule

    // ---- Delivery % (from auxiliary file — optional) ----
    // High delivery = institutional/positional buying (conviction signal)
    // Low delivery = intraday noise (reduces conviction)
    const deliveryPct = deliveryData[sym] !== undefined ? deliveryData[sym] : null;

    // ---- 52-Week High/Low ----
    // Priority 1: Official NSE file (split/bonus-adjusted — most accurate)
    // Priority 2: DIY from up to 252 days of Bhavcopy history (works immediately with existing data)
    let near52WHigh = false, dist52WHigh = null, above52WLow = null, w52HighUsed = null;

    let high52 = null, low52 = null;
    if (w52Data[sym] && w52Data[sym].high52 > 0) {
      // Use official NSE-adjusted value
      high52 = w52Data[sym].high52;
      low52  = w52Data[sym].low52;
    } else if (n >= 50) {
      // DIY fallback: max high across last 252 candles (~1 trading year)
      // Not split-adjusted but good enough for proximity detection
      const lookback = hist.slice(-252);
      high52 = Math.max(...lookback.map(d => d.high || d.close));
      low52  = Math.min(...lookback.map(d => d.low  || d.close));
    }

    if (high52 !== null && high52 > 0) {
      dist52WHigh = +((high52 - today.close) / high52 * 100).toFixed(1);
      near52WHigh = dist52WHigh <= 3;
      above52WLow = low52 > 0 ? today.close > low52 * 1.10 : null;
      w52HighUsed = high52;
    }

    // ---- Breakout Score (rebuilt from backtest data) ----
    let score = 0;
    // Change momentum
    if (changePct >= 1)   score += 15;
    if (changePct >= 2)   score += 10;
    // Volume — backtest shows 1.5-2x is sweet spot, >4x is exhaustion
    if (volRatio !== null && volRatio >= 1.5) score += 25;
    if (volRatio !== null && volRatio >= 2.0 && volRatio <= 4.0) score += 10; // moderate surge bonus
    if (volRatio !== null && volRatio > 4.0)  score -= 10;  // likely exhaustion/news, penalise
    // RSI — backtest confirms 60-80 is the best zone, 75-80 is golden
    if (rsi !== null && rsi >= 60 && rsi <= 80) score += 15;
    if (rsi !== null && rsi >= 75 && rsi <= 85) score += 10; // golden zone extra bonus
    // Price quality
    if (nearHigh)                               score += 10; // closing near day's high
    if (consolidation.includes('✓'))            score += 15; // tight consolidation before move
    // Trend alignment — the more MAs aligned, the stronger the signal
    if (maCross.includes('✓'))                  score += 10; // above MA20
    if (ma50 !== null && today.close > ma50)    score += 8;  // above MA50 = intermediate uptrend
    if (aboveEMA200 === true)                   score += 5;  // above EMA200 = long-term uptrend
    // Delivery % bonus/penalty (only if data loaded)
    if (deliveryPct !== null && deliveryPct >= 50) score += 12; // institutional conviction
    if (deliveryPct !== null && deliveryPct < 20)  score -= 8;  // pure intraday, low conviction
    // 52W high proximity (only if 52W data loaded)
    if (near52WHigh && dist52WHigh !== null && dist52WHigh <= 1) score += 15; // imminent breakout of 52W high
    else if (near52WHigh)                                         score += 10; // within 3% of 52W high
    score = Math.min(score, 98);

    // ---- Minimum score gate ----
    if (score < MIN_SCORE) return;

    // ---- Target % for display ----
    const targetPct = +((target - today.close) / today.close * 100).toFixed(1);
    const slPct     = +((today.close - sl) / today.close * 100).toFixed(1);

    // Est days to target for 1-week trading
    const estDays = (volRatio !== null && volRatio >= 3 && nearHigh) ? '2–3 days'
                  : (volRatio !== null && volRatio >= 1.5)            ? '3–5 days'
                  :                                                     '4–5 days';

    results.push({
      type: 'breakout',
      badge: '🟢 1-WEEK READY',
      badgeColor: 'var(--accent2)',
      estDays,
      sym,
      close:        today.close,
      changePct:    +changePct.toFixed(2),
      volRatio,
      rsi,
      maCross,
      consolidation,
      ma50,
      ema200,
      aboveEMA200,
      deliveryPct,
      near52WHigh,
      dist52WHigh,
      w52High: w52HighUsed,
      w52FromFile: !!(w52Data[sym]),  // true = NSE file, false = DIY from Bhavcopy
      score,
      target,
      targetPct,
      sl,
      slPct,
      shares,
      rr:           rrRaw,
      capital:      shares * today.close,
      numDays:      n
    });
  });

  results.sort((a,b) => b.score - a.score);

  // Update day log with today's top signals
  const topSigs = results.slice(0,5).map(r=>r.sym);
  logDayUpload(latestDate, Object.keys(latestData).length, topSigs)
    .then(() => { if(dayLog[latestDate]) dayLog[latestDate].breakout_count = results.length; });

  return results; // caller merges with coil results
}

// ---- RSI 14 calculation (Wilder's smoothed method) ----
function calcRSI14(closes) {
  if (closes.length < 15) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= 14; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

function renderNSETable(results, latestDate, numDays) {
  const wrap  = document.getElementById('nse-results-wrap');
  const empty = document.getElementById('nse-empty');
  const tbody = document.getElementById('nse-tbody');
  const mobileCards = document.getElementById('nse-mobile-cards');

  empty.style.display = 'none';
  wrap.style.display = 'block';
  document.getElementById('nse-result-count').textContent = `${results.length} signals`;
  document.getElementById('nse-date-range').textContent = `${numDays} days · Latest: ${formatDateKey(latestDate)}`;

  if (results.length === 0) {
    const empty2 = `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No signals found</div><div class="empty-sub">Relax filters — lower min change % or volume ratio</div></div>`;
    tbody.innerHTML = `<tr><td colspan="12">${empty2}</td></tr>`;
    mobileCards.innerHTML = empty2;
    return;
  }

  // Helper colour functions
  const volColor  = s => s.volRatio === null ? 'var(--text3)' : s.volRatio >= 1.5 ? 'var(--accent2)' : 'var(--text2)';
  const volTxt    = s => s.volRatio === null ? `Need ${Math.max(0,5-s.numDays)}+ days` : `${s.volRatio.toFixed(1)}x`;
  const rsiColor  = s => s.rsi === null ? 'var(--text3)' : s.rsi >= 50 && s.rsi <= 75 ? 'var(--accent2)' : s.rsi > 75 ? 'var(--warn)' : 'var(--danger)';
  const rsiTxt    = s => s.rsi === null ? 'Need 15d+' : `${s.rsi}`;
  const scoreCol  = s => s.score >= 70 ? 'var(--accent2)' : s.score >= 45 ? 'var(--warn)' : 'var(--text3)';
  const maCol     = s => s.maCross.includes('✓') ? 'var(--accent2)' : s.maCross === '—' ? 'var(--text3)' : 'var(--danger)';
  const rrCol     = s => +s.rr >= 2 ? 'var(--accent2)' : +s.rr >= 1.5 ? 'var(--warn)' : 'var(--danger)';

  // Desktop table rows
  tbody.innerHTML = results.map(s => `<tr>
    <td><span class="stock-name">${s.sym}</span></td>
    <td style="font-weight:700;">₹${s.close.toLocaleString('en-IN')}</td>
    <td class="${s.changePct>=0?'change-pos':'change-neg'}">${s.changePct>=0?'▲':'▼'}${Math.abs(s.changePct)}%</td>
    <td style="color:${volColor(s)};font-weight:700;">${volTxt(s)}</td>
    <td style="color:${rsiColor(s)};font-weight:700;">${rsiTxt(s)}</td>
    <td style="color:${maCol(s)};font-size:0.72rem;">${s.maCross}</td>
    <td style="font-size:0.72rem;">${s.consolidation}</td>
    <td><div style="display:flex;align-items:center;gap:6px;"><div class="signal-fill" style="width:56px;"><div class="signal-fill-inner" style="width:${s.score}%;background:${scoreCol(s)};"></div></div><span style="font-size:0.72rem;font-weight:700;color:${scoreCol(s)};">${s.score}%</span></div></td>
    <td class="change-pos">₹${s.target.toLocaleString('en-IN')}<div style="font-size:0.6rem;color:var(--text3);">+${s.targetPct||''}%</div></td>
    <td class="change-neg">₹${s.sl.toLocaleString('en-IN')}<div style="font-size:0.6rem;color:var(--text3);">-${s.slPct||''}%</div></td>
    <td style="color:${rrCol(s)};font-weight:700;">1:${s.rr}</td>
    <td><div style="font-weight:700;">${s.shares} <span style="font-size:0.65rem;color:var(--text3);">sh</span></div><div style="font-size:0.65rem;color:var(--text3);">₹${s.capital.toLocaleString('en-IN')}</div></td>
    <td><button class="btn-xs btn-xs-green" onclick='addToWatchlist("${s.sym}")'>+Watch</button></td>
  </tr>`).join('');

  // Mobile cards
  mobileCards.innerHTML = results.map(s => `
    <div class="stock-card">
      <div class="stock-card-header">
        <div>
          <div class="stock-card-name">${s.sym}</div>
          <div class="stock-card-sector">${formatDateKey(latestDate)} · Real Data</div>
        </div>
        <div class="stock-card-price">
          <div class="price-val">₹${s.close.toLocaleString('en-IN')}</div>
          <div style="font-size:0.78rem;font-weight:700;color:${s.changePct>=0?'var(--accent2)':'var(--danger)'};">${s.changePct>=0?'▲':'▼'}${Math.abs(s.changePct)}%</div>
        </div>
      </div>
      <div class="stock-card-grid">
        <div class="stock-card-metric">
          <div class="scm-label">Volume</div>
          <div class="scm-value" style="color:${volColor(s)};">${volTxt(s)}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">RSI (14)</div>
          <div class="scm-value" style="color:${rsiColor(s)};">${rsiTxt(s)}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">R:R</div>
          <div class="scm-value" style="color:${rrCol(s)};">1:${s.rr}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Target</div>
          <div class="scm-value text-green">₹${s.target.toLocaleString('en-IN')} <span style="font-size:0.6rem;">(+${s.targetPct||''}%)</span></div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Stop Loss</div>
          <div class="scm-value text-danger">₹${s.sl.toLocaleString('en-IN')} <span style="font-size:0.6rem;">(-${s.slPct||''}%)</span></div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Shares (2%)</div>
          <div class="scm-value">${s.shares} <span style="font-size:0.6rem;color:var(--text3);">sh</span></div>
        </div>
      </div>
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:0.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;">Breakout Score</span>
          <span style="font-size:0.72rem;font-weight:700;color:${scoreCol(s)};">${s.score}%</span>
        </div>
        <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${s.score}%;background:${scoreCol(s)};border-radius:3px;transition:width 0.4s;"></div>
        </div>
        ${s.maCross!=='—'?`<div style="font-size:0.65rem;margin-top:5px;color:${maCol(s)};">${s.maCross} · ${s.consolidation}</div>`:''}
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn-xs btn-xs-green" style="flex:1;padding:10px;min-height:40px;" onclick='addToWatchlist("${s.sym}")'>+ Add to Watchlist</button>
      </div>
    </div>
  `).join('');

  showNotif('Analysis Complete', `${results.length} real breakout signals found`);
}

// ===================== SCAN MODE =====================
let currentScanMode = 'breakout'; // 'breakout' | 'coil'

function setScanMode(mode, btn) { /* legacy – no-op, unified scan now */ }

function runScan() {
  const allDates = Object.keys(nseDataByDate).sort().filter(k => !k.startsWith('UNKNOWN'));
  if (allDates.length === 0) { showNotif('No Data', 'Upload Bhavcopy files first', true); return; }

  const btn = document.getElementById('analyse-btn');
  btn.textContent = '⏳ Scanning...'; btn.disabled = true;

  // Run both scans, tag results, merge & render
  setTimeout(() => {
    try {
      const breakouts = analyzeNSEData();
      const coils     = analyzeCoilStocks();
      renderCombinedResults(breakouts, coils, allDates);
      // Compute market breadth after scan — updates Market Health panel
      const breadth = computeMarketBreadth();
      if (breadth) {
        marketHealth.adRatio          = breadth.adRatio;
        marketHealth.pctAboveMA20     = breadth.pctAboveMA20;
        marketHealth.pctAboveMA50     = breadth.pctAboveMA50;
        marketHealth.rollingWR        = breadth.rollingWR;
        marketHealth.lastComputedDate = breadth.latestDate;
        renderMarketHealth();
      }
    } finally {
      btn.textContent = '⚡ FULL SCAN'; btn.disabled = false;
    }
  }, 50);
}

// ===================== PRE-BREAKOUT COIL SCANNER =====================
// Looks for stocks SETTING UP for a move — NOT stocks already moving
// Criteria: tight consolidation + volume drying up + RSI building + near resistance
function analyzeCoilStocks() {
  const allDates = Object.keys(nseDataByDate).sort();
  if (allDates.length === 0) { showNotif('No Data', 'Upload Bhavcopy files first', true); return; }

  const minP    = +document.getElementById('nse-minprice').value  || 100;
  const maxP    = +document.getElementById('nse-maxprice').value  || 1500;
  const capital = +document.getElementById('nse-capital').value   || 110000;
  const numDays = allDates.length;
  const MIN_PRESENCE = numDays >= 10 ? Math.floor(numDays * 0.70) : Math.floor(numDays * 0.50);

  const latestDate = allDates[allDates.length - 1];
  const latestData = nseDataByDate[latestDate];
  if (!latestData) return;

  // Build history
  const symbolHistory = {};
  allDates.forEach(d => {
    Object.entries(nseDataByDate[d]).forEach(([sym, data]) => {
      if (!symbolHistory[sym]) symbolHistory[sym] = [];
      symbolHistory[sym].push({ date: d, ...data });
    });
  });

  const results = [];

  Object.entries(latestData).forEach(([sym, today]) => {
    if (asmSymbols.has(sym)) return; // skip SEBI-regulated stocks
    if (today.close < minP || today.close > maxP) return;

    const hist = (symbolHistory[sym] || []).sort((a,b) => a.date.localeCompare(b.date));
    const n = hist.length;
    if (n < MIN_PRESENCE || n < 10) return;

    // ---- 1. Consolidation tightness (last 5, 10, 15 days) ----
    const last5  = hist.slice(-5);
    const last10 = hist.slice(-10);
    const last15 = n >= 15 ? hist.slice(-15) : null;

    const range5  = calcRange(last5);
    const range10 = calcRange(last10);
    const range15 = last15 ? calcRange(last15) : null;

    // Must be tight in recent 5 days (coiling = getting tighter)
    if (range5 > 8) return; // too wide to be a coil

    // ---- 2. Volume contraction — volume drying up = coiling ----
    // Recent 5-day avg vol should be LESS than prior 10-day avg vol
    const vol5avg  = last5.reduce((s,d)=>s+(d.vol||0),0) / 5;
    const vol10avg = last10.reduce((s,d)=>s+(d.vol||0),0) / 10;
    const volContraction = vol10avg > 0 ? vol5avg / vol10avg : 1;
    // Volume should be contracting (< 0.85 of average) for true coil
    if (volContraction > 1.2) return; // volume expanding = not a coil

    // ---- 3. RSI building (40-65 sweet spot for pre-breakout) ----
    let rsi = null;
    if (n >= 15) {
      rsi = calcRSI14(hist.map(d => d.close));
      if (rsi !== null && (rsi < 35 || rsi > 70)) return; // too weak or already extended
    }

    // ---- 4. Price above MA20 (uptrend context) ----
    let ma20 = null, aboveMA20 = false;
    if (n >= 20) {
      ma20 = hist.slice(-20).reduce((s,d)=>s+d.close,0) / 20;
      aboveMA20 = today.close > ma20;
    }

    // ---- 5. Price near recent high (resistance = breakout level) ----
    const high10 = Math.max(...last10.map(d => d.high || d.close));
    const distFromHigh = (high10 - today.close) / high10 * 100;
    // Within 5% of 10-day high = near resistance
    const nearResistance = distFromHigh <= 5;

    // ---- 6. Recent range getting TIGHTER (coiling pattern) ----
    const rangeTightening = range15 !== null ? range5 < range15 : range5 < range10;

    // ---- Coil Score ----
    let score = 0;
    if (range5 <= 4)           score += 25; // very tight — strong signal
    else if (range5 <= 6)      score += 15;
    if (volContraction <= 0.7) score += 25; // significant vol dry-up
    else if (volContraction <= 0.85) score += 15;
    if (nearResistance)        score += 20; // near breakout level
    if (rangeTightening)       score += 15; // getting tighter over time
    if (rsi !== null && rsi >= 45 && rsi <= 65) score += 10; // RSI building nicely
    if (aboveMA20)             score += 10; // above MA20 = uptrend intact
    score = Math.min(score, 98);

    if (score < 40) return; // minimum coil quality

    // ---- Breakout target (wider for weekly — 8-12% based on consolidation) ----
    // The tighter the coil, the bigger the expected move
    const expectedMovePct = range5 <= 3 ? 0.08 : range5 <= 5 ? 0.07 : 0.06; // 6-8% for 1-week hold
    const breakoutLevel   = +(high10 * 1.005).toFixed(2); // 0.5% above 10-day high
    const target          = +(breakoutLevel * (1 + expectedMovePct)).toFixed(2);

    // SL = below recent 5-day low with small buffer
    const low5 = Math.min(...last5.map(d => d.low || d.close));
    let sl = +(low5 * 0.995).toFixed(2);
    if (sl < today.close * 0.90) sl = +(today.close * 0.90).toFixed(2);

    const risk = breakoutLevel - sl;
    if (risk <= 0) return;
    const rr = +((target - breakoutLevel) / risk).toFixed(1);
    if (rr < 1.5) return;

    const maxRisk = capital * 0.02;
    const shares  = Math.floor(maxRisk / risk);
    if (shares < 1) return;

    const targetPct   = +((target - breakoutLevel) / breakoutLevel * 100).toFixed(1);
    const slPct       = +((breakoutLevel - sl) / breakoutLevel * 100).toFixed(1);

    const estDays = nearResistance && distFromHigh <= 2 ? '4–5 days' : '5–7 days';

    results.push({
      type: 'coil',
      badge: '🟡 SETUP IN PROGRESS',
      badgeColor: 'var(--warn)',
      estDays,
      sym, close: today.close,
      range5: +range5.toFixed(1),
      volContraction: +volContraction.toFixed(2),
      rsi, aboveMA20, nearResistance, rangeTightening,
      score, breakoutLevel, target, targetPct,
      sl, slPct, rr, shares,
      capital: shares * breakoutLevel,
      expectedMovePct: +(expectedMovePct * 100).toFixed(0),
      distFromHigh: +distFromHigh.toFixed(1)
    });
  });

  results.sort((a,b) => b.score - a.score);
  return results; // caller merges with breakout results
}

function calcRange(candles) {
  if (!candles || candles.length === 0) return 999;
  const hi = Math.max(...candles.map(d => d.high || d.close));
  const lo = Math.min(...candles.map(d => d.low  || d.close));
  return lo > 0 ? (hi - lo) / lo * 100 : 999;
}

function renderCoilTable(results, latestDate, numDays) {
  const wrap  = document.getElementById('nse-results-wrap');
  const tbody = document.getElementById('nse-tbody');
  const mobileCards = document.getElementById('nse-mobile-cards');
  const countEl = document.getElementById('nse-result-count');
  const dateEl  = document.getElementById('nse-date-range');

  wrap.style.display = 'block';
  countEl.textContent = results.length + ' setups';
  dateEl.textContent  = `${numDays} days data • Latest: ${latestDate.slice(0,4)}-${latestDate.slice(4,6)}-${latestDate.slice(6,8)}`;

  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:30px;color:var(--text3);">No coiling setups found — try with more data or different filters</td></tr>';
    mobileCards.innerHTML = '<div class="empty-state"><div class="empty-icon">🌀</div><div class="empty-title">No coiling setups found</div><div class="empty-sub">Upload more days or loosen filters</div></div>';
    document.getElementById('nse-empty').style.display = 'none';
    return;
  }

  document.getElementById('nse-empty').style.display = 'none';

  // Mobile cards
  mobileCards.innerHTML = results.map(s => {
    const scoreCol = s.score >= 75 ? 'var(--accent2)' : s.score >= 55 ? 'var(--warn)' : 'var(--accent)';
    const maStr = s.aboveMA20 ? '✓ Above' : (s.aboveMA20 === false ? '✗ Below' : '—');
    return `
    <div class="stock-card">
      <div class="stock-card-header">
        <div>
          <div class="stock-card-name">${s.sym}</div>
          <div class="stock-card-sector">🌀 Coil • Range ${s.range5}% • ${s.distFromHigh}% from high</div>
        </div>
        <div style="text-align:right;">
          <div class="stock-card-price">₹${s.close.toLocaleString('en-IN')}</div>
          <div style="font-size:0.65rem;color:var(--text3);">Entry @₹${s.breakoutLevel}</div>
        </div>
      </div>
      <div class="stock-card-metrics">
        <div class="stock-card-metric">
          <div class="scm-label">Vol Contraction</div>
          <div class="scm-value" style="color:${s.volContraction<=0.7?'var(--accent2)':'var(--warn)'};">${(s.volContraction*100).toFixed(0)}% of avg</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">RSI</div>
          <div class="scm-value">${s.rsi !== null ? s.rsi : '—'}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">MA20</div>
          <div class="scm-value" style="color:${s.aboveMA20?'var(--accent2)':'var(--danger)'};">${maStr}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Target (+${s.expectedMovePct}%)</div>
          <div class="scm-value text-green">₹${s.target.toLocaleString('en-IN')}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Stop Loss (-${s.slPct}%)</div>
          <div class="scm-value text-danger">₹${s.sl.toLocaleString('en-IN')}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">R:R / Shares</div>
          <div class="scm-value">1:${s.rr} / ${s.shares}</div>
        </div>
      </div>
      <div style="margin:8px 0 4px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:0.62rem;color:var(--text3);">Coil Score</span>
          <span style="font-size:0.72rem;font-weight:700;color:${scoreCol};">${s.score}%</span>
        </div>
        <div class="signal-fill" style="width:100%;"><div class="signal-fill-inner" style="width:${s.score}%;background:${scoreCol};"></div></div>
      </div>
      <div class="stock-card-footer">
        <button class="btn-xs btn-xs-green" onclick='addToWatchlist("${s.sym}")'>+Watch</button>
        <button class="btn-xs" style="background:rgba(124,58,237,0.08);color:#7c3aed;border:1px solid rgba(124,58,237,0.2);" onclick='prefillWeeklyCandidate(${JSON.stringify({sym:s.sym,close:s.close,entry:s.breakoutLevel,sl:s.sl,target:s.target})})'>📅 Weekly Plan</button>
      </div>
    </div>`;
  }).join('');

  // Desktop table
  tbody.innerHTML = results.map(s => {
    const maStr = s.aboveMA20 ? '✓ Above MA20' : '✗ Below MA20';
    const maCol = s.aboveMA20 ? 'var(--accent2)' : 'var(--danger)';
    const scoreCol = s.score >= 75 ? 'var(--accent2)' : s.score >= 55 ? 'var(--warn)' : 'var(--accent)';
    return `<tr>
      <td><span class="stock-name">${s.sym}</span></td>
      <td style="font-weight:700;">₹${s.close.toLocaleString('en-IN')}</td>
      <td style="color:var(--accent2);font-weight:700;">${s.range5}%</td>
      <td style="color:${s.volContraction<=0.7?'var(--accent2)':'var(--warn)'};">${(s.volContraction*100).toFixed(0)}% of avg</td>
      <td style="color:${s.rsi&&s.rsi>=45?'var(--accent2)':'var(--warn)'};">${s.rsi||'—'}</td>
      <td style="color:${maCol};font-size:0.72rem;">${maStr}</td>
      <td class="change-pos">₹${s.breakoutLevel.toLocaleString('en-IN')}</td>
      <td><div style="display:flex;align-items:center;gap:6px;"><div class="signal-fill" style="width:56px;"><div class="signal-fill-inner" style="width:${s.score}%;background:${scoreCol};"></div></div><span style="font-size:0.72rem;font-weight:700;color:${scoreCol};">${s.score}%</span></div></td>
      <td class="change-pos">₹${s.target.toLocaleString('en-IN')}<div style="font-size:0.6rem;color:var(--text3);">+${s.targetPct}%</div></td>
      <td class="change-neg">₹${s.sl.toLocaleString('en-IN')}<div style="font-size:0.6rem;color:var(--text3);">-${s.slPct}%</div></td>
      <td style="color:var(--accent2);font-weight:700;">1:${s.rr}</td>
      <td><div style="font-weight:700;">${s.shares} <span style="font-size:0.65rem;color:var(--text3);">sh</span></div><div style="font-size:0.65rem;color:var(--text3);">₹${s.capital.toLocaleString('en-IN')}</div></td>
      <td style="display:flex;gap:4px;flex-wrap:wrap;">
        <button class="btn-xs btn-xs-green" onclick='addToWatchlist("${s.sym}")'>+Watch</button>
        <button class="btn-xs" style="background:rgba(124,58,237,0.08);color:#7c3aed;border:1px solid rgba(124,58,237,0.2);" onclick='prefillWeeklyCandidate(${JSON.stringify({sym:s.sym,close:s.close,entry:s.breakoutLevel,sl:s.sl,target:s.target})})'>📅 Plan</button>
      </td>
    </tr>`;
  }).join('');

  // Update desktop table header for coil mode
  const thead = document.querySelector('#page-nse .desktop-table thead tr');
  if (thead) thead.innerHTML = '<th>Symbol</th><th>Close</th><th>5D Range</th><th>Vol Dry-up</th><th>RSI</th><th>MA20</th><th>Entry @</th><th>Score</th><th>Target</th><th>SL</th><th>R:R</th><th>Shares</th><th>Action</th>';
}

// ===================== COMBINED RESULTS RENDERER =====================
function renderCombinedResults(breakouts, coils, allDates) {
  const latestDate = allDates[allDates.length - 1];
  const numDays    = allDates.length;
  const wrap       = document.getElementById('nse-results-wrap');
  const tbody      = document.getElementById('nse-tbody');
  const mobileCards = document.getElementById('nse-mobile-cards');
  const countEl    = document.getElementById('nse-result-count');
  const dateEl     = document.getElementById('nse-date-range');
  const titleEl    = document.getElementById('nse-results-title');
  const emptyEl    = document.getElementById('nse-empty');

  const total = breakouts.length + coils.length;
  wrap.style.display = 'block';
  emptyEl.style.display = 'none';
  if (titleEl) titleEl.textContent = '⚡🌀 FULL SCAN RESULTS';
  countEl.textContent = total + ' setups (' + breakouts.length + ' breakout, ' + coils.length + ' coil)';
  dateEl.textContent  = numDays + ' days data • Latest: ' +
    latestDate.slice(0,4) + '-' + latestDate.slice(4,6) + '-' + latestDate.slice(6,8);

  // ── Tag top 5 breakouts as HIGH CONVICTION ──────────────────
  // Based on backtest: top-ranked by score after new weights are applied
  breakouts.forEach((s, i) => {
    s.isHighConviction = i < 5;
  });

  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:30px;color:var(--text3);">No setups found — upload more data or adjust filters</td></tr>';
    mobileCards.innerHTML = '<div class="empty-state"><div class="empty-icon">📡</div><div class="empty-title">No setups found</div><div class="empty-sub">Upload more days or loosen filters</div></div>';
    return;
  }

  // ── Mobile cards ─────────────────────────────────────────────
  function makeCard(s) {
    const scoreCol   = s.score >= 75 ? 'var(--accent2)' : s.score >= 55 ? 'var(--warn)' : 'var(--accent)';
    const isBreakout = s.type === 'breakout';
    const entryPrice = isBreakout ? s.close : s.breakoutLevel;
    const changeStr  = isBreakout
      ? `<span style="color:${s.changePct>=2?'var(--accent2)':'var(--warn)'}">▲${s.changePct}%</span>`
      : `<span style="color:var(--warn)">Range ${s.range5}%</span>`;
    const volStr = isBreakout
      ? (s.volRatio ? s.volRatio.toFixed(1) + '× vol' : '—')
      : ((s.volContraction*100).toFixed(0) + '% vol');
    const maStr = (isBreakout ? s.maCross : (s.aboveMA20 ? 'Above MA20 ✓' : 'Below MA20'))
      .replace(' ✓','').replace('✓','').trim();
    const maCol = (isBreakout ? s.maCross.includes('✓') : s.aboveMA20) ? 'var(--accent2)' : 'var(--danger)';
    const planBtn = isBreakout
      ? `<button class="btn-xs" style="background:rgba(26,92,255,0.08);color:var(--accent);border:1px solid rgba(26,92,255,0.2);" onclick='prefillWeeklyCandidate(${JSON.stringify({sym:s.sym,close:s.close,entry:s.close,sl:s.sl,target:s.target})})'>📅 Plan</button>`
      : `<button class="btn-xs" style="background:rgba(124,58,237,0.08);color:#7c3aed;border:1px solid rgba(124,58,237,0.2);" onclick='prefillWeeklyCandidate(${JSON.stringify({sym:s.sym,close:s.close,entry:s.breakoutLevel,sl:s.sl,target:s.target})})'>📅 Plan</button>`;

    // HIGH CONVICTION badge (top 5 breakouts only)
    const hcBadge = s.isHighConviction
      ? `<span style="font-size:0.55rem;font-weight:800;background:rgba(255,180,0,0.15);color:#f59e0b;border:1px solid rgba(255,180,0,0.3);border-radius:4px;padding:1px 5px;letter-spacing:0.5px;">⭐ HIGH CONVICTION</span>`
      : '';

    // EMA200 warning (soft — informational only, never blocks signal)
    const ema200Warn = (isBreakout && s.aboveEMA200 === false)
      ? `<div style="font-size:0.62rem;color:var(--warn);margin-top:4px;">⚠️ Below EMA200 — recovery trade, higher risk</div>`
      : (isBreakout && s.aboveEMA200 === true)
      ? `<div style="font-size:0.62rem;color:var(--accent2);margin-top:4px;">✓ Above EMA200 — long-term uptrend aligned</div>`
      : '';

    // 52W high proximity badge (auto-computed from Bhavcopy if NSE file not uploaded)
    const w52Src = s.w52FromFile ? '' : ' <span style="opacity:0.6;font-size:0.55rem;">(est)</span>';
    const w52Badge = (isBreakout && s.w52High !== null)
      ? (s.dist52WHigh <= 1
          ? `<div style="font-size:0.62rem;color:#a78bfa;font-weight:700;margin-top:4px;">🚀 ${s.dist52WHigh}% from 52W High ₹${s.w52High}${w52Src} — IMMINENT BREAKOUT</div>`
          : s.near52WHigh
          ? `<div style="font-size:0.62rem;color:var(--accent2);margin-top:4px;">📈 ${s.dist52WHigh}% from 52W High ₹${s.w52High}${w52Src}</div>`
          : `<div style="font-size:0.62rem;color:var(--text3);margin-top:4px;">52W High: ₹${s.w52High}${w52Src} (${s.dist52WHigh}% away)</div>`)
      : '';

    return `
    <div class="stock-card" style="border-left:3px solid ${s.badgeColor};${s.isHighConviction?'box-shadow:0 0 0 1px rgba(255,180,0,0.25);':''}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:0.6rem;font-weight:700;color:${s.badgeColor};letter-spacing:0.5px;">${s.badge}</span>
        <div style="display:flex;gap:4px;align-items:center;">${hcBadge}<span style="font-size:0.6rem;color:var(--text3);">⏱ Est. ${s.estDays}</span></div>
      </div>
      <div class="stock-card-header">
        <div>
          <div class="stock-card-name">${s.sym}</div>
          <div class="stock-card-sector">${changeStr} • ${volStr}</div>
        </div>
        <div style="text-align:right;">
          <div class="stock-card-price">₹${s.close.toLocaleString('en-IN')}</div>
          ${!isBreakout ? `<div style="font-size:0.65rem;color:var(--text3);">Entry @₹${entryPrice}</div>` : ''}
        </div>
      </div>
      <div class="stock-card-metrics">
        <div class="stock-card-metric">
          <div class="scm-label">RSI</div>
          <div class="scm-value">${s.rsi !== null ? s.rsi : '—'}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">MA20</div>
          <div class="scm-value" style="color:${maCol};">${maStr}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Target (+${s.targetPct}%)</div>
          <div class="scm-value text-green">₹${s.target.toLocaleString('en-IN')}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">SL (-${s.slPct}%)</div>
          <div class="scm-value text-danger">₹${s.sl.toLocaleString('en-IN')}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">R:R</div>
          <div class="scm-value">1:${s.rr}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Shares</div>
          <div class="scm-value">${s.shares}</div>
        </div>
        ${isBreakout && s.deliveryPct !== null ? `
        <div class="stock-card-metric">
          <div class="scm-label">Delivery</div>
          <div class="scm-value" style="color:${s.deliveryPct>=50?'var(--accent2)':s.deliveryPct>=30?'var(--text2)':'var(--warn)'};">${s.deliveryPct}%</div>
        </div>` : ''}
      </div>
      ${ema200Warn}
      ${w52Badge}
      <div style="margin:8px 0 4px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:0.62rem;color:var(--text3);">Score</span>
          <span style="font-size:0.72rem;font-weight:700;color:${scoreCol};">${s.score}%</span>
        </div>
        <div class="signal-fill" style="width:100%;"><div class="signal-fill-inner" style="width:${s.score}%;background:${scoreCol};"></div></div>
      </div>
      <div class="stock-card-footer">
        <button class="btn-xs btn-xs-green" onclick='addToWatchlist("${s.sym}")'>+Watch</button>
        ${planBtn}
      </div>
    </div>`;
  }

  let cardsHtml = '';
  if (breakouts.length > 0) {
    const hcBreakouts  = breakouts.filter(s => s.isHighConviction);
    const restBreakouts = breakouts.filter(s => !s.isHighConviction);
    cardsHtml += `<div style="font-size:0.65rem;font-weight:700;color:var(--accent2);letter-spacing:2px;text-transform:uppercase;padding:8px 4px 6px;">🟢 BREAKOUT — Already Moving (${breakouts.length})</div>`;
    if (hcBreakouts.length > 0) {
      cardsHtml += `<div style="font-size:0.6rem;font-weight:700;color:#f59e0b;letter-spacing:1.5px;text-transform:uppercase;padding:4px 4px 4px;margin-bottom:2px;">⭐ HIGH CONVICTION — Top ${hcBreakouts.length}</div>`;
      cardsHtml += hcBreakouts.map(makeCard).join('');
    }
    if (restBreakouts.length > 0) {
      cardsHtml += `<div style="font-size:0.6rem;font-weight:700;color:var(--text3);letter-spacing:1.5px;text-transform:uppercase;padding:10px 4px 4px;border-top:1px solid var(--border);margin-top:8px;">OTHER BREAKOUTS (${restBreakouts.length})</div>`;
      cardsHtml += restBreakouts.map(makeCard).join('');
    }
  }
  if (coils.length > 0) {
    cardsHtml += `<div style="font-size:0.65rem;font-weight:700;color:var(--warn);letter-spacing:2px;text-transform:uppercase;padding:14px 4px 6px;border-top:1px solid var(--border);margin-top:10px;">🟡 COIL — Setting Up (${coils.length})</div>`;
    cardsHtml += coils.map(makeCard).join('');
  }
  mobileCards.innerHTML = cardsHtml;

  // ── Desktop table ─────────────────────────────────────────────
  const thead = document.querySelector('#page-nse .desktop-table thead tr');
  if (thead) thead.innerHTML = '<th>Symbol</th><th>Type</th><th>Close</th><th>Change/Range</th><th>Volume</th><th>RSI</th><th>MA20</th><th>Score</th><th>Target</th><th>SL</th><th>R:R</th><th>Est.Days</th><th>Action</th>';

  function makeRow(s, divider) {
    const scoreCol   = s.score >= 75 ? 'var(--accent2)' : s.score >= 55 ? 'var(--warn)' : 'var(--accent)';
    const isBreakout = s.type === 'breakout';
    const changeCell = isBreakout
      ? `<span style="color:${s.changePct>=2?'var(--accent2)':'var(--warn)'};">+${s.changePct}%</span>`
      : `<span style="color:var(--warn);">${s.range5}% rng</span>`;
    const volCell = isBreakout
      ? (s.volRatio ? `<span style="color:${s.volRatio>=3?'var(--accent2)':'var(--warn)'};">${s.volRatio.toFixed(1)}×</span>` : '—')
      : `<span style="color:${s.volContraction<=0.7?'var(--accent2)':'var(--warn)'};">${(s.volContraction*100).toFixed(0)}%</span>`;
    const maCol = (isBreakout ? s.maCross.includes('✓') : s.aboveMA20) ? 'var(--accent2)' : 'var(--danger)';
    const maStr = isBreakout ? s.maCross : (s.aboveMA20 ? '✓ Above' : '✗ Below');
    const entryPrice = isBreakout ? s.close : s.breakoutLevel;
    const planData   = isBreakout
      ? JSON.stringify({sym:s.sym,close:s.close,entry:s.close,sl:s.sl,target:s.target})
      : JSON.stringify({sym:s.sym,close:s.close,entry:s.breakoutLevel,sl:s.sl,target:s.target});
    const divRow = divider ? '<tr><td colspan="13" style="background:var(--bg3);padding:6px 12px;font-size:0.62rem;font-weight:700;color:var(--warn);letter-spacing:2px;text-transform:uppercase;">🟡 COIL SETUPS — Setting Up</td></tr>' : '';
    const hcCell = s.isHighConviction ? '<span style="font-size:0.55rem;font-weight:800;background:rgba(255,180,0,0.15);color:#f59e0b;border:1px solid rgba(255,180,0,0.3);border-radius:4px;padding:1px 4px;">⭐ HC</span> ' : '';
    const ema200Cell = (s.aboveEMA200 === true) ? '<span style="font-size:0.6rem;color:var(--accent2);">✓ EMA200</span>'
      : (s.aboveEMA200 === false) ? '<span style="font-size:0.6rem;color:var(--warn);">⚠ EMA200</span>'
      : '<span style="font-size:0.6rem;color:var(--text3);">—</span>';
    const w52Cell = s.w52High !== null
      ? (s.dist52WHigh <= 1 ? `<span style="font-size:0.6rem;color:#a78bfa;font-weight:700;">🚀 ${s.dist52WHigh}% to 52W${s.w52FromFile?'':' (est)'}</span>`
        : s.near52WHigh     ? `<span style="font-size:0.6rem;color:var(--accent2);">📈 ${s.dist52WHigh}% to 52W${s.w52FromFile?'':' (est)'}</span>`
        :                     `<span style="font-size:0.6rem;color:var(--text3);">52W: ${s.dist52WHigh}%${s.w52FromFile?'':' (est)'}</span>`)
      : '';
    return divRow + `<tr style="border-left:3px solid ${s.badgeColor};">
      <td><span class="stock-name">${hcCell}${s.sym}</span></td>
      <td><span style="font-size:0.62rem;font-weight:700;color:${s.badgeColor};">${s.type==='breakout'?'⚡ BRK':'🌀 COIL'}</span></td>
      <td style="font-weight:700;">₹${s.close.toLocaleString('en-IN')}</td>
      <td>${changeCell}</td>
      <td>${volCell}</td>
      <td style="color:${s.rsi&&s.rsi>=60?'var(--accent2)':s.rsi&&s.rsi>=45?'var(--warn)':'var(--danger)'};">${s.rsi||'—'}</td>
      <td style="color:${maCol};font-size:0.72rem;">${maStr}<br>${ema200Cell}${s.deliveryPct !== null ? `<br><span style="color:${s.deliveryPct>=50?'var(--accent2)':s.deliveryPct>=30?'var(--text2)':'var(--warn)'};">📦 ${s.deliveryPct}% del</span>` : ''}${w52Cell ? `<br>${w52Cell}` : ''}</td>
      <td><div style="display:flex;align-items:center;gap:6px;"><div class="signal-fill" style="width:46px;"><div class="signal-fill-inner" style="width:${s.score}%;background:${scoreCol};"></div></div><span style="font-size:0.7rem;font-weight:700;color:${scoreCol};">${s.score}%</span></div></td>
      <td class="change-pos">₹${s.target.toLocaleString('en-IN')}<div style="font-size:0.6rem;color:var(--text3);">+${s.targetPct}%</div></td>
      <td class="change-neg">₹${s.sl.toLocaleString('en-IN')}<div style="font-size:0.6rem;color:var(--text3);">-${s.slPct}%</div></td>
      <td style="color:var(--accent2);font-weight:700;">1:${s.rr}</td>
      <td style="font-size:0.7rem;color:var(--text2);">${s.estDays}</td>
      <td style="display:flex;gap:4px;flex-wrap:wrap;">
        <button class="btn-xs btn-xs-green" onclick='addToWatchlist("${s.sym}")'>+Watch</button>
        <button class="btn-xs" style="background:rgba(26,92,255,0.08);color:var(--accent);border:1px solid rgba(26,92,255,0.2);" onclick='prefillWeeklyCandidate(${planData})'>📅 Plan</button>
      </td>
    </tr>`;
  }

  let rowsHtml = '';
  if (breakouts.length > 0) {
    rowsHtml += '<tr><td colspan="13" style="background:rgba(0,168,90,0.05);padding:6px 12px;font-size:0.62rem;font-weight:700;color:var(--accent2);letter-spacing:2px;text-transform:uppercase;">🟢 BREAKOUT — Already Moving</td></tr>';
    rowsHtml += breakouts.map((s,i) => makeRow(s, false)).join('');
  }
  if (coils.length > 0) {
    rowsHtml += coils.map((s,i) => makeRow(s, i===0)).join('');
  }
  tbody.innerHTML = rowsHtml;

  // Update Scanner tab stat card
  const sigEl = document.getElementById('stat-signals');
  if (sigEl) sigEl.textContent = total;

  showNotif('⚡ Scan Complete', `${breakouts.length} breakout · ${coils.length} coil setups found`);
}
// =====================================================================
//  MARKET BREADTH — Auto-computed on every scan (Phase 3)
//  Derives 4 breadth metrics from current nseDataByDate:
//    adRatio      — today's advance/decline ratio
//    pctAboveMA20 — % of EQ stocks above their 20-day MA
//    pctAboveMA50 — % of EQ stocks above their 50-day MA
//    rollingWR    — % of last 20 days where more stocks advanced than declined
// =====================================================================
function computeMarketBreadth() {
  const allDates = Object.keys(nseDataByDate).sort().filter(k => !k.startsWith('UNKNOWN'));
  if (allDates.length < 2) return null;

  const latestDate = allDates[allDates.length - 1];
  const latestData = nseDataByDate[latestDate];
  if (!latestData) return null;

  // Build symbol history once (shared with scan — same pattern)
  const symbolHistory = {};
  allDates.forEach(d => {
    Object.entries(nseDataByDate[d]).forEach(([sym, data]) => {
      if (!symbolHistory[sym]) symbolHistory[sym] = [];
      symbolHistory[sym].push({ date: d, close: data.close, prev: data.prev });
    });
  });

  let advances = 0, declines = 0;
  let aboveMA20count = 0, ma20total = 0;
  let aboveMA50count = 0, ma50total = 0;

  Object.entries(latestData).forEach(([sym, today]) => {
    if (!today.close || today.close <= 0) return;

    // A/D — count as advance if close > prev by more than 0.25% (filters noise)
    const prevClose = today.prev > 0 ? today.prev : today.close;
    const chgPct = prevClose > 0 ? (today.close - prevClose) / prevClose * 100 : 0;
    if (chgPct >  0.25) advances++;
    else if (chgPct < -0.25) declines++;

    // MA breadth — requires history
    const hist = (symbolHistory[sym] || []).sort((a, b) => a.date.localeCompare(b.date));
    const n = hist.length;
    if (n >= 20) {
      const ma20 = hist.slice(-20).reduce((s, d) => s + d.close, 0) / 20;
      aboveMA20count += today.close > ma20 ? 1 : 0;
      ma20total++;
    }
    if (n >= 50) {
      const ma50 = hist.slice(-50).reduce((s, d) => s + d.close, 0) / 50;
      aboveMA50count += today.close > ma50 ? 1 : 0;
      ma50total++;
    }
  });

  const adRatio = declines > 0 ? +(advances / declines).toFixed(2) : (advances > 0 ? 9.99 : 1.00);

  const pctAboveMA20 = ma20total > 0 ? Math.round(aboveMA20count / ma20total * 100) : null;
  const pctAboveMA50 = ma50total > 0 ? Math.round(aboveMA50count / ma50total * 100) : null;

  // Rolling 20-day market quality: % of last 20 sessions where A/D > 1
  // We re-compute A/D for each of the last 20 days (fast — just prev/close fields)
  const last20dates = allDates.slice(-21, -1); // excludes today
  let bullishDays = 0;
  last20dates.forEach(d => {
    const dayData = nseDataByDate[d];
    if (!dayData) return;
    let adv = 0, dec = 0;
    Object.values(dayData).forEach(s => {
      if (!s.close || !s.prev || s.prev <= 0) return;
      const c = (s.close - s.prev) / s.prev * 100;
      if (c >  0.25) adv++;
      else if (c < -0.25) dec++;
    });
    if (dec > 0 && adv / dec > 1) bullishDays++;
    else if (dec === 0 && adv > 0) bullishDays++;
  });
  const rollingWR = last20dates.length > 0 ? Math.round(bullishDays / last20dates.length * 100) : null;

  return { adRatio, pctAboveMA20, pctAboveMA50, rollingWR, latestDate };
}
