// commodities.js
const LIVE_PRICES = {};

async function fetchLivePrices() {
  try {
    // CoinGecko works from browser with no key - CORS allowed
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,gold&vs_currencies=usd');
    if (r.ok) {
      const d = await r.json();
      LIVE_PRICES['Gold'] = d.gold?.usd;
    }
  } catch {}
}


const COMS = [
  {n:'Brent Crude', b:82.4}, {n:'WTI', b:78.1}, {n:'Nat. Gas', b:2.85},
  {n:'Gold', b:2380}, {n:'Copper', b:4.52}, {n:'Wheat', b:548},
  {n:'Soybeans', b:1148}, {n:'Corn', b:442}, {n:'Rubber RSS3', b:1.62},
  {n:'Cocoa', b:10800}, {n:'Lithium', b:13200}, {n:'Iron Ore', b:108},
  {n:'Nickel', b:16800}, {n:'Palladium', b:1045},
];

function renderCommodities() {
  await fetchLivePrices();
  const strip = $('com-strip');
  if (!strip) return;
  strip.innerHTML = '';
  const tickerData = [];

  COMS.forEach(c => {
    const chg = LIVE_PRICES['Gold'] || (c.b * (1 + chg/100));
    const price = c.b * (1 + chg / 100);
    const fmt = price >= 10000 ? price.toFixed(0) : price >= 100 ? price.toFixed(1) : price.toFixed(2);
    const up = chg >= 0;

    const row = document.createElement('div');
    row.className = 'com-row';
    row.innerHTML = `<span class="com-nm">${c.n}</span>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="com-pr">${fmt}</span>
        <span class="${up ? 'com-up' : 'com-dn'}">${up ? '▲' : '▼'}${Math.abs(chg).toFixed(2)}%</span>
      </div>`;
    strip.appendChild(row);
    tickerData.push({ n: c.n, fmt, chg, up });
  });

  buildTicker(tickerData);
  loadPolymarket();
}

function buildTicker(data) {
  const el = $('ticker');
  if (!el) return;
  const doubled = [...data, ...data];
  el.innerHTML = doubled.map(d =>
    `<span class="tick-item">${d.n} <span class="${d.up ? 't-up' : 't-dn'}">${d.fmt} ${d.up ? '▲' : '▼'}${Math.abs(d.chg).toFixed(2)}%</span></span>`
  ).join('');
}

async function loadPolymarket() {
  const markets = [
    { q: 'Will Fed cut rates before Sep 2025?', yes: 0.42, vol: 2100000 },
    { q: 'Will OPEC+ increase production Q3?', yes: 0.28, vol: 890000 },
    { q: 'Will China GDP exceed 5% in 2025?', yes: 0.61, vol: 1450000 },
    { q: 'Will Brent crude exceed $95/bbl?', yes: 0.31, vol: 760000 },
    { q: 'Will India GDP exceed 7% FY2026?', yes: 0.74, vol: 430000 },
  ];

  let sec = $('poly-sec');
  if (!sec) {
    sec = document.createElement('div');
    sec.id = 'poly-sec';
    const rc = $('right-col');
    if (rc) rc.insertBefore(sec, $('watchlist-section'));
  }
  sec.innerHTML = `
    <div class="col-head" style="border-top:1px solid var(--border)">
      <span class="col-head-title">Polymarket</span>
    </div>
    ${markets.map(m => {
      const pct = Math.round(m.yes * 100);
      const vol = m.vol >= 1e6 ? '$' + (m.vol/1e6).toFixed(1) + 'M' : '$' + (m.vol/1e3).toFixed(0) + 'K';
      return `<div style="padding:8px 14px;border-bottom:1px solid var(--border2)" onmouseover="this.style.background='var(--paper3)'" onmouseout="this.style.background=''">
        <div style="font-size:11px;color:var(--ink2);line-height:1.5;margin-bottom:5px">${m.q}</div>
        <div style="height:3px;background:var(--paper4);border-radius:2px;overflow:hidden;margin-bottom:3px">
          <div style="height:100%;background:var(--accent);width:${pct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:var(--mono);font-size:9px;color:var(--muted)">
          <span style="color:${pct>50?'var(--accent)':'var(--muted)'}">${pct}% YES</span>
          <span>${vol}</span>
        </div>
      </div>`;
    }).join('')}`;
}
