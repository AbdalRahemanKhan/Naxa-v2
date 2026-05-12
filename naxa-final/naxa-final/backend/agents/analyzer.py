#!/usr/bin/env python3
"""analyzer.py — Generates structured supply chain insights"""
import os, json, logging
from datetime import datetime, timezone
from pathlib import Path
from groq import Groq

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')
log = logging.getLogger('analyzer')
client = Groq(api_key=os.environ.get('GROQ_API_KEY',''))

SYS = """You are NAXA's Chief Analysis Agent — world's best supply chain intelligence analyst.

For every signal, produce a COMPLETE structured insight. Think like Peter Gregory (Silicon Valley) — find the NON-OBVIOUS downstream connection. Be specific: real companies, real tickers.

Respond ONLY in valid JSON (no markdown, no prose outside JSON):
{
  "headline": "max 15 words, punchy and specific",
  "what_happened": "2 precise sentences. Specific facts, real entities.",
  "supply_chain": [
    {"stage":"1","entity":"real entity name","impact":"specific measurable effect","direction":"up|down|neutral"},
    ... minimum 5 stages
  ],
  "second_order": ["specific effect with timeframe","effect 2","effect 3"],
  "third_order": "The Peter Gregory insight — non-obvious, specific, surprising",
  "instruments": [
    {"type":"equity|futures|etf|currency","ticker_or_name":"TICKER","reason":"specific why","time_horizon":"timeframe"},
    ... 3-5 instruments
  ],
  "lead_lag_days": number,
  "conviction": 0-100,
  "urgency": "immediate|short_term|medium_term",
  "category": "agricultural|energy|metals|shipping|geopolitical|financial"
}"""

def analyze(sig):
    text = sig.get('one_line', sig.get('title',''))
    summary = sig.get('summary','')[:350]
    msg = f"""Source: {sig.get('source','')}
Signal: {text}
Detail: {summary}
Commodities: {', '.join(sig.get('commodities',[]))}
AI conviction: {sig.get('conviction',0.5):.2f}

Generate the full NAXA intelligence insight."""
    try:
        r = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[{'role':'system','content':SYS},{'role':'user','content':msg}],
            max_tokens=1400, temperature=0.65)
        content = r.choices[0].message.content.strip()
        if '```' in content: content = content.split('```')[1].replace('json','').strip()
        insight = json.loads(content)
        insight['id'] = 'insight_' + sig.get('id','x')
        insight['signal_id'] = sig.get('id','')
        insight['source_type'] = sig.get('source','')
        insight['source_url'] = sig.get('url','')
        insight['analyzed_at'] = datetime.now(timezone.utc).isoformat()
        return insight
    except Exception as e:
        log.error(f"Analysis error '{text[:40]}': {e}")
        return None

def run():
    log.info('=== Analyzer starting ===')
    try:
        with open('data/classified_signals.json') as f: classified = json.load(f).get('signals',[])
    except FileNotFoundError:
        log.error('No classified signals'); return []

    classified.sort(key=lambda x: x.get('relevance_score',0)*x.get('conviction',0.5), reverse=True)
    insights = []
    for i, sig in enumerate(classified[:10]):
        log.info(f"Analyzing {i+1}: {sig.get('one_line','')[:60]}")
        ins = analyze(sig)
        if ins:
            insights.append(ins)
            log.info(f"  → '{ins.get('headline','')[:55]}' | {ins.get('conviction','?')}")

    output = {'updated_at': datetime.now(timezone.utc).isoformat(), 'count': len(insights),
              'insights': sorted(insights, key=lambda x: x.get('conviction',0), reverse=True)}

    Path('frontend').mkdir(exist_ok=True)
    with open('frontend/signals_cache.json','w') as f: json.dump(output, f, indent=2)

    Path('data').mkdir(exist_ok=True)
    with open('data/insights_history.jsonl','a') as f:
        for ins in insights: f.write(json.dumps(ins)+'\n')

    log.info(f'Analyzer complete. {len(insights)} insights written.')
    return insights

if __name__ == '__main__': run()
