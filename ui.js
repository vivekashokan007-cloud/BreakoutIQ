// ===================== UI — SCANNER TAB, WATCHLIST, RISK, CHECKLIST, JOURNAL, NAV =====================

// ===================== SCANNER =====================
function runScanner() {
  const tbody = document.getElementById('scanner-tbody');
  const mobileCards = document.getElementById('scanner-mobile-cards');
  const loadingHtml = '<div style="text-align:center;padding:48px;color:var(--text3);"><span class="spinner"></span> Scanning NSE stocks...</div>';
  tbody.innerHTML = `<tr><td colspan="11">${loadingHtml}</td></tr>`;
  mobileCards.innerHTML = loadingHtml;

  setTimeout(() => {
    const minP = +document.getElementById('f-minprice').value || 0;
    const maxP = +document.getElementById('f-maxprice').value || 99999;
    const minVol = +document.getElementById('f-vol').value || 0;
    const minSignal = +document.getElementById('f-signal').value || 0;
    const sector = document.getElementById('f-sector').value;

    let results = STOCKS.map(generateStockData).filter(s => {
      if (s.price < minP || s.price > maxP) return false;
      if (s.volRatio < minVol) return false;
      if (s.score < minSignal) return false;
      if (sector !== 'ALL' && s.sector.toUpperCase() !== sector) return false;
      return true;
    }).sort((a,b) => b.score - a.score);

    scanResults = results;
    renderTable(results);

    const now = new Date();
    document.getElementById('last-scan').textContent = now.toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
    const strong = results.filter(r => r.score >= 75).length;
    document.getElementById('alert-count').textContent = `${strong} stocks`;
    document.getElementById('stat-signals').textContent = strong;
    document.getElementById('result-count').textContent = `${results.length} results`;

    if (strong > 0) showNotif('Scan Complete', `${strong} breakout signals found!`);
    updateWindowStatus();
  }, 1200);
}

function renderTable(results) {
  const tbody = document.getElementById('scanner-tbody');
  const mobileCards = document.getElementById('scanner-mobile-cards');
  const cap = +document.getElementById('f-capital').value || 110000;
  document.getElementById('capital-display').textContent = '₹' + cap.toLocaleString('en-IN');

  if (results.length === 0) {
    const empty = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No stocks found</div><div class="empty-sub">Relax filters or scan again</div></div>';
    tbody.innerHTML = `<tr><td colspan="11">${empty}</td></tr>`;
    mobileCards.innerHTML = empty;
    return;
  }

  // Desktop table rows
  tbody.innerHTML = results.map(s => {
    const chgClass = s.change >= 0 ? 'change-pos' : 'change-neg';
    const chgSign = s.change >= 0 ? '▲' : '▼';
    const volClass = s.volRatio >= 1.5 ? 'vol-high' : 'vol-normal';
    const scoreColor = s.score >= 80 ? 'var(--accent2)' : s.score >= 60 ? 'var(--warn)' : 'var(--text2)';
    const rrColor = +s.rr >= 2 ? 'var(--accent2)' : +s.rr >= 1.5 ? 'var(--warn)' : 'var(--danger)';
    const rsiColor = s.rsi >= 50 && s.rsi <= 75 ? 'var(--accent2)' : s.rsi > 75 ? 'var(--warn)' : 'var(--danger)';
    return `<tr>
      <td><div class="stock-name">${s.sym}</div><div class="stock-sector">${s.sector} · ${s.cap}</div></td>
      <td style="font-weight:700;">₹${s.price.toLocaleString('en-IN')}</td>
      <td class="${chgClass}">${chgSign}${Math.abs(s.change)}%</td>
      <td><div style="display:flex;align-items:center;gap:6px;"><div class="signal-fill" style="width:60px;"><div class="signal-fill-inner" style="width:${s.score}%;background:${scoreColor};"></div></div><span style="font-size:0.72rem;font-weight:700;color:${scoreColor};">${s.score}%</span></div></td>
      <td class="${volClass}">${s.volRatio}x</td>
      <td style="color:${rsiColor};">${s.rsi}</td>
      <td><span class="badge ${s.score>=75?'badge-green':s.score>=60?'badge-warn':'badge-cyan'}">${s.pattern}</span></td>
      <td class="change-pos">₹${s.target1.toLocaleString('en-IN')}</td>
      <td class="change-neg">₹${s.sl.toLocaleString('en-IN')}</td>
      <td style="color:${rrColor};font-weight:700;">1:${s.rr}</td>
      <td><div class="action-btns"><button class="btn-xs btn-xs-cyan" onclick='openDetail(${JSON.stringify(s).replace(/'/g,"&#39;")})'>Detail</button><button class="btn-xs btn-xs-green" onclick='addToWatchlist("${s.sym}")'>+Watch</button></div></td>
    </tr>`;
  }).join('');

  // Mobile cards
  mobileCards.innerHTML = results.map(s => {
    const chgSign = s.change >= 0 ? '▲' : '▼';
    const chgColor = s.change >= 0 ? 'var(--accent2)' : 'var(--danger)';
    const scoreColor = s.score >= 80 ? 'var(--accent2)' : s.score >= 60 ? 'var(--warn)' : 'var(--text3)';
    const rrColor = +s.rr >= 2 ? 'var(--accent2)' : +s.rr >= 1.5 ? 'var(--warn)' : 'var(--danger)';
    const rsiColor = s.rsi >= 50 && s.rsi <= 75 ? 'var(--accent2)' : s.rsi > 75 ? 'var(--warn)' : 'var(--danger)';
    return `<div class="stock-card">
      <div class="stock-card-header">
        <div>
          <div class="stock-card-name">${s.sym}</div>
          <div class="stock-card-sector">${s.sector} · ${s.cap} Cap</div>
        </div>
        <div class="stock-card-price">
          <div class="price-val">₹${s.price.toLocaleString('en-IN')}</div>
          <div style="font-size:0.75rem;font-weight:700;color:${chgColor};">${chgSign} ${Math.abs(s.change)}%</div>
        </div>
      </div>
      <div class="stock-card-grid">
        <div class="stock-card-metric">
          <div class="scm-label">Volume</div>
          <div class="scm-value ${s.volRatio>=1.5?'text-green':'text-muted'}">${s.volRatio}x</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">RSI (14)</div>
          <div class="scm-value" style="color:${rsiColor};">${s.rsi}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">R:R</div>
          <div class="scm-value" style="color:${rrColor};">1:${s.rr}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Target</div>
          <div class="scm-value text-green">₹${s.target1.toLocaleString('en-IN')}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Stop Loss</div>
          <div class="scm-value text-danger">₹${s.sl.toLocaleString('en-IN')}</div>
        </div>
        <div class="stock-card-metric">
          <div class="scm-label">Pattern</div>
          <div class="scm-value" style="font-size:0.65rem;color:var(--accent);">${s.pattern}</div>
        </div>
      </div>
      <div class="stock-card-score">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:0.6rem;color:var(--text3);letter-spacing:1px;text-transform:uppercase;">Breakout Score</span>
          <span style="font-size:0.72rem;font-weight:700;color:${scoreColor};">${s.score}%</span>
        </div>
        <div class="score-bar-track"><div class="score-bar-fill" style="width:${s.score}%;background:${scoreColor};"></div></div>
      </div>
      <div class="stock-card-footer">
        <button class="btn-xs btn-xs-cyan" onclick='openDetail(${JSON.stringify(s).replace(/'/g,"&#39;")})'>📋 Detail</button>
        <button class="btn-xs btn-xs-green" onclick='addToWatchlist("${s.sym}")'>+ Watchlist</button>
      </div>
    </div>`;
  }).join('');
}

function openDetail(s) {
  document.getElementById('modal-stock').textContent = s.sym;
  document.getElementById('modal-sector').textContent = `NSE · ${s.cap} Cap · ${s.sector}`;
  const cap = +document.getElementById('f-capital').value || 110000;
  const riskAmt = cap * 0.02;
  const riskPerShare = s.price - s.sl;
  const shares = riskPerShare > 0 ? Math.floor(riskAmt / riskPerShare) : 0;
  const capNeeded = shares * s.price;

  document.getElementById('modal-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div class="result-box"><div class="result-row"><span class="result-key">Price</span><span class="result-val cyan">₹${s.price.toLocaleString('en-IN')}</span></div><div class="result-row"><span class="result-key">Change</span><span class="result-val ${s.change>=0?'green':'danger'}">${s.change>=0?'▲':'▼'} ${Math.abs(s.change)}%</span></div></div>
      <div class="result-box"><div class="result-row"><span class="result-key">Volume Ratio</span><span class="result-val ${s.volRatio>=1.5?'green':'orange'}">${s.volRatio}x</span></div><div class="result-row"><span class="result-key">RSI (14)</span><span class="result-val cyan">${s.rsi}</span></div></div>
    </div>
    <div class="result-box" style="margin-bottom:12px;">
      <div style="font-size:0.65rem;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">VARSITY TRADE PLAN</div>
      <div class="result-row"><span class="result-key">Entry Zone</span><span class="result-val cyan">₹${s.price} – ₹${(s.price*1.01).toFixed(0)}</span></div>
      <div class="result-row"><span class="result-key">Stop Loss</span><span class="result-val danger">₹${s.sl} (${((s.price-s.sl)/s.price*100).toFixed(1)}% below)</span></div>
      <div class="result-row"><span class="result-key">Target 1 (50% exit)</span><span class="result-val green">₹${s.target1} (+6%)</span></div>
      <div class="result-row"><span class="result-key">Target 2 (trail stop)</span><span class="result-val green">₹${s.target2} (+12%)</span></div>
      <div class="result-row"><span class="result-key">Risk:Reward</span><span class="result-val orange">1:${s.rr}</span></div>
    </div>
    <div class="result-box">
      <div style="font-size:0.65rem;color:var(--text3);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">POSITION SIZE (2% RULE)</div>
      <div class="result-row"><span class="result-key">Max Risk (2%)</span><span class="result-val cyan">₹${riskAmt.toLocaleString('en-IN')}</span></div>
      <div class="result-row"><span class="result-key">Shares to Buy</span><span class="result-val green">${shares} shares</span></div>
      <div class="result-row"><span class="result-key">Capital Required</span><span class="result-val orange">₹${capNeeded.toLocaleString('en-IN')}</span></div>
    </div>
    <button class="btn btn-success" style="width:100%;margin-top:12px;" onclick='addToWatchlist("${s.sym}");closeModal();'>+ Add to Watchlist</button>
  `;
  document.getElementById('detailModal').classList.add('open');
}

function closeModal() { document.getElementById('detailModal').classList.remove('open'); }

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
function exportWatchlist() { alert('Watchlist: ' + watchlist.join(', ') || 'Empty'); }
function resetFilters() { document.getElementById('f-minprice').value=100; document.getElementById('f-maxprice').value=1500; document.getElementById('f-vol').value=1.5; document.getElementById('f-signal').value=75; document.getElementById('f-sector').value='ALL'; }

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
