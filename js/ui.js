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
