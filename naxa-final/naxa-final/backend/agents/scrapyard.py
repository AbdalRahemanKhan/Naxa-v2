"""
NAXA Scrapyard v2 — Real data from free Tier 2/3 sources
Niche: Agricultural supply chain signals — RCEP bloc
"""
import os, json, time, hashlib, requests, feedparser, logging
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')
log = logging.getLogger('scrapyard')

KEYWORDS = [
    'rubber','rice','wheat','corn','soy','cocoa','palm oil','harvest','crop',
    'shortage','surplus','export ban','tariff','sanction','supply chain',
    'rare earth','lithium','nickel','cobalt','copper','fertilizer','potash',
    'shipping','freight','port','opec','oil','drought','flood',
    'vietnam','indonesia','india','china','australia','brazil','ukraine'
]

def is_relevant(text):
    t = text.lower()
    return any(k in t for k in KEYWORDS)

def sig_id(text):
    return hashlib.md5(text.encode()).hexdigest()[:12]

def now_iso():
    return datetime.now(timezone.utc).isoformat()

# ── CURRENTS API (real-time, no delay) ───────────────────────
def scrape_currents():
    key = os.environ.get('CURRENTS_API_KEY', '')
    if not key:
        log.info('[Currents] No API key — skipping')
        return []
    signals = []
    queries = ['supply chain commodity', 'agriculture harvest shortage', 'rare earth oil opec']
    for q in queries:
        try:
            url = f'https://api.currentsapi.services/v1/search?keywords={requests.utils.quote(q)}&language=en&apiKey={key}'
            r = requests.get(url, timeout=10)
            if r.ok:
                for a in r.json().get('news', [])[:6]:
                    title = a.get('title', '')
                    if is_relevant(title):
                        signals.append({
                            'id': 'curr_' + sig_id(title),
                            'source': 'CURRENTS_API',
                            'tier': 2,
                            'title': title,
                            'summary': (a.get('description') or '')[:400],
                            'url': a.get('url', ''),
                            'published': a.get('published', now_iso()),
                            'scraped_at': now_iso(),
                            'raw_score': 0.60,
                            'category': 'news'
                        })
            time.sleep(1)
        except Exception as e:
            log.error(f'[Currents] {e}')
    log.info(f'[Currents] {len(signals)} signals')
    return signals

# ── SEC EDGAR ────────────────────────────────────────────────
def scrape_sec():
    signals = []
    urls = [
        'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=30&output=atom',
        'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&dateb=&owner=include&count=20&output=atom',
    ]
    headers = {'User-Agent': 'NAXA-Research research@naxa.ai'}
    for url in urls:
        try:
            feed = feedparser.parse(url, request_headers=headers)
            for e in feed.entries[:20]:
                title = e.get('title', '')
                summary = e.get('summary', '')[:500]
                if is_relevant(title + summary) or 'Purchase' in title:
                    signals.append({
                        'id': 'sec_' + sig_id(title),
                        'source': 'SEC_EDGAR',
                        'tier': 2,
                        'title': title,
                        'summary': summary,
                        'url': e.get('link', ''),
                        'published': e.get('published', now_iso()),
                        'scraped_at': now_iso(),
                        'raw_score': 0.72 if 'Purchase' in title else 0.62,
                        'category': 'corporate'
                    })
        except Exception as e:
            log.error(f'[SEC] {e}')
    log.info(f'[SEC] {len(signals)} signals')
    return signals

# ── POLYMARKET ────────────────────────────────────────────────
def scrape_polymarket():
    signals = []
    try:
        url = 'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=25&order=volume&ascending=false'
        r = requests.get(url, timeout=10)
        if r.ok:
            for m in r.json():
                q = m.get('question', '')
                vol = float(m.get('volume', 0))
                if is_relevant(q):
                    prices = m.get('outcomePrices', [])
                    yes = float(prices[0]) if prices else 0.5
                    signals.append({
                        'id': 'poly_' + sig_id(q),
                        'source': 'POLYMARKET',
                        'tier': 3,
                        'title': q,
                        'summary': f'YES: {round(yes*100)}% | Vol: ${vol:,.0f}',
                        'url': f"https://polymarket.com/event/{m.get('slug','')}",
                        'published': now_iso(),
                        'scraped_at': now_iso(),
                        'raw_score': min(0.88, 0.50 + vol/2000000),
                        'category': 'prediction',
                        'yes_prob': yes,
                        'volume_usd': vol
                    })
    except Exception as e:
        log.error(f'[Polymarket] {e}')
    log.info(f'[Polymarket] {len(signals)} signals')
    return signals

# ── USDA + FAO RSS ────────────────────────────────────────────
def scrape_agri_feeds():
    signals = []
    feeds = [
        ('https://www.ers.usda.gov/rss/feedmanager.aspx?FeedName=OutlookReports', 'USDA'),
        ('https://www.fao.org/news/rss-feed/en/', 'FAO'),
    ]
    for url, src in feeds:
        try:
            feed = feedparser.parse(url)
            for e in feed.entries[:8]:
                title = e.get('title', '')
                summary = (e.get('summary') or e.get('description') or '')[:400]
                if is_relevant(title + summary):
                    signals.append({
                        'id': src.lower() + '_' + sig_id(title),
                        'source': src,
                        'tier': 2,
                        'title': title,
                        'summary': summary,
                        'url': e.get('link', ''),
                        'published': e.get('published', now_iso()),
                        'scraped_at': now_iso(),
                        'raw_score': 0.74,
                        'category': 'agricultural'
                    })
        except Exception as e:
            log.error(f'[{src}] {e}')
    log.info(f'[Agri feeds] {len(signals)} signals')
    return signals

# ── REDDIT RSS ────────────────────────────────────────────────
def scrape_reddit():
    signals = []
    subs = ['commodities','supplychain','agriculture','investing','economics']
    headers = {'User-Agent': 'NAXA-Bot/1.0'}
    for sub in subs:
        try:
            feed = feedparser.parse(f'https://www.reddit.com/r/{sub}/hot.rss?limit=8', request_headers=headers)
            for e in feed.entries[:6]:
                title = e.get('title', '')
                if is_relevant(title):
                    signals.append({
                        'id': f'reddit_{sub}_' + sig_id(title),
                        'source': f'REDDIT_r/{sub}',
                        'tier': 3,
                        'title': title,
                        'summary': '',
                        'url': e.get('link', ''),
                        'published': e.get('published', now_iso()),
                        'scraped_at': now_iso(),
                        'raw_score': 0.35,
                        'category': 'social'
                    })
            time.sleep(1.5)
        except Exception as e:
            log.error(f'[Reddit r/{sub}] {e}')
    log.info(f'[Reddit] {len(signals)} signals')
    return signals

# ── YAHOO FINANCE PRICE MOVES ─────────────────────────────────
def scrape_price_moves():
    signals = []
    try:
        import yfinance as yf
        tickers = {'ZW=F':'Wheat','ZC=F':'Corn','ZS=F':'Soybeans','CC=F':'Cocoa',
                   'CL=F':'Crude Oil','HG=F':'Copper','NI=F':'Nickel','GC=F':'Gold'}
        for ticker, name in tickers.items():
            try:
                hist = yf.Ticker(ticker).history(period='2d', interval='1d')
                if len(hist) >= 2:
                    prev = float(hist['Close'].iloc[-2])
                    curr = float(hist['Close'].iloc[-1])
                    pct = ((curr - prev) / prev) * 100
                    if abs(pct) >= 1.5:
                        signals.append({
                            'id': 'price_' + sig_id(ticker + str(round(curr,2))),
                            'source': 'YAHOO_FINANCE',
                            'tier': 2,
                            'title': f'{name} {"surged" if pct>0 else "dropped"} {abs(pct):.2f}% — significant move',
                            'summary': f'{name} moved {pct:+.2f}% to {curr:.2f}. Move without obvious catalyst may signal unreported supply/demand shift.',
                            'url': f'https://finance.yahoo.com/quote/{ticker}',
                            'published': now_iso(),
                            'scraped_at': now_iso(),
                            'raw_score': min(0.85, 0.50 + abs(pct)/8),
                            'category': 'price_signal',
                            'change_pct': round(pct, 3)
                        })
            except: pass
    except ImportError:
        log.warning('[Yahoo] yfinance not installed')
    except Exception as e:
        log.error(f'[Yahoo] {e}')
    log.info(f'[Yahoo] {len(signals)} price signals')
    return signals

def run():
    log.info(f'=== NAXA Scrapyard starting === {now_iso()}')
    all_signals = []
    all_signals.extend(scrape_currents())
    all_signals.extend(scrape_sec())
    all_signals.extend(scrape_polymarket())
    all_signals.extend(scrape_agri_feeds())
    all_signals.extend(scrape_reddit())
    all_signals.extend(scrape_price_moves())

    # Deduplicate
    seen, unique = set(), []
    for s in all_signals:
        if s['id'] not in seen:
            seen.add(s['id'])
            unique.append(s)

    log.info(f'Total unique signals: {len(unique)}')
    Path('data').mkdir(exist_ok=True)
    with open('data/raw_signals.json', 'w') as f:
        json.dump({'harvested_at': now_iso(), 'count': len(unique), 'signals': unique}, f, indent=2)
    return unique

if __name__ == '__main__':
    run()
