
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

// ===================== DATA & STATE =====================
let watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
let trades = JSON.parse(localStorage.getItem('trades') || '[]');
let scanResults = [];

// Stock database (NSE stocks with realistic data)
const STOCKS = [
  { sym:'RELIANCE', name:'Reliance Industries', sector:'Energy', cap:'Large', basePrice:2840, basePE:28 },
  { sym:'TCS', name:'Tata Consultancy Services', sector:'IT', cap:'Large', basePrice:3920, basePE:30 },
  { sym:'HDFCBANK', name:'HDFC Bank', sector:'Banking', cap:'Large', basePrice:1580, basePE:20 },
  { sym:'INFY', name:'Infosys', sector:'IT', cap:'Large', basePrice:1720, basePE:26 },
  { sym:'BHARTIARTL', name:'Bharti Airtel', sector:'Telecom', cap:'Large', basePrice:1340, basePE:50 },
  { sym:'WIPRO', name:'Wipro Limited', sector:'IT', cap:'Large', basePrice:480, basePE:22 },
  { sym:'SUNPHARMA', name:'Sun Pharmaceutical', sector:'Pharma', cap:'Large', basePrice:1650, basePE:35 },
  { sym:'DRREDDY', name:'Dr. Reddy\'s Laboratories', sector:'Pharma', cap:'Large', basePrice:5800, basePE:25 },
  { sym:'HCLTECH', name:'HCL Technologies', sector:'IT', cap:'Large', basePrice:1640, basePE:28 },
  { sym:'TATAMOTORS', name:'Tata Motors', sector:'Auto', cap:'Large', basePrice:920, basePE:12 },
  { sym:'LTIM', name:'LTIMindtree', sector:'IT', cap:'Mid', basePrice:5200, basePE:32 },
  { sym:'BEL', name:'Bharat Electronics', sector:'Defence', cap:'Mid', basePrice:280, basePE:38 },
  { sym:'HAL', name:'Hindustan Aeronautics', sector:'Defence', cap:'Large', basePrice:3800, basePE:30 },
  { sym:'BHEL', name:'Bharat Heavy Electricals', sector:'CAPGOODS', cap:'Large', basePrice:280, basePE:60 },
  { sym:'ABB', name:'ABB India', sector:'CAPGOODS', cap:'Large', basePrice:7200, basePE:75 },
  { sym:'SIEMENS', name:'Siemens India', sector:'CAPGOODS', cap:'Large', basePrice:6500, basePE:70 },
  { sym:'LTTS', name:'L&T Technology Services', sector:'IT', cap:'Mid', basePrice:4800, basePE:34 },
  { sym:'POLYCAB', name:'Polycab India', sector:'CAPGOODS', cap:'Mid', basePrice:5400, basePE:42 },
  { sym:'TORNTPHARM', name:'Torrent Pharmaceuticals', sector:'Pharma', cap:'Mid', basePrice:2800, basePE:38 },
  { sym:'AUROPHARMA', name:'Aurobindo Pharma', sector:'Pharma', cap:'Mid', basePrice:1150, basePE:18 },
  { sym:'PERSISTENT', name:'Persistent Systems', sector:'IT', cap:'Mid', basePrice:4600, basePE:55 },
  { sym:'KPITTECH', name:'KPIT Technologies', sector:'IT', cap:'Mid', basePrice:1450, basePE:60 },
  { sym:'ZOMATO', name:'Zomato', sector:'Consumer', cap:'Large', basePrice:220, basePE:200 },
  { sym:'NAUKRI', name:'Info Edge (Naukri)', sector:'IT', cap:'Mid', basePrice:6200, basePE:80 },
  { sym:'CAMS', name:'CAMS', sector:'Fintech', cap:'Mid', basePrice:2900, basePE:48 },
  { sym:'IRCTC', name:'IRCTC', sector:'Infra', cap:'Mid', basePrice:780, basePE:55 },
  { sym:'DIXON', name:'Dixon Technologies', sector:'Consumer Electronics', cap:'Mid', basePrice:12000, basePE:90 },
  { sym:'AMBER', name:'Amber Enterprises', sector:'Consumer Electronics', cap:'Mid', basePrice:3800, basePE:55 },
  { sym:'TRENT', name:'Trent Limited', sector:'Retail', cap:'Mid', basePrice:5200, basePE:150 },
  { sym:'DMART', name:'Avenue Supermarts', sector:'Retail', cap:'Large', basePrice:3800, basePE:80 },
];

function getRandFloat(min, max) { return Math.random() * (max - min) + min; }
function getRandInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function generateStockData(stock) {
  const priceVariance = getRandFloat(0.85, 1.15);
  const price = +(stock.basePrice * priceVariance).toFixed(2);
  const change = getRandFloat(-3, 4.5);
  const volRatio = getRandFloat(0.5, 3.5);
  const rsi = getRandFloat(30, 85);
  const atr = price * getRandFloat(0.015, 0.04);
  const consolidating = Math.random() > 0.4;
  const nearHigh = Math.random() > 0.45;
  const volumeBreakout = volRatio >= 1.5;

  // Breakout score based on Varsity criteria
  let score = 0;
  if (consolidating) score += 25;
  if (nearHigh) score += 15;
  if (volumeBreakout) score += 25;
  if (rsi >= 50 && rsi <= 75) score += 15;
  if (change > 0.5) score += 10;
  if (volRatio >= 2) score += 10;
  // Bug fix: only apply noise if base score > 0, and keep it additive-only to avoid inflating no-signal stocks
  if (score > 0) score = Math.min(score + getRandInt(-3, 8), 98);

  // Pattern detection
  const patterns = ['Bull Flag', 'Cup & Handle', 'Resistance Breakout', 'Volume Spike', 'Range Breakout', 'Pennant', '52W High Attempt'];
  const pattern = score >= 70 ? patterns[getRandInt(0,4)] : patterns[getRandInt(4,6)];

  const target1 = +(price * 1.06).toFixed(2);
  const target2 = +(price * 1.12).toFixed(2);
  const sl = +(price * (1 - getRandFloat(0.03, 0.06))).toFixed(2);
  // Bug fix: compute R:R directly with explicit numbers, not string division
  const riskPerShareRaw = price - sl;
  const rewardPerShareRaw = target1 - price;
  const rr = riskPerShareRaw > 0 ? (rewardPerShareRaw / riskPerShareRaw).toFixed(1) : '0';

  return { ...stock, price, change: +change.toFixed(2), volRatio: +volRatio.toFixed(2), rsi: +rsi.toFixed(1), atr: +atr.toFixed(2), score, pattern, target1, target2, sl, rr, consolidating, nearHigh, volumeBreakout };
}

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

// ===================== NSE DATA UPLOAD & ANALYSIS =====================
const NSE_STORAGE_KEY  = 'breakoutiq_nse_data';   // kept for migration only
const NSE_NAMES_KEY    = 'breakoutiq_nse_names';
const NSE_SAVEDAT_KEY  = 'breakoutiq_nse_savedat';

// =====================================================================
//  NSE HOLIDAY CALENDAR 2025–2030
// =====================================================================
const NSE_HOLIDAYS = new Set([
  // 2025
  '20250126','20250226','20250314','20250331','20250401','20250410',
  '20250414','20250501','20250815','20250827','20251002','20251020',
  '20251021','20251125','20251225',
  // 2026
  '20260126','20260302','20260303','20260414','20260501',
  '20260815','20261002','20261023','20261124','20261125','20261225',
  // 2027
  '20270126','20270319','20270329','20270330','20270414','20270501',
  '20270815','20271002','20271028','20271112','20271225',
  // 2028
  '20280126','20280307','20280417','20280501','20280815','20281002',
  '20281016','20281031','20281225',
  // 2029
  '20290126','20290226','20290402','20290501','20290815','20291002','20291225',
  // 2030
  '20300126','20300322','20300501','20300815','20301002','20301225',
]);

function isNSETradingDay(ds) {
  const y=+ds.slice(0,4),m=+ds.slice(4,6)-1,d=+ds.slice(6,8);
  const dow = new Date(y,m,d).getDay();
  return dow !== 0 && dow !== 6 && !NSE_HOLIDAYS.has(ds);
}

function getExpectedTradingDays(fromDS, toDS) {
  const res = [];
  let cur = new Date(+fromDS.slice(0,4), +fromDS.slice(4,6)-1, +fromDS.slice(6,8));
  const end = new Date(+toDS.slice(0,4), +toDS.slice(4,6)-1, +toDS.slice(6,8));
  while (cur <= end) {
    const ds = cur.getFullYear().toString()
      + String(cur.getMonth()+1).padStart(2,'0')
      + String(cur.getDate()).padStart(2,'0');
    if (isNSETradingDay(ds)) res.push(ds);
    cur.setDate(cur.getDate()+1);
  }
  return res;
}

function formatDateKey(dk) {
  if (!dk || dk.length!==8) return dk;
  return `${dk.slice(6,8)}-${dk.slice(4,6)}-${dk.slice(0,4)}`;
}

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

// ---- Storage banner ----
function renderStorageBanner() {
  const banner = document.getElementById('nse-storage-banner');
  if (!banner) return;
  const dates = Object.keys(nseDataByDate).filter(k=>!k.startsWith('UNKNOWN')).sort();
  const count = dates.length;
  if (count === 0) { banner.style.display = 'none'; return; }

  const first = dates[0], last = dates[dates.length-1];
  const expected = getExpectedTradingDays(first, last);
  const uploaded = new Set(dates);
  const gaps     = expected.filter(d => !uploaded.has(d));
  const gapStr   = gaps.length === 0
    ? '<span style="color:var(--accent2);">✅ No gaps</span>'
    : `<span style="color:var(--danger);">⚠️ ${gaps.length} gap${gaps.length>1?'s':''}</span>`;
  const savedStr = (() => { const s=localStorage.getItem(NSE_SAVEDAT_KEY); return s ? new Date(s).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : ''; })();
  const logCount = Object.keys(dayLog).length;

  banner.style.display = 'block';
  banner.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
        <div style="width:10px;height:10px;border-radius:50%;background:var(--accent2);flex-shrink:0;box-shadow:0 0 6px rgba(0,168,90,0.5);animation:pulse 2s infinite;"></div>
        <div style="min-width:0;">
          <div style="font-size:0.78rem;font-weight:700;color:var(--accent2);">📦 ${count} days loaded · ${logCount} in history · ${gapStr}</div>
          <div style="font-size:0.62rem;color:var(--text3);margin-top:2px;">${formatDateKey(first)} → ${formatDateKey(last)} · IndexedDB · ${savedStr}</div>
        </div>
      </div>
      <button onclick="clearAllNSEStorage()" style="background:rgba(212,42,69,0.08);border:1px solid rgba(212,42,69,0.2);color:var(--danger);padding:6px 10px;border-radius:6px;font-family:'JetBrains Mono';font-size:0.65rem;cursor:pointer;white-space:nowrap;min-height:36px;flex-shrink:0;">🗑 Clear OHLCV</button>
    </div>
    <div style="margin-top:10px;height:5px;background:var(--border);border-radius:3px;overflow:hidden;">
      <div style="height:100%;width:${Math.min(count/25*100,100)}%;background:${count>=20?'var(--accent2)':count>=14?'var(--warn)':'var(--danger)'};border-radius:3px;"></div>
    </div>
    <div style="font-size:0.62rem;color:var(--text3);margin-top:5px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
      <span>${count}/25 days · ${count>=20?'✅ Full accuracy':count>=14?'⚠️ Upload more for RSI':'❌ Need 14+ days'}</span>
      ${gaps.length>0?`<span style="color:var(--danger);">Missing: ${gaps.slice(0,3).map(d=>formatDateKey(d)).join(', ')}${gaps.length>3?' +more':''}</span>`:''}
    </div>`;
}

// =====================================================================
//  DATA CALENDAR — Visual month-by-month upload history
// =====================================================================
function renderDataCalendar() {
  const calEl = document.getElementById('data-calendar');
  if (!calEl) return;

  const allUploaded = Object.keys(nseDataByDate).filter(k=>!k.startsWith('UNKNOWN')).sort();
  const logDates    = Object.keys(dayLog).sort();
  const allKnown    = [...new Set([...allUploaded,...logDates])].sort();

  if (allKnown.length === 0) {
    calEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);font-size:0.78rem;">Upload Bhavcopy files to see your data calendar</div>';
    return;
  }

  const uploadedSet = new Set(allUploaded);
  const logSet      = new Set(logDates);
  const monthNames  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Build set of all months between first and last date
  const first = allKnown[0], last = allKnown[allKnown.length-1];
  const months = [];
  let cy=+first.slice(0,4), cm=+first.slice(4,6);
  const ly=+last.slice(0,4),  lm=+last.slice(4,6);
  while(cy*100+cm <= ly*100+lm) {
    months.push(`${cy}${String(cm).padStart(2,'0')}`);
    if(++cm>12){cm=1;cy++;}
  }
  months.reverse(); // newest first

  let html = '';
  months.forEach(mo => {
    const year=+mo.slice(0,4), month=+mo.slice(4,6)-1;
    const firstDay = new Date(year,month,1);
    const lastDay  = new Date(year,month+1,0);
    const startOffset = firstDay.getDay()===0 ? 6 : firstDay.getDay()-1; // Mon-based

    let uploaded=0, gaps=0, logOnly=0;
    let cells = '';
    for(let i=0;i<startOffset;i++) cells += '<div></div>';
    for(let d=1;d<=lastDay.getDate();d++){
      const ds = `${year}${String(month+1).padStart(2,'0')}${String(d).padStart(2,'0')}`;
      const isUp  = uploadedSet.has(ds);
      const isLog = logSet.has(ds) && !isUp;
      const isTrd = isNSETradingDay(ds);
      const isHol = NSE_HOLIDAYS.has(ds);
      const isWkd = !isTrd && !isHol;
      const isMiss= isTrd && !isUp && !isLog;

      if(isTrd) { if(isUp) uploaded++; else if(isLog) logOnly++; else gaps++; }

      const logs = dayLog[ds];
      const tips = isUp   ? `${ds} ✓ Uploaded (${logs?.stock_count||''}${logs?.top_signals?.length?' · '+logs.top_signals.slice(0,2).join(', '):''})` :
                   isLog  ? `${ds} In history log` :
                   isHol  ? `${ds} NSE Holiday` :
                   isWkd  ? `${ds} Weekend` : `${ds} Missing — download this`;

      let cls = isUp ? 'cal-uploaded' : isLog ? 'cal-logonly' : isHol||isWkd ? 'cal-off' : 'cal-missing';
      cells += `<div class="cal-day ${cls}" title="${tips}">${d}${isUp?'<div class="cal-dot"></div>':''}</div>`;
    }

    html += `
    <div class="cal-month-block">
      <div class="cal-month-header">
        <span class="cal-month-name">${monthNames[month]} ${year}</span>
        <div class="cal-month-stats">
          <span class="cal-stat green">${uploaded}✓</span>
          ${logOnly>0?`<span class="cal-stat blue">${logOnly}📋</span>`:''}
          ${gaps>0?`<span class="cal-stat red">${gaps} missing</span>`:'<span class="cal-stat green">complete</span>'}
        </div>
      </div>
      <div class="cal-dow-header"><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div><div>S</div></div>
      <div class="cal-grid">${cells}</div>
    </div>`;
  });

  const expectedAll = getExpectedTradingDays(first, last);
  const totalGaps   = expectedAll.filter(d=>!uploadedSet.has(d)&&!logSet.has(d)).length;

  calEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;font-size:0.65rem;color:var(--text2);">
      <span><span class="cal-legend-dot" style="background:var(--accent2);"></span> Uploaded</span>
      <span><span class="cal-legend-dot" style="background:rgba(26,92,255,0.3);"></span> History only</span>
      <span><span class="cal-legend-dot" style="background:var(--danger);"></span> Missing</span>
      <span><span class="cal-legend-dot" style="background:var(--border);"></span> Holiday/Weekend</span>
    </div>
    <div style="font-size:0.72rem;padding:10px 12px;background:var(--bg3);border-radius:8px;margin-bottom:12px;">
      📊 <strong>${allUploaded.length} days with full data</strong> &nbsp;·&nbsp;
      ${Object.keys(dayLog).length} in history log &nbsp;·&nbsp;
      ${totalGaps>0?`<span style="color:var(--danger);">${totalGaps} gaps to fill</span>`:'<span style="color:var(--accent2);">No gaps in your range ✓</span>'}
    </div>
    ${html}`;
}


function handleDrop(e) {
  e.preventDefault();
  handleFileUpload(e.dataTransfer.files);
}

function handleFileUpload(files) {
  if (!files || files.length === 0) return;
  let pending = files.length;

  const dropZone = document.getElementById('drop-zone');
  if (dropZone) dropZone.innerHTML = `<div style="font-size:1.5rem;margin-bottom:8px;">⏳</div><div style="font-weight:700;color:var(--accent);">Loading ${files.length} file${files.length>1?'s':''}...</div>`;

  Array.from(files).forEach(file => {
    const isXlsx = /\.(xlsx|xls)$/i.test(file.name);

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = e => {
        parseUDiFFXlsx(e.target.result, file.name);
        if (!uploadedFileNames.includes(file.name)) uploadedFileNames.push(file.name);
        pending--;
        if (pending === 0) finishUpload(dropZone);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = e => {
        parseNSEBhavcopy(e.target.result, file.name);
        if (!uploadedFileNames.includes(file.name)) uploadedFileNames.push(file.name);
        pending--;
        if (pending === 0) finishUpload(dropZone);
      };
      reader.readAsText(file);
    }
  });
}

async function finishUpload(dropZone) {
  if (dropZone) dropZone.innerHTML = `<div style="font-size:2.5rem;margin-bottom:10px;">📁</div><div style="font-weight:700;color:var(--text);font-size:0.9rem;margin-bottom:4px;">Tap to browse files</div><div style="font-size:0.7rem;color:var(--text3);">Supports new <strong style="color:var(--accent);">.xlsx</strong> UDiFF format &amp; old .csv format</div>`;
  renderUploadedFiles(true);
  await saveNSEToStorage();

  // Log each uploaded date to the permanent day log
  const allDates = Object.keys(nseDataByDate).filter(k=>!k.startsWith('UNKNOWN')).sort();
  for (const datekey of allDates) {
    const dayData = nseDataByDate[datekey];
    const stockCount = Object.keys(dayData).length;
    // Top 3 stocks by volume for the log (we'll record them when analysis runs)
    await logDayUpload(datekey, stockCount, []);
    await logUploadHistory(uploadedFileNames[uploadedFileNames.length-1]||'', datekey, stockCount);
  }

  renderDataCalendar();
  document.getElementById('csv-upload').value = '';
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
      // Average volume of all days EXCEPT today
      const pastVols = hist.slice(0, -1).map(d => d.vol).filter(v => v > 0);
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
      // RSI filter: skip overbought (>80) — avoid chasing extended moves
      if (rsi !== null && rsi > 80) return;
      // RSI filter: skip weak momentum (<50) — need confirmed uptrend
      if (rsi !== null && rsi < 50) return;
    }

    // ---- Moving averages ----
    let ma5 = null, ma20 = null, maCross = '—';
    if (n >= 5)  ma5  = hist.slice(-5).reduce((s,d)=>s+d.close,0)  / 5;
    if (n >= 20) {
      ma20     = hist.slice(-20).reduce((s,d)=>s+d.close,0) / 20;
      maCross  = (today.close > ma20) ? 'Above MA20 ✓' : 'Below MA20';
      // If below MA20 and we have enough data, it's a weak setup — penalise later
    }

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
    const rrMultiplier = (rsi !== null && rsi >= 55 && maCross.includes('✓')) ? 2.0 : 1.5;
    const target = +(today.close + riskPerShare * rrMultiplier).toFixed(2);

    // ---- Actual R:R ----
    const rrRaw = ((target - today.close) / riskPerShare).toFixed(1);
    const rr    = +rrRaw;

    // ---- Hard R:R filter ----
    if (rr < MIN_RR) return;

    // ---- Position sizing (2% rule) ----
    const maxRisk = capital * 0.02;
    const shares  = riskPerShare > 0 ? Math.floor(maxRisk / riskPerShare) : 0;
    if (shares < 1) return; // can't even buy 1 share with 2% rule

    // ---- Breakout Score ----
    let score = 0;
    if (changePct >= 1)   score += 15;
    if (changePct >= 2)   score += 10;
    if (volRatio !== null && volRatio >= 1.5) score += 25;
    if (volRatio !== null && volRatio >= 2.5) score += 10;
    if (rsi !== null && rsi >= 50 && rsi <= 75) score += 15;
    if (nearHigh)                               score += 10;
    if (consolidation.includes('✓'))            score += 15;
    if (maCross.includes('✓'))                  score += 10;
    score = Math.min(score, 98);

    // ---- Minimum score gate ----
    if (score < MIN_SCORE) return;

    // ---- Target % for display ----
    const targetPct = +((target - today.close) / today.close * 100).toFixed(1);
    const slPct     = +((today.close - sl) / today.close * 100).toFixed(1);

    results.push({
      sym,
      close:        today.close,
      changePct:    +changePct.toFixed(2),
      volRatio,
      rsi,
      maCross,
      consolidation,
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

  renderNSETable(results, latestDate, allDates.length);
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

function formatDateKey(key) {
  if (!key || key.startsWith('UNKNOWN')) return 'Unknown date';
  // key is YYYYMMDD
  const y = key.substring(0,4), m = key.substring(4,6), d = key.substring(6,8);
  const months = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[+m] || m} ${y}`;
}


function showNotif(title, msg, isError) {
  const n = document.getElementById('notification');
  document.getElementById('notif-title').textContent = title;
  document.getElementById('notif-msg').textContent = msg;
  n.style.borderColor = isError ? 'var(--danger)' : 'var(--accent2)';
  n.style.color = isError ? 'var(--danger)' : 'var(--accent2)';
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 3000);
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
  const payload = { watchlist, trades, updatedAt: Date.now(), device: navigator.userAgent.substring(0, 40) };
  const res = await fetch(gistAPIUrl(), {
    method: 'PATCH',
    headers: ghHeaders(),
    body: JSON.stringify({ files: { 'breakoutiq.json': { content: JSON.stringify(payload) } } })
  });
  if (!res.ok) throw new Error('Push failed: ' + res.status);
}

async function pullFromGithub(cb) {
  const res = await fetch(gistAPIUrl(), { headers: ghHeaders() });
  if (!res.ok) throw new Error('Pull failed: ' + res.status);
  const gist = await res.json();
  const raw  = gist.files && gist.files['breakoutiq.json'] && gist.files['breakoutiq.json'].content;
  if (!raw || raw === '{}') { if (cb) cb(); return; }

  let data;
  try { data = JSON.parse(raw); } catch(e) { if (cb) cb(); return; }

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
      const localIds = new Set(trades.map(t => t.id));
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

// ===================== SCAN MODE =====================
let currentScanMode = 'breakout'; // 'breakout' | 'coil'

function setScanMode(mode, btn) {
  currentScanMode = mode;
  document.querySelectorAll('.scan-mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const analyseBtn = document.getElementById('analyse-btn');
  const title = document.getElementById('nse-results-title');
  if (mode === 'coil') {
    analyseBtn.textContent = '🌀 FIND COILING STOCKS';
    analyseBtn.style.background = 'linear-gradient(135deg,#7c3aed,#4f46e5)';
    if (title) title.textContent = '🌀 PRE-BREAKOUT SETUPS';
  } else {
    analyseBtn.textContent = '⚡ ANALYSE DATA';
    analyseBtn.style.background = '';
    if (title) title.textContent = '📊 BREAKOUT SIGNALS';
  }
  // Hide old results when switching
  const wrap = document.getElementById('nse-results-wrap');
  if (wrap) wrap.style.display = 'none';
}

function runScan() {
  if (currentScanMode === 'coil') analyzeCoilStocks();
  else analyzeNSEData();
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
    const expectedMovePct = range5 <= 3 ? 0.12 : range5 <= 5 ? 0.10 : 0.08;
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

    results.push({
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
  renderCoilTable(results, latestDate, numDays);
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

// ===================== WEEKLY WATCHLIST =====================
let weeklyCandidates = JSON.parse(localStorage.getItem('breakoutiq_weekly') || '[]');

function addWeeklyCandidate() {
  const sym     = (document.getElementById('wl-sym').value   || '').toUpperCase().trim();
  const price   = +document.getElementById('wl-price').value;
  const entry   = +document.getElementById('wl-entry').value   || price;
  const sl      = +document.getElementById('wl-sl').value;
  const target  = +document.getElementById('wl-target').value;
  const conv    = document.getElementById('wl-conv').value;
  const trigger = document.getElementById('wl-trigger').value.trim();
  const setup   = document.getElementById('wl-setup').value;
  const hasResults = document.getElementById('wl-results-risk').checked;

  if (!sym || !price) { showNotif('Missing Info', 'Symbol and Price are required', true); return; }

  // Check if already in list
  if (weeklyCandidates.find(c => c.sym === sym)) {
    showNotif('Already Added', sym + ' is already in your weekly plan', true); return;
  }

  const rr = sl > 0 && target > 0 ? +((target - entry) / (entry - sl)).toFixed(1) : null;
  const candidate = {
    id: Date.now(), sym, price, entry, sl, target, conv, trigger, setup,
    hasResults, rr, addedAt: new Date().toLocaleDateString('en-IN')
  };

  weeklyCandidates.unshift(candidate);
  saveWeeklyCandidates();
  renderWeeklyCandidates();

  // Clear form
  ['wl-sym','wl-price','wl-entry','wl-sl','wl-target','wl-trigger'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('wl-results-risk').checked = false;
  document.getElementById('wl-conv').value = 'high';
  showNotif('Added ✓', sym + ' added to weekly plan');
}

function prefillWeeklyCandidate(data) {
  // Switch to weekly tab and prefill form
  document.querySelector('[onclick*="weekly"]').click();
  setTimeout(() => {
    document.getElementById('wl-sym').value    = data.sym;
    document.getElementById('wl-price').value  = data.close;
    document.getElementById('wl-entry').value  = data.entry;
    document.getElementById('wl-sl').value     = data.sl;
    document.getElementById('wl-target').value = data.target;
    // Open the add form panel
    const body = document.getElementById('add-candidate-body');
    if (body && !body.classList.contains('open')) {
      document.getElementById('add-candidate-btn').click();
    }
    // Auto-set trigger note
    document.getElementById('wl-trigger').value = `Break above ₹${data.entry} on volume surge`;
    showNotif('Prefilled ✓', 'Review and tap "Add to Weekly Plan"');
  }, 200);
}

function removeWeeklyCandidate(id) {
  weeklyCandidates = weeklyCandidates.filter(c => c.id !== id);
  saveWeeklyCandidates();
  renderWeeklyCandidates();
}

function clearWeeklyCandidates() {
  if (!confirm('Clear all weekly candidates? This resets the list for next week.')) return;
  weeklyCandidates = [];
  saveWeeklyCandidates();
  renderWeeklyCandidates();
  showNotif('Cleared', 'Weekly list reset — ready for next weekend');
}

function saveWeeklyCandidates() {
  localStorage.setItem('breakoutiq_weekly', JSON.stringify(weeklyCandidates));
}

function renderWeeklyCandidates() {
  const list     = document.getElementById('wl-list');
  const empty    = document.getElementById('wl-empty');
  const clearWrap= document.getElementById('wl-clear-wrap');
  const countEl  = document.getElementById('wl-count');
  const highEl   = document.getElementById('wl-high-count');
  const warnEl   = document.getElementById('wl-results-warn');
  const globalWarn = document.getElementById('results-global-warn');

  const total    = weeklyCandidates.length;
  const highConv = weeklyCandidates.filter(c => c.conv === 'high').length;
  const withResults = weeklyCandidates.filter(c => c.hasResults).length;

  countEl.textContent = total;
  highEl.textContent  = highConv;
  warnEl.textContent  = withResults;

  if (total === 0) {
    empty.style.display = 'block';
    list.innerHTML = '';
    clearWrap.style.display = 'none';
    globalWarn.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  clearWrap.style.display = 'block';

  // Show global results warning if any candidate has results risk
  globalWarn.style.display = withResults > 0 ? 'flex' : 'none';
  if (withResults > 0) {
    document.getElementById('results-warn-text').textContent =
      `${withResults} candidate${withResults>1?'s have':' has'} results expected this week. Check NSE calendar before placing GTT orders — avoid or reduce position size.`;
  }

  const convLabels = { high: 'High Conv.', med: 'Medium', low: 'Watchlist' };
  const convClass  = { high: 'high', med: 'med', low: 'low' };
  const setupIcons = { coil:'🌀', pullback:'↩️', momentum:'⚡', reversal:'🔄' };

  list.innerHTML = weeklyCandidates.map(c => {
    const rrStr    = c.rr !== null ? `1:${c.rr}` : '—';
    const rrColor  = c.rr >= 2 ? 'var(--accent2)' : c.rr >= 1.5 ? 'var(--warn)' : 'var(--text2)';
    const tgtPct   = c.entry > 0 && c.target > 0 ? +((c.target-c.entry)/c.entry*100).toFixed(1) : null;
    const slPct    = c.entry > 0 && c.sl > 0      ? +((c.entry-c.sl)/c.entry*100).toFixed(1)    : null;

    return `
    <div class="weekly-candidate-card">
      <div class="wc-header">
        <div>
          <div class="wc-sym">${setupIcons[c.setup]||'📊'} ${c.sym}</div>
          <div class="wc-added">Added ${c.addedAt}</div>
        </div>
        <span class="wc-badge ${convClass[c.conv]}">${convLabels[c.conv]}</span>
      </div>

      ${c.hasResults ? `<div class="wc-results-warn" style="display:block;">⚠️ Results risk this week — verify before entering</div>` : ''}

      <div class="wc-grid">
        <div class="wc-metric">
          <div class="wc-m-label">Current</div>
          <div class="wc-m-val">₹${c.price.toLocaleString('en-IN')}</div>
        </div>
        <div class="wc-metric">
          <div class="wc-m-label">Entry @</div>
          <div class="wc-m-val" style="color:var(--accent);">₹${c.entry > 0 ? c.entry.toLocaleString('en-IN') : '—'}</div>
        </div>
        <div class="wc-metric">
          <div class="wc-m-label">R:R</div>
          <div class="wc-m-val" style="color:${rrColor};">${rrStr}</div>
        </div>
        <div class="wc-metric">
          <div class="wc-m-label">Target${tgtPct?` +${tgtPct}%`:''}</div>
          <div class="wc-m-val" style="color:var(--accent2);">₹${c.target > 0 ? c.target.toLocaleString('en-IN') : '—'}</div>
        </div>
        <div class="wc-metric">
          <div class="wc-m-label">Stop${slPct?` -${slPct}%`:''}</div>
          <div class="wc-m-val" style="color:var(--danger);">₹${c.sl > 0 ? c.sl.toLocaleString('en-IN') : '—'}</div>
        </div>
        <div class="wc-metric">
          <div class="wc-m-label">Setup</div>
          <div class="wc-m-val" style="font-size:0.7rem;">${setupIcons[c.setup]||''} ${c.setup}</div>
        </div>
      </div>

      ${c.trigger ? `<div class="wc-trigger"><strong>Entry trigger:</strong> ${c.trigger}</div>` : ''}

      <div class="wc-actions">
        <button class="btn btn-secondary flex-1" style="padding:8px;font-size:0.7rem;min-height:38px;" onclick="logWeeklyToJournal(${c.id})">📒 Log Trade</button>
        <button class="btn btn-secondary" style="padding:8px 14px;font-size:0.7rem;min-height:38px;color:var(--danger);" onclick="removeWeeklyCandidate(${c.id})">✕</button>
      </div>
    </div>`;
  }).join('');
}

function logWeeklyToJournal(id) {
  const c = weeklyCandidates.find(x => x.id === id);
  if (!c) return;
  // Switch to journal tab and prefill
  document.querySelector('[onclick*="journal"]').click();
  setTimeout(() => {
    document.getElementById('j-stock').value  = c.sym;
    document.getElementById('j-entry').value  = c.entry || c.price;
    document.getElementById('j-sl').value     = c.sl || '';
    document.getElementById('j-target').value = c.target || '';
    document.getElementById('j-notes').value  = `Weekly plan: ${c.trigger || c.setup}`;
    document.getElementById('j-date').value   = new Date().toISOString().slice(0,10);
    showNotif('Prefilled ✓', 'Set quantity and tap Log Trade');
  }, 200);
}

// ===================== WIDER TARGETS FOR WEEKLY =====================
// Update analyzeNSEData target calculation for weekly mode
// The existing analyzeNSEData is for breakout mode (already moved today)
// For coil stocks we use 8-12% in analyzeCoilStocks above
// Here we patch the scoring to show weekly context if called from weekly tab



// Migrate old Firebase localStorage keys (one-time)
(function migrateFromFirebase() {
  const oldUrl  = localStorage.getItem('breakoutiq_fb_url');
  const oldCode = localStorage.getItem('breakoutiq_sync_code');
  if (oldUrl)  localStorage.removeItem('breakoutiq_fb_url');
  if (oldCode) localStorage.removeItem('breakoutiq_sync_code');
})();

// Load saved NSE data on startup
loadNSEFromStorage();

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
