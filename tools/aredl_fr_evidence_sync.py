#!/usr/bin/env python3
"""Enrichissement FR, par tranche. PAS de publication automatique (DLFR V3.0.9)."""
from __future__ import annotations
import argparse
import csv
import json
import os
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from aredl_nlw_sync import (BASE, Client, normalize_list, extract_one,
                            fetch_record_pages, identity, obj, quote)


def collect(items, client, *, max_pages=25, resolve_players=True):
    player_cache = {}
    def resolve(player_id):
        if not resolve_players or not player_id:
            return None
        if player_id not in player_cache:
            try:
                profile = client.get('/profile/' + quote(str(player_id), safe=''))
                profile = profile.get('data', profile) if isinstance(profile, dict) else profile
                player_cache[player_id] = identity(profile)
            except Exception:
                player_cache[player_id] = None
        return player_cache[player_id]
    results, problems = [], []
    for index, entry in enumerate(items, start=1):
        try:
            detail = client.get('/levels/' + quote(entry['aredl_id'], safe=''))
            records, info = fetch_record_pages(client, entry['aredl_id'], max_pages=max_pages)
            record = extract_one(entry, detail, [], resolve, extra_records=records)
            fr_verifiers = [v for v in record['verifiers'] if v['player']['country'] == 'FR']
            first = record['first_fr'] if record['first_fr']['status']=='first_dated_record' else {}
            complete = info['complete'] and info['error'] is None
            results.append({'aredl_id':entry['aredl_id'],'gd_level_id':entry['gd_level_id'],
                            'aredl_rank':entry['rank'], 'aredl_name':entry['name'],
                            'records_complete':bool(complete),'verifiers_fr':fr_verifiers,
                            'first_fr':first if complete else {},
                            'records_seen': record['records_inspected']})
            if not complete:
                problems.append({'rank':entry['rank'],'name':entry['name'],
                                 'reason':'records incomplets : '+str(info['error'] or 'limite de pages atteinte')})
        except Exception as exc:
            problems.append({'rank':entry['rank'],'name':entry['name'],'reason':str(exc)[:250]})
        print(f"{index}/{len(items)} - AREDL #{entry['rank']} - {entry['name']}",flush=True)
    return results, problems


def stage_rows(url, secret, rows):
    if not url or not url.startswith('https://') or not secret:
        raise ValueError('SUPABASE_URL / SUPABASE_SECRET_KEY absents')
    headers={'apikey':secret,'Content-Type':'application/json','Accept':'application/json',
             'User-Agent':'DLFR-FR-Evidence/3.0.9'}
    if not secret.startswith('sb_secret_'):
        headers['Authorization']='Bearer '+secret
    counts={'updated':0,'skipped':0}
    for n in range(0,len(rows),20):
        data=json.dumps({'p_rows':rows[n:n+20]},ensure_ascii=False).encode('utf8')
        req=Request(url.rstrip('/')+'/rest/v1/rpc/dlfr_stage_fr_evidence',
                    data=data,headers=headers,method='POST')
        try:
            with urlopen(req,timeout=60) as response:
                result=json.load(response)
        except HTTPError as ex:
            raise RuntimeError(f"Supabase HTTP {ex.code} : {ex.read(500).decode('utf8','replace')}") from ex
        for key in counts:
            counts[key]+=int(result.get(key,0))
    return counts


# Champs volontairement limités aux colonnes du CSV : le JSON conserve
# les objets détaillés nécessaires au futur import Supabase.
REVIEW_CSV_FIELDS = (
    'aredl_rank', 'aredl_name', 'aredl_id', 'gd_level_id',
    'records_complete', 'records_seen', 'verifiers_fr', 'first_fr'
)


def write_review_csv(path, rows):
    """Exporte un CSV stable, sans passer les champs JSON internes à DictWriter."""
    with Path(path).open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=REVIEW_CSV_FIELDS)
        writer.writeheader()
        for item in rows:
            first = item.get('first_fr') or {}
            player = first.get('player') or {} if isinstance(first, dict) else {}
            verifiers = item.get('verifiers_fr') or []
            writer.writerow({
                'aredl_rank': item.get('aredl_rank'),
                'aredl_name': item.get('aredl_name'),
                'aredl_id': item.get('aredl_id'),
                'gd_level_id': item.get('gd_level_id'),
                'records_complete': item.get('records_complete'),
                'records_seen': item.get('records_seen'),
                'verifiers_fr': '; '.join(
                    str((v.get('player') or {}).get('name') or '')
                    for v in verifiers if isinstance(v, dict)
                ),
                'first_fr': player.get('name', '') if isinstance(player, dict) else '',
            })


def main(argv=None):
    p=argparse.ArgumentParser(description='Preuves françaises AREDL, jamais de publication automatique')
    p.add_argument('--start-rank',type=int,default=1)
    p.add_argument('--end-rank',type=int,default=20)
    p.add_argument('--max-record-pages',type=int,default=25)
    p.add_argument('--mode',choices=['preview','stage'],default='preview')
    p.add_argument('--output',default='out/aredl-fr-review')
    args=p.parse_args(argv)
    if args.start_rank<1 or args.end_rank<args.start_rank or args.end_rank-args.start_rank>39:
        p.error('Tranches de 1 à 40 niveaux uniquement (start <= end)')
    if not 1<=args.max_record_pages<=200:p.error('max-record-pages entre 1 et 200')
    client=Client(BASE,cache_dir=None)
    items=[r for r in normalize_list(client.get('/levels'))
           if args.start_rank<=r['rank']<=args.end_rank]
    rows, problems=collect(items,client,max_pages=args.max_record_pages)
    dest=Path(args.output);dest.parent.mkdir(parents=True,exist_ok=True)
    write_review_csv(dest.with_suffix('.csv'), rows)
    report={'scope':{'start_rank':args.start_rank,'end_rank':args.end_rank,'country':'FR'},
            'status':'REVIEW_REQUIRED' if problems else 'READY_FOR_REVIEW',
            'rows':rows,'problems':problems,'scan_complete':len(problems)==0}
    if args.mode=='stage':
        complete=[x for x in rows if x['records_complete']]
        report['supabase']=stage_rows(os.getenv('SUPABASE_URL'),
             os.getenv('SUPABASE_SECRET_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY'),complete) if complete else {'updated':0,'skipped':0}
    dest.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'status':report['status'],'processed':len(rows), 'problems':len(problems),
                      'with_fr_verifier':sum(bool(x['verifiers_fr']) for x in rows),
                      'with_first_fr':sum(bool(x['first_fr']) for x in rows),
                      'supabase':report.get('supabase')},ensure_ascii=False,indent=2))
    return 0 if not problems else 2

if __name__=='__main__':sys.exit(main())
