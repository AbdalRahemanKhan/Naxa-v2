#!/usr/bin/env python3
"""evolution.py — Weekly self-improvement: checks bets, updates weights, discovers sources"""
import os, json, logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from groq import Groq

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')
log = logging.getLogger('evolution')
client = Groq(api_key=os.environ.get('GROQ_API_KEY', ''))

def check_bets():
    try:
        import yfinance as yf
    except ImportError:
        log.warning('yfinance not installed'); return []

    try:
        with open('data/bet_ledger.json') as f:
            bets = json.load(f)
    except FileNotFoundError:
        return []

    now = datetime.now(timezone.utc)
    settled = []

    for bet in bets:
        if bet['status'] != 'pending':
            continue
        check_date = datetime.fromisoformat(bet['check_at'])
        if now < check_date:
            continue
        ticker = bet['ticker']
        if len(ticker) > 10 or ' ' in ticker:
            bet['status'] = 'expired'
            continue
        try:
            placed = datetime.fromisoformat(bet['placed_at'])
            hist = yf.Ticker(ticker).history(
                start=placed.strftime('%Y-%m-%d'),
                end=now.strftime('%Y-%m-%d')
            )
            if len(hist) < 2:
                bet['status'] = 'expired'
                continue
            p0 = float(hist['Close'].iloc[0])
            p1 = float(hist['Close'].iloc[-1])
            pct = ((p1 - p0) / p0) * 100
            bet['outcome_pct'] = round(pct, 3)
            bet['settled_at'] = now.isoformat()
            pred_up = bet['predicted_direction'] == 'up'
            if abs(pct) < 0.5:
                bet['status'] = 'neutral'
                bet['was_correct'] = None
            elif pred_up and pct > 0.5:
                bet['status'] = 'correct'; bet['was_correct'] = True
            elif not pred_up and pct < -0.5:
                bet['status'] = 'correct'; bet['was_correct'] = True
            else:
                bet['status'] = 'incorrect'; bet['was_correct'] = False
            settled.append(bet)
            log.info(f"  {ticker}: {pct:+.2f}% → {bet['status']}")
        except Exception as e:
            log.error(f'  Price check {ticker}: {e}')
            bet['status'] = 'expired'

    with open('data/bet_ledger.json', 'w') as f:
        json.dump(bets, f, indent=2)
    log.info(f'Settled {len(settled)} bets')
    return settled

def update_weights():
    try:
        with open('data/bet_ledger.json') as f:
            bets = json.load(f)
    except FileNotFoundError:
        return {}

    src_results = {}
    for b in bets:
        if b['status'] not in ('correct', 'incorrect'):
            continue
        src = b.get('source_type', 'UNKNOWN')
        if src not in src_results:
            src_results[src] = {'correct': 0, 'total': 0}
        src_results[src]['total'] += 1
        if b['status'] == 'correct':
            src_results[src]['correct'] += 1

    weights = {}
    for src, r in src_results.items():
        if r['total'] >= 3:
            acc = r['correct'] / r['total']
            weights[src] = round(acc * 0.7 + 0.5 * 0.3, 3)
            log.info(f"  {src}: {r['correct']}/{r['total']} = {acc:.0%} → weight {weights[src]:.2f}")

    if weights:
        with open('data/source_weights.json', 'w') as f:
            json.dump({'updated_at': datetime.now(timezone.utc).isoformat(), 'weights': weights}, f, indent=2)
    return weights

def discover_sources():
    try:
        with open('data/bet_ledger.json') as f:
            bets = json.load(f)
    except FileNotFoundError:
        return []

    correct = [b for b in bets if b['status'] == 'correct']
    if len(correct) < 5:
        log.info('Not enough data for source discovery yet')
        return []

    winning = {}
    for b in correct:
        key = f"{b.get('category','?')} from {b.get('source_type','?')}"
        winning[key] = winning.get(key, 0) + 1
    top = sorted(winning.items(), key=lambda x: x[1], reverse=True)[:4]

    try:
        r = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[{
                'role': 'system',
                'content': 'Suggest 4 new free data sources that would produce early supply chain signals. Return JSON array: [{"url":"...","name":"...","type":"rss|api","why":"...","tier":2,"category":"agricultural|energy|metals|shipping"}]'
            }, {
                'role': 'user',
                'content': f'Most accurate signal types: {top}. Suggest new sources.'
            }],
            max_tokens=500, temperature=0.7)
        content = r.choices[0].message.content.strip()
        if '```' in content:
            content = content.split('```')[1].replace('json', '').strip()
        new_sources = json.loads(content)

        existing = []
        try:
            with open('data/discovered_sources.json') as f:
                existing = json.load(f)
        except FileNotFoundError:
            pass
        existing.extend([{**s, 'discovered_at': datetime.now(timezone.utc).isoformat(), 'status': 'proposed'} for s in new_sources])
        with open('data/discovered_sources.json', 'w') as f:
            json.dump(existing[-50:], f, indent=2)
        log.info(f'Discovered {len(new_sources)} new source candidates')
        return new_sources
    except Exception as e:
        log.error(f'Source discovery: {e}')
        return []

def build_report():
    try:
        with open('data/bet_ledger.json') as f:
            bets = json.load(f)
    except FileNotFoundError:
        return {}

    settled = [b for b in bets if b['status'] in ('correct', 'incorrect')]
    correct = [b for b in settled if b['status'] == 'correct']
    pending = [b for b in bets if b['status'] == 'pending']

    cat_perf = {}
    for b in settled:
        cat = b.get('category', 'unknown')
        if cat not in cat_perf:
            cat_perf[cat] = {'correct': 0, 'total': 0}
        cat_perf[cat]['total'] += 1
        if b['status'] == 'correct':
            cat_perf[cat]['correct'] += 1

    report = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'total_bets': len(bets),
        'pending': len(pending),
        'settled': len(settled),
        'correct': len(correct),
        'accuracy': round(len(correct) / len(settled) * 100, 1) if settled else 0,
        'by_category': {
            k: {'accuracy': round(v['correct']/v['total']*100, 1), 'sample': v['total']}
            for k, v in cat_perf.items() if v['total'] >= 2
        },
        'moat_score': min(100, len(settled) * 2)
    }

    Path('data').mkdir(exist_ok=True)
    with open('data/performance_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    Path('frontend').mkdir(exist_ok=True)
    with open('frontend/performance.json', 'w') as f:
        json.dump(report, f, indent=2)

    log.info(f"Accuracy: {report['accuracy']}% | Moat score: {report['moat_score']}/100")
    return report

def run():
    log.info('=== Evolution Agent starting ===')
    log.info('Step 1: Checking bet outcomes...')
    check_bets()
    log.info('Step 2: Updating source weights...')
    update_weights()
    log.info('Step 3: Discovering new sources...')
    discover_sources()
    log.info('Step 4: Building performance report...')
    build_report()
    log.info('Evolution complete.')

if __name__ == '__main__':
    run()
