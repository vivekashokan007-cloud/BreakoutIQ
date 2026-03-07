// ===================== WEEKLY WATCHLIST =====================
// Weekend GTT planning: add candidates, render cards, log to journal

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
