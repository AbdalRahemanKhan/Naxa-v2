// app.js — NAXA Terminal Main Orchestrator

document.addEventListener('DOMContentLoaded', async () => {
  N.profile.sessions = (N.profile.sessions || 0) + 1;
  localStorage.setItem('naxa_profile', JSON.stringify(N.profile));

  loadCfgUI();
  startClock();
  wireNav();
  wireModals();
  renderCommodities();
  renderWatchlist();
  renderTradeList();
  initMomo();
  initMap();
  initAgentsView();
  initCorrelations();

  // Load signals
  setStatus('Syncing signals...');
  N.signals = await loadSignals() || CURATED;
  renderSignalList(N.signals);
  document.getElementById('sig-count').textContent = `${N.signals.length} active`;
  setStatus('Agents active');

  // Auto-select highest conviction signal
  const top = [...N.signals].sort((a, b) => (b.conviction || 0) - (a.conviction || 0))[0];
  if (top) selectSignal(top);

  // Refresh commodities periodically
  setInterval(renderCommodities, 90000);
});

// ── SIGNAL LIST ───────────────────────────────────────────────
function renderSignalList(signals) {
  const el = $('signal-list');
  el.innerHTML = '';
  const list = N.filter === 'all' ? signals : signals.filter(s => s.category === N.filter);
  if (!list.length) { el.innerHTML = '<div class="empty-msg">No signals in this category.</div>'; return; }

  list.forEach((sig, i) => {
    const card = document.createElement('div');
    card.className = `sig-card u-${sig.urgency}`;
    card.id = 'sc-' + sig.id;

    const convColor = sig.conviction >= 80 ? 'var(--accent)' : sig.conviction >= 65 ? 'var(--watch)' : 'var(--muted)';
    const urgLabel = { immediate: 'NOW', short_term: 'SOON', medium_term: 'WATCH' }[sig.urgency] || sig.urgency.toUpperCase();
    card.innerHTML = `
      <div class="sc-top">
        <span class="sc-cat">${sig.category}</span>
        <span class="sc-badge sb-${sig.urgency}">${urgLabel}</span>
      </div>
      <div class="sc-hed">${sig.headline}</div>
      <div class="sc-bar"><div class="sc-bar-fill" style="width:${sig.conviction}%;background:${convColor}"></div></div>
      <div class="sc-meta"><span>${sig.source_type || 'NAXA'}</span><span>${timeAgo(sig.analyzed_at)}</span></div>`;
    card.style.animationDelay = `${i * 30}ms`;
    card.addEventListener('click', () => selectSignal(sig));
    el.appendChild(card);
  });
}

function selectSignal(sig) {
  document.querySelectorAll('.sig-card').forEach(c => c.classList.remove('selected'));
  const card = $('sc-' + sig.id);
  if (card) { card.classList.add('selected'); card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  N.active = sig;
  renderInsight(sig);
}

// ── INSIGHT RENDERER ──────────────────────────────────────────
function renderInsight(sig) {
  $('placeholder').style.display = 'none';
  const pane = $('insight-pane');
  pane.style.display = 'block';

  const urgColor = { immediate: 'var(--now)', short_term: 'var(--soon)', medium_term: 'var(--watch)' }[sig.urgency];
  const urgLabel = { immediate: '⚡ IMMEDIATE', short_term: '⏱ SHORT TERM', medium_term: '📡 MEDIUM TERM' }[sig.urgency];
  const convClass = sig.conviction >= 80 ? 'conv-hi' : sig.conviction >= 65 ? 'conv-md' : 'conv-lo';

  pane.innerHTML = `
    <div class="iv-eyebrow">NAXA · ${sig.category.toUpperCase()} · Intelligence Briefing</div>
    <h1 class="iv-title">${sig.headline}</h1>
    <div class="iv-meta-row">
      <span class="iv-badge" style="color:var(--accent);border-color:var(--accent-dim);background:var(--accent-pale)">${sig.category.toUpperCase()}</span>
      <span class="iv-badge" style="color:${urgColor};border-color:${urgColor}44;background:${urgColor}11">${urgLabel}</span>
      <div class="conv-circle ${convClass}">${sig.conviction}</div>
      ${sig.lead_lag_days ? `<span style="font-family:var(--mono);font-size:10px;color:var(--muted)">⏱ ~${sig.lead_lag_days}d lag</span>` : ''}
      <span style="font-family:var(--mono);font-size:9px;color:var(--muted2);margin-left:auto">${timeAgo(sig.analyzed_at)}</span>
    </div>

    ${renderWhatHappened(sig)}
    ${renderChain(sig)}
    ${renderOrders(sig)}
    ${renderInstruments(sig)}
    ${renderSources(sig)}`;
}

function renderWhatHappened(sig) {
  return `<div class="iv-sec">
    <div class="iv-sec-head">What Happened</div>
    <div class="iv-text">${fmt(sig.what_happened)}</div>
  </div>`;
}

function renderChain(sig) {
  const chain = sig.supply_chain || [];
  if (!chain.length) return '';
  const preview = chain.slice(0, 5);
  const nodes = preview.map((n, i) => {
    const dc = `cnode-${n.direction}`;
    const ic = `cn-${n.direction}`;
    const sym = n.direction === 'up' ? '▲' : n.direction === 'down' ? '▼' : '—';
    return `<div class="chain-node ${dc}" onclick="showFullChain()" title="Click to expand full chain">
      <div class="cn-stage">Stage ${n.stage}</div>
      <div class="cn-entity">${n.entity}</div>
      <div class="cn-impact ${ic}">${sym} ${n.impact}</div>
    </div>${i < preview.length - 1 ? '<div class="chain-arrow">→</div>' : ''}`;
  }).join('');

  return `<div class="iv-sec">
    <div class="iv-sec-head">Supply Chain Trace
      <button onclick="showFullChain()" style="font-family:var(--mono);font-size:9px;background:none;border:1px solid var(--border);color:var(--accent);padding:2px 8px;cursor:pointer;border-radius:2px">All ${chain.length} stages →</button>
    </div>
    <div class="chain-scroll"><div class="chain-flow">${nodes}</div></div>
    ${chain.length > 5 ? `<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:5px">+ ${chain.length - 5} more stages</div>` : ''}
  </div>`;
}

function renderOrders(sig) {
  const second = Array.isArray(sig.second_order) ? sig.second_order : [sig.second_order];
  const sBlocks = second.filter(Boolean).map(s =>
    `<div class="order-block second"><div class="ob-label">⚡ SECOND ORDER</div><div class="ob-text">${fmt(s)}</div></div>`
  ).join('');
  const tBlock = sig.third_order
    ? `<div class="order-block third"><div class="ob-label">🔮 THIRD ORDER — Peter Gregory Signal</div><div class="ob-text">${fmt(sig.third_order)}</div></div>`
    : '';
  return `<div class="iv-sec"><div class="iv-sec-head">Downstream Effects</div>${sBlocks}${tBlock}</div>`;
}

function renderInstruments(sig) {
  const inst = sig.instruments || [];
  if (!inst.length) return '';
  const typeColors = {
    equity: 'var(--accent)', futures: 'var(--watch)',
    etf: '#3a6fa8', currency: '#8b4513', crypto: '#b36200'
  };
  const cards = inst.map(i => `
    <div class="inst-card">
      <div class="inst-type" style="color:${typeColors[i.type] || 'var(--muted)'}">${(i.type||'equity').toUpperCase()}</div>
      <div class="inst-ticker">${i.ticker_or_name}</div>
      <div class="inst-reason">${i.reason}</div>
      <div class="inst-horizon">⏱ ${i.time_horizon}</div>
    </div>`).join('');
  return `<div class="iv-sec">
    <div class="iv-sec-head">Instruments to Watch</div>
    <div class="inst-grid">${cards}</div>
    <div style="font-family:var(--mono);font-size:9px;color:var(--muted2);margin-top:10px;line-height:1.6">
      ⚠ Intelligence analysis only — not financial advice. Always conduct your own research.
    </div>
  </div>`;
}

function renderSources(sig) {
  return `<div class="iv-sec">
    <div class="iv-sec-head">Sources & Metadata</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <span style="font-family:var(--mono);font-size:9px;background:var(--paper2);border:1px solid var(--border);padding:2px 8px;color:var(--muted)">${sig.source_type || 'NAXA'}</span>
      <span style="font-family:var(--mono);font-size:9px;background:var(--paper2);border:1px solid var(--border);padding:2px 8px;color:var(--muted)">Analyzed ${timeAgo(sig.analyzed_at)}</span>
      ${sig.lead_lag_days ? `<span style="font-family:var(--mono);font-size:9px;background:var(--accent-pale);border:1px solid var(--accent-dim);padding:2px 8px;color:var(--accent)">~${sig.lead_lag_days}d lead-lag</span>` : ''}
    </div>
  </div>`;
}

// ── FULL CHAIN MODAL ──────────────────────────────────────────
window.showFullChain = function () {
  const sig = N.active;
  if (!sig) return;
  $('chain-modal-title').textContent = sig.headline;
  const body = $('chain-modal-body');
  const chain = sig.supply_chain || [];
  body.innerHTML = `
    <div style="font-size:13px;color:var(--ink3);line-height:1.7;margin-bottom:16px">${sig.what_happened}</div>
    <div style="display:flex;flex-direction:column;gap:3px">
      ${chain.map((n, i) => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--paper2);border:1px solid var(--border);border-left:4px solid ${n.direction==='up'?'var(--accent)':n.direction==='down'?'var(--now)':'var(--muted2)'}">
          <div style="font-family:var(--mono);font-size:11px;color:var(--muted);min-width:18px">${n.stage}</div>
          <div style="flex:1">
            <div style="font-family:var(--mono);font-size:8px;color:var(--muted);letter-spacing:.1em;margin-bottom:3px">${getStageLabel(parseInt(n.stage), chain.length)}</div>
            <div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:3px">${n.entity}</div>
            <div style="font-size:12px;color:var(--ink3);line-height:1.5">${n.impact}</div>
          </div>
          <div style="font-size:16px">${n.direction==='up'?'▲':n.direction==='down'?'▼':'—'}</div>
        </div>
        ${i < chain.length - 1 ? '<div style="width:3px;height:10px;background:var(--border);margin:0 18px"></div>' : ''}`
      ).join('')}
    </div>
    ${sig.third_order ? `<div style="margin-top:20px;padding:14px 16px;background:var(--paper2);border:1px solid var(--border);border-left:3px solid var(--accent)">
      <div style="font-family:var(--mono);font-size:9px;color:var(--accent);letter-spacing:.15em;margin-bottom:6px">THIRD ORDER SIGNAL</div>
      <div style="font-size:13px;color:var(--ink2);line-height:1.75">${sig.third_order}</div>
    </div>` : ''}`;
  $('chain-modal').style.display = 'flex';
};

function getStageLabel(stage, total) {
  if (stage === 1) return 'SOURCE / ORIGIN';
  if (stage === total) return 'END IMPACT';
  if (stage <= Math.ceil(total / 3)) return 'UPSTREAM';
  if (stage >= Math.floor(total * 2 / 3)) return 'DOWNSTREAM';
  return 'MIDSTREAM';
}

// ── WATCHLIST ─────────────────────────────────────────────────
function renderWatchlist() {
  const el = $('watchlist-section');
  if (!el) return;
  if (!N.watchlist.length) {
    el.innerHTML = '<div style="font-family:var(--mono);font-size:9px;color:var(--muted2);padding:10px 14px">No instruments watched yet.</div>';
    return;
  }
  el.innerHTML = N.watchlist.map((w, i) => `
    <div class="watch-item">
      <span class="watch-ticker">${w.ticker}</span>
      <span class="watch-thesis">${w.thesis}</span>
      <span class="watch-remove" onclick="removeWatch(${i})">✕</span>
    </div>`).join('');
}

window.removeWatch = function (i) {
  N.watchlist.splice(i, 1);
  localStorage.setItem('naxa_watchlist', JSON.stringify(N.watchlist));
  renderWatchlist();
};

function saveWatch() {
  const ticker = $('w-ticker').value.trim();
  const thesis = $('w-thesis').value.trim();
  if (!ticker) return;
  N.watchlist.push({ ticker, thesis, addedAt: new Date().toISOString(), signalId: N.active?.id });
  localStorage.setItem('naxa_watchlist', JSON.stringify(N.watchlist));
  $('watch-modal').style.display = 'none';
  $('w-ticker').value = ''; $('w-thesis').value = '';
  renderWatchlist();
  addMomoMsg('Momo', `${ticker} added to your watchlist. I\'ll flag it if a related signal changes.`);
}

// ── NAV WIRING ────────────────────────────────────────────────
function wireNav() {
  // Filter pills
  document.querySelectorAll('.fpill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.fpill').forEach(p => p.classList.remove('on'));
      pill.classList.add('on');
      N.filter = pill.dataset.cat;
      renderSignalList(N.signals);
    });
  });

  // View buttons
  $('btn-map-view').addEventListener('click', () => openView('view-map'));
  $('btn-corr-view').addEventListener('click', () => openView('view-corr'));
  $('btn-agents-view').addEventListener('click', () => { openView('view-agents'); startAgentAnimations(); });
  $('btn-ig-view').addEventListener('click', () => openView('view-ig'));
  $('btn-journal-view').addEventListener('click', () => { openView('view-journal'); renderBetSummary(); });
  $('btn-config').addEventListener('click', () => { $('config-modal').style.display = 'flex'; });

  // Back buttons
  ['map-back','corr-back','agents-back','ig-back','journal-back'].forEach(id => {
    $(id).addEventListener('click', () => closeViews());
  });

  // Refresh commodities
  $('btn-refresh-com').addEventListener('click', () => { renderCommodities(); });

  // Iron Gates
  $('btn-ig-run').addEventListener('click', () => runIronGates());
  $('ig-input').addEventListener('keydown', e => { if (e.key === 'Enter') runIronGates(); });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeViews(); closeModals(); }
    if (e.key === 'ArrowDown' && !e.target.matches('input,textarea,select')) { e.preventDefault(); navigateSigs(1); }
    if (e.key === 'ArrowUp' && !e.target.matches('input,textarea,select')) { e.preventDefault(); navigateSigs(-1); }
  });
}

function openView(id) {
  document.querySelectorAll('.view-overlay').forEach(v => v.classList.remove('open'));
  $(id)?.classList.add('open');
  document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
  const btnMap = { 'view-map': 'btn-map-view', 'view-corr': 'btn-corr-view', 'view-agents': 'btn-agents-view', 'view-ig': 'btn-ig-view', 'view-journal': 'btn-journal-view' };
  if (btnMap[id]) $(btnMap[id])?.classList.add('active');
}

function closeViews() {
  document.querySelectorAll('.view-overlay').forEach(v => v.classList.remove('open'));
  document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
}

function closeModals() {
  document.querySelectorAll('.modal-bg').forEach(m => m.style.display = 'none');
}

function navigateSigs(dir) {
  const sigs = N.signals;
  if (!sigs.length) return;
  const idx = N.active ? sigs.findIndex(s => s.id === N.active.id) : -1;
  const next = sigs[Math.max(0, Math.min(sigs.length - 1, idx + dir))];
  if (next && next.id !== N.active?.id) {
    selectSignal(next);
    $('sc-' + next.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// ── MODALS ────────────────────────────────────────────────────
function wireModals() {
  // Config
  $('cfg-close').addEventListener('click', () => $('config-modal').style.display = 'none');
  $('cfg-save').addEventListener('click', saveConfig);
  // Chain
  $('chain-close').addEventListener('click', () => $('chain-modal').style.display = 'none');
  // Watch
  $('watch-close').addEventListener('click', () => $('watch-modal').style.display = 'none');
  $('btn-watchlist-add').addEventListener('click', () => {
    if (N.active) $('w-ticker').value = N.active.instruments?.[0]?.ticker_or_name || '';
    $('watch-modal').style.display = 'flex';
  });
  $('w-save').addEventListener('click', saveWatch);
  // Trade
  $('trade-close').addEventListener('click', () => $('trade-modal').style.display = 'none');
  $('btn-new-trade').addEventListener('click', () => $('trade-modal').style.display = 'flex');
  $('tj-save').addEventListener('click', saveTrade);
  // Click outside
  document.querySelectorAll('.modal-bg').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
  });
}

// ── CONFIG ────────────────────────────────────────────────────
function loadCfgUI() {
  if (N.groq) $('cfg-groq').value = N.groq;
  if (N.currents) $('cfg-currents').value = N.currents;
  if (N.email) $('cfg-email').value = N.email;
}

function saveConfig() {
  const g = $('cfg-groq').value.trim();
  const c = $('cfg-currents').value.trim();
  const e = $('cfg-email').value.trim();
  if (g) localStorage.setItem('naxa_groq', g);
  if (c) localStorage.setItem('naxa_currents', c);
  if (e) localStorage.setItem('naxa_email', e);
  $('cfg-ok').textContent = '✓ Saved. Refreshing signals...';
  setTimeout(async () => {
    $('config-modal').style.display = 'none';
    $('cfg-ok').textContent = '';
    N.signals = await loadSignals() || CURATED;
    renderSignalList(N.signals);
    if (N.signals[0]) selectSignal(N.signals[0]);
  }, 1000);
}

// ── CLOCK ─────────────────────────────────────────────────────
function startClock() {
  const tick = () => { const el = $('clock'); if (el) el.textContent = new Date().toUTCString().slice(17, 25) + ' UTC'; };
  tick(); setInterval(tick, 1000);
}

function setStatus(txt) { const el = $('agent-status-txt'); if (el) el.textContent = txt; }

// ── TEXT FORMATTING ───────────────────────────────────────────
function fmt(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(\d+\.?\d*%)/g, '<strong>$1</strong>')
    .replace(/(\$[\d,]+[BMKt]?)/g, '<strong>$1</strong>');
}

// ── HELPER ────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
window.$ = $; // make accessible to other scripts
