#!/usr/bin/env python3
"""betting.py — Simulated prediction tracking"""
import json, logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')
log = logging.getLogger('betting')

def run():
    log.info('=== Betting System starting ===')
    try:
        with open('frontend/signals_cache.json') as f:
            insights = json.load(f).get('insights', [])
    except FileNotFoundError:
        log.error('No insights'); return

    Path('data').mkdir(exist_ok=True)
    existing = []
    try:
        with open('data/bet_ledger.json') as f:
            existing = json.load(f)
    except FileNotFoundError:
        pass

    existing_ids = {b['bet_id'] for b in existing}
    now = datetime.now(timezone.utc)
    new_bets = []

    for ins in insights:
        urgency = ins.get('urgency', 'short_term')
        days = {'immediate': 3, 'short_term': 14, 'medium_term': 60}.get(urgency, 14)
        check_at = (now + timedelta(days=days)).isoformat()
        chain = ins.get('supply_chain', [])
        predicted_dir = chain[-1].get('direction', 'down') if chain else 'down'

        for inst in ins.get('instruments', [])[:2]:
            ticker = inst.get('ticker_or_name', '')
            if not ticker or len(ticker) > 12 or ' ' in ticker:
                continue
            bet_id = f"bet_{ins['id']}_{ticker}"[:50]
            if bet_id in existing_ids:
                continue
            new_bets.append({
                'bet_id': bet_id,
                'insight_id': ins['id'],
                'headline': ins.get('headline', '')[:80],
                'ticker': ticker,
                'predicted_direction': predicted_dir,
                'conviction': ins.get('conviction', 50),
                'urgency': urgency,
                'placed_at': now.isoformat(),
                'check_at': check_at,
                'source_type': ins.get('source_type', ''),
                'category': ins.get('category', ''),
                'status': 'pending',
                'outcome_pct': None,
                'was_correct': None
            })

    all_bets = (existing + new_bets)[-500:]
    with open('data/bet_ledger.json', 'w') as f:
        json.dump(all_bets, f, indent=2)

    pending = sum(1 for b in all_bets if b['status'] == 'pending')
    settled = [b for b in all_bets if b['status'] in ('correct', 'incorrect')]
    accuracy = round(sum(1 for b in settled if b['status'] == 'correct') / len(settled) * 100, 1) if settled else 0
    log.info(f'Bets: {len(new_bets)} new | {pending} pending | {accuracy}% accuracy on {len(settled)} settled')

if __name__ == '__main__':
    run()
