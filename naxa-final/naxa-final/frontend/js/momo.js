// momo.js — Momo CIO

const MOMO_SYS = `You are Momo — Chief Intelligence Officer at NAXA, a supply chain intelligence firm.

PERSONALITY:
- Extremely well-informed. Calm. Completely honest — never sycophantic.
- Dry wit with occasional dark humor. Example: "Russia cutting fertilizer exports — great news for Nutrien shareholders, less great news for people who eat bread."
- Never opens with "Great question!" or any flattery. Ever.
- Questions decisions without overriding them.
- 3-5 sentences maximum per response. Be specific — name companies, tickers, commodities.

INTELLIGENCE:
${(window.CURATED || []).slice(0, 4).map(s => s.headline).join(' | ')}

NAVIGATION — tell user to click:
- [→ Map] to see world map
- [→ Correlations] to see lead-lag maps
- [→ Iron Gates] to evaluate a stock
- [→ Journal] to log a trade
- [→ Agents] to see agent network
- PDF button to export briefing
- CSV button to export signals`;

let momoId = 0;

function initMomo() {
  // Welcome
  const hour = new Date().getHours();
  const greet = hour < 12
    ? "Morning. Three signals came in overnight worth your attention — rubber, rare earths, and cocoa are all moving. Pick your poison."
    : hour < 17
      ? "Afternoon. Supply chain agents have been busy. Fourteen signals processed. The Red Sea situation is the one most people are underpricing."
      : "Evening. Markets closed. Signals don't. The fertilizer lag is the most underappreciated risk on the board right now.";
  addMomoMsg('Momo', greet);

  // Events
  $('momo-send').addEventListener('click', sendMomo);
  $('momo-inp').addEventListener('keydown', e => { if (e.key === 'Enter') sendMomo(); });
  $('btn-pdf').addEventListener('click', generatePDF);
  $('btn-csv').addEventListener('click', generateCSV);
  $('btn-briefing').addEventListener('click', momoBriefing);
}

async function sendMomo() {
  const inp = $('momo-inp');
  const q = inp.value.trim();
  if (!q) return;
  inp.value = '';

  // Update profile
  const ql = q.toLowerCase();
  const focus = N.profile.focus || [];
  ['india','china','rubber','cocoa','rare earth','oil','shipping','fertilizer','nickel'].forEach(kw => {
    if (ql.includes(kw) && !focus.includes(kw)) focus.push(kw);
  });
  N.profile.focus = focus.slice(-6);
  localStorage.setItem('naxa_profile', JSON.stringify(N.profile));

  // Check navigation intent first (instant, no API needed)
  const nav = checkNavIntent(ql);
  if (nav) {
    addMomoMsg('You', q, true);
    addMomoMsg('Momo', nav.msg);
    if (nav.fn) nav.fn();
    return;
  }

  N.momoHistory.push({ role: 'user', content: q });
  addMomoMsg('You', q, true);
  const loadId = addMomoLoadingMsg();

  const sys = MOMO_SYS + `\n\nUser focus areas from past sessions: ${N.profile.focus.join(', ') || 'not yet established'}.`;
  const reply = await callGroq(N.momoHistory.slice(-8), sys, 500);
  const text = reply || getFallback(ql);

  N.momoHistory.push({ role: 'assistant', content: text });
  updateMomoMsg(loadId, text, getActions(text));
}

function checkNavIntent(q) {
  if (/map|world|region|global/.test(q))
    return { msg: 'Pulling up the world map. [→ Map]', fn: () => openView('view-map') };
  if (/correlat|lead.lag|timing|days after/.test(q))
    return { msg: 'Here\'s the lead-lag correlation map. [→ Correlations]', fn: () => openView('view-corr') };
  if (/iron gate|analyse|evaluate|stock check|ticker/.test(q))
    return { msg: 'Iron Gates tester is ready — paste any ticker. [→ Iron Gates]', fn: () => openView('view-ig') };
  if (/journal|trade|log|position/.test(q))
    return { msg: 'Your trade journal. [→ Journal]', fn: () => openView('view-journal') };
  if (/agent|what.*(they|you).*(doing|running)|network/.test(q))
    return { msg: 'Live agent network. [→ Agents]', fn: () => { openView('view-agents'); startAgentAnimations(); } };
  return null;
}

function getActions(text) {
  const actions = [];
  if (text.includes('[→ Map]')) actions.push({ label: '→ Map', fn: () => openView('view-map') });
  if (text.includes('[→ Correlations]')) actions.push({ label: '→ Correlations', fn: () => openView('view-corr') });
  if (text.includes('[→ Iron Gates]')) actions.push({ label: '→ Iron Gates', fn: () => openView('view-ig') });
  if (text.includes('[→ Journal]')) actions.push({ label: '→ Journal', fn: () => openView('view-journal') });
  if (text.includes('[→ Agents]')) actions.push({ label: '→ Agents', fn: () => { openView('view-agents'); startAgentAnimations(); } });
  return actions;
}

function getFallback(q) {
  if (/rubber/.test(q)) return "Vietnam rubber -8%. Bridgestone and Michelin haven't priced this in yet — market typically takes 60-90 days to catch up to physical supply signals. That's the window. [→ Iron Gates] to stress-test either.";
  if (/cocoa/.test(q)) return "Cocoa at 46-year highs. If you're long Hershey or Mondelez, ask hard questions about Q3 guidance. Lindt probably has the pricing power to survive it. Hershey doesn't hedge well. [→ Iron Gates] to check.";
  if (/rare earth|china/.test(q)) return "Rare earth licensing to 45 days is the most underpriced supply chain risk right now. MP Materials is obvious. Lynas (LYC.AX) is the one fewer people are watching — Australian alternative supplier, procurement is surging.";
  if (/india/.test(q)) return "India at 7.2% GDP with above-average monsoon incoming. Rice surplus will suppress global prices — good for importing nations, bad for Thai and Vietnamese exporters. The manufacturing shift story is less exciting than the headline numbers suggest.";
  if (/fertilizer|russia/.test(q)) return "The fertilizer lag is 12-18 months from sanctions to crop yield reduction to food price inflation. Most analysts are not tracking this. Nutrien and Mosaic have pricing power and volume simultaneously — rare combination.";
  if (/shipping|red sea/.test(q)) return "Red Sea has added 14 days and 31% to Asia-Europe freight costs. FMCG companies haven't updated guidance yet — that's the gap. Maersk is the obvious beneficiary. ZIM has higher rate sensitivity if you want more leverage.";
  return "Add your Groq key in ⚙ Config for live analysis. Without it I'm working from memory — which is good, but not real-time.";
}

async function momoBriefing() {
  const loadId = addMomoLoadingMsg();
  const top = (N.signals || CURATED).slice(0, 4);
  const sys = `You are Momo, CIO at NAXA. Generate a concise morning briefing.

Signals: ${top.map(s => s.headline).join(' | ')}

Format with section labels [OVERNIGHT] [TOP SIGNALS] [SECOND ORDER] [TODAY'S QUESTION].
Dark humor welcome. Under 180 words. Be direct.`;

  const reply = await callGroq([{ role: 'user', content: 'Morning briefing.' }], sys, 380);
  updateMomoMsg(loadId, reply || 'Add Groq key for live briefings. ⚙ Config.', [{ label: '📄 Export PDF', fn: generatePDF }]);
}

// ── MESSAGE HELPERS ───────────────────────────────────────────
function addMomoMsg(who, text, isUser = false) {
  const id = 'mm-' + (++momoId);
  const body = $('momo-body');
  const div = document.createElement('div');
  div.className = 'momo-msg'; div.id = id;

  // Parse [→ X] links
  const parsedText = text.replace(/\[→ ([^\]]+)\]/g,
    '<span style="color:var(--accent);cursor:pointer;border-bottom:1px solid var(--accent-dim);font-weight:500" onclick="handleMomoNav(\'$1\')">→ $1</span>');

  div.innerHTML = `
    <div class="mm-who ${isUser ? 'user-who' : 'momo-who'}">${who}</div>
    <div class="mm-text ${isUser ? 'user-text' : ''}">${parsedText}</div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return id;
}

function addMomoLoadingMsg() {
  const id = 'mm-' + (++momoId);
  const body = $('momo-body');
  const div = document.createElement('div');
  div.className = 'momo-msg'; div.id = id;
  div.innerHTML = `<div class="mm-who momo-who">Momo</div><div class="mm-text loading">...</div>`;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return id;
}

function updateMomoMsg(id, text, actions = []) {
  const el = $(id);
  if (!el) return;
  const parsedText = text.replace(/\[→ ([^\]]+)\]/g,
    '<span style="color:var(--accent);cursor:pointer;border-bottom:1px solid var(--accent-dim);font-weight:500" onclick="handleMomoNav(\'$1\')">→ $1</span>');
  el.querySelector('.mm-text').classList.remove('loading');
  el.querySelector('.mm-text').innerHTML = parsedText;

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'mm-actions';
    actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'mm-action';
      btn.textContent = a.label;
      btn.addEventListener('click', a.fn);
      row.appendChild(btn);
    });
    el.appendChild(row);
  }
  $('momo-body').scrollTop = 9999;
}

window.handleMomoNav = function (label) {
  const map = {
    'map': 'view-map', 'correlations': 'view-corr',
    'iron gates': 'view-ig', 'journal': 'view-journal',
    'agents': 'view-agents'
  };
  const key = label.toLowerCase();
  const view = map[key];
  if (view) {
    openView(view);
    if (view === 'view-agents') startAgentAnimations();
  }
};
