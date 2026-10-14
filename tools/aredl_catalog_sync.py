#!/usr/bin/env python3
"""Catalogue AREDL -> table de contrôle DLFR, publication optionnelle.

Seule la clé SERVICE_ROLE (GitHub Actions secrets) peut appeler la RPC sécurisée.
Ne télécharge PAS les records/victoires : uniquement le catalogue AREDL.
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from aredl_nlw_sync import Client, BASE, normalize_list


def normalized_catalog(raw):
    normalized = normalize_list(raw)
    rows, invalid, duplicate_gd = [], [], set()
    seen_gd, seen_aredl = set(), set()
    for v in normalized:
        gd = v.get('gd_level_id')
        ar = str(v.get('aredl_id') or '').strip()
        name = str(v.get('name') or '').strip()
        rank = v.get('rank')
        if not gd or not ar or not name or not isinstance(rank, int) or rank < 1:
            invalid.append({'rank': rank, 'name': name, 'gd_level_id': gd, 'reason': 'identifiant GD/AREDL, rang ou nom absent'})
            continue
        if gd in seen_gd or ar in seen_aredl:
            duplicate_gd.add(gd)
            invalid.append({'rank': rank, 'name': name, 'gd_level_id': gd, 'reason': 'identifiant GD/AREDL dupliqué'})
            continue
        seen_gd.add(gd); seen_aredl.add(ar)
        rows.append({'gd_level_id': gd, 'aredl_id': ar, 'aredl_rank': rank, 'aredl_name': name})
    rows = [r for r in rows if r['gd_level_id'] not in duplicate_gd]
    return rows, invalid


def endpoint(base: str) -> str:
    if not base.startswith('https://'):
        raise ValueError('SUPABASE_URL doit être https://...')
    return base.rstrip('/') + '/rest/v1/rpc/dlfr_aredl_catalog_batch'


def rpc(url, secret, rows, publish, attempts=3):
    if not secret or len(secret) < 20:
        raise ValueError('SUPABASE_SERVICE_ROLE_KEY absent ou invalide')
    body = json.dumps({'p_rows': rows, 'p_publish': publish}, ensure_ascii=False).encode('utf-8')
    headers = {
        'apikey': secret,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'DLFR-AREDL-Sync/3.0.5'}
    # Les nouvelles clés sb_secret_* ne sont PAS des JWT.
    # Les anciennes clés service_role JWT utilisent les deux headers.
    if not secret.startswith('sb_secret_'):
        headers['Authorization'] = 'Bearer ' + secret
    req = Request(url, data=body, headers=headers, method='POST')
    for attempt in range(attempts):
        try:
            with urlopen(req, timeout=55) as response:
                value = json.load(response)
            if not isinstance(value, dict):
                raise RuntimeError('Format de réponse Supabase inattendu: '+repr(value)[:300])
            return value
        except HTTPError as error:
            message = error.read(1200).decode('utf8', 'replace')
            if error.code in (429, 500, 502, 503, 504) and attempt < attempts-1:
                time.sleep((attempt+1)*3)
                continue
            raise RuntimeError(f'Erreur HTTP Supabase {error.code}: {message}') from error
        except URLError:
            if attempt == attempts-1:
                raise
            time.sleep((attempt+1)*3)
    raise RuntimeError('Supabase indisponible')


def run(rows, mode, url=None, secret=None, batch_size=75, request_rpc=rpc):
    summary = {'mode': mode, 'scanned': len(rows), 'staged': 0, 'created': 0,
               'matched': 0, 'conflicts': 0, 'skipped': 0, 'conflict_details': []}
    if mode == 'preview':
        return summary
    target = endpoint(url or '')
    for n in range(0, len(rows), batch_size):
        batch = rows[n:n+batch_size]
        result = request_rpc(target, secret, batch, mode == 'publish')
        for name in ('staged','created','matched','conflicts','skipped'):
            summary[name] += int(result.get(name, 0))
        summary['conflict_details'].extend(result.get('conflict_details') or [])
        print(f'Lot {n//batch_size+1}: {len(batch)} niveaux, '+
              f"créés {result.get('created',0)}, rapprochés {result.get('matched',0)}, conflits {result.get('conflicts',0)}", flush=True)
    return summary


def main():
    p = argparse.ArgumentParser(description='Synchronisation globale AREDL (sans records)')
    p.add_argument('--mode', choices=['preview','stage','publish'], default='preview')
    p.add_argument('--catalog-json', default='', help='Données /levels pour tests hors-ligne')
    p.add_argument('--output', default='out/aredl-global')
    p.add_argument('--batch-size', type=int, default=75)
    args = p.parse_args()
    if not 1 <= args.batch_size <= 100:
        p.error('Taille de lot comprise entre 1 et 100')
    payload = json.loads(Path(args.catalog_json).read_text(encoding='utf8')) if args.catalog_json else Client(BASE, cache_dir=None).get('/levels')
    rows, invalid = normalized_catalog(payload)
    if not rows:
        raise RuntimeError('Aucun niveau AREDL valide : publication interrompue')
    if invalid and args.mode == 'publish':
        raise RuntimeError(f'{len(invalid)} identifiants invalides ou dupliqués. Lancer preview puis résoudre avant publication globale.')
    path = Path(args.output); path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['aredl_rank','aredl_name','gd_level_id','aredl_id'])
        writer.writeheader(); writer.writerows(rows)
    result=run(rows, args.mode, os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SECRET_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY'), args.batch_size)
    result['invalid'] = invalid
    path.with_suffix('.json').write_text(json.dumps(result, indent=2, ensure_ascii=False),encoding='utf8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('invalid','conflict_details')},ensure_ascii=False,indent=2))
    print('Rapports :',path.with_suffix('.csv'),path.with_suffix('.json'))
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as exc:
        print('IMPORT ARRÊTÉ :',exc,file=sys.stderr)
        sys.exit(1)
