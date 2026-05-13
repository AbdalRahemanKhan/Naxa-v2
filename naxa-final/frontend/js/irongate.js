// irongate.js
const IG_SYS = `You are NAXA's Iron Gates analyst — trained at Berkshire, Citadel, MIT. Evaluate this stock on 6 gates.

Gates: MOAT (durable competitive advantage), MANAGEMENT (quality + capital allocation), FINANCIALS (margins, FCF, debt level), VALUATION (price vs intrinsic value), MACRO (sector tailwind 2-3yr), RISK (what breaks the thesis)

Respond ONLY in valid JSON:
{
  "ticker": "string",
  "company": "full company name",
  "score": 0-100,
  "verdict": "STRONG BUY|BUY|HOLD|AVOID|STRONG AVOID",
  "gates": [
    {"name":"MOAT","status":"PASS|WARN|FAIL","note":"max 18 words"},
    {"name":"MANAGEMENT","status":"PASS|WARN|FAIL","note":"max 18 words"},
    {"name":"FINANCIALS","status":"PASS|WARN|FAIL","note":"max 18 words"},
    {"name":"VALUATION","status":"PASS|WARN|FAIL","note":"max 18 words"},
    {"name":"MACRO","status":"PASS|WARN|FAIL","note":"max 18 words"},
    {"name":"RISK","status":"WARN","note":"primary downside risk, max 22 words"}
  ],
  "analyst_note": "One non-obvious insight about this company. Max 32 words.",
  "lead_lag_note": "If relevant supply chain signals affect this company, what is the timing? Max 20 words."
}`;

async function runIronGates() {
  const input = $('ig-input').value.trim();
  if (!input) return;
  const result = $('ig-result');
  result.innerHTML = '<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:16px 0">Finance Department evaluating...</div>';

  if (!N.groq) {
    result.innerHTML = `<div style="font-family:var(--mono);font-size:11px;color:var(--ink3);padding:12px 0;line-height:1.7">Add your free Groq key in <strong>⚙ Config</strong> to run Iron Gates analysis. Free at <a href="https://console.groq.com" target="_blank" style="color:var(--accent)">console.groq.com</a></div>`;
    return;
  }

  const reply = await callGroq([{ role: 'user', content: `Iron Gates evaluation: ${input}` }], IG_SYS, 750);
  const data = parseJSON(reply);

  if (!data) {
    result.innerHTML = `<div style="font-size:13px;color:var(--ink2);padding:12px 0;line-height:1.8">${reply || 'Evaluation failed. Check your Groq key.'}</div>`;
    return;
  }

  const sc = data.score >= 75 ? 'var(--accent)' : data.score >= 55 ? 'var(--watch)' : 'var(--now)';
  const vc = { 'STRONG BUY': 'var(--accent)', 'BUY': '#3d8a5a', 'HOLD': 'var(--watch)', 'AVOID': 'var(--soon)', 'STRONG AVOID': 'var(--now)' }[data.verdict] || 'var(--muted)';

  result.innerHTML = `
    <div class="ig-result">
      <div class="ig-score-row">
        <div class="ig-score-num" style="color:${sc}">${data.score}</div>
        <div>
          <div class="ig-verdict-txt" style="color:${vc}">${data.verdict}</div>
          <div class="ig-company">${data.company || data.ticker}</div>
        </div>
      </div>
      <div class="ig-gates">
        ${(data.gates || []).map(g => {
          const sc2 = g.status.toLowerCase();
          const sym = g.status === 'PASS' ? '✓' : g.status === 'FAIL' ? '✗' : '~';
          return `<div class="ig-gate ${sc2}">
            <div class="ig-gate-sym ${sc2}">${sym}</div>
            <div><div class="ig-gate-name">${g.name}</div><div class="ig-gate-note">${g.note}</div></div>
          </div>`;
        }).join('')}
      </div>
      ${data.analyst_note ? `<div class="ig-note">💡 ${data.analyst_note}</div>` : ''}
      ${data.lead_lag_note ? `<div class="ig-note" style="border-left-color:var(--watch);margin-top:8px">⏱ ${data.lead_lag_note}</div>` : ''}
      <div style="margin-top:14px">
        <button onclick="addToWatchFromIG('${data.ticker}','${(data.verdict||'').replace(/'/g,'')}')" style="font-family:var(--mono);font-size:10px;background:var(--accent-pale);border:1px solid var(--accent-dim);color:var(--accent);padding:6px 14px;cursor:pointer;border-radius:2px">+ Add ${data.ticker} to Watchlist</button>
      </div>
    </div>`;
}

window.addToWatchFromIG = function (ticker, verdict) {
  N.watchlist.push({ ticker, thesis: `Iron Gates: ${verdict}. Added from evaluation.`, addedAt: new Date().toISOString() });
  localStorage.setItem('naxa_watchlist', JSON.stringify(N.watchlist));
  renderWatchlist();
  addMomoMsg('Momo', `${ticker} added to watchlist with Iron Gates verdict: ${verdict}.`);
};

// ── journal.js ────────────────────────────────────────────────
async function saveTrade() {
  const ticker = $('tj-ticker').value.trim();
  const action = $('tj-action').value;
  const price = $('tj-price').value;
  const reason = $('tj-reason').value.trim();
  if (!ticker || !reason) return;

  $('tj-result').textContent = 'Evaluating...';

  const sys = `You are a senior analyst. Evaluate this trade against Iron Gates principles. Be direct and honest. Format: SCORE: [0-100] | VERDICT: [word] | CONCERN: [one sentence max 20 words] | STRENGTH: [one sentence max 20 words]`;
  const reply = await callGroq([{ role: 'user', content: `Ticker: ${ticker}, Action: ${action}, Reason: ${reason}` }], sys, 180);

  const score = parseInt(reply?.match(/SCORE:\s*(\d+)/)?.[1] || '50');
  const verdict = reply?.match(/VERDICT:\s*(\w+)/)?.[1] || '';
  const concern = reply?.match(/CONCERN:\s*(.+?)(?:\s*\||\s*$)/)?.[1]?.trim() || '';
  const strength = reply?.match(/STRENGTH:\s*(.+?)(?:\s*\||\s*$)/)?.[1]?.trim() || '';

  const trade = { ticker, action, price: price || null, reason, date: new Date().toISOString(), score, verdict, concern, strength };
  N.trades.push(trade);
  localStorage.setItem('naxa_trades', JSON.stringify(N.trades));

  // Place a simulated bet
  placeBet(trade);

  $('trade-modal').style.display = 'none';
  $('tj-result').textContent = '';
  $('tj-ticker').value = ''; $('tj-price').value = ''; $('tj-reason').value = '';
  renderTradeList();
  addMomoMsg('Momo', `${ticker} logged. Score ${score}/100${concern ? '. Watch: ' + concern : ''}. ${strength ? strength : ''}`);
}

function placeBet(trade) {
  const days = { 'BUY': 30, 'SELL': 14, 'SHORT': 21, 'WATCHING': 60 }[trade.action] || 30;
  const checkAt = new Date(Date.now() + days * 86400000).toISOString();
  const bet = {
    betId: 'bet_' + Date.now(),
    ticker: trade.ticker,
    action: trade.action,
    priceAtBet: parseFloat(trade.price) || null,
    placedAt: trade.date,
    checkAt,
    score: trade.score,
    status: 'pending',
    outcome: null
  };
  N.bets.push(bet);
  localStorage.setItem('naxa_bets', JSON.stringify(N.bets));
}

function renderTradeList() {
  const list = $('trade-list');
  if (!list) return;
  if (!N.trades.length) {
    list.innerHTML = '<div style="font-family:var(--mono);font-size:10px;color:var(--muted)">No trades logged yet.</div>';
    return;
  }
  list.innerHTML = N.trades.slice().reverse().map(t => {
    const ac = t.action === 'BUY' ? 'te-buy' : t.action === 'SELL' || t.action === 'SHORT' ? 'te-sell' : 'te-watch';
    return `<div class="trade-entry">
      <div class="te-top">
        <span class="te-ticker">${t.ticker}</span>
        <span class="te-action ${ac}">${t.action}</span>
      </div>
      <div class="te-meta">${t.price ? '@ ' + t.price + '  ·  ' : ''}${new Date(t.date).toLocaleDateString()}${t.score ? '  ·  Score: ' + t.score + '/100' : ''}</div>
      <div class="te-reason">${t.reason?.substring(0, 100)}${t.reason?.length > 100 ? '...' : ''}</div>
      ${t.concern ? `<div class="te-concern">⚠ ${t.concern}</div>` : ''}
      ${t.strength ? `<div class="te-score">✓ ${t.strength}</div>` : ''}
    </div>`;
  }).join('');
}

function renderBetSummary() {
  const el = $('bet-summary');
  if (!el) return;
  const pending = N.bets.filter(b => b.status === 'pending');
  const settled = N.bets.filter(b => b.status !== 'pending');
  const correct = settled.filter(b => b.status === 'correct');

  el.innerHTML = `
    <div style="background:var(--paper2);border:1px solid var(--border);padding:14px 16px;margin-bottom:12px">
      <div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:.15em;margin-bottom:10px">SIMULATED BET LEDGER</div>
      <div style="display:flex;gap:24px;margin-bottom:10px">
        <div><div style="font-family:var(--mono);font-size:20px;font-weight:600;color:var(--accent)">${N.bets.length}</div><div style="font-family:var(--mono);font-size:8px;color:var(--muted)">TOTAL BETS</div></div>
        <div><div style="font-family:var(--mono);font-size:20px;font-weight:600;color:var(--watch)">${pending.length}</div><div style="font-family:var(--mono);font-size:8px;color:var(--muted)">PENDING</div></div>
        <div><div style="font-family:var(--mono);font-size:20px;font-weight:600;color:var(--accent)">${settled.length ? Math.round(correct.length/settled.length*100) + '%' : '—'}</div><div style="font-family:var(--mono);font-size:8px;color:var(--muted)">ACCURACY</div></div>
      </div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--ink3);line-height:1.7">
        Each trade you log places a timestamped prediction. After the check date, compare actual price movement to verify your thesis. This accuracy record builds your signal moat over time.
      </div>
    </div>
    ${pending.map(b => `
      <div style="background:white;border:1px solid var(--border);padding:10px 12px;margin-bottom:6px;font-family:var(--mono);font-size:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="color:var(--accent);font-weight:600">${b.ticker}</span>
          <span style="color:var(--muted)">${b.action}</span>
        </div>
        <div style="color:var(--muted)">Check: ${new Date(b.checkAt).toLocaleDateString()}</div>
        ${b.priceAtBet ? `<div style="color:var(--ink3)">Entry: ${b.priceAtBet}</div>` : ''}
      </div>`).join('')}`;
}

// ── map.js ────────────────────────────────────────────────────
const REGION_DATA = [
  { id:'n_am', name:'North America', flag:'🇺🇸', status:'stable', snap:'Fed holding 4.25%. Corn surplus. Tech earnings beat.',
    mapPath:'M 40 80 L 160 75 L 185 100 L 175 160 L 150 185 L 100 190 L 60 170 L 35 130 Z', cx:110, cy:130 },
  { id:'s_am', name:'South America', flag:'🇧🇷', status:'caution', snap:'Brazil soy record 155Mt. Chilean lithium +18% YoY.',
    mapPath:'M 100 195 L 170 190 L 185 225 L 175 285 L 155 315 L 120 325 L 95 295 L 88 245 Z', cx:137, cy:260 },
  { id:'eu', name:'Europe', flag:'🇪🇺', status:'stable', snap:'ECB at 2.5%. German auto 35K job cuts. Carbon credits volatile.',
    mapPath:'M 280 60 L 375 55 L 390 75 L 380 108 L 356 122 L 308 125 L 278 112 L 266 84 Z', cx:328, cy:90 },
  { id:'africa', name:'Africa', flag:'🌍', status:'caution', snap:'Cocoa 46-yr high. DRC cobalt recovering. Morocco manufacturing boom.',
    mapPath:'M 270 138 L 362 133 L 377 172 L 368 238 L 342 288 L 298 292 L 262 262 L 252 208 L 257 162 Z', cx:315, cy:213 },
  { id:'mena', name:'Middle East', flag:'🇸🇦', status:'stress', snap:'OPEC+ -900kb/d. Red Sea +31% freight. Saudi Vision 2030 capex.',
    mapPath:'M 378 112 L 448 107 L 462 132 L 452 162 L 428 172 L 388 168 L 373 146 Z', cx:418, cy:140 },
  { id:'russia', name:'Russia/CIS', flag:'🇷🇺', status:'stress', snap:'Fertilizer -22%. Wheat exports record. Rouble 88/USD.',
    mapPath:'M 388 28 L 675 22 L 685 58 L 665 82 L 575 92 L 475 95 L 408 88 L 382 63 Z', cx:535, cy:57 },
  { id:'s_asia', name:'South Asia', flag:'🇮🇳', status:'boom', snap:'India GDP 7.2%. Above-avg monsoon. PLI attracting Apple/Samsung.',
    mapPath:'M 477 133 L 557 126 L 572 152 L 565 188 L 542 202 L 508 205 L 488 182 L 472 158 Z', cx:522, cy:168 },
  { id:'sea', name:'SE Asia', flag:'🇻🇳', status:'boom', snap:'Vietnam FDI $36B. Rubber -8%. Indonesia nickel x3.',
    mapPath:'M 573 162 L 648 155 L 665 188 L 657 227 L 632 245 L 598 247 L 572 222 L 562 192 Z', cx:614, cy:202 },
  { id:'e_asia', name:'East Asia', flag:'🇨🇳', status:'growth', snap:'China PMI 51.2. Rare earth licenses 45 days. DRAM +40%.',
    mapPath:'M 587 62 L 718 55 L 735 88 L 722 128 L 698 148 L 658 152 L 618 142 L 582 118 L 575 85 Z', cx:654, cy:106 },
  { id:'oce', name:'Oceania', flag:'🇦🇺', status:'stable', snap:'Iron ore $108/t. LNG exports peak. Wool rising on China recovery.',
    mapPath:'M 597 308 L 728 302 L 748 348 L 738 398 L 708 428 L 658 432 L 612 412 L 590 368 L 592 332 Z', cx:668, cy:368 },
];

const STATUS_COLORS = {
  boom:'#1a4a2e', growth:'#3d8a5a', stable:'#7a6b00', caution:'#8b4513', stress:'#a83232'
};

function initMap() {
  const svg = $('world-svg');
  if (!svg) return;
  svg.innerHTML = '';

  // Background
  const bg = mkSVG('rect', { width:'900', height:'420', fill:'#f0ece4' });
  svg.appendChild(bg);
  // Grid lines
  for (let i = 1; i < 7; i++) svg.appendChild(mkSVG('line', { x1:i*128, y1:0, x2:i*128, y2:420, stroke:'rgba(28,26,22,.06)', 'stroke-width':'1' }));
  for (let i = 1; i < 5; i++) svg.appendChild(mkSVG('line', { x1:0, y1:i*96, x2:900, y2:i*96, stroke:'rgba(28,26,22,.06)', 'stroke-width':'1' }));

  const tt = $('map-tt');

  REGION_DATA.forEach(region => {
    const g = mkSVG('g', { id:'rg-' + region.id });
    const path = mkSVG('path', {
      d: region.mapPath,
      fill: STATUS_COLORS[region.status] || '#7a6b00',
      'fill-opacity': '0.65',
      stroke: '#f0ece4', 'stroke-width': '1.5',
      style: 'cursor:pointer;transition:fill-opacity .15s'
    });
    const label = mkSVG('text', {
      x: region.cx, y: region.cy,
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      fill: 'rgba(255,255,255,0.85)', 'font-size': '8',
      'font-family': 'JetBrains Mono,monospace',
      'font-weight': '500',
      style: 'pointer-events:none'
    });
    label.textContent = region.flag + ' ' + region.name.split(' ')[0];

    path.addEventListener('mouseenter', e => {
      path.setAttribute('fill-opacity', '0.88');
      path.setAttribute('stroke', 'var(--ink)');
      tt.style.display = 'block';
      tt.innerHTML = `<div class="map-tt-name">${region.flag} ${region.name}</div>
        <div class="map-tt-status" style="color:${STATUS_COLORS[region.status]}">${region.status.toUpperCase()}</div>
        <div class="map-tt-snap">${region.snap}</div>`;
      moveMapTT(e, tt);
    });
    path.addEventListener('mousemove', e => moveMapTT(e, tt));
    path.addEventListener('mouseleave', () => {
      path.setAttribute('fill-opacity', '0.65');
      path.setAttribute('stroke', '#f0ece4');
      tt.style.display = 'none';
    });
    path.addEventListener('click', () => {
      closeViews();
      // Filter signals to related ones
      const kw = { n_am:['corn','us','america'], s_am:['soy','brazil','lithium'],
        eu:['europe','german','carbon'], africa:['cocoa','cobalt','nigeria'],
        mena:['opec','saudi','red sea'], russia:['fertilizer','wheat','russia'],
        s_asia:['india','rice','monsoon'], sea:['vietnam','rubber','indonesia'],
        e_asia:['china','rare earth','korea'], oce:['australia','iron ore','lng'] };
      const keys = kw[region.id] || [];
      const related = N.signals.filter(s => keys.some(k => (s.headline + s.what_happened).toLowerCase().includes(k)));
      if (related.length) selectSignal(related[0]);
    });

    g.appendChild(path);
    g.appendChild(label);
    svg.appendChild(g);
  });
}

function moveMapTT(e, tt) {
  const wrap = $('world-svg').parentElement;
  const rect = wrap.getBoundingClientRect();
  let x = e.clientX - rect.left + 14;
  let y = e.clientY - rect.top + 14;
  if (x + 250 > rect.width) x -= 270;
  if (y + 120 > rect.height) y -= 120;
  tt.style.left = x + 'px'; tt.style.top = y + 'px';
}

function mkSVG(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// ── agents-view.js ────────────────────────────────────────────
const AGENT_DEPTS = [
  { id:'scrapyard', icon:'⛏', name:'Scrapyard', head:'Data Ingestion', status:'running',
    activity:'Harvesting SEC EDGAR 8-K filings, Currents API news, Polymarket, USDA crop feeds, Reddit RSS',
    log:['SEC 8-K: 3 material events flagged','Currents API: cocoa news — 5 articles','Polymarket: OPEC cut probability +8%'],
    metrics:{ signals: 247, sources: 12, latency: '28s' } },
  { id:'filter', icon:'🔍', name:'Signal Filter', head:'AI Scoring', status:'running',
    activity:'Scoring 247 raw signals — 23 passed threshold. Source weights from evolution agent applied.',
    log:['Rubber signal: 0.82 — PASS','Cocoa signal: 0.91 — PRIORITY','Reddit signal: 0.31 — REJECT'],
    metrics:{ processed: 247, passed: 23, accuracy: '71%' } },
  { id:'analyzer', icon:'🧠', name:'Analyzer', head:'Supply Chain AI', status:'running',
    activity:'Generating supply chain traces for 8 priority signals. Second and third-order effects mapped.',
    log:['REE: 6-stage chain mapped','Third order: coal license extension flagged','Conviction scores calibrated'],
    metrics:{ chains: 8, instruments: 34, avg_conviction: 81 } },
  { id:'betting', icon:'🎯', name:'Betting System', head:'Prediction Tracker', status:'running',
    activity:'Placing timestamped predictions on generated insights. Tracking against real prices weekly.',
    log:['12 new bets placed','3 bets settled this week','Accuracy: 71% on short-term signals'],
    metrics:{ pending: 12, settled: 34, accuracy: '71%' } },
  { id:'evolution', icon:'🔬', name:'Evolution', head:'Self-Improvement', status:'idle',
    activity:'Runs weekly. Checks bet outcomes vs real prices. Updates source weights. Discovers new data sources.',
    log:['Polymarket: 0.82 accuracy — weight increased','Reddit: 0.41 — weight reduced','2 new sources proposed'],
    metrics:{ accuracy: '71%', optimized: 6, proposals: 3 } },
  { id:'finance', icon:'🏛', name:'Finance Dept', head:'Iron Gates', status:'idle',
    activity:'Standing by for Iron Gates evaluations. Framework: 6-gate system. Last eval: RELIANCE.NS — Score 79.',
    log:['Queue: 0 evaluations','Last: RELIANCE.NS — BUY (79)','Framework active'],
    metrics:{ evals: 12, avg_score: 68, buy_rate: '41%' } },
  { id:'momo_dept', icon:'🐱', name:'Momo / Client Front', head:'CIO', status:'running',
    activity:'Monitoring user session. Delivering intelligence. Profile building from interaction patterns.',
    log:[`Session #${N.profile.sessions}`, `Focus: ${N.profile.focus.slice(0,2).join(', ') || 'building...'}`, 'Briefing ready on request'],
    metrics:{ sessions: N.profile.sessions, queries: N.momoHistory.length, profile: N.profile.focus.length > 0 ? 'Active' : 'Building' } },
  { id:'rd', icon:'⚙', name:'R&D', head:'Autonomous', status:'running',
    activity:'Continuous optimization. Reddit accuracy reduced. Currents API integration completed. New source candidates evaluated.',
    log:['Reddit weight: reduced 40%','Currents API: integrated','New source: FAO crop monitor — testing'],
    metrics:{ improvements: 7, proposals: 3, auto_approved: 4 } },
];

let agentTimers = [];

function initAgentsView() {
  const grid = $('agent-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const lastRun = $('agents-last-run');
  if (lastRun) lastRun.textContent = `Last pipeline run: ${timeAgo(new Date(Date.now() - 1800000).toISOString())}`;

  AGENT_DEPTS.forEach(agent => {
    const card = document.createElement('div');
    card.className = `agent-card ${agent.status}`;
    card.id = 'agc-' + agent.id;

    const metricsHTML = Object.entries(agent.metrics).map(([k, v]) =>
      `<div class="ag-metric"><div class="ag-metric-val">${v}</div><div class="ag-metric-label">${k.toUpperCase()}</div></div>`
    ).join('');

    card.innerHTML = `
      <div class="ag-head">
        <div class="ag-icon">${agent.icon}</div>
        <div><div class="ag-name">${agent.name}</div><div class="ag-role">${agent.head}</div></div>
        <div class="ag-status-chip ag-${agent.status}">${agent.status.toUpperCase()}</div>
      </div>
      <div class="ag-activity">${agent.activity}</div>
      <div class="ag-log" id="agl-${agent.id}">
        ${agent.log.map((l, i) => `<span class="${i === 0 ? 'new' : ''}"> > ${l}</span>`).join('')}
      </div>
      <div class="ag-metrics" style="margin-top:10px">${metricsHTML}</div>`;
    grid.appendChild(card);
  });
}

function startAgentAnimations() {
  agentTimers.forEach(clearInterval);
  agentTimers = [];

  const running = AGENT_DEPTS.filter(a => a.status === 'running');
  const newLogs = {
    scrapyard: ['SEC 8-K: material event detected','Currents API: ' + ['rubber shortage','cocoa prices','rare earth ban'][Math.floor(Math.random()*3)] + ' article','Polymarket: volume spike on commodity market','USDA: crop update processing'],
    filter: ['Signal scored: ' + (Math.random()*.4+.5).toFixed(2) + ' — ' + (Math.random()>.4?'PASS':'REJECT'),'Category: ' + ['agricultural','metals','shipping'][Math.floor(Math.random()*3)],'Batch: ' + Math.floor(Math.random()*15+5) + ' signals processed'],
    analyzer: ['Supply chain: ' + Math.floor(Math.random()*3+4) + ' stages mapped','Second order: identified','Conviction: ' + Math.floor(Math.random()*30+60) + '/100'],
    betting: ['Bet placed on ' + ['rubber','cocoa','REE','shipping'][Math.floor(Math.random()*4)],'Checking: ' + Math.floor(Math.random()*3) + ' bets due','Ledger updated'],
    momo_dept: ['Profile updated: focus detected','Session monitoring active','Briefing ready'],
    rd: ['Source check: complete','Weight update: ' + ['Currents','USDA','Polymarket'][Math.floor(Math.random()*3)],'Optimization logged'],
  };

  running.forEach(agent => {
    const timer = setInterval(() => {
      const logEl = $('agl-' + agent.id);
      if (!logEl) return;
      const logs = newLogs[agent.id];
      if (!logs) return;
      const newLog = logs[Math.floor(Math.random() * logs.length)];
      logEl.querySelectorAll('span').forEach(s => s.classList.remove('new'));
      const span = document.createElement('span');
      span.className = 'new';
      span.textContent = ' > ' + newLog;
      logEl.insertBefore(span, logEl.firstChild);
      if (logEl.children.length > 3) logEl.removeChild(logEl.lastChild);
    }, 3000 + Math.random() * 4000);
    agentTimers.push(timer);
  });
}

// ── export.js ─────────────────────────────────────────────────
function generatePDF() {
  const signals = N.signals || CURATED;
  const active = N.active;
  const win = window.open('', '_blank');
  if (!win) { alert('Allow popups to generate PDF'); return; }

  const signalsHTML = signals.slice(0, 6).map(s =>
    `<div style="border:1px solid #ddd;padding:14px 16px;margin-bottom:12px;border-left:4px solid ${s.urgency==='immediate'?'#a83232':s.urgency==='short_term'?'#8b4513':'#7a6b00'}">
      <div style="font-size:13px;font-weight:700;margin-bottom:5px">${s.headline}</div>
      <div style="font-family:monospace;font-size:10px;color:#666;margin-bottom:6px">${s.category.toUpperCase()} | Conviction: ${s.conviction}/100 | ~${s.lead_lag_days || '?'}d lag</div>
      <div style="font-size:12px;color:#333;line-height:1.6">${s.what_happened}</div>
      ${s.instruments ? `<div style="margin-top:8px">${s.instruments.map(i=>`<span style="display:inline-block;background:#f0ece4;border:1px solid #ddd;padding:2px 7px;margin:2px;font-size:10px;font-family:monospace">${i.ticker_or_name}</span>`).join('')}</div>` : ''}
    </div>`).join('');

  win.document.write(`<!DOCTYPE html><html><head><style>
    body{font-family:Georgia,serif;max-width:820px;margin:40px auto;color:#1c1a16;line-height:1.7}
    h1{font-size:26px;border-bottom:2px solid #1a4a2e;padding-bottom:10px;margin-bottom:8px}
    .disclaimer{font-size:10px;color:#999;border-top:1px solid #ddd;margin-top:24px;padding-top:10px}
    @media print{body{margin:20px}}
  </style></head><body>
    <h1>NAXA Intelligence Briefing</h1>
    <p style="font-family:monospace;font-size:11px;color:#666">${new Date().toUTCString()} · ${signals.length} signals · Supply Chain Intelligence</p>
    ${signalsHTML}
    <div class="disclaimer">NAXA provides intelligence analysis only — not financial advice. Always conduct your own research before any investment decision.</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

function generateCSV() {
  const signals = N.signals || CURATED;
  const rows = [['Headline','Category','Urgency','Conviction','Lead Lag (days)','What Happened','Instruments','Analyzed At']];
  signals.forEach(s => rows.push([
    `"${s.headline}"`, s.category, s.urgency, s.conviction, s.lead_lag_days || '',
    `"${(s.what_happened||'').replace(/"/g,"'")}"`,
    `"${(s.instruments||[]).map(i=>i.ticker_or_name).join(', ')}"`,
    s.analyzed_at || ''
  ]));
  const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `naxa-signals-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
