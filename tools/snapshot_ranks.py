#!/usr/bin/env python3
"""Sauvegarde journalière du classement Demonlist dans Supabase.

Secrets GitHub Actions UNIQUEMENT : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
Ne jamais placer la service role key dans js/config.js ni dans le dépôt.
"""
import datetime as dt
import json
import math
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen

URL = os.environ.get('SUPABASE_URL', '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
if __name__ == '__main__' and (not URL or not KEY):
    raise SystemExit('Secrets SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants')


def request(table, *, method='GET', params=None, payload=None, prefer=None):
    url = URL + '/rest/v1/' + table
    if params:
        url += '?' + urlencode(params)
    headers = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Accept': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = Request(url, headers=headers, method=method, data=body)
    with urlopen(req, timeout=45) as f:
        data = f.read()
        return json.loads(data) if data else None


def fetch_all(table):
    rows = []
    for offset in range(0, 60000, 1000):
        batch = request(table, params={'select': '*', 'limit': 1000, 'offset': offset, 'order': 'id.asc' if table in ('demons','completions') else 'player_key.asc' if table=='players' else 'id.asc'})
        rows.extend(batch)
        if len(batch) < 1000:
            return rows
    raise RuntimeError(f'Trop de lignes dans {table}; augmenter la pagination')


def base(p):
    if p >= 56:
        return 1.039035131*((185.7*math.exp(-0.02715*p))+14.84)
    if p >= 36:
        return 1.0371139743*((212.61*(1.036**(1-p)))+25.071)
    if p >= 21:
        return ((250-83.389)*(1.0099685**(2-p))-31.152)*1.0371139743
    if p >= 4:
        return ((326.1*math.exp(-.0871*p))+51.09)*1.037117142
    if p >= 1:
        return (-18.2899079915*p)+368.2899079915
    return 0.0


def points(d, progress, settings):
    p=int(d.get('position') or 0)
    req=max(1,min(100,int(d.get('requirement') or 100)))
    progress=int(progress or 0)
    if p<1 or p>int(settings['extended_limit']) or progress<req or (d.get('legacy') and not settings.get('legacy_scores')):
        return 0.
    beaten=base(p)*float(settings['top1_points'])/base(1)
    return beaten if progress==100 else beaten*5**((progress-req)/max(1,100-req))/10


def compute(players, demons, completions, settings):
    people={p['player_key']:dict(p,score=float(p.get('bonus_points') or 0),complete_count=0,hardest=None) for p in players}
    demon_by_id={d['id']:d for d in demons}
    earned={}
    for r in completions:
        k=(r.get('player') or '').strip().lower()
        p=people.get(k)
        d=demon_by_id.get(r.get('demon_id'))
        if not p or not d:
            continue
        s=points(d,r.get('progress',0),settings)
        p['score']+=s
        earned[(k,d['id'])]=s
        if int(r.get('progress') or 0)==100:
            p['complete_count']+=1
            if p['hardest'] is None or int(d['position'])<int(p['hardest']['position']):
                p['hardest']=d
    for d in demons:
        k=(d.get('verifier') or '').strip().lower()
        by_id=next((p['player_key'] for p in players if p.get('legacy_id') is not None and p.get('legacy_id')==d.get('verifier_user_id')),None)
        p=people.get(by_id or k)
        if not p or not p.get('has_account'):
            continue
        full=points(d,100,settings)
        p['score']+=max(0.,full-earned.get((p['player_key'],d['id']),0))
    ranked=sorted((p for p in people.values() if not p.get('hidden_from_stats')),key=lambda p:(-p['score'],p['player_key']))
    positions={p['player_key']:i+1 for i,p in enumerate(ranked)}
    return people,positions


def main():
    players=fetch_all('players')
    demons=fetch_all('demons')
    records=fetch_all('completions')
    # Lecture seule pour les données du site : on photographie les points publiés,
    # sans recalculer/écraser les scores depuis une formule historique.
    by_id={d['id']:d for d in demons}
    people={p['player_key']:{'score':float(p.get('points') or 0),'complete_count':0,'hardest':None} for p in players}
    for r in records:
        who=(r.get('player') or '').strip().lower()
        if who not in people or int(r.get('progress') or 0)!=100: continue
        row=people[who]; row['complete_count']+=1
        d=by_id.get(r.get('demon_id'))
        if d and d.get('position') is not None and (row['hardest'] is None or int(d['position'])<int(row['hardest']['position'])): row['hardest']=d
    ranked=sorted((p for p in players if not p.get('hidden_from_stats')),key=lambda p:(-float(p.get('points') or 0),p['player_key']))
    ranks={p['player_key']:i+1 for i,p in enumerate(ranked)}
    # Protection contre les snapshots incohérents : le champ players.points peut être
    # périmé alors que le site recalcule les scores depuis les records.
    # Ne jamais écrire de faux 0 dans l'historique.
    active_records={str(r.get('player') or '').strip().lower() for r in records if int(r.get('progress') or 0)==100}
    suspects=[p['player_key'] for p in players if p['player_key'] in active_records and float(p.get('points') or 0)==0]
    if suspects:
        raise SystemExit('Export annulé : points stockés à zéro pour des joueurs avec records (ex.: '+', '.join(suspects[:8])+'). Le score officiel est calculé dans le site : synchroniser la formule exacte avant de créer des instantanés.')
    today=dt.date.today().isoformat()
    snapshots=[]
    for k,p in people.items():
        score=round(p['score'],2)
        snapshots.append({'snapshot_day':today,'player_key':k,'points':score,
            'rank_position':ranks.get(k),'completions':p['complete_count'],
            'hardest_demon':p['hardest']['name'] if p['hardest'] else None})
    for i in range(0,len(snapshots),300):
        request('player_stat_snapshots',method='POST',params={'on_conflict':'snapshot_day,player_key'},
          payload=snapshots[i:i+300],prefer='resolution=merge-duplicates,return=minimal')
    print(f'{len(players)} profils, {len(demons)} démons, {len(records)} records, {len(snapshots)} snapshots au {today} (aucun score modifié).')

if __name__=='__main__':
    main()
