// ===================== UI — SCANNER TAB, WATCHLIST, RISK, CHECKLIST, JOURNAL, NAV =====================

// ===================== SCANNER TAB =====================
// Real scan is handled by runScan() in scanner.js
// This tab now shows results from analyzeNSEData() + analyzeCoilStocks()

// ===================== WATCHLIST =====================
function addToWatchlist(sym) {
  if (!watchlist.includes(sym)) {
    watchlist.push(sym);
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
    renderWatchlist();
    document.getElementById('stat-watch').textContent = watchlist.length;
    showNotif('Added to Watchlist', `${sym} is now being tracked`);
  }
}
function removeFromWatchlist(sym) {
  watchlist = watchlist.filter(s => s !== sym);
  localStorage.setItem('watchlist', JSON.stringify(watchlist));
  renderWatchlist();
  document.getElementById('stat-watch').textContent = watchlist.length;
}
function clearWatchlist() {
  watchlist = [];
  localStorage.setItem('watchlist', JSON.stringify(watchlist));
  renderWatchlist();
  document.getElementById('stat-watch').textContent = 0;
}
function renderWatchlist() {
  const el = document.getElementById('watchlist-tags');
  if (watchlist.length === 0) {
    el.innerHTML = '<span style="font-size:0.75rem;color:var(--text3);">No stocks added yet. Scan and add to watchlist.</span>';
    return;
  }
  el.innerHTML = watchlist.map(s => `
    <div class="wtag">
      <span style="color:var(--accent);font-weight:700;">${s}</span>
      <span class="wtag-remove" onclick='removeFromWatchlist("${s}")'>✕</span>
    </div>
  `).join('');
}

// ===================== RISK CALC =====================
function calcRisk() {
  const capital = +document.getElementById('r-capital').value || 110000;
  const riskPct = +document.getElementById('r-risk').value || 2;
  const entry = +document.getElementById('r-entry').value;
  const sl = +document.getElementById('r-sl').value;
  const target = +document.getElementById('r-target').value;

  const maxRisk = capital * riskPct / 100;
  document.getElementById('r-maxrisk').textContent = '₹' + maxRisk.toLocaleString('en-IN');
  document.getElementById('two-pct').textContent = (capital * 0.02).toLocaleString('en-IN');
  document.getElementById('five-pct').textContent = (capital * 0.05).toLocaleString('en-IN');
  updateAllocation(capital);

  if (entry && sl && entry > sl) {
    const riskPerShare = entry - sl;
    const shares = Math.floor(maxRisk / riskPerShare);
    const capReq = shares * entry;
    const capPct = (capReq / capital * 100).toFixed(1);
    const gain = target ? (target - entry) * shares : 0;
    const loss = riskPerShare * shares;
    const rr = target ? ((target - entry) / (entry - sl)).toFixed(1) : '—';
    const rrColor = +rr >= 2 ? 'var(--accent2)' : +rr >= 1.5 ? 'var(--warn)' : 'var(--danger)';

    document.getElementById('r-shares').textContent = shares + ' shares';
    document.getElementById('r-capreq').textContent = '₹' + capReq.toLocaleString('en-IN');
    document.getElementById('r-cappct').textContent = capPct + '%';
    document.getElementById('r-gain').textContent = gain ? '₹' + gain.toLocaleString('en-IN') : '—';
    document.getElementById('r-loss').textContent = '−₹' + loss.toLocaleString('en-IN');
    document.getElementById('r-rr').textContent = target ? `1:${rr}` : '—';
    document.getElementById('r-rr').style.color = rrColor;
  }
}

function updateAllocation(capital) {
  const c = capital || 110000;
  const active = Math.round(c * 0.70);
  const reserve = Math.round(c * 0.20);
  const buffer = Math.round(c * 0.10);
  document.getElementById('allocation-display').innerHTML = `
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:6px;">
        <span style="color:var(--accent2);">Active Trading (70%)</span>
        <span style="font-weight:700;">₹${active.toLocaleString('en-IN')}</span>
      </div>
      <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;"><div style="width:70%;height:100%;background:linear-gradient(90deg,var(--accent2),var(--accent));border-radius:4px;"></div></div>
      <div style="font-size:0.65rem;color:var(--text3);margin-top:4px;">Max 3 positions of ~₹${Math.round(active/3).toLocaleString('en-IN')} each</div>
    </div>
    <div style="margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:6px;">
        <span style="color:var(--warn);">Opportunity Reserve (20%)</span>
        <span style="font-weight:700;">₹${reserve.toLocaleString('en-IN')}</span>
      </div>
      <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;"><div style="width:20%;height:100%;background:var(--warn);border-radius:4px;"></div></div>
      <div style="font-size:0.65rem;color:var(--text3);margin-top:4px;">Deploy only on high conviction setups</div>
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:6px;">
        <span style="color:var(--danger);">Safety Buffer (10%)</span>
        <span style="font-weight:700;">₹${buffer.toLocaleString('en-IN')}</span>
      </div>
      <div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;"><div style="width:10%;height:100%;background:var(--danger);border-radius:4px;"></div></div>
      <div style="font-size:0.65rem;color:var(--text3);margin-top:4px;">Never touch — covers charges & slippage</div>
    </div>
  `;
}

// ===================== CHECKLIST =====================
function toggleCheck(el) {
  el.classList.toggle('checked');
  updateChecklistScore();
}
function updateChecklistScore() {
  const all = document.querySelectorAll('#entry-checklist .check-icon');
  const checked = document.querySelectorAll('#entry-checklist .check-icon.checked').length;
  document.getElementById('checklist-score').textContent = `${checked} / ${all.length}`;
  const v = document.getElementById('checklist-verdict');
  if (checked === all.length) { v.textContent = '✅ All checks clear — OK to trade!'; v.style.color = 'var(--accent2)'; }
  else if (checked >= 6) { v.textContent = '⚠️ Almost ready — complete remaining checks'; v.style.color = 'var(--warn)'; }
  else { v.textContent = 'Complete all checks before entering trade'; v.style.color = 'var(--text3)'; }
}

// ===================== JOURNAL =====================
function addTrade() {
  const stock = document.getElementById('j-stock').value.toUpperCase().trim();
  const date = document.getElementById('j-date').value;
  const entry = +document.getElementById('j-entry').value;
  const qty = +document.getElementById('j-qty').value;
  const sl = +document.getElementById('j-sl').value;
  const target = +document.getElementById('j-target').value;
  const exitP = +document.getElementById('j-exit').value || null;
  const notes = document.getElementById('j-notes').value;
  if (!stock || !date || !entry || !qty) return showNotif('Error', 'Fill in required fields', true);

  const trade = { id: Date.now(), stock, date, entry, qty, sl, target, exit: exitP, notes, capital: entry * qty };
  trades.push(trade);
  localStorage.setItem('trades', JSON.stringify(trades));
  renderTrades();
  updateJournalStats();
  document.getElementById('stat-trades').textContent = trades.filter(t => !t.exit).length;
  showNotif('Trade Logged', `${stock} added to journal`);
  ['j-stock','j-entry','j-qty','j-sl','j-target','j-exit','j-notes'].forEach(id => document.getElementById(id).value = '');
}

function renderTrades() {
  const wrap = document.getElementById('trade-list-wrap');
  if (trades.length === 0) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">📒</div><div class="empty-title">No trades logged</div><div class="empty-sub">Start logging trades to track performance</div></div>';
    return;
  }
  wrap.innerHTML = '<div style="padding:12px;display:flex;flex-direction:column;gap:10px;">' + trades.slice().reverse().map(t => {
    const pnl = t.exit ? ((t.exit - t.entry) * t.qty) : null;
    const pnlPct = t.exit ? ((t.exit - t.entry) / t.entry * 100).toFixed(1) : null;
    const status = t.exit ? (pnl >= 0 ? 'WIN' : 'LOSS') : 'OPEN';
    const statusColor = status === 'WIN' ? 'badge-green' : status === 'LOSS' ? 'badge-orange' : 'badge-cyan';
    const pnlColor = pnl >= 0 ? 'var(--accent2)' : 'var(--danger)';
    return `<div class="trade-entry">
      <div><div class="trade-stock">${t.stock}</div><div class="trade-detail">${t.date}</div></div>
      <div><div class="trade-detail">Entry: ₹${t.entry} × ${t.qty}</div><div class="trade-detail">Capital: ₹${t.capital.toLocaleString('en-IN')}</div></div>
      <div><div class="trade-detail">SL: ₹${t.sl}</div><div class="trade-detail">T: ₹${t.target}</div></div>
      <div class="trade-pnl" style="color:${pnl!==null?pnlColor:'var(--text2)'};">${pnl !== null ? (pnl >= 0 ? '+' : '') + '₹' + pnl.toFixed(0) + ' (' + (pnl>=0?'+':'') + pnlPct + '%)' : 'Open'}</div>
      <div style="display:flex;gap:6px;align-items:center;"><span class="badge ${statusColor}">${status}</span><button class="btn-xs" style="background:rgba(212,42,69,0.08);color:var(--danger);border:1px solid rgba(212,42,69,0.2);" onclick="deleteTrade(${t.id})">✕</button></div>
    </div>`;
  }).join('') + '</div>';
}

function deleteTrade(id) {
  trades = trades.filter(t => t.id !== id);
  localStorage.setItem('trades', JSON.stringify(trades));
  renderTrades();
  updateJournalStats();
  document.getElementById('stat-trades').textContent = trades.filter(t => !t.exit).length;
}

function updateJournalStats() {
  const closed = trades.filter(t => t.exit);
  const wins = closed.filter(t => (t.exit - t.entry) > 0).length;
  const totalPnl = closed.reduce((sum, t) => sum + ((t.exit - t.entry) * t.qty), 0);
  document.getElementById('j-total').textContent = trades.length;
  document.getElementById('j-winrate').textContent = closed.length ? Math.round(wins / closed.length * 100) + '%' : '—';
  const pnlEl = document.getElementById('j-pnl');
  pnlEl.textContent = closed.length ? (totalPnl >= 0 ? '+' : '') + '₹' + totalPnl.toFixed(0) : '—';
  pnlEl.style.color = totalPnl >= 0 ? 'var(--accent2)' : 'var(--danger)';
}

function clearJournal() { if(confirm('Clear all journal entries?')) { trades = []; localStorage.setItem('trades', JSON.stringify(trades)); renderTrades(); updateJournalStats(); } }
function resetFilters() {
  document.getElementById('nse-minprice').value = 100;
  document.getElementById('nse-maxprice').value = 1500;
  document.getElementById('nse-vol').value      = 1.5;
  document.getElementById('nse-chg').value      = 1.0;
  document.getElementById('nse-capital').value  = 110000;
}

// ===================== NAV =====================
function showPage(page, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  if (btn) btn.classList.add('active');
}

function toggleFilterPanel(bodyId, btnId) {
  const body = document.getElementById(bodyId);
  const btn  = document.getElementById(btnId);
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  if (btn) btn.classList.toggle('open', !isOpen);
}

// ===================== WINDOW STATUS =====================
function updateWindowStatus() {
  const now = new Date();
  const h = now.getHours(), m = now.getMinutes();
  const total = h * 60 + m;
  const el = document.getElementById('window-status');
  // Market: 9:15 AM (555) to 3:30 PM (930). Prime window: 10:15–11:00 AM (615–660).
  if (total >= 615 && total <= 660) { el.textContent = '⚡ PRIME WINDOW'; el.style.color = 'var(--accent2)'; }
  else if (total >= 555 && total <= 930) { el.textContent = '🟢 Market Open'; el.style.color = 'var(--accent2)'; }
  else { el.textContent = '🔴 Market Closed'; el.style.color = 'var(--danger)'; }
}

// ===================== INIT =====================
document.getElementById('j-date').value = new Date().toISOString().split('T')[0];
renderWatchlist();
renderTrades();
updateJournalStats();
calcRisk();
updateAllocation(110000);
updateWindowStatus();
setInterval(updateWindowStatus, 60000);
document.getElementById('stat-watch').textContent = watchlist.length;
document.getElementById('stat-trades').textContent = trades.filter(t => !t.exit).length;

// =====================================================================
//  MARKET HEALTH DASHBOARD  (Phase 3)
//  renderMarketHealth()  — builds the full panel HTML from marketHealth state
//  saveMarketInputs()    — reads 3 manual fields, saves to localStorage
//  loadMarketInputs()    — restores manual fields + auto state from localStorage
// =====================================================================

function loadMarketInputs() {
  try {
    const saved = localStorage.getItem(MARKET_HEALTH_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge saved fields into state (don't overwrite auto-computed ones on first load)
      Object.assign(marketHealth, parsed);
    }
  } catch(e) { /* ignore */ }
  renderMarketHealth();
}

function saveMarketInputs() {
  const niftyEl = document.getElementById('mh-nifty');
  const vixEl   = document.getElementById('mh-vix');
  const fiiEl   = document.getElementById('mh-fii');

  if (niftyEl && niftyEl.value !== '') marketHealth.niftyClose = +niftyEl.value;
  if (vixEl   && vixEl.value   !== '') marketHealth.indiaVix   = +vixEl.value;
  if (fiiEl   && fiiEl.value   !== '') marketHealth.fiiFlow    = +fiiEl.value;

  localStorage.setItem(MARKET_HEALTH_KEY, JSON.stringify(marketHealth));
  renderMarketHealth();
  showNotif('✅ Saved', 'Market health inputs updated');
}

function renderMarketHealth() {
  const panel = document.getElementById('market-health-body');
  const badgeEl = document.getElementById('mh-badge');
  if (!panel) return;

  const mh = marketHealth;

  // ── Rating logic ────────────────────────────────────────────────────
  // Count negative signals — each one weighs down the rating
  let negatives = 0;
  const reasons = [];

  if (mh.indiaVix !== null) {
    if (mh.indiaVix > 28) { negatives += 2; reasons.push(`VIX ${mh.indiaVix} — high fear`); }
    else if (mh.indiaVix > 22) { negatives += 1; reasons.push(`VIX ${mh.indiaVix} — elevated`); }
  }
  if (mh.fiiFlow !== null && mh.fiiFlow < -2000) {
    negatives += 1; reasons.push(`FII selling ₹${Math.abs(mh.fiiFlow).toLocaleString('en-IN')} Cr`);
  }
  if (mh.adRatio !== null && mh.adRatio < 0.8) {
    negatives += 1; reasons.push(`A/D weak (${mh.adRatio})`);
  }
  if (mh.pctAboveMA20 !== null && mh.pctAboveMA20 < 40) {
    negatives += 1; reasons.push(`Only ${mh.pctAboveMA20}% stocks above MA20`);
  }
  if (mh.pctAboveMA50 !== null && mh.pctAboveMA50 < 35) {
    negatives += 1; reasons.push(`Only ${mh.pctAboveMA50}% stocks above MA50`);
  }
  if (mh.rollingWR !== null && mh.rollingWR < 40) {
    negatives += 1; reasons.push(`Market quality low (${mh.rollingWR}% bullish days)`);
  }

  let rating, ratingColor, advice;
  if (negatives <= 1) {
    rating = '🟢 GOOD';      ratingColor = 'var(--accent2)';
    advice = 'Trade normally. Follow your plan, full position sizing.';
  } else if (negatives <= 3) {
    rating = '🟡 CAUTION';   ratingColor = 'var(--warn)';
    advice = 'Reduce position sizes by 50%. Only take highest-conviction setups.';
  } else {
    rating = '🔴 AVOID';     ratingColor = 'var(--danger)';
    advice = 'Sit out this week. Preserve capital — conditions unfavourable for breakouts.';
  }

  // Update badge in collapsible toggle
  if (badgeEl) {
    badgeEl.textContent = rating.split(' ')[0] + ' ' + rating.split(' ')[1]; // e.g. "🟢 GOOD"
    badgeEl.style.color = ratingColor;
  }

  // ── Helper to format a metric cell ──────────────────────────────────
  function metricCell(label, value, status, hint) {
    const col = status === 'good' ? 'var(--accent2)' : status === 'warn' ? 'var(--warn)' : status === 'bad' ? 'var(--danger)' : 'var(--text3)';
    const icon = status === 'good' ? '✓' : status === 'warn' ? '⚠' : status === 'bad' ? '✗' : '—';
    return `
      <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;border-left:3px solid ${col};">
        <div style="font-size:0.58rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">${label}</div>
        <div style="font-size:0.85rem;font-weight:700;color:${col};">${value === null ? '—' : value}</div>
        ${hint ? `<div style="font-size:0.58rem;color:var(--text3);margin-top:2px;">${icon} ${hint}</div>` : ''}
      </div>`;
  }

  // ── Determine status of each metric ─────────────────────────────────
  const adStatus   = mh.adRatio === null ? 'none'
    : mh.adRatio >= 1.2 ? 'good' : mh.adRatio >= 0.8 ? 'warn' : 'bad';
  const adHint = mh.adRatio === null ? '' : mh.adRatio >= 1.2 ? 'More buyers than sellers'
    : mh.adRatio >= 0.8 ? 'Mixed market' : 'Sellers in control';

  const ma20Status = mh.pctAboveMA20 === null ? 'none'
    : mh.pctAboveMA20 >= 55 ? 'good' : mh.pctAboveMA20 >= 40 ? 'warn' : 'bad';
  const ma20Hint = mh.pctAboveMA20 === null ? '' : mh.pctAboveMA20 >= 55 ? 'Broad uptrend'
    : mh.pctAboveMA20 >= 40 ? 'Mixed' : 'Most stocks declining';

  const ma50Status = mh.pctAboveMA50 === null ? 'none'
    : mh.pctAboveMA50 >= 50 ? 'good' : mh.pctAboveMA50 >= 35 ? 'warn' : 'bad';
  const ma50Hint = mh.pctAboveMA50 === null ? '' : mh.pctAboveMA50 >= 50 ? 'Intermediate uptrend'
    : mh.pctAboveMA50 >= 35 ? 'Mixed' : 'Intermediate downtrend';

  const wrStatus  = mh.rollingWR === null ? 'none'
    : mh.rollingWR >= 55 ? 'good' : mh.rollingWR >= 40 ? 'warn' : 'bad';
  const wrHint = mh.rollingWR === null ? 'Run scan to compute'
    : mh.rollingWR >= 55 ? 'Good market quality' : mh.rollingWR >= 40 ? 'Patchy' : 'Poor conditions';

  const vixStatus = mh.indiaVix === null ? 'none'
    : mh.indiaVix <= 15 ? 'good' : mh.indiaVix <= 22 ? 'warn' : 'bad';
  const vixHint   = mh.indiaVix === null ? 'Enter manually below'
    : mh.indiaVix <= 15 ? 'Low fear' : mh.indiaVix <= 22 ? 'Elevated' : 'High fear';

  const fiiStatus = mh.fiiFlow === null ? 'none'
    : mh.fiiFlow > 500 ? 'good' : mh.fiiFlow >= -2000 ? 'warn' : 'bad';
  const fiiHint   = mh.fiiFlow === null ? 'Enter manually below'
    : mh.fiiFlow > 500 ? 'Buying' : mh.fiiFlow >= -2000 ? 'Neutral/light selling' : 'Heavy selling';

  const niftyStr  = mh.niftyClose !== null ? `₹${mh.niftyClose.toLocaleString('en-IN')}` : null;
  const niftyHint = mh.niftyClose !== null ? 'Weekly close (manual)' : 'Enter manually below';

  const lastDate = mh.lastComputedDate
    ? `Auto-computed: ${formatDateKey(mh.lastComputedDate)}`
    : 'Run scan to compute A/D & breadth';

  panel.innerHTML = `
    <!-- Rating strip -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg3);border-radius:10px;margin-bottom:14px;">
      <div>
        <div style="font-size:0.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">This Week's Market Rating</div>
        <div style="font-size:1.2rem;font-weight:800;color:${ratingColor};">${rating}</div>
        <div style="font-size:0.62rem;color:var(--text3);margin-top:3px;">${advice}</div>
      </div>
      <div style="text-align:right;font-size:0.6rem;color:var(--text3);">
        ${negatives} risk signal${negatives !== 1 ? 's' : ''}<br>
        <span style="font-size:0.55rem;">${lastDate}</span>
      </div>
    </div>

    ${reasons.length > 0 ? `
    <div style="padding:8px 12px;background:rgba(201,128,0,0.05);border:1px solid rgba(201,128,0,0.15);border-radius:8px;margin-bottom:14px;">
      <div style="font-size:0.6rem;color:var(--warn);font-weight:700;margin-bottom:4px;">⚠ RISK SIGNALS DETECTED</div>
      ${reasons.map(r => `<div style="font-size:0.65rem;color:var(--text2);padding:1px 0;">• ${r}</div>`).join('')}
    </div>` : ''}

    <!-- Auto-computed metrics grid -->
    <div style="font-size:0.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Auto-Computed from Bhavcopy</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
      ${metricCell('A/D Ratio', mh.adRatio, adStatus, adHint)}
      ${metricCell('% Above MA20', mh.pctAboveMA20 !== null ? mh.pctAboveMA20 + '%' : null, ma20Status, ma20Hint)}
      ${metricCell('% Above MA50', mh.pctAboveMA50 !== null ? mh.pctAboveMA50 + '%' : null, ma50Status, ma50Hint)}
      ${metricCell('20-Day Quality', mh.rollingWR !== null ? mh.rollingWR + '% bullish' : null, wrStatus, wrHint)}
    </div>

    <!-- Manual inputs grid -->
    <div style="font-size:0.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Manual Entry (Saturday Morning)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
      ${metricCell('India VIX', mh.indiaVix, vixStatus, vixHint)}
      ${metricCell('FII Flow (₹Cr)', mh.fiiFlow !== null ? (mh.fiiFlow > 0 ? '+' : '') + mh.fiiFlow.toLocaleString('en-IN') : null, fiiStatus, fiiHint)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
      <div>
        <label style="font-size:0.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px;">NIFTY 50 Close</label>
        <input type="number" id="mh-nifty" class="form-input" placeholder="e.g. 23150" value="${mh.niftyClose !== null ? mh.niftyClose : ''}" style="font-size:0.75rem;">
      </div>
      <div>
        <label style="font-size:0.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px;">India VIX</label>
        <input type="number" id="mh-vix" class="form-input" placeholder="e.g. 14.5" step="0.1" value="${mh.indiaVix !== null ? mh.indiaVix : ''}" style="font-size:0.75rem;">
      </div>
      <div>
        <label style="font-size:0.6rem;color:var(--text3);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:4px;">FII Flow ₹Cr</label>
        <input type="number" id="mh-fii" class="form-input" placeholder="e.g. -1840" value="${mh.fiiFlow !== null ? mh.fiiFlow : ''}" style="font-size:0.75rem;">
      </div>
    </div>
    <button onclick="saveMarketInputs()" class="btn btn-primary" style="width:100%;padding:10px;">💾 Save Market Data</button>
    <div style="margin-top:8px;font-size:0.6rem;color:var(--text3);">
      VIX: nseindia.com → Market Data → VIX &nbsp;·&nbsp; FII: nseindia.com → Market Data → FII / DII Activity
    </div>`;
}
