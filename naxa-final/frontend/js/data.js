// data.js — NAXA state, Groq wrapper, signal loading, Currents API news

// ── STATE ────────────────────────────────────────────────────
window.N = {
  signals: [],
  active: null,
  filter: 'all',
  momoHistory: [],
  trades: JSON.parse(localStorage.getItem('naxa_trades') || '[]'),
  watchlist: JSON.parse(localStorage.getItem('naxa_watchlist') || '[]'),
  bets: JSON.parse(localStorage.getItem('naxa_bets') || '[]'),
  profile: JSON.parse(localStorage.getItem('naxa_profile') || '{"sessions":0,"focus":[]}'),

  get groq()     { return localStorage.getItem('naxa_groq') || ''; },
  get currents() { return localStorage.getItem('naxa_currents') || ''; },
  get email()    { return localStorage.getItem('naxa_email') || ''; },
};

// ── GROQ ─────────────────────────────────────────────────────
async function callGroq(messages, system, maxTokens = 900) {
  if (!N.groq) return null;
  try {
    const body = { model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens, temperature: 0.68 };
    if (system) body.messages = [{ role: 'system', content: system }, ...messages];
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${N.groq}` },
      body: JSON.stringify(body)
    });
    if (!r.ok) { console.warn('Groq error', r.status); return null; }
    const d = await r.json();
    return d.choices?.[0]?.message?.content || null;
  } catch(e) { console.warn('Groq failed:', e.message); return null; }
}

function parseJSON(text) {
  if (!text) return null;
  try {
    let s = text.trim();
    const m = s.match(/```(?:json)?\s*([\s\S]+?)```/);
    if (m) s = m[1].trim();
    return JSON.parse(s);
  } catch { return null; }
}

// ── CURRENTS API NEWS ─────────────────────────────────────────
// Real-time, no delay, free tier
async function fetchCurrentsNews(keywords = 'supply chain commodity agriculture') {
  if (!N.currents) return [];
  try {
    const url = `https://api.currentsapi.services/v1/search?keywords=${encodeURIComponent(keywords)}&language=en&apiKey=${N.currents}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.news || []).slice(0, 20).map(a => ({
      id: 'news_' + a.id,
      title: a.title,
      summary: a.description?.substring(0, 300) || '',
      url: a.url,
      published: a.published,
      source: a.author || 'Currents',
      category: detectCategory(a.title + ' ' + (a.description || '')),
      tier: 4
    }));
  } catch(e) { console.warn('Currents failed:', e.message); return []; }
}

function detectCategory(text) {
  const t = text.toLowerCase();
  if (/rubber|rice|wheat|corn|soy|cocoa|palm|harvest|crop|agriculture|farm/.test(t)) return 'agricultural';
  if (/oil|gas|opec|energy|fuel|coal|solar|wind|power/.test(t)) return 'energy';
  if (/copper|rare earth|lithium|nickel|steel|iron|gold|silver|cobalt/.test(t)) return 'metals';
  if (/shipping|freight|container|port|vessel|cargo|supply chain/.test(t)) return 'shipping';
  if (/tariff|sanction|trade war|geopolit|war|conflict|election|policy/.test(t)) return 'geopolitical';
  return 'financial';
}

// ── SIGNAL LOADING ────────────────────────────────────────────
async function loadSignals() {
  // 1. Try GitHub Actions cache
  try {
    const r = await fetch('./signals_cache.json');
    if (r.ok) {
      const d = await r.json();
      if (d.insights?.length > 0) {
        N.lastUpdated = d.updated_at;
        console.log(`[NAXA] Loaded ${d.insights.length} agent signals`);
        return d.insights;
      }
    }
  } catch {}

  // 2. Generate with Groq + Currents news
  if (N.groq) {
    // Fetch live news as context
    let newsContext = '';
    if (N.currents) {
      const news = await fetchCurrentsNews('supply chain commodity shortage harvest oil rare earth');
      if (news.length) {
        newsContext = 'LIVE NEWS CONTEXT (use to make signals current):\n' +
          news.slice(0, 8).map(n => `- ${n.title}`).join('\n');
      }
    }
    const gen = await generateSignals(newsContext);
    if (gen?.length > 0) return gen;
  }

  // 3. Rich curated fallback
  return CURATED;
}

async function generateSignals(newsContext = '') {
  const sys = `Return ONLY a valid JSON array of 6 supply chain signals. No markdown. No explanation. Just the array.

Each item: {"id":"sig_X","headline":"max 12 words","category":"agricultural|energy|metals|shipping|geopolitical|financial","urgency":"immediate|short_term|medium_term","conviction":70-92,"what_happened":"2 sentences.","supply_chain":[{"stage":"1","entity":"name","impact":"effect","direction":"up|down|neutral"},{"stage":"2","entity":"name","impact":"effect","direction":"up|down|neutral"},{"stage":"3","entity":"name","impact":"effect","direction":"up|down|neutral"},{"stage":"4","entity":"name","impact":"effect","direction":"up|down|neutral"},{"stage":"5","entity":"name","impact":"effect","direction":"up|down|neutral"}],"second_order":["effect 1","effect 2"],"third_order":"non-obvious connection","instruments":[{"type":"equity","ticker_or_name":"TICK","reason":"why","time_horizon":"timeframe"}],"lead_lag_days":30,"source_type":"GROQ_LIVE","analyzed_at":"${new Date().toISOString()}"}

${newsContext ? 'Current context: ' + newsContext : 'Focus on: rubber, rare earths, cocoa, fertilizer, shipping, nickel.'}`;

  const reply = await callGroq([{ role: 'user', content: 'Generate the JSON array now.' }], sys, 3500);
  console.log('GROQ REPLY FIRST 200 CHARS:', reply?.substring(0, 200));
  
  if (!reply) return null;
  
  // Try multiple parse strategies
  let text = reply.trim();
  
  // Remove markdown if present
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // Find the array
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1) {
    try {
      const arr = JSON.parse(text.substring(start, end + 1));
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch(e) {
      console.log('Parse failed:', e.message);
    }
  }
  return null;
}


// ── CURATED SIGNALS ───────────────────────────────────────────
const CURATED = [
  {
    id:'sig_001', headline:'China rare earth licensing hits 45 days — wind OEM supply fracturing',
    category:'metals', urgency:'immediate', conviction:91, lead_lag_days:60,
    what_happened:'China\'s Ministry of Commerce extended rare earth export licensing to a 45-day average, up from 15 days in 2023. Eight minerals are affected including neodymium and dysprosium — critical for permanent magnets in wind turbines and EV motors.',
    supply_chain:[
      {stage:'1',entity:'Inner Mongolia mines',impact:'Output steady, exports blocked',direction:'neutral'},
      {stage:'2',entity:'Chinese REE processors',impact:'Domestic inventory builds',direction:'neutral'},
      {stage:'3',entity:'Shin-Etsu, TDK (magnet mfrs)',impact:'Input supply disrupted',direction:'down'},
      {stage:'4',entity:'Vestas, Siemens Energy',impact:'Component shortage in 60-90 days',direction:'down'},
      {stage:'5',entity:'EU wind farm developers',impact:'Project timeline slippage 6-18mo',direction:'down'},
      {stage:'6',entity:'EU 2030 renewable targets',impact:'At risk — 15-20% shortfall',direction:'down'},
    ],
    second_order:[
      'Vestas and Siemens will fast-track MP Materials and Lynas as alternative suppliers — watch both order books surge Q2',
      'EU may invoke strategic reserves — watch European Commission emergency REE policy in next 30 days',
      'Natural gas backup generation more valuable as wind buildout slows — European gas storage premiums rising'
    ],
    third_order:'Wind delays → grid operators extend coal plant licenses → carbon credit prices spike → heavy industrial capex recalculation → steel and cement benefit from delayed green transition cost burden.',
    instruments:[
      {type:'equity',ticker_or_name:'MP',reason:'Only US-based REE producer — direct beneficiary',time_horizon:'Immediate'},
      {type:'equity',ticker_or_name:'VWS.CO',reason:'Vestas Wind — most exposed OEM',time_horizon:'1 quarter'},
      {type:'equity',ticker_or_name:'LYC.AX',reason:'Lynas — Australian alternative, procurement surge',time_horizon:'Short term'},
      {type:'etf',ticker_or_name:'REMX',reason:'VanEck Rare Earth ETF — basket exposure',time_horizon:'Immediate'},
    ],
    source_type:'CURATED', analyzed_at: new Date(Date.now()-3600000*2).toISOString()
  },
  {
    id:'sig_002', headline:'Vietnam rubber harvest 8% below forecast — tire sector blind to it',
    category:'agricultural', urgency:'short_term', conviction:82, lead_lag_days:90,
    what_happened:'Vietnam\'s rubber harvest came in 8% below forecast due to extended dry season across the Mekong Delta. Third consecutive below-average harvest, drawing global natural rubber stockpiles to a 4-year low.',
    supply_chain:[
      {stage:'1',entity:'Vietnamese rubber farms',impact:'Output -8%, stockpiles 4yr low',direction:'down'},
      {stage:'2',entity:'Thai & Indonesian processors',impact:'Procurement costs +12%',direction:'down'},
      {stage:'3',entity:'Tire compound manufacturers',impact:'Input cost inflation building',direction:'down'},
      {stage:'4',entity:'Michelin, Bridgestone, Continental',impact:'Margin compression in 2 quarters',direction:'down'},
      {stage:'5',entity:'Auto OEMs (Toyota, VW, Hyundai)',impact:'Parts cost inflation passed through',direction:'down'},
      {stage:'6',entity:'End consumer',impact:'Tire replacement prices +8-15% by Q3',direction:'down'},
    ],
    second_order:[
      'Tire companies will hedge forward rubber contracts aggressively — watch CME RSS3 futures for unusual volume next 30 days',
      'Auto OEMs may accelerate synthetic rubber R&D — watch Toyota, Continental patent filings Q2',
      'E-bike adoption may accelerate in SE Asia as bicycle tire costs rise — unexpected lithium demand uplift'
    ],
    third_order:'Rubber shortage → bicycle tire shortage in emerging markets → e-bike adoption surge → unexpected lithium demand from non-car direction confuses EV demand models.',
    instruments:[
      {type:'equity',ticker_or_name:'ML.PA',reason:'Michelin — direct rubber input exposure',time_horizon:'2-3 quarters'},
      {type:'equity',ticker_or_name:'5108.T',reason:'Bridgestone — largest rubber buyer globally',time_horizon:'2-3 quarters'},
      {type:'futures',ticker_or_name:'RSS3',reason:'Rubber RSS3 futures — direct commodity play',time_horizon:'Immediate'},
      {type:'equity',ticker_or_name:'CON.DE',reason:'Continental AG — tire + auto parts dual exposure',time_horizon:'1-2 quarters'},
    ],
    source_type:'CURATED', analyzed_at: new Date(Date.now()-3600000*4).toISOString()
  },
  {
    id:'sig_003', headline:'Cocoa at 46-year high — confectionery margin shock lands Q3',
    category:'agricultural', urgency:'short_term', conviction:88, lead_lag_days:45,
    what_happened:'Cocoa prices hit $11,000/tonne — a 46-year high — as El Niño drought devastated harvests in Ghana and Ivory Coast, which together produce 60% of global supply. Mid-crop estimates show a 20% production deficit vs prior year.',
    supply_chain:[
      {stage:'1',entity:'Ghana & Ivory Coast farms',impact:'20% deficit vs prior year',direction:'down'},
      {stage:'2',entity:'Commodity traders (Olam, Barry Callebaut)',impact:'Forward contracts repricing 3x',direction:'up'},
      {stage:'3',entity:'Industrial chocolate processors',impact:'Input costs tripling vs 2022',direction:'down'},
      {stage:'4',entity:'Nestle, Mondelez, Mars, Hershey',impact:'Margin compression or price hikes',direction:'down'},
      {stage:'5',entity:'Retail (Walmart, Tesco, Carrefour)',impact:'SKU rationalization in confectionery',direction:'neutral'},
      {stage:'6',entity:'End consumer',impact:'Chocolate prices +25-40% by Q4',direction:'down'},
    ],
    second_order:[
      'Nestle and Mondelez will pass ~60% of cost increases — earnings guidance cuts incoming Q2 reporting season',
      'Cocoa substitute demand spikes: carob, compound chocolate — watch specialty ingredient companies',
      'West African smallholder farmers offered long-term contracts at record prices — agricultural development bond signal'
    ],
    third_order:'Cocoa spike → premium chocolate outperforms mass market (consumers trade up or abstain, rarely lateral) → Lindt and Godiva gain share while Hershey bleeds margins.',
    instruments:[
      {type:'futures',ticker_or_name:'CC=F',reason:'Cocoa futures — direct supply deficit play',time_horizon:'Immediate'},
      {type:'equity',ticker_or_name:'MDLZ',reason:'Mondelez — highest cocoa exposure in US confectionery',time_horizon:'2 quarters'},
      {type:'equity',ticker_or_name:'HSY',reason:'Hershey — 100% cocoa dependent, limited hedging',time_horizon:'1-2 quarters'},
      {type:'equity',ticker_or_name:'LISN.SW',reason:'Lindt — premium brand, pricing power hedge',time_horizon:'2-3 quarters'},
    ],
    source_type:'CURATED', analyzed_at: new Date(Date.now()-3600000*5).toISOString()
  },
  {
    id:'sig_004', headline:'Red Sea +31% freight rates — FMCG guidance gaps not updated yet',
    category:'shipping', urgency:'immediate', conviction:79, lead_lag_days:30,
    what_happened:'Houthi attacks have forced 85% of Asia-Europe container traffic to reroute via Cape of Good Hope, adding 14 days and 3,500nm per voyage. Container rates up 31% since October — but most FMCG companies haven\'t updated Q3 guidance.',
    supply_chain:[
      {stage:'1',entity:'Asian export manufacturers',impact:'Shipment timelines +14 days',direction:'down'},
      {stage:'2',entity:'Shipping lines (Maersk, MSC)',impact:'Revenue +31%, margin expansion',direction:'up'},
      {stage:'3',entity:'European import ports',impact:'Inventory buildup at origin, depletion at destination',direction:'neutral'},
      {stage:'4',entity:'FMCG (Unilever, P&G, Reckitt)',impact:'Working capital tied up in transit',direction:'down'},
      {stage:'5',entity:'European retailers',impact:'Selective SKU gaps emerging Q2',direction:'down'},
      {stage:'6',entity:'End consumer',impact:'Selected shortages + price pressure',direction:'down'},
    ],
    second_order:[
      'European auto JIT supply chains most fragile — BMW already halted one line; repeat announcements probable Q2',
      'Air freight volumes spike as companies expedite critical components — check logistics company order books',
      'Safety stock building → raw material demand spike across categories → commodity prices get demand-side support'
    ],
    third_order:'Extended shipping → safety stock buildup → raw material demand spike across all categories simultaneously → commodity prices receive demand-side support regardless of supply fundamentals.',
    instruments:[
      {type:'equity',ticker_or_name:'MAERSK-B.CO',reason:'Maersk — direct shipping rate beneficiary',time_horizon:'Immediate'},
      {type:'equity',ticker_or_name:'ZIM',reason:'ZIM Integrated — highest rate sensitivity',time_horizon:'Immediate'},
      {type:'equity',ticker_or_name:'UL',reason:'Unilever — long exposure, working capital pressure',time_horizon:'2 quarters'},
      {type:'equity',ticker_or_name:'CMRE',reason:'Costamare — container leasing, rates surge',time_horizon:'Short term'},
    ],
    source_type:'CURATED', analyzed_at: new Date(Date.now()-3600000*1).toISOString()
  },
  {
    id:'sig_005', headline:'India monsoon above average — global rice price suppression forming',
    category:'agricultural', urgency:'medium_term', conviction:74, lead_lag_days:120,
    what_happened:'India\'s IMD issued above-average monsoon forecast for the third consecutive month, with La Niña conditions expected through October. India\'s rice production could reach a record 130 million tonnes, potentially reversing the 2023 export ban.',
    supply_chain:[
      {stage:'1',entity:'Indian paddy farmers',impact:'Planting area expanding 8%',direction:'up'},
      {stage:'2',entity:'Indian rice mills',impact:'Capacity utilization increasing',direction:'up'},
      {stage:'3',entity:'Indian Rice Exporters Association',impact:'Export ban likely lifted Aug-Sep',direction:'up'},
      {stage:'4',entity:'Global rice markets (CBOT)',impact:'Price suppression 15-25% from peak',direction:'down'},
      {stage:'5',entity:'Rice-importing nations (Philippines, Nigeria)',impact:'Food import cost relief',direction:'up'},
      {stage:'6',entity:'Competing exporters (Thailand, Vietnam)',impact:'Market share erosion',direction:'down'},
    ],
    second_order:[
      'Thai/Vietnamese rice exporters will lock in forward sales before Indian supply hits — watch ZR=F futures roll behavior',
      'Philippines central bank inflation forecasts revise down — rate cut acceleration possible',
      'African food import bills fall → some fiscal space freed → African sovereign bond spreads tighten'
    ],
    third_order:'India rice surplus → reduced food subsidy pressure on African governments → some redirect food budgets to infrastructure → materials and construction demand uptick in Nigeria, Kenya, Ghana.',
    instruments:[
      {type:'futures',ticker_or_name:'ZR=F',reason:'Rice futures — direct price suppression play',time_horizon:'3-6 months'},
      {type:'equity',ticker_or_name:'KRBL.NS',reason:'KRBL — India\'s largest rice exporter, direct beneficiary',time_horizon:'2-3 quarters'},
      {type:'currency',ticker_or_name:'PHP/USD',reason:'Philippine peso — inflation relief = rate cut = currency pressure',time_horizon:'3-6 months'},
    ],
    source_type:'CURATED', analyzed_at: new Date(Date.now()-3600000*6).toISOString()
  },
  {
    id:'sig_006', headline:'Indonesian nickel triples processing — EV battery cost curve accelerating',
    category:'metals', urgency:'medium_term', conviction:77, lead_lag_days:180,
    what_happened:'Indonesia\'s HPAL nickel processing capacity has tripled in 18 months following $8B in Chinese investment. Battery-grade Class 1 nickel is now exiting Indonesia significantly below LME benchmark prices.',
    supply_chain:[
      {stage:'1',entity:'Indonesian laterite mines',impact:'Output +300% YoY',direction:'up'},
      {stage:'2',entity:'Chinese-owned HPAL processors',impact:'Battery-grade nickel below LME',direction:'up'},
      {stage:'3',entity:'EV cathode manufacturers (CATL, LG)',impact:'Input costs -18-22%',direction:'up'},
      {stage:'4',entity:'EV manufacturers (BYD, Tesla, VW)',impact:'Battery pack cost -$800-1200/vehicle',direction:'up'},
      {stage:'5',entity:'Western nickel miners (Vale, BHP)',impact:'Revenue pressure, some ops uneconomic',direction:'down'},
      {stage:'6',entity:'End EV consumer',impact:'Vehicle prices reduce $500-1000 faster',direction:'up'},
    ],
    second_order:[
      'BHP may mothball high-cost Western Australian nickel operations — watch for announcements Q2',
      'EV price parity with ICE vehicles arrives 12-18 months ahead of schedule in key markets',
      'ICE insurance and residual values begin repricing earlier than actuarial models assumed'
    ],
    third_order:'Faster EV adoption → gasoline demand peak arrives 2027 not 2030 → OPEC spare capacity calculations become inaccurate → oil price volatility spikes as models break → oil options volume surge.',
    instruments:[
      {type:'equity',ticker_or_name:'VALE3.SA',reason:'Vale — direct nickel price pressure exposure',time_horizon:'2-4 quarters'},
      {type:'equity',ticker_or_name:'BYD',reason:'BYD — largest beneficiary of battery cost reduction',time_horizon:'2-3 quarters'},
      {type:'equity',ticker_or_name:'TSLA',reason:'Tesla — margin expansion from lower battery costs',time_horizon:'2-3 quarters'},
      {type:'futures',ticker_or_name:'NI=F',reason:'Nickel futures — Indonesian oversupply suppressing LME',time_horizon:'Short-medium term'},
    ],
    source_type:'CURATED', analyzed_at: new Date(Date.now()-3600000*8).toISOString()
  },
  {
    id:'sig_007', headline:'Russian fertilizer sanctions create 18-month food inflation lag',
    category:'geopolitical', urgency:'medium_term', conviction:85, lead_lag_days:180,
    what_happened:'Russia and Belarus supply ~40% of global potash and ~15% of nitrogen fertilizers. Sanctions have reduced available supply 22% YoY. Farmers in Sub-Saharan Africa and South Asia are applying 15-30% less fertilizer this season.',
    supply_chain:[
      {stage:'1',entity:'Russian & Belarusian mines',impact:'Output maintained, exports blocked',direction:'neutral'},
      {stage:'2',entity:'Alternative suppliers (Nutrien, Mosaic)',impact:'Running at capacity, prices elevated',direction:'up'},
      {stage:'3',entity:'African/South Asian farmers',impact:'Input reduction 15-30% forced',direction:'down'},
      {stage:'4',entity:'Crop yields (wheat, corn, soy)',impact:'10-18% yield reduction forecast',direction:'down'},
      {stage:'5',entity:'Local food markets (Nigeria, Pakistan)',impact:'Food price inflation 12-18mo out',direction:'down'},
      {stage:'6',entity:'Sovereign governments',impact:'Food subsidy pressure, instability risk',direction:'down'},
    ],
    second_order:[
      'Nutrien and Mosaic: pricing power and volume simultaneously — best combination in commodities',
      'WFP emergency funding requests will spike Q1 next year — watch UN budget allocation signals',
      'Pakistan and Egypt FX reserves under additional pressure from food import bills — CDS spreads worth watching'
    ],
    third_order:'Food inflation in politically fragile states → civil unrest risk → commodity price spikes from supply disruption → second wave of global food inflation. The 2011 Arab Spring started with a Tunisian wheat price spike.',
    instruments:[
      {type:'equity',ticker_or_name:'NTR',reason:'Nutrien — largest non-Russian fertilizer producer',time_horizon:'3-6 months'},
      {type:'equity',ticker_or_name:'MOS',reason:'Mosaic — potash and phosphate, pricing power',time_horizon:'3-6 months'},
      {type:'futures',ticker_or_name:'ZW=F',reason:'Wheat futures — yield reduction hitting global supply',time_horizon:'4-8 months'},
      {type:'etf',ticker_or_name:'SOIL',reason:'Global X Fertilizers ETF — basket exposure',time_horizon:'Medium term'},
    ],
    source_type:'CURATED', analyzed_at: new Date(Date.now()-3600000*9).toISOString()
  },
  {
    id:'sig_008', headline:'Saudi Vision 2030 steel procurement creating hidden demand signal',
    category:'geopolitical', urgency:'short_term', conviction:71, lead_lag_days:90,
    what_happened:'Saudi Arabia\'s giga-projects have committed $500B in construction capex through 2030. Steel procurement for 2024-2025 is being tendered — orders going to Korean and Indian mills, explicitly bypassing Chinese suppliers.',
    supply_chain:[
      {stage:'1',entity:'Saudi Vision 2030 funds',impact:'$500B committed, steel procurement active',direction:'up'},
      {stage:'2',entity:'POSCO Holdings, Hyundai Steel',impact:'RFQ volume surge — preferred over Chinese',direction:'up'},
      {stage:'3',entity:'JSW Steel, Tata Steel',impact:'Middle East proximity advantage',direction:'up'},
      {stage:'4',entity:'Iron ore miners (BHP, Rio, Vale)',impact:'Indirect demand support',direction:'up'},
      {stage:'5',entity:'Korean / Indian domestic construction',impact:'Steel capacity diverted → local cost rise',direction:'down'},
      {stage:'6',entity:'Korean housing REITs',impact:'Construction cost inflation',direction:'down'},
    ],
    second_order:[
      'Korean won benefits from export earnings surge — watch USD/KRW compression',
      'JSW Steel and Tata Steel Middle East order books show unusual Q2 strength',
      'Specialty steel for desalination plants creates niche demand — stainless steel premiums rising'
    ],
    third_order:'Saudi construction consumes Korean and Indian steel capacity → less available domestically → Korean housing REITs face margin pressure → Korean financial stocks affected by real estate cost inflation.',
    instruments:[
      {type:'equity',ticker_or_name:'005490.KS',reason:'POSCO Holdings — primary Korean mill, Saudi preferred',time_horizon:'2-3 quarters'},
      {type:'equity',ticker_or_name:'JSWSTEEL.NS',reason:'JSW Steel — proximity advantage',time_horizon:'2-3 quarters'},
      {type:'equity',ticker_or_name:'BHP',reason:'BHP — iron ore demand uplift signal',time_horizon:'3-4 quarters'},
      {type:'currency',ticker_or_name:'USD/KRW',reason:'Korean won export earnings boost',time_horizon:'2-4 quarters'},
    ],
    source_type:'CURATED', analyzed_at: new Date(Date.now()-3600000*10).toISOString()
  }
];
