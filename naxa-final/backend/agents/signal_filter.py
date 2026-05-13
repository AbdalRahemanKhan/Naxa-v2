#!/usr/bin/env python3
"""signal_filter.py"""
import os, json, logging
from datetime import datetime, timezone
from pathlib import Path
from groq import Groq

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s')
log = logging.getLogger('filter')
client = Groq(api_key=os.environ.get('GROQ_API_KEY',''))

DEFAULTS = {
    'CURRENTS_API':0.68, 'SEC_EDGAR':0.72, 'POLYMARKET':0.78,
    'USDA':0.74, 'FAO':0.70, 'YAHOO_FINANCE':0.65,
    'REDDIT_r/commodities':0.45, 'REDDIT_r/supplychain':0.42,
    'REDDIT_r/agriculture':0.42, 'REDDIT_r/investing':0.30
}

DISRUPTION_KW = ['export ban','shortage','crop failure','drought damage','harvest below',
    'production cut','supply chain disruption','port congestion','factory closure','recall']
PRICE_KW = ['record high','year high','price spike','surge','collapse','crash','all-time']
RCEP = ['vietnam','indonesia','malaysia','thailand','india','china','australia','myanmar']

def rule_score(sig, weights):
    score = sig.get('raw_score', 0.3)
    for src, w in weights.items():
        if sig['source'].startswith(src):
            score = score * 0.4 + w * 0.6
            break
    text = (sig.get('title','') + ' ' + sig.get('summary','')).lower()
    for kw in DISRUPTION_KW:
        if kw in text: score += 0.12
    for kw in PRICE_KW:
        if kw in text: score += 0.08
    for r in RCEP:
        if r in text: score += 0.06; break
    if sig.get('source') == 'POLYMARKET':
        score += min(0.25, float(sig.get('volume_usd',0)) / 1000000)
    return min(1.0, score)

def ai_classify(sig):
    text = sig.get('title','') + '. ' + sig.get('summary','')[:300]
    try:
        r = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[{'role':'system','content':'Classify this market signal. Respond ONLY in JSON:\n{"relevant":true/false,"category":"agricultural|energy|metals|shipping|geopolitical|financial","commodities":["list"],"urgency":"immediate|short_term|medium_term","conviction":0.0-1.0,"one_line":"one sentence core market insight"}'},
                      {'role':'user','content':f'Classify: {text[:500]}'}],
            max_tokens=200, temperature=0.1)
        content = r.choices[0].message.content.strip()
        if '```' in content: content = content.split('```')[1].replace('json','').strip()
        return json.loads(content)
    except:
        return {'relevant':True,'category':'agricultural','commodities':[],'urgency':'short_term','conviction':0.5,'one_line':sig.get('title','')[:100]}

def run():
    log.info('=== Signal Filter starting ===')
    try:
        with open('data/raw_signals.json') as f: raw = json.load(f).get('signals',[])
    except FileNotFoundError:
        log.error('No raw signals'); return []

    weights = DEFAULTS.copy()
    try:
        with open('data/source_weights.json') as f: weights.update(json.load(f).get('weights',{}))
    except: pass

    for s in raw: s['relevance_score'] = rule_score(s, weights)
    raw.sort(key=lambda x: x['relevance_score'], reverse=True)

    classified, ai_count = [], 0
    for sig in raw:
        if sig['relevance_score'] >= 0.55 and ai_count < 20:
            d = ai_classify(sig); sig.update(d)
            sig['classified_at'] = datetime.now(timezone.utc).isoformat()
            if d.get('relevant', True): classified.append(sig)
            ai_count += 1
            log.info(f"  [{sig['relevance_score']:.2f}] {sig.get('one_line','')[:60]}")
        elif sig['relevance_score'] >= 0.48:
            sig['one_line'] = sig['title'][:100]
            sig['classified_at'] = datetime.now(timezone.utc).isoformat()
            classified.append(sig)

    log.info(f'Classified: {len(classified)} signals')
    Path('data').mkdir(exist_ok=True)
    with open('data/classified_signals.json','w') as f:
        json.dump({'classified_at': datetime.now(timezone.utc).isoformat(), 'count':len(classified), 'signals':classified}, f, indent=2)
    return classified

if __name__ == '__main__': run()
