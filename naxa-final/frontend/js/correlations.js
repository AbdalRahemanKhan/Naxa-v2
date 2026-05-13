// correlations.js — Lead-Lag Correlation Map
// This is what quant/supply chain analysts actually need:
// "How many days after event X does instrument Y move?"

const LEAD_LAGS = [
  {
    category: 'Agricultural',
    color: 'var(--accent)',
    pairs: [
      { event: 'USDA crop report (bearish)', instrument: 'Corn futures ZC=F', days: 1, direction: 'down', strength: 'Strong', note: 'Same-day move on release. 3-day follow-through typical.' },
      { event: 'Vietnam rubber harvest miss', instrument: 'Michelin ML.PA margins', days: 75, direction: 'down', strength: 'Medium', note: '60-90 day supply chain lag before OEM earnings impact.' },
      { event: 'India monsoon above average', instrument: 'Rice futures ZR=F', days: 90, direction: 'down', strength: 'Medium', note: 'Harvest 3-4 months out. Export ban removal the trigger.' },
      { event: 'West Africa cocoa crop miss', instrument: 'CC=F cocoa futures', days: 2, direction: 'up', strength: 'Strong', note: 'Immediate. Mid-crop data moves market within 48 hours.' },
      { event: 'Cocoa price spike', instrument: 'Hershey HSY margins', days: 45, direction: 'down', strength: 'Strong', note: 'Q reporting lag. Hershey has limited hedging flexibility.' },
      { event: 'Brazil soy harvest record', instrument: 'Soybeans ZS=F', days: 3, direction: 'down', strength: 'Strong', note: 'USDA confirmation adds 1-2 days to initial move.' },
    ]
  },
  {
    category: 'Energy & Shipping',
    color: 'var(--soon)',
    pairs: [
      { event: 'OPEC+ production cut announcement', instrument: 'Brent CL=F', days: 0, direction: 'up', strength: 'Strong', note: 'Immediate — within minutes of announcement.' },
      { event: 'Red Sea shipping disruption', instrument: 'Container freight rates', days: 3, direction: 'up', strength: 'Strong', note: '2-3 days for rerouting to show in spot rates.' },
      { event: 'Red Sea freight spike', instrument: 'FMCG (UL, PG) margins', days: 45, direction: 'down', strength: 'Medium', note: 'Working capital and input cost impact hits next quarter.' },
      { event: 'Red Sea freight spike', instrument: 'Maersk MAERSK-B.CO revenue', days: 7, direction: 'up', strength: 'Strong', note: 'Spot rate revenue reflects in 1-2 weeks. Guidance 30 days.' },
      { event: 'Saudi Aramco capex increase', instrument: 'Steel demand (POSCO)', days: 60, direction: 'up', strength: 'Medium', note: 'Procurement cycle 60-90 days from capex approval to order.' },
    ]
  },
  {
    category: 'Metals & Materials',
    color: 'var(--watch)',
    pairs: [
      { event: 'China rare earth export restriction', instrument: 'MP Materials MP', days: 1, direction: 'up', strength: 'Strong', note: 'Immediate re-rating of Western REE producers.' },
      { event: 'China rare earth restriction', instrument: 'Vestas VWS.CO margins', days: 90, direction: 'down', strength: 'Medium', note: 'Component shortage hits OEM production 60-90 days later.' },
      { event: 'Indonesia nickel supply surge', instrument: 'LME Nickel NI=F', days: 30, direction: 'down', strength: 'Medium', note: 'Physical supply takes 30 days to reach exchange warehouses.' },
      { event: 'Indonesian nickel price drop', instrument: 'BHP nickel division', days: 60, direction: 'down', strength: 'Medium', note: 'Mine economics deteriorate. Guidance cut at next quarter.' },
      { event: 'DRC cobalt supply recovery', instrument: 'EV battery cost index', days: 90, direction: 'down', strength: 'Low', note: 'Cobalt is 5-8% of battery cost. Modest effect over a quarter.' },
    ]
  },
  {
    category: 'Geopolitical',
    color: '#3a6fa8',
    pairs: [
      { event: 'Russian fertilizer sanctions tighten', instrument: 'Nutrien NTR revenue', days: 30, direction: 'up', strength: 'Strong', note: 'Spot potash price repricing within 30 days of news.' },
      { event: 'Fertilizer price spike', instrument: 'Sub-Saharan crop yields', days: 365, direction: 'down', strength: 'Medium', note: '12-18 month lag. Farmers cut application → next harvest.' },
      { event: 'US-China tariff escalation', instrument: 'Soybean basis (US vs Brazil)', days: 5, direction: 'down', strength: 'Strong', note: 'US origin loses competitiveness vs Brazil within a week.' },
      { event: 'India IT sector earnings beat', instrument: 'INR/USD', days: 2, direction: 'up', strength: 'Low', note: 'Minor FX effect. More important for domestic consumption signal.' },
    ]
  }
];

function initCorrelations() {
  renderCorrelations();
}

function renderCorrelations() {
  const body = $('corr-body');
  if (!body) return;

  body.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:14px;color:var(--ink3);line-height:1.7;max-width:700px">
        How many days after a physical-world event does the financial market move? This is where the edge lives — in the lag between what happened and what's priced.
        <strong> Green numbers = days until impact.</strong>
      </div>
    </div>`;

  LEAD_LAGS.forEach(group => {
    const section = document.createElement('div');
    section.style.marginBottom = '28px';
    section.innerHTML = `
      <div style="font-family:var(--mono);font-size:10px;letter-spacing:.18em;color:${group.color};text-transform:uppercase;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border2)">${group.category}</div>
      ${group.pairs.map(p => {
        const strengthColor = p.strength === 'Strong' ? 'var(--accent)' : p.strength === 'Medium' ? 'var(--watch)' : 'var(--muted)';
        const dirIcon = p.direction === 'up' ? '▲' : '▼';
        const dirColor = p.direction === 'up' ? 'var(--accent)' : 'var(--now)';
        return `
          <div class="leadlag-row">
            <div class="ll-event">${p.event}</div>
            <div class="ll-arrow">→</div>
            <div style="flex:1.2;font-size:12px;color:var(--ink2);font-weight:500">${p.instrument}</div>
            <div style="font-family:var(--mono);font-size:10px;color:${dirColor};min-width:20px">${dirIcon}</div>
            <div class="ll-days" style="color:var(--accent)">${p.days === 0 ? 'instant' : p.days + 'd'}</div>
            <div style="font-family:var(--mono);font-size:9px;color:${strengthColor};min-width:52px;text-align:right">${p.strength}</div>
          </div>
          <div style="font-family:var(--mono);font-size:9px;color:var(--muted);padding:3px 12px 8px;background:var(--paper2);border:1px solid var(--border2);border-top:none;margin-bottom:4px">${p.note}</div>`;
      }).join('')}`;
    body.appendChild(section);
  });

  // Second-order correlation builder
  const builder = document.createElement('div');
  builder.style.marginTop = '24px';
  builder.innerHTML = `
    <div style="font-family:var(--serif);font-size:18px;font-weight:700;margin-bottom:12px">Build Your Own Signal Chain</div>
    <div style="font-size:13px;color:var(--ink3);margin-bottom:14px;line-height:1.7">
      Describe any market event. NAXA maps the full second and third-order effect chain with timing estimates.
    </div>
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <input type="text" id="chain-builder-input" style="flex:1;background:var(--paper2);border:1px solid var(--border);color:var(--ink);font-family:var(--sans);font-size:13px;padding:9px 12px;outline:none;border-radius:2px" placeholder="e.g. OPEC cuts 1 million barrels/day for Q3..."/>
      <button onclick="buildChain()" style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;background:var(--accent);color:white;border:none;padding:9px 18px;cursor:pointer;border-radius:2px">Map Effects →</button>
    </div>
    <div id="chain-builder-result"></div>`;
  body.appendChild(builder);
}

window.buildChain = async function () {
  const input = $('chain-builder-input');
  const event = input.value.trim();
  if (!event) return;
  const result = $('chain-builder-result');
  result.innerHTML = '<div style="font-family:var(--mono);font-size:10px;color:var(--muted);padding:8px 0">Mapping effects...</div>';

  const sys = `You are a supply chain intelligence analyst. Map the cascading effects of a market event with timing estimates.

Format your response with these exact section labels:
[DIRECT — Days 0-7]: Immediate financial market impacts
[SECOND ORDER — Days 8-60]: What those direct effects cause next
[THIRD ORDER — Days 61-180]: The non-obvious downstream connection
[KEY INSTRUMENTS]: Specific tickers and time horizons

Be specific — name real companies, real tickers. Include day ranges for each effect.`;

  const reply = await callGroq([{ role: 'user', content: `Event: ${event}` }], sys, 600);

  if (!reply) {
    result.innerHTML = '<div style="font-family:var(--mono);font-size:10px;color:var(--muted)">Add Groq key in ⚙ Config for AI chain mapping.</div>';
    return;
  }

  const formatted = reply
    .replace(/\[([^\]]+)\]/g, `<div style="font-family:var(--mono);font-size:9px;color:var(--accent);letter-spacing:.15em;margin:16px 0 6px;padding-top:12px;border-top:1px solid var(--border2)">$1</div>`)
    .replace(/\n/g, '<br>');

  result.innerHTML = `<div style="font-size:13px;color:var(--ink2);line-height:1.8;background:var(--paper2);border:1px solid var(--border);padding:16px 18px;">${formatted}</div>`;
};
